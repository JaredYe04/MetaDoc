import os
import json
import re
import argostranslate.package
import argostranslate.translate

# 初始化语言环境（仅需执行一次，之后会自动识别已安装语言）
installed_languages = argostranslate.translate.get_installed_languages()
print("已安装的语言：", [lang.code for lang in installed_languages])
def translate_text(text, source_lang='zh', target_lang='ja'):
    try:
        from_lang = next((l for l in installed_languages if l.code == source_lang), None)
        to_lang = next((l for l in installed_languages if l.code == target_lang), None)

        if from_lang and to_lang:
            # 如果支持直接翻译
            direct = from_lang.get_translation(to_lang)
            return direct.translate(text)

        # 尝试中转翻译 zh -> en -> target
        zh = next((l for l in installed_languages if l.code == 'zh'), None)
        en = next((l for l in installed_languages if l.code == 'en'), None)
        pivot_target = next((l for l in installed_languages if l.code == target_lang), None)

        if zh and en and pivot_target:
            zh_to_en = zh.get_translation(en)
            en_text = zh_to_en.translate(text)

            en_to_target = en.get_translation(pivot_target)
            final_text = en_to_target.translate(en_text)

            return final_text

        print(f"❌ 无法完成从 {source_lang} 到 {target_lang} 的翻译")
        return ""

    except Exception as e:
        print(f"❌ 翻译失败：{e}")
        return ""


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def flatten_json(y, prefix=''):
    out = {}
    def recurse(t, parent_key):
        if isinstance(t, dict):
            for k, v in t.items():
                recurse(v, parent_key + '.' + k if parent_key else k)
        else:
            out[parent_key] = t
    recurse(y, prefix)
    return out

def unflatten_json(flat_dict):
    result = {}
    for key, value in flat_dict.items():
        keys = key.split('.')
        d = result
        for part in keys[:-1]:
            d = d.setdefault(part, {})
        d[keys[-1]] = value
    return result

def find_missing_keys(base_dict, compare_dict):
    base_keys = set(base_dict.keys())
    compare_keys = set(compare_dict.keys())
    missing = base_keys - compare_keys
    return sorted(missing)

def extract_lang_code(filename):
    match = re.match(r'([a-z]{2})[_\-]', filename, re.IGNORECASE)
    return match.group(1).lower() if match else 'en'

def main():
    print("🌍 MetaDoc i18n 校对 + 补全工具（使用 Argos Translate）\n")
    base_file = 'zh_CN.json'
    current_dir = os.path.dirname(os.path.abspath(__file__))
    files = [f for f in os.listdir(current_dir) if f.endswith('.json') and f != base_file]

    print(f"📖 以 {base_file} 为基准，校对以下文件：")
    for f in files:
        print(f"  - {f}")
    print()

    base_data = load_json(os.path.join(current_dir, base_file))
    flat_base = flatten_json(base_data)

    for f in files:
        filepath = os.path.join(current_dir, f)
        target_lang = extract_lang_code(f)

        print(f"\n🔍 正在校对 {f} (语言代码: {target_lang}) ...")
        compare_data = load_json(filepath)
        flat_compare = flatten_json(compare_data)
        updated = flat_compare.copy()

        missing_keys = find_missing_keys(flat_base, flat_compare)
        if not missing_keys:
            print("✅ 无缺失键")
            continue

        print(f"⚠️ 缺失 {len(missing_keys)} 个键，开始翻译并补全：")
        error_flag = False
        for key in missing_keys:
            zh_text = flat_base[key]
            translated = translate_text(zh_text, source_lang='zh', target_lang=target_lang)
            print(f"  - {key}\n    zh: {zh_text}\n    {target_lang}: {translated}\n")
            if translated == '':
                error_flag = True
                continue
            updated[key] = translated
        confirm = 'y'
        if error_flag:#如果有翻译错误，询问是否继续
            confirm = input(f"有翻译错误，是否保存 {f} 的更改？(y/n): ").strip().lower()
        
        if confirm != 'y':
            print("🚫 放弃保存更改")
            continue

        full_data = unflatten_json(updated)
        save_json(filepath, full_data)
        print(f"💾 已补全并保存：{f}")

if __name__ == '__main__':
    main()
