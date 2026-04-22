# Configuration LLM

## Vue d’ensemble

La configuration LLM (grand modèle de langage) est au cœur des fonctions IA de MetaDoc. Les **versions distribuées via Steam** ne suivent pas le même chemin recommandé que les anciens canaux de test :

- **Steam (recommandé)** : utilisez le **proxy d’API LLM basé sur Cloudflare** exploité par MetaDoc (intitulé **« MetaDoc Cloud (Steam) »** dans l’app). Achetez des **crédits** via **recharge Steam**, puis utilisez l’IA — en général **sans** fournir vous-même de clés API tierces.
- **API personnelle (BYOK)** : parcours **développeur / expérimental**. Ce n’est qu’après avoir ouvert les **Options expérimentales** dans **LLM** et activé **« Activer la connectivité expérimentale »** que l’interface classique **multi-profils + API personnalisée** réapparaît. Voir ci-dessous et les articles liés.

Ordre des sections : **Steam / MetaDoc Cloud** (solde, recharge, changement de modèle), puis **options expérimentales**, puis le **reste de l’interface** (activer le LLM, température, grille de cartes, etc.).

---

## Steam : MetaDoc Cloud et crédits (recommandé)

Pour MetaDoc installé et lancé via **Steam**.

### Étapes rapides

1. **Ouvrir les paramètres LLM** : **Paramètres** → **LLM** (ou **Paramètres** depuis la barre de menus).
2. Repérer **« MetaDoc Cloud (Steam) »** : solde **(credits)**, choix du **modèle**, **Ajouter des crédits** / recharge, **Actualiser** le solde côté serveur.
3. **Recharger** : via **Ajouter des crédits**, suivre l’**achat intégré Steam**. Lancer l’app depuis la bibliothèque Steam ; le client Steam doit être disponible (l’UI indique les conditions Steam/Greenworks si l’achat échoue).
4. **Consulter le solde** : les crédits s’affichent sur la page ; l’entrée **Steam** dans la zone de notification permet aussi de voir le **solde de crédits** et de lancer une recharge.
5. **Tarification** : les **modèles** peuvent débiter les crédits différemment — se référer à l’app.
6. **Changer de modèle** : après sélection sous MetaDoc Cloud, le **chat IA, la complétion, la relecture, Agent**, etc. utilisent ce modèle ; modifiable à tout moment.

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Remarques

- Le service est exploité par MetaDoc : **pas besoin** de coller URL/clés OpenAI ou DeepSeek pour ce mode (contrairement au BYOK).
- Solde insuffisant ou réseau défaillant : les fonctions IA peuvent échouer — **recharger** ou **actualiser le solde**.

---

## Options développeur : connectivité expérimentale et BYOK (API perso)

Sur les builds **Steam**, l’ancien flux **« configurer sa propre API LLM »** est **expérimental** : ouvrir **Options expérimentales** sur la page **LLM**, activer **« Activer la connectivité expérimentale »** (confirmation). Alors seulement apparaissent les **cartes de configuration, URL de base, clé API, types de fournisseurs**, comme dans les anciennes builds de test.

**Important** :

- Parcours **expérimental**, expérience possiblement **différente** du cloud officiel ; risque de **facturation directe** chez des tiers et autres contraintes réseau/conformité.
- **Vous êtes seul responsable** des clés, coûts, disponibilité et conditions des fournisseurs tiers. MetaDoc fournit uniquement la configuration côté client.

Détails pas à pas (comme la doc historique) :

- [[settings.llm-management|Gestion des configurations LLM]]
- [[settings.llm-types|Types de fournisseurs LLM]]
- [[ai.llm-config|Guide de configuration LLM]]

---

## Activer le LLM

<SettingLlmSection mode="demo" />

### Activer les fonctions IA

1. Trouver le commutateur « Activer le LLM »
2. Le passer sur Activé
3. La configuration LLM par défaut se charge

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interface

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

- **Paramètres globaux** : activation LLM, curseur de température, suppression des balises de raisonnement, exécution terminal par défaut, etc.
- **Grille de cartes** : chaque carte = nom et type ; clic pour changer la config active (bordure verte)
- **Actions carte** : vérifier le flux Q/R ; menu contextuel : copier, modifier, exporter, supprimer
- **En haut à droite** : nouvelle config, import depuis fichier

En mode démo, les modifications ne sont pas enregistrées.

Après activation : chat IA, relecture, complétion, assistant, Agent.

**Note** : des appels API peuvent engendrer des coûts.

## Température LLM

<SettingLlmSection mode="demo" />

Basse (0–0,5) : plus déterministe. Moyenne (0,5–1) : équilibrée. Haute (1–2) : plus créative. Recommandations : documentation 0,3–0,5 ; création 0,7–1 ; code 0,2–0,4 ; dialogue 0,7–0,9. S’applique à toutes les fonctions utilisant le LLM.

## Suppression automatique des balises de raisonnement

Filtre les balises de processus de raisonnement lorsque le modèle les émet.

## Gestion des configurations

<SettingLlmSection mode="demo" />

Plusieurs configurations (travail, essai, fournisseurs différents). Clic sur une carte pour basculer ; édition via le menu contextuel.

## Points importants

1. **Clés API** : en BYOK uniquement — ne pas partager
2. **Coûts** : MetaDoc Cloud = **crédits** ; BYOK = facturation du fournisseur
3. **Réseau** : connexion stable vers les API externes
4. **Sauvegarde** : exporter les configurations importantes
5. **Modèles** : capacités et limites variables

## Documentation associée

- [[settings.llm-management|Gestion des configurations LLM]]
- [[settings.llm-types|Types de fournisseurs LLM]]
- [[ai.chat|Chat IA]]
- [[ai.completion|Complétion IA]]
- [[ai.proofread|Relecture IA]]
