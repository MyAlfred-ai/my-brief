# config

### src/config/constants.js
- Centralise les URLs et les constantes de durée, d’audio, de mise en page et de seuils d’affichage de crédit. N’exporte aucune fonction.
- Exporte `apiOrigin`, calculée par `resolveApiOrigin(import.meta.env.VITE_API_BASE_URL)`, et `baseUrl`, égal à `${apiOrigin}/api`. Dépend de `src/config/apiBase.js` et de l’environnement Vite.
- `aiBaseUrl` est la base Realtime OpenAI, sans suffixe : ne pas lui ajouter `/calls`.
- `DOCS_URL`, `EXTENSION_STORE_URL` et `EXTENSION_ZIP_PATH` définissent les liens de documentation et d’extension. L’URL du store est vide jusqu’à la publication de l’extension.
- Les constantes temporelles règlent notamment la rotation et la détection de silence Realtime, la durée maximale d’enregistrement, les sauvegardes et les invites de poursuite. Les valeurs sont en millisecondes.
- Les constantes audio définissent les seuils de silence et d’activité ainsi que le keep-alive. Les constantes de mise en page sont des largeurs en pixels CSS, répétées en dur dans les styles ; veiller à les synchroniser. Les seuils `CREDIT_TONE_HIGH` et `CREDIT_TONE_LOW` correspondent aux parts de crédit restantes.

### src/config/scaffold.js

- Convertit le scaffold Markdown pris en charge en document JSON TipTap, et inversement, sans modifier le format stocké côté backend.
- Exports :
  - `KNOWN_VARIABLE_KEYS` : `Set` des clés autorisées, dérivé de `VARIABLE_CATALOG`.
  - `scaffoldToTiptapDoc(scaffold)` : chaîne de scaffold → document ProseMirror `{ type: 'doc', content }`. N’effectue pas d’écriture externe.
  - `tiptapDocToScaffold(doc)` : document ProseMirror → chaîne de scaffold. N’effectue pas d’écriture externe.
- Syntaxe gérée : titres `#`/`##`, listes à puces et ordonnées, gras, italique, souligné, variables reconnues et paragraphes vides via `<br>`.
- Points d’attention :
  - Dépend de `VARIABLE_CATALOG` (`./templates.js`) pour valider les variables. `resume` et `summary` sont normalisés en `résumé` ; les marqueurs inconnus restent du texte et les nœuds `variable` sont sérialisés depuis leur clé.
  - Le parseur inline bascule les marques à chaque délimiteur ; il ne valide pas leur appariement. Les lignes vides séparent les blocs ; `<br>` seul représente un paragraphe vide.
  - La sérialisation ne préserve que le sous-ensemble pris en charge. Les nœuds inconnus sont aplatis en contenu inline ; un document composé uniquement de paragraphes vides produit une chaîne vide.

### src/config/templates.js

- Définit les templates de compte rendu et construit les prompts système utilisés pour la génération, en mode scaffold comme en mode prompt libre.
- Exports de données :
  - `templates`, `templateMap`, `templateOptions` : templates codés en dur, indexés par `value`, et options simplifiées pour l’interface. Seul le template `standard` définit un `pageMeter`.
  - `VARIABLE_CATALOG`, `SCAFFOLD_MARKER_RE`, `FIXED_AI_BLOCKS`, `ANY_AI_BLOCK_RE` : variables et marqueurs utilisables dans l’éditeur et détectés dans les scaffolds.
  - `STARTER_TEMPLATES` : slugs proposés comme modèles de départ.
  - `DEFAULT_EDITABLE_TEMPLATES` : version éditable des templates codés en dur.
- Fonctions exportées :
  - `summaryActions(actions)` → tableau d’actions conservées ; normalise les actions stockées, puis exclut celles masquées (`show === false`) ou sans contenu. Pas d’effet de bord notable.
  - `withoutActionsSection(md)` → chaîne Markdown sans les lignes `{{actions}}` ni les titres de section devenus vides. Les titres qui conservent du contenu sont maintenus.
  - `buildPersonalizationBlock(ctx)` → bloc texte ou `''` ; ajoute au prompt les préférences de ton, longueur, instructions et contextes utilisateur/organisation.
  - `buildNotesBlock(ctx)` → bloc texte ou `''` ; injecte les notes de réunion et des règles strictes de référence orthographique.
  - `buildAttributionBlock(ctx)` → bloc texte ou `''` ; ajoute les consignes d’attribution si `ctx.transcriptAttribution` contient les labels requis.
  - `buildReferenceContextBlock(ctx)` → bloc texte ou `''` ; ajoute les contextes d’organisation et d’utilisateur comme référence orthographique.
  - `buildFixedBlockPrompt(block, ctx)` → prompt système d’un bloc IA à consigne fixe. Destiné à un appel LLM distinct ; les réglages de longueur et instructions supplémentaires du Dock ne s’y appliquent pas.
  - `buildTemplateOptions(userTemplates = [], customTemplates = [])` → options ordonnées par groupe `user`, `admin`, puis templates codés non recouverts. Déduplique par `value`, en donnant priorité aux templates personnels puis à ceux d’administration.
  - `templateListFrom(data)` → liste de templates valides. Accepte une liste, un objet seul ou `{ templates }` ; ne garde que les entrées avec `value`.
  - `splitPromptFields(promptStr)` → `{ instructions, scaffold }` ; les prompts sans séparateur `@@SCAFFOLD@@` sont traités comme des scaffolds historiques.
  - `combinePromptFields({ instructions, scaffold })` → chaîne combinée ; sans instructions, renvoie le scaffold seul.
  - `interpolateTemplate(promptStr, ctx)` → chaîne interpolée (`actions`, date, durée, auteur, langue et paramètres de personnalisation). La date et l’heure sont calculées à l’appel.
  - `resolveSummaryPlan(templateValue, ctx, customTemplates = [])` → objet `{ systemPrompt, blocks, length }` ; choisit un template personnalisé ou codé, construit le prompt et prépare les blocs IA fixes et les consignes du Pagimètre. Un template inconnu déclenche un `console.warn` et retombe sur `standard`.
  - `resolveSystemPrompt(templateValue, ctx, customTemplates = [])` → chaîne contenant le `systemPrompt` de `resolveSummaryPlan`.
