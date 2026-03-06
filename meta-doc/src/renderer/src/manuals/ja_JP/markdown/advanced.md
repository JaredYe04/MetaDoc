# Markdown高度な機能

## 概要

[[markdown.basics|Markdown構文]]と[[markdown.features|Markdownエディタ機能]]を習得した後、図表、数式、HTMLと属性などの拡張構文と高度な機能を使用して、ドキュメントの表現力を豊かにすることができます。

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## 図表と数式

### 図表コードブロック

ドキュメント内でコードブロックを使用してMermaid、PlantUML、EChartsなどの図表を挿入でき、エディタはリアルタイムでレンダリングします：

- **Mermaid**：フローチャート、シーケンス図、クラス図、ガントチャートなど。詳細は[[charts.mermaid|Mermaid図表]]を参照
- **PlantUML**：UML図など。詳細は[[charts.plantuml|PlantUML図表]]を参照
- **ECharts**：データ可視化図表。詳細は[[charts.echarts|ECharts図表]]を参照

### 数式

インライン数式とブロックレベル数式をサポート：

- **インライン数式**：`$...$` または `\(...\)`
- **ブロックレベル数式**：`$$...$$` または `\[...\]`
- **複数行数式**：`aligned`、`equation`などの環境を使用

### LaTeX数式変換

エディタは一部のLaTeX数式構文を互換性のあるMarkdown/HTML形式に変換し、非LaTeX環境での正しい表示を容易にします。

## 拡張構文

### 表の応用

- 配置：ヘッダー区切り行で `:---`、`:---:`、`---:` を使用して左揃え、中央揃え、右揃えを設定
- 結合：複雑な表はHTML `<table>` で実現可能
- 選択範囲から作成：エディタでテキストを選択後、右クリックまたはメニューから素早く表を挿入

### リンクと画像

- **参照リンク**：`[テキスト][参照名]`、文末で `[参照名]: URL` を定義
- **タイトルと属性**：一部のレンダラーは `(url "title")` またはカスタム属性をサポート
- **画像サイズ**：HTML `<img>` または拡張構文で幅と高さを設定（レンダラーのサポートによる）

### 脚注

レンダラーが脚注拡張をサポートしている場合：

```markdown
本文内容[^1]。

[^1]: 脚注内容。
```

## エディタ機能との連携

### 右クリックとAI

- **段落最適化**：段落を選択し、右クリック「段落最適化」またはAIによる推敲を使用。詳細は[[features.paragraph-optimization|段落最適化機能]]を参照
- **図表挿入**：右クリックまたはAIアシスタントでMermaid/EChartsなどのコードブロックを挿入。詳細は[[charts.introduction|図表機能紹介]]を参照

### ナレッジベースと補完

- [[knowledge-base.usage|ナレッジベース]]を有効にすると、AI補完と対話は現在のドキュメントとナレッジベースの内容を組み合わせることができます
- [[ai.completion|AI自動補完]]でトリガーキーと最大トークンを設定し、長文作成の効率を向上

## ベストプラクティス

1. **基本から拡張へ**：まず[[markdown.basics|基本構文]]に習熟し、その後図表と数式を使用
2. **スタイル統一**：同一ドキュメント内では図表タイプ、数式の書き方を可能な限り統一
3. **互換性**：PDF/HTMLにエクスポートする際は、図表と数式の互換性に注意
4. **パフォーマンス**：1ページ内に過多または過大な図表があると、プレビューのパフォーマンスに影響する可能性があります

## 関連ドキュメント

- [[markdown.basics|Markdown構文]]
- [[markdown.features|Markdownエディタ機能]]
- [[charts.introduction|図表機能紹介]]
- [[ai.completion|AI自動補完]]