#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MetaDoc i18n 键查询与批量写入（面向 Agent / CI）

大 JSON 无需整文件阅读：按点路径查询、按前缀列举、用补丁 JSON 一次性写入多语言。

用法:
  python i18n_keys.py query proofread.noErrorsFound
  python i18n_keys.py query a.b a.c --json
  python i18n_keys.py prefix proofread --max 80
  python i18n_keys.py prefix proofread --json
  python i18n_keys.py apply patch.json
  python i18n_keys.py apply patch.json --dry-run
  cat patch.json | python i18n_keys.py apply -

补丁 JSON 支持两种结构（可并存，会合并）:
  1) 按语言文件:
     { "en_us.json": { "proofread.noErrorsFound": "No errors found" } }
  2) 按键（便于同一键多语言一起写）:
     { "_byKey": { "proofread.noErrorsFound": { "en_us.json": "...", "ja_JP.json": "..." } } }

默认仅允许写入在 zh_cn 中已存在的点路径（防拼写错误）；新增整条路径时用 --allow-new。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def script_dir() -> str:
    return os.path.abspath(os.path.dirname(__file__))


def get_base_filename(locales_dir: str) -> str | None:
    for name in ("zh_cn.json", "zh_CN.json"):
        if os.path.isfile(os.path.join(locales_dir, name)):
            return name
    return None


def load_json(filepath: str) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def flatten_json(obj, prefix: str = "") -> dict:
    out: dict = {}

    def recurse(t, parent_key: str) -> None:
        if isinstance(t, dict):
            for k, v in t.items():
                recurse(v, parent_key + "." + k if parent_key else k)
        elif isinstance(t, list):
            out[parent_key] = json.dumps(t, ensure_ascii=False)
        else:
            out[parent_key] = t

    recurse(obj, prefix)
    return out


