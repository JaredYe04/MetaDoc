# Fonctionnalités avancées du Markdown

## Vue d'ensemble

Après avoir maîtrisé la [[markdown.basics|syntaxe Markdown]] et les [[markdown.features|fonctionnalités de l'éditeur Markdown]], vous pouvez utiliser des syntaxes étendues et des fonctionnalités avancées telles que les diagrammes, les formules mathématiques, le HTML et les attributs pour enrichir l'expressivité de vos documents.

<MenuItemsDemo mode="demo" :items='[{"id": "edit"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "view"}]' />

<MenuItemsDemo mode="demo" :items='[{"id": "insert"}]' />

<SearchReplaceMenu mode="demo" />

<ViewMenuItemsDemo mode="demo" :items='["outline", "preview"]' />

## Diagrammes et formules

### Blocs de code pour diagrammes

Vous pouvez insérer des diagrammes Mermaid, PlantUML, ECharts, etc., dans vos documents à l'aide de blocs de code. L'éditeur les rend en temps réel :

- **Mermaid** : Diagrammes de flux, diagrammes de séquence, diagrammes de classes, diagrammes de Gantt, etc. Voir [[charts.mermaid|Diagrammes Mermaid]]
- **PlantUML** : Diagrammes UML, etc. Voir [[charts.plantuml|Diagrammes PlantUML]]
- **ECharts** : Diagrammes de visualisation de données. Voir [[charts.echarts|Diagrammes ECharts]]

### Formules mathématiques

Prise en charge des formules en ligne et des formules en bloc :

- **Formule en ligne** : `$...$` ou `\(...\)`
- **Formule en bloc** : `$$...$$` ou `\[...\]`
- **Formules multi-lignes** : Utilisez des environnements comme `aligned`, `equation`, etc.

### Conversion de formules LaTeX

L'éditeur peut convertir certaines syntaxes de formules LaTeX en une forme Markdown/HTML compatible, facilitant un affichage correct dans des environnements non-LaTeX.

## Syntaxe étendue

### Tableaux avancés

- Alignement : Utilisez `:---`, `:---:`, `---:` dans la ligne de séparation de l'en-tête pour définir l'alignement à gauche, au centre ou à droite.
- Fusion : Les tableaux complexes peuvent être réalisés via le HTML `<table>`.
- Création à partir d'une sélection : Après avoir sélectionné du texte dans l'éditeur, vous pouvez insérer rapidement un tableau via le clic droit ou le menu.

### Liens et images

- **Lien de référence** : `[texte][nom_référence]`, avec la définition `[nom_référence]: URL` en fin de document.
- **Titre et attributs** : Certains moteurs de rendu prennent en charge `(url "titre")` ou des attributs personnalisés.
- **Dimensions d'image** : Définissez la largeur et la hauteur via le HTML `<img>` ou une syntaxe étendue (selon le support du moteur de rendu).

### Notes de bas de page

Si le moteur de rendu prend en charge l'extension des notes de bas de page :

```markdown
Contenu du texte[^1].

[^1]: Contenu de la note de bas de page.
```

## Intégration avec les fonctionnalités de l'éditeur

### Clic droit et IA

- **Optimisation de paragraphe** : Sélectionnez un paragraphe et utilisez l'option « Optimisation de paragraphe » du clic droit ou l'IA pour le polir. Voir [[features.paragraph-optimization|Fonction d'optimisation de paragraphe]]
- **Insertion de diagrammes** : Insérez des blocs de code Mermaid/ECharts, etc., via le clic droit ou l'assistant IA. Voir [[charts.introduction|Présentation des fonctionnalités de diagrammes]]

### Base de connaissances et complétion

- Une fois la [[knowledge-base.usage|base de connaissances]] activée, la complétion et les conversations IA peuvent intégrer le contenu du document actuel et de la base de connaissances.
- Configurez la touche de déclenchement et le nombre maximum de tokens dans la [[ai.completion|complétion automatique IA]] pour améliorer l'efficacité de la rédaction de textes longs.

## Bonnes pratiques

1. **Bases d'abord, extensions ensuite** : Maîtrisez d'abord la [[markdown.basics|syntaxe de base]], puis utilisez les diagrammes et formules.
2. **Style cohérent** : Essayez d'unifier le type de diagrammes et la manière d'écrire les formules dans un même document.
3. **Compatibilité** : Faites attention à la compatibilité des diagrammes et formules lors de l'export en PDF/HTML.
4. **Performance** : Un trop grand nombre ou des diagrammes trop volumineux sur une seule page peuvent affecter les performances de l'aperçu.

## Documents connexes

- [[markdown.basics|Syntaxe Markdown]]
- [[markdown.features|Fonctionnalités de l'éditeur Markdown]]
- [[charts.introduction|Présentation des fonctionnalités de diagrammes]]
- [[ai.completion|Complétion automatique IA]]
