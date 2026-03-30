# Gestion du répertoire de travail

## Vue d'ensemble

La gestion du répertoire de travail vous permet d'ouvrir et de gérer des dossiers dans MetaDoc, offrant des fonctionnalités similaires à un explorateur de fichiers. Grâce au répertoire de travail, vous pouvez parcourir, ouvrir et gérer facilement les fichiers de votre projet.

## Présentation du répertoire de travail

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

### Qu'est-ce qu'un répertoire de travail

Un répertoire de travail est un dossier ouvert dans MetaDoc, qui vous permet de :

```mermaid
graph LR
    A[Ouvrir un dossier] --> B[Panneau du répertoire de travail]
    B --> C[Parcourir/Ouvrir des fichiers]
    C --> D[Gérer les fichiers]
    D --> E[Renommer/Supprimer/Créer]
    style A fill:#f3f4f6,stroke:#374151
    style B fill:#f3f4f6,stroke:#374151
    style C fill:#f3f4f6,stroke:#374151
    style D fill:#f3f4f6,stroke:#374151
    style E fill:#f3f4f6,stroke:#374151
```

- **Parcourir les fichiers** : Voir les fichiers et sous-dossiers dans le dossier
- **Ouvrir des fichiers** : Ouvrir des fichiers directement dans MetaDoc
- **Gérer les fichiers** : Renommer, supprimer des fichiers, etc.
- **Organiser le projet** : Organiser les fichiers associés dans un répertoire

### Cas d'utilisation

Le répertoire de travail est adapté aux scénarios suivants :

- **Gestion de projet** : Gérer tous les documents d'un projet
- **Navigation de fichiers** : Parcourir et ouvrir rapidement des fichiers
- **Organisation de documents** : Regrouper des documents associés
- **Opérations par lot** : Effectuer des opérations sur plusieurs fichiers

## Ouvrir un répertoire de travail

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor"]' />

### Ouvrir un répertoire

1. Cliquez sur l'icône "Répertoire de travail" dans le menu de gauche
2. Si aucun répertoire n'est ouvert, une boîte de dialogue de sélection de dossier s'affiche
3. Sélectionnez le dossier à ouvrir
4. Le répertoire s'affiche dans la barre latérale

Vous pouvez accéder à la vue du répertoire de travail via la barre latérale :

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

<ViewMenuItemsDemo mode="demo" :items='["editor", "outline", "home"]' />

### Changer de répertoire

Si vous devez passer à un autre répertoire :

1. Cliquez sur le bouton de menu de la barre de titre du répertoire de travail
2. Sélectionnez "Ouvrir un dossier"
3. Choisissez le nouveau dossier
4. Le nouveau répertoire remplace le répertoire actuel

### Fermer un répertoire

Vous pouvez fermer le répertoire de travail actuellement ouvert :

1. Cliquez sur le bouton de menu de la barre de titre du répertoire de travail
2. Sélectionnez "Fermer le répertoire de travail"
3. Le panneau du répertoire de travail est masqué

## Navigation dans les fichiers

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor", "outline"]' />

### Structure arborescente

Le répertoire de travail s'affiche sous forme d'arborescence :

- **Dossiers** : Affichent une icône de dossier, peuvent être développés/repliés
- **Fichiers** : Affichent une icône de fichier, montrent le nom du fichier
- **Structure hiérarchique** : Prend en charge l'imbrication de dossiers à plusieurs niveaux

### Développer et replier

- **Développer un dossier** : Cliquez sur l'icône ou le nom du dossier
- **Replier un dossier** : Cliquez à nouveau sur le dossier développé
- **Tout développer** : Le menu contextuel permet de tout développer
- **Tout replier** : Le menu contextuel permet de tout replier

### Reconnaissance du type de fichier

Le répertoire de travail reconnaît les types de fichiers :

- **Fichiers Markdown** (.md) : Affichent l'icône Markdown
- **Fichiers LaTeX** (.tex) : Affichent l'icône LaTeX
- **Fichiers image** (.png, .jpg, etc.) : Affichent l'icône d'image
- **Autres fichiers** : Affichent l'icône de fichier générique

## Opérations sur les fichiers

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open"]}]' />

### Ouvrir un fichier

Il existe plusieurs façons d'ouvrir un fichier :

- **Double-clic sur le fichier** : Double-cliquez sur l'icône ou le nom du fichier
- **Menu contextuel** : Clic droit sur le fichier, sélectionnez "Ouvrir"
- **Glisser-déposer** : Glissez-déposez le fichier dans la zone de l'éditeur

Une fois ouvert, le fichier s'ouvre dans un nouvel onglet.

### Prévisualiser un fichier

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

Vous pouvez prévisualiser un fichier sans l'ouvrir :

- **Menu contextuel** : Clic droit sur le fichier, sélectionnez "Prévisualiser"
- **Mode prévisualisation** : Le fichier s'ouvre dans un onglet de prévisualisation
- **Passer en édition** : En mode prévisualisation, vous pouvez passer en mode édition

### Renommer un fichier

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Clic droit sur le fichier à renommer
2. Sélectionnez "Renommer"
3. Saisissez le nouveau nom de fichier
4. Appuyez sur Entrée pour confirmer, ou sur Échap pour annuler

**Remarques** :

- Le renommage modifie le nom du fichier dans le système de fichiers
- Si le fichier est en cours d'édition, il faut d'abord l'enregistrer
- Le chemin du fichier change après le renommage

