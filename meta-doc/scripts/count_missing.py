#!/usr/bin/env python3
import json
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SCRIPT = Path("scripts/update_language_key.py")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def flatten_json(data, parent_key="", sep="."):
    items = []
    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key
        if isinstance(value, dict):
            items.extend(flatten_json(value, new_key, sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def find_missing_keys(source_file, target_file):
    """Find keys present in source but missing in target."""
    source_data = load_json(source_file)
    source_flat = flatten_json(source_data)

    if not target_file.exists():
        return source_flat

    target_data = load_json(target_file)
    target_flat = flatten_json(target_data)

    missing = {}
    for key, value in source_flat.items():
        if key not in target_flat or target_flat[key] is None or target_flat[key] == "":
            missing[key] = value

    return missing


# Load source (Chinese)
source_file = LOCALES_DIR / "zh_cn.json"
source_data = load_json(source_file)
source_flat = flatten_json(source_data)

print(f"Source keys (zh_cn): {len(source_flat)}")
print()

for lang in ["en_us", "de_DE", "fr_FR", "ja_JP", "ko_KR"]:
    target_file = LOCALES_DIR / f"{lang}.json"
    missing = find_missing_keys(source_file, target_file)
    print(f"{lang}: {len(missing)} missing keys")
