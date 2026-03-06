#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MetaDoc i18n AI 校对脚本（基于 DeepSeek API，并发）

以 zh_cn.json 为蓝本，将各语言 JSON 按模块拆分，送入 AI 结合语境（UI label / hint / tooltip / 场景）
审阅翻译质量，只输出需要替换的键与修正后的译文，再写回对应 JSON。

依赖: 无（仅标准库 + urllib）。API key 放在同目录 .deepseek_api_key 或环境变量 DEEPSEEK_API_KEY。

用法:
  python i18n_ai_review.py                    # 校对所有语言、所有模块（并发）
  python i18n_ai_review.py --locale en_us    # 仅英文
  python i18n_ai_review.py --module proofread # 仅 proofread 模块
  python i18n_ai_review.py --dry-run         # 只打印将要调用的任务，不请求 API、不写文件
  python i18n_ai_review.py --max-workers 4   # 并发数
  python i18n_ai_review.py --reset-progress  # 清空进度文件后全量重跑（默认会跳过已完成的模块）
  python i18n_ai_review.py --record-hashes   # 为已有进度补写 zh_cn 模块哈希，之后蓝本变更会自动触发重校
"""

import os
import sys
import re
import json
import argparse
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_KEYS_PER_CHUNK = 60  # 每个请求最多键数，避免超长
LOCALES_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_FILE = "zh_cn.json"
KEY_FILE_NAMES = [".deepseek_api_key", ".deepseek_api_key.txt"]
PROGRESS_FILE = ".i18n_ai_review_progress.txt"  # 每行: locale_file\tmodule_name 或 locale_file\tmodule_name\tsource_hash


def load_api_key():
    for name in KEY_FILE_NAMES:
        path = os.path.join(LOCALES_DIR, name)
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def load_json(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def flatten_json(obj, prefix=""):
    out = {}

    def recurse(t, parent_key):
        if isinstance(t, dict):
            for k, v in t.items():
                recurse(v, parent_key + "." + k if parent_key else k)
        elif isinstance(t, list):
            out[parent_key] = json.dumps(t, ensure_ascii=False)
        else:
            out[parent_key] = t

    recurse(obj, prefix)
    return out


def group_keys_by_module(flat_keys, max_per_chunk=MAX_KEYS_PER_CHUNK):
    """按模块分组。模块名：顶层键，或 agent 下取前两段（如 agent.display）。"""
    by_module = {}
    for k in flat_keys:
        parts = k.split(".")
        if parts[0] == "agent" and len(parts) >= 2:
            mod = "agent." + parts[1]
        else:
            mod = parts[0]
        by_module.setdefault(mod, []).append(k)
    # 大模块再按 key 排序后切块，保证每块不超过 max_per_chunk
    result = {}
    for mod, keys in sorted(by_module.items()):
        keys = sorted(keys)
        for i in range(0, len(keys), max_per_chunk):
            chunk = keys[i : i + max_per_chunk]
            chunk_name = mod if len(keys) <= max_per_chunk else f"{mod}_part{i//max_per_chunk}"
            result[chunk_name] = chunk
    return result


def module_content_hash(flat_zh, keys):
    """返回该模块在 zh_cn 下的内容哈希（键值对排序后拼接再 sha256），用于检测蓝本是否变更。"""
    parts = []
    for k in sorted(keys):
        parts.append("%s:%s" % (k, flat_zh.get(k, "")))
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def infer_context_hint(key):
    """根据键名推断用途，供提示词参考。"""
    k = key.lower()
    if "hint" in k or "placeholder" in k or "desc" in k or "description" in k:
        return "hint/placeholder/description"
    if "tooltip" in k or "tip" in k:
        return "tooltip"
    if "title" in k or "label" in k or "name" in k:
        return "label/title"
    if "error" in k or "failed" in k or "invalid" in k:
        return "error message"
    if "button" in k or "btn" in k or "action" in k:
        return "button/action"
    if "message" in k or "content" in k:
        return "message/content"
    return "general"


def build_prompt(locale_name, lang_hint, module_name, zh_items, locale_items):
    lang = lang_hint or locale_name
    return f"""你正在审阅一款文档编辑/写作软件（MetaDoc）的 {lang} 界面文案。以中文为蓝本做**校对**，不是简单直译。

