#!/usr/bin/env python3
"""
修复模板 content 翻译 - 直接更新各语言文件
"""

import json
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")


# 中文原始内容（从 zh_cn.json 读取）
def get_zh_content(key_path):
    with open(LOCALES_DIR / "zh_cn.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    keys = key_path.split(".")
    current = data
    for key in keys:
        current = current.get(key, {})
    return current if isinstance(current, str) else None


# 翻译映射：key_path -> {lang: translated_value}
template_translations = {
    "newDocument.templates.markdown.article.content": {
        "en_us": "# Title\n\n## Abstract\n\nWrite your abstract content here.\n\n## Main Content\n\n- Key point one\n- Key point two\n\n## Conclusion\n\nWrite your conclusion content here.\n",
        "ja_JP": "# タイトル\n\n## 要約\n\nここに要約を記述してください。\n\n## 本文\n\n- ポイント1\n- ポイント2\n\n## 結論\n\nここに結論を記述してください。\n",
        "ko_KR": "# 제목\n\n## 요약\n\n여기에 요약 내용을 작성하세요.\n\n## 본문\n\n- 핵심 포인트 1\n- 핵심 포인트 2\n\n## 결론\n\n여기에 결론을 작성하세요.\n",
        "de_DE": "# Titel\n\n## Zusammenfassung\n\nHier die Zusammenfassung verfassen.\n\n## Hauptteil\n\n- Hauptpunkt eins\n- Hauptpunkt zwei\n\n## Schlussfolgerung\n\nHier die Schlussfolgerung verfassen.\n",
        "fr_FR": "# Titre\n\n## Résumé\n\nRédigez votre résumé ici.\n\n## Contenu principal\n\n- Point clé un\n- Point clé deux\n\n## Conclusion\n\nRédigez votre conclusion ici.\n",
    }
}


def update_key_in_json(file_path, key_path, value):
    """更新 JSON 文件中的指定 key"""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    keys = key_path.split(".")
    current = data
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    current[keys[-1]] = value

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return True


def main():
    print("=" * 60)
    print("修复模板 content 翻译")
    print("=" * 60)

    # 获取中文原始内容
    zh_content = get_zh_content("newDocument.templates.markdown.article.content")
    print(f"\n中文原文长度: {len(zh_content) if zh_content else 0} 字符")

    # 为每种语言更新
    for key_path, translations in template_translations.items():
        print(f"\n📝 更新: {key_path}")
        for lang, value in translations.items():
            file_path = LOCALES_DIR / f"{lang}.json"
            if file_path.exists():
                update_key_in_json(file_path, key_path, value)
                print(f"  ✅ {lang}: 已更新 ({len(value)} 字符)")
            else:
                print(f"  ❌ {lang}: 文件不存在")

    print("\n" + "=" * 60)
    print("✅ 完成!")
    print("=" * 60)


if __name__ == "__main__":
    main()
