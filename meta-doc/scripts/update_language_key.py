#!/usr/bin/env python3
"""
CLI tool to safely update a single i18n key in a language file.
Outputs context information for verification.

Usage:
    python update_language_key.py --lang en_us --key "fontDebugPanel.title" --value "Font Debug Panel"
"""

import argparse
import json
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")


def flatten_json(data: dict, parent_key: str = "", sep: str = ".") -> dict:
    """Flatten nested JSON into dot-notation keys."""
    items = []
    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key
        if isinstance(value, dict):
            items.extend(flatten_json(value, new_key, sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def unflatten_json(data: dict, sep: str = ".") -> dict:
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


def get_context_keys(flat_data: dict, target_key: str, context_size: int = 3) -> list:
    """Get neighboring keys for context."""
    keys = list(flat_data.keys())
    if target_key not in keys:
        return []

    idx = keys.index(target_key)
    start = max(0, idx - context_size)
    end = min(len(keys), idx + context_size + 1)

    return [(k, flat_data[k]) for k in keys[start:end] if k != target_key]


def update_key(lang: str, key: str, value: str) -> dict:
    """
    Update a single key in the language file.

    Returns:
        dict with status, previous_value, and context
    """
    file_path = LOCALES_DIR / f"{lang}.json"

    if not file_path.exists():
        return {"success": False, "error": f"File not found: {file_path}"}

    # Load current data
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    flat_data = flatten_json(data)

    # Get previous value
    previous_value = flat_data.get(key, None)

    # Update the key
    flat_data[key] = value

    # Unflatten and save
    new_data = unflatten_json(flat_data)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    # Get context
    context = get_context_keys(flat_data, key, context_size=2)

    return {
        "success": True,
        "lang": lang,
        "key": key,
        "previous_value": previous_value,
        "new_value": value,
        "context": context,
        "status": "UPDATED" if previous_value is None else "MODIFIED",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Safely update a single i18n key in a language file"
    )
    parser.add_argument(
        "--lang", required=True, help="Language code (e.g., en_us, de_DE)"
    )
    parser.add_argument(
        "--key", required=True, help="Dot-notation key (e.g., fontDebugPanel.title)"
    )
    parser.add_argument("--value", required=True, help="Translation value")

    args = parser.parse_args()

    result = update_key(args.lang, args.key, args.value)

    if not result["success"]:
        print(f"❌ ERROR: {result['error']}", file=sys.stderr)
        sys.exit(1)

    # Output result in a structured format
    print("=" * 60)
    print(f"✅ {result['status']}")
    print("=" * 60)
    print(f"Language: {result['lang']}")
    print(f"Key: {result['key']}")
    print(
        f"Previous: {result['previous_value'] if result['previous_value'] else '(null)'}"
    )
    print(f"New: {result['new_value']}")
    print()
    print("Context (neighboring keys):")
    print("-" * 60)
    for ctx_key, ctx_value in result["context"]:
        print(
            f"  {ctx_key}: {ctx_value[:60]}..."
            if len(str(ctx_value)) > 60
            else f"  {ctx_key}: {ctx_value}"
        )
    print("=" * 60)

    # Also output JSON for programmatic use
    print()
    print("JSON_OUTPUT:")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
