import os
import json
import re
import argostranslate.package
import argostranslate.translate

installed_languages = argostranslate.translate.get_installed_languages()
print("已安装的语言：", [lang.code for lang in installed_languages])

# 占位符和特殊标记的保护机制
def protect_placeholders(text):
    """
    保护文本中的占位符和特殊标记，避免被翻译
    返回：(保护后的文本, 占位符映射字典)
    """
    placeholder_map = {}
    protected_text = text
    
    # 第一步：保护代码块标记 ```xxx```（优先处理，避免其中的占位符被单独处理）
    code_block_pattern = r'```([^`]+)```'
    code_matches = list(re.finditer(code_block_pattern, protected_text))
    for i, match in enumerate(reversed(code_matches)):  # 从后往前处理，避免位置偏移
        full_match = match.group(0)
        temp_code = f"__CODEBLOCK_{i:04d}__"
        placeholder_map[temp_code] = full_match
        start, end = match.span()
        protected_text = protected_text[:start] + temp_code + protected_text[end:]
    
    # 第二步：保护 {xxx} 格式的占位符
    pattern = r'\{[a-zA-Z0-9_]+\}'
    matches = list(re.finditer(pattern, protected_text))
    for i, match in enumerate(reversed(matches)):  # 从后往前处理，避免位置偏移
        placeholder = match.group(0)
        temp_placeholder = f"__PLACEHOLDER_{i:04d}__"
        placeholder_map[temp_placeholder] = placeholder
        start, end = match.span()
        protected_text = protected_text[:start] + temp_placeholder + protected_text[end:]
    
    # 第三步：保护 [CURRENT_POS] 等特殊标记
    special_markers = [
        '[CURRENT_POS]',
        '【文章开始】', '【文章结束】',
        '【检索内容开始】', '【检索内容结束】'
    ]
    for i, marker in enumerate(special_markers):
        if marker in protected_text:
            temp_marker = f"__MARKER_{i:04d}__"
            placeholder_map[temp_marker] = marker
            protected_text = protected_text.replace(marker, temp_marker)
    
    return protected_text, placeholder_map

def restore_placeholders(text, placeholder_map):
    """
    恢复被保护的占位符和特殊标记
    按原始长度倒序恢复，确保长标记先恢复
    """
    restored_text = text
    # 按原始文本长度倒序恢复，避免短占位符被长占位符包含
    sorted_placeholders = sorted(placeholder_map.items(), key=lambda x: len(x[1]), reverse=True)
    for temp_placeholder, original in sorted_placeholders:
        restored_text = restored_text.replace(temp_placeholder, original)
    return restored_text

def translate_text(text, source_lang='zh', target_lang='ja'):
    try:
        # 先保护占位符
        protected_text, placeholder_map = protect_placeholders(text)
        
        from_lang = next((l for l in installed_languages if l.code == source_lang), None)
        to_lang = next((l for l in installed_languages if l.code == target_lang), None)

        if from_lang and to_lang:
            # 如果支持直接翻译
            direct = from_lang.get_translation(to_lang)
            translated = direct.translate(protected_text)
            # 恢复占位符
            return restore_placeholders(translated, placeholder_map)

        # 尝试中转翻译 zh -> en -> target
        zh = next((l for l in installed_languages if l.code == 'zh'), None)
        en = next((l for l in installed_languages if l.code == 'en'), None)
        pivot_target = next((l for l in installed_languages if l.code == target_lang), None)

        if zh and en and pivot_target:
            zh_to_en = zh.get_translation(en)
            en_text = zh_to_en.translate(protected_text)

            en_to_target = en.get_translation(pivot_target)
            final_text = en_to_target.translate(en_text)
            
            # 恢复占位符
            return restore_placeholders(final_text, placeholder_map)

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
        elif isinstance(t, list):
            # 对于数组，将其转换为 JSON 字符串存储
            out[parent_key] = json.dumps(t, ensure_ascii=False)
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
        # 尝试解析 JSON 字符串（如果是数组）
        try:
            if isinstance(value, str) and (value.startswith('[') or value.startswith('{')):
                d[keys[-1]] = json.loads(value)
            else:
                d[keys[-1]] = value
        except (json.JSONDecodeError, TypeError):
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

