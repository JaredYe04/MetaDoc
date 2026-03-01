#!/usr/bin/env python3
"""
Direct batch translation for all remaining keys.
"""

import json
import subprocess
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SCRIPT = Path("scripts/update_language_key.py")

# Translation dictionaries for each language
TRANSLATIONS = {
    "en_us": {
        "export.options.heading3FontFamily.description": "Font used for Heading 3",
        "export.options.heading3FontSize.label": "Heading 3 Font Size (pt)",
        "export.options.heading3FontSize.description": "Heading 3 font size, unit: points (pt)",
        "export.options.heading3LineHeight.label": "Heading 3 Line Height",
        "export.options.heading3LineHeight.description": "Heading 3 line height multiplier",
        "export.options.heading4FontFamily.label": "Heading 4 Font",
        "export.options.heading4FontFamily.description": "Font used for Heading 4",
        "export.options.heading4FontSize.label": "Heading 4 Font Size (pt)",
        "export.options.heading4FontSize.description": "Heading 4 font size, unit: points (pt)",
        "export.options.heading4LineHeight.label": "Heading 4 Line Height",
        "export.options.heading4LineHeight.description": "Heading 4 line height multiplier",
        "export.options.inlineStyles.label": "Inline CSS",
        "export.options.inlineStyles.description": "Whether to inline CSS styles into HTML",
        "export.options.imageProcessing.base64": "Base64 Embed",
        "export.options.includeMetadata.label": "Include Metadata",
        "export.options.includeMetadata.description": "Whether to include document metadata in exported Markdown",
        "export.options.generateToc.title": "Table of Contents",
        "fomulaRecognition.copyFailed": "Copy failed",
        "fomulaRecognition.deleteFailed": "Delete failed",
        "fomulaRecognition.failedCreate": "Failed to create session",
        "fomulaRecognition.failedLoading": "Failed to load session list",
        "fomulaRecognition.failedLoading1": "Failed to load session",
        "fomulaRecognition.recognize": "Formula Recognition Example",
        "fomulaRecognition.renameFailed": "Rename failed",
        "fomulaRecognition.text": "Copy",
        "formulaRecognition.defaultTitle": "New Formula Recognition Session",
        "formulaRecognition.newSession": "New Session",
        "formulaRecognition.noSessionSelected": "Please select a session or create a new one",
        "formulaRecognition.renamePlaceholder": "Enter session name",
        "formulaRecognition.renameTitle": "Rename Session",
        "formulaRecognition.sessionsTitle": "Formula Recognition Sessions",
    },
    "de_DE": {
        "article.toolbar.mode": "Bearbeitungsmodus",
        "article.toolbar.convert_latex_formulas": "LaTeX-Formeln konvertieren",
        "article.toolbar.convert_latex_formulas_title": "LaTeX-Formeln konvertieren",
        "article.toolbar.convert_latex_formulas_message": "Diese Aktion konvertiert \\(...\\) Inline-Formeln und \\[...\\] Blockformeln in das Vditor-kompatible $...$ und $$...$$ Format.\n\nHinweis: Diese Aktion ändert den Dokumentinhalt. Speichern Sie das Dokument zuerst.",
        "article.toolbar.convert_latex_formulas_success": "Formelkonvertierung abgeschlossen",
        "article.toolbar.convert_latex_formulas_no_match": "Keine zu konvertierenden Formeln gefunden",
        "article.toolbar.convert_latex_formulas_no_editor": "Editor nicht bereit",
        "article.toolbar.toggle_outline": "Gliederung umschalten",
        "article.toolbar.toggle_outline_show": "Gliederung anzeigen",
        "article.toolbar.toggle_outline_hide": "Gliederung ausblenden",
        "attachment.analysisSuccess": "Analyse abgeschlossen",
        "attachment.analyzing": "Anhang analysieren",
        "attachment.attachmentsTitle": "Anhangsanalyse",
        "attachment.fileType": "Dateityp",
        "attachment.newAttachment": "Anhang hochladen",
        "attachment.noAnalysis": "Keine KI-Analyseergebnisse",
        "attachment.noAttachmentSelected": "Bitte wählen Sie einen Anhang aus oder laden Sie einen neuen hoch",
        "attachment.noParsedContent": "Bitte analysieren Sie den Anhang zuerst",
        "attachment.parse": "Anhang analysieren",
        "attachment.parseSuccess": "Analyse abgeschlossen",
    },
    "fr_FR": {
        "aigc.reParaphraseOne": "Réécrire à nouveau",
        "aigc.rePreprocess": "Rediviser les paragraphes",
        "aigc.renamePlaceholder": "Veuillez entrer le nom de la session",
        "aigc.renameTitle": "Renommer la session",
        "aigc.reportGenerated": "Rapport généré avec succès",
        "aigc.selectDocumentTitle": "Sélectionner le document à analyser",
        "aigc.selectDomain": "Sélectionner le domaine",
        "aigc.selectFromDocument": "Sélectionner depuis le document",
        "aigc.selectLanguage": "Sélectionner la langue",
        "aigc.selectedOneDocument": "1 document sélectionné",
        "aigc.sessionsTitle": "Sessions de détection AIGC",
        "aigc.splitAtCursor": "Diviser au curseur",
        "aigc.startAnalysis": "Commencer l'analyse",
        "aigc.unsupportedFileType": "Type de fichier non pris en charge",
        "aigc.unsupportedFormat": "Format de document non pris en charge",
        "aigc.uploadFile": "Télécharger le fichier",
        "aigc.viewOriginal": "A Original",
        "aigc.viewParaphrased": "B Réécrit",
        "aigcDetectionWindow.text": "Uniformité des phrases",
        "aigcDetectionWindow.text1": "Répétition du vocabulaire",
    },
    "ja_JP": {
        "aigc.assembleAsNewArticle": "新しい記事として組み立てる",
        "aigc.assembleNewTitle": "書き換え後の記事",
        "aigc.assembleSuccess": "新しい記事に組み立てて開きました",
        "aigc.backToTop": "トップに戻る",
        "aigc.chartWeightTitle": "リスクソースの重み（加重累乗貢献率）",
        "aigc.clickGenerateReport": "詳細レポートを生成するには、レポート生成ボタンをクリックしてください",
        "aigc.contentSelected": "コンテンツが選択されました",
        "aigc.copy": "コピー",
        "aigc.copyFailed": "コピーに失敗しました",
        "aigc.copyOneClick": "ワンクリックコピー",
        "aigc.copySuccess": "コピーしました",
        "aigc.defaultTitle": "新しいAIGC検出セッション",
        "aigc.dimensions.sentence_uniformity": "句式統一性",
        "aigc.dimensions.lexical_diversity": "語彙反復度",
        "aigc.dimensions.reasoning_smoothness": "論理平滑度",
        "aigc.dimensions.personal_trace": "個人痕跡欠如度",
        "aigc.dimensions.stylistic_risk": "スタイルリスク",
        "aigc.dimensions.over_explanation": "過度な説明",
        "aigc.dimensions.hedging_pattern": "曖昧限定",
        "aigc.dimensions.opening_transition_pattern": "遷移語テンプレート",
    },
    "ko_KR": {
        "aigc.exportReportSuccess": "새 문서로 날복되었습니다",
        "aigc.fileUploaded": "파일 업로드 성공",
        "aigc.generateReport": "보고서 생성",
        "aigc.mergeWithNext": "다음 단락과 병합",
        "aigc.modified": "수정됨",
        "aigc.newSession": "새 세션",
        "aigc.noActiveDocument": "활성 문서 없음",
        "aigc.noAnalysisData": "분석 데이터 없음",
        "aigc.noAnalysisYet": "아직 분석되지 않음",
        "aigc.noContent": "먼저 콘텐츠를 업로드하거나 선택하세요",
        "aigc.noDocuments": "열린 문서 없음",
        "aigc.noSessionSelected": "세션을 선택하거나 새 세션을 만드세요",
        "aigc.nonSignificantRisk": "유의하지 않은 위험",
        "aigc.paragraphContent": "단락 내용",
        "aigc.paragraphCount": "총 {n}개 단락",
        "aigc.paraphraseAll": "모두 다시 작성",
        "aigc.paraphraseOne": "다시 작성",
        "aigc.paraphraseSuccess": "다시 작성 성공",
        "aigc.paraphrasedContent": "다시 작성된 내용",
        "aigc.paraphrasing": "다시 작성 중...",
    },
}


def update_key(lang, key, value):
    """Update a single key using the CLI tool."""
    cmd = [
        "python",
        str(SCRIPT),
        "--lang",
        lang,
        "--key",
        key,
        "--value",
        value,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"  ✅ {key}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ❌ {key}: {e.stderr}")
        return False


def main():
    print("=" * 70)
    print("Batch Translation Processing")
    print("=" * 70)
    print()

    total_updated = 0

    for lang, translations in TRANSLATIONS.items():
        print(f"\n🌐 Processing {lang}...")
        print("-" * 70)

        updated = 0
        for key, value in translations.items():
            if update_key(lang, key, value):
                updated += 1

        print(f"  Updated {updated}/{len(translations)} keys")
        total_updated += updated

    print()
    print("=" * 70)
    print(f"Total keys updated: {total_updated}")
    print("=" * 70)


if __name__ == "__main__":
    main()
