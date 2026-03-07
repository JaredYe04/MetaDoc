#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Locale_prompts i18n：一步执行「缺失键检查 + 自动补全/翻译」

以 zh_CN 为蓝本，仅处理各 JSON 的 "prompts" 对象。运行时会先输出各语言缺失键数量，
然后自动调用 DeepSeek 补全缺失并校对译文；翻译时严格校验占位符（{xxx}、[TAG]）不被破坏。

依赖: 标准库 + urllib。API key：同目录 .deepseek_api_key 或环境变量 DEEPSEEK_API_KEY。

用法（直接执行即一步到位）:
  python locale_prompts_i18n_review.py              # 检查缺失并自动补全/翻译所有语言
  python locale_prompts_i18n_review.py --locale en_US
  python locale_prompts_i18n_review.py --module agent
  python locale_prompts_i18n_review.py --dry-run    # 仅打印缺失与任务，不请求 API
  python locale_prompts_i18n_review.py --reset-progress
  python locale_prompts_i18n_review.py --record-hashes
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

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
MAX_KEYS_PER_CHUNK = 25
LOCALES_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_FILE = "zh_CN.json"
KEY_FILE_NAMES = [".deepseek_api_key", ".deepseek_api_key.txt"]
PROGRESS_FILE = ".locale_prompts_i18n_progress.txt"


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
    by_module = {}
    for k in flat_keys:
        parts = k.split(".")
        if parts[0] == "agent" and len(parts) >= 2:
            mod = "agent." + parts[1]
        else:
            mod = parts[0]
        by_module.setdefault(mod, []).append(k)
    result = {}
    for mod, keys in sorted(by_module.items()):
        keys = sorted(keys)
        for i in range(0, len(keys), max_per_chunk):
            chunk = keys[i : i + max_per_chunk]
            chunk_name = mod if len(keys) <= max_per_chunk else f"{mod}_part{i//max_per_chunk}"
            result[chunk_name] = chunk
    return result


def module_content_hash(flat_zh, keys):
    parts = []
    for k in sorted(keys):
        parts.append("%s:%s" % (k, flat_zh.get(k, "")))
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


# 占位符：{xxx} 或 [XXX] 形式，必须原样保留
def extract_placeholders(text):
    if not text or not isinstance(text, str):
        return set()
    out = set()
    out.update(re.findall(r"\{[a-zA-Z0-9_]+\}", text))
    out.update(re.findall(r"\[[A-Za-z0-9_]+\]", text))
    return out


def validate_placeholders(zh_val, translated_val):
    """若中文原文中有占位符，译文中必须全部保留；否则视为破坏占位符，返回 False。"""
    required = extract_placeholders(zh_val)
    if not required:
        return True, []
    found = set()
    missing = []
    for p in required:
        if p in translated_val:
            found.add(p)
        else:
            missing.append(p)
    return len(missing) == 0, missing


def build_prompt_fill_only(locale_name, lang_hint, module_name, zh_items):
    """仅补全缺失键的翻译，不校对已有译文。"""
    lang = lang_hint or locale_name
    placeholders_in_batch = sorted(extract_placeholders(zh_items))
    placeholder_note = ""
    if placeholders_in_batch:
        placeholder_note = "\n**本批条目中出现的占位符（必须全部原样保留）：** " + ", ".join(placeholders_in_batch) + "\n"
    return f"""你正在将 MetaDoc 的 AI/Agent 提示词从中文翻译为 {lang}。下方是需要补翻的条目，请为每条输出译文。

**【最重要】占位符必须原样保留，否则译文会被丢弃、不写回：**
- 所有花括号占位符（如 {{chartType}}、{{input}}、{{treeJson}}、{{word}}、{{contexts}}、{{basePrompt}}、{{preContext}}、{{chartTypeRules}}、{{retryBlock}}、{{prompt}}、{{context}}、{{conversationSummary}}、{{observationText}} 等）必须**一字不改、原样**出现在译文中。
- 所有方括号标记（如 [CURRENT_POS]、[检索内容开始]、[检索内容结束]）必须**原样**保留。
- 代码块（```json、```echarts、```mermaid、```latex 等）及其内部结构不翻译；仅翻译块外的自然语言。
- 若译文中缺少任一占位符，系统将**跳过该条、不写回**。
{placeholder_note}
**输出格式：** 每行一条「完整键路径 + 制表符(Tab) + 译文」。键路径与下方列表完全一致；译文中不要包含 Tab，换行用 \\n 或保留。

**模块：** {module_name}
**参考（中文）→ 请译为 {lang}：**
{zh_items}

请只输出每行「键<Tab>译文」，无需解释。每条都必须输出。务必保证每条译文中的占位符与中文参考完全一致。
"""


