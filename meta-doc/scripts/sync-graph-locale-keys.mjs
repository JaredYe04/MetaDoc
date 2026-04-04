/**
 * 以 en_us.json 的 graph 为键全集，向其他 locale 补全缺失项（优先使用下方翻译表，否则回退英文）。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.join(__dirname, '../src/renderer/src/locales')

const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en_us.json'), 'utf8'))
const refGraph = en.graph
const refKeys = Object.keys(refGraph)

const EXTRA = {
  ja_JP: {
    quickDialogTitle: 'イラストチャット',
    quickDialogWelcome:
      'こんにちは。下の入力欄に図の要件を入力してください（選択範囲の文脈を事前入力済みです。編集してから送信できます）。フロー図・模式図・データ図などを生成できます。',
    quickDialogPersistHint:
      'この会話は自動保存されます。後から「グラフ」ツールで同じ会話を開き直して続きを確認・編集できます。',
    copyCode: 'コードをコピー',
    openInGraphTool: 'グラフツールで開く',
    quickDialogDefaultPromptIntro:
      '次の選択されたドキュメント内容に基づき、文書に合う図（フロー図・模式図・データ図など）を生成してください：',
    quickSessionTitle: '図 · {doc} · {snippet}',
    quickDialogSessionError: 'グラフセッションの作成に失敗しました',
    copyMarkdown: 'Markdown をコピー',
    copyLatexCode: 'LaTeX コード環境をコピー',
    copyLatexIncludegraphics: '\\includegraphics テンプレートをコピー',
    exportChart: 'エクスポート',
    openExportFolder: 'フォルダーを開く',
    insertIntoDocument: 'ドキュメントに挿入',
    insertedIntoDocument: 'ドキュメントに挿入しました',
    selectTextForIllustration: '先にエディターでテキストを選択してください',
    insertFromEditorDefaultPrompt:
      '次のカーソル付近の文脈に基づき、このドキュメントに適した図（フロー図・模式図・データ図など）を生成してください。図の種類や重点も補足できます：',
    insertFromEditorSessionTitle: '図（エディターから）',
    quickDialogGenerateChart: 'グラフを生成'
  },
  de_DE: {
    quickDialogTitle: 'Illustrations-Chat',
    quickDialogWelcome:
      'Hallo. Beschreiben Sie unten Ihren Grafikwunsch (Kontext aus Ihrer Auswahl ist vorausgefüllt — bearbeiten und senden). So entstehen Flussdiagramme, Schemata oder Datengrafiken.',
    quickDialogPersistHint:
      'Dieser Chat wird automatisch gespeichert. Sie können dieselbe Sitzung später im Zeichenwerkzeug erneut öffnen.',
    copyCode: 'Code kopieren',
    openInGraphTool: 'Im Zeichenwerkzeug öffnen',
    quickDialogDefaultPromptIntro:
      'Erstellen Sie anhand des folgenden markierten Dokumentinhalts eine passende Abbildung (Flussdiagramm, Schema, Datengrafik usw.) im Stil des Dokuments:',
    quickSessionTitle: 'Abbildung · {doc} · {snippet}',
    quickDialogSessionError: 'Zeichnungssitzung konnte nicht erstellt werden',
    copyMarkdown: 'Markdown kopieren',
    copyLatexCode: 'LaTeX-Codeumgebung kopieren',
    copyLatexIncludegraphics: '\\includegraphics-Vorlage kopieren',
    exportChart: 'Exportieren',
    openExportFolder: 'Ordner öffnen',
    insertIntoDocument: 'In Dokument einfügen',
    insertedIntoDocument: 'In Dokument eingefügt',
    selectTextForIllustration: 'Bitte zuerst Text im Editor auswählen',
    insertFromEditorDefaultPrompt:
      'Erstellen Sie anhand des folgenden Kontexts um den Cursor eine Abbildung, die in dieses Dokument passt (Flussdiagramm, Schema, Datengrafik usw.). Sie können Typ und Schwerpunkt ergänzen:',
    insertFromEditorSessionTitle: 'Abbildung (aus Editor)',
    quickDialogGenerateChart: 'Diagramm generieren'
  },
  fr_FR: {
    quickDialogTitle: 'Chat illustration',
    quickDialogWelcome:
      'Bonjour. Décrivez votre besoin dans le champ ci-dessous (le contexte de votre sélection est prérempli — modifiez puis envoyez) pour générer des schémas, diagrammes ou graphiques.',
    quickDialogPersistHint:
      'Cette conversation est enregistrée automatiquement. Vous pourrez rouvrir la même session dans l’outil Dessin.',
    copyCode: 'Copier le code',
    openInGraphTool: 'Ouvrir dans l’outil Dessin',
    quickDialogDefaultPromptIntro:
      'À partir du contenu suivant sélectionné, générez une illustration adaptée (organigramme, schéma, graphique, etc.) cohérente avec le document :',
    quickSessionTitle: 'Figure · {doc} · {snippet}',
    quickDialogSessionError: 'Échec de la création de la session de dessin',
    copyMarkdown: 'Copier Markdown',
    copyLatexCode: 'Copier bloc de code LaTeX',
    copyLatexIncludegraphics: 'Copier le modèle \\includegraphics',
    exportChart: 'Exporter',
    openExportFolder: 'Ouvrir le dossier',
    insertIntoDocument: 'Insérer dans le document',
    insertedIntoDocument: 'Inséré dans le document',
    selectTextForIllustration: 'Sélectionnez d’abord du texte dans l’éditeur',
    insertFromEditorDefaultPrompt:
      'À partir du contexte autour du curseur ci-dessous, générez une illustration adaptée à ce document (organigramme, schéma, graphique, etc.). Vous pouvez préciser le type et l’objectif :',
    insertFromEditorSessionTitle: 'Figure (depuis l’éditeur)',
    quickDialogGenerateChart: 'Générer le graphique'
  },
  es_ES: {
    quickDialogTitle: 'Chat de ilustraciones',
    quickDialogWelcome:
      'Hola. Describe lo que necesitas en el campo inferior (hemos rellenado el contexto de tu selección; edita y envía) para generar diagramas de flujo, esquemas o gráficos.',
    quickDialogPersistHint:
      'Esta conversación se guarda automáticamente. Puedes volver a abrir la misma sesión en la herramienta de Dibujo.',
    copyCode: 'Copiar código',
    openInGraphTool: 'Abrir en herramienta de dibujo',
    quickDialogDefaultPromptIntro:
      'Según el siguiente contenido seleccionado del documento, genera una ilustración adecuada (diagrama de flujo, esquema, gráfico, etc.) acorde al documento:',
    quickSessionTitle: 'Figura · {doc} · {snippet}',
    quickDialogSessionError: 'No se pudo crear la sesión de dibujo',
    copyMarkdown: 'Copiar Markdown',
    copyLatexCode: 'Copiar entorno de código LaTeX',
    copyLatexIncludegraphics: 'Copiar plantilla \\includegraphics',
    exportChart: 'Exportar',
    openExportFolder: 'Abrir carpeta',
    insertIntoDocument: 'Insertar en el documento',
    insertedIntoDocument: 'Insertado en el documento',
    selectTextForIllustration: 'Selecciona primero texto en el editor',
    insertFromEditorDefaultPrompt:
      'Según el contexto alrededor del cursor, genera una ilustración adecuada para este documento (diagrama de flujo, esquema, gráfico, etc.). Puedes indicar tipo y enfoque:',
    insertFromEditorSessionTitle: 'Figura (desde el editor)',
    quickDialogGenerateChart: 'Generar gráfico'
  },
  pt_BR: {
    quickDialogTitle: 'Chat de ilustrações',
    quickDialogWelcome:
      'Olá. Descreva o que precisa no campo abaixo (o contexto da sua seleção foi preenchido — edite e envie) para gerar fluxogramas, esquemas ou gráficos.',
    quickDialogPersistHint:
      'Esta conversa é salva automaticamente. Você pode reabrir a mesma sessão na ferramenta de Desenho.',
    copyCode: 'Copiar código',
    openInGraphTool: 'Abrir na ferramenta de desenho',
    quickDialogDefaultPromptIntro:
      'Com base no conteúdo selecionado abaixo, gere uma ilustração adequada (fluxograma, esquema, gráfico etc.) alinhada ao documento:',
    quickSessionTitle: 'Figura · {doc} · {snippet}',
    quickDialogSessionError: 'Falha ao criar sessão de desenho',
    copyMarkdown: 'Copiar Markdown',
    copyLatexCode: 'Copiar ambiente de código LaTeX',
    copyLatexIncludegraphics: 'Copiar modelo \\includegraphics',
    exportChart: 'Exportar',
    openExportFolder: 'Abrir pasta',
    insertIntoDocument: 'Inserir no documento',
    insertedIntoDocument: 'Inserido no documento',
    selectTextForIllustration: 'Selecione primeiro o texto no editor',
    insertFromEditorDefaultPrompt:
      'Com base no contexto em torno do cursor, gere uma ilustração adequada a este documento (fluxograma, esquema, gráfico etc.). Você pode indicar tipo e foco:',
    insertFromEditorSessionTitle: 'Figura (do editor)',
    quickDialogGenerateChart: 'Gerar gráfico'
  },
  ko_KR: {
    quickDialogTitle: '삽화 대화',
    quickDialogWelcome:
      '안녕하세요. 아래 입력란에 그림 요구를 설명하세요(선택 영역 맥락이 미리 채워져 있으며, 수정 후 전송할 수 있습니다). 순서도, 개요도, 데이터 도표 등을 생성할 수 있습니다.',
    quickDialogPersistHint:
      '이 대화는 자동으로 저장됩니다. 나중에 그리기 도구에서 동일한 세션을 다시 열 수 있습니다.',
    copyCode: '코드 복사',
    openInGraphTool: '그리기 도구에서 열기',
    quickDialogDefaultPromptIntro:
      '다음에 선택된 문서 내용을 바탕으로 문서와 어울리는 삽화(순서도, 개요도, 데이터 그래프 등)를 생성하세요:',
    quickSessionTitle: '그림 · {doc} · {snippet}',
    quickDialogSessionError: '그리기 세션을 만들지 못했습니다',
    copyMarkdown: 'Markdown 복사',
    copyLatexCode: 'LaTeX 코드 환경 복사',
    copyLatexIncludegraphics: '\\includegraphics 템플릿 복사',
    exportChart: '보내기',
    openExportFolder: '폴더 열기',
    insertIntoDocument: '문서에 삽입',
    insertedIntoDocument: '문서에 삽입됨',
    selectTextForIllustration: '편집기에서 먼저 텍스트를 선택하세요',
    insertFromEditorDefaultPrompt:
      '아래 커서 주변 문맥을 바탕으로 이 문서에 맞는 삽화(순서도, 개요도, 데이터 그래프 등)를 생성하세요. 차트 유형과 중점을 덧붙일 수 있습니다:',
    insertFromEditorSessionTitle: '삽화(편집기에서)',
    quickDialogGenerateChart: '차트 생성'
  },
  ru_RU: {
    quickDialogTitle: 'Чат иллюстраций',
    quickDialogWelcome:
      'Здравствуйте. Опишите в поле ниже, какой рисунок нужен (контекст выделения уже подставлен — отредактируйте и отправьте), чтобы получить блок-схемы, схемы или графики.',
    quickDialogPersistHint:
      'Этот диалог сохраняется автоматически. Позже его можно снова открыть в инструменте «Рисование».',
    copyCode: 'Копировать код',
    openInGraphTool: 'Открыть в инструменте рисования',
    quickDialogDefaultPromptIntro:
      'По следующему выделенному фрагменту документа создайте подходящую иллюстрацию (блок-схема, схема, график и т. п.) в стиле документа:',
    quickSessionTitle: 'Рисунок · {doc} · {snippet}',
    quickDialogSessionError: 'Не удалось создать сеанс рисования',
    copyMarkdown: 'Копировать Markdown',
    copyLatexCode: 'Копировать LaTeX-блок кода',
    copyLatexIncludegraphics: 'Копировать шаблон \\includegraphics',
    exportChart: 'Экспорт',
    openExportFolder: 'Открыть папку',
    insertIntoDocument: 'Вставить в документ',
    insertedIntoDocument: 'Вставлено в документ',
    selectTextForIllustration: 'Сначала выделите текст в редакторе',
    insertFromEditorDefaultPrompt:
      'По контексту вокруг курсора создайте иллюстрацию, подходящую для этого документа (блок-схема, схема, график и т. п.). Можно указать тип и акценты:',
    insertFromEditorSessionTitle: 'Иллюстрация (из редактора)',
    quickDialogGenerateChart: 'Создать диаграмму'
  },
  zh_tw: {
    quickDialogTitle: '插圖對話',
    quickDialogWelcome:
      '你好。請在下方輸入框描述繪圖需求（已依你的選取範圍預填上下文，可直接修改後傳送），即可產生流程圖、示意圖或資料圖等插圖。',
    quickDialogPersistHint:
      '本對話會自動儲存，之後可在「繪圖」視窗中開啟同一工作階段繼續檢視與編輯。',
    copyCode: '複製程式碼',
    openInGraphTool: '在繪圖工具中開啟',
    quickDialogDefaultPromptIntro:
      '請根據以下選取的文件內容，產生合適的插圖（流程圖、示意圖、資料圖等），風格與文件一致：',
    quickSessionTitle: '插圖 · {doc} · {snippet}',
    quickDialogSessionError: '建立繪圖工作階段失敗',
    copyMarkdown: '複製 Markdown',
    copyLatexCode: '複製 LaTeX 程式碼環境',
    copyLatexIncludegraphics: '複製 \\includegraphics 範本',
    exportChart: '匯出',
    openExportFolder: '開啟所在資料夾',
    insertIntoDocument: '插入到文件',
    insertedIntoDocument: '已插入到文件',
    selectTextForIllustration: '請先在編輯器中選取要產生插圖的文字',
    insertFromEditorDefaultPrompt:
      '請根據以下游標附近的文件脈絡，產生適合插入目前文件的插圖（流程圖、示意圖、資料圖等）。可補充圖表類型與重點：',
    insertFromEditorSessionTitle: '插圖（來自編輯器）',
    quickDialogGenerateChart: '產生圖表'
  }
}

const TARGETS = ['ja_JP', 'de_DE', 'fr_FR', 'es_ES', 'zh_tw', 'pt_BR', 'ko_KR', 'ru_RU']

for (const name of TARGETS) {
  const fp = path.join(localesDir, `${name}.json`)
  if (!fs.existsSync(fp)) continue
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'))
  if (!j.graph || typeof j.graph !== 'object') continue
  const tr = EXTRA[name] || {}
  const g = { ...j.graph }
  let added = 0
  for (const k of refKeys) {
    if (g[k] === undefined || g[k] === null || g[k] === '') {
      g[k] = tr[k] ?? refGraph[k]
      added++
    }
  }
  j.graph = g
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n')
  console.log(name, 'graph keys filled:', added)
}
