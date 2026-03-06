#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MetaDoc i18n 键一致性检查脚本（仅报告，不自动翻译）

以 zh_cn.json 为蓝本，检查其他语言 JSON 的键与结构是否与 zh_cn 完全一致。
输出缺失的键及其中文原文，便于由 Agent 或人工补充翻译。

用法:
  python i18n_report_missing.py              # 检查 locales 目录下所有 .json
  python i18n_report_missing.py --json       # 输出 JSON 便于脚本处理
  python i18n_report_missing.py --fix-placeholders  # 输出可粘贴的占位符（键=中文）
"""

import os
import sys
import json
import argparse

# Windows 控制台 UTF-8 输出
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def load_json(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def flatten_json(obj, prefix=""):
    out = {}

    def recurse(t, parent_key):
        if isinstance(t, dict):
            for k, v in t.items():
                recurse(v, parent_key + "." + k if parent_key else k)
        elif isinstance(t, list):
            out[parent_key] = json.dumps(t, ensure_ascii=False)
        else:
            out[parent_key] = t

    recurse(obj, prefix)
    return out


def find_missing_keys(base_flat, compare_flat):
    base_keys = set(base_flat.keys())
    compare_keys = set(compare_flat.keys())
    return sorted(base_keys - compare_keys)


def find_extra_keys(base_flat, compare_flat):
    base_keys = set(base_flat.keys())
    compare_keys = set(compare_flat.keys())
    return sorted(compare_keys - base_keys)


def get_base_filename(ui_dir):
    """基准文件：优先 zh_cn.json，否则 zh_CN.json（兼容旧命名）"""
    for name in ("zh_cn.json", "zh_CN.json"):
        if os.path.isfile(os.path.join(ui_dir, name)):
            return name
    return None


def run_check(locales_dir, output_json=False, fix_placeholders=False):
    base_file = get_base_filename(locales_dir)
    if not base_file:
        print("WARN: base file zh_cn.json not found")
        return False

    base_path = os.path.join(locales_dir, base_file)
    base_data = load_json(base_path)
    flat_base = flatten_json(base_data)

    all_other = [
        f
        for f in os.listdir(locales_dir)
        if f.endswith(".json") and f != base_file and not f.startswith(".")
    ]

    report = {"base": base_file, "locales_dir": locales_dir, "locales": {}}

    for f in sorted(all_other):
        filepath = os.path.join(locales_dir, f)
        try:
            compare_data = load_json(filepath)
        except Exception as e:
            report["locales"][f] = {"error": str(e)}
            continue
        flat_compare = flatten_json(compare_data)
        missing = find_missing_keys(flat_base, flat_compare)
        extra = find_extra_keys(flat_base, flat_compare)
        report["locales"][f] = {
            "missing_keys": missing,
            "missing_with_zh": [(k, flat_base.get(k, "")) for k in missing],
            "extra_keys": extra,
        }

    if output_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return report

    # 文本报告
    print("=" * 60)
    print("MetaDoc i18n 键一致性检查（基准: %s）" % base_file)
    print("=" * 60)

    has_any_missing = False
    for locale_file, data in report["locales"].items():
        if "error" in data:
            print("\n[ERR] %s: %s" % (locale_file, data["error"]))
            continue
        missing = data["missing_keys"]
        extra = data["extra_keys"]
        if not missing and not extra:
            print("\n[OK] %s: keys match base" % locale_file)
            continue
        if missing:
            has_any_missing = True
            print("\n[WARN] %s: missing %d keys" % (locale_file, len(missing)))
            for key, zh_val in data["missing_with_zh"]:
                if fix_placeholders:
                    print("  %s = %s" % (key, zh_val))
                else:
                    # 截断过长的值便于阅读
                    display = (zh_val[:60] + "…") if len(str(zh_val)) > 60 else zh_val
                    print("  - %s" % key)
                    print("    zh: %s" % display)
        if extra:
            print("  多余键（基准中不存在）: %d 个" % len(extra))
            for k in extra[:20]:
                print("    + %s" % k)
            if len(extra) > 20:
                print("    ... 共 %d 个" % len(extra))

    print("\n" + "=" * 60)
    if has_any_missing:
        print("Add missing keys in each locale JSON (agent can translate from zh).")
    else:
        print("All locale files match base keys.")
    print("=" * 60)
    return report


def main():
    ap = argparse.ArgumentParser(description="MetaDoc i18n 键检查（仅报告）")
    ap.add_argument(
        "--json",
        action="store_true",
        help="输出 JSON 报告",
    )
    ap.add_argument(
        "--fix-placeholders",
        action="store_true",
        help="输出 键=中文 便于粘贴占位",
    )
    ap.add_argument(
        "--dir",
        default=None,
        help="locales 目录路径（默认本脚本所在目录）",
    )
    args = ap.parse_args()
    locales_dir = os.path.abspath(args.dir or os.path.dirname(__file__))
    run_check(locales_dir, output_json=args.json, fix_placeholders=args.fix_placeholders)


if __name__ == "__main__":
    main()