def filter_corrections_by_placeholders(corrections, flat_zh):
    """过滤掉会破坏占位符的修正；返回 (通过列表, 跳过数量, 失败项列表 (key, zh_val, missing) 用于严格重试)。"""
    out = []
    skipped = 0
    failed_for_retry = []
    for key, new_val in corrections:
        zh_val = flat_zh.get(key, "")
        ok, missing = validate_placeholders(zh_val, new_val)
        if ok:
            out.append((key, new_val))
        else:
            skipped += 1
            failed_for_retry.append((key, zh_val, missing))
            print("跳过（占位符缺失，不写回） %s: 译文中缺少 %s" % (key, missing), flush=True)
    return out, skipped, failed_for_retry


def build_prompt_strict_retry(locale_name, lang_hint, failed_items):
    """针对占位符缺失的条目做严格重试：明确列出每条必须保留的占位符（不列举键名，避免 AI 以为只需补这些键）。"""
    lang = lang_hint or locale_name
    lines = []
    for key, zh_val, missing in failed_items:
        placeholders_str = ", ".join(sorted(missing))
        lines.append("键: %s\n中文: %s\n【必须原样出现在译文中】: %s" % (key, zh_val, placeholders_str))
    block = "\n\n---\n\n".join(lines)
    return f"""你正在将以下中文提示词翻译为 {lang}。这些条目之前因译文中缺少占位符被拒绝，请重新翻译并**务必**保留占位符。

【强制要求】
- 每条译文中必须包含该条列出的「必须原样出现在译文中」的所有占位符，一字不改、逐个复制到译文中。
- 占位符格式为 {{name}} 或 [NAME]，不要翻译、不要替换、不要遗漏。
- 输出格式：每行一条「完整键路径 + 制表符(Tab) + 译文」，键路径与下方「键」完全一致。

**待翻译（每条下方已标明必须保留的占位符）：**
{block}

请只输出每行「键<Tab>译文」，不要解释。若某条译文中缺少任一上述占位符，该条将再次被丢弃。
"""


SYSTEM_PLACEHOLDER = """You are a professional translator. CRITICAL: Placeholder preservation is mandatory. Every placeholder from the source MUST appear in your translation exactly, character-for-character: (1) Curly-brace placeholders like {word}, {chartType}, {input}, {treeJson}, {basePrompt}, {preContext}, {chartTypeRules}, {retryBlock}, {prompt}, {context}, {conversationSummary}, {observationText} must be copied verbatim. (2) Square-bracket markers like [CURRENT_POS], [检索内容开始], [检索内容结束] must be copied verbatim. (3) Code blocks (e.g. ```json, ```echarts, ```mermaid) and their content must not be translated. If any placeholder is missing or altered in your output, that line will be rejected and not written.需要注意的是，请务必保留所有占位符，不要翻译、不要替换、不要遗漏，类似于'{userPrompt}','{outlineMarkdown}', '{sectionTitle}', '{userPrompt}'这样的，带有大括号的占位符，请务必保留。 Output only key<Tab>value lines, no commentary."""

SYSTEM_STRICT_RETRY = """You are a translator. Your previous translation was REJECTED because placeholders were missing. This is a STRICT RETRY: for each item, the user message lists the EXACT placeholder strings that MUST appear in your translation. Copy every listed placeholder into the translation character-for-character; do not translate, rephrase, or omit them. Output only key<Tab>translation lines. No explanation."""

