#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

LOCALES_DIR = Path("src/renderer/src/locales")
SCRIPT = Path("scripts/update_language_key.py")

# Second batch of translations
TRANSLATIONS = {
    "en_us": {
        "graph.analyzingIntent": "Analyzing intent...",
        "graph.assistant": "Assistant",
        "graph.chartType": "Chart Type",
        "graph.conversationMode": "Conversation Mode",
        "graph.defaultTitle": "New Graph Session",
        "graph.engine": "Graph Engine",
        "graph.export": "Export",
        "graph.exportSuccess": "Export successful",
        "graph.generate": "Generate",
        "graph.generateSuccess": "Generation successful",
        "graph.generated": "Chart generated",
        "graph.generatedImage": "Generated Image",
        "graph.generating": "Generating...",
        "graph.inputPlaceholder": "Enter graph requirements, AI will automatically select the appropriate chart engine...",
        "graph.newSession": "New Session",
        "graph.noChart": "No chart to export",
        "graph.noOptimizePrompt": "Please enter optimization requirements",
        "graph.noPrompt": "Please enter graph requirements",
        "graph.noSessionSelected": "Please select a session or create a new session",
        "graph.optimize": "Optimize Image",
        "graph.optimizeOnlyInConversation": "Optimization is only available in conversation mode",
        "graph.optimizePrompt": "Optimize the image based on the following conversation history:",
        "graph.outputFormat": "Output Format",
        "graph.renamePlaceholder": "Please enter session name",
        "graph.renameTitle": "Rename Session",
        "graph.sessionsTitle": "Graph Sessions",
        "graph.simpleMode": "Simple Mode",
        "graph.user": "User",
        "graph.userRequest": "User Request",
    },
    "de_DE": {
        "contextMenu.insertGraph": "Diagramm einfügen",
        "contextMenu.redo": "Wiederholen",
        "contextMenu.undo": "Rückgängig",
        "data-analysis-tool.analyze": "Datenanalyse",
        "data-analysis-tool.analyze1": "Automatische Analyse",
        "data-analysis-tool.analyze2": "Aggregationsanalyse usw.",
        "data-analysis-tool.analyze3": "Datenanalyse-Tool",
        "dataAnalysisWindow.text": "Standardwert",
        "dataAnalysisWindow.text1": "Aktuelle Vermutung",
        "dataAnalysisWindow.text2": "Ausgewählt",
        "dataAnalysisWindow.text3": "Bitte in",
        "dataAnalysisWindow.tooltip": "Tooltip",
        "detailedOutlineNode.generating": "Generiere",
        "detailedOutlineNode.sizeDragAdjust": "Ziehen zum Größenändern",
        "documentService.exportFailedFailedExport": "Dokumentexport fehlgeschlagen",
        "documentService.failedClose": "Dokument schließen fehlgeschlagen",
        "documentService.failedNew": "Neues Dokument erstellen fehlgeschlagen",
        "documentService.loadFailedFailedLoading": "Dokument laden fehlgeschlagen",
        "documentService.saveFailedFailedSave": "Dokument speichern fehlgeschlagen",
        "dummyView.emptyDescription": "Keine geöffneten Dokumente",
        "export.adapters.mdToPdf.name": "Markdown zu PDF",
        "export.adapters.mdToPdf.description": "Markdown-Dokumente als PDF exportieren",
        "export.adapters.mdToDocx.name": "Markdown zu DOCX",
        "export.adapters.mdToDocx.description": "Markdown-Dokumente als DOCX exportieren",
        "export.adapters.mdToHtml.name": "Markdown zu HTML",
        "export.adapters.mdToHtml.description": "Markdown-Dokumente als HTML exportieren",
        "export.adapters.mdToMd.name": "Markdown zu Markdown",
        "export.adapters.mdToMd.description": "Markdown-Dokumente exportieren",
    },
    "fr_FR": {
        "attachment.analyzing": "Analyse des pièces jointes",
        "attachment.attachmentsTitle": "Analyse des pièces jointes",
        "attachment.fileType": "Type de fichier",
        "attachment.newAttachment": "Télécharger une pièce jointe",
        "attachment.noAnalysis": "Aucun résultat d'analyse IA",
        "attachment.noAttachmentSelected": "Veuillez sélectionner une pièce jointe ou en télécharger une nouvelle",
        "attachment.noParsedContent": "Veuillez d'abord analyser la pièce jointe",
        "attachment.parse": "Analyser la pièce jointe",
        "attachment.parseSuccess": "Analyse terminée",
        "attachment.removeConfirm": "Confirmer la suppression de la pièce jointe ?",
        "attachment.selectAttachment": "Sélectionner une pièce jointe",
        "attachment.selectDocument": "Sélectionner un document",
        "attachment.selectedDoc": "Document sélectionné",
        "attachment.tabAttachment": "Pièce jointe",
        "attachment.tabDoc": "Document",
        "attachment.title": "Analyseur de pièces jointes",
        "attachment.upload": "Télécharger",
        "attachment.uploading": "Téléchargement en cours...",
        "attachmentView.title": "Pièces jointes",
        "chat.assistant": "Assistant",
        "chat.configFirst": "Veuillez d'abord configurer les paramètres LLM",
        "chat.configLlm": "Configurer LLM",
        "chat.converting": "Conversion...",
        "chat.copy": "Copier",
        "chat.copyFailed": "Copie échouée",
        "chat.copySuccess": "Copié",
        "chat.deepThinking": "Réflexion profonde",
        "chat.deepThinkingDescription": "Active la réflexion approfondie du modèle",
        "chat.deepThinkingEnabled": "Réflexion profonde activée",
    },
    "ja_JP": {
        "aigc.dimensions.structural_repetition": "構造の反復",
        "aigc.dimensions.abstractness": "抽象的空洞",
        "aigc.dimensions.emotional_flatness": "感情の平坦さ",
        "aigc.dimensions.formulaic_closure": "型にはまった結び",
        "aigc.documentEmpty": "ドキュメントの内容が空です",
        "aigc.documentNotFound": "ドキュメントが存在しません",
        "aigc.domainAcademic": "アカデミック",
        "aigc.domainBlog": "ブログ",
        "aigc.domainBusiness": "ビジネス",
        "aigc.domainCreative": "クリエイティブ",
        "aigc.domainGeneral": "一般",
        "aigc.domainLegal": "法務",
        "aigc.domainMedical": "医療",
        "aigc.domainTechnical": "技術",
        "aigc.downloadFileFailed": "ファイルのダウンロードに失敗しました",
        "aigc.dragToUpload": "ファイルをドラッグしてアップロード、またはクリックして選択",
        "aigc.dropFileHere": "ファイルをここにドロップ",
        "aigc.exportReport": "レポートをエクスポート",
        "aigc.exportReportSuccess": "新しいドキュメントにエクスポートされました",
        "aigc.fileUploaded": "ファイルのアップロードに成功しました",
        "aigc.generateReport": "レポートを生成",
        "aigc.mergeWithNext": "次の段落と結合",
        "aigc.modified": "変更済み",
        "aigc.newSession": "新しいセッション",
    },
    "ko_KR": {
        "aigc.pleaseSelectDocument": "분석할 문서를 선택하세요",
        "aigc.pleaseUploadOrSelect": "파일을 업로드하거나 문서에서 콘텐츠를 선택하세요",
        "aigc.reAnalyze": "다시 분석",
        "aigc.reParaphraseAll": "모두 다시 작성",
        "aigc.reParaphraseOne": "다시 작성",
        "aigc.rePreprocess": "단락 재구분",
        "aigc.renamePlaceholder": "세션 이름을 입력하세요",
        "aigc.renameTitle": "세션 이름 바꾸기",
        "aigc.reportGenerated": "보고서 생성 성공",
        "aigc.selectDocumentTitle": "분석할 문서 선택",
        "aigc.selectDomain": "분야 선택",
        "aigc.selectFromDocument": "문서에서 선택",
        "aigc.selectLanguage": "언어 선택",
        "aigc.selectedOneDocument": "1개 문서 선택됨",
        "aigc.sessionsTitle": "AIGC 검출 세션",
        "aigc.splitAtCursor": "커서 위치에서 분할",
        "aigc.startAnalysis": "분석 시작",
        "aigc.unsupportedFileType": "지원되지 않는 파일 유형",
        "aigc.unsupportedFormat": "지원되지 않는 문서 형식",
        "aigc.uploadFile": "파일 업로드",
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
    print("Batch Translation Processing - Batch 2")
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
