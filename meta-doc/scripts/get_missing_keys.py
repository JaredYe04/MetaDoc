#!/usr/bin/env python3
"""
Find missing i18n keys for a specific language and save to file.
Used by subagent to get keys that need translation.

Usage:
    python get_missing_keys.py --lang en_us [--limit 20]
"""

import argparse
import json
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SOURCE_LANG = "zh_cn"


def flatten_json(data, parent_key="", sep="."):
    items = []
    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key
        if isinstance(value, dict):
            items.extend(flatten_json(value, new_key, sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def get_missing_keys(lang, limit=None):
    source_file = LOCALES_DIR / f"{SOURCE_LANG}.json"
    target_file = LOCALES_DIR / f"{lang}.json"

    with open(source_file, "r", encoding="utf-8") as f:
        source_data = json.load(f)
    source_flat = flatten_json(source_data)

    if not target_file.exists():
        target_flat = {}
    else:
        with open(target_file, "r", encoding="utf-8") as f:
            target_data = json.load(f)
        target_flat = flatten_json(target_data)

    missing = []
    for key, value in source_flat.items():
        if key not in target_flat or not target_flat[key]:
            missing.append(
                {"key": key, "chinese": value, "current": target_flat.get(key, None)}
            )

    total_missing = len(missing)
    if limit:
        missing = missing[:limit]

    return missing, total_missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", required=True, help="Target language code")
    parser.add_argument("--limit", type=int, default=20, help="Max keys to return")
    parser.add_argument("--output", help="Output file (default: stdout)")
    args = parser.parse_args()

    missing, total_missing = get_missing_keys(args.lang, args.limit)

    result = {"lang": args.lang, "total_missing": total_missing, "keys": missing}

    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Saved to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