def call_deepseek(api_key, user_content, max_retries=5, system_content=None):
    url = f"{DEEPSEEK_BASE_URL}/v1/chat/completions"
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_content or SYSTEM_PLACEHOLDER},
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
            with urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            return text.strip()
        except (HTTPError, URLError, json.JSONDecodeError, KeyError) as e:
            if attempt == max_retries:
                raise RuntimeError(f"DeepSeek API 调用失败: {e}") from e
    return ""


def parse_corrections(text):
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
    if not corrections:
        return
    lock = file_locks.setdefault(locale_file, threading.Lock())
    with lock:
        path = os.path.join(locales_dir, locale_file)
        data = load_json(path)
        prompts = data.setdefault("prompts", {})
        for key, new_val in corrections:
            try:
                set_nested(prompts, key, new_val)
            except Exception as e:
                print("WARN: 无法设置 %s in %s: %s" % (key, locale_file, e), flush=True)
        save_json(path, data)


def run_one_task(api_key, locale_file, module_name, keys_to_translate, flat_zh, flat_locale, lang_hint, dry_run):
    """仅对 keys_to_translate（缺失/未翻译的键）请求翻译，不校对已有译文。占位符缺失的条目会用严格提示词重试一次。"""
    if dry_run:
        return (locale_file, [], 0, None)
    if not keys_to_translate:
        return (locale_file, [], 0, None)
    zh_lines = "\n".join(f"{k}: {flat_zh.get(k, '')}" for k in keys_to_translate)
    prompt = build_prompt_fill_only(
        locale_file.replace(".json", ""), lang_hint, module_name, zh_lines
    )
    try:
        raw = call_deepseek(api_key, prompt)
        corrections = parse_corrections(raw)
        valid_corrections, skipped, failed_for_retry = filter_corrections_by_placeholders(corrections, flat_zh)
        still_failed = failed_for_retry
        for retry_round in range(5):
            if not still_failed:
                break
            strict_prompt = build_prompt_strict_retry(
                locale_file.replace(".json", ""), lang_hint, still_failed
            )
            try:
                retry_raw = call_deepseek(api_key, strict_prompt, system_content=SYSTEM_STRICT_RETRY)
                retry_corrections = parse_corrections(retry_raw)
                retry_valid, _, still_failed_list = filter_corrections_by_placeholders(
                    retry_corrections, flat_zh
                )
                valid_corrections.extend(retry_valid)
                if retry_valid:
                    print("严格重试第 %d 轮 %s: 补回 %d 条" % (retry_round + 1, locale_file, len(retry_valid)), flush=True)
                still_failed = still_failed_list
            except Exception as retry_e:
                print("严格重试第 %d 轮请求失败 %s: %s" % (retry_round + 1, locale_file, retry_e), flush=True)
                break
        if still_failed:
            print("严格重试 5 轮后仍缺失占位符 %s: %d 条" % (locale_file, len(still_failed)), flush=True)
        return (locale_file, valid_corrections, skipped, None)
    except Exception as e:
        return (locale_file, [], 0, str(e))


