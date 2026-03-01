#!/usr/bin/env python3
"""
Batch translation orchestrator for i18n.
Finds missing keys and delegates translation to subagents in batches of ~50.

Usage:
    python i18n_batch_translate.py
"""

import json
import subprocess
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SOURCE_LANG = "zh_cn"
TARGET_LANGS = ["en_us", "de_DE", "fr_FR", "ja_JP", "ko_KR"]
BATCH_SIZE = 50


def flatten_json(data: dict, parent_key: str = "", sep: str = ".") -> dict:
    items = []
    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key
        if isinstance(value, dict):
            items.extend(flatten_json(value, new_key, sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def find_missing_keys(source_file: Path, target_file: Path) -> dict:
    """Find keys present in source but missing in target."""
    with open(source_file, "r", encoding="utf-8") as f:
        source_data = json.load(f)

    source_flat = flatten_json(source_data)

    if not target_file.exists():
        return source_flat

    with open(target_file, "r", encoding="utf-8") as f:
        target_data = json.load(f)

    target_flat = flatten_json(target_data)

    missing = {}
    for key, value in source_flat.items():
        if key not in target_flat or target_flat[key] is None or target_flat[key] == "":
            missing[key] = value

    return missing


def get_batches(missing_keys: dict, batch_size: int = 50) -> list:
    """Split missing keys into batches."""
    items = list(missing_keys.items())
    batches = []
    for i in range(0, len(items), batch_size):
        batch = dict(items[i : i + batch_size])
        batches.append(batch)
    return batches


def main():
    print("=" * 70)
    print("i18n Batch Translation Orchestrator")
    print("=" * 70)
    print()

    source_file = LOCALES_DIR / f"{SOURCE_LANG}.json"

    if not source_file.exists():
        print(f"❌ Source file not found: {source_file}")
        sys.exit(1)

    # Process each target language
    for lang in TARGET_LANGS:
        target_file = LOCALES_DIR / f"{lang}.json"

        print(f"\n🌐 Processing {lang}...")
        print("-" * 70)

        missing = find_missing_keys(source_file, target_file)

        if not missing:
            print(f"  ✅ All keys present")
            continue

        print(f"  📝 Found {len(missing)} missing keys")

        batches = get_batches(missing, BATCH_SIZE)
        print(f"  📦 Split into {len(batches)} batches (max {BATCH_SIZE} per batch)")
        print()

        # Save batch info for subagent
        batch_info = {"lang": lang, "total_missing": len(missing), "batches": batches}

        batch_file = Path(f"/tmp/i18n_batch_{lang}.json")
        with open(batch_file, "w", encoding="utf-8") as f:
            json.dump(batch_info, f, ensure_ascii=False, indent=2)

        print(f"  📄 Batch info saved to: {batch_file}")
        print(
            f"  👉 Run subagent with: python scripts/translate_batch.py --batch-file {batch_file}"
        )
        print()

    print("=" * 70)
    print("Batch preparation complete!")
    print("=" * 70)
    print()
    print("Next steps:")
    print("1. Run subagent for each language:")
    for lang in TARGET_LANGS:
        print(f"   python scripts/translate_batch.py --lang {lang}")
    print()
    print("2. Or run the orchestrated translation:")
    print("   python scripts/translate_all.py")


if __name__ == "__main__":
    main()
