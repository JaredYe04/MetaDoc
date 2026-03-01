#!/usr/bin/env python3
"""
Translation executor for a single batch.
Called by subagent to translate a batch of keys using CLI tool.

Usage:
    python translate_batch.py --lang en_us [--dry-run]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
CLI_TOOL = Path("scripts/update_language_key.py")


def load_batch_info(lang: str):
    """Load batch information for a language."""
    batch_file = Path(f"/tmp/i18n_batch_{lang}.json")
    if not batch_file.exists():
        return None

    with open(batch_file, "r", encoding="utf-8") as f:
        return json.load(f)


def translate_with_llm(chinese_text: str, lang_code: str) -> str:
    """
    Translate Chinese text to target language.
    This function simulates LLM translation - replace with actual LLM call.
    """
    lang_names = {
        "en_us": "English",
        "de_DE": "German",
        "fr_FR": "French",
        "ja_JP": "Japanese",
        "ko_KR": "Korean",
    }

    lang_name = lang_names.get(lang_code, lang_code)

    # TODO: Replace with actual LLM API call
    # For demonstration, return a placeholder
    return f"[{lang_name}] {chinese_text}"


def process_batch(lang: str, batch: dict, dry_run: bool = False):
    """Process a single batch of translations."""
    results = []

    for key, chinese_text in batch.items():
        # Translate
        translation = translate_with_llm(chinese_text, lang)

        if dry_run:
            print(f"  [DRY RUN] {key}: {chinese_text} → {translation}")
            results.append(
                {
                    "key": key,
                    "source": chinese_text,
                    "translation": translation,
                    "status": "dry_run",
                }
            )
        else:
            # Call CLI tool
            cmd = [
                "python",
                str(CLI_TOOL),
                "--lang",
                lang,
                "--key",
                key,
                "--value",
                translation,
            ]

            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                print(f"  ✅ {key}")
                results.append(
                    {"key": key, "status": "success", "output": result.stdout}
                )
            except subprocess.CalledProcessError as e:
                print(f"  ❌ {key}: {e.stderr}")
                results.append({"key": key, "status": "error", "error": e.stderr})

    return results


def main():
    parser = argparse.ArgumentParser(description="Translate a batch of i18n keys")
    parser.add_argument("--lang", required=True, help="Target language code")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    args = parser.parse_args()

    print(f"🌐 Processing language: {args.lang}")
    print("-" * 70)

    # Load batch info
    batch_info = load_batch_info(args.lang)
    if not batch_info:
        print(f"❌ No batch info found for {args.lang}")
        print("Run: python scripts/i18n_batch_translate.py first")
        sys.exit(1)

    total_missing = batch_info["total_missing"]
    batches = batch_info["batches"]

    print(f"Total missing keys: {total_missing}")
    print(f"Number of batches: {len(batches)}")
    print()

    # Process each batch
    all_results = []
    for i, batch in enumerate(batches, 1):
        print(f"📦 Processing batch {i}/{len(batches)} ({len(batch)} keys)...")
        results = process_batch(args.lang, batch, args.dry_run)
        all_results.extend(results)
        print()

    # Summary
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    success_count = sum(1 for r in all_results if r["status"] in ["success", "dry_run"])
    error_count = sum(1 for r in all_results if r["status"] == "error")

    print(f"Total processed: {len(all_results)}")
    print(f"Successful: {success_count}")
    if error_count > 0:
        print(f"Errors: {error_count}")

    if not args.dry_run:
        print()
        print("✅ Translation batch complete!")


if __name__ == "__main__":
    main()
