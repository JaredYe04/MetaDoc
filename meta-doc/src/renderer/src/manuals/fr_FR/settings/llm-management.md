# Gestion des configurations LLM

## Vue d'ensemble

La gestion des configurations LLM vous permet de créer, modifier, supprimer et gérer plusieurs configurations LLM. Les configurations sont présentées sous forme de **cartes en grille**, similaires à un client d'agent : chaque carte affiche le nom et le type de la configuration, un clic permet de basculer vers son utilisation, elle permet de vérifier la connectivité directement sur la carte et offre un menu contextuel pour la copie, l'édition, l'exportation et la suppression.

## Disposition de l'interface

### Grille et cartes

1. Après avoir activé le LLM dans la page des paramètres LLM, une **grille de configurations** s'affiche en dessous.
2. Chaque **carte de configuration** contient :
   - **Première ligne** : Nom de la configuration
   - **Deuxième ligne** : Type de grand modèle (par exemple OpenAI, Tongyi Qianwen, DeepSeek, Ollama, etc.)
3. **Cliquez sur une carte** pour basculer vers cette configuration. La carte de configuration actuellement utilisée est mise en évidence par une **bordure verte**.
4. En haut à droite de la grille se trouvent les boutons **Nouvelle configuration** et **Importer configuration**.

Vous pouvez accéder aux paramètres LLM via la barre de menu supérieure :

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Démonstration de l'interface de configuration

L'illustration suivante présente les principales fonctionnalités de l'interface de gestion des configurations LLM :

<SettingLlmSection mode="demo" />

## Changer de configuration

- **Cliquez sur n'importe quelle carte** dans la grille de configurations pour basculer vers cette configuration.
- La configuration active est affichée avec une bordure verte et un léger surlignage. Toutes les fonctionnalités IA utiliseront immédiatement le service LLM de cette configuration.

## Vérifier la connectivité

- Chaque carte possède un bouton **« Vérifier »** sur sa droite. Un clic teste les capacités de **flux de questions-réponses** et de **flux de conversation** de cette configuration.
- Une icône de chargement s'affiche pendant le test ; si une sortie normale est obtenue, le test s'arrête automatiquement et affiche une **coche verte** ; en cas d'erreur de requête, une **croix rouge** et un bref message d'erreur sont affichés.
- Quel que soit le résultat, un nouveau clic permet de relancer le test.

## Menu contextuel

Un **clic droit** sur une carte de configuration ouvre un menu proposant :

- **Copier la configuration** : Crée une copie de cette configuration (le nouveau nom inclut « (copie) »).
- **Modifier la configuration** : Ouvre la boîte de dialogue d'édition pour modifier le nom, le type et les différents paramètres. **OK** pour enregistrer, **Annuler** pour quitter sans sauvegarder.
- **Exporter la configuration** : Exporte la configuration actuelle vers un fichier JSON.
- **Supprimer la configuration** : Supprime cette configuration (**les configurations prédéfinies ne peuvent pas être supprimées**, voir ci-dessous).

## Configurations prédéfinies

Les **configurations prédéfinies** correspondant aux types suivants (comme « Ollama (par défaut) », « Tongyi Qianwen (par défaut) », etc.) **ne peuvent pas être supprimées**, mais **peuvent être modifiées** (lors de l'édition, **le type de grand modèle ne peut pas être changé**) :

- Tongyi Qianwen, DeepSeek, OpenAI officiel, OpenAI compatible, Google Gemini, Ollama

Les configurations personnalisées et celles obtenues par copie peuvent être supprimées normalement.

## Créer une configuration

### Nouvelle configuration

1. Cliquez sur **« Nouvelle configuration »** en haut à droite de la grille.
2. Saisissez le nom de la configuration dans la fenêtre contextuelle et confirmez.
3. Le système crée une nouvelle configuration basée sur **la configuration actuellement sélectionnée** et bascule automatiquement vers elle.

**Remarque** : Le bouton de nouvelle configuration est indisponible lorsque la configuration actuellement sélectionnée est de type « manuel ».

### Importer une configuration

1. Cliquez sur **« Importer configuration »** en haut à droite de la grille.
2. Dans la boîte de dialogue de sélection de fichiers, choisissez un ou plusieurs fichiers de configuration JSON (prise en charge de la **sélection multiple**).
3. Le système les lit et les importe un par un. Les configurations importées sont ajoutées à la liste.

Les formats JSON d'objet de configuration unique ou de tableau de configurations sont pris en charge. L'importation génère un nouvel ID pour éviter les conflits avec les configurations existantes.

## Modifier une configuration

1. Effectuez un **clic droit** sur une carte de configuration et sélectionnez **« Modifier la configuration »**.
2. Dans la boîte de dialogue d'édition, modifiez le **nom de la configuration**, le **type de grand modèle** (modifiable pour les configurations non prédéfinies) ainsi que les différents paramètres spécifiques à ce type (adresse API, clé, modèle, etc.).
3. Cliquez sur **OK** pour enregistrer, ou sur **Annuler** pour abandonner les modifications. **Il n'y a pas d'état « non enregistré »** : les modifications ne sont écrites qu'après confirmation.

Pour les détails des paramètres de configuration selon les types de LLM, consultez [[settings.llm-types|Configuration des types LLM]].

## Supprimer une configuration

1. Effectuez un **clic droit** sur une carte de configuration et sélectionnez **« Supprimer la configuration »** (cette option n'est pas affichée pour les configurations prédéfinies).
2. Confirmez la suppression dans la boîte de dialogue de confirmation.
3. Si la configuration supprimée était celle en cours d'utilisation, le système bascule automatiquement vers une autre configuration.

## Exporter une configuration

- **Exportation individuelle** : Clic droit sur la carte → **Exporter la configuration**, pour enregistrer la configuration actuelle dans un fichier JSON.
- Le fichier exporté peut être utilisé pour la sauvegarde ou pour restaurer la configuration sur un autre appareil/compte via la fonction « Importer configuration ».

## Bonnes pratiques

1. **Convention de nommage** : Utilisez des noms de configuration clairs, comme « Travail-Ollama », « Expérimentation-OpenAI ».
2. **Sauvegarde régulière** : Exportez régulièrement vos configurations importantes pour les sauvegarder.
3. **Vérifier avant utilisation** : Pour une nouvelle configuration ou après modification, utilisez le bouton « Vérifier » sur la carte pour confirmer la connectivité.
4. **Nettoyer les configurations inutiles** : Supprimez régulièrement les configurations qui ne sont plus utilisées pour garder la liste organisée.

## Documentation associée

- [[settings.llm|Configuration LLM]]
- [[settings.llm-types|Configuration des types LLM]]
- [[ai.chat|Fonctionnalité de conversation IA]]
- [[agent.introduction|Gestion de la configuration Agent]]

<QuickStartPanel mode="demo" />

<MainTabs mode="demo" />