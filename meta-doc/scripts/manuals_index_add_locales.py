#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 manuals/index.json 中所有 category 与 article 的 title 补全指定语言键。
若某语言已有则保留，否则从 zh_CN 复制（后续可由 AI 或人工翻译）。

用法（在 meta-doc 目录下）:
  python scripts/manuals_index_add_locales.py
  python scripts/manuals_index_add_locales.py --locales es_ES,pt_BR,ru_RU
  python scripts/manuals_index_add_locales.py --dry-run
"""

import os
import json
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(ROOT, "src", "renderer", "src", "manuals", "index.json")

# 默认补全的语言（不含 zh_CN；zh_TW 等若缺失则从 zh_CN 复制）
DEFAULT_LOCALES = ["zh_TW", "es_ES", "pt_BR", "ru_RU"]


def ensure_locales(obj, locales_to_add):
    """为 obj 的 title 添加缺失的 locale 键（从 zh_CN 复制）。返回新增数量。"""
    added = 0
    if isinstance(obj, dict):
        if "title" in obj and isinstance(obj["title"], dict):
            t = obj["title"]
            if "zh_CN" not in t:
                pass
            else:
                for loc in locales_to_add:
                    if loc not in t:
                        t[loc] = t["zh_CN"]
                        added += 1
        for v in obj.values():
            added += ensure_locales(v, locales_to_add)
    elif isinstance(obj, list):
        for item in obj:
            added += ensure_locales(item, locales_to_add)
    return added


def main():
    ap = argparse.ArgumentParser(description="为 manuals/index.json 补全 title 多语言键")
    ap.add_argument("--locales", default=",".join(DEFAULT_LOCALES), help="逗号分隔的语言代码，如 zh_TW,es_ES,pt_BR,ru_RU")
    ap.add_argument("--dry-run", action="store_true", help="只统计，不写回")
    args = ap.parse_args()

    locales = [x.strip() for x in args.locales.split(",") if x.strip()]

    if not os.path.isfile(INDEX_PATH):
        print("ERROR: 未找到 %s" % INDEX_PATH)
        return 1

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    added = ensure_locales(data, locales)
    print("将为 %d 处 title 添加缺失语言键（从 zh_CN 复制）: %s" % (added, ", ".join(locales)))

    if not args.dry_run and added > 0:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("已写回 %s" % INDEX_PATH)
    elif args.dry_run:
        print("(dry-run，未写回)")

    return 0


if __name__ == "__main__":
    exit(main())
