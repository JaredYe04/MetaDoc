#!/usr/bin/env python3
import subprocess
from pathlib import Path

SCRIPT = Path("scripts/update_language_key.py")

TRANSLATIONS = {
    "en_us": {
        "latexEditor.notification.analyzingError": "Analyzing compilation error with AI...",
        "latexEditor.notification.errorAnalysisFailed": "AI error analysis failed",
        "latexEditor.pagesPerRow": "Pages per row",
        "latexEditor.toolbar.pointerMode": "Pointer Mode (Text Selection)",
        "latexEditor.toolbar.handMode": "Hand Mode (Drag)",
        "leftMenu.aiAssistant": "AI Assistant",
        "leftMenu.aiToolTooltip": "AI Tools",
        "leftMenu.aigcDetection": "AIGC Detection Tool",
        "leftMenu.askSave": "Do you want to save the current document?",
        "leftMenu.attachment": "Attachment Analysis Tool",
        "leftMenu.closeCurrent": "Close Current",
        "leftMenu.closeDocument": "Close Document",
        "leftMenu.closeOther": "Close Other",
        "leftMenu.closeRight": "Close Right",
        "leftMenu.closeSaved": "Close Saved",
        "leftMenu.closeUnmodified": "Close Unmodified",
        "leftMenu.dataAnalysis": "Data Analysis Tool",
        "leftMenu.document": "Document",
        "leftMenu.documentNotFound": "Document not found",
        "leftMenu.edit": "Edit",
        "leftMenu.file": "File",
        "leftMenu.formulaRecognition": "Formula Recognition Tool",
        "leftMenu.graph": "Graph Tool",
        "leftMenu.help": "Help",
        "leftMenu.helpTooltip": "Help and Documentation",
        "leftMenu.historyForward": "Forward",
        "leftMenu.knowledgeBase": "Knowledge Base",
        "leftMenu.newDocument": "New Document",
        "leftMenu.noDocumentOpen": "No document open",
        "leftMenu.openDocument": "Open Document",
        "leftMenu.outline": "Outline",
        "leftMenu.preview": "Preview",
        "leftMenu.saveAll": "Save All",
        "leftMenu.saveDocument": "Save Document",
        "leftMenu.saveDocumentError": "Error saving document",
        "leftMenu.saveDocumentSuccess": "Document saved successfully",
        "leftMenu.switchDocument": "Switch Document",
        "leftMenu.view": "View",
        "leftMenu.welcome": "Welcome",
    },
    "de_DE": {
        "editorModeFirstTime.changeLaterHint": "Kann später in den Einstellungen geändert werden.",
        "editorModeFirstTime.message": "Bitte wählen Sie Ihren bevorzugten Markdown-Bearbeitungsmodus.",
        "editorModeFirstTime.title": "Standard-Editormodus auswählen",
        "export.options.title": "Exportoptionen",
        "export.options.marginBottom.label": "Unterer Rand (Zoll)",
        "export.options.marginBottom.description": "PDF unterer Rand, Einheit: Zoll",
        "export.options.marginLeft.label": "Linker Rand (Zoll)",
        "export.options.marginLeft.description": "PDF linker Rand, Einheit: Zoll",
        "export.options.marginRight.label": "Rechter Rand (Zoll)",
        "export.options.marginRight.description": "PDF rechter Rand, Einheit: Zoll",
        "export.options.printBackground.label": "Hintergrund drucken",
        "export.options.printBackground.description": "Hintergrundfarben und -bilder in PDF einbeziehen",
        "export.options.tabs.basic": "Grundeinstellungen",
        "export.options.tabs.style": "Stileinstellungen",
        "export.options.chineseFont.label": "Chinesische Schriftart",
        "export.options.chineseFont.description": "Für PDF-Export verwendete chinesische Schriftart",
        "export.options.westernFont.label": "Westliche Schriftart",
        "export.options.westernFont.description": "Für PDF-Export verwendete westliche Schriftart",
        "export.options.colorMode.label": "Farbmodus",
        "export.options.colorMode.description": "PDF-Farbmodus (Farbe oder Graustufen)",
        "export.options.colorMode.color": "Farbe",
        "export.options.colorMode.grayscale": "Graustufen",
        "export.options.enableStyleMapping.label": "Stilzuordnung aktivieren",
        "export.options.enableStyleMapping.description": "Markdown-Elemente auf Word-Stile zuordnen",
    },
    "fr_FR": {
        "dataAnalysis.tabs.report": "Rapport d'analyse",
        "dataAnalysis.tabs.data": "Données brutes",
        "dataAnalysis.tabs.analysis": "Analyse de données",
        "dataAnalysis.uploadHint": "Glissez le fichier ici ou cliquez pour télécharger",
        "dataAnalysis.uploadTip": "Formats supportés : CSV, Excel, JSON",
        "dataAnalysisWindow.preview": "Aperçu des données",
        "dataAnalysisWindow.text": "Valeur par défaut",
        "dataAnalysisWindow.text1": "Supposition actuelle",
        "dataAnalysisWindow.text2": "Sélectionné",
        "dataAnalysisWindow.text3": "Veuillez dans",
        "dataAnalysisWindow.tooltip": "Info-bulle",
        "detailedOutlineNode.generating": "Génération en cours",
        "detailedOutlineNode.sizeDragAdjust": "Glisser pour redimensionner",
        "documentService.exportFailedFailedExport": "Échec de l'exportation du document",
        "documentService.failedClose": "Échec de la fermeture du document",
        "documentService.failedNew": "Échec de la création du nouveau document",
        "documentService.loadFailedFailedLoading": "Échec du chargement du document",
        "documentService.saveFailedFailedSave": "Échec de l'enregistrement du document",
        "dummyView.emptyDescription": "Aucun document ouvert",
        "export.adapters.mdToPdf.name": "Markdown vers PDF",
        "export.adapters.mdToPdf.description": "Exporter les documents Markdown au format PDF",
        "export.adapters.mdToDocx.name": "Markdown vers DOCX",
        "export.adapters.mdToDocx.description": "Exporter les documents Markdown au format DOCX",
        "export.adapters.mdToHtml.name": "Markdown vers HTML",
        "export.adapters.mdToHtml.description": "Exporter les documents Markdown au format HTML",
        "export.adapters.mdToMd.name": "Markdown vers Markdown",
        "export.adapters.mdToMd.description": "Exporter les documents Markdown",
    },
    "ja_JP": {
        "aigc.export": "エクスポート",
        "aigc.exportAndDetect": "AIGC率を検出する",
        "aigc.exportAsNewDoc": "新しいドキュメントとして",
        "aigc.exportParaphrased": "書き換えた記事をエクスポート",
        "aigc.exportParaphrasedSuccess": "書き換えた記事を新しいドキュメントにエクスポートしました",
        "article.toolbar.mode": "編集モード",
        "article.toolbar.convert_latex_formulas": "LaTeX数式を変換",
        "article.toolbar.convert_latex_formulas_title": "LaTeX数式を変換",
        "article.toolbar.convert_latex_formulas_message": "この操作は、\\(...\\)インライン数式と\\[...\\]ブロック数式をVditor互換の$...$および$$...$$形式に変換します。\n\n注意：この操作はドキュメントの内容を変更します。事前にドキュメントを保存することをお勧めします。",
        "article.toolbar.convert_latex_formulas_success": "数式形式の変換が完了しました",
        "article.toolbar.convert_latex_formulas_no_match": "変換が必要な数式形式が見つかりません",
        "article.toolbar.convert_latex_formulas_no_editor": "エディタの準備ができていません",
        "article.toolbar.toggle_outline": "アウトラインの切り替え",
        "article.toolbar.toggle_outline_show": "アウトラインを表示",
        "article.toolbar.toggle_outline_hide": "アウトラインを隠す",
        "attachment.analysisSuccess": "分析完了",
        "attachment.analyzing": "添付ファイルを分析中",
        "attachment.attachmentsTitle": "添付ファイル解析",
        "attachment.fileType": "ファイルタイプ",
        "attachment.newAttachment": "添付ファイルをアップロード",
        "attachment.noAnalysis": "AI分析結果がありません",
        "attachment.noAttachmentSelected": "添付ファイルを選択するか、新しいファイルをアップロードしてください",
        "attachment.noParsedContent": "先に添付ファイルを解析してください",
        "attachment.parse": "添付ファイルを解析",
        "attachment.parseSuccess": "解析完了",
    },
    "ko_KR": {
        "aigcDetectionWindow.text2": "논리적 평활도",
        "aigcDetectionWindow.text3": "개인적 흔적 결여도",
        "aigcDetectionWindow.text4": "스타일 위험",
        "aigcDetectionWindow.text5": "과도한 설명",
        "aigcDetectionWindow.text6": "모호한 한정",
        "article.toolbar.mode": "편집 모드",
        "article.toolbar.convert_latex_formulas": "LaTeX 수식 변환",
        "article.toolbar.convert_latex_formulas_title": "LaTeX 수식 변환",
        "article.toolbar.convert_latex_formulas_message": "이 작업은 \\(...\\) 인라인 수식과 \\[...\\] 블록 수식을 Vditor 호환 $...$ 및 $$...$$ 형식으로 변환합니다.\n\n참고: 이 작업은 문서 내용을 수정합니다. 문서를 먼저 저장하는 것이 좋습니다.",
        "article.toolbar.convert_latex_formulas_success": "수식 형식 변환 완료",
        "article.toolbar.convert_latex_formulas_no_match": "변환할 수식 형식을 찾을 수 없음",
        "article.toolbar.convert_latex_formulas_no_editor": "편집기가 준비되지 않음",
        "article.toolbar.toggle_outline": "개요 전환",
        "article.toolbar.toggle_outline_show": "개요 표시",
        "article.toolbar.toggle_outline_hide": "개요 숨기기",
        "attachment.analysisSuccess": "분석 완료",
        "attachment.analyzing": "첨부 파일 분석 중",
        "attachment.attachmentsTitle": "첨부 파일 분석",
        "attachment.fileType": "파일 유형",
        "attachment.newAttachment": "첨부 파일 업로드",
        "attachment.noAnalysis": "AI 분석 결과 없음",
        "attachment.noAttachmentSelected": "첨부 파일을 선택하거나 새 파일을 업로드하세요",
        "attachment.noParsedContent": "먼저 첨부 파일을 구문 분석하세요",
        "attachment.parse": "첨부 파일 구문 분석",
        "attachment.parseSuccess": "구문 분석 완료",
    },
}


def update_key(lang, key, value):
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
    print("Batch Translation Processing - Batch 4")
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
