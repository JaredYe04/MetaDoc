#!/usr/bin/env python3
"""
i18n Auto-Translation Script
Reads zh_CN.json and translates missing keys to all target languages using LLM.
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any

# Configuration
LOCALES_DIR = Path("src/renderer/src/locales")
SOURCE_LANG = "zh_cn.json"
TARGET_LANGS = ["en_us.json", "de_DE.json", "fr_FR.json", "ja_JP.json", "ko_KR.json"]


def flatten_json(
    data: Dict[str, Any], parent_key: str = "", sep: str = "."
) -> Dict[str, str]:
    """Flatten nested JSON into dot-notation keys."""
    items = []
    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key
        if isinstance(value, dict):
            items.extend(flatten_json(value, new_key, sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def unflatten_json(data: Dict[str, str], sep: str = ".") -> Dict[str, Any]:
    """Convert flat dot-notation keys back to nested JSON."""
    result = {}
    for key, value in data.items():
        parts = key.split(sep)
        current = result
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    return result


def find_missing_keys(source: Dict[str, str], target: Dict[str, str]) -> Dict[str, str]:
    """Find keys present in source but missing in target."""
    return {k: source[k] for k in source if k not in target}


def translate_text(text: str, target_lang: str) -> str:
    """
    Translate Chinese text to target language using LLM.
    This is a placeholder - in actual use, this would call an LLM API.
    """
    # Language code to name mapping
    lang_names = {
        "en_us": "English",
        "de_DE": "German",
        "fr_FR": "French",
        "ja_JP": "Japanese",
        "ko_KR": "Korean",
    }

    lang_name = lang_names.get(target_lang, target_lang)

    # TODO: Replace with actual LLM API call
    # For now, return a placeholder that clearly indicates translation is needed
    return f"[TRANSLATE_TO_{lang_name.upper()}]: {text}"


def process_language(
    source_flat: Dict[str, str], target_file: Path
) -> tuple[bool, int]:
    """
    Process a target language file:
    - Find missing keys
    - Translate them
    - Update the file

    Returns: (success, number_of_translations)
    """
    try:
        with open(target_file, "r", encoding="utf-8") as f:
            target_data = json.load(f)
    except FileNotFoundError:
        print(f"  ❌ File not found: {target_file}")
        return False, 0
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON decode error in {target_file}: {e}")
        return False, 0

    target_flat = flatten_json(target_data)
    missing = find_missing_keys(source_flat, target_flat)

    if not missing:
        print(f"  ✅ All keys present")
        return True, 0

    print(f"  📝 Found {len(missing)} missing keys")

    # Translate missing keys
    translated = 0
    for key, chinese_text in missing.items():
        lang_code = target_file.stem
        translation = translate_text(chinese_text, lang_code)
        target_flat[key] = translation
        translated += 1

        if translated <= 5:  # Show first 5
            print(f"     {key}: {chinese_text} → {translation[:50]}...")

    # Unflatten and save
    target_data = unflatten_json(target_flat)
    with open(target_file, "w", encoding="utf-8") as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)

    return True, translated


def main():
    """Main entry point."""
    print("=" * 60)
    print("i18n Auto-Translation Tool")
    print("=" * 60)

    # Load source language
    source_file = LOCALES_DIR / SOURCE_LANG
    if not source_file.exists():
        print(f"❌ Source file not found: {source_file}")
        sys.exit(1)

    with open(source_file, "r", encoding="utf-8") as f:
        source_data = json.load(f)

    source_flat = flatten_json(source_data)
    print(f"✅ Loaded source: {SOURCE_LANG}")
    print(f"   Total keys: {len(source_flat)}")
    print()

    # Process each target language
    total_translations = 0
    for target_lang in TARGET_LANGS:
        target_file = LOCALES_DIR / target_lang
        print(f"🌐 Processing {target_lang}...")

        success, count = process_language(source_flat, target_file)
        if success:
            total_translations += count
        print()

    # Summary
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total translations needed: {total_translations}")
    print()
    print("Note: This script uses placeholder translations.")
    print("Replace translate_text() function with actual LLM API call.")
    print()
    print("To use with LLM, update the translate_text() function to call:")
    print("  - OpenAI API")
    print("  - Claude API")
    print("  - Or other translation service")


if __name__ == "__main__":
    main()
