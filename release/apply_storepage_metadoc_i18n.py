#!/usr/bin/env python3
"""
Merge MetaDoc-supported Steam store locales into release/storepage.json.

Fills Steam store copy for MetaDoc-supported UI languages plus common Steam extras
(russian, spanish, tchinese). Steam keys patched: see PATCHES below.

Steam keys: schinese, tchinese, english, japanese, koreana, german, french, spanish, russian, …

Usage:
  python apply_storepage_metadoc_i18n.py           # write storepage.json
  python apply_storepage_metadoc_i18n.py --check # verify keys only
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STOREPAGE = ROOT / "storepage.json"

# Long-form store copy (BBCode-style tags; \r\n like english block)
ABOUT_EN = (
    "[p][b]An AI-powered next-generation Markdown editor, designed for efficient writing, "
    "structured creation, and academic work.[/b][/p][h2]Use Cases[/h2][p]📚 Organizing lecture notes\r\n"
    "💡 Summarizing study materials\r\n🧪 Writing lab reports\r\n📝 Creating blogs and social media content\r\n"
    "💼 Designing and exporting resumes[/p][h2]Key Features[/h2][h2]✍️ Efficient Writing Experience[/h2][p]"
    "Split-screen preview / real-time rendering / WYSIWYG editing\r\n"
    "Full Markdown support (standard + extended)\r\n"
    "Built-in LaTeX environment (for formulas, papers, technical documents)[/p][h2]🤖 AI-Powered Writing Enhancement "
    "(Deeply Integrated)[/h2][p]Paragraph-level AI: refine / expand / rewrite\r\n"
    "Real-time auto-completion and content prediction\r\n"
    "Full-document understanding with Q&amp;A analysis\r\n"
    "One-click image generation and insertion[/p][h2]🧠 Visual Outline (Core Feature)[/h2][p]"
    "Tree-structured document organization\r\nDrag-and-drop paragraph reordering\r\n"
    "One-click sub-section generation\r\nReusable content modules[/p][p]👉 Transform long-form writing from [i]linear "
    "editing[/i] to [i]structured construction[/i][/p][h2]📊 Writing Analytics[/h2][p]Word cloud visualization\r\n"
    "Word frequency analysis\r\nStructure distribution insights[/p][p]👉 Improve your writing with data, "
    "not guesswork[/p][h2]📐 Professional LaTeX Support[/h2][p]All-in-one editing, compiling, and previewing\r\n"
    "Handwritten formula recognition → automatic LaTeX conversion\r\n"
    "Ideal for academic papers, research, and technical documentation[/p][h2]🔄 Multi-format Import &amp; Export[/h2]"
    "[p]Export to: Word / PDF / LaTeX / HTML\r\nSupports PDF → Markdown conversion\r\n"
    "Flexible for various writing workflows[/p][h2]🎨 Customizable Writing Environment[/h2][p]Dark / Light modes\r\n"
    "Multiple theme colors\r\nFocus Mode (minimal, distraction-free interface)[/p][h2]🧩 AI Multi-Agent System "
    "(Core Capability)[/h2][p]Built-in multi-agent collaboration system for complex tasks:[/p][p]Content generation\r\n"
    "Information retrieval\r\nImage generation\r\nTask decomposition and planning[/p][p]👉 Input your goal → "
    "Automatically decompose → Multiple agents collaborate to complete it[/p][h2]Why Choose MetaDoc[/h2][p]🧠 AI "
    "doesn’t just assist — it actively participates in your writing process[/p][p]🧱 Outline + content integration, "
    "perfect for long-form writing and academic work[/p][p]🔄 One tool covers the entire writing workflow[/p][p]⚡ "
    "Designed for efficiency, reducing repetitive tasks[/p]"
)

SHORT_EN = (
    "An AI-powered Markdown editor that brings writing, organization, and optimization into one place, helping you "
    "quickly create lecture notes, lab reports, and blog posts, with seamless DOCX and LaTeX export, built for "
    "academic writing and long-form content without the hassle of repetitive editing."
)

NOTES_EN = (
    "Some AI features require a third-party large language model (LLM) API provider (e.g. OpenAI or a locally deployed "
    "model). You must configure these services yourself. Future versions may support on-device AI inference; when "
    "enabled, a discrete GPU is recommended for the best experience."
)

ABOUT_FR = (
    "[p][b]Éditeur Markdown nouvelle génération assisté par l’IA, pensé pour une rédaction efficace, une création "
    "structurée et le travail académique.[/b][/p][h2]Cas d’usage[/h2][p]📚 Prise de notes de cours\r\n"
    "💡 Synthèse de supports d’étude\r\n🧪 Rédaction de comptes rendus de laboratoire\r\n"
    "📝 Blogs et contenus pour les réseaux sociaux\r\n💼 Conception et export de CV[/p][h2]Fonctionnalités "
    "principales[/h2][h2]✍️ Expérience d’écriture efficace[/h2][p]Aperçu fractionné / rendu en temps réel / "
    "édition WYSIWYG\r\nPrise en charge complète de Markdown (standard + extensions)\r\n"
    "Environnement LaTeX intégré (formules, articles, documents techniques)[/p][h2]🤖 Assistance à l’écriture par IA "
    "(intégration poussée)[/h2][p]IA au niveau du paragraphe : affiner / développer / reformuler\r\n"
    "Complétion automatique et prédiction de contenu en temps réel\r\n"
    "Compréhension du document entier avec analyse Q&amp;A\r\nGénération et insertion d’images en un clic[/p]"
    "[h2]🧠 Plan visuel (fonction clé)[/h2][p]Organisation arborescente du document\r\n"
    "Réorganisation des paragraphes par glisser-déposer\r\nGénération de sous-sections en un clic\r\n"
    "Modules de contenu réutilisables[/p][p]👉 Passez de l’édition [i]linéaire[/i] des longs textes à une "
    "construction [i]structurée[/i][/p][h2]📊 Analyses d’écriture[/h2][p]Nuage de mots\r\n"
    "Analyse de fréquence des mots\r\nIndicateurs sur la structure[/p][p]👉 Améliorez votre texte avec des données, "
    "pas au hasard[/p][h2]📐 Prise en charge LaTeX professionnelle[/h2][p]Édition, compilation et aperçu réunis\r\n"
    "Reconnaissance de formules manuscrites → conversion LaTeX automatique\r\n"
    "Idéal pour articles, recherche et documentation technique[/p][h2]🔄 Import et export multiformats[/h2][p]"
    "Export : Word / PDF / LaTeX / HTML\r\nPrise en charge de la conversion PDF → Markdown\r\n"
    "S’adapte à différents flux de rédaction[/p][h2]🎨 Environnement personnalisable[/h2][p]Modes clair et sombre\r\n"
    "Plusieurs thèmes de couleur\r\nMode concentration (interface épurée)[/p][h2]🧩 Système multi-agents IA "
    "(capacité centrale)[/h2][p]Système collaboratif multi-agents intégré pour les tâches complexes :[/p][p]"
    "Génération de contenu\r\nRecherche d’informations\r\nGénération d’images\r\n"
    "Décomposition et planification des tâches[/p][p]👉 Saisissez votre objectif → décomposition automatique → "
    "plusieurs agents collaborent pour le réaliser[/p][h2]Pourquoi choisir MetaDoc[/h2][p]🧠 L’IA n’assiste pas "
    "seulement : elle participe activement à votre écriture[/p][p]🧱 Plan et contenu réunis, idéal pour les longs "
    "textes et le travail académique[/p][p]🔄 Un seul outil couvre tout le flux de rédaction[/p][p]⚡ Pensé pour "
    "l’efficacité et pour réduire les tâches répétitives[/p]"
)

SHORT_FR = (
    "Éditeur Markdown assisté par l’IA qui réunit rédaction, organisation et optimisation : notes de cours, comptes "
    "rendus de labo et billets de blog, avec export DOCX et LaTeX fluide — conçu pour l’écriture académique et les "
    "longs contenus, sans le stress des allers-retours incessants."
)

ABOUT_DE = (
    "[p][b]Ein KI-gestützter Markdown-Editor der nächsten Generation – für effizientes Schreiben, strukturiertes "
    "Erstellen und wissenschaftliches Arbeiten.[/b][/p][h2]Einsatzgebiete[/h2][p]📚 Vorlesungsmitschriften ordnen\r\n"
    "💡 Lernmaterial zusammenfassen\r\n🧪 Laborberichte verfassen\r\n📝 Blogs und Social-Media-Inhalte\r\n"
    "💼 Lebensläufe gestalten und exportieren[/p][h2]Hauptfunktionen[/h2][h2]✍️ Effizientes Schreiben[/h2][p]"
    "Geteilte Vorschau / Echtzeit-Rendering / WYSIWYG-Bearbeitung\r\nVolle Markdown-Unterstützung (Standard + "
    "Erweiterungen)\r\nIntegrierte LaTeX-Umgebung (Formeln, Papers, technische Dokumente)[/p][h2]🤖 KI-Schreibhilfe "
    "(tief integriert)[/h2][p]KI auf Absatzebene: verfeinern / erweitern / umschreiben\r\n"
    "Echtzeit-Autovervollständigung und Inhaltsvorhersage\r\nVerständnis des gesamten Dokuments mit Q&amp;A-Analyse\r\n"
    "Bilder mit einem Klick erzeugen und einfügen[/p][h2]🧠 Visuelle Gliederung (Kernfunktion)[/h2][p]"
    "Baumartige Dokumentstruktur\r\nAbsätze per Drag-and-Drop sortieren\r\nUnterabschnitte mit einem Klick erzeugen\r\n"
    "Wiederverwendbare Inhaltsmodule[/p][p]👉 Vom [i]linearen Editieren[/i] zum [i]strukturierten Aufbau[/i] bei "
    "Langtexten[/p][h2]📊 Schreib-Analysen[/h2][p]Wortwolken\r\nWorthäufigkeit\r\nEinblicke in die "
    "Textstruktur[/p][p]👉 Mit Daten schreiben verbessern, nicht nach Bauchgefühl[/p][h2]📐 Professionelle "
    "LaTeX-Unterstützung[/h2][p]Bearbeiten, Kompilieren und Vorschau in einem\r\n"
    "Handschriftliche Formeln erkennen → automatisch nach LaTeX\r\nIdeal für Papers, Forschung und technische "
    "Docs[/p][h2]🔄 Import &amp; Export vieler Formate[/h2][p]Export: Word / PDF / LaTeX / HTML\r\n"
    "PDF → Markdown\r\nFlexibel für unterschiedliche Workflows[/p][h2]🎨 Anpassbare Umgebung[/h2][p]Hell- und "
    "Dunkelmodus\r\nMehrere Farbthemen\r\nFokusmodus (reduzierte Ablenkung)[/p][h2]🧩 KI-Multi-Agent-System "
    "(Kernkompetenz)[/h2][p]Integriertes Multi-Agenten-System für komplexe Aufgaben:[/p][p]Inhaltserzeugung\r\n"
    "Informationsbeschaffung\r\nBilderzeugung\r\nAufgaben zerlegen und planen[/p][p]👉 Ziel eingeben → automatisch "
    "zerlegen → mehrere Agenten arbeiten zusammen[/p][h2]Warum MetaDoc[/h2][p]🧠 KI unterstützt nicht nur – sie "
    "wirkt aktiv im Schreibprozess mit[/p][p]🧱 Gliederung und Inhalt zusammen – ideal für Langtexte und "
    "Wissenschaft[/p][p]🔄 Ein Werkzeug für den gesamten Schreib-Workflow[/p][p]⚡ Auf Effizienz ausgelegt, weniger "
    "Routinearbeit[/p]"
)

SHORT_DE = (
    "Ein KI-gestützter Markdown-Editor, der Schreiben, Ordnen und Optimieren vereint: schnell Mitschriften, "
    "Laborberichte und Blogposts – mit nahtlosem DOCX- und LaTeX-Export, für akademisches Schreiben und lange "
    "Texte ohne ständiges Hin- und Herbearbeiten."
)

ABOUT_JA = (
    "[p][b]AI を活用した次世代 Markdown エディタ。効率的な執筆、構造化された制作、学術用途向けに設計されています。[/b][/p]"
    "[h2]用途[/h2][p]📚 講義ノートの整理\r\n💡 学習資料の要約\r\n🧪 実験レポートの作成\r\n"
    "📝 ブログ・SNS 投稿の作成\r\n💼 履歴書の作成と書き出し[/p][h2]主な機能[/h2][h2]✍️ 快適な執筆体験[/h2][p]"
    "分割プレビュー／リアルタイム描画／WYSIWYG 編集\r\nMarkdown をフルサポート（標準＋拡張）\r\n"
    "LaTeX 環境を内蔵（数式・論文・技術文書）[/p][h2]🤖 AI 執筆支援（深く統合）[/h2][p]段落単位の AI：推敲／"
    "追記／書き換え\r\nリアルタイムの自動補完と内容予測\r\n全文理解と Q&amp;A 分析\r\n"
    "ワンクリックで画像を生成して挿入[/p][h2]🧠 ビジュアル・アウトライン（中核機能）[/h2][p]ツリー構造で文書を管理\r\n"
    "ドラッグ＆ドロップで段落を並べ替え\r\nワンクリックで小見出しを生成\r\n再利用可能なコンテンツモジュール[/p][p]👉 "
    "長文執筆を[i]線形編集[/i]から[i]構造化された組み立て[/i]へ[/p][h2]📊 ライティング分析[/h2][p]ワードクラウド\r\n"
    "語頻度分析\r\n構成の分布インサイト[/p][p]👉 感覚ではなくデータで文章を改善[/p][h2]📐 本格的な LaTeX 対応[/h2][p]"
    "編集・コンパイル・プレビューを一体で\r\n手書き数式の認識 → 自動で LaTeX へ\r\n論文・研究・技術文書に最適[/p]"
    "[h2]🔄 多形式のインポート／エクスポート[/h2][p]書き出し：Word／PDF／LaTeX／HTML\r\nPDF → Markdown 変換に対応\r\n"
    "さまざまな執筆フローに対応[/p][h2]🎨 カスタマイズ可能な執筆環境[/h2][p]ダーク／ライトモード\r\n複数のテーマ色\r\n"
    "集中モード（ミニマルで邪魔のない UI）[/p][h2]🧩 AI マルチエージェント（中核機能）[/h2][p]複雑なタスク向けの"
    "マルチエージェント協調を内蔵：[/p][p]コンテンツ生成\r\n情報取得\r\n画像生成\r\nタスクの分解と計画[/p][p]👉 "
    "目的を入力 → 自動分解 → 複数エージェントが協働して完了[/p][h2]MetaDoc を選ぶ理由[/h2][p]🧠 AI は補助にとどまらず、"
    "執筆プロセスに積極的に参加します[/p][p]🧱 アウトラインと本文が一体。長文・学術執筆に最適[/p][p]🔄 ひとつのツールで"
    "執筆ワークフロー全体をカバー[/p][p]⚡ 効率を重視し、反復作業を減らします[/p]"
)

SHORT_JA = (
    "執筆・整理・最適化をひとつにまとめた AI 搭載 Markdown エディタ。講義ノート、実験レポート、ブログ記事を素早く作成。"
    "DOCX や LaTeX への書き出しもスムーズ。学術執筆や長文制作向けで、同じ修正の繰り返しに悩まされにくい設計です。"
)

ABOUT_KO = (
    "[p][b]AI 기반 차세대 Markdown 편집기로, 효율적인 글쓰기, 구조화된 작성, 학술 작업을 위해 설계되었습니다.[/b][/p]"
    "[h2]활용 사례[/h2][p]📚 강의 노트 정리\r\n💡 학습 자료 요약\r\n🧪 실험 보고서 작성\r\n"
    "📝 블로그·SNS 콘텐츠\r\n💼 이력서 작성·보내기[/p][h2]주요 기능[/h2][h2]✍️ 효율적인 작성 경험[/h2][p]"
    "분할 미리보기 / 실시간 렌더링 / WYSIWYG 편집\r\nMarkdown 완전 지원(표준 + 확장)\r\n"
    "LaTeX 환경 내장(수식, 논문, 기술 문서)[/p][h2]🤖 AI 글쓰기 향상(깊은 통합)[/h2][p]문단 단위 AI: 다듬기 / "
    "확장 / 재작성\r\n실시간 자동 완성 및 내용 예측\r\n전체 문서 이해 및 Q&amp;A 분석\r\n"
    "원클릭 이미지 생성 및 삽입[/p][h2]🧠 시각적 아웃라인(핵심 기능)[/h2][p]트리 구조로 문서 관리\r\n"
    "드래그 앤 드롭으로 문단 순서 변경\r\n원클릭 하위 절 생성\r\n재사용 가능한 콘텐츠 모듈[/p][p]👉 장문 작성을 "
    "[i]선형 편집[/i]에서 [i]구조화된 구성[/i]으로[/p][h2]📊 작성 분석[/h2][p]워드 클라우드\r\n"
    "단어 빈도 분석\r\n구조 분포 인사이트[/p][p]👉 감이 아닌 데이터로 글을 개선[/p][h2]📐 전문 LaTeX 지원[/h2][p]"
    "편집·컴파일·미리보기 일원화\r\n손글씨 수식 인식 → 자동 LaTeX 변환\r\n논문·연구·기술 문서에 적합[/p]"
    "[h2]🔄 다중 형식 가져오기·보내기[/h2][p]보내기: Word / PDF / LaTeX / HTML\r\nPDF → Markdown 변환 지원\r\n"
    "다양한 작성 워크플로에 맞춤[/p][h2]🎨 맞춤형 작성 환경[/h2][p]다크·라이트 모드\r\n여러 테마 색상\r\n"
    "포커스 모드(방해 요소 최소 UI)[/p][h2]🧩 AI 멀티 에이전트 시스템(핵심 역량)[/h2][p]복잡한 작업을 위한 "
    "멀티 에이전트 협업 내장:[/p][p]콘텐츠 생성\r\n정보 검색\r\n이미지 생성\r\n작업 분해 및 계획[/p][p]👉 목표 입력 → "
    "자동 분해 → 여러 에이전트가 협력 완료[/p][h2]MetaDoc을 선택하는 이유[/h2][p]🧠 AI는 보조를 넘어 작성 과정에 "
    "적극 참여합니다[/p][p]🧱 아웃라인과 본문이 하나로, 장문·학술 글쓰기에 적합[/p][p]🔄 하나의 도구로 전체 작성 "
    "워크플로를 포괄[/p][p]⚡ 효율을 위해 설계되어 반복 작업을 줄입니다[/p]"
)

SHORT_KO = (
    "글쓰기·정리·최적화를 한곳에 모은 AI 기반 Markdown 편집기입니다. 강의 노트, 실험 보고서, 블로그 글을 빠르게 만들고, "
    "DOCX·LaTeX 등으로 매끄럽게 보냅니다. 학술 글쓰기와 장문 콘텐츠에 맞춰, 같은 수정을 반복하는 부담을 줄였습니다."
)

ABOUT_ES = (
    "[p][b]Editor Markdown de nueva generación con IA, pensado para escribir con eficiencia, crear con estructura y "
    "trabajar en el ámbito académico.[/b][/p][h2]Casos de uso[/h2][p]📚 Organizar apuntes de clase\r\n"
    "💡 Resumir material de estudio\r\n🧪 Redactar informes de laboratorio\r\n"
    "📝 Crear blogs y contenido para redes sociales\r\n💼 Diseñar y exportar currículums[/p][h2]Funciones "
    "principales[/h2][h2]✍️ Experiencia de escritura eficiente[/h2][p]Vista dividida / vista previa en tiempo real / "
    "edición WYSIWYG\r\nCompatibilidad completa con Markdown (estándar + extensiones)\r\n"
    "Entorno LaTeX integrado (fórmulas, artículos, documentación técnica)[/p][h2]🤖 Mejora de escritura con IA "
    "(integración profunda)[/h2][p]IA a nivel de párrafo: refinar / ampliar / reescribir\r\n"
    "Autocompletado en tiempo real y predicción de contenido\r\nComprensión del documento completo con análisis "
    "Q&amp;A\r\nGeneración e inserción de imágenes con un clic[/p][h2]🧠 Esquema visual (función clave)[/h2][p]"
    "Organización del documento en árbol\r\nReordenar párrafos arrastrando y soltando\r\n"
    "Generar subsecciones con un clic\r\nMódulos de contenido reutilizables[/p][p]👉 Pase de la edición [i]lineal[/i] "
    "de textos largos a una construcción [i]estructurada[/i][/p][h2]📊 Análisis de escritura[/h2][p]Nube de "
    "palabras\r\nFrecuencia de términos\r\nInformación sobre la estructura[/p][p]👉 Mejore el texto con datos, "
    "no a ciegas[/p][h2]📐 Soporte LaTeX profesional[/h2][p]Edición, compilación y vista previa en un solo flujo\r\n"
    "Reconocimiento de fórmulas manuscritas → conversión automática a LaTeX\r\n"
    "Ideal para artículos, investigación y documentación técnica[/p][h2]🔄 Importación y exportación multiformato[/h2]"
    "[p]Exportar a: Word / PDF / LaTeX / HTML\r\nConversión de PDF a Markdown\r\n"
    "Se adapta a distintos flujos de trabajo[/p][h2]🎨 Entorno personalizable[/h2][p]Modos claro y oscuro\r\n"
    "Varios temas de color\r\nModo concentración (interfaz mínima y sin distracciones)[/p][h2]🧩 Sistema multiagente "
    "de IA (capacidad central)[/h2][p]Sistema colaborativo multiagente integrado para tareas complejas:[/p][p]"
    "Generación de contenido\r\nRecuperación de información\r\nGeneración de imágenes\r\n"
    "Descomposición y planificación de tareas[/p][p]👉 Indique su objetivo → descomposición automática → varios "
    "agentes colaboran para completarlo[/p][h2]Por qué MetaDoc[/h2][p]🧠 La IA no solo ayuda: participa activamente "
    "en su proceso de escritura[/p][p]🧱 Esquema y contenido unidos, ideal para textos largos y trabajo académico[/p][p]"
    "🔄 Una sola herramienta cubre todo el flujo de escritura[/p][p]⚡ Pensado para la eficiencia y para reducir "
    "tareas repetitivas[/p]"
)

SHORT_ES = (
    "Editor Markdown con IA que reúne escritura, organización y optimización: apuntes, informes de laboratorio y "
    "entradas de blog, con exportación fluida a DOCX y LaTeX, pensado para la escritura académica y contenidos largos "
    "sin el agotamiento de editar una y otra vez."
)

NOTES_ES = (
    "Algunas funciones de IA requieren un proveedor de API de modelo de lenguaje grande (LLM) de terceros (p. ej., "
    "OpenAI o un modelo alojado localmente). Debe configurar estos servicios por su cuenta. Las versiones futuras "
    "pueden admitir inferencia de IA en el dispositivo; en ese caso, se recomienda una GPU dedicada para el mejor "
    "rendimiento."
)

ABOUT_RU = (
    "[p][b]Редактор Markdown нового поколения с ИИ для эффективного письма, структурированного создания и "
    "академической работы.[/b][/p][h2]Сценарии использования[/h2][p]📚 Ведение конспектов лекций\r\n"
    "💡 Систематизация учебных материалов\r\n🧪 Отчёты по лабораторным работам\r\n"
    "📝 Блоги и контент для соцсетей\r\n💼 Оформление и экспорт резюме[/p][h2]Основные возможности[/h2]"
    "[h2]✍️ Эффективное письмо[/h2][p]Разделённый предпросмотр / мгновенный рендер / редактирование WYSIWYG\r\n"
    "Полная поддержка Markdown (стандарт + расширения)\r\nВстроенная среда LaTeX (формулы, статьи, техдокументация)[/p]"
    "[h2]🤖 Поддержка письма с ИИ (глубокая интеграция)[/h2][p]ИИ на уровне абзаца: улучшить / расширить / "
    "переписать\r\nАвтодополнение и прогноз содержимого в реальном времени\r\nПонимание всего документа и анализ в "
    "формате Q&amp;A\r\nГенерация и вставка изображений в один клик[/p][h2]🧠 Визуальная структура (ключевая "
    "функция)[/h2][p]Древовидная организация документа\r\nПерестановка абзацев перетаскиванием\r\n"
    "Подразделы в один клик\r\nПовторно используемые модули контента[/p][p]👉 Переход от [i]линейного "
    "редактирования[/i] длинных текстов к [i]структурированной сборке[/i][/p][h2]📊 Аналитика текста[/h2][p]"
    "Облако слов\r\nЧастотность слов\r\nИнсайты по структуре[/p][p]👉 Улучшайте текст на основе данных, а не "
    "наугад[/p][h2]📐 Профессиональная поддержка LaTeX[/h2][p]Редактирование, компиляция и предпросмотр в одном "
    "месте\r\nРаспознавание рукописных формул → автоматическая конвертация в LaTeX\r\n"
    "Подходит для статей, исследований и техдокументации[/p][h2]🔄 Импорт и экспорт в разных форматах[/h2][p]"
    "Экспорт: Word / PDF / LaTeX / HTML\r\nПоддержка преобразования PDF → Markdown\r\n"
    "Гибко под разные рабочие процессы[/p][h2]🎨 Настраиваемая среда[/h2][p]Тёмная и светлая темы\r\n"
    "Несколько цветовых тем\r\nРежим фокуса (минималистичный интерфейс)[/p][h2]🧩 Мультиагентная ИИ-система "
    "(ключевая возможность)[/h2][p]Встроенная мультиагентная кооперация для сложных задач:[/p][p]Генерация "
    "контента\r\nПоиск информации\r\nГенерация изображений\r\nРазбиение задач и планирование[/p][p]👉 Введите цель → "
    "автоматическое разбиение → несколько агентов выполняют задачу совместно[/p][h2]Почему MetaDoc[/h2][p]🧠 ИИ не "
    "просто подсказывает — активно участвует в процессе письма[/p][p]🧱 Структура и текст вместе: удобно для длинных "
    "работ и науки[/p][p]🔄 Один инструмент на весь цикл письма[/p][p]⚡ Ориентация на эффективность и меньше "
    "рутины[/p]"
)

SHORT_RU = (
    "Редактор Markdown с ИИ, объединяющий написание, упорядочивание и улучшение текста: конспекты, лабораторные "
    "отчёты и посты в блог с удобным экспортом в DOCX и LaTeX — для академического письма и длинных материалов без "
    "бесконечных правок."
)

NOTES_RU = (
    "Для части функций ИИ нужен сторонний поставщик API большой языковой модели (LLM), например OpenAI или локально "
    "развёрнутая модель; эти службы настраиваются самостоятельно. В будущих версиях может появиться локальный вывод "
    "ИИ; для наилучшей производительности рекомендуется дискретная видеокарта."
)

ABOUT_TW = (
    "[p][b]由 AI 驅動的新一代 Markdown 文件編輯器，專為高效寫作、結構化創作與學術寫作而設計。[/b][/p][h2]使用情境[/h2][p]"
    "📚 整理課堂筆記\r\n💡 歸納複習資料\r\n🧪 撰寫實驗報告\r\n📝 經營部落格／社群內容\r\n💼 履歷設計與匯出[/p][h2]主要功能[/h2]"
    "[h2]✍️ 高效寫作體驗[/h2][p]分割預覽／即時算繪／所見即所得（WYSIWYG）編輯\r\n完整支援 Markdown（標準＋擴充）\r\n"
    "內建 LaTeX 環境（公式、論文、技術文件）[/p][h2]🤖 AI 寫作增強（深度整合）[/h2][p]段落級 AI：優化／擴寫／改寫\r\n"
    "即時智慧續寫與內容預測\r\n全文理解與問答分析\r\n一鍵產生並插入配圖[/p][h2]🧠 視覺化大綱（核心特色）[/h2][p]"
    "以樹狀結構管理文章\r\n拖曳調整段落順序\r\n一鍵產生子章節\r\n內容模組化重複利用[/p][p]👉 讓長文寫作從「線性編輯」"
    "升級為「結構化建構」[/p][h2]📊 寫作資料分析[/h2][p]文字雲\r\n詞頻統計\r\n結構分布分析[/p][p]👉 用資料優化表達，"
    "而不是憑感覺修改[/p][h2]📐 專業 LaTeX 支援[/h2][p]編輯／編譯／預覽一體化\r\n手寫公式辨識 → 自動轉為 LaTeX\r\n"
    "適用於論文、科研、技術文件[/p][h2]🔄 多格式匯入與匯出[/h2][p]匯出：Word／PDF／LaTeX／HTML\r\n支援 PDF → Markdown "
    "轉換\r\n彈性配合不同寫作流程[/p][h2]🎨 自訂創作環境[/h2][p]深色／淺色模式\r\n多種主題色\r\n專注模式（極簡寫作介面）[/p]"
    "[h2]🧩 AI Multi-Agent 系統（核心能力）[/h2][p]內建多智慧體協作系統，支援複雜任務自動完成：[/p][p]寫作產生\r\n"
    "資料檢索\r\n影像產生\r\n任務拆解與規劃[/p][p]👉 輸入需求 → 自動拆解 → 多 Agent 協同完成[/p][h2]為什麼選擇 "
    "MetaDoc[/h2][p]🧠 AI 不只是輔助，而是直接參與寫作流程[/p][p]🧱 大綱＋內容一體化，適合長文與論文[/p][p]🔄 一套工具"
    "涵蓋所有格式與流程[/p][p]⚡ 面向效率設計，減少重複操作[/p]"
)

SHORT_TW = (
    "一款 AI 驅動的 Markdown 編輯器，集寫作、整理與優化於一身，協助您快速完成課堂筆記、實驗報告與部落格創作，支援 "
    "DOCX、LaTeX 等格式無縫轉換，天生適合學術寫作與內容產製，告別低效與反覆修改。"
)

NOTES_TW = (
    "部分 AI 功能需第三方大型語言模型（LLM）API 供應商支援（如 OpenAI、本機部署模型等），須由使用者自行設定相關服務。"
    "未來版本可能支援本機 AI 推論功能，啟用時建議配備獨立顯示卡以獲得最佳效能體驗。"
)


PATCHES: dict[str, dict[str, str]] = {
    "english": {
        "app[content][sysreqs][mac][min][osversion]": "macOS 11 (Big Sur) or later",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 or Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "Integrated graphics",
        "app[content][sysreqs][mac][min][soundcard]": "Not required",
        "app[content][sysreqs][mac][min][notes]": NOTES_EN,
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 or equivalent",
        "app[content][sysreqs][windows][min][graphics]": "Integrated graphics",
        "app[content][sysreqs][windows][min][soundcard]": "Not required",
        "app[content][sysreqs][windows][min][vrsupport]": "Not supported",
        "app[content][sysreqs][windows][min][notes]": NOTES_EN,
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 or later",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 or equivalent",
        "app[content][sysreqs][linux][min][graphics]": "Integrated graphics",
        "app[content][sysreqs][linux][min][soundcard]": "Not required",
        "app[content][sysreqs][linux][min][vrsupport]": "Not supported",
        "app[content][sysreqs][linux][min][notes]": NOTES_EN,
    },
    "french": {
        "app[content][about]": ABOUT_FR,
        "app[content][short_description]": SHORT_FR,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11 (Big Sur) ou ultérieur",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 ou Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "Graphiques intégrés",
        "app[content][sysreqs][mac][min][soundcard]": "Non requis",
        "app[content][sysreqs][mac][min][notes]": (
            "Certaines fonctions d’IA nécessitent un fournisseur d’API de grand modèle de langage (LLM) tiers "
            "(par ex. OpenAI ou un modèle déployé localement). Vous devez configurer ces services vous-même. Les "
            "versions futures pourront prendre en charge l’inférence IA locale ; dans ce cas, un GPU dédié est "
            "recommandé pour de meilleures performances."
        ),
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 ou équivalent",
        "app[content][sysreqs][windows][min][graphics]": "Graphiques intégrés",
        "app[content][sysreqs][windows][min][soundcard]": "Non requis",
        "app[content][sysreqs][windows][min][vrsupport]": "Non pris en charge",
        "app[content][sysreqs][windows][min][notes]": (
            "Certaines fonctions d’IA nécessitent un fournisseur d’API de grand modèle de langage (LLM) tiers "
            "(par ex. OpenAI ou un modèle déployé localement). Vous devez configurer ces services vous-même. Les "
            "versions futures pourront prendre en charge l’inférence IA locale ; dans ce cas, un GPU dédié est "
            "recommandé pour de meilleures performances."
        ),
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 ou ultérieur",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 ou équivalent",
        "app[content][sysreqs][linux][min][graphics]": "Graphiques intégrés",
        "app[content][sysreqs][linux][min][soundcard]": "Non requis",
        "app[content][sysreqs][linux][min][vrsupport]": "Non pris en charge",
        "app[content][sysreqs][linux][min][notes]": (
            "Certaines fonctions d’IA nécessitent un fournisseur d’API de grand modèle de langage (LLM) tiers "
            "(par ex. OpenAI ou un modèle déployé localement). Vous devez configurer ces services vous-même. Les "
            "versions futures pourront prendre en charge l’inférence IA locale ; dans ce cas, un GPU dédié est "
            "recommandé pour de meilleures performances."
        ),
    },
    "german": {
        "app[content][about]": ABOUT_DE,
        "app[content][short_description]": SHORT_DE,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11 (Big Sur) oder neuer",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 oder Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "Integrierte Grafik",
        "app[content][sysreqs][mac][min][soundcard]": "Nicht erforderlich",
        "app[content][sysreqs][mac][min][notes]": (
            "Einige KI-Funktionen erfordern einen Drittanbieter für LLM-APIs (z. B. OpenAI oder ein lokal "
            "betriebenes Modell). Diese Dienste müssen Sie selbst einrichten. Zukünftige Versionen können lokale "
            "KI-Inferenz unterstützen; dafür wird für beste Leistung eine dedizierte GPU empfohlen."
        ),
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 oder gleichwertig",
        "app[content][sysreqs][windows][min][graphics]": "Integrierte Grafik",
        "app[content][sysreqs][windows][min][soundcard]": "Nicht erforderlich",
        "app[content][sysreqs][windows][min][vrsupport]": "Nicht unterstützt",
        "app[content][sysreqs][windows][min][notes]": (
            "Einige KI-Funktionen erfordern einen Drittanbieter für LLM-APIs (z. B. OpenAI oder ein lokal "
            "betriebenes Modell). Diese Dienste müssen Sie selbst einrichten. Zukünftige Versionen können lokale "
            "KI-Inferenz unterstützen; dafür wird für beste Leistung eine dedizierte GPU empfohlen."
        ),
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 oder neuer",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 oder gleichwertig",
        "app[content][sysreqs][linux][min][graphics]": "Integrierte Grafik",
        "app[content][sysreqs][linux][min][soundcard]": "Nicht erforderlich",
        "app[content][sysreqs][linux][min][vrsupport]": "Nicht unterstützt",
        "app[content][sysreqs][linux][min][notes]": (
            "Einige KI-Funktionen erfordern einen Drittanbieter für LLM-APIs (z. B. OpenAI oder ein lokal "
            "betriebenes Modell). Diese Dienste müssen Sie selbst einrichten. Zukünftige Versionen können lokale "
            "KI-Inferenz unterstützen; dafür wird für beste Leistung eine dedizierte GPU empfohlen."
        ),
    },
    "japanese": {
        "app[content][about]": ABOUT_JA,
        "app[content][short_description]": SHORT_JA,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11（Big Sur）以降",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 または Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "統合 GPU",
        "app[content][sysreqs][mac][min][soundcard]": "不要",
        "app[content][sysreqs][mac][min][notes]": (
            "一部の AI 機能は、サードパーティの大規模言語モデル（LLM）API プロバイダー（OpenAI やローカル運用モデルなど）"
            "の利用が必要です。ユーザー自身でサービスを設定してください。将来のバージョンではオンデバイス推論に対応する"
            "場合があり、その際は快適な体験のためにディスクリート GPU を推奨します。"
        ),
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 または同等",
        "app[content][sysreqs][windows][min][graphics]": "統合 GPU",
        "app[content][sysreqs][windows][min][soundcard]": "不要",
        "app[content][sysreqs][windows][min][vrsupport]": "非対応",
        "app[content][sysreqs][windows][min][notes]": (
            "一部の AI 機能は、サードパーティの大規模言語モデル（LLM）API プロバイダー（OpenAI やローカル運用モデルなど）"
            "の利用が必要です。ユーザー自身でサービスを設定してください。将来のバージョンではオンデバイス推論に対応する"
            "場合があり、その際は快適な体験のためにディスクリート GPU を推奨します。"
        ),
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 以降",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 または同等",
        "app[content][sysreqs][linux][min][graphics]": "統合 GPU",
        "app[content][sysreqs][linux][min][soundcard]": "不要",
        "app[content][sysreqs][linux][min][vrsupport]": "非対応",
        "app[content][sysreqs][linux][min][notes]": (
            "一部の AI 機能は、サードパーティの大規模言語モデル（LLM）API プロバイダー（OpenAI やローカル運用モデルなど）"
            "の利用が必要です。ユーザー自身でサービスを設定してください。将来のバージョンではオンデバイス推論に対応する"
            "場合があり、その際は快適な体験のためにディスクリート GPU を推奨します。"
        ),
    },
    "koreana": {
        "app[content][about]": ABOUT_KO,
        "app[content][short_description]": SHORT_KO,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11(Big Sur) 이상",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 또는 Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "내장 그래픽",
        "app[content][sysreqs][mac][min][soundcard]": "필요 없음",
        "app[content][sysreqs][mac][min][notes]": (
            "일부 AI 기능은 서드파티 대규모 언어 모델(LLM) API 제공업체(OpenAI 또는 로컬 배포 모델 등)가 필요합니다. "
            "해당 서비스는 사용자가 직접 구성해야 합니다. 향후 버전에서 온디바이스 AI 추론을 지원할 수 있으며, 이 경우 "
            "원활한 성능을 위해 디스크리트 GPU 사용을 권장합니다."
        ),
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 또는 이에 상응하는 CPU",
        "app[content][sysreqs][windows][min][graphics]": "내장 그래픽",
        "app[content][sysreqs][windows][min][soundcard]": "필요 없음",
        "app[content][sysreqs][windows][min][vrsupport]": "지원하지 않음",
        "app[content][sysreqs][windows][min][notes]": (
            "일부 AI 기능은 서드파티 대규모 언어 모델(LLM) API 제공업체(OpenAI 또는 로컬 배포 모델 등)가 필요합니다. "
            "해당 서비스는 사용자가 직접 구성해야 합니다. 향후 버전에서 온디바이스 AI 추론을 지원할 수 있으며, 이 경우 "
            "원활한 성능을 위해 디스크리트 GPU 사용을 권장합니다."
        ),
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 이상",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 또는 이에 상응하는 CPU",
        "app[content][sysreqs][linux][min][graphics]": "내장 그래픽",
        "app[content][sysreqs][linux][min][soundcard]": "필요 없음",
        "app[content][sysreqs][linux][min][vrsupport]": "지원하지 않음",
        "app[content][sysreqs][linux][min][notes]": (
            "일부 AI 기능은 서드파티 대규모 언어 모델(LLM) API 제공업체(OpenAI 또는 로컬 배포 모델 등)가 필요합니다. "
            "해당 서비스는 사용자가 직접 구성해야 합니다. 향후 버전에서 온디바이스 AI 추론을 지원할 수 있으며, 이 경우 "
            "원활한 성능을 위해 디스크리트 GPU 사용을 권장합니다."
        ),
    },
    "spanish": {
        "app[content][about]": ABOUT_ES,
        "app[content][short_description]": SHORT_ES,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11 (Big Sur) o posterior",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 o Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "Gráficos integrados",
        "app[content][sysreqs][mac][min][soundcard]": "No necesario",
        "app[content][sysreqs][mac][min][notes]": NOTES_ES,
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 o equivalente",
        "app[content][sysreqs][windows][min][graphics]": "Gráficos integrados",
        "app[content][sysreqs][windows][min][soundcard]": "No necesario",
        "app[content][sysreqs][windows][min][vrsupport]": "No compatible",
        "app[content][sysreqs][windows][min][notes]": NOTES_ES,
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 o posterior",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 o equivalente",
        "app[content][sysreqs][linux][min][graphics]": "Gráficos integrados",
        "app[content][sysreqs][linux][min][soundcard]": "No necesario",
        "app[content][sysreqs][linux][min][vrsupport]": "No compatible",
        "app[content][sysreqs][linux][min][notes]": NOTES_ES,
    },
    "russian": {
        "app[content][about]": ABOUT_RU,
        "app[content][short_description]": SHORT_RU,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11 (Big Sur) или новее",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 или Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "Встроенная графика",
        "app[content][sysreqs][mac][min][soundcard]": "Не требуется",
        "app[content][sysreqs][mac][min][notes]": NOTES_RU,
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 или аналог",
        "app[content][sysreqs][windows][min][graphics]": "Встроенная графика",
        "app[content][sysreqs][windows][min][soundcard]": "Не требуется",
        "app[content][sysreqs][windows][min][vrsupport]": "Не поддерживается",
        "app[content][sysreqs][windows][min][notes]": NOTES_RU,
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04 / SteamOS 3.0 или новее",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 или аналог",
        "app[content][sysreqs][linux][min][graphics]": "Встроенная графика",
        "app[content][sysreqs][linux][min][soundcard]": "Не требуется",
        "app[content][sysreqs][linux][min][vrsupport]": "Не поддерживается",
        "app[content][sysreqs][linux][min][notes]": NOTES_RU,
    },
    "tchinese": {
        "app[content][about]": ABOUT_TW,
        "app[content][short_description]": SHORT_TW,
        "app[content][sysreqs][mac][min][osversion]": "macOS 11（Big Sur）或更新版本",
        "app[content][sysreqs][mac][min][processor]": "Apple M1 或 Intel Core i5",
        "app[content][sysreqs][mac][min][graphics]": "內建顯示晶片",
        "app[content][sysreqs][mac][min][soundcard]": "不需要",
        "app[content][sysreqs][mac][min][notes]": NOTES_TW,
        "app[content][sysreqs][windows][min][osversion]": "Windows 10",
        "app[content][sysreqs][windows][min][processor]": "Intel Core i3 或同等效能處理器",
        "app[content][sysreqs][windows][min][graphics]": "內建顯示晶片",
        "app[content][sysreqs][windows][min][soundcard]": "不需要",
        "app[content][sysreqs][windows][min][vrsupport]": "不支援",
        "app[content][sysreqs][windows][min][notes]": NOTES_TW,
        "app[content][sysreqs][linux][min][osversion]": "Ubuntu 20.04／SteamOS 3.0 或更新版本",
        "app[content][sysreqs][linux][min][processor]": "Intel Core i3 或同等效能處理器",
        "app[content][sysreqs][linux][min][graphics]": "內建顯示晶片",
        "app[content][sysreqs][linux][min][soundcard]": "不需要",
        "app[content][sysreqs][linux][min][vrsupport]": "不支援",
        "app[content][sysreqs][linux][min][notes]": NOTES_TW,
    },
}

# Steam Latin American Spanish uses a separate locale; copy neutral Spanish copy.
PATCHES["latam"] = PATCHES["spanish"].copy()


def apply(data: dict) -> list[str]:
    errors: list[str] = []
    langs = data.get("languages")
    if not isinstance(langs, dict):
        return ["missing languages object"]

    for steam_key, updates in PATCHES.items():
        if steam_key not in langs:
            errors.append(f"missing language key: {steam_key}")
            continue
        block = langs[steam_key]
        if not isinstance(block, dict):
            errors.append(f"language {steam_key} is not an object")
            continue
        for k, v in updates.items():
            if k not in block:
                errors.append(f"{steam_key}: missing field {k}")
                continue
            block[k] = v

    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate JSON and keys only")
    args = parser.parse_args()

    text = STOREPAGE.read_text(encoding="utf-8")
    data = json.loads(text)

    errs = apply(data)
    if errs:
        raise SystemExit("apply_storepage_metadoc_i18n.py: " + "; ".join(errs))

    if args.check:
        print("OK: patches apply to", STOREPAGE)
        return

    out = json.dumps(data, ensure_ascii=False, indent=4) + "\n"
    STOREPAGE.write_text(out, encoding="utf-8")
    print("Wrote", STOREPAGE)


if __name__ == "__main__":
    main()
