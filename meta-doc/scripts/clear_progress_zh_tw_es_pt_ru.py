#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从三个 i18n 进度文件中仅移除 zh_TW、es_ES、pt_BR、ru_RU 的条目，其余不动。"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_REMOVE = ("zh_tw.json", "es_ES.json", "pt_BR.json", "ru_RU.json")
PROMPTS_REMOVE = ("zh_TW.json", "es_ES.json", "pt_BR.json", "ru_RU.json")
MANUALS_REMOVE = ("zh_TW", "es_ES", "pt_BR", "ru_RU")


def filter_progress(path, remove_set, col_idx=0):
    if not os.path.isfile(path):
        print("Skip (not found):", path)
        return 0
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    kept = []
    removed = 0
    for line in lines:
        line = line.rstrip("\n\r")
        if not line:
            kept.append(line)
            continue
        parts = line.split("\t")
        first = parts[col_idx].strip() if parts else ""
        if first in remove_set:
            removed += 1
        else:
            kept.append(line)
    if removed:
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(kept) + ("\n" if kept and kept[-1] else ""))
        print(path, ": removed", removed, "lines")
    else:
        print(path, ": nothing to remove")
    return removed


def main():
    base = os.path.join(ROOT, "src", "renderer", "src")
    filter_progress(os.path.join(base, "locales", ".i18n_ai_review_progress.txt"), UI_REMOVE)
    filter_progress(
        os.path.join(base, "utils", "locale_prompts", ".locale_prompts_i18n_progress.txt"),
        PROMPTS_REMOVE,
    )
    filter_progress(os.path.join(base, "manuals", ".manual_i18n_progress.txt"), MANUALS_REMOVE)
    print("Done.")


if __name__ == "__main__":
    main()