**规则：**
1. 结合语境判断每条是：UI 标签（按钮/菜单/标题）、提示/占位符（hint/placeholder）、悬浮说明（tooltip）、错误信息、长说明等；按该场景写出自然、地道的 {lang}。
2. 专有名词（如 MetaDoc、RAG、LaTeX、Markdown）不翻译；占位符如 {{count}}、{{name}}、{{line}} 原样保留。
3. 仅对**翻译不当、生硬、明显机翻或不符合该语境**的条目给出修正；认为无需改动的不要输出。
4. 输出格式：每行一条修正，且仅包含「完整键路径 + 制表符(Tab) + 修正后的整段译文」。键路径与下方列表完全一致；译文中不要包含 Tab 或换行（若有请用空格代替）。
   示例：proofread.title\tProofreading

**模块：** {module_name}
**参考（中文）：**
{zh_items}

**当前 {lang} 文案（待审阅）：**
{locale_items}

请只输出需要修正的行（每行：键<Tab>新译文），无需解释。若无需要修正的，请回复一个空行或 "NONE"。
"""


def call_deepseek(api_key, user_content, max_retries=2):
    url = f"{DEEPSEEK_BASE_URL}/v1/chat/completions"
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a professional UI copy editor. Output only the requested format, no commentary."},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
    }
    for attempt in range(max_retries + 1):
        try:
            req = Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + api_key,
                },
                method="POST",
            )
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            return text.strip()
        except (HTTPError, URLError, json.JSONDecodeError, KeyError) as e:
            if attempt == max_retries:
                raise RuntimeError(f"DeepSeek API 调用失败: {e}") from e
    return ""


def parse_corrections(text):
    """从模型输出解析出 (key, new_value) 列表。要求每行：key\\tnew_value"""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.upper() == "NONE":
            continue
        if "\t" in line:
            key, value = line.split("\t", 1)
            key = key.strip()
            value = value.strip()
            if key and value:
                out.append((key, value))
        else:
            # 兼容 "key":"old"->"new" 形式
            m = re.match(r'^["\']?(.+?)["\']?\s*->\s*["\']?(.+?)["\']?$', line)
            if m:
                out.append((m.group(1).strip(), m.group(2).strip()))
    return out


def set_nested(data, path, value):
    parts = path.split(".")
    d = data
    for p in parts[:-1]:
        d = d.setdefault(p, {})
    d[parts[-1]] = value


def load_progress(locales_dir):
    """返回 (completed_set, hash_map)。completed_set 为 (locale_file, module_name) 集合；hash_map 为 (loc, mod) -> 校对时的 zh_cn 模块哈希（无则 None）。"""
    path = os.path.join(locales_dir, PROGRESS_FILE)
    if not os.path.isfile(path):
        return set(), {}
    out = set()
    hash_map = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            parts = line.split("\t")
            if len(parts) >= 2:
                loc, mod = parts[0].strip(), parts[1].strip()
                out.add((loc, mod))
                hash_map[(loc, mod)] = parts[2].strip() if len(parts) >= 3 and parts[2] else None
    return out, hash_map


def append_progress(locales_dir, locale_file, module_name, source_hash=None):
    path = os.path.join(locales_dir, PROGRESS_FILE)
    with open(path, "a", encoding="utf-8") as f:
        if source_hash:
            f.write("%s\t%s\t%s\n" % (locale_file, module_name, source_hash))
        else:
            f.write("%s\t%s\n" % (locale_file, module_name))
        f.flush()


def reset_progress(locales_dir):
    path = os.path.join(locales_dir, PROGRESS_FILE)
    if os.path.isfile(path):
        os.remove(path)
        print("已清空进度文件: %s" % path, flush=True)


def write_back_module(locales_dir, locale_file, corrections, file_locks):
    """立即将当前模块的修正写回 JSON；按文件加锁避免并发写同一文件冲突"""
    if not corrections:
        return
    lock = file_locks.setdefault(locale_file, threading.Lock())
    with lock:
        path = os.path.join(locales_dir, locale_file)
        data = load_json(path)
        for key, new_val in corrections:
            try:
                set_nested(data, key, new_val)
            except Exception as e:
                print("WARN: 无法设置 %s in %s: %s" % (key, locale_file, e), flush=True)
        save_json(path, data)


def run_one_task(api_key, locale_file, module_name, keys, flat_zh, flat_locale, lang_hint, dry_run):
    if dry_run:
        return (locale_file, [], None)
    zh_lines = "\n".join(f"{k}: {flat_zh.get(k, '')}" for k in keys)
    locale_lines = "\n".join(f"{k}: {flat_locale.get(k, '')}" for k in keys)
    prompt = build_prompt(locale_file.replace(".json", ""), lang_hint, module_name, zh_lines, locale_lines)
    try:
        raw = call_deepseek(api_key, prompt)
        corrections = parse_corrections(raw)
        return (locale_file, corrections, None)
    except Exception as e:
        return (locale_file, [], str(e))


def main():
    ap = argparse.ArgumentParser(description="MetaDoc i18n AI 校对（DeepSeek，并发）")
    ap.add_argument("--dir", default=LOCALES_DIR, help="locales 目录")
    ap.add_argument("--locale", default=None, help="只处理该语言文件，如 en_us")
    ap.add_argument("--module", default=None, help="只处理该模块，如 proofread 或 agent.display")
    ap.add_argument("--dry-run", action="store_true", help="只打印任务，不请求 API、不写文件")
    ap.add_argument("--max-workers", type=int, default=5, help="并发数")
    ap.add_argument("--reset-progress", action="store_true", help="清空进度文件，之后按全量执行（否则会跳过已完成的 语言|模块）")
    ap.add_argument("--record-hashes", action="store_true", help="为进度中已有项补写 zh_cn 模块哈希，之后蓝本变更会自动触发重校")
    args = ap.parse_args()

    locales_dir = os.path.abspath(args.dir)
    base_path = os.path.join(locales_dir, BASE_FILE)
    if not os.path.isfile(base_path):
        print("ERROR: 未找到基准文件", base_path)
        return 1

    api_key = load_api_key()
    if not api_key and not args.dry_run and not args.record_hashes:
        print("ERROR: 未找到 API key。请在同目录创建 .deepseek_api_key 或设置环境变量 DEEPSEEK_API_KEY")
        return 1

    zh_data = load_json(base_path)
    flat_zh = flatten_json(zh_data)
    all_modules = group_keys_by_module(list(flat_zh.keys()))
    current_module_hashes = {mod: module_content_hash(flat_zh, keys) for mod, keys in all_modules.items()}

    locale_files = [
        f for f in os.listdir(locales_dir)
        if f.endswith(".json") and f != BASE_FILE and not f.startswith(".")
    ]
    if args.locale:
        locale_files = [f for f in locale_files if f.lower() == args.locale.lower() or f.replace(".json", "") == args.locale]
    if not locale_files:
        print("ERROR: 没有可处理的语言文件")
        return 1

    if args.reset_progress:
        reset_progress(locales_dir)

    completed_set, hash_map = load_progress(locales_dir) if not args.reset_progress else (set(), {})

    if args.record_hashes:
        lines = []
        for (loc_file, mod_name) in sorted(completed_set):
            h = current_module_hashes.get(mod_name)
            if h:
                lines.append("%s\t%s\t%s" % (loc_file, mod_name, h))
            else:
                lines.append("%s\t%s" % (loc_file, mod_name))
        progress_path = os.path.join(locales_dir, PROGRESS_FILE)
        with open(progress_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + ("\n" if lines else ""))
        print("已为 %d 项写入/更新模块哈希到进度文件。" % len(lines), flush=True)
        return 0

    # 语言名提示（用于提示词）
    lang_names = {
        "en_us.json": "English",
        "ja_JP.json": "Japanese",
        "ko_KR.json": "Korean",
        "de_DE.json": "German",
        "fr_FR.json": "French",
    }

    tasks = []
    for loc_file in sorted(locale_files):
        loc_path = os.path.join(locales_dir, loc_file)
        try:
            loc_data = load_json(loc_path)
        except Exception as e:
            print("WARN: 跳过 %s: %s" % (loc_file, e))
            continue
        flat_loc = flatten_json(loc_data)
        for mod_name, keys in all_modules.items():
            keys_in_locale = [k for k in keys if k in flat_loc]
            if not keys_in_locale:
                continue
            if args.module and not (mod_name == args.module or mod_name.startswith(args.module + ".") or mod_name.startswith(args.module + "_")):
                continue
            stored_hash = hash_map.get((loc_file, mod_name))
            current_hash = current_module_hashes.get(mod_name)
            if (loc_file, mod_name) in completed_set:
                if current_hash is not None and stored_hash is not None and stored_hash != current_hash:
                    tasks.append((loc_file, mod_name, keys_in_locale, flat_zh, flat_loc, lang_names.get(loc_file, loc_file)))
                else:
                    continue
            else:
                tasks.append((loc_file, mod_name, keys_in_locale, flat_zh, flat_loc, lang_names.get(loc_file, loc_file)))

    if not tasks:
        print("没有符合条件的任务（缺项或蓝本变更已处理完）。可尝试 --locale / --module 或 --reset-progress 全量重跑；或先 --record-hashes 再改蓝本后重跑以只重校变更模块。")
        if completed_set:
            print("当前进度文件已记录 %d 个已完成项。" % len(completed_set), flush=True)
        return 0

    total = len(tasks)
    if completed_set:
        print("已跳过进度文件中 %d 项，本次待执行: %d（并发 %d）" % (len(completed_set), total, args.max_workers), flush=True)
    else:
        print("任务数: %d（并发 %d）" % (total, args.max_workers))
    print("进度格式: [当前/总数] 语言文件 | 模块 | 结果")
    print("-" * 60, flush=True)
    if args.dry_run:
        for loc_file, mod_name, keys, _, _, _ in tasks:
            print("  %s | %s | %d keys" % (loc_file, mod_name, len(keys)))
        return 0

    errors = []
    completed = 0
    file_locks = {}
    print("正在请求 DeepSeek API（并发 %d），每完成一个模块即写回 JSON 并更新进度…" % args.max_workers, flush=True)
    with ThreadPoolExecutor(max_workers=args.max_workers) as ex:
        futures = {
            ex.submit(
                run_one_task,
                api_key,
                loc_file,
                mod_name,
                keys,
                flat_zh,
                flat_loc,
                lang_hint,
                args.dry_run,
            ): (loc_file, mod_name)
            for (loc_file, mod_name, keys, flat_zh, flat_loc, lang_hint) in tasks
        }
        for fut in as_completed(futures):
            loc_file, mod_name = futures[fut]
            completed += 1
            try:
                _, corrections, err = fut.result()
                if err:
                    errors.append((loc_file, mod_name, err))
                    print("[%3d/%d] %s | %s | 失败: %s" % (completed, total, loc_file, mod_name, err), flush=True)
                else:
                    write_back_module(locales_dir, loc_file, corrections, file_locks)
                    src_hash = current_module_hashes.get(mod_name)
                    append_progress(locales_dir, loc_file, mod_name, source_hash=src_hash)
                    print("[%3d/%d] %s | %s | 完成，修正 %d 处，已写回并记入进度" % (completed, total, loc_file, mod_name, len(corrections)), flush=True)
            except Exception as e:
                errors.append((loc_file, mod_name, str(e)))
                print("[%3d/%d] %s | %s | 异常: %s" % (completed, total, loc_file, mod_name, e), flush=True)

    print("-" * 60, flush=True)
    for loc_file, mod_name, err in errors:
        print("ERR %s %s: %s" % (loc_file, mod_name, err))
    print("全部完成。" if not errors else "完成，但有 %d 个任务失败，请查看上方错误信息。" % len(errors), flush=True)
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
