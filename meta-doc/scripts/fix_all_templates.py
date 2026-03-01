#!/usr/bin/env python3
"""
修复所有模板 content 翻译
"""

import json
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
TEMPLATES_DIR = Path("src/renderer/src/templates")

# 定义需要修复的模板翻译
# 格式: (key_path, {lang: content})
template_fixes = [
    # Markdown article
    (
        "newDocument.templates.markdown.article.content",
        {
            "en_us": "# Title\n\n## Abstract\n\nWrite your abstract content here.\n\n## Main Content\n\n- Key point one\n- Key point two\n\n## Conclusion\n\nWrite your conclusion content here.\n",
            "ja_JP": "# タイトル\n\n## 要約\n\nここに要約を記述してください。\n\n## 本文\n\n- ポイント1\n- ポイント2\n\n## 結論\n\nここに結論を記述してください。\n",
            "ko_KR": "# 제목\n\n## 요약\n\n여기에 요약 내용을 작성하세요.\n\n## 본문\n\n- 핵심 포인트 1\n- 핵심 포인트 2\n\n## 결론\n\n여기에 결론을 작성하세요.\n",
            "de_DE": "# Titel\n\n## Zusammenfassung\n\nHier die Zusammenfassung verfassen.\n\n## Hauptteil\n\n- Hauptpunkt eins\n- Hauptpunkt zwei\n\n## Schlussfolgerung\n\nHier die Schlussfolgerung verfassen.\n",
            "fr_FR": "# Titre\n\n## Résumé\n\nRédigez votre résumé ici.\n\n## Contenu principal\n\n- Point clé un\n- Point clé deux\n\n## Conclusion\n\nRédigez votre conclusion ici.\n",
        },
    ),
]


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


def get_template_path(lang, format_id, filename):
    """获取模板文件路径"""
    return TEMPLATES_DIR / lang / format_id / filename


def update_template_file(lang, format_id, filename, content):
    """更新模板文件"""
    file_path = get_template_path(lang, format_id, filename)
    if file_path.exists():
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False


def main():
    print("=" * 70)
    print("修复所有模板 content 翻译")
    print("=" * 70)

    for key_path, translations in template_fixes:
        print(f"\n📝 {key_path}")
        for lang, content in translations.items():
            # 更新语言文件
            file_path = LOCALES_DIR / f"{lang}.json"
            if file_path.exists():
                update_key_in_json(file_path, key_path, content)
                print(f"  ✅ {lang}: JSON 已更新")
            else:
                print(f"  ❌ {lang}: JSON 文件不存在")

    print("\n" + "=" * 70)
    print("✅ JSON 文件修复完成!")
    print("=" * 70)


if __name__ == "__main__":
    main()
