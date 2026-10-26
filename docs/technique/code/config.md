# config

### src/config/constants.js

- **Rôle du fichier :**
  - Centralise toutes les constantes de configuration de l'application (URLs API, modèles IA, intervalles de temps, URLs de feedback, paramètres audio, config WebRTC…).
  - Garantit la cohérence des valeurs partagées entre les modules et limite les duplications.

- **Fonctions exportées :**
  - **resolveApiOrigin(envVar)** : (importée depuis `./apiBase.js`)
    - **Paramètre :** `envVar` (string) URL de base de l’API (depuis variables d’environnement, e.g., VITE_API_BASE_URL).
    - **Retour :** URL d’origine API adaptée à l’environnement (plateforme web : chaîne vide pour URLs relatives, mobile : absolue).
    - **Effet de bord :** Aucun dans ce fichier.
    - **Dépendance :** `./apiBase.js`.
  - _(La majorité des exports sont des constantes, pas des fonctions.)_

- **Constantes exportées principales :**
  - **apiOrigin** : Origine API déterminée dynamiquement (via `resolveApiOrigin`).
  - **baseUrl** : `${apiOrigin}/api`
  - **aiBaseUrl** : Endpoint Realtime OpenAI (`https://api.openai.com/v1/realtime`)
    - ⚠️ Ne jamais ajouter `/calls` ici (voir commentaire détaillé dans le code).
  - **BACKLOG_URL** : URL du formulaire de feedback utilisateur.
  - **model, transcriptionModel** : Identifiants des modèles IA utilisés.
  - **Variables liées au temps** : CHUNK_MS, LIVE_TRANSCRIBE_MS, LIVE_CHUNK_COUNT, RECONNECT_INTERVAL_MS, MAX_RECORDING_DURATION_MS, CONTINUE_PROMPT_AFTER_MS, CONTINUE_PROMPT_INTERVAL_MS, CONTINUE_PROMPT_TIMEOUT_MS.
  - **ICE_SERVERS** : Liste de serveurs STUN pour WebRTC.
  - **Audio** : SILENCE_THRESHOLD_MS, KEEP_ALIVE_INTERVAL_MS, KEEP_ALIVE_VOLUME, AUDIO_ACTIVITY_THRESHOLD.

- **Points d’attention / Edge cases :**
  - **aiBaseUrl** :
    - N’ajouter en aucun cas `/calls` → utilisé différemment par modules WebSocket (utilisé) et WebRTC (non utilisé actuellement).
    - cf. incident historique : un patch de prod modifiant cette constante a provoqué des régressions.
    - Si besoin d’intégrer (à nouveau) le chemin WebRTC, créer une constante dédiée, ne pas modifier aiBaseUrl.
  - **apiOrigin / baseUrl** :
    - Leur valeur dépend de la plateforme (web vs mobile/Capacitor) et de la variable d’environnement.
    - S'assurer de bien gérer la propagation des modifications de la variable d’environnement lors d’un build ou déploiement.
  - **LIVE_CHUNK_COUNT** :
    - Calcule automatiquement le nombre de chunks selon LIVE_TRANSCRIBE_MS et CHUNK_MS → toute modification de l’un affecte l’autre.
  - **RECONNECT_INTERVAL_MS** :
    - Prévoir les rotations pour éviter les coupures serveur (hard-close d’OpenAI ≥45 min). Valeur très inférieure à la limite pour assurer robustesse.
  - **Continuité d’enregistrement** :
    - Prompts utilisateur déclenchés à des durées précises, mais n’interrompent pas le flux (l’enregistrement continue pendant les prompts).
  - **Configuration WebRTC (ICE_SERVERS)** :
    - Prévoir la synchronisation de cette constante avec `utils/peerConnection.js` si (ré)utilisation.

- **Dépendances notables :**
  - `resolveApiOrigin` depuis `./apiBase.js` (gestion contextuelle de l’URL d’API).
  - Consommateurs principaux : modules Svelte, utils/peerConnection.js, store.js, gestion de l’audio/Realtime.

- **Résumé :**
  - Tout changement ici impacte potentiellement de multiples points critiques de l'application, notamment la connexion Realtime et le flux d’audio/feedback. Lisez tous les commentaires avant modification.

### src/config/scaffold.js

