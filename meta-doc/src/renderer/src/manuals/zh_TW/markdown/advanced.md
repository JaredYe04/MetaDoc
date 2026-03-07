# Markdown進階功能

## 概述

在掌握[[markdown.basics|Markdown語法]]和[[markdown.features|Markdown編輯器功能]]後，您可以進一步使用擴展語法與進階特性，如圖表、數學公式、HTML 與屬性等，以豐富文件表現力。

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## 圖表與公式

### 圖表代碼區塊

在文件中可使用代碼區塊插入 Mermaid、PlantUML、ECharts 等圖表，編輯器會即時渲染：

- **Mermaid**：流程圖、序列圖、類別圖、甘特圖等，參見 [[charts.mermaid|Mermaid圖表]]
- **PlantUML**：UML 圖等，參見 [[charts.plantuml|PlantUML圖表]]
- **ECharts**：資料視覺化圖表，參見 [[charts.echarts|ECharts圖表]]

### 數學公式

支援行內公式與區塊級公式：

- **行內公式**：`$...$` 或 `\(...\)`
- **區塊級公式**：`$$...$$` 或 `\[...\]`
- **多行公式**：使用 `aligned`、`equation` 等環境

### LaTeX 公式轉換

編輯器可將部分 LaTeX 公式語法轉換為相容的 Markdown/HTML 形式，便於在非 LaTeX 環境中正確顯示。

## 擴展語法

### 表格進階

- 對齊：在表頭分隔行使用 `:---`、`:---:`、`---:` 設定左、中、右對齊
- 合併：複雜表格可透過 HTML `<table>` 實現
- 從選區建立：在編輯器中選取文字後，可透過右鍵或選單快速插入表格

### 連結與圖片

- **參考式連結**：`[文字][引用名稱]`，在文末定義 `[引用名稱]: URL`
- **標題與屬性**：部分渲染器支援 `(url "title")` 或自訂屬性
- **圖片尺寸**：透過 HTML `<img>` 或擴展語法設定寬高（視渲染器支援而定）

### 註腳

若渲染器支援註腳擴展：

```markdown
正文內容[^1]。

[^1]: 註腳內容。
```

## 與編輯器功能配合

### 右鍵與 AI

- **段落優化**：選取段落使用右鍵「段落優化」或 AI 潤飾，參見 [[features.paragraph-optimization|段落優化功能]]
- **插入圖表**：透過右鍵或 AI 助手插入 Mermaid/ECharts 等代碼區塊，參見 [[charts.introduction|圖表功能介紹]]

### 知識庫與補全

- 啟用[[knowledge-base.usage|知識庫]]後，AI 補全與對話可結合目前文件與知識庫內容
- 在[[ai.completion|AI自動補全]]中設定觸發鍵與最大 Token，提高長文寫作效率

## 最佳實踐

1. **先基礎後擴展**：先熟練[[markdown.basics|基本語法]]，再使用圖表與公式
2. **統一風格**：同一文件內圖表類型、公式寫法盡量統一
3. **相容性**：匯出為 PDF/HTML 時注意圖表與公式的相容性
4. **效能**：單頁內過多或過大的圖表可能影響預覽效能

## 相關文件

- [[markdown.basics|Markdown語法]]
- [[markdown.features|Markdown編輯器功能]]
- [[charts.introduction|圖表功能介紹]]
- [[ai.completion|AI自動補全]]