- Points d’attention :
  - Dépend de `liveActionsMerge.js` pour normaliser/filtrer les actions et de `pageMeter.js` pour valider et calculer les longueurs.
  - Les regex de marqueurs ont le flag `g` et sont réutilisées : le code réinitialise `lastIndex` avant/après les tests concernés.
  - Le Pagimètre ne s’applique que si le template le propose et si `ctx.pages` est valide ; les blocs IA fixes sont générés séparément.
  - Les scaffolds sont convertis du sous-ensemble Markdown pris en charge vers HTML ; les marqueurs IA doivent rester isolés sur leur ligne. Les alias anglais du résumé sont reconnus, mais les templates codés utilisent des scaffolds français ou anglais explicites.

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

- Fournit les textes d’interface de MyBrief en français et en anglais, regroupés par écran et fonctionnalité, ainsi que les textes de résumé affichés par défaut.
- Exports :
  - `uiTextData` — objet de données indexé par langue (`fr`, `en`), contenant les libellés, messages et gabarits de l’interface. Les chaînes peuvent inclure des marqueurs `{...}` à interpoler par leurs appelants. Aucun effet de bord.
  - `defaultSummaryTexts` — objet de données indexé par langue, avec le texte initial du résumé. Aucun effet de bord.
- Points d’attention :
  - Ce fichier ne contient pas de fonction d’interpolation ni de sélection de langue : ces opérations sont à la charge des appelants.
  - Les clés et marqueurs des deux langues doivent rester cohérents avec les usages du code ; certaines clés correspondent à des slugs d’erreur ou à des identifiants de modèles fournis par d’autres modules.
  - Pas de dépendance externe ni d’effet de bord à l’import.

### src/config/apiBase.js

- Résout l’origine de l’API à partir de `VITE_API_BASE_URL`. La valeur attendue est une origine, sans chemin complet.
- `resolveApiOrigin(raw)` :
  - Paramètre : `raw`, valeur à normaliser.
  - Retour : chaîne vide si la valeur est absente ou vide ; sinon, valeur nettoyée des espaces et `/` finaux, avec le suffixe `/api` retiré s’il est présent.
  - Effet de bord : aucun.
- Points d’attention :
  - Dépend de la valeur fournie par l’environnement de build ; aucun accès direct à `import.meta.env`.
  - Une valeur vide produit des URL API relatives. Dans une WebView `capacitor://localhost`, elles n’atteignent pas le serveur ; un bundle embarqué doit donc définir l’origine.
  - Les valeurs non vides sont converties en chaîne avant normalisation.

### src/config/configSections.js

- Catalogue unique des entrées de navigation de « Ma configuration », dans leur ordre d’affichage : sections du panneau et liens externes.
- **`CONFIG_SECTIONS`** — tableau de descripteurs `ConfigSection` (`id`, `group`, fonction `label`, éventuellement `requires` ou `href`). Les libellés sont résolus à partir de `uiText` par le composant appelant. N’effectue pas d’effet de bord.
- **`visibleConfigSections(ctx = {})`** — prend les indicateurs `connectable`, `native`, `myBrain`, ainsi que `feedbackUrl` et `docsUrl` ; retourne une nouvelle liste filtrée. Retire les entrées conditionnelles indisponibles et remplace les URL de `help` et `feedback` selon le contexte. N’effectue pas d’effet de bord.
- Points d’attention :
  - `connectable`, `myBrain` et `native` valent `false` par défaut ; une URL de feedback vide masque l’entrée correspondante.
  - Une URL de documentation vide utilise `DOCS_URL`, importée de `./constants.js`.
  - Les entrées `help` et `feedback` sont des liens, pas des sections sélectionnables. Les clés des URL sont déterminées par les identifiants `help` et `feedback`.
  - Ajouter une section implique aussi de mettre à jour son icône et son écran dans `SettingsPanel`, ainsi que la documentation utilisateur.

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