- **Rôle du fichier**
  - Conversion bidirectionnelle entre le format "scaffold" markdown restreint (stocké côté backend) et le format de document JSON ProseMirror (utilisé par l’éditeur WYSIWYG TipTap).
  - Gère la grammaire et la sérialisation des variables dynamiques (`{{variable}}`), styles (`**gras**`, `*italique*`, `<u>souligné</u>`), titres (`#`, `##`) et listes.

- **Fonctions exportées**
  - `scaffoldToTiptapDoc(scaffold)`
    - **Paramètre** : `scaffold` (string, markdown).
    - **Retour** : Objet document ProseMirror (`{ type: "doc", content: [...] }`).
    - **Effets de bord** : Normalise/ignore toutes les variables inconnues et n’imbrique que les variables présentes dans `VARIABLE_CATALOG`. Les alias 'resume'/'summary' sont convertis en 'résumé'.

  - `tiptapDocToScaffold(doc)`
    - **Paramètre** : `doc` (objet ProseMirror).
    - **Retour** : Chaîne au format scaffold markdown, mimant la structure originale.
    - **Effets de bord** : Seul le sous-ensemble supporté est émis (titres, listes, marqué). Toute tentative d’injecter une variable inconnue est ignorée. L’ordre et le nesting des styles sont strictement définis pour assurer une réversibilité maximale.

  - `docHasResume(doc)`
    - **Paramètre** : `doc` (objet ProseMirror).
    - **Retour** : Booléen, vrai si au moins une variable `{{résumé}}` est présente.
    - **Effets de bord** : Aucun.

  - `KNOWN_VARIABLE_KEYS`
    - **Export** : Set contenant les clés autorisées pour les variables (`VARIABLE_CATALOG.map(v => v.key)`).

- **Points d’attention**
  - **Edge cases**
    - Les variables `{{...}}` non présentes dans `VARIABLE_CATALOG` sont traitées comme texte littéral, pas comme une variable.
    - Impossible d’injecter une variable custom (non whitelistée) via l’éditeur WYSIWYG.
    - Les styles (gras, italique, souligné) sont imbriqués dans un ordre précis (underline > bold > italic) ; le déséquilibre des balises dans le markdown source peut conduire à un rendu inattendu.
    - La grammaire prise en charge est volontairement restrictive : tout le reste est aplati / ignoré lors du round-trip.
    - Les lignes vides servent de séparateurs de blocs.
  - **Dépendances**
    - Nécessite `VARIABLE_CATALOG` (liste des variables connues) depuis `./templates.js`.
    - Les alias de variable 'resume'/'summary' sont systématiquement convertis en 'résumé'.
  - **Sérialisation**
    - Toute modification du sous-ensemble markdown supporté doit être alignée entre ce fichier, le backend et la fonction `renderPreviewHtml`.
    - Les nœuds inattendus dans le document ProseMirror sont sérialisés avec une approche "best effort" (aplatissement inline).

### src/config/templates.js

- **Rôle du fichier**
  - Définit la structure et la logique de génération des prompts système pour l’IA, destinés à résumer des réunions selon différents templates (standard, décision, RH, brainstorming, etc).
  - Gère à la fois des templates codés en dur et des templates personnalisés par l’utilisateur (incluant instructions personnalisées et scaffolding semi-verbatim).

