#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 manuals/index.json 中所有 category 与 article 的 title 补全 zh_TW 键。
若已有 zh_TW 则保留，否则从 zh_CN 复制（后续可由 AI 或人工改为繁体）。

用法（在 meta-doc 目录下）:
  python scripts/manuals_index_add_zh_tw.py
  python scripts/manuals_index_add_zh_tw.py --dry-run  # 仅打印将修改的数量
"""

import os
import json
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(ROOT, "src", "renderer", "src", "manuals", "index.json")


def ensure_zh_tw(obj):
    """为 obj 的 title 添加 zh_TW（无则从 zh_CN 复制）。返回新增数量。"""
    added = 0
    if isinstance(obj, dict):
        if "title" in obj and isinstance(obj["title"], dict):
            t = obj["title"]
            if "zh_CN" in t and "zh_TW" not in t:
                t["zh_TW"] = t["zh_CN"]
                added += 1
        for v in obj.values():
            added += ensure_zh_tw(v)
    elif isinstance(obj, list):
        for item in obj:
            added += ensure_zh_tw(item)
    return added


def main():
    ap = argparse.ArgumentParser(description="为 manuals/index.json 补全 title.zh_TW")
    ap.add_argument("--dry-run", action="store_true", help="只统计，不写回")
    args = ap.parse_args()

    if not os.path.isfile(INDEX_PATH):
        print("ERROR: 未找到 %s" % INDEX_PATH)
        return 1

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    added = ensure_zh_tw(data)
    print("将为 %d 处 title 添加 zh_TW（从 zh_CN 复制）" % added)

    if not args.dry_run and added > 0:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("已写回 %s" % INDEX_PATH)
    elif args.dry_run:
        print("(dry-run，未写回)")

    return 0


if __name__ == "__main__":
    exit(main())