def process_locale_files(base_file, base_dir, files, file_type='UI'):
    """处理本地化文件（UI 或 Prompt）"""
    base_path = os.path.join(base_dir, base_file)
    if not os.path.exists(base_path):
        print(f"⚠️ 基准文件不存在: {base_path}")
        return
    
    base_data = load_json(base_path)
    flat_base = flatten_json(base_data)

    for f in files:
        filepath = os.path.join(base_dir, f)
        if not os.path.exists(filepath):
            print(f"⚠️ 目标文件不存在: {filepath}，跳过")
            continue
            
        target_lang = extract_lang_code(f)

        print(f"\n🔍 正在校对 {file_type} - {f} (语言代码: {target_lang}) ...")
        compare_data = load_json(filepath)
        flat_compare = flatten_json(compare_data)
        updated = flat_compare.copy()

        missing_keys = find_missing_keys(flat_base, flat_compare)
        if not missing_keys:
            print(f"✅ {file_type} - {f} 无缺失键")
            continue

        print(f"⚠️ {file_type} - {f} 缺失 {len(missing_keys)} 个键，开始翻译并补全：")
        error_flag = False
        for key in missing_keys:
            zh_text = flat_base[key]
            # 如果是 JSON 字符串（数组），需要特殊处理
            try:
                if isinstance(zh_text, str) and (zh_text.startswith('[') or zh_text.startswith('{')):
                    parsed = json.loads(zh_text)
                    if isinstance(parsed, list):
                        # 对于数组，需要翻译数组中的每个对象的文本字段
                        translated_list = []
                        for item in parsed:
                            if isinstance(item, dict):
                                translated_item = {}
                                for k, v in item.items():
                                    if isinstance(v, str):
                                        translated_item[k] = translate_text(v, source_lang='zh', target_lang=target_lang) or v
                                    else:
                                        translated_item[k] = v
                                translated_list.append(translated_item)
                            else:
                                translated_list.append(item)
                        updated[key] = json.dumps(translated_list, ensure_ascii=False)
                        print(f"  - {key}\n    zh: (数组，包含 {len(parsed)} 项)\n    {target_lang}: (已翻译数组)\n")
                        continue
            except (json.JSONDecodeError, TypeError):
                pass
            
            # 普通字符串翻译
            translated = translate_text(zh_text, source_lang='zh', target_lang=target_lang)
            print(f"  - {key}\n    zh: {zh_text}\n    {target_lang}: {translated}\n")
            if translated == '':
                error_flag = True
                continue
            updated[key] = translated
        confirm = 'y'
        if error_flag:#如果有翻译错误，询问是否继续
            confirm = input(f"有翻译错误，是否保存 {file_type} - {f} 的更改？(y/n): ").strip().lower()
        
        if confirm != 'y':
            print("🚫 放弃保存更改")
            continue

        full_data = unflatten_json(updated)
        save_json(filepath, full_data)
        print(f"💾 已补全并保存 {file_type} - {f}")

def main():
    print("🌍 MetaDoc i18n 校对 + 补全工具（使用 Argos Translate）\n")
    
    # ========== 第一步：处理 UI 本地化文件 ==========
    print("=" * 60)
    print("第一步：处理 UI 本地化文件")
    print("=" * 60)
    
    ui_base_file = 'zh_CN.json'
    ui_dir = os.path.dirname(os.path.abspath(__file__))
    ui_files = [f for f in os.listdir(ui_dir) if f.endswith('.json') and f.lower() != ui_base_file.lower() and f != 'i18n_check.py']

    print(f"📖 以 {ui_base_file} 为基准，校对以下 UI 文件：")
    for f in ui_files:
        print(f"  - {f}")
    print()

    if ui_files:
        process_locale_files(ui_base_file, ui_dir, ui_files, 'UI')
    else:
        print("⚠️ 未找到 UI 本地化文件")

    # ========== 第二步：处理 Prompt 本地化文件 ==========
    print("\n" + "=" * 60)
    print("第二步：处理 Prompt 本地化文件")
    print("=" * 60)
    
    prompt_base_file = 'zh_CN.json'
    # 使用绝对路径，从 locales 目录向上找到 utils/locale_prompts
    prompt_dir = os.path.normpath(os.path.join(ui_dir, '..', 'utils', 'locale_prompts'))
    
    if not os.path.exists(prompt_dir):
        print(f"⚠️ Prompt 目录不存在: {prompt_dir}，跳过 Prompt 处理")
        print(f"   当前 UI 目录: {ui_dir}")
        print(f"   尝试的 Prompt 目录: {prompt_dir}")
        return
    
    prompt_files = [f for f in os.listdir(prompt_dir) if f.endswith('.json') and f.lower() != prompt_base_file.lower()]

    print(f"📖 以 {prompt_base_file} 为基准，校对以下 Prompt 文件：")
    for f in prompt_files:
        print(f"  - {f}")
    print()

    if prompt_files:
        process_locale_files(prompt_base_file, prompt_dir, prompt_files, 'Prompt')
    else:
        print("⚠️ 未找到 Prompt 本地化文件")
    
    print("\n" + "=" * 60)
    print("✅ 所有本地化文件处理完成！")
    print("=" * 60)

if __name__ == '__main__':
    main()