- **Fonctions exportées**

  - `buildPersonalizationBlock(ctx)`
    - **Paramètres :** `ctx` (contexte utilisateur/template)
    - **Retour :** Chaîne de caractères (bloc de personnalisation à insérer dans le prompt)
    - **Effet de bord notable :** Aucun
    - **Notes :** Retourne une section impérative si des préférences utilisateur sont définies (ton, longueur, instructions custom, contexte utilisateur ou organisation).

  - `buildNotesBlock(ctx)`
    - **Paramètres :** `ctx`
    - **Retour :** Chaîne de caractères (bloc « notes de réunion » si notes présentes, sinon chaîne vide)
    - **Effet de bord notable :** Aucun

  - `templates`
    - **Type :** Tableau d’objets template prédéfinis incluant un champ `buildPrompt(ctx)` pour générer le prompt adapté au contexte.

  - `templateMap`
    - **Type :** Objet `{ valeur: template }` pour lookup rapide par clef.

  - `templateOptions`
    - **Type :** Tableau `{ value, icon, labels }` pour alimenter choix UI.

  - `VARIABLE_CATALOG`
    - **Type :** Tableau décrivant les variables disponibles dans l’éditeur de template utilisateur.

  - `SCAFFOLD_MARKER_RE`
    - **Type :** RegEx pour matcher le marqueur `{{résumé}}`, `{{resume}}`, `{{summary}}`

  - `splitPromptFields(promptStr)`
    - **Paramètres :** `promptStr` (string)
    - **Retour :** `{ instructions, scaffold }` (objets séparant consignes et scaffold dans un prompt utilisateur)
    - **Edge case :** Si séparateur absent, tout est « scaffold » (backward compat)

  - `combinePromptFields({ instructions, scaffold })`
    - **Paramètres :** Objet `{instructions, scaffold}`
    - **Retour :** Chaîne reconstituée avec séparateur

  - `STARTER_TEMPLATES`, `STARTER_BODIES`
    - **Type :** Liste d’identifiants de templates de démarrage et leurs structures markdown associées, destinées à l’éditeur utilisateur ; utilise la syntaxe `{{variable}}`.

  - `interpolateTemplate(promptStr, ctx)`
    - **Paramètres :** chaîne template à trous, contexte
    - **Retour :** chaîne où les `{{variables}}` sont remplacées
    - **Note :** Pour toutes les variables connues, dont actions sérialisées, date, auteur, ton, longueur, instructions custom…

  - `resolveSystemPrompt(templateValue, ctx, customTemplates)`
    - **Paramètres :** identifiant de template, contexte, tableau d’éventuels templates custom côté DB
    - **Retour :** chaîne de prompt complet prête à être envoyée à l’API OpenAI
    - **Note :** Prend toujours en priorité le template custom si présent ; sinon fallback sur hardcoded ; sandwich : header système + template + rappels de format.

  - `buildSystemPrompt(templateValue, ctx)`
    - **Paramètres** : identifiant template, contexte
    - **Retour** : prompt complet selon template dur (pas custom DB)
    - **Note :** Wrapper de `resolveSystemPrompt` en mode hardcoded.

- **Points d’attention / Edge Cases / Dépendances**
  - Les actions sont sérialisées en markdown, puis converties en HTML côté client avant envoi à l’IA : ne pas sérialiser en JSON (le LLM recopierait littéralement).
  - Le prompt système impose toujours la sortie HTML structurée (jamais Markdown pur, jamais texte brut).
  - Lorsqu’un template utilisateur contient un séparateur `@@SCAFFOLD@@` ou un marqueur résumé, mode « scaffold » activé : tout sauf le bloc résumé est recopié littéralement.
  - Les labels (ton, longueur, instructions custom, vocabulaire, contexte) sont toujours prioritaires si renseignés dans le contexte utilisateur.
  - Les variables `{{résumé}}`, `{{actions}}`, etc. utilisées dans les scaffolds doivent être présentes dans `VARIABLE_CATALOG` pour cohérence éditeur / interpolation.
  - Fonctionne indépendamment côté client (formatage HTML des scaffolds) et côté serveur (génération prompt), sans dépend

### src/config/templates.test.js

- **Rôle du fichier :**
  - Tests unitaires des fonctions de personnalisation et de génération de prompts systèmes pour un module de templates.
  - Vérifie l'injection appropriée du contexte utilisateur et la robustesse face à l'absence de données de personnalisation.
  - S'assure de la non-régression sur des cas de personnalisation précédemment gérés.

- **Fonctions testées :**
  - `buildPersonalizationBlock(params: { userContext?: string, ... }) : string`
    - Retour : Chaîne contenant un bloc de contexte personnalisé si `userContext` est fourni et non vide/blanc. Sinon, chaîne vide.
    - Effet de bord : Aucun.
    - Points d’attention :
      - Ignore les valeurs vides ou constituées uniquement d’espaces pour `userContext`.
      - D’autres propriétés (ex : `ton`, `longueur`, `customPrompt`) ne déclenchent pas l’inclusion du contexte permanent.
  
  - `resolveSystemPrompt(mode: string, ctx: object, templates?: array) : string`
    - Retour : Prompt système (string) adapté au mode et contexte fourni, intégrant le contexte utilisateur si présent.
    - Effet de bord : Aucun.
    - Points d’attention :
      - En mode `"standard"`, n’intègre le bloc contexte que si `userContext` est fourni.
      - Avec un template utilisateur (mode personnalisé, ex : `mon-tpl`), le contexte utilisateur est injecté selon le template.
      - Ne rien injecter si absence de `userContext` dans le contexte (vérification de non-régression).
      - Dépendances : Utilise potentiellement un tableau de templates utilisateur en argument.