### Supprimer un fichier

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Clic droit sur le fichier à supprimer
2. Sélectionnez "Supprimer"
3. Confirmez l'opération de suppression

**Remarques** :

- L'opération de suppression est irréversible
- Si le fichier est en cours d'édition, il faut d'abord le fermer
- Supprimer un dossier supprime tous les fichiers qu'il contient

### Créer un nouveau fichier

1. Clic droit sur un dossier ou une zone vide
2. Sélectionnez "Nouveau fichier"
3. Saisissez le nom du fichier (avec l'extension)
4. Appuyez sur Entrée pour confirmer

Le nouveau fichier s'ouvre immédiatement dans l'éditeur.

### Créer un nouveau dossier

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Clic droit sur un dossier ou une zone vide
2. Sélectionnez "Nouveau dossier"
3. Saisissez le nom du dossier
4. Appuyez sur Entrée pour confirmer

## Fonctionnalités avancées des opérations sur les fichiers

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor"]' />

### Copier un fichier

1. Clic droit sur le fichier à copier
2. Sélectionnez "Copier"
3. Clic droit sur l'emplacement cible
4. Sélectionnez "Coller"

### Couper un fichier

1. Clic droit sur le fichier à couper
2. Sélectionnez "Couper"
3. Clic droit sur l'emplacement cible
4. Sélectionnez "Coller"

### Coller un fichier

1. Après avoir copié ou coupé un fichier
2. Clic droit sur l'emplacement cible
3. Sélectionnez "Coller"

**Remarques** :

- Coller dans un dossier crée le fichier à l'intérieur de ce dossier
- Si un fichier du même nom existe déjà à l'emplacement cible, vous serez invité à le remplacer ou à le renommer

### Opérations par lot

Vous pouvez sélectionner plusieurs fichiers simultanément pour les manipuler :

- **Sélection multiple** : Maintenez la touche Ctrl enfoncée et cliquez sur plusieurs fichiers
- **Tout sélectionner** : Utilisez Ctrl+A pour sélectionner tous les fichiers
- **Opérations par lot** : Exécutez des opérations de copie, suppression, etc. sur les fichiers sélectionnés

## Recherche de fichiers

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

### Fonction de recherche

Le répertoire de travail prend en charge la recherche de fichiers :

1. Dans le panneau du répertoire de travail, utilisez la zone de recherche
2. Saisissez un nom de fichier ou un mot-clé
3. Les résultats de la recherche sont mis en surbrillance

### Étendue de la recherche

La recherche s'effectue dans les limites suivantes :

- **Répertoire actuel** : Le répertoire de travail actuellement ouvert
- **Sous-répertoires** : Inclut tous les sous-dossiers
- **Nom de fichier** : Recherche dans les noms de fichiers, pas dans le contenu des fichiers

## Surveillance du répertoire

<ViewMenuItemsDemo mode="demo" :items='["workspace", "outline"]' />

### Actualisation automatique

Le répertoire de travail surveille automatiquement les changements du système de fichiers :

- **Création de fichier** : Les nouveaux fichiers s'affichent automatiquement
- **Suppression de fichier** : Les fichiers supprimés sont automatiquement retirés
- **Renommage de fichier** : Les fichiers renommés sont automatiquement mis à jour
- **Modification de fichier** : Les fichiers modifiés affichent un indicateur de mise à jour

### Actualisation manuelle

Si vous devez actualiser manuellement le répertoire :

1. Clic droit sur un dossier ou une zone vide
2. Sélectionnez "Actualiser"
3. Le répertoire est rechargé

## Chemins de fichiers

### Afficher le chemin

Le répertoire de travail affiche le chemin complet des fichiers :

- **Info-bulle** : Le survol de la souris sur un fichier affiche le chemin complet
- **Barre de chemin** : Certaines vues peuvent afficher une barre de chemin
- **Menu contextuel** : Le menu contextuel peut afficher des informations sur le chemin

### Opérations sur les chemins

- **Copier le chemin** : Permet de copier le chemin complet d'un fichier
- **Ouvrir l'emplacement** : Permet d'ouvrir l'emplacement du fichier dans l'explorateur de fichiers
- **Navigation par chemin** : Permet de localiser rapidement un fichier via son chemin

## Bonnes pratiques

1. **Organisation du projet** : Organisez les fichiers associés dans un seul répertoire de travail
2. **Nommage des fichiers** : Utilisez une convention de nommage claire
3. **Sauvegarde régulière** : Sauvegardez régulièrement les fichiers importants
4. **Nettoyage des fichiers** : Supprimez régulièrement les fichiers inutiles
5. **Structure de répertoire** : Maintenez une structure de répertoire claire

## Remarques importantes

1. **Permissions de fichiers** : Assurez-vous d'avoir les droits de lecture/écriture sur les fichiers
2. **Verrouillage de fichiers** : Certains fichiers peuvent être verrouillés par d'autres programmes
3. **Longueur du chemin** : Attention aux limites de longueur des chemins de fichiers
4. **Caractères spéciaux** : Évitez les caractères spéciaux dans les noms de fichiers
5. **Taille des fichiers** : L'ouverture de fichiers volumineux peut prendre du temps

## Documentation associée

- [[core.file-operations|Opérations sur les fichiers]]
- [[core.multi-tab|Gestion des onglets multiples]]
- [[core.multi-window|Gestion des fenêtres multiples]]
