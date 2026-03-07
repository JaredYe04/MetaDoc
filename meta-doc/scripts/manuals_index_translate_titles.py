#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 manuals/index.json 中「与 zh_CN 相同」或缺失的 category/article 标题翻译为目标语言并写回。
解决手册索引在非中文语言下仍显示中文标题的问题。需配置 .deepseek_api_key 或 DEEPSEEK_API_KEY。

用法（在 meta-doc 目录下）:
  python scripts/manuals_index_translate_titles.py
  python scripts/manuals_index_translate_titles.py --locale zh_TW
  python scripts/manuals_index_translate_titles.py --dry-run
"""

import os
import sys
import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(ROOT, "src", "renderer", "src", "manuals", "index.json")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
KEY_FILES = [".deepseek_api_key", ".deepseek_api_key.txt"]
MANUALS_DIR = os.path.join(ROOT, "src", "renderer", "src", "manuals")
TARGET_LOCALES = ["en_US", "zh_TW", "ja_JP", "ko_KR", "de_DE", "fr_FR", "es_ES", "pt_BR", "ru_RU"]
LANG_NAMES = {
    "en_US": "English",
    "zh_TW": "Traditional Chinese",
    "ja_JP": "Japanese",
    "ko_KR": "Korean",
    "de_DE": "German",
    "fr_FR": "French",
    "es_ES": "Spanish",
    "pt_BR": "Portuguese (Brazil)",
    "ru_RU": "Russian",
}


def load_api_key():
    for base in [MANUALS_DIR, os.path.join(ROOT, "src", "renderer", "src", "locales")]:
        for name in KEY_FILES:
            path = os.path.join(base, name)
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as f:
                    return f.read().strip()
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def collect_title_entries(data, entries, path=""):
    """收集所有需要翻译的 (path, zh_CN) 标题。entries 为 list of (path, zh_val)。"""
    if isinstance(data, dict):
        if "title" in data and isinstance(data["title"], dict):
            zh = data["title"].get("zh_CN") or ""
            if zh:
                entries.append((path or "title", zh))
        for k, v in data.items():
            collect_title_entries(v, entries, path or k)
    elif isinstance(data, list):
        for i, item in enumerate(data):
            collect_title_entries(item, entries, "%s[%d]" % (path, i))


def set_title_by_path(data, path, locale, value):
    """按 path 找到 title 对象并设置 title[locale] = value。path 格式如 'categories[0]' 或 'categories[0].articles[1]'。"""
    parts = path.replace("[", ".").replace("]", "").split(".")
    d = data
    for i, p in enumerate(parts):
        if p == "categories" or p == "articles":
            continue
        if p.isdigit():
            idx = int(p)
            if i + 1 < len(parts) and parts[i + 1] == "articles":
                d = d["categories"][idx]
            else:
                d = d["categories"][idx]
            continue
        d = d[p]
    if "title" in d and isinstance(d["title"], dict):
        d["title"][locale] = value


def build_path_list(data, path_list, prefix=""):
    """收集每个 title 的 path（用于写回）。path_list 元素为 (path, zh_CN)。"""
    if isinstance(data, dict):
        if "title" in data and isinstance(data["title"], dict):
            zh = data["title"].get("zh_CN") or ""
            if zh:
                path_list.append((prefix, zh))
        for k, v in data.items():
            build_path_list(v, path_list, prefix or k)
    elif isinstance(data, list):
        for i, item in enumerate(data):
            build_path_list(item, path_list, "%s[%d]" % (prefix, i))


def resolve_path(data, path_str):
    """path_str 如 'categories.0' 或 'categories.0.articles.1'，返回对应节点。"""
    parts = path_str.split(".")
    d = data
    for i, p in enumerate(parts):
        if p == "categories" or p == "articles":
            continue
        if p.isdigit():
            idx = int(p)
            if d.get("categories") is not None:
                d = d["categories"][idx]
            elif d.get("articles") is not None:
                d = d["articles"][idx]
            else:
                return None
        else:
            d = d.get(p)
        if d is None:
            return None
    return d


def collect_paths_and_zh(data, out_paths, out_zh_list):
    """按顺序收集所有 category 与 article 的 zh_CN 标题。out_paths 为 [(typ, ci, ai), ...]。"""
    for i, cat in enumerate(data.get("categories") or []):
        t = (cat.get("title") or {}).get("zh_CN") or ""
        if t.strip():
            out_paths.append(("category", i, -1))
            out_zh_list.append(t.strip())
        for j, art in enumerate((cat.get("articles") or [])):
            t = (art.get("title") or {}).get("zh_CN") or ""
            if t.strip():
                out_paths.append(("article", i, j))
                out_zh_list.append(t.strip())


def call_deepseek(api_key, prompt, max_retries=2):
    url = f"{DEEPSEEK_BASE_URL}/v1/chat/completions"
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "You are a translator. Output only the translated lines, one per line, no numbering, no explanation. Same number of lines as input."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    for attempt in range(max_retries + 1):
        try:
            req = Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key},
                method="POST",
            )
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            return text.strip()
        except (HTTPError, URLError, json.JSONDecodeError, KeyError) as e:
            if attempt == max_retries:
                raise RuntimeError("DeepSeek API 调用失败: %s" % e) from e
    return ""


def main():
    ap = argparse.ArgumentParser(description="翻译手册 index.json 标题到各语言")
    ap.add_argument("--locale", default=None, help="只处理该语言，如 zh_TW")
    ap.add_argument("--dry-run", action="store_true", help="只列出需翻译项，不请求 API")
    args = ap.parse_args()

    if not os.path.isfile(INDEX_PATH):
        print("ERROR: 未找到 %s" % INDEX_PATH)
        return 1

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    paths = []
    zh_list = []
    collect_paths_and_zh(data, paths, zh_list)

    if not zh_list:
        print("未找到任何 title.zh_CN")
        return 0

    locales = [l for l in TARGET_LOCALES if args.locale is None or l == args.locale]
    if not locales:
        print("ERROR: 未匹配到目标语言")
        return 1

    api_key = load_api_key() if not args.dry_run else ""
    if not api_key and not args.dry_run:
        print("ERROR: 未找到 API key。请在 manuals 或 locales 目录放置 .deepseek_api_key 或设置 DEEPSEEK_API_KEY")
        return 1

    zh_text = "\n".join(zh_list)
    updated = 0

    for locale in locales:
        lang_name = LANG_NAMES.get(locale, locale)
        need_translate = []
        for (typ, ci, ai), zh in zip(paths, zh_list):
            node = None
            if typ == "category":
                node = data["categories"][ci]
            else:
                node = data["categories"][ci]["articles"][ai]
            cur = (node.get("title") or {}).get(locale) or ""
            if not cur.strip() or cur.strip() == zh.strip():
                need_translate.append((typ, ci, ai, zh))

        if not need_translate:
            print("[%s] 无需翻译（已有译文且与 zh_CN 不同）" % locale)
            continue

        if args.dry_run:
            print("[%s] 需翻译 %d 条标题" % (locale, len(need_translate)))
            continue

        prompt = """Translate the following Chinese **user manual** section titles to **%s**. Each line is one title. Output exactly one translated line per line, in the same order. No numbering, no explanation. Use natural %s.

Chinese titles (one per line):
---
%s
---

Translated titles (one per line):""" % (lang_name, lang_name, "\n".join([n[3] for n in need_translate]))

        try:
            out = call_deepseek(api_key, prompt)
            lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        except Exception as e:
            print("ERROR [%s]: %s" % (locale, e))
            continue

        if len(lines) != len(need_translate):
            print("WARN [%s]: API 返回行数 %d != 期望 %d，跳过" % (locale, len(lines), len(need_translate)))
            continue

        for (typ, ci, ai, _zh), new_val in zip(need_translate, lines):
            if typ == "category":
                node = data["categories"][ci]
            else:
                node = data["categories"][ci]["articles"][ai]
            if "title" not in node:
                node["title"] = {}
            node["title"][locale] = new_val
            updated += 1

        print("[%s] 已写入 %d 条标题" % (locale, len(need_translate)))

    if updated and not args.dry_run:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("已写回 %s" % INDEX_PATH)

    return 0


if __name__ == "__main__":
    sys.exit(main())
