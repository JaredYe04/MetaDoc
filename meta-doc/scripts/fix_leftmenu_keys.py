#!/usr/bin/env python3
"""
Add missing leftMenu keys to all language files.
This script copies leftMenu structure from zh_CN to other languages.
"""

import json
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SOURCE_LANG = "zh_cn"
TARGET_LANGS = ["en_us", "de_DE", "fr_FR", "ja_JP", "ko_KR"]


def main():
    # Load source
    with open(LOCALES_DIR / f"{SOURCE_LANG}.json", "r", encoding="utf-8") as f:
        source_data = json.load(f)

    if "leftMenu" not in source_data:
        print("❌ leftMenu not found in source")
        return

    source_leftmenu = source_data["leftMenu"]
    print(f"Source leftMenu has {len(source_leftmenu)} keys")

    # Process each target
    for lang in TARGET_LANGS:
        target_file = LOCALES_DIR / f"{lang}.json"

        with open(target_file, "r", encoding="utf-8") as f:
            target_data = json.load(f)

        if "leftMenu" not in target_data:
            target_data["leftMenu"] = {}

        target_leftmenu = target_data["leftMenu"]

        # Count missing keys
        missing = [k for k in source_leftmenu if k not in target_leftmenu]

        if not missing:
            print(f"✅ {lang}: all keys present")
            continue

        print(f"📝 {lang}: adding {len(missing)} missing keys")

        # Add missing keys with Chinese text as placeholder
        for key in missing:
            target_leftmenu[key] = source_leftmenu[key]

        # Save
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(target_data, f, ensure_ascii=False, indent=2)

        print(f"   Added: {missing[:5]}{'...' if len(missing) > 5 else ''}")

    print("\n✅ Done! Run translation subagents to translate the new keys.")


if __name__ == "__main__":
    main()