def set_nested(root: dict, parts: list[str], value) -> None:
    cur = root
    for p in parts[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[parts[-1]] = value


def detect_indent(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith('"'):
                m = re.match(r"^([ ]+)", line)
                if m:
                    return m.group(1)
    return "  "


def write_locale_json(filepath: str, data: dict) -> None:
    indent_str = detect_indent(filepath)
    indent_n = len(indent_str) if indent_str else 2
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent_n)
        f.write("\n")


def list_locale_files(locales_dir: str) -> list[str]:
    return sorted(
        f for f in os.listdir(locales_dir) if f.endswith(".json") and not f.startswith(".")
    )


def _patch_value(val):
    """补丁里的值：字符串/数字/bool/null 以及嵌套 dict、list 原样写入 JSON（不转成字符串）。"""
    if isinstance(val, str):
        return val
    if isinstance(val, (dict, list, int, float, bool)) or val is None:
        return val
    return str(val)


def normalize_apply_patch(data: dict) -> dict[str, dict]:
    """返回 { locale_filename: { dot_key: json值 } }。"""
    by_locale: dict[str, dict] = {}
    raw_by_key = data.get("_byKey")
    if isinstance(raw_by_key, dict):
        for dot_key, per_loc in raw_by_key.items():
            if not isinstance(per_loc, dict):
                continue
            for loc, val in per_loc.items():
                if not isinstance(loc, str):
                    continue
                by_locale.setdefault(loc, {})[str(dot_key)] = _patch_value(val)

    for loc, keys in data.items():
        if loc.startswith("_") or loc == "_byKey":
            continue
        if not isinstance(keys, dict):
            continue
        for k, val in keys.items():
            by_locale.setdefault(loc, {})[str(k)] = _patch_value(val)

    return by_locale


def cmd_query(locales_dir: str, keys: list[str], as_json: bool) -> None:
    base_name = get_base_filename(locales_dir)
    if not base_name:
        print("ERROR: zh_cn.json not found", file=sys.stderr)
        sys.exit(1)

    locale_files = list_locale_files(locales_dir)
    flats: dict[str, dict] = {}
    for fn in locale_files:
        path = os.path.join(locales_dir, fn)
        try:
            flats[fn] = flatten_json(load_json(path))
        except Exception as e:
            flats[fn] = {"__error__": str(e)}

    if as_json:
        out = {}
        for key in keys:
            entry = {}
            for fn in locale_files:
                flat = flats[fn]
                if "__error__" in flat:
                    entry[fn] = {"error": flat["__error__"]}
                elif key in flat:
                    entry[fn] = {"exists": True, "value": flat[key]}
                else:
                    entry[fn] = {"exists": False}
            out[key] = entry
        print(json.dumps({"keys": out, "base": base_name}, ensure_ascii=False, indent=2))
        return

    for key in keys:
        print("-" * 60)
        print("key: %s" % key)
        for fn in locale_files:
            flat = flats[fn]
            if "__error__" in flat:
                print("  %-14s  ERR %s" % (fn, flat["__error__"]))
            elif key in flat:
                v = flat[key]
                s = v if isinstance(v, str) else str(v)
                disp = (s[:72] + "…") if len(s) > 72 else s
                print("  %-14s  OK   %s" % (fn, disp))
            else:
                print("  %-14s  — missing" % fn)


def cmd_prefix(locales_dir: str, prefix: str, max_keys: int, as_json: bool) -> None:
    base_name = get_base_filename(locales_dir)
    if not base_name:
        print("ERROR: zh_cn.json not found", file=sys.stderr)
        sys.exit(1)
    base_path = os.path.join(locales_dir, base_name)
    flat = flatten_json(load_json(base_path))
    matched = sorted(k for k in flat if k == prefix or k.startswith(prefix + "."))
    truncated = matched[:max_keys]
    if as_json:
        print(
            json.dumps(
                {
                    "base": base_name,
                    "prefix": prefix,
                    "count": len(matched),
                    "truncated": len(matched) > max_keys,
                    "keys": truncated,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    print("基准: %s | 前缀: %r | 命中: %d 条" % (base_name, prefix, len(matched)))
    if len(matched) > max_keys:
        print("（仅显示前 %d 条，加 --max 或 --json 获取完整列表）" % max_keys)
    for k in truncated:
        print("  ", k)


def cmd_apply(
    locales_dir: str,
    patch_path: str,
    dry_run: bool,
    allow_new: bool,
) -> None:
    base_name = get_base_filename(locales_dir)
    if not base_name:
        print("ERROR: zh_cn.json not found", file=sys.stderr)
        sys.exit(1)

    if patch_path == "-":
        patch_data = json.load(sys.stdin)
    else:
        with open(patch_path, "r", encoding="utf-8") as f:
            patch_data = json.load(f)

    if not isinstance(patch_data, dict):
        print("ERROR: patch 根必须是 JSON object", file=sys.stderr)
        sys.exit(1)

    by_locale = normalize_apply_patch(patch_data)
    if not by_locale:
        print("ERROR: 补丁为空（使用 locale 文件名作为键，或 _byKey）", file=sys.stderr)
        sys.exit(1)

    base_flat = flatten_json(load_json(os.path.join(locales_dir, base_name)))
    locale_files = set(list_locale_files(locales_dir))

    errors: list[str] = []
    for loc, kv in by_locale.items():
        if loc not in locale_files:
            errors.append("未知语言文件: %s（目录内: %s）" % (loc, ", ".join(sorted(locale_files))))

    all_dot_keys = set()
    for kv in by_locale.values():
        all_dot_keys.update(kv.keys())

    if not allow_new:
        bad = sorted(k for k in all_dot_keys if k not in base_flat)
        if bad:
            for k in bad[:30]:
                errors.append("键不在基准 %s 中: %s（使用 --allow-new 可强制新建路径）" % (base_name, k))
            if len(bad) > 30:
                errors.append("... 另有 %d 个非法键" % (len(bad) - 30))

    if errors:
        for e in errors:
            print("ERROR: %s" % e, file=sys.stderr)
        sys.exit(1)

    for loc, kv in sorted(by_locale.items()):
        path = os.path.join(locales_dir, loc)
        data = load_json(path)
        changes = []
        for dot_key, value in kv.items():
            parts = dot_key.split(".")
            # 读取旧值（扁平比较）
            old_flat = flatten_json(data)
            old_v = old_flat.get(dot_key, "__missing__")
            if old_v == value:
                continue
            set_nested(data, parts, value)
            changes.append((dot_key, old_v, value))

        if not changes:
            print("[%s] 无变更" % loc)
            continue

        print("[%s] 将写入 %d 条" % (loc, len(changes)))
        for dk, old_v, new_v in changes:
            old_s = (
                "__missing__"
                if old_v == "__missing__"
                else (str(old_v)[:40] + "…" if len(str(old_v)) > 40 else str(old_v))
            )
            new_str = new_v if isinstance(new_v, str) else json.dumps(new_v, ensure_ascii=False)
            new_s = new_str[:40] + "…" if len(new_str) > 40 else new_str
            print("  %s" % dk)
            print("    <- %s" % old_s)
            print("    -> %s" % new_s)

        if not dry_run:
            write_locale_json(path, data)

    if dry_run:
        print("\n(dry-run，未写入文件)")


def main() -> None:
    ap = argparse.ArgumentParser(description="MetaDoc i18n 键查询 / 前缀列举 / 补丁写入")
    ap.add_argument("--dir", default=None, help="locales 目录（默认本脚本所在目录）")
    sub = ap.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("query", help="查询一个或多个点路径键在各语言是否存在及取值")
    q.add_argument("keys", nargs="+", help="点路径，如 proofread.noErrorsFound")
    q.add_argument("--json", action="store_true", help="输出 JSON 便于 Agent 解析")

    pfx = sub.add_parser("prefix", help="按前缀列举基准语言中的键（默认来自 zh_cn）")
    pfx.add_argument("prefix", help="键前缀，如 proofread、headMenu")
    pfx.add_argument("--max", type=int, default=200, help="最多列出多少条（防刷屏）")
    pfx.add_argument("--json", action="store_true")

    app = sub.add_parser("apply", help="从 JSON 补丁批量写入各语言文件")
    app.add_argument(
        "patch_file",
        help="补丁 JSON 路径，或用 - 从 stdin 读取",
    )
    app.add_argument("--dry-run", action="store_true", help="只打印将发生的变更")
    app.add_argument(
        "--allow-new",
        action="store_true",
        help="允许写入在 zh_cn 中尚不存在的点路径（慎用）",
    )

    args = ap.parse_args()
    locales_dir = os.path.abspath(args.dir or script_dir())
    if args.cmd == "query":
        cmd_query(locales_dir, args.keys, args.json)
    elif args.cmd == "prefix":
        cmd_prefix(locales_dir, args.prefix, args.max, args.json)
    elif args.cmd == "apply":
        cmd_apply(locales_dir, args.patch_file, args.dry_run, args.allow_new)


if __name__ == "__main__":
    main()