- **Points d’attention globaux :**
  - Tests sensibles à la présence ou l’absence du marqueur de contexte (`CONTEXTE PERMANENT DE L'UTILISATEUR`).
  - Vérification explicite des non-régressions lors d'appels sans contexte utilisateur.
  - Dépend de la bibliothèque de test [Vitest](https://vitest.dev/).
  - Interagit avec les exports de `src/config/templates.js`.  
  - Les edge cases autour des chaînes vides, blanches ou du formatage des arguments sont explicitement couverts.

### src/config/uiText.js

- **Rôle du fichier**
  - Centralise tous les textes d’interface utilisateur ("UI text") pour l’application MyBrief, en français et en anglais.
  - Permet de gérer facilement la traduction et la personnalisation de l’application pour l’ensemble des composants (menus, boutons, messages, erreurs, etc.).
  - Fournit également des textes par défaut pour les résumés à afficher avant la génération.

- **Exportations**
  - `uiTextData`
    - **Type** : objet `{ fr: { ... }, en: { ... } }`
    - **Description** : Regroupe l’ensemble des chaînes de caractères par langue. Structure hiérarchique par module/page (app, signIn, adminAuth, boutons, etc.).
    - **Paramètres** : aucun (c’est une simple constante exportée).
    - **Retour** : objet contenant tous les textes par langue.
    - **Effet de bord** : aucun.
  - `defaultSummaryTexts`
    - **Type** : objet `{ fr: string, en: string }`
    - **Description** : Texte de placeholder affiché dans la zone de résumé, avant toute génération.
    - **Paramètres** : aucun (constante).
    - **Retour** : objet avec texte FR/EN prêt à être affiché.
    - **Effet de bord** : aucun.

- **Points d’attention / Edge cases / Dépendances**
  - **Dépendances**
    - Ce fichier ne dépend d’aucune autre librairie ni module JS.
    - Certains textes font référence à des fichiers ou logiques externes, ex : la popup « Quoi de neuf ? » dépend de `src/whats-new.json`.
  - **Edge cases**
    - Certains libellés utilisent des variables (ex : `{version}`, `{email}`, `{max}`) attendues par interpolation côté front : attention si le code appelle une clé de texte sans fournir la variable attendue.
    - Les structures internes peuvent évoluer (ex : clés d’erreur comme `signIn.errors` ou `adminAi.errors`) : si une clé d’erreur serveur évolue ou une nouvelle apparaît, il faut la synchroniser ici.
    - Certaines valeurs (modèles, listes) sont utilisées pour du rendu dynamique (ex : `adminAi.models`) : une modification ou suppression inattendue d’une clé peut casser le rendu.
    - Les deux langues (FR/EN) doivent être mises à jour strictement en même temps pour éviter une expérience d’interface incohérente (fallback non prévu).
    - Certains chemins attendent des listes (par ex. `sections`, `dockCard.toneOptions`, etc.) : structure à respecter pour le composant appelant.
    - Certaines chaînes contiennent volontairement des balises HTML (`<b>`, `<br>`...), attendues pour un rendu "dangerouslySetInnerHTML" ou équivalent : sécuriser ces usages côté vue.
    - Les nouvelles additions ou suppressions de sections doivent être coordonnées avec les composants du front qui attendent ces clés.

- **Résumé**
  - Fichier purement déclaratif, sans logique ; il doit rester synchronisé avec les besoins/requêtes du front-end, en particulier pour la correspondance des clés et la gestion des placeholders dynamiques. Toute modification doit être testée dans l’UI pour vérifier l’absence de "undefined" ou d’interpolation non résolue.

### src/config/apiBase.js

- **Rôle du fichier**
  - Fournit une fonction utilitaire pour déterminer l'origine de l'API à utiliser dans l'application, à partir de la variable d'environnement `VITE_API_BASE_URL`.
  - Garantit que seul l'origine (protocole + domaine éventuellement port) est utilisée, jamais le chemin `/api`.
  - Permet de conserver des URLs API relatives (utilisation locale/web) ou absolues (utilisation mobile via Capacitor).

- **Fonction exportée**
  - `resolveApiOrigin(raw)`
    - **Paramètres**
      - `raw` (`string | any`) : chaîne contenant l’URL ou origine potentielle, typiquement issue d'une variable d'environnement.
    - **Retour**
      - `string` : Origine de l’API (ex : `https://example.com`), ou chaîne vide si non spécifiée/valide.
    - **Effet de bord notable**
      - Aucun.
      
- **Points d'attention**
  - Si le paramètre `raw` est nul, vide, ou ne contient que des espaces, la fonction retourne une chaîne vide (`''`) : toutes les URLs API resteront relatives.
  - Supprime tous les slashs (/) finaux et tolère la présence accidentelle d'un suffixe `/api` qui sera ignoré.
  - **Dépendances externes** : aucune.
  - Pour une origine incomplète ou mal formée, le comportement est de ne retourner que la partie avant `/api` ou de vider la valeur.
  - **Edge case** : passer une URL de type `https://foo.com/api/` retournera `https://foo.com`, ce qui évite la duplication du segment `/api` dans les requêtes ultérieures.

### src/config/configSections.js

- **Rôle du fichier :**
  - Source unique listant et centralisant toutes les sections de configuration (« Ma configuration ») de l’application.
  - Permet d’unifier la navigation dans [SettingsPanel] et l’aide contextuelle dans [HelpSection], en évitant la divergence entre navigation et documentation utilisateur.
  - Sert de référence unique pour tester la correspondance entre sections et aide (test dédié : `HelpSection.component.test.js`).  

- **Exports principaux :**
  - `CONFIG_SECTIONS`
    - Tableau ordonné d’objets : chaque objet décrit une section (id, groupe, fonction label, éventuelle condition `requires`).
    - Pas d’effet de bord.
  - `CONFIG_SECTION_IDS`
    - Tableau des identifiants (`id`s) des sections, calculé à partir de `CONFIG_SECTIONS`.
    - Pas d’effet de bord.
  - `visibleConfigSections({ connectable = false } = {})`
    - **Paramètre :**
      - `connectable?` : booléen (optionnel, défaut `false`). Indique si des fournisseurs externes peuvent être connectés (ex. Google/Microsoft).
    - **Retour :**  
      - Tableau filtré (`ConfigSection[]`) contenant seulement les sections autorisées dans le contexte courant (ignore celles qui nécessitent `connectable` si `connectable` est `false`).
    - **Effet de bord :** Aucun.

- **Points d’attention :**
  - **Ajout d’une section** : nécessite ajout ici, d’une icône dans `SettingsPanel`, textes FR/EN dans `uiText.welcome.rubrics.config.sections.<id>`. Un test signale tout oubli.
  - **Edge cases :**  
    - L’aide [HelpSection] impose qu’une entrée existe en FR et EN pour chaque id de section, y compris celles cachées conditionnellement.
    - Si un id est ajouté ici sans son texte d’aide ou icône/id UI associé, le test échouera explicitement.
  - **Dépendances** :
    - Les groupes référencent les clés dans `uiText.config`.
    - Fonctions `label` attendent un objet de traduction (`t`).
    - Les conditions sur `requires` (exemple, `'connectable'`) sont liées à des contextes techniques côté intégration (ex. présence d’un connecteur OAuth).

### src/config/helpShots.js

- **Rôle du fichier**  
  Centralise la gestion des captures d'écran d'aide effectives (png/jpg/jpeg/webp) livrées dans `src/assets/help/`. Fournit une interface pour accéder à l’URL d’une capture par son nom, facilitant leur utilisation dans l’UI sans maintenance manuelle.

- **Fonctions exportées**
  - `helpShot(name: string): string | null`  
    - **Paramètres** :  
      - `name` : nom du fichier capture SANS extension (ex: `"share-tab-macos"`)
    - **Retour** :  
      - URL de la capture si trouvée, sinon `null`.
    - **Effet de bord notable** :  
      - Aucun effet de bord. Si l’image est absente, retourne simplement `null`.

  - `HELP_SHOTS: Record<string, string>`  
    - Mapping (nom sans extension → URL servie) généré automatique à l’import.

- **Points d'attention**
  - Les images sont collectées automatiquement via `import.meta.glob` (Vite) lors du build — dépend du fonctionnement de Vite/ESM.
  - Ne jamais référencer une capture par son extension : seul le nom sans extension est utilisé.
  - Si la capture est absente, `helpShot()` retourne `null` : à gérer côté UI pour éviter une casse (prévu avec fallback schématique).
  - Un simple dépôt d’un fichier accepté dans le dossier suffit à l’inclure, aucun changement de code nécessaire.
  - Les noms doivent correspondre aux clés attendues côté composant/UI (`share-tab-macos`, etc.), inconsistance → image manquante.
