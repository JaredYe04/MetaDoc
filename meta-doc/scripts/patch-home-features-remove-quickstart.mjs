/**
 * 将各语言 manuals 下各语言目录的 home/features.md 中「快速开始向导」整段替换为新版主页说明。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manualsRoot = path.join(__dirname, '../src/renderer/src/manuals')

const REPLACEMENTS = {
  zh_CN: `## Agent 与推荐提示

主页顶部提供与 **Agent 全页** 相同的输入框（支持 @ 引用文件/标签页/目录）。输入内容仅保存在本页，**点击发送**后会自动打开 **Agent** 标签并**新建会话**，然后发送该条消息。

输入框下方为 **推荐需求**（多条带图标的示例提示词）：

- 可点击 **换一批** 随机刷新展示
- 每条会每隔约 **10～20 秒**自动随机切换，并带有切换动画
- 点击某条会将提示词填入输入框；若需撤销，可在输入框内使用 **Ctrl+Z**（macOS 上为 **⌘Z**）恢复填入前的内容

> 早期版本中的「快速开始」向导已移除；新建文档请使用下方 **新建文档** 按钮或左侧菜单。`,

  zh_TW: `## Agent 與推薦提示

主頂部提供與 **Agent 全頁**相同的輸入框（支援 @ 引用檔案/分頁/目錄）。內容僅暫存於本頁，**按傳送**後會開啟 **Agent** 分頁並**建立新工作階段**，再送出該則訊息。

輸入框下方為 **推薦需求**（多則含圖示的範例提示）：

- 可按 **換一批** 隨機刷新
- 每則約 **10～20 秒**會自動隨機替換並有轉場動畫
- 點選會將文字填入輸入框；可用 **Ctrl+Z** / **⌘Z** 還原填入前內容

> 舊版「快速開始」精靈已移除；請用 **新建文件** 或左側選單建立文件。`,

  en_US: `## Agent input and suggested prompts

At the top of the home page you get the same **composer** as the full **Agent** tab (with @ references for files, tabs, and folders). Text stays on the home page until you **send**; then MetaDoc switches to the **Agent** tab, **creates a new session**, and submits that message.

Below the composer you will see **suggested prompts** (short ideas, many with emoji):

- Tap **Shuffle** to pick a new random set
- Each chip **auto-rotates** about every **10–20 seconds** with a small transition animation
- Clicking a chip fills the composer; use **Ctrl+Z** (**⌘Z** on macOS) once to restore what you had before the chip click

> The legacy **Quick Start** wizard has been removed. Create documents with **New document** or the left menu.`,

  ja_JP: `## Agent入力とおすすめプロンプト

ホーム上部には **Agent** タブと同じ入力欄（ファイル／タブ／フォルダの @ 参照）があります。送信まではホームにだけ保持され、**送信**で **Agent** タブが開き**新しいセッション**が作成され、その内容が送信されます。

その下には **おすすめプロンプト**（絵文字付きの例）があります。

- **入れ替え**でランダムに更新
- 各チップは約 **10～20 秒**ごとに自動で入れ替わり、アニメーション付き
- クリックで入力欄に挿入。**Ctrl+Z** / **⌘Z** で直前の内容に戻せます

> 旧 **クイックスタート** ウィザードは廃止されました。**新規ドキュメント** または左メニューから作成してください。`,

  ko_KR: `## Agent 입력 및 추천 프롬프트

홈 상단에는 **Agent** 탭과 동일한 입력창(파일/탭/폴더 @ 참조)이 있습니다. **전송** 전까지는 홈에만 저장되며, 전송 시 **Agent** 탭이 열리고 **새 세션**이 만들어진 뒤 메시지가 보내집니다.

아래에는 **추천 프롬프트**(이모지 예시)가 있습니다.

- **다시 섞기**로 무작위 갱신
- 각 칩은 약 **10～20초**마다 자동으로 바뀌며 전환 애니메이션이 있습니다
- 클릭 시 입력창에 채움. **Ctrl+Z** / **⌘Z**로 채우기 직전 내용 복구

> 예전 **빠른 시작** 마법사는 제거되었습니다. **새 문서** 또는 왼쪽 메뉴로 문서를 만드세요.`,

  de_DE: `## Agent-Eingabe und Vorschlags-Prompts

Oben auf der Startseite steht dieselbe **Eingabeleiste** wie im **Agent**-Tab (mit @-Referenzen). Der Text bleibt bis zum **Senden** nur auf der Startseite; danach wechselt die App zum **Agent**-Tab, legt eine **neue Sitzung** an und sendet die Nachricht.

Darunter: **Vorschlags-Prompts** (kurze Ideen, oft mit Emoji):

- **Neu mischen** für neue Zufallsauswahl
- Jeder Chip wechselt etwa alle **10–20 Sekunden** automatisch mit Animation
- Klick füllt die Eingabe; **Strg+Z** (**⌘Z** auf dem Mac) stellt den vorherigen Inhalt wieder her

> Der alte **Schnellstart**-Assistent entfällt. Neue Dokumente über **Neues Dokument** oder das linke Menü.`,

  fr_FR: `## Saisie Agent et idées suggérées

En haut de l’accueil : le même **champ** que l’onglet **Agent** (références @ fichiers/onglets/dossiers). Le texte reste sur l’accueil jusqu’à **Envoyer** : l’app ouvre alors l’onglet **Agent**, **crée une session** et envoie le message.

En dessous : **suggestions** (courtes idées, souvent avec emoji) :

- **Mélanger** pour un nouveau tirage
- Chaque pastille **change toutes les 10–20 s** avec une petite animation
- Clic = remplir le champ ; **Ctrl+Z** / **⌘Z** pour annuler le remplissage

> L’assistant **Démarrage rapide** a été retiré. Créez des documents via **Nouveau document** ou le menu gauche.`,

  es_ES: `## Entrada de Agent e ideas sugeridas

Arriba tienes el mismo **cuadro de texto** que en la pestaña **Agent** (referencias @ a archivos/pestañas/carpetas). El texto permanece en inicio hasta que **envías**; entonces se abre **Agent**, se **crea una sesión nueva** y se envía el mensaje.

Debajo: **ideas sugeridas** (breves, a menudo con emoji):

- **Cambiar** para otra selección aleatoria
- Cada chip **rota sola cada 10–20 s** con animación
- Clic = rellenar el campo; **Ctrl+Z** / **⌘Z** deshace el relleno

> El asistente de **inicio rápido** antiguo se ha eliminado. Crea documentos con **Nuevo documento** o el menú izquierdo.`,

  pt_BR: `## Entrada do Agent e sugestões

No topo: o mesmo **campo** da aba **Agent** (referências @ a arquivos/abas/pastas). O texto fica só na home até **enviar**; a app abre **Agent**, **cria uma sessão nova** e envia a mensagem.

Abaixo: **sugestões** (ideias curtas, muitas com emoji):

- **Embaralhar** para outro sorteio
- Cada chip **troca sozinho a cada 10–20 s** com animação
- Clique preenche o campo; **Ctrl+Z** / **⌘Z** desfaz

> O assistente de **início rápido** antigo foi removido. Crie documentos em **Novo documento** ou no menu esquerdo.`,

  ru_RU: `## Ввод Agent и подсказки

Вверху — то же **поле ввода**, что на вкладке **Agent** (ссылки @ на файлы/вкладки/папки). Текст остаётся на главной до **отправки**: откроется **Agent**, будет **создана новая сессия** и сообщение уйдёт.

Ниже — **подсказки-идеи** (короткие фразы, часто с эмодзи):

- **Обновить** — новый случайный набор
- Каждая плашка **сама меняется каждые 10–20 с** с анимацией
- Клик подставляет текст; **Ctrl+Z** / **⌘Z** отменяет подстановку

> Старый мастер **быстрого старта** убран. Создавайте документы через **Создать документ** или левое меню.`
}

function patchFile(langDir, localeKey) {
  const fp = path.join(manualsRoot, langDir, 'home', 'features.md')
  if (!fs.existsSync(fp)) return
  let text = fs.readFileSync(fp, 'utf8')
  const lines = text.split(/\n/)
  let start = -1
  let end = -1
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    if (/^## /.test(L)) {
      if (
        /新建|新規|New Document|Создание документа|Neues Dokument|Nouveau document|Novo Documento|Novo documento|nuevo documento|새 문서|Créer|Criar|空白|Blank|空白ドキュメント/i.test(
          L
        )
      ) {
        end = i
        break
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    if (/^## /.test(L)) {
      if (
        /快速|Quick|クイック|快速開始|Быстрый старт|Início rápido|Início Rápido|Démarrer rapidement|Démarrage rapide|Schnellstart|Guía de inicio rápido|Guía de inicio|빠른 시작|Inicio rápido|Loslegen/i.test(
          L
        )
      ) {
        start = i
        break
      }
    }
  }
  if (start < 0 || end < 0 || end <= start) {
    console.warn('skip (pattern not found)', langDir)
    return
  }
  const insert = REPLACEMENTS[localeKey]
  if (!insert) {
    console.warn('no replacement for', localeKey)
    return
  }
  const before = lines.slice(0, start).join('\n')
  const after = lines.slice(end).join('\n')
  const out = `${before}\n${insert}\n${after}`
  fs.writeFileSync(fp, out, 'utf8')
  console.log('patched', langDir)
}

const map = [
  ['zh_CN', 'zh_CN'],
  ['zh_TW', 'zh_TW'],
  ['en_US', 'en_US'],
  ['ja_JP', 'ja_JP'],
  ['ko_KR', 'ko_KR'],
  ['de_DE', 'de_DE'],
  ['fr_FR', 'fr_FR'],
  ['es_ES', 'es_ES'],
  ['pt_BR', 'pt_BR'],
  ['ru_RU', 'ru_RU']
]
for (const [dir, key] of map) patchFile(dir, key)
