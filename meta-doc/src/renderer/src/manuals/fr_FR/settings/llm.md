# Configuration LLM

## Vue d'ensemble

La configuration LLM (modèle de langage de grande taille) est le paramètre central des fonctionnalités IA de MetaDoc. En configurant le LLM, vous pouvez activer des fonctions intelligentes telles que le dialogue IA, la relecture IA, la complétion automatique IA, etc. MetaDoc prend en charge plusieurs fournisseurs de services LLM, vous permettant de choisir le modèle adapté à vos besoins.

## Activer le LLM

<SettingLlmSection mode="demo" />

### Activer les fonctions IA

Sur la page des paramètres LLM, vous devez d'abord activer la fonction LLM :

1. Trouvez l'interrupteur "Activer le LLM"
2. Basculez l'interrupteur sur la position "Activé"
3. Le système chargera automatiquement la configuration LLM par défaut

Vous pouvez accéder aux paramètres via la barre de menu supérieure :

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

### Interface des paramètres LLM

L'illustration ci-dessous présente les principales zones fonctionnelles de la page de configuration LLM :

<SettingLlmSection mode="demo" />

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />

L'illustration ci-dessus montre les principaux composants de l'interface des paramètres LLM :

- **Paramètres globaux** : Interrupteur d'activation LLM, curseur de réglage de la température (Temperature), option de suppression des balises de réflexion (think)
- **Liste des configurations** : Affiche à gauche tous les fournisseurs LLM configurés (comme OpenAI, Ollama, Gemini, etc.)
- **Détails de la configuration** : Affiche à droite les paramètres détaillés de la configuration sélectionnée (adresse API, choix du modèle, limites de Token, etc.)
- **Zone de test** : Permet de vérifier si la configuration actuelle fonctionne correctement
- **Boutons d'action** : Fonctions telles que créer une nouvelle configuration, importer/exporter une configuration, supprimer une configuration, etc.

En mode démonstration, vous pouvez visualiser de manière interactive la disposition de l'interface, mais les modifications ne seront pas réellement enregistrées.

Une fois le LLM activé, vous pourrez utiliser les fonctions IA suivantes :

- Dialogue IA
- Relecture IA
- Complétion automatique IA
- Fonctions d'assistant IA
- Cadre Agent

**Points à noter** :

- Une fois le LLM activé, certaines fonctions peuvent appeler des API et engendrer des coûts
- Il est recommandé de configurer d'abord le service LLM avant de l'activer
- Si les fonctions IA ne sont pas nécessaires, vous pouvez les laisser désactivées pour économiser des ressources

## Réglage de la température du LLM

<SettingLlmSection mode="demo" />

### Comprendre le paramètre de température

La température (Temperature) est un paramètre qui contrôle le caractère aléatoire du texte généré par l'IA :

- **Température basse (0-0,5)** : Les résultats générés sont plus déterministes et cohérents, adaptés aux scénarios nécessitant des réponses précises
- **Température moyenne (0,5-1,0)** : Équilibre entre créativité et précision, adapté à la plupart des scénarios
- **Température élevée (1,0-2,0)** : Les résultats générés sont plus diversifiés et créatifs, adaptés à l'écriture créative

### Recommandations de réglage

- **Documentation technique** : Recommandé 0,3-0,5 pour garantir l'exactitude du contenu
- **Écriture créative** : Recommandé 0,7-1,0 pour augmenter la diversité du contenu
- **Génération de code** : Recommandé 0,2-0,4 pour assurer la précision du code
- **Conversation** : Recommandé 0,7-0,9 pour maintenir un échange naturel et fluide

Le réglage de la température affecte toutes les fonctions utilisant le LLM, y compris le dialogue IA, la complétion IA, la relecture IA, etc.

## Suppression automatique des balises de raisonnement

### Description de la fonction

Certains LLM peuvent inclure un processus de raisonnement (thinking process) lors de la génération de contenu, généralement marqué par des balises spéciales. Lorsque l'option "Supprimer automatiquement les balises de raisonnement" est activée, MetaDoc filtre automatiquement ces balises et ne conserve que le contenu final généré.

**Scénarios d'application** :

- Utilisation d'un LLM prenant en charge les processus de raisonnement (comme certains modèles open source)
- Souhait d'obtenir un résultat de sortie plus concis
- Pas besoin de visualiser le processus de réflexion de l'IA

**Points à noter** :

- Si votre LLM ne prend pas en charge les balises de raisonnement, cette option n'aura aucun effet
- Dans certains cas, conserver le processus de raisonnement peut aider à comprendre la logique décisionnelle de l'IA

## Gestion des configurations

<SettingLlmSection mode="demo" />

### Prise en charge de configurations multiples

MetaDoc permet de créer plusieurs configurations LLM, facilitant l'utilisation de modèles différents selon les contextes :

- **Configuration de travail** : Pour un usage quotidien, utilisant un modèle stable et fiable
- **Configuration expérimentale** : Pour tester de nouveaux modèles ou fonctionnalités
- **Différents fournisseurs** : Créer des configurations indépendantes pour différents services LLM

### Changer de configuration

Dans la liste des configurations à gauche de la page des paramètres LLM, vous pouvez :

1. **Sélectionner une configuration** : Cliquez sur un élément de la liste pour basculer vers cette configuration
2. **Consulter les informations de configuration** : Le nom de la configuration s'affiche dans la liste
3. **Identifier la configuration actuelle** : La configuration en cours d'utilisation est mise en surbrillance

Après avoir changé de configuration, toutes les fonctions IA utiliseront immédiatement le service LLM de la nouvelle configuration.

## Indicateur d'état de la configuration

<SettingLlmSection mode="demo" />

### Modifications non enregistrées

Lorsque vous modifiez une configuration sans l'avoir encore enregistrée, le système affiche une indication "Modifications non enregistrées" :

- Une étiquette d'avertissement apparaît à côté du nom de la configuration
- La barre d'état de l'espace de travail affiche "Modifications non enregistrées"
- Vous devez cliquer sur le bouton "Enregistrer les modifications" pour sauvegarder les changements

### Enregistrer les modifications

Après avoir modifié une configuration, n'oubliez pas de cliquer sur le bouton "Enregistrer les modifications" :

1. Cliquez sur le bouton "Enregistrer les modifications" en haut à droite de l'espace de travail
2. Le système enregistre toutes les modifications apportées à la configuration actuelle
3. Une fois l'enregistrement réussi, l'état est mis à jour en "Toutes les modifications sont enregistrées"

### Annuler les modifications

Si vous ne souhaitez pas enregistrer les modifications actuelles :

1. Cliquez sur le bouton "Annuler les modifications"
2. Le système revient à l'état de la dernière sauvegarde
3. Toutes les modifications non enregistrées seront abandonnées

## Points à noter

1. **Sécurité des clés API** : Conservez vos clés API en lieu sûr et ne les partagez pas
2. **Contrôle des coûts** : L'utilisation des services LLM peut engendrer des frais, surveillez votre consommation
3. **Connexion réseau** : L'utilisation d'API externes nécessite une connexion réseau stable
4. **Sauvegarde des configurations** : Il est recommandé d'exporter et de sauvegarder les configurations importantes pour éviter leur perte
5. **Choix du modèle** : Différents modèles ont des capacités et des limites différentes, choisissez en fonction de vos besoins

## Documentation associée

- [[settings.llm-management|Gestion des configurations LLM]]
- [[settings.llm-types|Configuration des types de LLM]]
- [[ai.chat|Fonction de dialogue IA]]
- [[ai.completion|Complétion automatique IA]]
- [[ai.proofread|Fonction de relecture IA]]