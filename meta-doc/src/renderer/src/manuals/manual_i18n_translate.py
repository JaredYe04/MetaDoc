#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用户手册 i18n：以 zh_CN 为蓝本，将缺失的手册文件翻译到其他语言（并发 + 实时写回 + 进度文件）

检查逻辑：缺失的是「文件」——若 zh_CN 下某路径有 .md，而某语言下同路径不存在，则需翻译生成。
翻译时：语言地道、不破坏原意；**不得修改** Vue 组件占位符、代码块、Mermaid、组件属性等。

API key：同目录 .deepseek_api_key，或 ../renderer/src/locales/.deepseek_api_key，或环境变量 DEEPSEEK_API_KEY。

用法:
  python manual_i18n_translate.py                 # 增量：只处理未在进度中的 语言|路径
  python manual_i18n_translate.py --locale en_US # 仅英文
  python manual_i18n_translate.py --reset-progress  # 清空进度后全量
  python manual_i18n_translate.py --dry-run     # 只列缺失文件，不请求、不写回
  python manual_i18n_translate.py --max-workers 4
  python manual_i18n_translate.py --record-hashes  # 为已有进度补写源文件哈希，便于之后检测变更
"""

import os
import sys
import json
import argparse
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from http.client import IncompleteRead

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

MANUALS_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_LOCALE = "zh_CN"
TARGET_LOCALES = ["en_US", "zh_TW", "ja_JP", "ko_KR", "de_DE", "fr_FR", "es_ES", "pt_BR", "ru_RU"]
PROGRESS_FILE = ".manual_i18n_progress.txt"  # 每行: locale\trelative_path 或 locale\trelative_path\tsource_hash
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
KEY_FILE_NAMES = [".deepseek_api_key", ".deepseek_api_key.txt"]


def load_api_key():
    for base in [MANUALS_DIR, os.path.join(MANUALS_DIR, "..", "renderer", "src", "locales")]:
        for name in KEY_FILE_NAMES:
            path = os.path.join(base, name)
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as f:
                    return f.read().strip()
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def file_content_hash(filepath):
    """返回文件内容的 SHA256 十六进制串，用于检测源是否变更。"""
    with open(filepath, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def collect_zh_cn_md_paths():
    """返回 zh_CN 下所有 .md 的相对路径（相对于 manuals/）。"""
    base = os.path.join(MANUALS_DIR, BASE_LOCALE)
    out = []
    for root, _, files in os.walk(base):
        for f in files:
            if f.endswith(".md"):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, base)
                rel = rel.replace("\\", "/")
                out.append(rel)
    return sorted(out)


def load_progress():
    """返回 (completed_set, hash_map)。completed_set 为 (locale, path) 集合；hash_map 为 (locale, path) -> 翻译时的 zh_CN 源哈希（无则 None）。"""
    path = os.path.join(MANUALS_DIR, PROGRESS_FILE)
    if not os.path.isfile(path):
        return set(), {}
    out = set()
    hash_map = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            parts = line.split("\t")
            if len(parts) >= 2:
                loc, p = parts[0].strip(), parts[1].strip()
                out.add((loc, p))
                hash_map[(loc, p)] = parts[2].strip() if len(parts) >= 3 and parts[2] else None
    return out, hash_map


def append_progress(locale, relative_path, source_hash=None):
    path = os.path.join(MANUALS_DIR, PROGRESS_FILE)
    with open(path, "a", encoding="utf-8") as f:
        if source_hash:
            f.write("%s\t%s\t%s\n" % (locale, relative_path, source_hash))
        else:
            f.write("%s\t%s\n" % (locale, relative_path))
        f.flush()


def reset_progress():
    path = os.path.join(MANUALS_DIR, PROGRESS_FILE)
    if os.path.isfile(path):
        os.remove(path)
        print("已清空进度文件: %s" % path, flush=True)


def build_prompt(lang_name, zh_content):
    return f"""Translate the following MetaDoc **user manual** content from Chinese to **{lang_name}**. Requirements:

