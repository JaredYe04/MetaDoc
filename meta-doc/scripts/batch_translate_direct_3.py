#!/usr/bin/env python3
import subprocess
from pathlib import Path

SCRIPT = Path("scripts/update_language_key.py")

TRANSLATIONS = {
    "en_us": {
        "graphWindow.format": "Format as follows",
        "graphWindow.name": "Engine Name",
        "graphWindow.text": "Available Chart Engines",
        "graphWindow.text1": "And return a",
        "graphWindow.text2": "Object",
        "graphWindow.text3": "Lowercase",
        "graphWindow.type": "Supported Types",
        "graphWindow.type1": "Chart Type",
        "graphWindow.user": "User Requirements",
        "graphWindow.userAnalyze": "Please analyze user requirements",
        "knowledgeBase.addKnowledge": "Add Knowledge",
        "knowledgeBase.check": "Please check server logs",
        "knowledgeBase.createMonacoEditorFailed": "Failed to create Monaco editor",
        "knowledgeBase.deleteConfirm": "Are you sure you want to delete this knowledge?",
        "knowledgeBase.disabled": "Disabled",
        "knowledgeBase.disabledMessage": "Knowledge base is currently disabled. Please enable it in settings.",
        "knowledgeBase.enable": "Enable Knowledge Base",
        "knowledgeBase.enableError": "Failed to enable knowledge base",
        "knowledgeBase.failed": "Retrieval failed",
        "knowledgeBase.feature": "Knowledge base feature is currently disabled",
        "knowledgeBase.fetchKbDetailsError": "Error fetching knowledge base details",
        "knowledgeBase.fetchKbDetailsFailed": "Failed to fetch knowledge base details",
        "knowledgeBase.fetchListResponse": "Knowledge base list response",
        "knowledgeBase.fetchListStarted": "Started fetching knowledge base list",
        "knowledgeBase.filenameRequired": "Filename cannot be empty",
        "knowledgeBase.invalidResponseFormat": "Invalid server response format. Please check if server is running.",
        "knowledgeBase.ipcNotInitialized": "IPC Renderer not initialized. This feature is only available in Electron environment.",
        "knowledgeBase.kbDetails": "Knowledge Base Details",
        "knowledgeBase.kbStatusUpdated": "Knowledge base status updated",
        "knowledgeBase.nonJsonResponse": "Server returned non-JSON response",
        "knowledgeBase.nonJsonResponseMessage": "Server returned non-JSON response. Please check server logs.",
        "knowledgeBase.noResults": "No results found",
        "knowledgeBase.openFolderFailedLog": "Failed to open folder",
        "knowledgeBase.open_folder": "Open Folder",
        "knowledgeBase.open_folder_error": "Failed to open folder",
        "knowledgeBase.previewEditorContainerNotFound": "Preview editor container not found",
        "knowledgeBase.renameFailed": "Rename failed",
        "knowledgeBase.renameSuccess": "Rename successful",
        "knowledgeBase.requestFailed": "Request failed",
        "knowledgeBase.searchPlaceholder": "Search knowledge base...",
        "knowledgeBase.settingsFeature": "Please enable knowledge base in settings to use this feature",
        "knowledgeBase.syncFailed": "Sync failed",
        "knowledgeBase.syncSuccess": "Sync successful",
        "knowledgeBase.text": "Knowledge base disabled",
        "knowledgeBase.text1": "Server returned non-",
        "knowledgeBase.text2": "Response",
        "knowledgeBase.unknownError": "Unknown error",
        "knowledgeBase.updatedInfoObject": "Updated info object",
        "knowledgeBase.uploadFailed": "Knowledge upload failed",
        "knowledgeBase.uploadSuccess": "Knowledge upload successful",
    },
    "de_DE": {
        "export.adapters.mdToTex.name": "Markdown zu LaTeX",
        "export.adapters.mdToTex.description": "Markdown-Dokumente als LaTeX exportieren",
        "export.adapters.texToPdf.name": "LaTeX zu PDF",
        "export.adapters.texToPdf.description": "LaTeX-Dokumente als PDF kompilieren",
        "export.adapters.texToTex.name": "LaTeX zu LaTeX",
        "export.adapters.texToTex.description": "LaTeX-Dokumente exportieren",
        "export.options.pageSize.label": "Seitengröße",
        "export.options.pageSize.description": "PDF-Seitengröße auswählen",
        "export.options.pageSize.descriptionTex": "PDF-Seitengröße auswählen (muss in LaTeX-Dokumentenklasse konfiguriert werden)",
        "export.options.pageSize.a4": "A4",
        "export.options.pageSize.a3": "A3",
        "export.options.pageSize.a5": "A5",
        "export.options.pageSize.b5": "B5",
        "export.options.pageSize.letter": "Letter",
        "export.options.pageSize.legal": "Legal",
        "export.options.margins.label": "Seitenränder",
        "export.options.margins.description": "PDF-Seitenrand-Einstellungen",
        "export.options.margins.descriptionTex": "PDF-Seitenrand-Einstellungen (Hinweis: LaTeX-Ränder müssen im Dokument konfiguriert werden)",
        "export.options.marginTop.label": "Oberer Rand (Zoll)",
        "export.options.marginTop.description": "PDF oberer Rand, Einheit: Zoll",
        "export.options.marginTop.descriptionTex": "PDF oberer Rand, Einheit: Zoll (Hinweis: LaTeX-Ränder müssen im Dokument konfiguriert werden)",
    },
    "fr_FR": {
        "chat.deleteConfirm": "Confirmer la suppression du message ?",
        "chat.deleteFailed": "Échec de la suppression",
        "chat.deleting": "Suppression...",
        "chat.dropFileHere": "Déposez le fichier ici",
        "chat.export": "Exporter",
        "chat.exportFailed": "Échec de l'exportation",
        "chat.exportSuccess": "Exportation réussie",
        "chat.inputPlaceholder": "Posez une question...",
        "chat.loading": "Chargement...",
        "chat.loadingConverting": "Conversion...",
        "chat.loadingTimeout": "Délai d'attente dépassé",
        "chat.noContent": "Aucun contenu à exporter",
        "chat.noMessages": "Aucun message",
        "chat.refresh": "Rafraîchir",
        "chat.refreshFailed": "Échec du rafraîchissement",
        "chat.regenerate": "Régénérer",
        "chat.retry": "Réessayer",
        "chat.selectTextFirst": "Veuillez d'abord sélectionner du texte dans l'éditeur",
        "chat.send": "Envoyer",
        "chat.sendFailed": "Échec de l'envoi",
        "chat.sending": "Envoi en cours...",
        "chat.sessionList": "Liste des sessions",
        "chat.sessionRenameFailed": "Échec du renommage de la session",
        "chat.stop": "Arrêter",
        "chat.tabChat": "Chat",
        "chat.tabHistory": "Historique",
        "chat.thinking": "Réflexion en cours...",
        "chat.timeout": "Délai dépassé",
        "chat.title": "Chat IA",
        "chat.toastInputEmpty": "Le contenu ne peut pas être vide",
        "chat.user": "Utilisateur",
        "chat.windowTitle": "Fenêtre de chat",
        "chatConfig.confirmDelete": "Confirmer la suppression de la configuration ?",
        "chatConfig.configUpdated": "Configuration mise à jour",
        "chatConfig.currentConfig": "Configuration actuelle",
        "chatConfig.customConfig": "Configuration personnalisée",
        "chatConfig.customConfigTip": "Sélectionnez ou créez une configuration personnalisée",
        "chatConfig.defaultConfig": "Configuration par défaut",
        "chatConfig.defaultConfigTip": "Configuration par défaut du système",
    },
    "ja_JP": {
        "aigc.noActiveDocument": "アクティブなドキュメントがありません",
        "aigc.noAnalysisData": "分析データがありません",
        "aigc.noAnalysisYet": "まだ分析されていません",
        "aigc.noContent": "コンテンツをアップロードまたは選択してください",
        "aigc.noDocuments": "開いているドキュメントがありません",
        "aigc.noSessionSelected": "セッションを選択するか、新しいセッションを作成してください",
        "aigc.nonSignificantRisk": "有意でないリスク",
        "aigc.paragraphContent": "段落コンテンツ",
        "aigc.paragraphCount": "合計 {n} 段落",
        "aigc.paraphraseAll": "すべて書き換え",
        "aigc.paraphraseOne": "書き換え",
        "aigc.paraphraseSuccess": "書き換え成功",
        "aigc.paraphrasedContent": "書き換え後のコンテンツ",
        "aigc.paraphrasing": "書き換え中...",
        "aigc.pleaseSelectDocument": "分析するドキュメントを選択してください",
        "aigc.pleaseUploadOrSelect": "ファイルをアップロードするか、ドキュメントからコンテンツを選択してください",
        "aigc.reAnalyze": "再分析",
        "aigc.reParaphraseAll": "すべて再書き換え",
        "aigc.reParaphraseOne": "再書き換え",
        "aigc.rePreprocess": "段落を再分割",
        "aigc.renamePlaceholder": "セッション名を入力してください",
        "aigc.renameTitle": "セッション名を変更",
        "aigc.reportGenerated": "レポート生成成功",
        "aigc.selectDocumentTitle": "分析するドキュメントを選択",
        "aigc.selectDomain": "ドメインを選択",
        "aigc.selectFromDocument": "ドキュメントから選択",
        "aigc.selectLanguage": "言語を選択",
        "aigc.selectedOneDocument": "1つのドキュメントを選択しました",
        "aigc.sessionsTitle": "AIGC検出セッション",
        "aigc.splitAtCursor": "カーソル位置で分割",
        "aigc.startAnalysis": "分析を開始",
        "aigc.unsupportedFileType": "サポートされていないファイルタイプ",
        "aigc.unsupportedFormat": "サポートされていないドキュメント形式",
        "aigc.uploadFile": "ファイルをアップロード",
    },
    "ko_KR": {
        "aigc.viewOriginal": "A 원문",
        "aigc.viewParaphrased": "B 다시 작성",
        "aigcDetectionWindow.text": "구문 통일성",
        "aigcDetectionWindow.text1": "어휘 반복도",
        "aigc.assembleAsNewArticle": "새 기사로 조립",
        "aigc.assembleNewTitle": "다시 작성한 기사",
        "aigc.assembleSuccess": "새 기사로 조립하여 열었습니다",
        "aigc.backToTop": "맨 위로 돌아가기",
        "aigc.chartWeightTitle": "위험 원본 가중치(가중 누적 기여도 비율)",
        "aigc.clickGenerateReport": "자세한 보고서를 생성하려면 보고서 생성 버튼을 클릭하세요",
        "aigc.contentSelected": "콘텐츠가 선택되었습니다",
        "aigc.copy": "복사",
        "aigc.copyFailed": "복사 실패",
        "aigc.copyOneClick": "원클릭 복사",
        "aigc.copySuccess": "복사되었습니다",
        "aigc.defaultTitle": "새 AIGC 검출 세션",
        "aigc.dimensions.sentence_uniformity": "구문 통일성",
        "aigc.dimensions.lexical_diversity": "어휘 반복도",
        "aigc.dimensions.reasoning_smoothness": "논리적 평활도",
        "aigc.dimensions.personal_trace": "개인적 흔결 결여도",
        "aigc.dimensions.stylistic_risk": "스타일 위험",
        "aigc.dimensions.over_explanation": "과도한 설명",
        "aigc.dimensions.hedging_pattern": "모호한 한정",
        "aigc.dimensions.opening_transition_pattern": "전환어 템플릿",
        "aigc.dimensions.structural_repetition": "구조적 반복",
        "aigc.dimensions.abstractness": "추상적 공동",
        "aigc.dimensions.emotional_flatness": "감정 평면",
        "aigc.dimensions.formulaic_closure": "틀에 박힌 마무리",
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
    print("Batch Translation Processing - Batch 3")
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
