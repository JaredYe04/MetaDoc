#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MetaDoc 一键 i18n：按顺序执行 UI 文案、用户手册、提示词 的补全/翻译，一次命令跑完所有步骤。

依赖：
- 各子脚本所在目录下 .deepseek_api_key 或环境变量 DEEPSEEK_API_KEY（UI、手册、提示词脚本会各自查找）
- Python 3

用法（在 meta-doc 目录下）:
  python scripts/run_i18n_all.py                    # 执行全部：UI + 手册 index zh_TW + 手册 md + 提示词
  python scripts/run_i18n_all.py --dry-run          # 仅打印将要执行的任务，不请求 API、不写回
  python scripts/run_i18n_all.py --locale zh_TW     # 只处理指定语言（传给 UI / 手册 / 提示词）
  python scripts/run_i18n_all.py --reset-progress   # 各脚本全量重跑（传 --reset-progress 给支持的脚本）
  python scripts/run_i18n_all.py --review-ui        # 执行 UI 校对
  python scripts/run_i18n_all.py --skip-manuals     # 跳过手册（index + md 翻译）
  python scripts/run_i18n_all.py --skip-prompts     # 跳过提示词
  python scripts/run_i18n_all.py --max-workers 4     # 并发数（传给 UI 与提示词）
"""

import os
import sys
import subprocess
import argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES_DIR = os.path.join(ROOT, "src", "renderer", "src", "locales")
MANUALS_DIR = os.path.join(ROOT, "src", "renderer", "src", "manuals")
PROMPTS_DIR = os.path.join(ROOT, "src", "renderer", "src", "utils", "locale_prompts")


def run(cmd, cwd=None, dry_run=False):
    if dry_run:
        print("[dry-run] %s" % " ".join(cmd))
        return 0
    print("\n>>> %s\n" % " ".join(cmd))
    ret = subprocess.run(cmd, cwd=cwd or ROOT)
    return ret.returncode


def main():
    ap = argparse.ArgumentParser(description="MetaDoc 一键 i18n：UI + 手册 + 提示词")
    ap.add_argument("--dry-run", action="store_true", help="只打印命令，不执行、不写回")
    ap.add_argument("--locale", default=None, help="只处理该语言，如 zh_TW、en_us")
    ap.add_argument("--reset-progress", action="store_true", help="各脚本全量重跑（传 --reset-progress）")
    #ap.add_argument("--review-ui", action="store_true", help="执行 UI 文案校对")
    ap.add_argument("--skip-manuals", action="store_true", help="跳过用户手册（index + md）")
    ap.add_argument("--skip-prompts", action="store_true", help="跳过提示词")
    ap.add_argument("--max-workers", type=int, default=5, help="并发数（默认 5）")
    ap.add_argument("--no-manuals-index", action="store_true", help="不执行 manuals index 补全多语言键")
    ap.add_argument("--no-manuals-index-translate", action="store_true", help="不执行手册 index 标题翻译（不调 API）")
    args = ap.parse_args()

    steps = []

    # 0. 手册 index 补全多语言 title 键（zh_TW, es_ES 等，仅写 JSON，不调 API）
    if not args.skip_manuals and not args.no_manuals_index:
        steps.append(("manuals index (locales)", [sys.executable, os.path.join(ROOT, "scripts", "manuals_index_add_locales.py")] + (["--dry-run"] if args.dry_run else [])))

    # 0.5. 手册 index 标题翻译（与 zh_CN 相同的条目译为目标语言，调 API）
    if not args.skip_manuals and not args.no_manuals_index_translate:
        tit_cmd = [sys.executable, os.path.join(ROOT, "scripts", "manuals_index_translate_titles.py")]
        if args.locale:
            tit_cmd += ["--locale", args.locale]
        if args.dry_run:
            tit_cmd += ["--dry-run"]
        steps.append(("manuals index (translate titles)", tit_cmd))

    # 1. UI 文案校对（locales）
    # if not args.review_ui:
    #     ui_cmd = [sys.executable, os.path.join(LOCALES_DIR, "i18n_ai_review.py"), "--max-workers", "50"]
    #     if args.locale:
    #         ui_cmd += ["--locale", args.locale]
    #     if args.reset_progress:
    #         ui_cmd += ["--reset-progress"]
    #     if args.dry_run:
    #         ui_cmd += ["--dry-run"]
    #     steps.append(("UI locales", ui_cmd))

    # 2. 用户手册 .md 翻译
    if not args.skip_manuals:
        man_cmd = [sys.executable, os.path.join(MANUALS_DIR, "manual_i18n_translate.py"), "--max-workers", "50"]
        if args.locale:
            man_cmd += ["--locale", args.locale]
        if args.reset_progress:
            man_cmd += ["--reset-progress"]
        if args.dry_run:
            man_cmd += ["--dry-run"]
        steps.append(("manuals .md", man_cmd))

    # 3. 提示词 locale_prompts
    if not args.skip_prompts:
        pr_cmd = [sys.executable, os.path.join(PROMPTS_DIR, "locale_prompts_i18n_review.py"), "--max-workers", "50"]
        if args.locale:
            pr_cmd += ["--locale", args.locale]
        if args.reset_progress:
            pr_cmd += ["--reset-progress"]
        if args.dry_run:
            pr_cmd += ["--dry-run"]
        steps.append(("locale_prompts", pr_cmd))

    for name, cmd in steps:
        print("\n" + "=" * 60)
        print("Step: %s" % name)
        print("=" * 60)
        code = run(cmd, cwd=ROOT, dry_run=args.dry_run)
        if code != 0 and not args.dry_run:
            print("FAILED: %s (exit %d)" % (name, code))
            return code

    print("\n" + "=" * 60)
    print("Done. All i18n steps completed.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