1. **Meaning**: Preserve the original meaning exactly; use natural, idiomatic {lang_name}.
2. **DO NOT change** (keep character-for-character):
   - Vue component tags: e.g. <MenuItemsDemo mode="demo" ... />, <MainTabs mode="demo" />, any <... mode="demo" ... />. Keep tag names, attributes, and attribute values (including single-quoted JSON) unchanged.
   - Code blocks: everything between ``` and ``` (language label, code, newlines).
   - Mermaid blocks: everything inside ```mermaid ... ```.
   - Internal link or anchor syntax if present.
3. **Translate**: Headings (# ## ###), paragraphs, list items, table cells, bold/italic text — only the natural language parts. Keep the same Markdown structure (same number of #, same list/table layout).
4. **Output**: The complete translated Markdown document only. No preamble or explanation. Start with the first heading or first character of the document.

Chinese source:

---
{zh_content}
---

Translated {lang_name} document (complete Markdown only):"""


def call_deepseek(api_key, user_content, max_retries=3):
    """调用 DeepSeek API。对 IncompleteRead/网络截断自动重试，重试前短暂等待。"""
    url = f"{DEEPSEEK_BASE_URL}/v1/chat/completions"
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a technical translator. Output only the translated document, no commentary."},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
    }
    last_error = None
    for attempt in range(max_retries + 1):
        if attempt > 0:
            wait = 3 * attempt
            time.sleep(wait)
        try:
            req = Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key},
                method="POST",
            )
            with urlopen(req, timeout=300) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            return text.strip()
        except (HTTPError, URLError, json.JSONDecodeError, KeyError, IncompleteRead, OSError) as e:
            last_error = e
            if attempt == max_retries:
                raise RuntimeError("DeepSeek API 调用失败: %s" % last_error) from last_error
    return ""


def run_one_task(api_key, locale, relative_path, lang_name, dry_run):
    if dry_run:
        return (locale, relative_path, None, None)
    zh_path = os.path.join(MANUALS_DIR, BASE_LOCALE, relative_path)
    with open(zh_path, "r", encoding="utf-8") as f:
        zh_content = f.read()
    prompt = build_prompt(lang_name, zh_content)
    try:
        translated = call_deepseek(api_key, prompt)
        return (locale, relative_path, translated, None)
    except Exception as e:
        return (locale, relative_path, None, str(e))


def write_back(locale, relative_path, content):
    out_path = os.path.join(MANUALS_DIR, locale, relative_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    ap = argparse.ArgumentParser(description="用户手册 i18n：按缺失文件翻译，并发+实时写回+进度")
    ap.add_argument("--locale", default=None, help="只处理该语言，如 en_US")
    ap.add_argument("--dry-run", action="store_true", help="只列缺失，不请求、不写回")
    ap.add_argument("--max-workers", type=int, default=3, help="并发数（手册单篇较长，建议 3）")
    ap.add_argument("--reset-progress", action="store_true", help="清空进度后全量")
    ap.add_argument("--record-hashes", action="store_true", help="为进度中已有项补写 zh_CN 源哈希，之后修改源文件会自动触发重译")
    args = ap.parse_args()

    zh_paths = collect_zh_cn_md_paths()
    if not zh_paths:
        print("ERROR: 未找到 zh_CN 下任何 .md 文件")
        return 1

    api_key = load_api_key()
    if not api_key and not args.dry_run and not args.record_hashes:
        print("ERROR: 未找到 API key。请在 manuals 或 locales 目录放置 .deepseek_api_key 或设置 DEEPSEEK_API_KEY")
        return 1

    if args.reset_progress:
        reset_progress()

    completed_set, hash_map = load_progress()
    locales = [l for l in TARGET_LOCALES if args.locale is None or l == args.locale or l.lower() == (args.locale or "").lower()]
    if not locales:
        print("ERROR: 未匹配到目标语言")
        return 1

    # 当前 zh_CN 各路径的内容哈希，用于检测源文件变更
    current_zh_hashes = {}
    for rel in zh_paths:
        zh_path = os.path.join(MANUALS_DIR, BASE_LOCALE, rel)
        if os.path.isfile(zh_path):
            current_zh_hashes[rel] = file_content_hash(zh_path)

    if args.record_hashes:
        lines = []
        for (locale, path) in sorted(completed_set):
            target_path = os.path.join(MANUALS_DIR, locale, path)
            zh_path = os.path.join(MANUALS_DIR, BASE_LOCALE, path)
            if os.path.isfile(target_path) and os.path.isfile(zh_path):
                h = file_content_hash(zh_path)
                lines.append("%s\t%s\t%s" % (locale, path, h))
            else:
                lines.append("%s\t%s" % (locale, path))
        progress_path = os.path.join(MANUALS_DIR, PROGRESS_FILE)
        with open(progress_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + ("\n" if lines else ""))
        print("已为 %d 项写入/更新源哈希到进度文件。" % len(lines), flush=True)
        return 0

    lang_names = {"en_US": "English", "zh_TW": "Traditional Chinese", "ja_JP": "Japanese", "ko_KR": "Korean", "de_DE": "German", "fr_FR": "French", "es_ES": "Spanish", "pt_BR": "Portuguese (Brazil)", "ru_RU": "Russian"}
    tasks = []
    for locale in locales:
        for rel in zh_paths:
            target_path = os.path.join(MANUALS_DIR, locale, rel)
            target_exists = os.path.isfile(target_path)
            stored_hash = hash_map.get((locale, rel))
            current_hash = current_zh_hashes.get(rel)
            if (locale, rel) in completed_set:
                if current_hash is not None and stored_hash is not None and stored_hash != current_hash:
                    tasks.append((locale, rel, lang_names.get(locale, locale)))
                elif not target_exists:
                    tasks.append((locale, rel, lang_names.get(locale, locale)))
                else:
                    continue
            else:
                if not target_exists:
                    tasks.append((locale, rel, lang_names.get(locale, locale)))

    if not tasks:
        print("没有需要处理的任务（缺失/源变更已全部处理）。可用 --reset-progress 全量重跑；或先 --record-hashes 再改源文件后重跑以只重译变更项。")
        if completed_set:
            print("当前进度文件已记录 %d 项。" % len(completed_set), flush=True)
        return 0

    total = len(tasks)
    print("待处理: %d 个 语言|文件（并发 %d）" % (total, args.max_workers))
    print("进度: [当前/总数] 语言 | 相对路径 | 结果")
    print("-" * 60, flush=True)
    if args.dry_run:
        for locale, rel, _ in tasks:
            print("  %s | %s" % (locale, rel))
        return 0

    errors = []
    done = 0
    print("正在请求 DeepSeek API，每完成一篇即写回并更新进度…", flush=True)
    with ThreadPoolExecutor(max_workers=args.max_workers) as ex:
        futures = {
            ex.submit(run_one_task, api_key, locale, rel, lang_name, args.dry_run): (locale, rel)
            for (locale, rel, lang_name) in tasks
        }
        for fut in as_completed(futures):
            locale, rel = futures[fut]
            done += 1
            try:
                _, _, content, err = fut.result()
                if err:
                    errors.append((locale, rel, err))
                    print("[%3d/%d] %s | %s | 失败: %s" % (done, total, locale, rel, err), flush=True)
                else:
                    write_back(locale, rel, content or "")
                    src_hash = current_zh_hashes.get(rel)
                    append_progress(locale, rel, source_hash=src_hash)
                    print("[%3d/%d] %s | %s | 已写回并记入进度" % (done, total, locale, rel), flush=True)
            except Exception as e:
                errors.append((locale, rel, str(e)))
                print("[%3d/%d] %s | %s | 异常: %s" % (done, total, locale, rel, e), flush=True)

    print("-" * 60, flush=True)
    for locale, rel, err in errors:
        print("ERR %s %s: %s" % (locale, rel, err))
    print("全部完成。" if not errors else "完成，但有 %d 个任务失败。" % len(errors), flush=True)
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