def main():
    ap = argparse.ArgumentParser(description="Locale_prompts prompts i18n（DeepSeek，仅 prompts 对象）")
    ap.add_argument("--dir", default=LOCALES_DIR, help="locale_prompts 目录")
    ap.add_argument("--locale", default=None, help="只处理该语言文件，如 en_US")
    ap.add_argument("--module", default=None, help="只处理该模块，如 agent 或 tools")
    ap.add_argument("--dry-run", action="store_true", help="只打印任务，不请求 API、不写文件")
    ap.add_argument("--max-workers", type=int, default=3, help="并发数")
    ap.add_argument("--reset-progress", action="store_true", help="清空进度后全量执行")
    ap.add_argument("--record-hashes", action="store_true", help="为进度项补写 zh_CN 模块哈希")
    args = ap.parse_args()

    locales_dir = os.path.abspath(args.dir)
    base_path = os.path.join(locales_dir, BASE_FILE)
    if not os.path.isfile(base_path):
        print("ERROR: 未找到基准文件", base_path)
        return 1

    api_key = load_api_key()
    if not api_key and not args.dry_run and not args.record_hashes:
        print("ERROR: 未找到 API key。请在同目录创建 .deepseek_api_key 或设置 DEEPSEEK_API_KEY")
        return 1

    zh_data = load_json(base_path)
    prompts_zh = zh_data.get("prompts") or {}
    flat_zh = flatten_json(prompts_zh)
    all_modules = group_keys_by_module(list(flat_zh.keys()))
    current_module_hashes = {mod: module_content_hash(flat_zh, keys) for mod, keys in all_modules.items()}

    locale_files = [
        f for f in os.listdir(locales_dir)
        if f.endswith(".json") and f != BASE_FILE and not f.startswith(".")
    ]
    if args.locale:
        locale_files = [f for f in locale_files if f.replace(".json", "") == args.locale.replace(".json", "")]
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
        print("已为 %d 项写入/更新模块哈希。" % len(lines), flush=True)
        return 0

    lang_names = {
        "en_US.json": "English",
        "zh_TW.json": "Traditional Chinese",
        "ja_JP.json": "Japanese",
        "ko_KR.json": "Korean",
        "de_DE.json": "German",
        "fr_FR.json": "French",
        "es_ES.json": "Spanish",
        "pt_BR.json": "Portuguese (Brazil)",
        "ru_RU.json": "Russian",
    }

    locale_missing_count = {}
    tasks = []
    for loc_file in sorted(locale_files):
        loc_path = os.path.join(locales_dir, loc_file)
        try:
            loc_data = load_json(loc_path)
        except Exception as e:
            print("WARN: 跳过 %s: %s" % (loc_file, e))
            locale_missing_count[loc_file] = len(flat_zh)
            continue
        flat_loc = flatten_json(loc_data.get("prompts") or {})
        missing_cnt = sum(
            1 for k in flat_zh
            if k not in flat_loc
            or not (flat_loc.get(k) or "").strip()
            or (loc_file != BASE_FILE and (flat_loc.get(k) or "").strip() == (flat_zh.get(k) or ""))
        )
        locale_missing_count[loc_file] = missing_cnt
        for mod_name, keys in all_modules.items():
            if args.module and not (mod_name == args.module or mod_name.startswith(args.module + ".") or mod_name.startswith(args.module + "_")):
                continue
            missing_in_locale = [
                k for k in keys
                if k not in flat_loc
                or (loc_file != BASE_FILE and (flat_loc.get(k) or '').strip() == (flat_zh.get(k) or ''))
            ]
            stored_hash = hash_map.get((loc_file, mod_name))
            current_hash = current_module_hashes.get(mod_name)
            # 只补全缺失/未翻译的键，不校对已有译文；无待补键则跳过
            if not missing_in_locale:
                continue
            # 已记入进度且源未变则跳过，避免每次待执行数不变、重复跑同一批
            if (loc_file, mod_name) in completed_set and stored_hash == current_hash:
                continue
            tasks.append((loc_file, mod_name, missing_in_locale, flat_zh, flat_loc, lang_names.get(loc_file, loc_file)))

    # 一步到位：先输出缺失键检查
    print("=== 缺失键检查（蓝本 zh_CN，共 %d 键）===" % len(flat_zh), flush=True)
    for loc_file in sorted(locale_files):
        cnt = locale_missing_count.get(loc_file, 0)
        print("  %s: %d 个缺失/空键" % (loc_file, cnt), flush=True)
    print("", flush=True)

    if not tasks:
        total_missing = sum(locale_missing_count.get(f, 0) for f in locale_files)
        if total_missing > 0 and completed_set:
            print("没有待执行任务，但各语言仍有共 %d 个缺失/空键（可能上次因占位符未写回被记入进度）。" % total_missing, flush=True)
            print("建议执行一次 --reset-progress 后重新运行，本次将只对「全部键写回」的模块记入进度。", flush=True)
        else:
            print("没有需要补全或校对的任务。可尝试 --locale / --module 或 --reset-progress。")
        if completed_set:
            print("当前进度已记录 %d 项。" % len(completed_set), flush=True)
        return 0

    total = len(tasks)
    if completed_set:
        print("已跳过进度中 %d 项，本次待执行: %d（并发 %d）" % (len(completed_set), total, args.max_workers), flush=True)
    else:
        print("本次待执行: %d 个任务（并发 %d）" % (total, args.max_workers), flush=True)
    print("进度: [当前/总数] 语言文件 | 模块 | 结果")
    print("-" * 60, flush=True)
    if args.dry_run:
        for loc_file, mod_name, keys_to_translate, flat_zh_t, flat_loc_t, _ in tasks:
            print("  %s | %s | %d keys（仅补翻）" % (loc_file, mod_name, len(keys_to_translate)))
        # dry-run 时检查现有译文的占位符缺失
        print("", flush=True)
        print("=== dry-run 占位符检查（现有译文中缺失占位符的键，正式运行时会被跳过不写回）===", flush=True)
        any_issue = False
        for loc_file, mod_name, keys_to_translate, flat_zh_t, flat_loc_t, _ in tasks:
            for k in keys_to_translate:
                zh_val = flat_zh_t.get(k, "")
                loc_val = (flat_loc_t.get(k) or "").strip()
                if not loc_val:
                    continue
                ok, missing = validate_placeholders(zh_val, loc_val)
                if not ok:
                    any_issue = True
                    print("  [dry-run] 占位符缺失 %s | %s: 缺少 %s" % (loc_file, k, missing), flush=True)
        if not any_issue:
            print("  （未发现占位符缺失）", flush=True)
        return 0

    print("开始自动补全与翻译（占位符将校验，破坏的条目不会写回）…", flush=True)
    errors = []
    completed = 0
    file_locks = {}
    with ThreadPoolExecutor(max_workers=args.max_workers) as ex:
        futures = {
            ex.submit(
                run_one_task,
                api_key,
                loc_file,
                mod_name,
                keys_to_translate,
                flat_zh,
                flat_loc,
                lang_hint,
                args.dry_run,
            ): (loc_file, mod_name, len(keys_to_translate))
            for (loc_file, mod_name, keys_to_translate, flat_zh, flat_loc, lang_hint) in tasks
        }
        for fut in as_completed(futures):
            loc_file, mod_name, keys_count = futures[fut]
            completed += 1
            try:
                _, corrections, skipped, err = fut.result()
                if err:
                    errors.append((loc_file, mod_name, err))
                    print("[%3d/%d] %s | %s | 失败: %s" % (completed, total, loc_file, mod_name, err), flush=True)
                else:
                    if corrections:
                        write_back_module(locales_dir, loc_file, corrections, file_locks)
                    # 仅当本任务要补的键全部写回时才记入进度，否则下次继续重试（含占位符失败未写回的）
                    all_filled = len(corrections) == keys_count
                    if all_filled:
                        src_hash = current_module_hashes.get(mod_name)
                        append_progress(locales_dir, loc_file, mod_name, source_hash=src_hash)
                    if skipped > 0:
                        print("[%3d/%d] %s | %s | 完成，补翻 %d 处，跳过 %d 处（占位符缺失不写回）%s" % (
                            completed, total, loc_file, mod_name, len(corrections), skipped,
                            "，已记入进度" if all_filled else "，未记入进度（下次重试）"), flush=True)
                    else:
                        print("[%3d/%d] %s | %s | 完成，补翻 %d 处，已写回%s" % (
                            completed, total, loc_file, mod_name, len(corrections),
                            "并记入进度" if all_filled else "，未记入进度（下次重试）"), flush=True)
            except Exception as e:
                errors.append((loc_file, mod_name, str(e)))
                print("[%3d/%d] %s | %s | 异常: %s" % (completed, total, loc_file, mod_name, e), flush=True)

    print("-" * 60, flush=True)
    for loc_file, mod_name, err in errors:
        print("ERR %s %s: %s" % (loc_file, mod_name, err))
    print("全部完成。" if not errors else "完成，但有 %d 个任务失败。" % len(errors), flush=True)
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
