# api

### services/api/app.js

- Construit et configure l’application Fastify de l’API, avec ses dépendances injectables pour permettre les tests via `app.inject()` sans accès réseau ni processus serveur.
- **Exports :**
  - `BODY_LIMIT` — plafond des requêtes JSON : 32 Mio.
  - `FILE_LIMIT` — plafond d’un fichier multipart : 25 Mio.
  - `FIELD_LIMIT` — plafond d’un champ multipart, aligné sur `MAX_CONTENT`.
  - `buildApp(deps)` — reçoit notamment `db` et `openai` (requis), ainsi que des dépendances optionnelles injectables (`mailer`, clients et sondes externes, `config`, `logger`). Retourne une `FastifyInstance`. Effets notables : crée les dépôts et services, enregistre multipart, le gestionnaire d’erreurs et les routes ; les routes `/api` sont précédées du plugin d’authentification, contrairement aux callbacks OAuth2 et mobile hors `/api`.
- **Points d’attention :**
  - Le mailer désactivé par défaut fait échouer l’envoi avec `mailer_disabled`.
  - `trustProxy: true` suppose que l’API n’est accessible qu’à travers le proxy de confiance.
  - Les limites multipart portent sur un fichier et les champs ; `FIELD_LIMIT` suit `MAX_CONTENT` pour éviter toute divergence.
  - Les dépendances par défaut peuvent appeler des services externes (OpenAI, fournisseurs de transcription, Google, Drive, myBrain, sources de tarifs) ou utiliser `ffmpeg` ; les injecter en test pour éviter réseau et dépendances système.
  - Dépend de Fastify, `@fastify/multipart`, des modules `./routes/*` et `./lib/*`, ainsi que d’une base compatible avec les dépôts Mongo.

### services/api/lib/actions/document.js

- Centralise la validation et la normalisation des documents d’action reçus en JSON ou multipart, ainsi que l’assainissement du nom de fichier.
- Exports :
  - `MAX_CONTENT`, `TITLE_MAX`, `DOCUMENT_KINDS`, `DOCUMENT_LANGS`, `MEETING_ID_MAX` : constantes de limites et de valeurs autorisées, réutilisées par le schéma et la normalisation.
  - `actionDocumentSchema` : schéma JSON Ajv ; exige `kind` et `content`, interdit les propriétés supplémentaires.
  - `jsonOnlyBody` : configuration Fastify limitant l’application du schéma aux requêtes `application/json`, afin de ne pas valider le flux multipart avec Ajv.
  - `safeFilename(name, fallback = 'document')` : retourne un nom débarrassé des caractères interdits, des points initiaux et limité à 200 caractères ; effet notable : convertit `name` en chaîne et renvoie `fallback` si le résultat est vide.
  - `normalizeDocument(raw = {})` : retourne `{ document }` normalisé ou `{ error }` (`invalid_kind` ou `invalid_content`). Tronque `title` et `meetingId` ; utilise `fr` par défaut pour `lang`. N’effectue pas de validation Ajv.
  - `readMultipartDocument(req)` : retourne une promesse contenant `{ document, approved, file }` ou `{ error }`. Lit et met en tampon le fichier, normalise les champs multipart et assainit `part.filename` ; propage les erreurs autres qu’un dépassement de taille.
- Points d’attention :
  - `MAX_CONTENT` vaut 2 Mio ; `app.js` doit aligner la limite multipart `fieldSize`. Un dépassement du fichier renvoie `attachment_too_large`.
  - Le fichier doit être consommé avant la lecture des champs, conformément au comportement en flux de `@fastify/multipart`. L’absence de fichier renvoie `file_required`.
  - `approved` est vrai uniquement si le champ vaut exactement `"true"` ; ce champ exprime un consentement, pas une destination.
  - Les destinations ne sont pas lues dans cette fonction : elles proviennent des réglages persistés et sont résolues dans `lib/actions/resolve.js`. `meetingId` est une référence, à relire en base sous le scope du demandeur.
  - Le fichier multipart est relayé sans traitement de son contenu ; son type MIME retombe sur `application/octet-stream` s’il est absent.

### services/api/lib/actions/execute.js

- **Rôle du fichier**
  - Centralise l'exécution des actions post-réunion : envoi d'un document par email et dépôt sur un stockage cloud (Drive) lié au compte utilisateur.
  - Garantit que l'action réelle et celle du bouton « Tester » suivent exactement la même chaîne d’exécution, pour fiabilité des tests.
  - Gère la résolution du contexte d’action, l’application des politiques de sécurité (SMTP), le suivi des tentatives (logs).

- **Fonctions exportées**

  - **executeEmail(app, { user, document, attachments, ignorePersonal, log })**
    - **Paramètres**
      - `app` : instance Fastify (contexte applicatif).
      - `user` : objet utilisateur.
      - `document` : objet document à envoyer (kind, title, content, lang).
      - `attachments?` : tableau d’attachements `{filename, content, contentType}`.
      - `ignorePersonal?` : désactive certains paramètres personnalisés utilisateur (optionnel).
      - `log?` : logger (par défaut, un logger vide/noop).
    - **Retour**
      - Promise d’un objet résultat :
        - Succès : `{ ok: true, via, from, recipients, recipientsSource, subject, subjectSource, degraded }`
        - Erreur : `{ error, status, extra? }`
    - **Effets de bord**
      - Envoie l’email (par compte connecté ou SMTP selon config/autorisation).
      - Log l’envoi (succès/échec) via `recordMailAttempt`.
      - Supprime la connexion oauth révoquée côté fournisseur.
    - **Points d’attention**
      - Tentative sur compte lié (Gmail, Microsoft), fallback SMTP si oauth révoqué ou absent.
      - Politique SMTP : n’envoie à des tiers que si autorisé, sinon dégrade le destinataire (envoi à soi-même uniquement).
      - L’extension de la pièce jointe ne change pas, seul le nom de base varie : évite l’incohérence `.pdf` sur fichiers texte du mode test.
      - Gère la remontée détaillée d’erreur à l’appelant sans toucher au flux HTTP (`reply`).

  - **executeStore(app, { user, document, file, ignorePersonal, approved, log })**
    - **Paramètres**
      - `app` : instance Fastify.
      - `user` : objet utilisateur.
      - `document` : objet document.
      - `file` : fichier à déposer `{filename, content, contentType}`.
      - `ignorePersonal?` : idem ci-dessus.
      - `approved?` : booléen indiquant que l’utilisateur a validé la destination finale (par défaut false).
      - `log?` : logger (par défaut, noop).
    - **Retour**
      - Promise d’un objet résultat :
        - Succès : `{ ok: true, provider, folderPath, folderSource, filename, cacheUsed }`
        - Erreur : `{ error, status, extra? }`
    - **Effets de bord**
      - Dépose le fichier sur le Drive lié (au fournisseur défini en admin).
      - Met en cache la destination (dossier/folder) effectivement utilisée.
      - Purge la connexion oauth révoquée.
    - **Points d’attention**
      - Si approbation requise et non donnée, arrête l’action et renvoie le plan détaillé pour affichage.
      - Différencie clairement les erreurs « configuration manquante » (admin vs utilisateur).
      - Ne crée jamais de dossier, ni ne dépose, tant que l’approbation n’est pas explicite.

- **Points d'attention globaux**
  - Les seules fonctions à appeler `resolveActionContext` pour garantir cohérence entre action réelle et test.
  - Dépendances réseau importantes : connexions OAuth, Drive, SMTP/Gmail/Microsoft API.
  - Tous les cas d’erreur attendus (non connecté, autorisation révoquée, action désactivée) sont gérés explicitement et logués.
  - Design pour diagnostiquer/retourner des erreurs sans modifier la réponse HTTP (pour usage côté « test action »).
  - Possibles effets de synchronisation si action répétée simultanément (ex : suppression de connexion, cache drive).

### services/api/lib/actions/mailLog.js

- **Rôle du fichier**  
  - Fournit une piste d’audit des envois d’emails liés aux actions utilisateurs, via la collection MongoDB `actionMailLog`.
  - Permet à l’exploitant de tracer les destinataires et la date d’envoi pour répondre à des demandes ultérieures (cf. RGPD, sécurité).

- **Fonctions exportées**
  - `MAIL_LOG_COLLECTION`
    - Nom de la collection MongoDB utilisée (`actionMailLog`).
  - `MAIL_LOG_TTL_SECONDS`
    - Durée de rétention des logs (90 jours, en secondes).
  - `recordMailAttempt(app, entry)`
    - **Paramètres :**
      - `app` : Instance Fastify incluant la connexion à la base MongoDB.
      - `entry` : Objet décrivant la tentative d’envoi (utilisateur, type d’action, canaux, destinataires, sujet, statut, logs, etc.).
    - **Retour :**
      - Promise (résolution sans donnée utile, jamais rejetée).
    - **Effets de bord :**
      - Enregistre l’événement dans MongoDB (`actionMailLog`).
      - Logge l’opération (succès/échec de l’écriture en base) via les fonctions passées dans `entry.log` (ou fallback no-op).
      - N’émet jamais d’exception vers l’appelant (échecs silencieux côté API, journalisés seulement).

- **Points d’attention**
  - **Edge cases** :
    - Le log peut échouer (problème MongoDB), mais ne fait jamais échouer la route appelante : l’utilisateur ne voit pas l’erreur.
    - Les champs optionnels de `entry` sont renseignés par défaut (ex : `from`, `to`, `cc` à valeur vide si absent).
    - Seul le métadonné (jamais le corps ni la pièce jointe de l’email) est stocké, pour garantir la confidentialité.
  - **Dépendances** :
    - Base MongoDB sous-jacente, via `app.db`.
    - Optionnellement, un logger dans `entry.log` (sinon stub interne silencieux).
    - TTL et suppression automatique de la collection gérés par la configuration du dépôt (voir `lib/bootstrap.js`).
  - **Sécurité** :
    - La suppression d’un compte efface ses traces d’audit (priorité donnée à la suppression complète des données).  
    - Pas de conservation définitive, conformément aux exigences de vie privée.

### services/api/lib/actions/recipients.js

- **Rôle du fichier :**
  - Gère la logique de normalisation et de résolution des destinataires d'un envoi d'action (emails).
  - Applique les règles : 
    - la liste de destinataires vient uniquement des réglages utilisateurs stockés,
    - nombre d'emails plafonné (hard ceiling et valeur par défaut),
    - le compte connecté est toujours mis en copie (jamais de document envoyé à son nom sans copie).

- **Fonctions exportées :**

  - **`normalizeRecipients(list, { max })`**
    - **Paramètres :**
      - `list` : Liste d'adresses à normaliser (type inconnu, attendu array).
      - `max` (optionnel, via options) : Nombre maximum autorisé (par défaut à `DEFAULT_MAX_RECIPIENTS` mais jamais supérieur à `MAX_RECIPIENTS_CEILING`).
    - **Retour :**
      - Objet `{ recipients: string[], rejected: string[], truncated: boolean }`
        - `recipients` : emails normalisés et validés (minuscule, uniques, pas de caractères interdits, valide vis-à-vis des patterns, max. `max` éléments).
        - `rejected` : emails rejetés (syntaxe invalide, caractères interdits, doublon, trop longs).
        - `truncated` : booléen, indique si la liste valide a été tronquée au plafond.
    - **Effets de bord notables :**
      - Filtrage sur taille, caractères interdits, pattern email, unicité (insensible à la casse).

  - **`resolveRecipients({ stored, account, max })`**
    - **Paramètres :**
      - `stored` : Liste stockée des destinataires (type inconnu ; passée à `normalizeRecipients`).
      - `account` : Adresse email du compte connecté (string).
      - `max` (optionnel) : Nombre max de destinataires acceptés (défaut à `DEFAULT_MAX_RECIPIENTS`).
    - **Retour :**
      - Objet `{ to: string[], cc: string[], source: 'user' | 'account' }`
        - `to` : destinataires de l'envoi (la liste normalisée via `stored`, ou le compte seul si vide).
        - `cc` : copie cachée (toujours le compte connecté s'il n'est pas déjà dans `to`).
        - `source` : `'user'` si la liste vient de l'utilisateur, `'account'` si retour au comportement historique (aucun destinataire enregistré).

- **Autres exports constants :**
  - `MAX_RECIPIENTS_CEILING` (20) : Nombre maximum absolu de destinataires (valeur haute indépassable).
  - `DEFAULT_MAX_RECIPIENTS` (10) : Valeur par défaut du plafond (réglable par l'utilisateur, mais jamais au-dessus de `MAX_RECIPIENTS_CEILING`).

- **Points d'attention :**
  - **Contraintes d'adresses email :**
    - Caractères explicitement interdits (virgule, chevrons, guillemets, espaces, etc. ; voir RegExp `FORBIDDEN_IN_ADDRESS`).
    - Emails convertis en minuscules pour éviter les doublons à la casse.
    - Taille max : 320 caractères/email.
    - Pattern email utilisé : `EMAIL_RE` (dépendance à `../auth/emailPattern.js`).
  - **Cas limites :**
    - Fournir une liste vide/nulle => seul le compte connecté recevra l'email.
    - Si email du compte connecté déjà dans la liste, il ne sera pas remis en cc (évite le doublon visible).
    - Plusieurs appels à la fonction (à l’écriture et à la lecture) garantissent qu’aucun contournement du plafond n’est possible, même si les données utilisateurs ont été modifiées manuellement ou par une ancienne version.
  - **Dépendances :**
    - Utilise la regex d’email `EMAIL_RE` du module `../auth/emailPattern.js`.
    - Aucune dépendance réseau, DB, ou framework — module purement logique/testable.

### services/api/lib/actions/resolve.js

- Centralise la résolution du contexte d’une action : réglages personnels, organisation, valeurs intégrées et règles de tag. Appelé par `execute.js`, notamment pour que le bouton « Tester » utilise le même chemin que l’exécution réelle.
- **Fonctions exportées :**
  - `hasDestination(storage)` — indique si `storage` définit un chemin ou un `driveId` ; retourne un booléen. Préserve les destinations à la racine d’un Drive partagé (`folder: ''`, `driveId` renseigné).
  - `todayPart(now = new Date())` — retourne la date locale au format `AAAA-MM-JJ` ; ne convertit pas en UTC.
  - `templateVars({ document, account })` — retourne les variables des gabarits (`titre`, `date`, `type`, `compte`) ; langue inconnue ramenée au français, champs absents ramenés à une chaîne vide.
  - `resolveActionContext(app, { user, document, ignorePersonal = false })` — retourne le contexte résolu (interrupteurs, destinataires, objet, nom de fichier, dossier, tag, approbation, politique et fournisseur). Effets de bord : lit les réglages, les paramètres utilisateur et, si un `meetingId` est présent, la conversation et son tag en base. `ignorePersonal` simule des réglages personnels absents et ignore le tag ; destiné au test administrateur.
- **Résolution du dossier :** un dossier explicite associé au tag remplace celui du compte ; sinon, un sous-dossier peut être créé depuis le libellé du tag. Le `/` du libellé est remplacé par `-`. À défaut, priorité au personnel, puis à l’organisation, puis au dossier intégré ; chemin et Drive sont traités comme un couple.
- **Points d’attention :**
  - Les tags sont obtenus via `document.meetingId`, jamais depuis le corps de la requête ; conversation et tag sont recherchés sous le scope de `user.email`. Tag absent, supprimé ou inaccessible : pas d’échec, résolution sans tag.
  - Les interrupteurs et la politique viennent de l’administration seule ; `requireApproval` est personnel.
  - L’extension fournie au gabarit de nommage est indicative : l’extension réellement appliquée dépend du fichier transmis.
  - Dépend de `recipients.js`, `templating.js`, `ownerScope.js`, de la collection `TAGS_COLLECTION` et des services `app.settings`, `app.userActions` et `app.db`.

### services/api/lib/actions/templating.js

- **Rôle du fichier :**
  - Fournit un module de gestion de gabarits (templates) pour sujets de mails et noms de fichiers, avec interpolation des variables autorisées (`{{clé}}`), substitution sécurisée sur une seule passe et sanitation stricte. Pas basé sur une interpolation récursive, afin d’éviter toute injection ou substitution indésirable.

- **Fonctions et constantes exportées :**
  - `ACTION_VARIABLES`
    - Description : Liste close des variables autorisées dans les templates (`key` canonique + aliases).
    - Usage : Fournie côté API (endpoint `GET /api/actions/settings`).

  - `SUBJECT_MAX`, `TEMPLATE_MAX`
    - Description : Limites maximales de longueur pour sujets et templates (200 caractères).

  - `listTemplateVariables(template)`
    - Paramètres :
      - `template` (`string`) : le gabarit à analyser.
    - Retour :
      - Objet `{ known: string[], unknown: string[] }`, listant les variables reconnues/inconnues dans le template.
    - Effet de bord : Aucun.
    - Attention : Permet la validation du template à la saisie, pour refuser les variables inconnues en amont.

  - `renderActionTemplate(template, vars = {}, { max = SUBJECT_MAX } = {})`
    - Paramètres :
      - `template` (`string`) : le gabarit à interpoler.
      - `vars` (`Record<string, string>`) : valeurs associées aux clés.
      - `options.max` (`number`, optionnel) : longueur max du rendu (défaut : `SUBJECT_MAX`).
    - Retour :
      - `string` : rendu interpolé puis assaini et tronqué.
    - Effet de bord : Aucun.
    - Attention :
      - Les placeholders inconnus (`{{xxx}}`) sont supprimés (jamais laissés littéraux).
      - Sanitation stricte : suppression de tout caractère de contrôle/retour ligne.
      - Ne refait jamais une substitution à l’intérieur d’une valeur remplacée.
      - Si template vide/out "blanc", retour chaîne vide.

  - `slugifySegment(value, fallback = '')`
    - Paramètres :
      - `value` (`string`) : valeur texte à purifier.
      - `fallback` (`string`) : valeur de repli si résultat vide.
    - Retour :
      - `string` : chaîne "slugifiée" (ascii minuscule, séparateurs -), max 80 caractères.
    - Effet de bord : Aucun.
    - Attention :
      - Traite aussi la décomposition unicode, nettoyage des diacritiques.
      - Doit rester synchronisé avec la logique côté client.

  - `renderFilenameTemplate(template, vars = {}, { ext })`
    - Paramètres :
      - `template` (`string`) : gabarit du nom de base (sans l’extension).
      - `vars` (`Record<string, string>`) : valeurs de remplacement.
      - `{ ext }` (`string`) : extension (jamais gabaritée).
    - Retour :
      - `string|null` : nom de fichier (slug+ext) ou `null` si le slug est vide.
    - Effet de bord : Aucun.
    - Attention :
      - Si le template est vide ou rend une chaîne vide après substitution/slugification, retourne `null`.
      - Extension toujours fixée par l’appelant, jamais dans le template.

- **Points d'attention / edge-cases / dépendances :**
  - La liste de variables (`ACTION_VARIABLES`) est strictement close et unique (API→Frontend).
  - Pas d’interpolation récursive : chaque substitution est unique et non ré-analysée.
  - L'ensemble du module est conçu sans dépendance externe ; attention à bien synchroniser la logique de slugification avec celle du client (voir fichier de test de parité côté `src/`).
  - La sanitation empêche tout caractère de contrôle ou usage malicieux (ex: injection d’en-tête mail).
  - Suppression stricte des variables non reconnues : garantit qu’aucun placeholder ne reste brut après interpolation.

### services/api/lib/actions/testDocument.js

- Construit un document et un fichier texte factices pour tester la configuration d’envoi, sans données de réunion.
- Fonction exportée :
  - `buildTestDocument({ user, kind = 'summary', lang = 'fr', now = new Date() })` : retourne `{ document, file }`. `document` est produit par `normalizeDocument`; `file` contient `filename`, `content` (un `Buffer`) et `contentType`. Aucun envoi ni upload n’est effectué dans ce fichier.
- Points d’attention :
  - `user.email` et une date compatible avec `toISOString()` sont attendus.
  - `kind === 'summary'` génère du HTML; toute autre valeur génère du texte brut. `lang` non pris en charge retombe sur le français.
  - Le fichier s’appelle toujours `mybrief-test.txt` et n’est pas supprimé ici.
  - Dépend de `normalizeDocument` (`./document.js`) et de l’API globale `Buffer`.

### services/api/lib/auth/cookies.js

- **Rôle du fichier**  
  Gestion manuelle du cookie de session (nommé `mybrief_sess`) côté API, sans dépendances externes, pour conserver un contrôle précis sur l’ordre des middlewares Fastify et éviter des problématiques de hooks/cookies.

- **Fonctions exportées**
  - `SESSION_COOKIE`  
    - *Constante* : nom du cookie de session (`'mybrief_sess'`)
  
  - `readCookie(req, name)`  
    - *Paramètres* : `req` (FastifyRequest), `name` (string)  
    - *Retour* : valeur du cookie (string) ou chaîne vide si absent  
    - *Effet de bord* : aucun  
    - *Note* : Tolère les cookies mal formés (ignore ou retourne la valeur brute si `decodeURIComponent` échoue)
  
  - `readSessionToken(req)`  
    - *Paramètres* : `req` (FastifyRequest)  
    - *Retour* : valeur du cookie de session (string) ou chaîne vide si absent  
    - *Effet de bord* : aucun  
  
  - `serializeCookie(name, value, opts?)`  
    - *Paramètres* :  
      - `name` (string), `value` (string)  
      - `opts` (objet optionnel : `{maxAgeSec?, secure?, sameSite?, path?}`)  
    - *Retour* : en-tête cookie HTTP sérialisé (string)  
    - *Effet de bord* : aucun  
    - *Note* : Ne définit jamais le champ `Domain` (Limite le cookie à l’hôte courant)

  - `appendCookie(reply, value)`  
    - *Paramètres* :  
      - `reply` (FastifyReply),  
      - `value` (string, en-tête Set-Cookie sérialisé)  
    - *Retour* : aucun  
    - *Effet de bord* : modifie l’en-tête `set-cookie` dans la réponse (conserve les autres Set-Cookie existants)
    - *Note* : Permet la définition de plusieurs cookies sans en effacer
  
  - `setSessionCookie(reply, token, { maxAgeMs, secure? })`  
    - *Paramètres* :  
      - `reply` (FastifyReply)  
      - `token` (string)  
      - `{ maxAgeMs, secure? }`  
    - *Retour* : aucun  
    - *Effet de bord* : modifie l’en-tête `set-cookie` dans la réponse pour poser le cookie de session

  - `clearSessionCookie(reply, { secure? } = {})`  
    - *Paramètres* :
      - `reply` (FastifyReply)
      - `{ secure? }` (optionnel)
    - *Retour* : aucun
    - *Effet de bord* : remplace le cookie de session par une version expirée (pour forcer la suppression côté client)

- **Points d'attention**
  - **Nom du cookie** : DOIT rester synchronisé avec la règle Traefik et le frontend (ne pas renommer sans refactor)
  - **Sécurité** : Cookies toujours HttpOnly et, par défaut, Secure + SameSite=`Lax`.
  - **Domain** : N’est jamais positionné (évite toute fuite sur les sous-domaines)
  - **Fastify** : Ne pas confondre la gestion maison avec le plugin `@fastify/cookie`
  - **Effacement de cookie** : Nécessaire pour éviter des boucles de 401 côté API lorsque le cookie est invalide
  - **Multi-cookie** : `reply.header('set-cookie', ...)` REMPLACE la valeur. Utiliser `appendCookie` pour ne rien perdre.
  - **Pas d’état global** : Manipulation strictement scope à la requête/réponse.  
  - **Edge cases** :  
    - Cookies mal formés (sans `=`, valeurs non encodées)
    - Absence de header `cookie`  
    - Absence de header `set-cookie` avant append

- **Dépendances**  
  - Nécessite les types Fastify : `import('fastify').FastifyRequest` et `FastifyReply`  
  - Aucune autre dépendance externe

### services/api/lib/auth/domains.js

- **Rôle du fichier :**
  - Gère la liste des domaines email autorisés à se connecter/auto-créer un compte via Google, en filtrant et en normalisant les domaines.
  - Garantit qu’une liste vide de domaines interdit toute création de compte automatique.

- **Fonctions exportées :**
  - `normalizeDomain(value)`
    - **Paramètre :** `value` (string) — une chaîne pouvant représenter un domaine (email, URL, etc.).
    - **Retour :** (string) — le domaine normalisé en minuscules, sans protocole, ni `@`, ni chemin, ou `''` si inexploitable.
    - **Effet de bord notable :** Aucun.
  - `domainOf(email)`
    - **Paramètre :** `email` (string)
    - **Retour :** (string) — la partie domaine de l’email en minuscules, ou `''` si l’email est mal formé.
    - **Effet de bord notable :** Aucun.
  - `sanitizeDomainList(values)`
    - **Paramètre :** `values` (string[]) — liste de domaines.
    - **Retour :** (string[]) — liste normalisée, dédoublonnée, filtrée (aucune entrée vide, aucun domaine sans point).
    - **Effet de bord notable :** Aucun.
  - `isDomainAllowed(email, allowedDomains)`
    - **Paramètres :** 
      - `email` (string)
      - `allowedDomains` (string[])
    - **Retour :** (boolean) — indique si le domaine de l’email figure dans la liste autorisée (liste vide = refus automatique).
    - **Effet de bord notable :** Aucun.

- **Points d’attention :**
  - Une **liste de domaines vide bloque toute nouvelle création de compte** même si l’utilisateur possède un compte Google valide.
  - Les domaines sans point (`localhost`, `intranet`) sont ignorés lors de la normalisation de la liste.
  - Les comptes déjà existants ne sont pas affectés par la liste des domaines autorisés pour la connexion, seulement pour la création automatique.
  - Dépendances : aucune dépendance externe, pur JS standard.
  - Les fonctions tolèrent des entrées vides ou malformées (`undefined`, `null`, chaînes vides) et retournent alors des valeurs par défaut sécurisantes.

### services/api/lib/auth/emailPattern.js

- **Rôle du fichier :**
  - Définit et exporte une expression régulière (regexp) centralisée pour la validation syntaxique permissive des adresses e-mail, afin d’harmoniser la logique de validation entre différents modules du dépôt.

- **Fonctions / constantes exportées :**
  - `EMAIL_PATTERN`
    - **Type** : `string`
    - **Description** : Expression régulière sous forme de chaîne, matchant une structure e-mail simple (texte@texte.texte, pas d’espace ou de @ multiples).
    - **Paramètres** : Aucun.
    - **Retour** : Chaîne contenant l’expression régulière.
    - **Effet de bord** : Aucun.

  - `EMAIL_RE`
    - **Type** : `RegExp`
    - **Description** : Objet `RegExp` instancié à partir de `EMAIL_PATTERN` pour valider une chaîne sous forme d’adresse e-mail.
    - **Paramètres** : Aucun.
    - **Retour** : Objet `RegExp`.
    - **Effet de bord** : Aucun.

- **Points d'attention :**
  - Validation volontairement permissive : certains caractères invalides dans des contextes mail (ex : virgules, chevrons, guillemets) sont acceptés ici.
  - NE CONVIENT PAS pour une adresse insérée dans un en-tête email ou pour gestion multi-destinataires : ex. `a@b.fr,victime` passera cette validation.
  - Pour filtrer des caractères explicitement interdits (ex. usage en transport mail), se référer à `lib/actions/recipients.js`.
  - Dépendances internes : pas d’import externe, mais ce motif doit rester synchronisé avec la validation métier des destinataires (`lib/actions/recipients.js`).
  - Ne respecte pas strictement la RFC 5322, pour raison de compatibilité pratique avec des adresses valides mais atypiques.

### services/api/lib/auth/mobileJwt.js

- **Rôle du fichier**
  - Gère l'émission et la vérification de jetons JWT HS256 pour l'authentification mobile.  
  - Permet la validation des requêtes API mobiles via un bearer JWT, avec identité harmonisée avec le flux web.
  - Les jetons émis ne sont pas révocables individuellement (stateless) : seul un changement du secret global invalide tout le parc mobile.
  - Garde une compatibilité avec les anciens jetons grâce à l’issuer fixé (`mybrief-mobile-auth`).

- **Fonctions exportées**
  - `MOBILE_JWT_ISSUER`
    - Constante. Valeur : `'mybrief-mobile-auth'`.
    - Identifiant d'issuer utilisé dans les JWT émis.
  - `MIN_SECRET_LENGTH`
    - Constante. Valeur : `32`.
    - Longueur minimale requise du secret pour activer la fonctionnalité.
  - `isUsableSecret(secret: string): boolean`
    - Vérifie si une chaîne est un secret valide (non vide, longueur ≥ 32).
    - Retourne `true`/`false`.
  - `signMobileJwt(claims: object, opts: {secret: string, ttlDays: number}): string`
    - Crée un JWT signé HS256 avec : sous (`sub`), identifiant utilisateur (`user`), email, nom, avatar fournis dans `claims`.
    - Paramètres :  
      - `claims` : Informations d'identité pour inclusion dans le JWT.
      - `opts.secret` : Secret de signature HMAC (exigé).
      - `opts.ttlDays` : Durée de validité en jours.
    - Retour : le jeton JWT (string).
    - Effet de bord : Aucun.
  - `verifyMobileJwt(token: string, opts: {secret: string}): object|null`
    - Vérifie et décode un JWT mobile.
    - Paramètres :
      - `token` : JWT à valider.
      - `opts.secret` : Secret HMAC.
    - Retourne les claims (objet) si succès, sinon `null`.
    - Effet de bord : Aucun. Retourne `null` si rejet.
    - Point de sécurité : Pinning explicite de l’algorithme à `'HS256'` pour éviter les attaques par confusion d’algorithme.
  - `bearerOf(authorization: string): string`
    - Extrait le JWT d’un header `Authorization: Bearer ...`.
    - Retourne le token ou la chaîne vide si absent.

- **Points d'attention**
  - **Non révocable** : Les jetons sont valides jusqu’à leur expiration ou changement du secret global (`MOBILE_AUTH_JWT_SECRET`).
  - **Pinning algorithme** : Le pinning de `algorithms: ['HS256']` à la vérification protège contre de graves failles JWT.
  - **Compatibilité** : Ne pas modifier `MOBILE_JWT_ISSUER` sans procédure de migration, sous peine de déconnecter tout le parc mobile.
  - **Longueur minimale du secret** : En dessous de 32 caractères, les fonctionnalités JWT mobiles sont inactives.
  - **Librairie dépendante** : Utilise le package npm `jsonwebtoken` pour signer/vérifier les JWT.
  - **Gestion des edge-cases** :  
    - Rejette silencieusement les jetons mal formés, secrets faibles, ou en absence de token.  
    - `bearerOf()` retourne la chaîne vide si l’en-tête Authorization n’a pas le format attendu.

### services/api/lib/auth/mobileTokens.js

- **Rôle du fichier**
  - Gère les jetons à usage unique (OTT) pour l'authentification mobile, destinés à relier une authentification navigateur et une récupération dans l'app par deep link, avec protection PKCE.
  - Stockage temporaire en mémoire (usage unique, TTL court).

- **Fonctions et constantes exportées**
  - `sha256b64url(value: string): string`
    - Calcule le SHA-256 d’une chaîne, retourne le résultat en base64url.
    - **Effet de bord :** Aucun.
  - `CODE_CHALLENGE_RE: RegExp`
    - Expression régulière validant la forme d’un code challenge PKCE (base64url, 20 à 100 caractères).
    - **Effet de bord :** Aucun.
  - `createOttStore(opts?: { ttlMs?: number, sweepMs?: number, now?: () => number }): { issue, consume, size, stop }`
    - Crée une instance en mémoire du store à OTT :
      - `issue(cc: string, identity: object): string`
        - Génère un OTT associé à un code challenge PKCE (`cc`) et une identité, retourne le jeton.
        - **Effet de bord :** Modifie la map des OTT stockés.
      - `consume(ott: string, verifier: string): {ok: true, identity: object} | {ok: false, reason: string}`
        - Invalide définitivement le jeton, vérifie sa validité, son expiration et la concordance PKCE (`verifier` hashé ⇆ `cc`).
        - **Effet de bord :** Retire le jeton du store dès l'appel (usage unique, qu'importe le résultat).
      - `size(): number`
        - Retourne le nombre d’OTT stockés actuellement.
      - `stop(): void`
        - Arrête le sweeping automatique (nettoyage régulier des OTT expirés), vide le store.
    - **Effet de bord supplémentaire :** Timer interne (setInterval), qui garde le process vivant sauf si .unref() (utilisé ici).

- **Points d’attention / edge cases**
  - **Usage unique :** Un OTT consommé est invalide, même en cas de mauvais PKCE ou d’expiration.
  - **Expiration stricte :** Un OTT est valide pour 60s (par défaut) ; une dérive d’horloge côté serveur peut impacter l’usage.
  - **Deep links interceptables :** La sécurité repose sur PKCE, pas sur le secret du jeton seul.
  - **Stockage en mémoire :**
    - Une perte du process (redémarrage) invalide tous les OTT en cours.
    - Non persistant : pas d’échange inter-processus.
  - **Dépendances externes :**
    - Node.js `crypto` (createHash, randomBytes, timingSafeEqual).
  - **Sécurité :** Utilisation de `timingSafeEqual` pour éviter les attaques par timing lors de la comparaison PKCE.
  - **Tests/arrêt du process :** Le timer utilise `.unref()` pour éviter de bloquer la terminaison naturelle du process (notamment utile en test).

- **Exemples d’utilisation/flows impactés**
  - Génération d’un OTT lors de l’auth mobile, consommation unique côté app avec vérification PKCE.

### services/api/lib/auth/oauthFlow.js

- **Rôle** : centralise les étapes communes des flux OAuth 2.0 / OIDC : cookie et contrôle du `state`, démarrage PKCE, résolution des endpoints et récupération du profil. Les appelants gardent la gestion des erreurs et le traitement du profil.
- **Fonctions exportées** :
  - `createStateCookie(app, name)` — retourne `{ name, set(reply, state), clear(reply) }`. Pose ou purge le cookie d’état, avec une durée liée à `app.oauthStates.ttlMs` et l’option `secure` de la configuration. Le cookie lie le flux au navigateur.
  - `endpointsFor(provider, conf)` — retourne les endpoints résolus via la découverte du fournisseur, avec ses endpoints de repli.
  - `startOAuth(app, req, reply, opts)` — retourne une `Promise<string>` contenant l’URL d’autorisation. Génère une paire PKCE, persiste le vérificateur et les données du flux dans `app.oauthStates`, pose le cookie et ajoute les paramètres supplémentaires à l’URL. Le `code_verifier` reste côté serveur.
  - `consumeState(app, req, reply, opts)` — retourne une `Promise<{ ok: true, pending } | { ok: false }>` après vérification et consommation du `state`. Purge le cookie dans tous les cas ; exige la correspondance URL/cookie, un état non consommé, un code et le bon marqueur de flux. Les anciens états sans fournisseur sont considérés comme Google.
  - `mergeIdentityClaims(userinfo, idClaims)` — retourne un profil fusionné. `userinfo` fait autorité ; seuls `preferred_username`, `upn` et `name` peuvent être complétés depuis l’id_token, et uniquement si les `sub` concordent.
  - `exchangeForProfile({ code, conf, pending, endpoints })` — retourne une `Promise<{ tokens, profile }>` après échange du code puis lecture de `userinfo`, complétée par les claims admissibles de l’id_token. Lève en cas d’échec de l’IdP.
- **Points d’attention** :
  - Dépend de `cookies.js`, `oidcClient.js` et de `app.oauthStates` ; la durée et la sécurité du cookie dépendent de la configuration de l’application.
  - Les cookies d’état sont propres à chaque flux, sauf exception de routage documentée dans les fournisseurs ; leur nom doit donc être choisi selon le flux.
  - `consumeState` consomme l’état avant de vérifier le code et le fournisseur : en cas d’échec, il ne peut pas être réutilisé.
  - La fusion refuse tout complément de l’id_token si son `sub` manque ou contredit celui de `userinfo` ; `email` et `email_verified` ne sont jamais repris de l’id_token.

### services/api/lib/auth/oauthState.js

- **Rôle du fichier :**
  - Gère le stockage temporaire, sécurisé et usage unique des états OAuth (state, code_verifier PKCE) côté serveur, afin de protéger contre les attaques CSRF lors du SSO via Google/Microsoft.
  - Permet de distinguer et sécuriser les différents types de flux OAuth qui partagent la même URI de callback.

- **Fonctions/Constantes exportées :**
  - `OAUTH_STATE_COLLECTION`  
    - Nom de la collection MongoDB utilisée : `'authOAuthState'`.
  - `OAUTH_STATE_COOKIE`  
    - Nom du cookie fixement attendu : `'mybrief_oauth'` (attention, le nom ne doit pas être modifié sans coordination avec la configuration Docker Compose et le reverse-proxy).
  - `createOAuthStateStore(db, { ttlMs } = {})`  
    - **Paramètres** :  
      - `db` : instance MongoDB.
      - `ttlMs` (optionnel) : durée de validité des états, défaut 10 min.
    - **Retour** :  
      - Un objet offrant trois méthodes asynchrones :
        - `issue({ codeVerifier, redirectUri, provider?, next?, ip?, meta? })`
          - Génère un nouvel état OAuth, stocké en base.
          - **Paramètres** : objets obligatoires/optionnels (voir code).
          - **Retour** : `{ state, expiresAt }`
          - **Effet de bord** : écrit un document en base.
        - `peekProvider(state)`
          - Retourne le provider associé à un état sans consommer ce dernier.
          - **Paramètre** : `state` (string)
          - **Retour** : provider (string) ou chaîne vide si inconnu/périmé.
          - **Effet de bord** : aucune (simple lecture).
        - `consume(state)`
          - Consomme et invalide un état de manière atomique (usage unique).
          - **Paramètre** : `state` (string)
          - **Retour** :  
            `{ codeVerifier, redirectUri, provider, next, meta }` ou `null` si état invalide/périmé/déjà consommé.
          - **Effet de bord** : modifie le document (`usedAt`), empêche une réutilisation.

- **Points d'attention :**
  - **Nom du cookie** : essentiel et câblé dans l'infra, ne doit pas changer, conditionne le bon aiguillage des retours OAuth.
  - **TTL mongo** : même si la collection a un TTL, le contrôle côté application est nécessaire car Mongo ne purge qu'à la minute.
  - **Sécurité** : le cookie doit rester `SameSite=Lax` pour compatibilité avec les retours OAuth cross-site.
  - **Usage unique** : garanti par `findOneAndUpdate` atomique (empêche les attaques par rejeu).
  - **Flux multiples** : même URI de callback pour différents flux, nécessitant la détection du provider en base avant traitement.
  - **Dépendances** :
    - Utilisation de la collection MongoDB `authOAuthState`.
    - Package Node.js natif `crypto` (`randomBytes`).
  - **Edge cases** :
    - Si le provider n’est pas défini sur d’anciens documents, il est implicitement `google`.
    - Paramètres optionnels (`next`, `meta`) gérés avec des valeurs par défaut.
    - Retourne une chaîne vide ou null si absence ou péremption du state.

- **Analogies internes repo** :
  - Mécanique similaire à `lib/auth/resetTokens.js` (usage unique/token gestion).

### services/api/lib/auth/oidcClient.js

- **Rôle** : client OAuth 2.0 / OpenID Connect générique côté API. Gère la découverte des endpoints, PKCE, la construction de l’URL d’autorisation, l’échange du code et la récupération des informations utilisateur. Les spécificités des fournisseurs sont dans `providers.js`.
- **Fonctions exportées** :
  - `getEndpoints({ discoveryUrl, fallback = null, fetchImpl = fetch })` → `Promise<{ authorization_endpoint, token_endpoint, userinfo_endpoint }>` ; récupère les endpoints OIDC et les met en cache 24 h par URL. En cas d’échec, retourne `fallback` s’il est fourni, sinon lève une erreur.
  - `createPkcePair()` → `{ verifier, challenge }` ; génère une paire PKCE S256.
  - `buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, endpoints, scopes = 'openid email profile', loginHint })` → URL d’autorisation ; ajoute notamment `prompt=select_account` et, si fourni, `login_hint`.
  - `exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier, endpoints, fetchImpl = fetch })` → `Promise` du JSON du token endpoint ; échange le code avec PKCE. En cas d’échec HTTP, l’erreur ne contient que le statut.
  - `fetchUserInfo({ accessToken, endpoints, fetchImpl = fetch })` → `Promise` du JSON `userinfo` ; envoie l’access token comme bearer.
  - `readIdTokenClaims(idToken, clientId)` → claims ou `{}` ; décode le payload de l’id_token et ne le retourne que si son audience inclut `clientId`. **Ne vérifie pas sa signature.**
  - `resetDiscoveryCache()` → `undefined` ; vide le cache de découverte, principalement pour les tests.
- **Points d’attention** :
  - `getEndpoints` utilise un délai de 5 s pour la découverte ; les appels au token endpoint et à `userinfo` expirent après 10 s. `fetchImpl` peut être injecté pour les tests.
  - Sans `discoveryUrl`, `getEndpoints` retourne le repli s’il existe, sinon lève `discovery_url_missing`. Si la découverte échoue et qu’aucun repli n’existe, l’erreur est propagée.
  - `exchangeCode` et `fetchUserInfo` lèvent une erreur contenant le statut HTTP en cas de réponse non réussie.
  - `readIdTokenClaims` ne valide ni signature ni autres claims : jeton absent, mal formé ou destiné à une autre audience → `{}`. Les informations principales d’identité sont récupérées via `userinfo`.
  - Dépend de `node:crypto`, de `fetch`, `URL`, `URLSearchParams`, `AbortSignal` et `Buffer`.

### services/api/lib/auth/originCheck.js

- **Rôle du fichier :**
  - Contrôle de l'origine des requêtes sur les routes d'authentification afin de renforcer la protection contre le CSRF, en complément du réglage `SameSite=Lax` du cookie de session.
  - Conserve une tolérance pour les requêtes sans en-tête d'origine, permettant le bon fonctionnement des scripts automatisés et des tests.

- **Fonctions exportées :**

  - `publicOrigin(req, config = {})`
    - **Paramètres :**
      - `req` : objet requête Fastify (inclut headers et infos de protocole).
      - `config` : objet optionnel, peut contenir `appPublicUrl` (prioritaire).
    - **Retour :**
      - `string` : l'URL d'origine publique sans slash final.
    - **Effets de bord notables :**
      - Utilise en priorité `config.appPublicUrl` (retirant les `/` finaux), sinon compose l’URL à partir des headers HTTP (gère les proxies via `x-forwarded-*`).
  
  - `isSameOrigin(req)`
    - **Paramètres :**
      - `req` : objet requête Fastify.
    - **Retour :**
      - `boolean` : `true` si la requête est de même origine (ou d’origine non renseignée) ; `false` sinon.
    - **Effets de bord notables :**
      - Gère explicitement `Origin` et `Sec-Fetch-Site` selon les comportements navigateurs.
      - Si absence d’en-têtes (cas serveur-à-serveur, curl, tests), accepte la requête par tolérance.

- **Points d’attention :**
  - **Dépendances** : `URL` natif Node.js, type `FastifyRequest` de Fastify pour l’argument req.
  - **Edge cases** :
    - Accepte les requêtes sans `Origin`/`Sec-Fetch-Site` (compatibilité S2S, outils, tests).
    - Gestion possible de valeurs multiples ou exotiques dans `x-forwarded-host`/`x-forwarded-proto`.
    - Vérification stricte du host (pas du schéma ou du port), seul l’host est comparé dans `isSameOrigin`.
    - Régression possible si des headers ou configs de proxy ne sont pas alignés (mauvais host/proto).

### services/api/lib/auth/password.js

- Implémente le hachage, la vérification et la politique des mots de passe, avec `scrypt` asynchrone de `node:crypto`.
- Exports :
  - `SCRYPT_PARAMS` — paramètres de `scrypt` (`N`, `r`, `p`, longueur de clé et mémoire maximale) ; constante exportée.
  - `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` — limites de longueur : 10 et 200 caractères.
  - `hashPassword(password)` — renvoie une `Promise<string>` contenant un hash auto-descriptif avec sel aléatoire. Peut rejeter si `scrypt` échoue.
  - `verifyPassword(password, stored)` — renvoie une `Promise<boolean>` ; compare les clés avec `timingSafeEqual`. Renvoie `false` pour un hash invalide ou une erreur de vérification, sans rejeter.
  - `dummyHash()` — renvoie une `Promise<string>` de hash factice, calculé une seule fois puis mis en cache, pour réduire les écarts de latence lorsque le compte est absent.
  - `burnVerify(password)` — effectue une vérification contre le hash factice puis renvoie toujours `false`.
  - `checkPasswordPolicy(password, { email } = {})` — renvoie `{ ok: true }` ou `{ ok: false, reason }` ; contrôle le type, la longueur, une liste de mots de passe courants et la présence de la partie locale de l’adresse e-mail.
  - `generatePassword(bytes = 12)` — renvoie une chaîne aléatoire encodée en base64url.
- Points d’attention :
  - Le format stocké est `scrypt$N=…,r=…,p=…$<sel>$<clé>` ; les paramètres sont conservés avec le hash. La vérification utilise ceux du hash et la limite `maxmem` configurée.
  - `checkPasswordPolicy` ne s’applique pas au compte de bootstrap ; la liste de mots de passe interdits est un garde-fou, pas une politique de composition.
  - `parseHash` est interne ; un hash mal formé ou des paramètres invalides entraînent un échec fermé (`false` lors de la vérification).
  - Dépend uniquement de `node:crypto` ; `scrypt` est asynchrone et utilise le threadpool de libuv.

### services/api/lib/auth/providers.js

- Registre des fournisseurs OIDC pris en charge par le flux commun `routes/auth/ssoFlow.js` : Google et Microsoft Entra ID. Définit leurs chemins, scopes, endpoints, règles d’adresse e-mail, photos et codes d’erreur.
- `isProviderUsable(id, settings)` — paramètres : identifiant du fournisseur et document complet `appSettings`. Retourne `true` si le fournisseur existe, est activé et possède un `clientId`, un `clientSecret` et les informations de découverte nécessaires ; sinon `false`. Aucun effet de bord notable.
- Points d’attention :
  - Les callbacks sont spécifiques au fournisseur. Ne pas modifier `/oauth2/callback` pour Entra sans accès à l’administration Entra ; ce chemin hérité nécessite un routeur Traefik dédié avec le middleware `noident`.
  - Google exige une adresse vérifiée et dispose d’endpoints de repli si la découverte échoue. Entra ne fournit pas `email_verified` : la découverte dépend du tenant et aucun endpoint de repli n’est défini.
  - Entra peut fournir l’adresse via `email`, `preferred_username` ou `upn` ; les valeurs invalides et doublons (sans distinction de casse) sont filtrés. `isProviderUsable` considère toute URL de découverte non vide comme suffisante, sans la valider.
  - Dépend de `EMAIL_RE` (`./emailPattern.js`) pour valider les adresses et de `pictureUrl` (`../identity.js`) pour normaliser la photo Google.

### services/api/lib/auth/rateLimit.js

- **Rôle du fichier**  
  Met en place un limiteur de débit (rate limiter) en mémoire à fenêtre glissante, par clé (typiquement par compte utilisateur ou identifiant), afin de limiter le nombre de tentatives (ex : login) sur une période définie.

- **Fonctions exportées**
  - `createRateLimiter({ windowMs, max, sweepMs })`
    - **Paramètres :**
      - `windowMs` (nombre) : durée de la fenêtre de temps en millisecondes.
      - `max` (nombre) : nombre maximal d'appels autorisés par clé dans la fenêtre.
      - `sweepMs` (nombre, optionnel, défaut 60000) : période d'exécution de la purge automatique des clés expirées.
    - **Retour : Objet avec 4 méthodes :**
      - `hit(key: string)`  
        - **Paramètres :** `key` (identifiant de la cible du rate limit, ex : email ou IP)
        - **Retour :** `{ allowed: boolean, retryAfterSec: number }`  
          - `allowed`: true si la tentative est acceptée, false sinon.  
          - `retryAfterSec`: secondes à attendre avant une nouvelle tentative autorisée si refusé, 0 sinon.
        - **Effet de bord :** Enregistre un nouvel essai si accepté. Met à jour la fenêtre.
      - `reset(key: string)`  
        - **Paramètres :** `key`
        - **Retour :** void  
        - **Effet de bord :** Supprime l’historique pour cette clé (souvent après authentification réussie).
      - `size()`  
        - **Paramètres :** aucun  
        - **Retour :** nombre de clés actuellement suivies dans le rate limiter.
      - `stop()`  
        - **Paramètres :** aucun  
        - **Retour :** void  
        - **Effet de bord :** Arrête le mécanisme d’auto-nettoyage et vide l’état interne.

- **Points d'attention**
  - **Edge cases :**
    - Les essais expirent strictement après `windowMs` ; l’intervalle de purge (`sweepMs`) définit la fréquence de nettoyage.
    - L’objet en mémoire n’est pas distribué : il ne protège pas contre des attaques réparties sur plusieurs instances de l’API.  
    - Le process Node n’est pas empêché de se terminer (`sweeper.unref()`) : non bloquant.
    - Si `reset()` n’est pas utilisé après succès, l’utilisateur peut être bloqué malgré un login correct.
  - **Dépendances :**
    - Pas de dépendance externe, fonctionne uniquement via une Map en mémoire.
    - Comparable au comportement du store par défaut de `@fastify/rate-limit` ou équivalent Redis, mais adapté au contrôle par clé métier (compte/utilisateur).

### services/api/lib/auth/resetTokens.js
- Gère les jetons de réinitialisation de mot de passe dans la collection `authResetToken`. Le jeton est transmis en clair au demandeur, mais seul son SHA-256 est stocké.
- Exporte `RESET_COLLECTION` : nom de la collection, `'authResetToken'`.
- Exporte `createResetTokenStore(db, { ttlMs } = {})` : prend une base de données et une durée de validité optionnelle (30 minutes par défaut) ; retourne un store exposant `ttlMs` et les méthodes suivantes :
  - `issue({ emailLower, ip = null })` : retourne une promesse `{ token, expiresAt }`. Génère un jeton aléatoire, stocke son hash, son adresse email, ses dates de création et d’expiration, ainsi que l’IP. Effet notable : écrit dans la collection.
  - `consume(token)` : retourne une promesse `{ emailLower }` ou `null`. Marque atomiquement le jeton comme utilisé seulement s’il existe, n’a pas été utilisé et n’est pas expiré. Un jeton absent ou invalide retourne `null` ; les consommations concurrentes ne peuvent pas réussir toutes les deux.
  - `purgeFor(emailLower)` : supprime tous les jetons associés à l’adresse ; ne fait rien si elle est absente. Retourne une promesse.
- Points d’attention : dépend de `node:crypto` (`randomBytes`), de `hashToken` importé depuis `./sessions.js` et de l’API de collection MongoDB (`insertOne`, `findOneAndUpdate`, `deleteMany`). L’expiration est vérifiée à la consommation, car l’index TTL peut supprimer les documents avec retard.

### services/api/lib/auth/resolve.js

- Résout l’identité d’une requête en donnant priorité à la session native, puis aux en-têtes d’identité, sauf si le marqueur `x-mybrief-auth-path: native` interdit cette dernière voie.
- Exports :
  - `NATIVE_PATH_HEADER` — nom de l’en-tête qui force le mode natif.
  - `authModeOf(user)` — retourne `oidc`, `password` ou `sso`, selon la source et le compte ; sans effet de bord.
  - `authProviderOf(user)` — retourne `oidc`, `password`, `google`, `entra` ou `sso`. Utilise d’abord le fournisseur enregistré sur la session, puis les informations du compte ; sans effet de bord.
  - `resolveIdentity({ req, users, sessions })` — retourne une promesse de `{ user, sessionInvalid }`. Résout une session ou une identité issue des en-têtes. Effets de bord : touche une session valide ; détruit toutes les sessions d’un compte supprimé ou désactivé.
- Points d’attention :
  - Le marqueur `native` fait ignorer les en-têtes d’identité, mais une session native valide reste prioritaire.
  - Un cookie présent mais invalide, expiré ou associé à un compte supprimé/désactivé renvoie `sessionInvalid: true`, afin que le cookie soit purgé.
  - Le Bearer mobile n’est pas lu ici : le ForwardAuth le consomme et fournit les en-têtes.
  - Dépend de `identityFromHeaders`, `readSessionToken` et `SESSION_PROVIDERS`, ainsi que des méthodes `sessions.resolve`, `sessions.touch`, `sessions.destroyAllFor`, `users.findByEmailLower` et `users.findByEmail`.
  - Sans document utilisateur, une identité par en-têtes reste de rôle `user` ; un compte désactivé est refusé.

### services/api/lib/auth/safeNext.js

- **Rôle du fichier**
  - Sécurise la redirection après authentification via le paramètre `?next=`, afin d’éviter les attaques de redirection ouverte (open redirect).
  - Uniquement autoriser des chemins internes (absolus) du site, pas d’URL externe.
  - Utilisé notamment pour le flux mobile nécessitant une session.

- **Fonctions exportées**
  - `DEFAULT_NEXT`
    - Valeur : chaîne de caractères, toujours `'/'` (page d’accueil par défaut).
    - Utilisée comme fallback en cas de valeur de `next` non sécurisée.

  - `safeNext(value)`
    - **Paramètre** : `value` (type inconnu, attendu chaîne de caractères)
    - **Retour** : `string` — un chemin sécurisé, ou `'/'` si la valeur ne respecte pas les règles de sécurité.
    - **Effets de bord** : aucun effet de bord, pure function.

- **Points d’attention**
  - Refuse :
    - Tout chemin ne commençant pas par `/`
    - Les URLs protocol-relative ou malicieuses (`//evil.tld`, `/\evil.tld`, ou contenant un `\`)
    - Toute chaîne contenant des caractères de contrôle (Unicode < 0x20, 0x7f)
    - Les valeurs non textuelles ou vides
  - Edge case : des navigateurs ou parseurs d’URL traitent différemment les caractères spéciaux, les backslashes, ou le double slash (`//`), d’où les contrôles stricts dans l’implémentation.
  - Aucune dépendance externe.

### services/api/lib/auth/sessions.js

- **Rôle du fichier**
  - Gestion des sessions d’authentification natives via jetons opaques stockés et validés côté serveur (collection MongoDB `authSession`).
  - Permet une révocation immédiate des sessions (ex : reset de mot de passe), contrairement aux JWT stockés côté client.

- **Fonctions et constantes exportées**
  - `SESSION_COLLECTION`  
    - Nom de la collection MongoDB utilisée (`authSession`).

  - `SESSION_PROVIDERS`  
    - Ensemble des valeurs acceptées pour le champ `provider` d'une session (`'password'`, `'google'`, `'entra'`).

  - `hashToken(token)`  
    - **Paramètres** : `token` (string)  
    - **Retour** : string (hash SHA-256 hexadécimal du token)  
    - **Effet de bord** : aucun

  - `createSessionStore(db, { ttlMs } = {})`  
    - **Paramètres** :  
      - `db` (objet MongoDB)  
      - `ttlMs` (durée de vie de session en ms, défaut : 7 jours)
    - **Retour** : objet offrant plusieurs méthodes :
      - `create(emailLower, meta = {})`  
        - **Paramètres** :  
          - `emailLower` (string, l’email de l’utilisateur en minuscules)  
          - `meta` (object facultatif : `ip`, `userAgent`, `provider`)
        - **Retour** : `{ token, expiresAt }`  
        - **Effet de bord** : insère la session (hash du token) en base
        
      - `resolve(token)`  
        - **Paramètres** : `token` (string)  
        - **Retour** : document de session (object) ou `null`  
        - **Effet de bord** : lecture en base
        
      - `touch(session)`  
        - **Paramètres** : `session`  
        - **Retour** : void  
        - **Effet de bord** : met à jour l’expiration en base uniquement si la session est proche de l’échéance

      - `destroy(token)`  
        - **Paramètres** : `token` (string)  
        - **Retour** : void  
        - **Effet de bord** : supprime la session correspondante en base  

      - `destroyAllFor(emailLower)`  
        - **Paramètres** : `emailLower` (string)  
        - **Retour** : void  
        - **Effet de bord** : supprime toutes les sessions d’un utilisateur donné

- **Points d’attention**
  - **Jeton stocké haché** (SHA-256) : aucune session exploitable en cas de fuite de la base.
  - **Expiration** :  
    - Contrôle double (application + index TTL Mongo), car l’index Mongo peut laisser un délai (~1 min) avant suppression effective.
    - `touch()` ne prolonge la session que si elle est sur le point d’expirer (sous un certain seuil), évitant un `update` à chaque requête.
  - **Sécurité du provider** : une valeur inconnue pour `provider` devient automatiquement `'password'`, empêchant l’injection arbitraire.
  - **Dépendances externes** :  
    - Node.js `crypto` (pour génération et hash des jetons)
    - MongoDB (stockage sessions)
  - **Effets de bord** : toutes les méthodes sauf `hashToken` interagissent avec la base de données.
  - **Edge cases** :
    - `destroy`, `destroyAllFor` et `resolve` retournent immédiatement si l’argument principal est vide ou invalide (pas d’erreur throw).
    - Les chaînes trop longues en `userAgent` sont tronquées à 200 caractères.

### services/api/lib/authPlugin.js

- Configure l’authentification dans le périmètre Fastify `/api` : décore les requêtes avec `req.user` et ajoute deux hooks `onRequest`.
- **Export : `authPlugin(api)`**
  - Paramètre : `api`, l’instance Fastify configurée avec `users`, `sessions` et `config`.
  - Retour : aucun résultat explicite.
  - Effets de bord : décore `req.user`, résout l’identité à chaque requête et, si la session est invalide, efface le cookie de session. Bloque ensuite les comptes avec `mustChangePassword` par une réponse `428 password_change_required`, sauf sur `/api/auth…`, `/api/ping` et `/api/init`.
- **Points d’attention :**
  - `pathOf` privilégie `req.routeOptions.url`, sinon retire la query string de `req.url` pour déterminer les exceptions.
  - Le verrou renvoie `428`, et non `401` ou `403`, afin d’éviter que le frontend traite la réponse comme une perte de session.
  - Dépend de `resolveIdentity`, `clearSessionCookie` et `fail`, ainsi que des propriétés `api.users`, `api.sessions` et `api.config.cookieSecure`.

### services/api/lib/background.js

- **Rôle du fichier**
  - Gère le suivi des travaux asynchrones post-réponse (exemple : génération de titre après un appel `/resume`).
  - Remplace un slot unique obsolète qui écrasait les travaux concurrents ; assure maintenant la gestion robuste de multiples travaux simultanés.

- **Fonctions exportées**
  - `createBackgroundTracker()`
    - **Retours** : Un objet avec trois membres :
      - `track(promise)`
        - **Paramètres** :
          - `promise` : `Promise<T>` — Travail asynchrone à suivre.
        - **Retour** : La promesse d’origine pour chaînage.
        - **Effets de bord** : Ajoute la promesse au Set interne, la retire du Set à sa résolution ou son rejet.
      - `drain()`
        - **Paramètres** : Aucun.
        - **Retour** : `Promise` résolue quand tous les travaux suivis sont réglés (aucun rejet, la promesse est toujours résolue).
        - **Effets de bord** : Aucun, attend juste tous les travaux en vol.
      - `size`
        - **Retour** : Nombre courant de travaux suivis (`number`).
        - **Effets de bord** : Aucun.
       
- **Points d'attention**
  - L’appelant doit gérer les erreurs de ses promesses : `.catch()` requis côté appelant, sinon erreurs non traitées.
  - Le Set `pending` ne grossit pas indéfiniment : chaque promesse est retirée (succès ou échec).
  - Pas de gestion de temporisation ou d’annulation : `track` ne modifie pas les promesses, se contente de les observer.
  - Indépendant de tout framework externe, mais dépend de la bonne gestion de la chaîne de promesses côté utilisateur.
  - Un appel à `drain` attend toutes les promesses suivies au moment de l’appel, pas celles trackées après.

### services/api/lib/bootstrap.js

- **Rôle** : prépare la base avant l’écoute de l’API. À chaque démarrage, crée les index et exécute des reprises de données idempotentes, initialise les réglages et prépare les comptes et groupes administrateurs.
- **Fonctions exportées** :
  - `bootstrap(db, config, log = noopLogger, env = {})` — `db` : base MongoDB ; `config` : configuration des comptes et domaines administrateurs ; `log` : logger facultatif ; `env` : variables d’environnement. Retourne une `Promise<void>`. Orchestre les opérations dans un ordre déterminé ; la création des index échoue en faisant remonter l’erreur.
  - `dedupeMailAccounts(db, log)` — retourne une `Promise<number>` (documents supprimés) ; conserve la connexion mail la plus récente par `emailLower`, supprime les doublons et journalise sans bloquer en cas d’erreur.
  - `migrateMailAccountsToConnections(db, log)` — retourne une `Promise<number>` (connexions reprises) ; copie les connexions mail historiques vers `userConnections`, sans supprimer la collection source. Erreurs non bloquantes.
  - `migrateBusinessContextToOrgContext(db, log)` — retourne une `Promise<boolean>` indiquant si le contexte a été repris. Ne modifie pas `orgContext` s’il existe déjà ; erreurs non bloquantes.
  - `resetDetectionSensitivity(db, log, value)` — retourne une `Promise<number>` (comptes modifiés). Applique une valeur autorisée une seule fois par valeur témoin, aux comptes ayant déjà une sensibilité ; valeur vide ou invalide : aucune modification.
  - `removeAddresslessUsers(db, log)` — retourne une `Promise<number>` (comptes supprimés). Supprime les comptes sans adresse normalisable, sauf si cela viderait la collection `user` ; ne purge pas leurs données métier.
  - `warnDuplicateEmails(db, log)` — retourne une `Promise<number>` (groupes d’adresses en doublon). Journalise les doublons sans les supprimer ; erreurs non bloquantes.
  - `seedGroups(db, log)` — retourne une `Promise<{created, adminCreated, admins, reduced, backfilled}>`. Crée les groupes requis, réduit les appartenances multiples et inscrit les comptes sans groupe dans le groupe par défaut ; erreurs non bloquantes.
  - `backfillEmailLower(db, log)` — retourne une `Promise<number>` (comptes mis à jour). Normalise les adresses historiques une par une ; les doublons ne bloquent pas les autres comptes.
  - `seedAdmin(db, { email, password, enabled = true }, log = noopLogger)` — retourne une `Promise` avec le résultat (`created` ou `reason`). Crée le compte d’amorçage uniquement sur une base vierge, ou ajoute un mot de passe à un compte existant sans mot de passe ; mot de passe minimal : 12 caractères. Peut lever une erreur si le premier administrateur ne peut pas être créé.
- **Autres exports** : `DETECTION_SENSITIVITY_RESET_KEY`, clé témoin stockée dans `appSettings`.
- **Points d’attention** :
  - `ensureIndexes` et plusieurs backfills sont privés au module. L’index unique partiel `user.emailLower` exclut les documents sans chaîne ; les collisions peuvent faire échouer le backfill d’un document. Une erreur de création d’index est fatale au démarrage.
  - L’ordre de `bootstrap` est important : déduplication avant index unique, reprises avant migrations ou initialisations dépendantes, promotions avant préparation des groupes.
  - Les reprises des durées et versions sont plafonnées à 500 documents par démarrage. Les durées sans source trouvée sont marquées `unknown`.
  - Les migrations et initialisations s’appuient sur MongoDB (index TTL, agrégations et pipelines de mise à jour) et sur les modules importés : dépôts utilisateurs, groupes et réglages, authentification, quotas, actions et outils de migration.

### services/api/lib/config.js

- Centralise la configuration de l’API à partir de l’environnement ; `loadConfig` accepte aussi un objet injecté, notamment pour les tests, sans modifier `process.env`.
- Fonctions exportées :
  - `bool(value, fallback)` — convertit une valeur en booléen : `undefined` ou chaîne vide renvoie `fallback` ; `0`, `false`, `no` et `off` (sans distinction de casse) renvoient `false` ; toute autre valeur renvoie `true`. Aucun effet de bord.
  - `loadConfig(env = process.env)` — prend un objet d’environnement et renvoie un objet de configuration pour MongoDB, SMTP, limites de débit, sessions, authentification, mobile et OpenAI. Ne modifie pas l’environnement.
- Points d’attention :
  - Les valeurs numériques positives sont analysées par une fonction interne ; les valeurs absentes, invalides ou non positives prennent le défaut. `OPENAI_SUMMARY_TIMEOUT_MS` utilise toutefois `Number(...) || 300_000`.
  - `feedbackUrl` et `docsUrl` n’acceptent que les URL commençant par `http://` ou `https://`. `appPublicUrl` retire les `/` finaux.
  - `adminEmails` et `adminEmailDomains` sont séparés par des virgules et nettoyés ; les domaines sont aussi convertis en minuscules et privés d’un `@` initial.
  - Une `CONNECTIONS_ENC_KEY` vide implique le stockage des jetons en clair. Un secret JWT mobile vide désactive les fonctionnalités mobiles concernées.
  - Les limites de débit et `recordMaxInFlight` sont des constantes, non configurables par l’environnement ; elles peuvent être surchargées par `configOverride`.
  - Dépend de `process.env` par défaut ; les valeurs produites sont consommées notamment par `server.js`, `lib/mailer.js`, `lib/crypto/secretBox.js` et les modules d’authentification et OpenAI.

### services/api/lib/connections/access.js

- Centralise la validation des prérequis d’accès au stockage : fournisseur configuré, connexion correspondante, scopes requis et identifiants OAuth du déploiement.
- Exporte `resolveStorageAccess(app, { user, providerId, requireBrowse = false })` — fonction asynchrone.
  - Retourne `{ provider, providerId, connection, credentials }` si l’accès est prêt, sinon `{ error, status, extra? }`.
  - Effet de bord notable : lit la connexion via `app.connections.getByProvider(...)` et la configuration via `app.settings.get()` ; ne modifie pas de données.
- Points d’attention :
  - La connexion doit correspondre au `providerId` actif, pas à un autre fournisseur relié précédemment.
  - Les erreurs distinguent stockage non configuré, connexion absente, scope d’écriture manquant et scope de navigation manquant ; elles ont toutes le statut `501`.
  - La navigation n’est vérifiée que si `requireBrowse` est vrai et que `provider.browseScopes` est non vide. N’importe quel scope de cette liste suffit.
  - Utilise `hasScope` et `hasAnyScope` de `./providers.js` pour tenir compte des formats de scopes, notamment ceux d’Entra ; dépend aussi de `CONNECT_PROVIDERS` et `connectionCredentials` du même module.

### services/api/lib/connections/browse.js

- **Rôle :** fournit une interface unifiée de navigation dans les stockages Google Drive et Microsoft Graph. Les curseurs restent opaques côté client ; les chemins retournés sont compatibles avec `storage.folder`.
- **Fonctions exportées :**
  - `joinPath(segments)` — assemble des segments en chemin, après conversion en chaînes et suppression des valeurs vides. Retourne une chaîne ; aucun effet de bord.
  - `createDriveBrowser()` — crée une façade injectable exposant les méthodes ci-dessous. Aucun effet de bord à la création ; chaque appel délègue au fournisseur indiqué dans `provider`. Un fournisseur sans implémentation déclenche `storage_provider_unsupported_<provider>`.
    - `drives({ provider, credentials, connection, fetchImpl })` — retourne les espaces de stockage disponibles. Google inclut « Mon Drive » et, si le scope requis est présent, les Drive partagés ; Microsoft délègue à Graph. Rafraîchit un jeton d’accès et effectue des appels réseau.
    - `list({ provider, credentials, connection, driveId, cursor, search, pageToken, fetchImpl })` — retourne `{ folders, nextPageToken }`, avec des dossiers `{ name, cursor }`. Effectue des appels réseau ; les dossiers dont le nom contient `/` sont exclus car ils ne sont pas adressables par chemin.
    - `pathOf({ provider, credentials, connection, driveId, cursor, fetchImpl })` — retourne le chemin d’un dossier. Pour Google, résout les segments via l’API ; pour Microsoft, le curseur est déjà le chemin. Peut rafraîchir un jeton et effectuer des appels réseau.
    - `create({ provider, credentials, connection, driveId, cursor, name, fetchImpl })` — crée ou garantit l’existence d’un sous-dossier et retourne `{ name, cursor }`. Effet de bord : création possible dans le stockage distant ; rafraîchit un jeton.
    - `probe({ provider, credentials, connection, targets, fetchImpl })` — retourne un verdict par destination (`unknown` en cas d’échec non lié à l’authentification). Rafraîchit un seul jeton puis sonde les chemins en parallèle, par groupes de quatre ; ne crée rien. Une `ConnectionAuthError` interrompt l’ensemble.
- **Points d’attention :**
  - Google utilise des curseurs d’identifiant ; Microsoft utilise des chemins. Pour Google, l’identifiant vide désigne « Mon Drive ».
  - La recherche Microsoft porte sur tout le drive, indépendamment du curseur courant. Les résultats de recherche fournissent un curseur correspondant à leur chemin absolu.
  - Les dépendances réseau et les rafraîchisseurs de jetons sont injectables via `fetchImpl`. La navigation dépend de `googleDrive`, `msGraph`, `googleTokens`, `providers` et `ConnectionAuthError`.
  - Sans le scope Google des Drive partagés, `drives()` retourne uniquement « Mon Drive » ; ce n’est pas une erreur.

### services/api/lib/connections/errors.js

- **Rôle du fichier :**
  - Définit une classe d’erreur spécifique pour signaler la révocation d’autorisation sur une connexion à un compte externe.

- **Fonctions / classes exportées :**
  - `ConnectionAuthError`
    - **Type :** Classe (hérite de `Error`)
    - **Paramètres constructeur :**
      - `message` (`string`, optionnel, défaut : `'connection_auth_revoked'`) : message d’erreur.
      - `options` (`object`, optionnel) :
        - `provider` (`string`, optionnel, défaut : `''`) : nom du fournisseur concerné.
    - **Retour :** Instance de `ConnectionAuthError`.
    - **Effets de bord notables :** À l’instanciation/leverage, déclenche côté appelant la suppression de la connexion utilisateur, impliquant qu’il doive réautoriser totalement l’accès.

- **Points d’attention :**
  - **À lever uniquement** sur des signaux d’accès révoqué non ambigus (`invalid_grant` lors d’un refresh, ou 401 sur un jeton nouvellement émis).
  - **Ne pas utiliser** pour d’autres erreurs transitoires (quota, erreurs 5xx, panne réseau), qui se résolvent d’elles-mêmes.
  - **Dépendances :** aucune dépendance externe, hérite uniquement de la classe standard `Error`.
  - **Impact utilisateur** : suppression irréversible de la connexion – usage à manipuler avec précaution.

### services/api/lib/connections/googleDrive.js

- Fournit l’accès à Google Drive sans SDK : navigation des dossiers, résolution/création du dossier cible et dépôt de fichiers via l’API REST.
- Fonctions exportées :
  - `folderSegments(folderPath)` — transforme un chemin en segments nettoyés ; utilise `DEFAULT_FOLDER` (`myBrief`) si le chemin est vide. Aucun effet de bord.
  - `listSharedDrives({ accessToken, fetchImpl = fetch, pageSize = 100 })` — retourne les Drive partagés où l’utilisateur peut ajouter des éléments (`id`, `name`, `site`). Appelle `drives.list`, avec au plus cinq pages.
  - `listFolders({ accessToken, driveId = '', parentId = '', search = '', pageToken = '', pageSize = 100, fetchImpl = fetch })` — retourne `{ folders, nextPageToken }`. En mode recherche, cherche dans tout le Drive et ignore `parentId`.
  - `folderPathSegments({ accessToken, folderId, driveId = '', fetchImpl = fetch, maxDepth = 12 })` — remonte les noms de dossiers jusqu’à la racine du Drive et retourne les segments du chemin. Une erreur autre qu’un accès révoqué interrompt la remontée et donne un chemin partiel.
  - `ensureChildFolder({ accessToken, driveId = '', parentId = '', name, fetchImpl = fetch })` — retrouve ou crée un sous-dossier ; retourne ses données avec `created` (`false` si trouvé, `true` si créé). Effet de bord : création éventuelle dans Drive.
  - `ensureFolderPath({ accessToken, folderPath, driveId = '', fetchImpl = fetch })` — résout ou crée le chemin segment par segment ; retourne l’identifiant du dossier final. Effet de bord : création éventuelle des dossiers manquants.
  - `probeFolderPath({ accessToken, folderPath, driveId = '', fetchImpl = fetch })` — vérifie sans créer le chemin ; retourne `found`, `missing`, `drive_missing` ou `unknown`. Un 401 lève `ConnectionAuthError`.
  - `uploadToFolder({ accessToken, folderId, filename, content, contentType = 'application/pdf', fetchImpl = fetch })` — crée une session d’upload résumable, envoie les octets et retourne la réponse de création du fichier. Effet de bord : dépôt du fichier dans Drive.
  - `storeOnDrive({ credentials, connection, folderPath, driveId = '', file, fetchImpl = fetch })` — renouvelle le jeton, résout le dossier, puis dépose le fichier ; retourne `fileId`, `folderId`, `folderPath`, `resolvedPath`, `driveId` et `cacheUsed`. Peut créer des dossiers et un fichier ; réessaie une fois la résolution si le dossier en cache renvoie un 404.
- Points d’attention :
  - `drive.file` ne donne accès qu’aux éléments créés par l’application : un dossier homonyme créé manuellement peut être invisible et un doublon sera créé.
  - La navigation requiert `drive.metadata.readonly` ; `listSharedDrives` requiert `drive.readonly`. Les Drive partagés en lecture seule sont exclus.
  - `driveId` participe à la recherche et à la clé du cache : il ne faut pas réutiliser un dossier d’un autre Drive. `''` désigne « Mon Drive ».
  - Les appels REST utilisent `fetch` injectable et des délais d’expiration. Un 401 devient `ConnectionAuthError` ; les autres erreurs d’API lèvent une erreur, sauf dans `probeFolderPath`, qui renvoie `unknown` pour les statuts non traités.
  - L’upload est toujours résumable ; l’URL de session porte l’autorisation pour le `PUT`.

### services/api/lib/connections/googleTokens.js

- **Rôle du fichier :**
  - Fournit une fonction utilitaire pour obtenir un nouvel access token Google OAuth à partir d'un refresh token (flux serveur-à-serveur), utilisée lors d'accès à l'API Google (Gmail, Drive, etc.).

- **Fonctions exportées :**
  - `refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, fetchImpl })`
    - **Paramètres :**
      - `clientId` *(string)* : identifiant OAuth client Google.
      - `clientSecret` *(string)* : secret associé.
      - `refreshToken` *(string)* : refresh token validé par Google.
      - `fetchImpl` *(Function, optionnel)* : alternative à `fetch` (pour tests ou contextes spécifiques).
    - **Retour :**
      - `Promise<string>` : access token fraîchement délivré (exp. 1h).
    - **Effets de bord notables :**
      - Lève une exception `ConnectionAuthError('google_auth_revoked')` si le refresh token n'est plus valide.
      - Utilise un mécanisme de retry (`withRetry`) sur panne réseau (hors erreurs d'authentification).
      - Timeout automatique à 10 secondes via `AbortSignal`.
      - Journalise et relaie des erreurs HTTP/JSON appropriées.

- **Points d'attention :**
  - Dépendances clés : `withRetry` (pour relances réseau), `ConnectionAuthError`.
  - Ne relance pas pour les erreurs irréversibles (`invalid_grant`). Si détecté, l'appelant doit supprimer ou désactiver la connexion.
  - Supposé utilisé côté serveur (accès au clientSecret).
  - Fait appel à l’endpoint officiel Google OAuth (`GOOGLE_TOKEN_ENDPOINT`).
  - Le corps attendu de la réponse Google doit être JSON et contenir `access_token` : absence => erreur.
  - Gère uniquement l’obtention du token, pas la persistance ni le cycle de vie complet des tokens.

### services/api/lib/connections/msGraph.js

- **Rôle** : appels REST à Microsoft Graph pour renouveler l’accès, parcourir les drives et dossiers, envoyer des mails et déposer des fichiers. Aucun SDK Graph ou MSAL ; les URL OIDC proviennent de la découverte du tenant.
- **Fonctions exportées** :
  - `refreshGraphAccessToken({ credentials, refreshToken, fetchImpl? })` → `Promise<string>` : obtient un jeton d’accès via le `token_endpoint` découvert. Seul appel relancé avec `withRetry`. Les erreurs `invalid_grant`, `interaction_required` et `consent_required` lèvent `ConnectionAuthError`.
  - `listDrives({ accessToken, fetchImpl? })` → `Promise<Array<{id, name, site}>>` : liste le OneDrive personnel et les bibliothèques des sites suivis. Une erreur non-401 sur `followedSites` laisse le OneDrive seul ; une bibliothèque inaccessible est ignorée.
  - `listFolders({ accessToken, driveId?, folderPath?, pageToken?, fetchImpl? })` → `Promise<{folders: Array<{name}>, nextPageToken: string}>` : liste les sous-dossiers d’un chemin. Le jeton de page doit être une URL commençant par l’URL Graph v1.0.
  - `searchFolders({ accessToken, driveId?, term, pageToken?, fetchImpl? })` → `Promise<{folders: Array<{name, parentPath}>, nextPageToken: string}>` : recherche les dossiers du drive et renvoie leur chemin parent. Les apostrophes du terme sont échappées pour OData.
  - `probeFolderPath({ accessToken, folderPath, driveId?, fetchImpl? })` → `Promise<'found'|'missing'|'drive_missing'|'unknown'>` : vérifie un chemin sans créer de dossier. Seul un 404 permet de conclure à une absence ; les erreurs 401 lèvent `ConnectionAuthError`.
  - `ensureChildFolder({ accessToken, driveId?, folderPath?, name, fetchImpl? })` → `Promise<{name}>` : crée le dossier enfant si nécessaire, avec création éventuelle des parents. Effet de bord : peut créer des dossiers dans Graph.
  - `ensureFolderPath({ accessToken, folderPath, driveId?, fetchImpl?, defaultFolder? })` → `Promise<string>` : retrouve ou crée chaque segment du chemin et renvoie l’ID du dossier final. Si le chemin est vide, utilise `defaultFolder` (`myBrief` par défaut). Gère une création concurrente via relecture après 409.
  - `sendViaGraph({ credentials, refreshToken, to, cc?, replyTo?, subject, html, attachments?, fetchImpl? })` → `Promise<void>` : envoie un mail depuis la boîte liée ; destinataires acceptés sous forme de chaîne ou de tableau. Utilise `sendMail` sans pièce jointe ou jusqu’à 3 Mio, puis un brouillon et un envoi par tranches au-delà. Seul `attachments[0]` est utilisé.
  - `storeOnOneDrive({ credentials, connection, folderPath, driveId?, file, fetchImpl? })` → `Promise<{fileId, folderId, folderPath, resolvedPath, driveId, cacheUsed}>` : dépose le fichier via une session d’envoi fragmentée. Peut créer le dossier cible ; réessaie après un 404 si le dossier était en cache.
- **Points d’attention** :
  - Les fonctions acceptent `fetchImpl` injectable ; par défaut, utilisent `fetch` global et des délais `AbortSignal.timeout`.
  - Les appels authentifiés Graph convertissent un 401 en `ConnectionAuthError`. Les 403 et 429 ne sont pas assimilés à une révocation ; les erreurs de pagination et d’opérations Graph sont levées sous forme d’`Error`.
  - `driveId` sélectionne une bibliothèque SharePoint ; sans lui, la cible est le OneDrive personnel. Le cache de dossier tient compte du drive.
  - Les dépôts et pièces jointes volumineux utilisent des tranches de 3,2 Mio (multiple de 320 Kio). Le fichier déposé est renommé en cas de conflit ; les dossiers créés utilisent une politique de conflit `fail`.
  - Le chemin vide désigne le dossier par défaut lors d’un dépôt, mais un chemin vide dans `probeFolderPath` ne provoque aucune création.

### services/api/lib/connections/providers.js

- **Rôle** : registre des fournisseurs de comptes externes Google et Microsoft pour les connexions OAuth. Définit leurs scopes, chemins de callback, clés d’identifiants et capacités, en réutilisant les endpoints et la lecture de profil de `lib/auth/providers.js`. Le réglage `enabled` du login n’est pas pris en compte.
- **`CONNECT_PROVIDERS`** *(constante exportée)* : décrit les fournisseurs et leurs capacités. Google utilise la clé d’identifiants `google` et Microsoft `entra`. Google peut révoquer l’accès ; Microsoft ne peut qu’oublier le jeton localement. Les callbacks historiques ne doivent pas être renommés sans mise à jour des configurations OAuth externes.
- **`connectScopeList(provider, connections = {})`** : retourne les scopes demandés sous forme de tableau. Retire `provider.optionalScope` uniquement si `connections.sharepoint === false` ; un réglage absent conserve le scope.
- **`connectScopes(provider, connections = {})`** : retourne les scopes de `connectScopeList` sous forme de chaîne séparée par des espaces.
- **`sharedDrivesOffered(provider, connections = {})`** : retourne un booléen indiquant si le scope des lecteurs partagés est demandé par cette installation.
- **`hasScope(granted, wanted)`** : retourne si un scope accordé correspond au scope attendu. Normalise casse et encodage, puis compare aussi le dernier segment d’URI ; les formes courtes des fournisseurs sont ainsi reconnues.
- **`hasAnyScope(granted, wanted)`** : retourne si au moins un scope attendu est accordé, via `hasScope`.
- **`connectionCredentials(provider, authSettings)`** : retourne les identifiants `{ clientId, clientSecret }`, ou `null` si l’un manque ou si aucun endpoint utilisable n’est disponible. Ne vérifie pas `enabled` ; appelle `provider.discoveryUrlOf(conf)` si aucun `fallbackEndpoints` n’est défini.
- **`effectiveProvider(configured)`** : retourne l’entrée correspondante de `CONNECT_PROVIDERS`, ou Google si la valeur est absente ou inconnue.
- **Points d’attention** :
  - Google distingue le dépôt (`drive.file`), la navigation (`browseScopes`) et l’énumération des lecteurs partagés (`sharedDrivesScope`). Les connexions historiques peuvent conserver la navigation sans disposer du scope actuel pour les lecteurs partagés.
  - Microsoft exige normalement le consentement administrateur pour SharePoint ; désactiver `sharepoint` retire ce scope, mais conserve l’accès au OneDrive.
  - Microsoft partage le cookie d’état OAuth avec le login pour satisfaire le routage Traefik ; deux flux simultanés peuvent s’écraser et échouer avec `state_mismatch`.
  - Les fonctions de comparaison de scopes acceptent des entrées non-tableaux en les traitant comme des listes vides. `scopeKey` tolère les séquences `%` mal formées en conservant la chaîne telle quelle.

### services/api/lib/connections/store.js

- **Rôle du fichier :**  
  Point d’entrée unique pour le dépôt de fichiers auprès du fournisseur de stockage connecté (Google Drive, Microsoft OneDrive). Il abstrait la logique spécifique à chaque provider et facilite l’injection pour les tests.

- **Fonctions exportées :**
  - `createDriveStore()`
    - **Paramètres:** Aucun en entrée directe. Retourne une fonction asynchrone prenant un objet :  
      - `provider` (string) : Identifiant du fournisseur ("google" ou "microsoft")
      - `credentials` (object) : Informations d’authentification
      - `connection` (object) : Détail de la connexion au fournisseur
      - `folderPath` (string) : Chemin de dépôt du fichier
      - `file` (object) : Le fichier à déposer
    - **Retour:**  
      `Promise<{fileId: string, folderId: string, folderPath: string, cacheUsed: boolean}>`
      (selon l’implémentation du provider)
    - **Effets de bord notables :**  
      - Déclenche un upload vers le service fournisseur (Drive) approprié.
      - Lance une erreur si le provider n’est pas supporté.
  
- **Points d’attention :**
  - **Edge cases :**
    - En cas de provider non reconnu, une erreur explicite est levée (`storage_provider_unsupported_${provider}`).
    - L’appelant doit garantir le pré-contrôle du provider, sinon exception.
  - **Dépendances :**
    - `storeOnDrive` (./googleDrive.js) : gestion du dépôt pour Google Drive.
    - `storeOnOneDrive` (./msGraph.js) : gestion du dépôt pour Microsoft OneDrive.
    - Les deux dépendances sont responsables des détails d’upload, segmentation, etc.
  - **Testabilité :**
    - Fonction conçue pour être injectable et mockable en tests (cf. commentaires).
  - **Paramètres attendus :**
    - La structure du paramètre `file` et le format des `credentials`/`connection` doivent être conformes aux attentes des fonctions dépendantes.

### services/api/lib/crypto/secretBox.js

- **Rôle du fichier :**
  - Fournit des utilitaires pour chiffrer et déchiffrer les "refresh tokens" de connexion avant leur stockage, afin de protéger ces données sensibles en cas d’exfiltration de la base de données seule.
  - Le chiffrement repose sur une clé fournie par variable d’environnement (`CONNECTIONS_ENC_KEY`), jamais stockée dans la base.

- **Fonctions exportées :**
  - `parseKey(raw)`
    - **Paramètres :**  
      - `raw` (string | undefined) : clé brute en base64 ou hexadécimal
    - **Retour :**  
      - `{key: Buffer|null, problem: string}`  
        - `key` : Buffer de la clé si correcte, sinon null  
        - `problem` : message d’erreur, sinon chaîne vide
    - **Effets de bord notables :** Aucun.
  - `isSealed(value)`
    - **Paramètres :**  
      - `value` (any) : valeur à tester
    - **Retour :**  
      - `boolean` : true si objet conforme au format scellé ; false sinon
    - **Effets de bord :** Aucun.
  - `createSecretBox(rawKey, log = noopLogger)`
    - **Paramètres :**
      - `rawKey` (string, optionnel) : clé de chiffrement (base64 ou hex)
      - `log` (objet avec méthodes `info` et `warn`, optionnel) : pour journalisation, par défaut inactif
    - **Retour :**
      - Objet `{enabled, seal, open}` :
        - `enabled` (boolean) : chiffrement actif ou non
        - `seal(plaintext, aad)`  
          - `plaintext` (string) : contenu à chiffrer  
          - `aad` (string, optionnel) : données additionnelles authentifiées, lie le token à sa ligne/cible  
          - **Retour :** Objet `{v, iv, tag, data}` (tous string sauf `v`)
        - `open(stored, aad)`
          - `stored` (object|string) : contenu à déchiffrer (format scellé ou clair hérité)
          - `aad` (string, optionnel) : doit correspondre à celle utilisée à la sécurisation
          - **Retour :** string (jeton déchiffré ou vide si erreur)
      - Si la clé est absente/invalide, renvoie un "coffre" inerte qui écrit/lit en clair (comportement rétrocompatible).
    - **Effets de bord notables :**
      - En cas de clé invalide : log d’un avertissement via `log.warn`.
      - En cas d’`open` raté (clé erronée, AAD incorrect, altération des données, etc.), retourne `''` (connexion absente).
      - Aucune exception levée hors logs.

- **Points d’attention :**
  - **Compatibilité ascendante :**  
    - Les tokens existants en clair restent valides (détectés par type string). Après reconnexion/rotation, ils seront scellés.
  - **Désactivation propre :**  
    - Si la variable d’environnement de clé n’est pas posée/valide, aucun jeton n’est chiffré : tout reste en clair, sans casser l’application ni nécessiter de reconnexion immédiate.
  - **Edge cases :**
    - Mauvais format ou taille de clé : chiffrement désactivé + log avertissant.
    - AAD (associated data) doit être strictement identique entre `seal` et `open`, sinon la lecture échoue proprement (défense contre déplacement d'une entrée entre utilisateurs).
    - Si `stored` n’est ni objet scellé, ni string : valeur rejetée et rendu vide.
  - **Dépendances :**
    - Utilise le module Node.js `crypto` (`createCipheriv`, `createDecipheriv`, `randomBytes`).
    - Pas de dépendance externe.  
  - **Sécurité & limites :**
    - Ne protège PAS contre la compromission de l’environnement (accès à la clé), uniquement contre l’accès à une copie isolée de la base.
    - Le code n’autorise aucun format d’enveloppe autre que celui émis par ce module (future migration : penser à la gestion du numéro de version `v`).

### services/api/lib/errors.js

- Définit le contrat d’erreur des nouvelles routes authentifiées : codes HTTP réels et slugs stables, sans message utilisateur fourni par le serveur. Les routes héritées de `routes/templates.js` conservent leur format distinct.
- `fail(reply, status, code, extra = {})` — envoie `status` avec `{ error: code, ...extra }` et retourne le résultat de `reply.send()`. `extra` peut remplacer `error` s’il contient cette propriété.
- `unauthenticated(reply, extra)` — délègue à `fail` avec le statut `401` et le slug `unauthenticated` ; retourne le résultat de l’envoi.
- `forbidden(reply, extra)` — délègue à `fail` avec le statut `403` et le slug `forbidden` ; retourne le résultat de l’envoi.
- `slugErrorHandler(err, req, reply)` — gestionnaire Fastify global :
  - si `err.validation` existe, répond `400` avec `invalid_body` et `fields`, extraits des chemins de validation AJV ;
  - sinon, journalise l’erreur via `req.log?.error`, conserve les statuts inférieurs à `500` (ex. `413`, `415`) et répond `500` pour les autres cas, avec `{ error: 'internal_error' }`.
- Points d’attention : les détails d’erreur non gérés ne sont jamais renvoyés au client. Les erreurs OpenAI `UpstreamError` sont traitées séparément par `replyUpstreamError`, pas par ce gestionnaire. La validation dépend de la forme `err.validation` fournie par Fastify/AJV.

### services/api/lib/gmail.js

- **Rôle du fichier :**
  - Gérer l'envoi d'emails via l’API Gmail pour un utilisateur autorisé (en OAuth2, scope `gmail.send` uniquement).
  - Pas de lecture d’emails, uniquement l’envoi.
  - Fournit utilitaires pour rafraîchir les tokens, composer les messages MIME, envoyer, et révoquer l’accès.
  - S’appuie sur nodemailer (MailComposer) pour fabriquer le MIME attendu par Gmail.

- **Fonctions/exportés :**
  - `GmailAuthError` (classe)
    - Hérite de `ConnectionAuthError`.
    - Représente une révocation d’autorisation Gmail ; utilisée pour distinguer ce cas métier.
    - Effet : permet à la couche appelante de supprimer la connexion.
  - `sendViaGmail(params)`
    - **params :** objet contenant :  
      - `clientId`, `clientSecret`, `refreshToken` (OAuth),  
      - Email params : `from`, `to` (string ou tableau), `cc` (optionnel),  
      - Message : `subject`, `text`, `html`,  
      - `attachments` (optionnel, tableau d’objets {filename, content, contentType}),  
      - `fetchImpl` (optionnel, par défaut : global fetch).
    - **Retour :** `Promise<void>`  
    - **Effets de bord :**  
      - Envoi l’email via l’API Gmail.
      - Rafraîchit le token d’accès (jamais de retry sur l’envoi : risque de doublon).
      - Lève `GmailAuthError` si la connexion est révoquée.
      - Lève une `Error` spécifique pour dépassement de quota (`gmail_rate_limited`) ou autre statut d’échec HTTP.
  - `revokeGmailToken(params)`
    - **params :** objet contenant :
      - `refreshToken` (optionnel), `accessToken` (optionnel), `fetchImpl` (optionnel).
    - **Retour :** `Promise<boolean>` (true si la requête de révocation a été faite, false sinon).
    - **Effets de bord :**  
      - Tente de révoquer le jeton fourni via API Google (POST sur l’endpoint de révocation).
      - N’affecte pas la suppression locale : celle-ci doit primer.
      - Aucun rejet d’exception : gère les erreurs en interne.

- **Points d’attention / Edge cases / Dépendances :**
  - **Token d’autorisation :**  
    - Toute erreur de type `invalid_grant` détectée lors du rafraîchissement d’un access token est propagée sous forme de `GmailAuthError`.
    - La révocation d’un token (via `revokeGmailToken`) révoque tout le grant OAuth du compte (⚠️ usage dangereux lors d’une reconnexion).
  - **Gestion des quotas Gmail :**  
    - Les erreurs HTTP 403 peuvent indiquer un dépassement de quota et NON une révocation. Seul le cas `invalid_grant` = révocation.
    - Le statut `gmail_rate_limited` est attribué selon le code d’erreur Gmail.
  - **Envoi d’email :**  
    - Jamais de tentative automatique de re-jeu d’un envoi après erreur d’authentification, pour éviter le risque d’e-mail double.
    - Les destinataires (`to`, `cc`) doivent être passés sous forme de tableaux pour que nodemailer gère l’encodage correctement, évitant les bugs d’interprétation des adresses.
  - **Dépendances externes :**
    - Utilise nodemailer (MailComposer).
    - Pour les tokens : dépend de modules internes `./connections/googleTokens.js` et `./connections/errors.js`.
    - Reçoit une éventuelle implémentation custom de `fetch`, pour mock/test.
    - Utilise nativement les promesses async/await.

- **À ne pas faire/échecs courants :**
  - Ne JAMAIS révoquer un ancien token lors d’une reconnexion — cela tuerait aussi la connexion fraîche.
  - Ne pas confondre quota et révocation dans la gestion des erreurs OAuth.
  - N’utiliser ce module que pour l’envoi, jamais pour la lecture des emails.

### services/api/lib/identity.js

- Centralise la lecture et la validation des informations d’identité. La confiance dans les en-têtes est établie par Traefik ou par le hook `authPlugin.js`, qui renseigne `req.user`.
- **`utf8Header(headers, name)`** — lit un en-tête et le décode de latin1 en UTF-8 pour corriger les caractères accentués ; renvoie une chaîne, vide si l’en-tête est absent.
- **`pictureUrl(value)`** — valide une URL de photo ; renvoie l’URL si elle est valide, en HTTPS et d’au plus 2 048 caractères, sinon `''`. Rejette notamment les schémas autres que HTTPS et les URL mal formées.
- **`identityFromHeaders(headers)`** — renvoie `{ email, name, picture }` depuis les en-têtes. Pour l’email, utilise `x-user-email`, puis `x-auth-request-user` en repli ; valide la photo avec `pictureUrl`.
- **`requireEmail(req, reply)`** — renvoie `req.user?.email` si présent ; sinon répond 401 via `unauthenticated(reply)` et renvoie `null`. Ne lit volontairement pas directement les en-têtes, pour éviter l’usurpation d’identité.
- **Dépendances et points d’attention :** dépend de `./errors.js` pour la réponse 401 et de l’API Node `Buffer` / `URL`. `identityFromHeaders` ne décode pas ni ne valide le format de l’email ; la fiabilité des en-têtes dépend de leur injection par le chemin d’authentification de confiance.

### services/api/lib/mailer.js

- Gère la construction et l’envoi des emails de réinitialisation de mot de passe et de documents (transcription ou résumé), via SMTP avec Nodemailer.
- Exports :
  - `buildDocumentEmail({ kind, title?, content, lang?, subject? })` — retourne `{ subject, text, html }`. Construit les versions texte et HTML du document ; un résumé est traité comme du HTML, une transcription comme du texte brut. N’effectue pas d’envoi.
  - `createMailer(smtp, log?)` — retourne un objet `{ enabled, sendPasswordReset, sendDocument }`. Crée le transport SMTP et lance une vérification de connexion non bloquante ; les méthodes d’envoi transmettent les messages à Nodemailer.
    - `sendPasswordReset({ to, link, lang?, expiresInMinutes? })` — retourne une promesse résolue après l’envoi ; le corps ne contient que le lien de réinitialisation.
    - `sendDocument({ to, cc?, replyTo?, kind, title?, content, lang?, subject?, attachments? })` — retourne une promesse résolue après l’envoi du document, avec pièces jointes facultatives. `replyTo` permet aux destinataires de répondre malgré l’adresse d’expédition `no-reply`.
- Points d’attention :
  - Sans `smtp.host`, `enabled` vaut `false` et les deux méthodes d’envoi rejettent avec `mailer_disabled`. La configuration SMTP provient de `lib/config.js`.
  - Une erreur de vérification SMTP au démarrage est seulement journalisée ; elle ne bloque pas le démarrage de l’API. Les erreurs d’envoi, elles, sont propagées.
  - Les langues non prises en charge utilisent les textes français. Un objet personnalisé non vide remplace l’objet par défaut.
  - Les destinataires de `sendDocument` doivent être résolus depuis les réglages persistés de l’utilisateur, pas depuis la requête d’envoi. Les pièces jointes PDF sont fournies par le navigateur.
  - Dépendances : `nodemailer` et `escapeHtml` de `./text.js`.

### services/api/lib/meetingDuration.js

- **Rôle du fichier**
  - Gestion de la durée des réunions : validation d’une durée fournie et extraction de la durée depuis le résumé HTML d’une réunion pour compatibilité rétroactive.
  - Gère les cas où la durée n’est pas enregistrée explicitement dans la base, en l'extrayant du texte généré par le gabarit de compte-rendu.

- **Fonctions exportées**
  - `sanitizeDuration(value)`
    - **Paramètres** : `value` (toute valeur interprétable comme nombre de secondes)
    - **Retour** : nombre entier de secondes exploitable, ou `null` si invalide/aberrant (valeurs ≤ 0, non num érique, > 24h)
    - **Effet de bord** : aucun
  - `durationFromSummary(html)`
    - **Paramètres** : `html` (string, contenu HTML du résumé de réunion)
    - **Retour** : durée extraite en secondes (entier), ou `null` si absente/non exploitable
    - **Effet de bord** : aucun

- **Points d’attention**
  - La durée "maximale" acceptée est de 24h (86 400 s) : au-delà = donnée incohérente.
  - Pour les réunions antérieures à l’enregistrement explicite des durées (avant 2026-08-18), l’extraction dépend strictement du format `Durée … HH:MM:SS` dans le texte généré par les gabarits.
  - Nécessité de nettoyer le HTML (suppression des balises) avant extraction, pour éviter des faux positifs avec des chiffres dans les balises (ex. `<h2>`).
  - La RegExp se base sur la présence EXPLICITE du mot « Durée » ou « Duration » (avec faute d’accent tolérée) pour éviter la capture de mentions d’heures hors contexte.
  - Dépendance implicite aux formats de texte utilisés dans les templates de résumé (`src/config/templates.js`). Toute modification de ce template peut casser l'extraction.
  - Renvoie `null` (et non 0) si la durée est absente ou invalide, permettant de distinguer "durée inconnue" de "réunion de 0 s".

### services/api/lib/openai.js

- Client OpenAI minimal, basé sur `fetch` natif Node 20. Fournit les appels API, les retries et le relais des erreurs amont.
- Exports :
  - `UpstreamError(status, body, contentType)` : erreur portant le statut, le corps et le type MIME de la réponse amont.
  - `upstreamMessage(err)` : extrait le message d’un corps JSON d’erreur ; renvoie `''` si absent ou invalide.
  - `relayStatus(upstreamStatus)` : conserve les statuts `402`, `429` et `5xx` ; remappe les autres en `502`.
  - `replyUpstreamError(reply, err)` : envoie une `UpstreamError` avec statut remappé et corps verbatim ; relance les autres erreurs.
  - `isAudioTooLong(err)` : détecte une `UpstreamError` `400` dont le corps signale une durée audio excessive.
  - `normalizeApiKey(raw)` : retire les espaces et renvoie `{ key, problem }` ; signale les clés vides, mal formées ou au préfixe `sk-sk-`, sans les corriger.
  - `verifyOpenAiKey({ apiKey, baseUrl?, fetchImpl?, timeoutMs? })` : sonde `/models` ; renvoie `{ ok: true }` ou lève une `UpstreamError`. Appel HTTP sans retry.
  - `createOpenAiClient({ apiKey, baseUrl?, timeoutMs?, fetchImpl? })` : crée un client ; `apiKey` peut être une chaîne ou une fonction résolue à chaque requête. Méthodes retournées :
    - `chat({ model, messages, verbosity?, reasoningEffort?, timeoutMs? })` : renvoie le texte du premier choix, ou `''` s’il manque. Les options de raisonnement et de verbosité ne sont envoyées qu’aux familles de modèles compatibles.
    - `transcribe({ path?, buffer?, filename?, mimetype?, model? })` : envoie un fichier audio et renvoie `{ text }`. Fournir `path` ou `buffer`.
    - `generateImage({ model, prompt, size? })` : renvoie `{ b64 }`, avec un timeout d’au moins 5 minutes.
    - `realtimeClientSecret(lang, model?)` : crée un secret Realtime et renvoie le corps OpenAI complet.
  - `REASONING_EFFORTS`, `VERBOSITY_LEVELS` : valeurs autorisées documentées pour les paramètres correspondants.
- Points d’attention :
  - `createOpenAiClient` dépend de `retry.js`, `transcriptionModels.js` et des API natives Node (`fetch`, `AbortSignal.timeout`, `Blob`, `FormData`, `openAsBlob`) ; `fetchImpl` est injectable pour les tests.
  - Les requêtes du client relancent les erreurs réseau, `429` et `5xx`, mais pas les autres statuts. Sans clé, elles échouent avec une erreur synthétique `503`.
  - Les corps d’erreur amont sont conservés verbatim pour le relais au frontend ; les statuts autres que `402`, `429` et `5xx` deviennent `502`.
  - Pour `transcribe`, le fichier doit rester disponible jusqu’au retour de l’appel ; un `path` est relu à chaque tentative. Les redirections échouent volontairement (`redirect: 'error'`).
  - Les paramètres `verbosity` et `reasoningEffort` sont filtrés selon le modèle afin d’éviter des erreurs `400` sur les modèles qui ne les acceptent pas.

### services/api/lib/ownerScope.js

- Centralise l’appartenance des documents métier à un utilisateur : filtres Mongo, champs d’appartenance, collections concernées et backfill de `emailLower`.
- `ownerFilter(email, extra = {})` : retourne un filtre Mongo combinant `emailLower` normalisé ou `email` exact, avec `extra` en critères additionnels. Utilisé pour les lectures et écritures scopées.
- `ownerPurgeFilter(email)` : retourne un filtre Mongo plus large, incluant une recherche insensible à la casse sur `email`. Peut entraîner un balayage de collection ; réservé aux purges définitives.
- `ownerFields(email)` : retourne `{ email, emailLower }`, en conservant la casse d’origine dans `email` et en normalisant `emailLower`.
- `OWNED_COLLECTIONS` : liste des collections métier à inclure dans le backfill et la purge. Toute nouvelle collection par utilisateur doit y être ajoutée ; sa suppression peut effacer notamment les journaux d’envoi et les données de quota.
- `backfillOwnerEmails(db, log)` : complète les `emailLower` manquants dans chaque collection et retourne le nombre de documents modifiés. Effet de bord : écrit en base ; une erreur est journalisée par collection sans interrompre les suivantes. Idempotente.
- Points d’attention :
  - Dépend de `normalizeEmail` (`./repositories/users.js`) et `escapeRegExp` (`./text.js`).
  - `ownerFilter` ne retrouve les emails en casse mixte que si `emailLower` a été renseigné ; le backfill est donc important.
  - `ownerPurgeFilter` est volontairement plus coûteux afin de ne pas laisser de documents lors d’une suppression de compte.
  - `userConnections` : la suppression du document ne révoque pas les autorisations chez le fournisseur externe.

### services/api/lib/prompts.js

- Construit et parse des prompts destinés aux modèles pour les actions, les titres, la relecture de transcription et les infographies. Le prompt de résumé est construit côté frontend.
- Fonctions exportées :
  - `todayParis(now = new Date())` → date `yyyy-MM-dd` en Europe/Paris. Utilise `Intl.DateTimeFormat`.
  - `actionsPrompt({ content, actions, dismissed, today, language, settings })` → prompt d’extraction des actions au format texte. Applique le niveau de sensibilité, les mots déclencheurs, le contexte métier et l’option de mise à jour ; n’effectue pas d’appel modèle.
  - `parseActionsOutput(raw)` → tableau d’actions parsé et assaini, ou `[]` si la sortie est vide ou illisible. Accepte un tableau JSON, `{ actions: [...] }`, des fences Markdown ou un premier bloc `[...]`.
  - `titleUserMessage({ resume, transcription })` → message utilisateur texte pour la génération du titre ; les valeurs absentes deviennent des chaînes vides.
  - `sanitizeTitle(raw)` → titre nettoyé, limité à 80 caractères puis à 5 mots ; renvoie `UNTITLED_MEETING` si le résultat est vide.
  - `refineTranscriptPrompt({ sentences, notes })` → prompt de relecture au format texte, avec les phrases sérialisées en JSON.
  - `parseRefineOutput(raw, count)` → tableau de chaînes si la sortie JSON contient exactement `count` phrases ; sinon `null`. Accepte un tableau nu ou `{ sentences: [...] }`, mais pas les fences contenant du JSON additionnel.
  - `infographicPrompt({ transcription, actions, notes, style, language } = {})` → demande texte pour le modèle d’image ; filtre les actions masquées et borne les blocs.
- Constantes exportées : `TITLE_RULES`, `UNTITLED_MEETING`, `TITLE_MAX_WORDS`, `INFOGRAPHIC_PROMPT_MAX`, `INFOGRAPHIC_STYLE_MAX`, `INFOGRAPHIC_WRITER_RULES`.
- Points d’attention :
  - `actionsPrompt` utilise `normalizeLang` (`./text.js`), retombe sur le français et sur le niveau de sensibilité `explicit` si les réglages sont absents ou invalides. `allowUpdates: false` interdit les mises à jour et l’émission d’`id`.
  - `parseActionsOutput` retire les objets non valides et convertit les `id` entiers ; un `id` non entier est supprimé. Les éléments d’un tableau JSON valide ne sont pas autrement validés.
  - `sanitizeTitle` attend une valeur convertible en chaîne ; la coupe à 80 caractères précède la limite de mots.
  - `infographicPrompt` tronque les actions à 3 000 caractères, les notes à 4 000 et le prompt total à 30 000 ; si nécessaire, conserve le début et la fin de la transcription. Les actions avec `show: false` sont exclues. `INFOGRAPHIC_WRITER_RULES` est distinct des règles intégrées à cette demande.

### services/api/lib/rbac.js

- **Rôle du fichier** :
  - Fournit des middlewares de contrôle d’accès basé sur le rôle utilisateur pour les API.
  - Vérifie la présence et le rôle de l’utilisateur authentifié (stocké sur `req.user`).

- **Fonctions exportées** :
  - `requireUser(req, reply)`
    - **Paramètres** :  
      - `req` : objet requête HTTP (doit contenir `user`)
      - `reply` : objet réponse HTTP (pour envoyer une erreur)
    - **Retour** :  
      - L’objet utilisateur si l’email existe (authentifié).
      - `null` si non authentifié (réponse 401 envoyée via effet de bord).
    - **Effet de bord** :  
      - Envoie une réponse 401 via `unauthenticated(reply)` si non authentifié.

  - `requireRole(role)`
    - **Paramètres** :  
      - `role` : chaîne (le rôle requis, ex : `'admin'`)
    - **Retour** :  
      - Une fonction middleware `(req, reply) => user|null`
        - Retourne l’utilisateur si son rôle correspond.
        - Sinon `null` (voie effets de bord décrits ci-dessous).
    - **Effet de bord** :
      - Envoie 401 si aucune identité (délégué à `requireUser`)
      - Envoie 403 si identité insuffisante (via `forbidden(reply)`)

  - `requireAdmin`
    - Alias de `requireRole('admin')`
    - Middleware prêt à l’emploi pour accès admin.

- **Points d’attention** :
  - **Source du rôle** : le rôle de l’utilisateur provient du champ `req.user` (renseigné par le backend, jamais par le client).
  - **Effet de bord systématique** : ces fonctions peuvent envoyer une réponse HTTP (401/403) en cas d’accès non autorisé, ce qui interrompt le flux.
  - **Dépendances** : utilise les helpers `forbidden` et `unauthenticated` du fichier `./errors.js`.
  - **Cas limites** :
    - Si `req.user` est absent ou ne contient pas d’email, 401 envoyé.
    - Si le rôle ne correspond pas, 403 envoyé — l’appelant ne doit pas générer une réponse supplémentaire.
    - Suppose que `req.user` est correctement renseigné par le hook d’authentification (`lib/authPlugin.js`).

### services/api/lib/repositories/connections.js

- **Rôle du fichier**
  - Gère la persistance et la gestion des connexions externes des utilisateurs (collection MongoDB `userConnections`).
  - Stocke, met à jour, lit et supprime les connexions OAuth à des fournisseurs externes (ex : Google, Microsoft), y compris le chiffrement conditionnel des refresh tokens via une clé d’environnement.

- **Fonctions exportées**
  - `parseScopes(scope)`
    - **Paramètres** : `scope` (string ou tableau)
    - **Retour** : `string[]` (tableau des scopes non vides)
    - **Effet de bord** : Aucun.
  - `createConnectionsRepo(db, secretBox?)`
    - **Paramètres** :
      - `db` (objet db Mongo)
      - `secretBox` (optionnel ; objet `{enabled, seal, open}` pour gestion du chiffrement/déchiffrement)
    - **Retour** : objet repo avec méthodes :
      - `get(emailLower)`
        - Paramètres : `emailLower` (string)
        - Retour : Connection utilisateur la plus récente ({ provider, account, refreshToken, scopes, drive } ou null)
        - Effet de bord : Lit MongoDB, déchiffre le refreshToken.
      - `getByProvider(emailLower, provider)`
        - Paramètres : `emailLower` (string), `provider` (string)
        - Retour : Connexion pour ce provider ou null.
        - Effet de bord : idem.
      - `set(emailLower, payload)`
        - Paramètres : `emailLower` (string), `{ provider, account, refreshToken, scopes }`
        - Retour : Promise<void>
        - Effet de bord : Upsert dans MongoDB, scelle(chiffre) le refreshToken, réinitialise le cache drive.
      - `setDriveCache(emailLower, provider, {folderPath, folderId, driveId})`
        - Paramètres : identifiants + info de cache drive
        - Retour : Promise<void>
        - Effet de bord : Met à jour le champ 'drive' dans le document.
      - `clearDriveCache(emailLower, provider)`
        - Effet de bord : Efface la clé 'drive' sur ce couple.
      - `delete(emailLower, provider)`
        - Retour : Promise<boolean> (vrai si le document existait)
        - Effet de bord : Supprime dans MongoDB.
      - `listFor(emailLower)`
        - Retour : array connections ({ provider, account, refreshToken, scopes, drive }[])
        - Effet de bord : Lit tout, déchiffre.
      - `deleteAllFor(emailLower)`
        - Retour : nombre de connexions supprimées
        - Effet de bord : Supprime toutes les connexions de l'utilisateur.

- **Points d'attention**
  - **Chiffrement du refreshToken**
    - Activé uniquement si la variable d’environnement `CONNECTIONS_ENC_KEY` est présente.
    - Scellé (chiffré) pour chaque combinaison utilisateur/provider — déchiffrement impossible si on déplace le document dans la collection.
    - Si clé absente, stockage en clair, lecture possible des connexions précédentes non chiffrées.
  - **Résilience aux erreurs/défauts**
    - Si le refreshToken n’est pas correctement déchiffré (clé modifiée ou donnée altérée), la connexion devient `null` (comportement géré).
    - En cas de bascule fournisseur, deux connexions peuvent coexister, la plus récente est retenue.
    - Un cache drive erroné est explicitement effaçable.
  - **Dépendances**
    - Collection MongoDB `userConnections`
    - L’objet `secretBox` doit fournir les méthodes `.seal()` et `.open()` compatibles avec le protocole du refreshToken.
    - Pas de vérification explicite sur la validité des scopes dans `set`.
  - **Cas limites**
    - Connexion déplacée ou altérée : impossible à déchiffrer, gestion propre prévue.
    - Connexions legacy non chiffrées : migrent automatiquement au prochain enregistrement.
    - Un utilisateur peut avoir plusieurs connexions pour différents providers (bascule d’installation).

- **Autres**
  - Le refreshToken ne sort jamais du repo dans les API, uniquement dans ce service (sécurité respectée).
  - Enregistrement drive : attention à bien gérer driveId pour SharePoint/OneDrive.

### services/api/lib/repositories/settings.js

- **Rôle** — Accès aux réglages `appSettings`, stockés par domaine fonctionnel (`auth`, `ai`, `actions`, `branding`, `orgContext`, `transcriptCorrections`). Fournit les valeurs par défaut, les projections destinées aux API et les mises à jour partielles.
- **Exports nommés**
  - `SETTINGS_COLLECTION` — nom de la collection MongoDB (`appSettings`).
  - `BRANDING_LOGO_MAX`, `BRANDING_TAGLINE_MAX`, `BRANDING_LOGO_PATTERN`, `BRANDING_COLOR_PATTERN`, `ORG_CONTEXT_MAX`, `CONNECTION_PROVIDERS` — plafonds, motifs de validation et fournisseurs autorisés.
  - `connectionProviderOf(doc)` — lit le fournisseur depuis un document `actions`, avec reprise des valeurs historiques `gdrive`/`sharepoint` ; retourne `''`, `'google'` ou `'microsoft'`.
  - `connectionSharePointOf(doc)` — indique si le scope SharePoint est demandé ; retourne `false` uniquement si le champ vaut explicitement `false`.
  - `keyHint(key)` — retourne un indice masqué de la clé, ou `''` si elle est vide.
  - `toPublicSettings(doc, context?)`, `toPublicAiSettings(doc, context?)`, `toPublicActionsSettings(doc, context?)`, `toPublicBrandingSettings(doc, context?)`, `toPublicOrgContextSettings(doc, context?)`, `toPublicTranscriptCorrections(doc, context?)` — projettent les réglages pour exposition contrôlée ; masquent les secrets et limitent les métadonnées ou champs internes selon les options.
  - `mergeAuthSettings(current, patch?)` — fusionne un patch d’authentification sans écriture ; conserve les secrets absents ou vides et nettoie les domaines.
  - `createSettingsRepo(db)` — construit le dépôt MongoDB ; retourne les méthodes listées ci-dessous. **Effet de bord :** les méthodes `update*` et `seedFromEnv` écrivent dans la collection via `updateOne` avec `upsert`.
- **Méthodes retournées par `createSettingsRepo(db)`**
  - `get()` / `update(patch?)` — lit ou met à jour les réglages d’authentification ; `update` accepte aussi `{ actor }`, met à jour `updatedAt`/`updatedBy` et retourne le document complet.
  - `getAi()` / `updateAi(patch, context?)` — lit ou met à jour les réglages IA ; `context.actor` renseigne l’audit. Les clés absentes sont conservées, les clés présentes vides effacées ; les modèles inconnus sont refusés.
  - `resolveOpenAiKey(envKey?)`, `resolveProviderKey(provider)`, `resolveTranscriptionModel(envModel?)`, `resolveSummaryModel(envModel?)`, `infographicEnabled()`, `infographicStyle()`, `resolveInfographicImageModel(envModel?)` — résolvent les clés, modèles et options effectifs ; les valeurs IA sont relues en base à chaque appel.
  - `getActions()` / `updateActions(patch?, context?)` — lit ou met à jour les actions, les connexions, la politique mail et les gabarits ; fusionne les sections champ par champ, accepte les fournisseurs historiques et renseigne les métadonnées d’audit.
  - `getBranding()` / `updateBranding(patch, context?)` — lit ou met à jour logo, textes et couleurs ; valide le format du logo et des couleurs, applique les plafonds.
  - `getOrgContext()` / `orgContextText()` / `updateOrgContext(patch?, context?)` — lit le contexte organisationnel, en retourne le texte seul ou le met à jour avec plafond et audit.
  - `getTranscriptCorrections()` / `updateTranscriptCorrections(patch?, context?)` — lit ou remplace la liste complète des corrections, nettoyée à l’écriture et à la lecture.
  - `seedFromEnv(env?)` — amorce les réglages d’authentification depuis l’environnement sans écraser ceux déjà configurés ; retourne `{ seeded: false }` ou `{ seeded: true, providers }`.
- **Points d’attention**
  - Les documents complets (`get*`) peuvent contenir des secrets : usage serveur uniquement. Les projections publiques ne renvoient que leur présence et, pour les clés IA, un indice.
  - Une valeur absente dans un patch signifie généralement « inchangée » ; une valeur vide peut effacer une clé, un modèle, un style ou un champ de marque. Les secrets de fournisseurs OAuth absents **ou vides** sont conservés.
  - Les réglages anciens sont normalisés à la lecture sans migration ; les valeurs historiques de stockage restent

### services/api/lib/repositories/userActions.js

- **Rôle :** gère dans `userActionSettings` les préférences d’actions par compte : mail, dépôt, nommage, fenêtre après résumé, détection d’actions et envoi à myBrain. Les valeurs vides reprennent le comportement par défaut ; les réglages utilisateur ne peuvent pas rouvrir une action désactivée par l’administration.
- **Exports :**
  - `USER_ACTIONS_COLLECTION` — nom de la collection (`userActionSettings`).
  - `FOLDER_MAX`, `TAG_FOLDERS_MAX`, `TAG_RECIPIENTS_MAX` — plafonds de longueur ou de nombre d’entrées.
  - `toPublicUserActions(doc)` — projette un document en réglages publics ; nettoie les listes par tag et applique le défaut `afterSummary.offer: true`.
  - `createUserActionsRepo(db)` — crée le dépôt MongoDB et expose :
    - `get(email, { maxRecipients } = {})` — retourne les réglages généraux normalisés, avec défauts ; relit et borne les destinataires.
    - `update(email, patch = {})` — fusionne les champs fournis sans effacer les autres, écrit par upsert, puis retourne les réglages relus. Met à jour `updatedAt`.
    - `getDetection(email)` — retourne les réglages de détection normalisés, défauts compris.
    - `updateDetection(email, patch = {})` — fusionne le patch de détection, écrit par upsert et retourne le résultat.
    - `getMyBrain(email)` — retourne `{ enabled, enabledSince }` ; l’activation est fausse par défaut.
    - `updateMyBrain(email, { enabled })` — met à jour l’activation et retourne son état ; renseigne `enabledAt` uniquement au passage à activé.
- **Points d’attention :**
  - Les lectures utilisent `ownerFilter`; les upserts utilisent `{ emailLower }` avec `ownerFields(email)` en `$setOnInsert`. Ne pas remplacer ce filtre d’écriture par `ownerFilter`, qui contient un `$or`.
  - Les destinataires sont normalisés et bornés à la lecture ; les destinataires généraux de `update` sont supposés déjà validés par la route.
  - Les dossiers par tag vides sont conservés ; les entrées de destinataires par tag sans adresse sont supprimées. Les tags sont référencés par ID.
  - `driveId` accompagne le dossier de stockage ; sans mise à jour cohérente, un dossier homonyme peut être choisi dans une autre bibliothèque.
  - Dépend de MongoDB via `db`, de `ownerScope.js`, `users.js`, `actionDetectionSettings.js`, `actions/recipients.js` et `actions/templating.js`. Les réglages de détection sont relus sans cache ; leur accès fréquent dépend de l’index unique sur `emailLower`.

### services/api/lib/repositories/users.js

- **Rôle** : accès à la collection MongoDB `user`, seule couche qui connaît son schéma. Centralise les recherches, projections publiques, gestion des comptes, groupes, moyens d’authentification et purge des données métier.
- **Exports**
  - `ROLES` — tableau `['user', 'admin']`.
  - `SERVED_ACCOUNT` — filtre MongoDB des comptes servis : documents dont `emailLower` est une chaîne.
  - `normalizeEmail(email)` — convertit en chaîne, retire les espaces périphériques et met en minuscules ; utilisé pour la clé de recherche `emailLower`, pas pour l’identité métier.
  - `toPublicUser(doc)` — renvoie `null` si le document est absent, sinon une projection publique sans `passwordHash`.
  - `toSessionUser(doc, options?)` — renvoie `null` si le document est absent, sinon l’identité de session ; options : `authMode`, `authProvider`, `groups`, `rights`.
  - `createUsersRepo(db)` — construit le dépôt lié à `db` et renvoie :
    - `findByEmailLower(emailLower)` — document complet ou `null` ; peut donc exposer `passwordHash` au code appelant.
    - `findByEmail(email)` — document complet ou `null` ; recherche par clé normalisée, puis par email brut pour les documents legacy.
    - `list({q, limit, skip, group}?)` — `{users, total}` ; liste paginée projetée en utilisateurs publics, avec recherche échappée et filtre de groupe.
    - `countAdmins()` — nombre d’administrateurs actifs parmi les comptes servis.
    - `groupMemberCounts()` — `Map<groupId, nombre>` ; les comptes sans groupe sont attribués au groupe par défaut.
    - `create(input)` — insère un compte et renvoie son document ; initialise les timestamps, le groupe, le fournisseur d’authentification et, si fourni, le hash de mot de passe.
    - `setPicture(emailLower, picture)` — met à jour photo et `updatedAt` ; ignore les valeurs absentes.
    - `update(emailLower, champs)` — met à jour les champs administrables fournis et `updatedAt`, puis renvoie le document complet ou `null`.
    - `changeGroupMembers(groupId, {add, remove})` — déplace les comptes entre groupes ; renvoie `{added, removed}`. Les retraits ramènent au groupe par défaut.
    - `detachGroup(groupId)` — replace les membres dans le groupe par défaut ; renvoie le nombre modifié.
    - `setPassword(emailLower, {passwordHash, mustChangePassword})` — écrit les informations de mot de passe, ajoute le fournisseur `password` si nécessaire et renvoie le document complet ou `null`.
    - `addAuthProvider(emailLower, provider)` — ajoute le fournisseur s’il est absent ; opération idempotente, renvoie le document complet ou `null`.
    - `remove(emailLower)` — supprime le compte et les documents legacy correspondant à l’adresse, sans valeur de retour utile.
    - `purgeUserData(email)` — supprime les données possédées dans chaque collection de `OWNED_COLLECTIONS` ; renvoie les nombres supprimés par collection.
- **Points d’attention**
  - L’email brut conserve sa casse pour l’identité et les données métier ; `emailLower` sert uniquement à rechercher et garantir l’unicité du compte.
  - `SERVED_ACCOUNT` exclut les doublons inertes sans `emailLower` des listes et décomptes.
  - Un compte n’appartient qu’à un groupe ; `normalizeGroupIds` et `groupIdOf` appliquent le groupe par défaut aux champs absents ou vides.
  - `remove` et `purgeUserData` suppriment aussi des données legacy ; cette dernière dépend de `ownerScope.js` et des collections qui y sont déclarées.
  - Dépendances : MongoDB via `db`, `groups.js`, `ownerScope.js` et `text.js`. L’import circulaire avec `ownerScope.js` est intentionnel ; les liaisons concernées ne sont utilisées qu’à l’appel.

### services/api/lib/retry.js

- **Rôle du fichier**
  - Fournit une logique de relance (`retry`) avec backoff exponentiel (et jitter) pour appels asynchrones idempotents (par ex. relire, rafraîchir un token).
  - Vise à gérer les erreurs réseau transitoires, sans duplicer les actions ambiguës (p. ex. ne jamais réessayer un envoi qui pourrait être déjà traité).

- **Fonctions exportées**
  - `isNetworkError(err)`
    - **Paramètres :**
      - `err` (`Error`): erreur à analyser
    - **Retour :** `boolean`
      - `true` si l’erreur est clairement une panne réseau (TypeError, `ECONNREFUSED`, `ENOTFOUND`)
      - Exclut explicitement les timeouts et les `AbortError`
    - **Effet de bord notable :** Aucun

  - `withRetry(fn, opts)`
    - **Paramètres :**
      - `fn` (`() => Promise<T>`): fonction asynchrone à exécuter avec relance si besoin
      - `opts` (optionnel, `Object`)
        - `attempts` (`number`, default: `3`): nombre total de tentatives
        - `baseMs` (`number`, default: `500`): délai de base (ms) avant relance
        - `maxMs` (`number`, default: `8000`): délai max (ms) entre deux tentatives
        - `retryOn` (`function`, default: `isNetworkError`): prédicat décidant si l'erreur mérite une relance
        - `sleep` (`function`, default: `defaultSleep`): fonction d’attente, injectable pour tests
        - `random` (`function`, default: `Math.random`): source de hasard, injectable pour tests
    - **Retour :** `Promise<T>`
      - Résout avec la valeur de `fn` si succès ; sinon rejette la dernière erreur
    - **Effet de bord notable :**
      - Introduit un délai entre tentatives (avec jitter).
      - Peut retenter plusieurs fois l'appel, en respectant les règles précisées.

- **Points d'attention / Edge cases / Dépendances**
  - **Uniquement pour opérations IDEMPOTENTES** : ne pas utiliser pour un envoi ou une action dont l'effet pourrait être dupliqué.
  - **Timeout** : le timeout sur chaque tentative n’est pas géré ici, mais reste à l’initiative de l’appelant (préconisé via `AbortSignal`).
  - **Définit la notion d’erreur transitoire** : par défaut, seuls les vrais défauts réseau sont relancés, pas les timeouts ni les `AbortError`.
  - **Tests** : fonctions `sleep` et `random` injectables facilitent les tests avec timers simulés et hasard contrôlé.
  - **Dépendances** : Aucune dépendance externe (hormis utilitaires JS natifs, ex : `setTimeout`).

- **À surveiller**
  - Bien calibrer les paramètres `baseMs`, `maxMs` et `attempts` selon votre cas d’usage (pour éviter une surcharge en cas de panne prolongée ou une attente trop longue).
  - Le backoff utilise un jitter “plein” : la durée réelle varie entre 50% et 100% du délai calculé, pour limiter les embouteillages côté serveur en cas d’incident massif.

### services/api/lib/stats.js

- **Rôle** : calcule en mémoire les statistiques d’usage des réunions et des comptes, sans accès direct à Mongo ni à Fastify. Applique le périmètre avant les agrégations et renvoie la charge utile de `GET /api/admin/stats`.
- **Fonctions exportées** :
  - `meetingDate(doc)` — retourne la date valide (`Date`) issue de `lastConnecion`, `lastConnection` ou `now`, sinon `null`. Une date invalide exclut la réunion des séries temporelles.
  - `ownerKey(doc)` — retourne l’adresse de compte normalisée en minuscules, ou `''`.
  - `templateOf(doc)` — retourne le template nettoyé, ou `'inconnu'`.
  - `hasSummary(doc)` — retourne un booléen ; `versions` absent est considéré comme un compte rendu présent, tandis que `versions: []` ne l’est pas.
  - `granularityFor(days)` — retourne `'day'`, `'week'` ou `'month'` selon la durée de période.
  - `statsWindow(query, now = new Date())` — retourne `{ days, since, until }` pour une période glissante ou des dates `from`/`to` inclusives, ou `{ error: 'range_invalid' }`. Utilise `zonedMidnight` pour les bornes à minuit de Paris ; `until` peut dépasser `now`.
  - `adoptionStatus(usage)` — avec `{ meetings, meetingsUntilEnd, activeWeeks, weeks }`, retourne `'regular'`, `'occasional'`, `'dormant'` ou `'never'`. Le seuil « régulier » est `REGULAR_SHARE` (0,5).
  - `applyScope({ meetings, users, groups, scope })` — retourne `{ accounts, meetings }` filtrés par groupe, compte et/ou template. Dépend de `groupsOfUser` et `toUserGroup` ; les réunions orphelines sont exclues dès qu’un filtre de compte ou de groupe est appliqué.
  - `templateCounts(meetings)` — retourne les templates triés par nombre de réunions décroissant, puis par nom.
  - `computeUsageStats(input)` — calcule indicateurs, période précédente, adoption, séries temporelles, comptes et couverture des durées/transcriptions ; retourne un objet de statistiques. `now` est injectable pour les tests. Aucun effet de bord notable : calcul en mémoire uniquement.
- **Constantes exportées** : `DURATION_BUCKETS` (tranches de durée), `RANGE_DAYS` (périodes proposées, `0` = depuis toujours), `ADOPTION_STATUSES` (ordre des statuts) et `REGULAR_SHARE` (seuil d’adoption régulière).
- **Points d’attention** :
  - Les durées absentes, nulles ou invalides ne sont pas incluses dans les moyennes ; `coverage` indique le nombre de durées mesurées.
  - Les réunions sans date exploitable restent comptées dans les totaux globaux, mais sont exclues des calculs temporels.
  - Les semaines commencent le lundi UTC ; les jours de semaine utilisent le fuseau local du serveur.
  - Les séries incluent les compartiments vides, avec une limite de 400 points.
  - Les bornes de `statsWindow` sont validées comme jours ISO réels ; la validation dépend de `zonedMidnight` (`./quota.js`). Les groupes dépendent de `./repositories/groups.js`.

### services/api/lib/transcriptionModels.js

- Centralise les modèles de transcription acceptés, leur fournisseur et les règles de résolution des modèles temps réel et fichier.
- Exports :
  - `DEFAULT_TRANSCRIPTION_MODEL`, `TRANSCRIPTION_PROVIDERS`, `KEYED_PROVIDERS`, `PROVIDER_LABELS`, `TRANSCRIPTION_MODELS`, `FILE_TRANSCRIPTION_MODEL`, `TRANSCRIPTION_RETIREMENT_DATE`, `RETIRED_TRANSCRIPTION_MODELS` : constantes de configuration. `TRANSCRIPTION_MODELS` suit l’ordre des clés de `TRANSCRIPTION_PROVIDERS`.
  - `providerKeyField(provider)` → nom du champ de clé API (`<provider>ApiKey`).
  - `transcriptionProvider(id)` → fournisseur du modèle ; retourne `openai` si l’identifiant est inconnu.
  - `speechmaticsModel(id)` → identifiant Speechmatics sans le préfixe `speechmatics-` (convertit une valeur absente en chaîne vide).
  - `fileTranscriptionModel(liveModel)` → modèle fichier associé au modèle temps réel ; retombe sur `gpt-transcribe` si aucune correspondance tierce n’existe.
  - `isTranscriptionModel(id)` → booléen indiquant si l’identifiant est accepté.
  - `describeTranscriptionModel(stored, envModel)` → `{ model, source, retiredFrom }`, en privilégiant le réglage enregistré, puis l’environnement, puis le défaut ; traduit les modèles retirés.
  - `resolveTranscriptionModel(stored, envModel)` → identifiant du modèle effectif, via `describeTranscriptionModel`.
- Points d’attention :
  - Les modèles acceptés doivent rester compatibles avec les préfixes utilisés par `src/lib/realtime/channel.js` ; un test API vérifie leur alignement.
  - Les identifiants inconnus sont ignorés lors de la résolution. Les modèles retirés sont remplacés sans réécrire la valeur enregistrée.
  - Les modèles de transcription de fichier sont distincts des modèles temps réel ; les modèles tiers utilisent leurs équivalents fournisseur.
  - Les fournisseurs tiers nécessitent une clé enregistrée dans les réglages IA. La liste des modèles acceptés doit correspondre à ceux autorisés par l’API temps réel.

### services/api/routes/actions/execute.js

- Enregistre les routes d’actions utilisateur sur une transcription ou un résumé. Le document provient du client, afin d’inclure les modifications locales non persistées.
- `actionsExecuteRoutes(app)` — paramètre l’application Fastify ; ne retourne pas de valeur utile. Enregistre les routes `POST /actions/email` et `POST /actions/store`, un limiteur par compte pour les e-mails, et son arrêt à la fermeture de l’application.

- `POST /actions/email`
  - Authentifie l’utilisateur, applique le quota par compte, lit le document en JSON ou en multipart, puis appelle `executeEmail`.
  - Le multipart permet une pièce jointe facultative ; le corps de l’e-mail contient déjà le document.
  - Réponse réussie : `{ ok, via, degraded, to }`, où `to` indique les destinataires effectifs. En cas d’erreur, renvoie l’erreur et le statut fournis par `executeEmail`.
  - Effets de bord : envoi d’e-mail ; le dépassement du quota renvoie `429`.

- `POST /actions/store`
  - Authentifie l’utilisateur ; exige un multipart, lit le document et le fichier, puis appelle `executeStore`.
  - Réponse réussie : `{ ok, provider, folder, driveName, tag }`. Les erreurs de lecture renvoient `400`, ou `413` si la pièce jointe dépasse la taille autorisée.
  - Effet de bord : dépôt du fichier sur le stockage distant. Une confirmation requise est renvoyée comme erreur métier avec son statut (notamment `409`) et ses détails.

- **Points d’attention**
  - Les destinations ne sont jamais acceptées depuis le corps de la requête : elles sont résolues à partir des réglages persistés.
  - L’activation de chaque action est revérifiée dans `lib/actions/execute.js` ; masquer un bouton côté interface ne constitue pas un contrôle d’accès.
  - Dépendances principales : `requireUser`, `fail`, `createRateLimiter`, `jsonOnlyBody`, `readMultipartDocument`, `executeEmail` et `executeStore`.
  - Le schéma JSON de l’e-mail ne s’applique pas au multipart ; ne pas y introduire de destinations contrôlables par le client.

### services/api/routes/actions/index.js

- **Rôle du fichier**  
  - Point d’entrée qui agrège et enregistre les routes liées aux actions post-réunion sous `/api/actions/*`.
  - Orchestration de sous-routes spécialisées (détection, exécution, paramétrage utilisateur, stockage, test).

- **Fonctions exportées**
  - `actionsRoutes(app)`
    - **Paramètres** :  
      - `app` (instance de l’application Fastify ou équivalent, permettant l’enregistrement de plugins/routes).
    - **Retour** : Aucun (void).
    - **Effet de bord notable** :  
      - Enregistrement asynchrone de l’ensemble des sous-routes sur l’instance fournie.
      - Sous-routes ajoutées : `detection`, `execute`, `settings`, `storage`, `test`.

- **Points d’attention**
  - **Edge cases** :
    - Chaque sous-route a ses propres spécificités de contrat d’entrée et niveau de sécurité.
    - Les erreurs sont standardisées :  
      - Utilisation de vrais codes HTTP + payload `{ error: '<slug>' }` conformément à `lib/errors.js`.
      - Les erreurs AJV (validation schéma JSON) sont traitées par le handler global prévu dans `app.js`.
  - **Dépendances** :  
    - Les modules `detection.js`, `execute.js`, `settings.js`, `storage.js`, `test.js` doivent chacun exposer une fonction d’enregistrement de routes prenant en argument une instance de routes enfant (`actions`).  
    - Nécessite que `app` supporte la méthode `.register()` (compatible Fastify).

### services/api/routes/actions/settings.js

- Gère les réglages d’actions propres à l’utilisateur : destinataires, stockage, gabarits de nom et d’objet, et offre affichée après le résumé. Les interrupteurs et le fournisseur externe relèvent des réglages d’organisation.
- **`default actionsSettingsRoutes(app)`** — enregistre les routes Fastify `GET` et `POST /actions/settings` ; ne retourne pas de valeur utile.
  - **GET** — sans paramètre métier ; exige un utilisateur authentifié, charge ses réglages et ceux de l’organisation, puis retourne `{ settings, ceiling, limits, variables, defaults }`. Le plafond indique les fonctions autorisées par l’administration.
  - **POST** — reçoit un corps validé par `userActionsSettingsBody` ; exige un utilisateur authentifié et une origine identique, valide et normalise les destinataires et les variables de gabarit, applique un patch via `app.userActions.update`, puis retourne le même contexte que le GET. Effets de bord : met à jour les réglages de l’utilisateur ; peut répondre avec une erreur explicite (`403 bad_origin`, `400` pour destinataire invalide, limite dépassée ou variable inconnue).
- **`context(admin)`** — helper interne ; construit le plafond, les limites, les variables disponibles et les valeurs par défaut à partir des réglages d’administration.
- **Points d’attention :**
  - Les destinataires sont réglés sur cette route, pas dans la requête d’envoi ; chaque liste est normalisée et limitée selon `admin.mail.maxRecipients`. Les refus identifient les adresses ou le tag concerné.
  - Les gabarits sont rejetés s’ils contiennent des variables inconnues. Le stockage est copié champ par champ pour préserver les patchs partiels.
  - Dépend de `requireUser`, `isSameOrigin`, des schémas de requête, de `normalizeRecipients`, des utilitaires de gabarit et des services `app.settings` / `app.userActions`. L’absence d’en-tête `Origin` est tolérée par le contrôle d’origine.

### services/api/routes/actions/storage.js

- Enregistre les routes API de navigation et de création de dossiers dans le stockage connecté. Le fournisseur est déterminé par la configuration serveur ; les jetons d’accès ne sont pas transmis au navigateur.
- Export par défaut : `actionsStorageRoutes(app)` — configure les routes Fastify ; ne retourne pas de valeur utile.

- `GET /actions/storage/drives`
  - Paramètres : aucun.
  - Retour : `{ provider, multiDrive, sharedDrivesMissing, drives }`.
  - Effet : liste les espaces de stockage accessibles via `app.driveBrowser.drives`.

- `GET /actions/storage/folders`
  - Paramètres de requête : `driveId`, `cursor`, `search`, `pageToken` (tous facultatifs).
  - Retour : `{ ok: true, ...result }`, avec les sous-dossiers ou résultats de recherche.
  - Effet : lecture seule ; délègue à `app.driveBrowser.list`.

- `GET /actions/storage/path`
  - Paramètres de requête : `driveId`, `cursor` (les autres champs du schéma de requête sont acceptés).
  - Retour : `{ ok: true, path }`, chemin absolu du dossier.
  - Effet : lecture seule ; délègue à `app.driveBrowser.pathOf`.

- `POST /actions/storage/folders`
  - Corps : `name` requis ; `driveId` et `cursor` facultatifs.
  - Retour : `{ ok: true, folder }`.
  - Effet : crée un dossier via `app.driveBrowser.create` ; vérifie l’origine de la requête.

- Points d’attention :
  - Toutes les routes exigent un utilisateur et un accès de navigation valide (`requireUser`, `resolveStorageAccess`).
  - Les curseurs sont opaques ; le client conserve les noms pour composer le chemin. Les limites de validation sont de 1 000 caractères pour `cursor`, 300 pour `driveId`, 100 pour `search`, 2 000 pour `pageToken` et 200 pour `name`.
  - La création refuse les noms contenant `/` et applique `trim()`.
  - Les erreurs fournisseur sont converties en `502` (`storage_auth_revoked` ou `browse_failed`) sans supprimer la connexion. Les échecs d’accès sont traités par `resolveStorageAccess`.
  - `sharedDrivesMissing` n’est pertinent que si l’installation propose le scope requis ; il signale alors un scope absent de la connexion.
  - Dépendances principales : `app.settings.getActions()`, `app.driveBrowser` et les utilitaires RBAC, d’accès aux connexions, de validation d’origine et de gestion d’erreurs.

### services/api/routes/actions/test.js

- **Rôle du fichier**
  - Gère la route POST `/actions/test` permettant à un utilisateur d’exécuter réellement une action simulée (envoi email ou stockage de fichier) avec un document factice, dans un but de diagnostic. Ce test vérifie le bon fonctionnement des relais, authentifications et accès réels.

- **Fonctions exportées**
  - `actionsTestRoutes(app)`
    - **Paramètres** : 
      - `app` : instance de l’application (serveur Fastify).
    - **Retour** : 
      - Aucune valeur retournée, ajoute une route à l’application.
    - **Effets de bord notables** :
      - Ajoute un endpoint `/actions/test`.
      - Met en place des rate limiters (par compte & IP, arrêtés à l’arrêt du serveur).
      - Exécute réellement le code métier de production via les fonctions partagées `executeEmail` et `executeStore`.
      - Écrit dans les logs de requête via `req.log`.

- **Points d'attention**
  - **Edge cases** :
    - L’utilisateur doit être authentifié (`requireUser`) et être admin pour les tests avec `scope: 'admin'`.
    - Vérifie que la requête provient de la même origine (`isSameOrigin`).
    - Si les limites de rate limit (compte ou IP) sont dépassées, renvoie 429.
    - Validation stricte du corps de la requête via le schéma `actionTestBody`.
    - En cas d’erreur technique (jeton expiré, relais indisponible…), retourne un objet d’erreur explicite.  
  - **Dépendances notables :**
    - Pas de résolution de paramètres ou de construction de messages dans ce fichier : délègue ces tâches à la logique de production (`buildTestDocument`, `executeEmail`, `executeStore` dans `lib/actions/`).
    - Utilisation de helpers pour l’auth, la gestion d’erreurs, le rate limiting et la validation des schémas.
    - N’exécute pas d’action « au nom d’un tiers » : le bouton de test agit toujours « en tant que soi-même » (ou en admin si autorisé).  
    - Attention à maintenir la cohérence avec les routes réelles : ce test délègue à la vraie logique d’action pour garantir que le test reflète le comportement en production.

- **Autres remarques**
  - Toute entorse à la separation explicite des responsabilités (ex : résolution paramètre ou choix de transport local à ce fichier) est interdite et doit être revue.
  - Les informations de retour sont limitées pour éviter l'exposition de données sensibles (par exemple, le chemin de dossier accessible seulement aux admins).

### services/api/routes/admin/index.js

- **Rôle** : regroupe et monte les routes d’administration sous le préfixe `/admin` (généralement `/api/admin`).
- **Fonction exportée — `adminRoutes(app)`**
  - **Paramètre** : `app`, instance Fastify.
  - **Retour** : aucune valeur explicite.
  - **Effet de bord** : appelle `app.register` avec le préfixe `/admin`, puis enregistre les routes utilisateurs, groupes, paramètres, statistiques, « myBrain » et vérifications de configuration.
- **Points d’attention**
  - Les erreurs sont normalisées par le handler racine ; le contrat annoncé reprend celui de `/api/auth` (codes HTTP réels, slug stable et normalisation des erreurs AJV).
  - Dépend des modules `./users.js`, `./groups.js`, `./settings.js`, `./stats.js`, `./myBrain.js` et `./configChecks.js`.

### services/api/routes/admin/settings.js

- **Rôle** : enregistre les routes Fastify de consultation, modification et test des réglages administratifs (authentification, IA, actions, marque, contexte organisationnel et corrections de transcription). Toutes les routes vérifient les droits administrateur.
- **Export**
  - `adminSettingsRoutes(app)` — reçoit l’instance Fastify configurée ; enregistre les routes et ne renvoie pas de valeur utile. Les handlers lisent et modifient `app.settings` et peuvent appeler les fournisseurs externes pour vérifier des clés ou des modèles.
- **Routes principales**
  - `GET/POST /settings/auth` — lit ou met à jour les réglages d’authentification ; refuse la mise à jour si elle ne laisse aucun mode de connexion utilisable.
  - `GET/POST /settings/ai` — expose les réglages publics et les tarifs, ou enregistre les modèles, clés et options IA. Vérifie les clés fournies et la présence de la clé requise par les modèles actifs.
  - `GET/POST /settings/actions` — lit ou enregistre les réglages d’actions ; rejette les variables inconnues dans les gabarits.
  - `GET/POST /settings/branding`, `/settings/org-context`, `/settings/transcript-corrections` — lit ou met à jour ces réglages.
  - `POST /settings/ai/test`, `/settings/ai/test-transcription`, `/settings/ai/test-summary` — vérifie l’accès réel aux clés ou modèles, sans enregistrer de réglage ; les tests de modèles peuvent effectuer un appel fournisseur.
- **Points d’attention**
  - Les projections publiques n’exposent pas les secrets. Pour les champs modifiables, un champ absent signifie généralement « inchangé » ; un champ vide peut rétablir la valeur par défaut ou retirer une clé.
  - Les champs transmis aux dépôts doivent être relayés explicitement : un champ accepté par le schéma mais oublié dans le patch sera ignoré.
  - Les prix IA sont facultatifs : une erreur de tarification est journalisée et renvoie `prices: null`, sans bloquer la configuration.
  - Dépend des schémas de `../auth/schemas.js`, du contrôle d’accès `requireAdmin`, des services de réglages, de tarification et des clients OpenAI/fournisseurs tiers ; les erreurs amont sont converties en erreurs HTTP métier, les autres sont propagées.

### services/api/routes/admin/stats.js
- Enregistre les routes de statistiques réservées aux administrateurs. Les lectures portent sur des volumes et utilisent des projections limitées pour ne pas exposer le contenu des réunions.
- `adminStatsRoutes(app)` — configure les routes sur `app`; ne retourne pas de valeur. Déclare aussi l’estimation des dépenses et l’actualisation des tarifs, sans les exporter séparément.
- Routes enregistrées :
  - `GET /stats` — paramètres de requête validés par `adminStatsQuery` : période (`from`/`to` ou jours), groupe, compte, template. Retourne les statistiques, les filtres et les options disponibles, ainsi que `costs` (`null` si l’estimation échoue). Une période invalide renvoie une erreur 400.
  - `GET /stats/credits` — sans paramètre ; retourne le crédit de temps mensuel des comptes, calculé par `computeTeamCredits`.
  - `POST /stats/account` — corps validé par `adminAccountStatsBody`, notamment l’adresse du compte et une plage facultative. Retourne les statistiques personnelles du compte et son identité ; renvoie 404 si le compte est introuvable.
  - `POST /stats/prices/refresh` — sans paramètre ; actualise les tarifs et le taux de change, puis retourne les éléments actualisés. Renvoie 502 (`prices_unreachable`) si aucun tarif ni taux n’a pu être actualisé.
- Points d’attention :
  - Chaque route applique `requireAdmin` avant son traitement. Les calculs métier sont délégués à `lib/stats.js`, `lib/costs/`, `lib/teamCredits.js` et `lib/personalStats.js`.
  - Les filtres cadrent les statistiques et les dépenses ; leurs options restent indépendantes des filtres appliqués. Un groupe ou compte inconnu peut produire une population vide.
  - L’estimation des coûts est tolérante aux erreurs : elle journalise l’échec et renvoie `null` sans bloquer les statistiques. Elle dépend des réglages IA, des tarifs, des modèles configurés et des comptes ayant désactivé la détection d’actions.
  - L’actualisation des tarifs est mutualisée via `inFlight` : les requêtes simultanées partagent un relevé. Un résultat partiel est enregistré et indique les sources manquantes ; sans mise à jour, le dernier relevé est conservé.

### services/api/routes/admin/users.js

- Enregistre les routes d’administration des utilisateurs. Toutes exigent `requireAdmin` et valident leurs entrées avec les schémas de `../auth/schemas.js`.
- Fonctions exportées :
  - `default adminUsersRoutes(app)` — enregistre les routes sur `app` ; ne retourne pas de valeur utile. Effets de bord : crée, modifie, réinitialise ou supprime des comptes et peut invalider des sessions, jetons et connexions externes.
- Routes enregistrées :
  - `GET /users` — paramètres de requête `q`, `limit`, `skip`, `group` ; retourne le résultat de `app.users.list(...)`.
  - `POST /users/create` — corps avec email, nom, rôle, groupes et options de mot de passe ; retourne `201` avec l’utilisateur public et, si le mot de passe a été généré, `generatedPassword` (une seule fois).
  - `POST /users/update` — corps identifiant l’utilisateur par email et champs à modifier ; retourne `{ user }`. Un changement de rôle peut déplacer l’utilisateur vers le groupe correspondant ; désactivation ou changement de rôle invalide ses sessions.
  - `POST /users/reset-password` — corps avec email et mot de passe facultatif ; retourne `{ user }` et éventuellement `generatedPassword`. Invalide les sessions et purge les jetons de réinitialisation.
  - `POST /users/delete` — corps avec email et `purgeData` facultatif ; retourne `204`. Révoque les connexions externes révocables, supprime connexions, sessions et jetons ; `purgeData` supprime aussi les données personnelles.
- Points d’attention :
  - Les emails sont normalisés pour les recherches. Les mots de passe fournis ou générés sont contrôlés selon la politique puis hachés ; un mot de passe généré n’est renvoyé qu’à la création ou à la réinitialisation.
  - Les groupes inconnus sont refusés (`400 group_not_found`). Un email déjà utilisé, un utilisateur absent, une opération sur soi-même ou la perte du dernier administrateur actif entraînent des erreurs dédiées.
  - La suppression de soi-même est interdite ; `purgeData` est irréversible. La révocation Gmail dépend de `CONNECT_PROVIDERS` et de `app.gmailRevoke`.
  - Dépendances principales : `app.users`, `app.groups`, `app.sessions`, `app.resetTokens`, `app.connections` et les utilitaires d’authentification, de dépôts, de RBAC et d’erreurs importés.

### services/api/routes/ai.js

- Enregistre les routes IA de l’API. Elles exigent une identité via `requireUser` et gardent les clés fournisseurs côté serveur.
- `aiRoutes(app)` — reçoit l’instance Fastify, enregistre les routes `/tempkey`, `/record`, `/actions` et `/refine-transcript`. Retourne implicitement `undefined`. Effet de bord : configure le routeur et maintient un compteur de transcriptions en cours dans le processus.
- `/tempkey` — `GET`, paramètres de requête `lang` et éventuellement `meetingId`. Retourne un jeton éphémère avec le modèle de transcription. Vérifie le quota au démarrage, mais pas pour une réunion reconnue comme active. Appelle OpenAI ou le fournisseur configuré.
- `/record` — `POST`, multipart avec un fichier `data`; paramètres `source=offline` et `lang`. Retourne `{ text }` ou une erreur. Écrit le fichier temporairement sur disque, le découpe si nécessaire, puis le supprime. Limite les requêtes simultanées; le quota ne s’applique pas à `source=offline`.
- `/actions` — `POST`, corps contenant `content`, `actions`, `dismissed` et `language`. Retourne `{ actions }`; renvoie une liste vide si la détection est désactivée. Appelle OpenAI avec les réglages du compte et le contexte organisationnel serveur.
- `/refine-transcript` — `POST`, corps avec `notes` et `sentences`. Retourne `{ sentences }`, en conservant les phrases d’origine si les entrées sont insuffisantes ou la sortie du modèle invalide. Les notes sont limitées à 4 000 caractères et les phrases à 4 éléments de 1 200 caractères.
- Points d’attention :
  - Les refus de quota renvoient `409 quota_exhausted`. Les erreurs fournisseurs sont relayées via `replyUpstreamError`; les fichiers trop volumineux ou trop longs renvoient `413`.
  - `/record` dépend du multipart, du disque temporaire, de `app.audioChunker`, des modèles et fournisseurs configurés. Une tranche en échec fait échouer toute la transcription; les tranches sont traitées au plus trois à la fois.
  - `/tempkey` adapte le format du jeton aux deux formes attendues par le client; celui-ci doit utiliser le modèle renvoyé.
  - Dépendances principales : `requireUser`, `ownerFilter`, quota et réglages de `app`, fournisseurs IA, détection d’actions, prompts et normalisation de langue.

### services/api/routes/auth/index.js

- **Rôle du fichier**
  - Point d'entrée qui agrège et monte les routes d'authentification natives de l'API sous le préfixe `/api/auth`.
  - Interface publique d’authentification, isolée du middleware OIDC grâce à un routeur dédié et au middleware `noident` supprimant l’identité des requêtes en entrée.

- **Fonctions exportées**
  - `authRoutes(app)`
    - **Paramètres** :
      - `app` : instance du serveur (Fastify ou équivalent), sur laquelle on enregistre les routes.
    - **Retour** : aucun (procédure).
    - **Effets de bord** :
      - Enregistre les sous-routes suivantes sur l’application :
        - `loginRoutes(auth)`
        - `sessionRoutes(auth)`
        - `passwordRoutes(auth)`
        - `recoveryRoutes(auth)`
        - `ssoRoutes(auth)`
      - Toutes les routes sont accessibles sous le préfixe `/auth`.
      - Normalise les erreurs via le gestionnaire global (voir `lib/errors.js`).
  - Aucun autre export.

- **Points d'attention**
  - Ces routes étant publiques, il est crucial que le middleware `noident` (supprimant les en-têtes d'identité) soit effectivement appliqué pour éviter l’usurpation d’identité.
  - Format d’erreur strict : véritables codes HTTP + `{ error: '<slug>' }` (attention à la cohérence avec les autres parties de l’API qui peuvent retourner des erreurs différemment).
  - Dépendances sur les modules de routes : `login.js`, `session.js`, `password.js`, `recovery.js`, `sso.js` (chacun implémente diverses logiques d’authentification).
  - L'ordre d’enregistrement des sous-routes peut impacter la gestion des chemins si des routes se recouvrent.
  - Ne pas confondre avec les routes héritées de n8n qui ont un autre contrat d’erreur.

### services/api/routes/auth/login.js

- Enregistre les routes de connexion et de déconnexion par mot de passe.
- **Export par défaut — `loginRoutes(app)`**
  - Paramètre : instance Fastify `app`.
  - Retour : aucun retour explicite.
  - Effets : installe `POST /login` et `POST /logout`, crée deux limiteurs de débit et les arrête à la fermeture de l’application.
- **`POST /login`**
  - Valide le corps avec `loginBody`.
  - Vérifie l’origine et que la connexion par mot de passe est activée, en configuration comme dans les paramètres administratifs.
  - Limite les tentatives par IP et par adresse e-mail normalisée ; en cas de dépassement, répond `429` avec `Retry-After`.
  - Vérifie le mot de passe, crée une session et pose le cookie de session en cas de succès. Retourne l’utilisateur de session.
  - Les échecs d’identifiants répondent uniformément `401 invalid_credentials`. Pour un compte inconnu, désactivé ou sans mot de passe, `burnVerify` réduit les différences de latence.
- **`POST /logout`**
  - Détruit la session si un jeton est présent, efface le cookie et répond toujours `204`, même sans session.
- **Points d’attention**
  - Un échec de connexion ne réinitialise pas les compteurs ; ils sont réinitialisés après authentification réussie.
  - Dépend des modules d’authentification, de cookies, de limitation de débit et de vérification d’origine, ainsi que des dépôts utilisateurs et groupes, des paramètres et des sessions fournis par `app`.

### services/api/routes/auth/password.js

- **Rôle du fichier**
  - Gère la route POST `/change-password` permettant à un utilisateur authentifié de changer son mot de passe.
  - Applique les politiques de sécurité (origine, force du mot de passe, protection brute force).
  - Assure la cohérence des sessions après modification du mot de passe.

- **Fonction exportée**
  - `passwordRoutes(app)`
    - **Paramètres** : 
      - `app` (objet Fastify/Express-like, injectant les services utilisateurs, sessions, config, etc.)
    - **Retour** :
      - `undefined` (enregistre la route sur l'objet `app`).
    - **Effets de bord notables** :
      - Ajoute le endpoint `/change-password` sur l’API.
      - Instancie un rate limiter pour limiter les tentatives de changement de mot de passe par utilisateur.
      - À la fermeture (`onClose`), stoppe le rate limiter.
      - Après changement de mot de passe :
        - Détruit toutes les sessions et tokens de réinitialisation pour l’utilisateur.
        - Recrée une session uniquement pour la requête en cours si l’origine était une session password.
        - Place un nouveau cookie de session.

- **Points d'attention**
  - **Cas particuliers** :
    - Comptes OIDC n’ayant jamais posé de mot de passe : renvoie une erreur explicite (`409 password_not_set`).
    - Si le mot de passe actuel est incorrect (`403 invalid_current_password`).
    - Mot de passe faible ou ne respectant pas la politique : erreur explicite (`400 weak_password`).
    - Trop de tentatives : limitation par utilisateur, retour 429 avec header `retry-after`.
  - **Dépendances** :
    - Validation de l'origine (`isSameOrigin`).
    - Vérification des droits utilisateur via session (`requireUser`).
    - Contrôle et calcul de hash de mot de passe (`hashPassword`, `verifyPassword`, `checkPasswordPolicy`).
    - Gestion avancée des sessions (`app.sessions`, `setSessionCookie`).
    - Rate limiter spécifique au changement de mot de passe (`createRateLimiter`).
  - **Sécurité** :
    - Toutes les sessions de l'utilisateur sont invalidées pour éviter les usages frauduleux après changement de mot de passe.
    - La session en cours est régénérée pour éviter de déconnecter l'utilisateur actif.
    - Gestion stricte de l’origine pour éviter les CSRF.

### services/api/routes/auth/recovery.js

- **Rôle du fichier :**
  - Implémente les routes Fastify pour la gestion de la récupération de mot de passe (envoi d’un lien de réinitialisation et changement de mot de passe via ce lien).
  - S’assure de ne jamais révéler si un email existe ou non dans la base (protection contre l’énumération).

- **Fonction exportée :**
  - `recoveryRoutes(app)`
    - **Paramètre** :  
      - `app` : instance de l’application Fastify (contenant la configuration, les dépendances et les modèles utilisateurs/tokens, etc.).
    - **Retour** :  
      - Aucun retour spécifique (side effects : enregistre deux routes POST sur `app`).
    - **Effets de bord notables** :
      - Ajoute trois rate limiters pour protéger contre le brute force.
      - Nettoie les rate limiters à la fermeture (`onClose`).
      - Envoie des emails de réinitialisation via `app.mailer` (si configuré).
      - Réinitialise vraiment les mots de passe et supprime toutes les sessions actives et tokens de reset lors d’un succès.
      - Utilise et invalide les tokens de reset de façon atomique.

- **Détails routes POST ajoutées :**
  - `/forgot-password`
    - **Paramètres body** : `{ email: string, lang?: string }`
    - **Retour** : 202 `{ ok: true }` (toujours, même si l’adresse est inconnue, désactivée, ou si l’envoi d’email échoue).
    - **Protection** :
      - Vérifie l’origine de la requête (`isSameOrigin`), le taux d’utilisation par IP et email.
      - Jamais d’indication d’existence d’un compte.
  - `/reset-password`
    - **Paramètres body** : `{ token: string, password: string }`
    - **Retour** : 200 (objet `{ ok: true }`) si succès, sinon erreurs 400/403/410/429 selon les cas.
    - **Effets** :
      - Invalide le token utilisé, vérifie la force du nouveau mot de passe.
      - Supprime toutes les sessions et tokens de reset associés à l’email.

- **Points d'attention :**
  - **Edge cases** :
    - Ne jamais divulguer l’existence d’un email, même en cas d’erreur.
    - SMTP en panne ou token invalide : réponse neutre.
    - Utilisation concurrente d’un même token (protection atomique lors de la consommation du token).
  - **Dépendances importantes** :
    - `app.mailer` : doit être configuré/activé pour envoyer les mails.
    - `app.resetTokens`, `app.users`, `app.sessions` : dépendances métier critiques pour l’authentification.
    - Schemas stricts pour la validation du body (`forgotBody`, `resetBody`).
    - Les limiteurs de taux : bonne configuration nécessaire pour l’anti-abus.

### services/api/routes/auth/schemas.js

- **Rôle** : définit les schémas JSON Schema Fastify/Ajv des corps de requête et des paramètres de requête des routes d’authentification, d’administration et de réglages. Ce fichier exporte des objets de schéma, pas des fonctions ; ils ne produisent donc aucun effet de bord à l’import.
- **Exports** :
  - `loginBody`, `forgotBody`, `resetBody`, `changePasswordBody` : corps des routes de connexion, récupération et changement de mot de passe.
  - `adminCreateBody`, `adminUpdateBody`, `adminResetBody`, `adminDeleteBody` : corps de gestion des comptes administrateur.
  - `adminGroupCreateBody`, `adminGroupUpdateBody`, `adminGroupDeleteBody`, `adminGroupMembersBody` : corps de gestion des groupes et de leurs membres.
  - `adminSettingsBody`, `adminAiSettingsBody`, `adminBrandingSettingsBody`, `adminOrgContextSettingsBody`, `adminTranscriptCorrectionsBody`, `adminActionsSettingsBody` : corps des réglages d’installation et d’administration.
  - `userActionDetectionBody`, `userActionDetectionTestBody`, `userActionsSettingsBody` : corps des réglages et tests d’actions propres à l’utilisateur.
  - `adminTranscriptionTestBody`, `adminSummaryModelTestBody`, `actionTestBody` : corps des routes de test de modèles et d’actions.
  - `adminListQuery`, `adminStatsQuery`, `personalStatsQuery` : schémas des paramètres de requête pour les listes et statistiques.
  - `adminAccountStatsBody` : corps de consultation des statistiques d’un compte.
  - Chaque export est un objet JSON Schema consommé par Fastify ; il n’accepte pas de paramètres et n’a pas de valeur de retour d’exécution propre.
- **Points d’attention** :
  - Les objets utilisent généralement `additionalProperties: false` : les champs non déclarés sont refusés. Aucun schéma de réponse n’est défini, afin d’éviter la suppression silencieuse de champs à la sérialisation.
  - Les champs facultatifs des réglages distinguent souvent l’absence (« inchangé ») d’une valeur vide ou `null` (« réinitialiser », « supprimer » ou « illimité » selon le champ). Vérifier le contrat commenté avant de modifier ces schémas.
  - Certaines règles métier sont volontairement vérifiées après la validation de transport ; les limites numériques de détection et de destinataires sont aussi contrôlées à la lecture.
  - Les schémas dépendent de constantes et helpers métier importés sous `services/api/lib` (plafonds, motifs, listes de modèles et valeurs autorisées) : toute évolution de ces contrats doit rester synchronisée.
  - `email` utilise `EMAIL_PATTERN`. Aucun `format: 'email'` n’est utilisé : `ajv-formats` n’est pas installé. Les bornes des mots de passe doivent rester cohérentes avec `MAX_PASSWORD_LENGTH` pour limiter le coût de `scrypt`.

### services/api/routes/auth/session.js

- Enregistre deux routes publiques de sonde, utilisées au démarrage du frontend pour récupérer la configuration de connexion et l’état de la session.
- `sessionRoutes(app)` — paramètre : instance de l’application. Retour : aucune valeur explicite. Effet de bord : enregistre `GET /config` et `GET /session`.
- `GET /config` — aucun paramètre. Retourne les capacités publiques du serveur : options d’authentification, politique de mot de passe, actions, apparence, infographie et URL de feedback et de documentation. Effets de bord : lit les paramètres, actions et branding via `app.settings`.
- `GET /session(req)` — paramètre : requête contenant éventuellement `req.user`. Retourne `{ authenticated: false }` si aucun email utilisateur n’est présent, sinon `{ authenticated: true, user }`, avec les groupes et droits associés. Ne renvoie jamais `401`.
- Points d’attention :
  - `/config` combine configuration d’environnement et réglages administratifs pour déterminer les options affichées; les fournisseurs Google et Entra doivent être utilisables pour être annoncés.
  - Les projections publiques des actions et du branding excluent les données privées.
  - `/session` dépend de `toSessionUser`, des résolveurs du mode et du fournisseur d’authentification, ainsi que de `app.groups` pour les groupes et droits.
  - Dépendances importées : `MIN_PASSWORD_LENGTH`, `toSessionUser`, `isProviderUsable`, `authModeOf`, `authProviderOf`.

### services/api/routes/auth/sso.js

- **Rôle du fichier :**
  - Déclare les routes Express liées à l'authentification SSO (Single Sign-On) pour les fournisseurs Google et Entra sous le préfixe `/api/auth`.
  - Monte les handlers de démarrage/redirection SSO pour chaque fournisseur prenant en compte leurs contraintes spécifiques.

- **Fonction exportée :**
  - `ssoRoutes(app)`
    - **Paramètres :**  
      - `app` : instance de l’application Express (généralement `express()`).
    - **Retour :**  
      - Aucun (side-effect : ajoute les routes à `app`).
    - **Effet de bord notable :**
      - Ajoute dynamiquement 3 routes :
        - Pour Google :
          - `GET <startPath>` : Démarre le flow SSO Google.
          - `GET /google/callback` : Callback du SSO Google.
        - Pour Entra :
          - `GET <startPath>` : Démarre le flow SSO Entra. (Le callback est géré ailleurs.)

- **Points d’attention :**
  - **Edge cases :**
    - Entra : Seule la route de départ est gérée ici. Le callback Entra doit impérativement passer par `/oauth2/callback` (hors `/api`) pour respecter des contraintes d’enregistrement d’URI sur l’App On-Prem.
    - Les chemins sont dépendants de la configuration dans `lib/auth/providers.js` via `PROVIDERS`.
    - Les handlers injectent `app` — attention à la compatibilité contextuelle si Express évolue.
  - **Dépendances :**
    - Nécessite `PROVIDERS` (configuration des providers SSO).
    - Utilise les factories de handlers `createStartHandler`, `createCallbackHandler` depuis `./ssoFlow.js`.  
    - Dépend du respect des chemins/contrats de Google Cloud Console et de la configuration Entra.

### services/api/routes/auth/ssoFlow.js
- Gère le flux OIDC partagé : démarre l’authentification auprès d’un fournisseur, traite son callback et ouvre une session native. Les réponses sont des redirections, jamais du JSON.
- `createStartHandler(app, provider)` — retourne un handler Fastify de démarrage. Limite les tentatives par IP, vérifie que le fournisseur est utilisable, découvre ses endpoints, puis lance le flux OIDC et redirige vers l’IdP. Effets de bord : crée un cookie d’état et enregistre l’arrêt du rate limiter à la fermeture de l’application.
- `createCallbackHandler(app, provider)` — retourne un handler Fastify de callback. Vérifie et consomme l’état, échange le code contre un profil, retrouve ou crée le compte, puis crée une session et pose le cookie `mybrief_sess`. Redirige vers la destination validée (`pending.next`) ou vers `/signin?error=…` en cas d’échec.
- Points d’attention :
  - La création de compte est réservée aux adresses dont le domaine figure dans `settings.allowedDomains`. Un compte désactivé trouvé sous l’une des adresses du profil bloque la connexion.
  - Les adresses sont examinées dans l’ordre fourni par `provider.emailsOf`; un compte existant est privilégié. Le fournisseur et la photo du profil peuvent être mis à jour à la connexion.
  - `safeNext` valide la destination au démarrage puis au callback. La destination est conservée dans l’état en attente, pas transmise à l’IdP.
  - Dépend des utilitaires OAuth, des cookies, du rate limiter, de la configuration et des dépôts utilisateurs/sessions ; les slugs d’erreur et l’extraction du profil dépendent de `provider`.

### services/api/routes/connect.js
- Orchestre la connexion OAuth des comptes externes : démarrage du consentement, traitement du callback, consultation de l’état et déconnexion. Le fournisseur est choisi par la configuration de l’installation.
- **Fonctions exportées**
  - `createConnectCallback(app, provider, { resolveUser? } = {})` — retourne un handler Fastify asynchrone. Vérifie le state, échange le code OAuth, rattache et enregistre la connexion, puis redirige vers l’application web ou native. Effets notables : peut révoquer un jeton chez le fournisseur et écrit la connexion en base.
  - `default connectRoutes(app)` — enregistre les routes Fastify ; ne retourne pas de valeur utile.
- **Routes enregistrées**
  - `GET /connect/status` — requiert un utilisateur ; retourne l’état de la connexion, les actions activées, la disponibilité SMTP, le compte et `driveReady`.
  - `POST /connect/mobile/ticket` — requiert un utilisateur et une origine valide ; retourne un billet à usage unique pour démarrer le flux depuis l’application native.
  - `GET /connect/start` — démarre OAuth depuis une session web ou un billet natif valide ; redirige vers le fournisseur.
  - `GET` sur le callback Google — vérifie le state et traite le retour OAuth. Le callback Microsoft est monté séparément par `routes/oauth2.js`.
  - `POST /connect/disconnect` — requiert une origine valide et un utilisateur ; tente la révocation, supprime les connexions et retourne `{ ok: true }`.
- **Points d’attention**
  - Les démarrages et callbacks sont des navigations avec redirections, pas des réponses JSON. Les erreurs web reviennent à `/?connectError=<slug>#config` ; les flux natifs utilisent `mybrief://auth/connect`.
  - Le callback rattache la connexion au compte inscrit dans le state, et non à la session courante. Une session présente est toutefois vérifiée ; `resolveUser` permet de résoudre l’identité pour les callbacks hors `authPlugin`.
  - Sans refresh token, la connexion n’est pas enregistrée et une révocation est tentée. Les scopes enregistrés sont ceux effectivement accordés ; `driveReady` dépend du scope Drive requis.
  - La révocation dépend du fournisseur (`provider.revocable`) et reste un meilleur effort. Un changement de compte peut entraîner la révocation de l’ancien jeton.
  - Dépend de `oauthFlow`, `connections` et `connections/providers.js`, des dépôts `app.connections` / `app.oauthStates`, des paramètres et credentials OAuth, et du rate limiter. Le billet natif expire et ne peut être consommé qu’une fois.

### services/api/routes/core.js

- Enregistre les routes cœur `/init`, `/ping` et `/logout` sur `app`.
- `coreRoutes(app)` — paramètre : instance Fastify enrichie (`db`, `users`, `groups`, `quota`, `sessions`, `config`) ; retour : aucun. Effet de bord : déclare les trois routes.

- `GET /init` — exige une identité via `requireEmail(req, reply)` ; sans email, arrête le traitement. Normalise l’email, puis fait un upsert partiel du compte servi : met à jour les dates et l’email normalisé, et recopie éventuellement la photo OIDC ; les valeurs initiales ne sont définies qu’à la création. Relit le compte et renvoie l’identité, le mode et le fournisseur d’authentification, la photo, les groupes, les droits, le quota et `lastConnecion`.
- `GET /ping` — ne prend aucun paramètre ; renvoie `{ ok: true }`. Sert de sonde de vivacité.
- `POST /logout` — paramètres : `req`, `reply` ; retour : réponse HTTP `204`. Si une session native est présente, la détruit et efface le cookie de session.

- Points d’attention :
  - `/init` préserve les champs non modifiés, notamment `passwordHash`, `role` et les noms définis par l’administration ; ne pas remplacer l’upsert par un remplacement de document.
  - `lastConnecion` est une faute historique conservée comme nom de champ.
  - Le filtre d’upsert utilise `SERVED_ACCOUNT` pour viser le compte servi et éviter les conflits avec les doublons inertes ; `normalizeEmail` et `DEFAULT_GROUP_ID` viennent des repositories.
  - Les réponses de `/init` dépendent aussi de `app.users`, `app.groups` et `app.quota`, ainsi que de `authModeOf` et `authProviderOf`.
  - `/logout` ne détruit une session que si `req.user.sessionToken` existe ; l’effacement du cookie utilise `app.config.cookieSecure`.
  - Dépendances d’identité et de session : `requireEmail`, `clearSessionCookie` ; `/ping` ne dépend d’aucune identité.

### services/api/routes/meetings.js

- **Rôle** : enregistre les routes Fastify liées aux réunions : génération et historique des résumés, versions, transcription, notes/actions, titres, tags et infographies. Les accès Mongo sont filtrés par email propriétaire.
- **Fonction exportée — `meetingsRoutes(app)`**
  - **Paramètre** : `app`, instance Fastify enrichie des dépendances applicatives.
  - **Retour** : aucun retour explicite ; enregistre les routes sur `app`.
  - **Effets de bord** : appels à MongoDB, aux modèles IA et aux services de quota, groupes, infographies et MyBrain ; certains traitements (titres, infographies, alimentation MyBrain) sont lancés en arrière-plan.
- **Routes enregistrées** :
  - `POST /resume` : génère le résumé, vérifie éventuellement sa longueur, puis le persiste avant de répondre ; titre et infographie peuvent être générés en arrière-plan.
  - `GET /history` : renvoie l’historique du demandeur, ordonné selon la date affichée.
  - `POST /history/start`, `/history/stop`, `/history/delete` : crée un brouillon, clôt ou supprime une réunion.
  - `POST /history/notes-actions`, `/history/title`, `/history/rename`, `/history/tag` : modifie notes/actions, génère ou renomme un titre, ou affecte un tag.
  - `POST /versions/add`, `/versions/delete`, `/versions/update` : gère les versions de résumé et leur HTML.
  - `POST /transcription/update` : sauvegarde la transcription et son nombre de caractères.
  - `GET /infographic`, `POST /infographic/regenerate`, `/infographic/delete` : consulte, régénère ou supprime l’infographie.
- **Points d’attention** :
  - Les routes exigent une identité email (`requireEmail`) et doivent conserver le filtrage propriétaire (`ownerFilter`, `ownerFields`) pour toute lecture ou écriture.
  - Les routes sans schéma valident notamment les identifiants avec `idOf`, qui accepte uniquement les chaînes afin d’éviter l’injection d’opérateurs Mongo.
  - `/resume` ne répond avec succès qu’après persistance ; le titre est asynchrone. La durée privilégie celle du chronomètre, puis celle déduite du résumé.
  - `/history/start` est idempotente et crée un brouillon ; `/history/stop` peut le supprimer s’il est strictement vide. Une durée nulle ne remplace pas une durée existante.
  - Les versions sont ajoutées de façon idempotente si leur identifiant existe ; plusieurs opérations de mise à jour/suppression répondent `{ ok: true }` même si aucun document n’a été modifié.
  - L’accès à l’infographie dépend à la fois du réglage global et des droits du groupe, relus à chaque demande. Les images sont stockées dans une collection séparée.
  - Dépendances principales : `app.db`, `app.openai`, `app.settings`, `app.groups`, `app.users`, `app.quota`, `app.background`, ainsi que les modules `identity`, `ownerScope`, `summaryModels`, `pageTarget`, `meetingDuration`, `notesActions`, `infographic` et `myBrain`.

### services/api/routes/mobileAuth.js

- **Rôle** : enregistre le flux d’authentification mobile Capacitor, monté à la racine : émission d’un OTT lié à un challenge PKCE, échange contre un JWT mobile, puis vérification du JWT pour Traefik ForwardAuth.
- **Export nommé `MOBILE_START_PATH`, `MOBILE_EXCHANGE_PATH`, `MOBILE_VERIFY_PATH`** : constantes contenant respectivement `/auth/mobile/start`, `/auth/mobile/exchange` et `/auth/verify`.
- **Export par défaut `mobileAuthRoutes(app)`** : reçoit l’instance Fastify et enregistre les trois routes. Retourne implicitement `undefined`. Crée le magasin d’OTT et deux limiteurs de débit, arrêtés via le hook `onClose`.
  - `GET /auth/mobile/start?cc=…` : valide le challenge, limite les requêtes par IP, résout l’identité, puis émet un OTT à usage unique et une page de retour vers l’application. Sans identité, redirige vers `/signin`; si le secret JWT est absent ou inutilisable, répond `503`.
  - `POST /auth/mobile/exchange` : reçoit `{ ott, verifier }`, consomme et vérifie l’OTT et le verifier, puis renvoie un JWT et les informations utilisateur. Peut répondre `503`, `429` ou `401`. Le corps est limité à 4 Ko.
  - `GET /auth/verify` : valide le Bearer JWT et renvoie `401` en cas d’absence ou d’invalidité; sinon répond `{ ok: true }` avec les quatre en-têtes d’identité attendus par ForwardAuth.
- **Points d’attention** :
  - La route `start` doit passer par un middleware Traefik qui établit l’identité (`oidc` ou `noident`) ; aucune OTT n’est émise sans identité résolue.
  - La configuration `app.config.mobile` fournit le secret, les durées et l’URL de callback. Le flux est désactivé si le secret n’est pas utilisable.
  - Dépend des modules d’authentification locaux (résolution d’identité, sessions, OTT/PKCE, JWT, limitation de débit), ainsi que de Traefik ForwardAuth pour la vérification et la propagation des en-têtes.
  - Les réponses HTML sont sans cache; les valeurs injectées dans la page de callback sont échappées pour HTML et JavaScript.

### services/api/routes/oauth2.js

- **Rôle du fichier :**
  - Définit une route unique `/oauth2/callback` pour gérer les callbacks OAuth2, utilisée à la fois pour :
    - L’authentification “login” via Microsoft Entra.
    - La connexion (“connect”) à des services Microsoft (OneDrive, email), dans le cadre d’un compte déjà identifié.
  - Permet de distinguer les deux flux au moyen du paramètre `state`, sans consommer ce dernier (gestion single-use différée au handler concerné).

- **Fonction exportée :**
  - `oauth2Routes(app)`
    - **Paramètre :**
      - `app` : instance principale de l’application Fastify (ou Express-like), contenant contextes, users, sessions, etc.
    - **Retour :**
      - Aucun (side-effect : enregistre une route GET sur le chemin callbackPath).
    - **Effets de bord notables :**
      - Ajoute une route GET sur le chemin provider (`PROVIDERS.entra.callbackPath`, généralement `/oauth2/callback`).
      - Délègue le traitement à un handler "login" ou "connect" selon la nature du `state`.
      - `connect` effectue une résolution d’identité manuelle via `resolveIdentity`.
      - Ne passe pas par le middleware d’auth standard (exigence d’un contexte routeur Traefik `noident`).

- **Points d’attention et edge cases :**
  - **State inconnu, expiré ou déjà utilisé** : redirigé vers le flux “login”, l’utilisateur sera renvoyé à l’écran de connexion avec un message.
  - **Dépendances** :
    - Requiert que Traefik/proxy configure la route `/oauth2/callback` sans middleware d’authentification standard (middleware `noident` obligatoire pour éviter les problèmes d’usurpation d’identité).
    - Dépend des modules internes `PROVIDERS`, `CONNECT_PROVIDERS`, `createCallbackHandler`, `createConnectCallback`, `resolveIdentity` et du mécanisme `app.oauthStates`.
  - **Attention** : Le chemin `/oauth2/callback` NE DOIT PAS être modifié, car il est enregistré dans l’infrastructure Entra de multiples installations clients et incompatible avec un changement de callback en production.  
  - Les handlers doivent garantir que le paramètre `state` n'est consommé qu'une seule fois.
  - Cette route est montée à la racine, hors du préfixe `/api`.

### services/api/routes/tags.js

- Définit les routes API des tags de conversation, propres à chaque utilisateur. Un tag est un classeur : chaque conversation peut en porter au plus un.
- Exports :
  - `TAGS_COLLECTION` — nom de la collection MongoDB (`userTags`).
  - `TAG_COLORS` — palette de couleurs admises, incluant les motifs.
  - `TAG_HUE_LIGHTNESS` — bornes et valeur par défaut de clarté des couleurs libres.
  - `TAG_SHAPES` — formes de pastille admises.
  - `TAG_LABEL_MAX` — longueur maximale d’un libellé (`32`).
  - `USER_TAGS_MAX` — nombre maximal de tags par utilisateur (`20`).
  - `isTagColor(color)` — indique si `color` est un slug de palette valide ou une couleur libre conforme ; aucun effet de bord.
  - `default(app)` — enregistre les routes Fastify sur `app` ; ne renvoie pas de valeur métier.
- Routes enregistrées :
  - `GET /tags` — exige une identité utilisateur ; renvoie ses tags triés par libellé et le vocabulaire de validation (`colors`, `shapes`, `hueLightness`, `max`). Lecture de la collection `userTags`.
  - `POST /tags/save` — reçoit `{ id?, label, color, shape? }` ; crée un tag ou remplace ses champs modifiables si `id` est fourni. Renvoie `{ tag }`. Refuse les libellés vides ou trop longs, les couleurs/formes invalides, les doublons insensibles à la casse et aux espaces, les tags inconnus (404) et le dépassement du quota (409). La forme absente vaut `circle`.
  - `POST /tags/delete` — reçoit `{ id }` ; supprime le tag et retire son `tagId` des conversations de l’utilisateur. Renvoie `{ ok: true, untagged }`, où `untagged` est le nombre de conversations modifiées.
- Points d’attention :
  - Toutes les opérations sont limitées à l’utilisateur authentifié (`requireEmail`, `ownerFilter`, `ownerFields`). Les erreurs utilisent `fail` et de vrais codes HTTP ; les schémas Fastify rejettent les corps invalides.
  - Une couleur libre suit `hue-<angle>` ou `hue-<angle>-<clarté>` : angle entier de 0 à 359, clarté de 35 à 68. Palette et formes doivent rester synchronisées avec les jetons de rendu frontend.
  - La suppression détague les conversations avant de supprimer le tag ; un échec de la seconde écriture peut laisser un tag orphelin, mais pas de références pendantes.
  - Dépendances : MongoDB via `app.db`, `node:crypto` (`randomUUID`), `lib/identity.js`, `lib/ownerScope.js` et `lib/errors.js`.

### services/api/routes/templates.js

- Enregistre les routes des templates partagés, des templates propres à chaque utilisateur et de la configuration utilisateur. Les données sont stockées dans les collections MongoDB `templates`, `userTemplates` et `userConfig`.
- `templatesRoutes(app)` — reçoit l’instance Fastify ; enregistre les routes. Les handlers retournent des objets JSON et écrivent en base. Pas de valeur de retour documentée.

- **Templates partagés**
  - `GET /templates` — paramètres : requête authentifiée ; retourne `{ templates, orgContext, transcriptCorrections }`. Les templates sont lisibles par tout compte authentifié. Les données d’organisation et les corrections de transcription sont converties en formes publiques via `app.settings`.
  - `POST /templates/save` — paramètres : corps `{ value, icon, labels, prompt, pageMeter }` ; retourne `{ ok: true }` ou une erreur. Réservé aux administrateurs (`requireAdmin`). Remplace le template de même `value` par suppression puis insertion ; `value` vide donne HTTP 400.
  - `POST /templates/delete` — paramètres : corps `{ value }` ; retourne `{ ok: true }` ou une erreur. Réservé aux administrateurs ; supprime les templates correspondant à `value`. Une valeur absente ou non textuelle donne HTTP 400.

- **Templates utilisateur**
  - `GET /user-templates` — paramètres : requête authentifiée ; retourne `{ templates }`, filtrés au propriétaire.
  - `POST /user-templates/save` — paramètres : corps `{ value, icon, labels, prompt, pageMeter }` ; retourne `{ ok: true }` ou `{ ok: false, error, … }`. Crée ou remplace un template du propriétaire ; limite de 5, hors mise à jour d’un template existant. `value` doit être non vide et correspondre à `/^[a-z0-9-_]+$/i`.
  - `POST /user-templates/delete` — paramètres : corps `{ value }` ; retourne `{ ok: true }` ou `{ ok: false, error }`. Supprime uniquement le template du propriétaire.

- **Configuration utilisateur**
  - `GET /user-config` — paramètres : requête authentifiée ; retourne `{ context }`, chaîne vide si aucune configuration valide n’existe.
  - `POST /user-config/save` — paramètres : corps `{ context }` ; retourne `{ ok: true }`. Convertit les valeurs non textuelles en chaîne vide, tronque à 4 000 caractères et remplace la configuration du propriétaire.

- **Points d’attention**
  - Les routes utilisateur exigent un email (`requireEmail`) et isolent les données via `ownerFilter` / `ownerFields`. Les routes partagées en écriture exigent `requireAdmin`.
  - Les erreurs de validation des routes utilisateur sont renvoyées avec HTTP 200 et `{ ok: false, error }` ; les routes admin utilisent HTTP 400 pour les champs requis manquants. Le frontend dépend de cette distinction.
  - `pageMeterField` n’écrit `pageMeter` que si `normalizePages` accepte la valeur ; comme le document est remplacé, une valeur absente ou invalide retire le champ.
  - Les opérations de remplacement font un `deleteMany` suivi d’un `insertOne`, sans transaction apparente. `TEMPLATE_FIELDS` exclut `_id` des réponses.
  - Dépendances : MongoDB via `app.db`, paramètres via `app.settings`, et utilitaires `identity.js`, `ownerScope.js`, `rbac.js`, `pageMeter.js`.

### services/api/server.js

- **Rôle** : point d’entrée du service API. Charge la configuration, connecte MongoDB, exécute le bootstrap, construit l’application et démarre l’écoute HTTP.
- **Fonctions exportées** : aucune.
- **Effets de bord** : lit `process.env`, ouvre une connexion MongoDB, initialise les index/migrations et le compte admin, crée le mailer et le client OpenAI, démarre la boucle de reprise myBrain et écoute sur `0.0.0.0`. À `SIGTERM` ou `SIGINT`, arrête la boucle, ferme l’application, attend les travaux de fond puis ferme MongoDB.
- **Points d’attention** :
  - `MONGO_URL` est requis ; son absence ou un échec du bootstrap arrête le processus (`process.exit(1)`).
  - Sans clé OpenAI, le service démarre tout de même ; les fonctions IA répondent `503`. La clé enregistrée dans les paramètres est résolue à chaque appel et prime sur `OPENAI_API_KEY`.
  - `MONGO_DB` et `PORT` ont leurs valeurs par défaut dans `loadConfig` ; les autres paramètres sont centralisés dans `lib/config.js`.
  - Dépend de MongoDB, de `buildApp`, du bootstrap, des modules de configuration, d’authentification indirecte et de mail, ainsi que du flux myBrain. Le service est prévu pour les réseaux Docker internes, derrière Traefik.

### services/api/vitest.config.js

- **Rôle** :  
  Définit une configuration locale pour Vitest dans `services/api`, afin de pouvoir lancer les tests via `npm test` sans s’appuyer sur la configuration racine du monorepo (qui pourrait inclure des environnements inadaptés, ex : `dom`).

- **Fonctions exportées** :  
  - Fonction **par défaut** :  
    - Nom : *anonyme* (export default)
    - Paramètre(s) : aucun (appelle `defineConfig` avec un objet)
    - Retour : objet de configuration pour Vitest spécifiant :
      - `environment: "node"`
      - `include: ["test/**/*.test.js"]`
    - Effet de bord : aucun effet de bord.

- **Points d’attention** :
  - Cette config surcharge la racine pour éviter d’exécuter les tests dans un environnement DOM, qui provoquerait des erreurs dans le contexte Node.
  - Utilisation obligatoire lorsque des tests Node purs doivent être lancés sans pollution de la config globale du monorepo.
  - Dépendance explicite à `vitest/config` (assurer sa disponibilité dans le projet).
  - Seuls les fichiers de test sous `test/**/*.test.js` sont inclus.

### services/api/lib/actionDetection.js

- Point d’entrée unique de la détection d’actions, partagé par la route `POST /api/actions` et le banc d’essai d’administration. Les deux utilisent la même consigne ; seuls les réglages fournis diffèrent.
- **`runActionDetection({ openai, model, content, actions, dismissed, language, settings })`** — fonction asynchrone ; `actions`, `dismissed`, `language` et `settings` sont facultatifs, avec `settings = {}` par défaut. Construit la consigne via `actionsPrompt`, appelle `openai.chat` avec le modèle et `reasoningEffort: 'medium'`, puis renvoie une promesse résolue en `{ actions, prompt }`. Le prompt retourné est celui envoyé au modèle.
- **Effet notable :** effectue un appel au client OpenAI fourni ; ne modifie pas directement les actions en entrée.
- **Points d’attention :** `language` est destiné à la langue de l’interface/du compte rendu, avec repli sur le français géré par la construction du prompt. Le résultat des actions dépend de `parseActionsOutput`. Dépend de `./prompts.js` (`actionsPrompt`, `parseActionsOutput`) et de l’interface `openai.chat`.

### services/api/lib/actionDetectionSettings.js

- Centralise les constantes, valeurs par défaut et fonctions de normalisation des réglages de détection d’actions propres à chaque utilisateur.
- Exports :
  - `DETECTION_SENSITIVITIES`, `DETECTION_WINDOW_MIN/MAX`, `DETECTION_INTERVAL_MIN/MAX`, `DETECTION_TRIGGER_WORDS_MAX`, `DETECTION_TRIGGER_WORD_MAX` : valeurs de référence pour les sensibilités et les bornes.
  - `DEFAULT_ACTION_DETECTION` : réglages par défaut (`enabled: true`, sensibilité `explicit`, mot déclencheur `action`, fenêtre de 8 phrases, minimum de 1 phrase).
  - `normalizeTriggerWords(words, fallback)` : retourne une liste de mots nettoyés, dédoublonnés et bornés ; si `words` vaut `undefined`, retourne `fallback`. Ne modifie pas les arguments.
  - `normalizeActionDetection(doc)` : prend un document partiel ou absent et retourne l’ensemble des réglages normalisés ; ne modifie pas le document.
  - `mergeActionDetectionPatch(current, patch = {})` : applique les champs présents d’un patch et retourne un nouvel objet ; ne modifie pas `current`. Une sensibilité inconnue déclenche une erreur.
- Points d’attention :
  - Les valeurs numériques sont arrondies puis bornées, y compris à la lecture ; les valeurs non numériques ou non finies prennent le repli prévu.
  - `enabled` et `allowUpdates` sont `false` uniquement si leur valeur est strictement `false` lors de la normalisation ; dans un patch, elles sont converties en booléens.
  - Une liste de mots vide dans un patch rétablit `['action']`, tandis que `undefined` signifie « ne pas modifier » dans le patch et « utiliser le repli » dans la normalisation.
  - Les mots déclencheurs sont limités à 20 entrées de 40 caractères ; les doublons sont supprimés selon la casse exacte.
  - Le vocabulaire de l’organisation n’est pas géré ici ; aucune dépendance externe.

### services/api/routes/actions/detection.js

- Enregistre les routes Fastify de lecture, mise à jour et test des réglages personnels de détection d’actions.
- **Export par défaut — `actionsDetectionRoutes(app)`**
  - **Paramètre :** instance Fastify configurée.
  - **Retour :** aucun retour explicite ; enregistre les routes et des hooks.
  - **Effets de bord :** crée deux limiteurs de débit et les arrête à la fermeture de l’application.

- **Routes enregistrées :**
  - `GET /actions/detection` — exige un utilisateur authentifié ; retourne `{ settings }` avec ses réglages.
  - `POST /actions/detection` — valide le corps avec `userActionDetectionBody`, vérifie l’origine et met à jour les réglages de l’utilisateur ; retourne `{ settings }`.
  - `POST /actions/detection/test` — valide le corps avec `userActionDetectionTestBody`, vérifie l’origine et applique des limites par compte et par IP. Teste le contenu avec les réglages affichés fusionnés aux réglages enregistrés ; retourne `{ ok, actions, prompt, model }`. Le test ne sauvegarde pas les réglages.

- **Points d’attention :**
  - Les routes exigent un utilisateur ; les écritures et le test rejettent une origine non conforme (`403`). Les requêtes sans `Origin` restent tolérées selon `isSameOrigin`.
  - Le test rejette un contenu vide (`400`) et renvoie `429` si l’un des deux quotas est dépassé.
  - Le contexte métier provient du serveur ; la langue du test est fournie par la requête, avec repli français dans `runActionDetection`.
  - Les erreurs de réglages invalides et les erreurs amont sont converties en réponses `400`. Les autres erreurs sont propagées.
  - Dépend de `runActionDetection`, `mergeActionDetectionPatch`, des schémas de `../auth/schemas.js`, du stockage `app.userActions`, et des configurations OpenAI, limites de débit et contexte d’organisation.

### services/api/lib/audioChunks.js

- Décode les métadonnées audio et, si nécessaire, découpe les fichiers longs en tranches égales d’au plus 300 s, sans réencodage, pour `/record`.
- **Exports**
  - `CHUNK_MAX_SECONDS` — constante `300` (secondes), durée maximale visée par tranche.
  - `createAudioChunker({ ffmpeg, ffprobe, log, run })` — crée un découpeur configurable ; retourne un objet avec `split(path)`.
  - `split(path)` — retourne une promesse de `{ paths, cleanup }`. `paths` contient les fichiers dans l’ordre ; `cleanup()` supprime les tranches temporaires, jamais le fichier source. Pour les fichiers jusqu’à 315 s inclus, ou si la sonde échoue, retourne le fichier source sans nettoyage.
- **Effets de bord** — lance `ffprobe` et `ffmpeg` sans shell ; crée un répertoire temporaire pour les tranches et le supprime via `cleanup` ou après un échec. Émet des avertissements et une information facultative via `log`.
- **Points d’attention**
  - Sans `ffmpeg`/`ffprobe`, si le format est illisible, ou si la découpe échoue, le fichier entier est transmis : un import long peut alors être refusé ou tronqué.
  - Formats acceptés limités à ceux de `EXTENSIONS` ; les entrées sont restreintes au protocole `file` et à cette liste pour réduire les risques de lecture de fichiers ou d’URL externes.
  - Les processus sont arrêtés après 60 s. `run` est injectable pour les tests.

### services/api/lib/configChecks.js

- Fournit les diagnostics de configuration destinés aux pastilles de l’interface. Chaque constat indique une section, un code stable, un niveau (`error`, `warning`, `tip`) et, au besoin, des variables. Les textes sont traduits côté interface ; ce fichier ne produit pas de phrases.
- Exporte :
  - `CHECK_LEVELS` : ordre des niveaux, du plus grave au plus léger.
  - `CHECK_TTL_MS`, `CHECK_FAILURE_TTL_MS`, `PROBE_BUDGET_MS`, `PRICES_STALE_DAYS` : durées de cache, budget des sondes et seuil d’ancienneté des tarifs.
  - `createVerdictCache({ now?, maxEntries? })` : crée un cache borné de verdicts ; retourne un objet avec `remember(key, probe)`, qui partage les sondes en cours et mémorise leur résultat. Les échecs expirent plus tôt que les succès. Une sonde qui lève n’est pas mémorisée.
  - `organizationChecks(app, { cache, budgetMs?, now? })` : retourne une promesse de constats pour l’organisation (clés et fournisseurs IA, actions, identifiants OAuth, MyBrain, tarifs, identité). Interroge les réglages et peut sonder les services externes. Les sondes dépassant le budget sont omises de la réponse, mais continuent en arrière-plan.
  - `accountChecks(app, user, { cache, budgetMs? })` : retourne une promesse de constats pour le compte (`user.email`, `user.emailLower`) concernant la connexion et les destinations de dépôt personnelles ou par tag. Sonde le Drive en lecture seule ; les résultats hors budget sont omis.
- Points d’attention :
  - Les diagnostics d’organisation et de compte sont séparés : les premiers concernent l’administration, les seconds le titulaire du compte.
  - Les clés de cache utilisent des empreintes SHA-256 tronquées, jamais les secrets en clair. Le changement de clé, jeton ou destination produit une entrée distincte.
  - Seuls certains échecs de configuration deviennent des alertes ; les pannes transitoires ne doivent pas être présentées comme des problèmes à corriger.
  - `accountChecks` reste silencieuse si le stockage n’est pas activé, si aucune destination utile n’est configurée ou si les identifiants OAuth d’organisation manquent. Les dossiers de tags supprimés sont ignorés.
  - Dépend des services Fastify (`settings`, `connections`, `driveBrowser`, `myBrain`, `pricing`, etc.) et des helpers locaux pour les fournisseurs, tarifs, actions, permissions et portée utilisateur.

### services/api/lib/costs/assumptions.js

- **Rôle** : centralise les hypothèses utilisées pour estimer les coûts à partir des volumes mesurés. Ces estimations ne sont pas des factures ; certaines consommations ne sont pas suivies par la base.
- **Export** : `ASSUMPTIONS` — objet figé (`Object.freeze`), sans paramètres. Fournit les constantes de conversion et de volume estimé pour les résumés, titres, détection d’actions et infographies. Aucun effet de bord notable.
- **Points d’attention** :
  - Les jetons produits et le rythme de détection sont des hypothèses à recaler avec des factures OpenAI ; les consignes sont mesurées à partir de prompts du dépôt.
  - `charsPerToken` et `speechCharsPerSecond` sont des valeurs de repli ; le débit réel d’une installation peut être utilisé ailleurs.
  - Le coût estimé exclut notamment l’import audio, certaines relectures et essais d’administration. En visio, deux flux audio peuvent porter la transcription jusqu’au double.
  - Dépend de `../prompts.js` et `../actionDetectionSettings.js` : les longueurs de consignes et la fenêtre de détection sont calculées à l’import, selon ces valeurs.

### services/api/lib/costs/catalog.js

- Fournit le catalogue intégré de tarifs et de caractéristiques des modèles, utilisé avant actualisation et en repli pour les modèles inconnus des sources en ligne. Les montants sont en dollars.
- Exports :
  - `CATALOG_CHECKED_AT` : date du relevé intégré (`YYYY-MM-DD`).
  - `PRICE_FIELDS` : noms des champs tarifaires remplacés lors d’une actualisation.
  - `MODEL_KINDS` : familles de modèles (`audio`, `text`, `image`).
  - `PRICE_CATALOG` : objet indexé par identifiant de modèle ; chaque entrée indique `provider`, `kind` et les tarifs applicables. `imageTokens` est une caractéristique conservée lors d’une actualisation.
  - `FX_FALLBACK` : taux de conversion USD→EUR de repli, avec date et source ; remplacé par le taux BCE après une actualisation réussie.
- Effet de bord : aucun ; le fichier exporte des constantes de données.
- Points d’attention :
  - Les champs tarifaires et `imageTokens` n’ont pas le même cycle de mise à jour ; `imageTokens` est une estimation documentée, non publiée dans les grilles.
  - Les unités varient selon le champ : prix par minute audio, million de jetons ou image. AssemblyAI facture la durée de session, silences compris.
  - Les tarifs et modèles sont maintenus dans ce catalogue ; les sources en ligne, notamment LiteLLM, sont gérées par `refresh.js` et `sources/`.
  - La conversion en euros utilise le taux de repli puis le taux BCE ; les dépendances de calcul associées sont `estimate.js` (compteurs) et `refresh.js` (actualisation).

### services/api/lib/costs/estimate.js
- Estime les dépenses d’IA à partir des volumes d’usage, des tarifs et d’hypothèses de consommation. Déclare les compteurs (`METERS`) et les postes de coût (`COST_LINES`), puis produit des montants en EUR. Le calcul est conçu comme pur : pas d’écriture ni d’appel réseau.
- Exports :
  - `DAYS_PER_MONTH` — durée moyenne d’un mois en jours (`365,25 / 12`).
  - `METERS` — associe chaque unité de consommation à son champ de tarif et à son diviseur.
  - `COST_LINES` — postes configurés (transcription, résumés, infographies, assistants) ; décrit leurs modèles, unités, volumes et tirages. Les fonctions de comptage et de tirage n’ont pas d’effet de bord.
  - `activeModels(aiDoc = {}, envModels = {})` — résout les modèles actifs depuis les réglages d’administration, l’environnement ou les valeurs par défaut ; retourne les identifiants des modèles. Aucun effet de bord.
  - `modelsToPrice(models)` — retourne les modèles du catalogue, les modèles actifs et ceux proposés dans l’interface, sous forme `{ id, provider }`. Aucun effet de bord.
  - `spanDaysOf({ from, to, firstMeetingAt })` — retourne la durée en jours entre les dates, limitée à la date de première réunion et avec un minimum d’un jour. Aucun effet de bord.
  - `priceDraw(draw, price)` — retourne le coût d’un tirage en USD, ou `null` si une quantité non nulle n’a pas de tarif fini. Aucun effet de bord.
  - `estimateCosts({ usage, models, pricing, spanDays, assumptions = ASSUMPTIONS })` — retourne le détail des coûts en EUR (période, mensualisation, par heure, par réunion, postes, alternatives, modèles sans tarif et hypothèses). Aucun effet de bord.
  - `referencePrices(lineId, { models, pricing, assumptions = ASSUMPTIONS })` — retourne le prix unitaire estimé sur une réunion type pour les modèles proposés d’un poste sélectionnable ; `[]` si le poste n’existe pas ou n’a pas de choix. Aucun effet de bord.
- Points d’attention :
  - Un tarif manquant n’est pas assimilé à zéro : le tirage est exclu du coût et signalé dans `unpriced` ; `referencePrices` renvoie alors `unitEur: null`.
  - Les quantités nulles ou falsy sont ignorées par `priceDraw`. Les tarifs au jeton sont ramenés au million via `METERS`.
  - La mensualisation utilise `DAYS_PER_MONTH` et `spanDays` ; `spanDaysOf` impose au moins un jour. Des dates invalides peuvent toutefois produire `NaN`.
  - `estimateCosts` suppose des structures `usage`, `models` et `pricing` cohérentes ; certains postes dépendent des hypothèses (`ASSUMPTIONS`) et de prix d’image pouvant être facturés à l’image ou aux jetons.
  - Dépend de `transcriptionModels.js`, `summaryModels.js`, `infographicModels.js`, `assumptions.js`, `catalog.js` et `pricing.js` (notamment pour la résolution des modèles, les tarifs et leur présentation).

### services/api/lib/costs/pricing.js

- **Rôle** : construit les tarifs appliqués en fusionnant le catalogue intégré et les tarifs enregistrés. Pour chaque modèle, conserve la donnée valide la plus récente. Valide les tarifs et taux de change reçus avant leur utilisation.
- **Fonctions exportées** :
  - `sanitizePrice(raw)` — prend un objet brut ; retourne un tarif assaini ou `null`. Ne modifie pas l’objet d’origine. Ignore les prix inconnus, invalides ou supérieurs au plafond, ainsi que les champs facultatifs mal formés.
  - `sanitizeFx(raw)` — prend un objet contenant `usdToEur`, `date` et éventuellement `fetchedAt` et `source` ; retourne un taux assaini ou `null`. Ne modifie pas l’objet d’origine ; exige un taux entre 0,3 et 3 et une date analysable.
  - `effectivePricing(stored, options?)` — prend les réglages enregistrés et, en option, `catalog`, `checkedAt` et `fxFallback` ; retourne `{ models, fx, refreshedAt, refreshedBy }`. Fusionne par date de relevé ; conserve les caractéristiques du catalogue absentes du relevé. Aucun effet de bord notable.
  - `pricingProvenance(pricing, modelIds)` — prend les tarifs effectifs et les identifiants de modèles ; retourne la provenance du relevé le plus ancien parmi les modèles trouvés, ainsi que les métadonnées de rafraîchissement et du taux de change. Les identifiants sont dédupliqués ; les modèles inconnus sont ignorés.
  - `publicTariff(price)` — prend un tarif ou `null` ; retourne ses prix publics en dollars, ou `null`. Si aucun prix `image` n’existe, calcule éventuellement `imageUsd` à partir de `imageTokens` et `imageOutputMTok`.
- **Points d’attention** :
  - Les dates illisibles ne permettent pas à un tarif enregistré de remplacer une date valide ; le taux de change est comparé selon `fetchedAt`, puis `date`, face à la date du taux de repli.
  - Les fonctions ne modifient pas les données fournies. Le catalogue, les champs de prix et les valeurs de repli dépendent de `./catalog.js`.
  - `pricingProvenance` renvoie `null` pour `checkedAt` et `source` si aucun modèle demandé n’est trouvé.

### services/api/lib/costs/refresh.js

- **Rôle :** actualise à la demande les tarifs des modèles et le taux de change, puis fusionne les valeurs récupérées avec le dernier relevé. Une source en échec ne supprime pas les valeurs précédentes.
- **Fonction exportée — `refreshPricing({ requests, sources, previous = null, now = new Date() })`**
  - **Paramètres :** `requests`, modèles à tarifer (`id`, `provider` facultatif) ; `sources`, fournisseurs de prix et de taux de change ; `previous`, relevé antérieur facultatif ; `now`, date de vérification facultative.
  - **Retour :** promesse d’un objet contenant `snapshot` (modèles et taux retenus), `updated` (nombre de tarifs et présence d’un nouveau taux), `missing` (identifiants sans tarif) et `errors` (source et message).
  - **Effet de bord notable :** appelle séquentiellement les sources configurées ; ne modifie pas directement le relevé persistant.
- **Points d’attention :**
  - Les requêtes sont dédoublonnées par `id`. Chaque source de prix ne reçoit que les modèles encore sans tarif ; une erreur est enregistrée et les sources suivantes sont quand même essayées.
  - Les prix et taux passent par `sanitizePrice` et `sanitizeFx`. Un taux refusé est signalé comme « taux hors bornes » ; sans taux valide, celui du relevé précédent est conservé.
  - Dépend de `./pricing.js` pour la validation et du contrat des sources (`fetchPrices`, `fetchRate`, `id`). Les listes de sources absentes sont traitées comme vides.

### services/api/lib/costs/sources/currencyApi.js

- Fournit une source de secours pour le taux quotidien USD/EUR via le jeu de données `currency-api` sur jsDelivr ; la BCE est interrogée en premier.
- Exports :
  - `CURRENCY_API_URL` — URL par défaut du JSON de taux.
  - `parseCurrencyApi(json)` — prend la réponse JSON ; retourne `{ usdToEur, date }`. Lève une erreur si le taux USD/EUR n’est pas strictement positif ou si la date ne correspond pas au format `YYYY-MM-DD`.
  - `createCurrencyApiSource({ fetchImpl, url, timeoutMs } = {})` — retourne une source `{ id, fetchRate }`. `fetchRate()` effectue une requête GET avec l’en-tête `Accept: application/json`, puis retourne le résultat parsé ; lève une erreur en cas de réponse HTTP non OK ou de JSON invalide. Effet de bord : requête réseau, interrompue après `timeoutMs` (10 s par défaut).
- Points d’attention : dépend de `fetch` global par défaut et de `AbortSignal.timeout`; `fetchImpl`, l’URL et le délai peuvent être remplacés.

### services/api/lib/costs/sources/ecb.js

- Fournit le taux de change quotidien USD → EUR à partir du fichier XML de la Banque centrale européenne. Le taux publié étant exprimé par euro, le taux USD → EUR est son inverse.
- Exporte `ECB_DAILY_URL` : URL par défaut du fichier `eurofxref-daily.xml`.
- Exporte `parseEcbDaily(xml)` :
  - Paramètre : texte XML.
  - Retour : `{ usdToEur, date }`, avec le taux numérique et la date de publication.
  - Lève une erreur si la date ou le taux USD positif est introuvable. L’extraction repose sur des expressions régulières, pas sur un parseur XML.
- Exporte `createEcbSource({ fetchImpl, url, timeoutMs } = {})` :
  - Paramètres optionnels : fonction `fetch` (par défaut `globalThis.fetch`), URL et délai d’expiration en ms (10 000 par défaut).
  - Retour : source `{ id: 'ecb', fetchRate }`. `fetchRate()` télécharge le XML, vérifie le statut HTTP, puis retourne le résultat de `parseEcbDaily`.
  - Effets de bord : requête réseau avec expiration via `AbortSignal.timeout`; lève une erreur en cas d’échec HTTP, réseau ou de parsing.
- Attention : la source dépend de `fetch`, de `AbortSignal.timeout` et du format actuel du XML BCE. Le taux publié peut être daté du dernier jour ouvré, notamment les week-ends et jours fériés.

### services/api/lib/costs/sources/index.js

- Assemble et expose les sources de tarifs et de taux de change, dans leur ordre d’essai.
- `createPriceSources({ fetchImpl = globalThis.fetch } = {})` — retourne `{ prices, fx }`, deux tableaux de sources créés avec le même `fetchImpl` :
  - `prices` contient la source LiteLLM.
  - `fx` contient les sources BCE puis CurrencyAPI ; le change s’arrête à la première source qui répond.
- Effet de bord notable : aucun appel réseau à la création ; `fetchImpl` est transmis aux fabriques de sources.
- Points d’attention : les tarifs sont recherchés source par source, uniquement pour les modèles encore manquants. Sans `fetchImpl` fourni, le code dépend de `globalThis.fetch`.

### services/api/lib/costs/sources/litellm.js

- Fournit une source de tarifs depuis le JSON public de LiteLLM : convertit ses prix unitaires en dollars au format attendu par myBrief. Le fichier distant est téléchargé uniquement lors de l’appel à `fetchPrices`.
- Fonctions exportées :
  - `normalizeLiteLlmEntry(entry)` — prend une entrée LiteLLM ; retourne un tarif normalisé, ou `null` si le mode ou les prix exploitables manquent. Aucun effet de bord.
  - `findLiteLlmEntry(data, id, provider = 'openai')` — cherche l’entrée du modèle dans les données LiteLLM ; retourne l’entrée ou `null`. Vérifie que le fournisseur déclaré correspond au fournisseur demandé.
  - `createLiteLlmSource({ fetchImpl, url, timeoutMs } = {})` — retourne une source `{ id, fetchPrices }`. `fetchImpl` (par défaut `globalThis.fetch`), `url` et `timeoutMs` sont configurables ; aucun accès réseau n’a lieu à la création.
    - `fetchPrices(requests)` — prend une liste de `{ id, provider? }` ; retourne une promesse de tarifs trouvés, indexés par `id`, avec le fournisseur dans chaque tarif. Effectue une requête HTTP, avec en-tête JSON et délai maximal ; lève une erreur si la réponse HTTP échoue ou si `content-length` dépasse 50 Mo.
- Points d’attention :
  - Modes pris en charge : `chat`, `responses`, `completion`, `audio_transcription` et `image_generation`. Les tarifs sont convertis en minute ou par million de tokens selon le type ; les tarifs négatifs, non numériques ou non finis sont ignorés.
  - Une entrée sans prix exploitable retourne `null` ; les modèles absents ne figurent pas dans le résultat. Une transcription tarifée uniquement au jeton audio est donc ignorée.
  - La recherche tente d’abord `id`, puis `provider/id` ; les fournisseurs par défaut sont `openai`. Les entrées déclarant un autre fournisseur sont écartées.
  - Dépend de `fetch`, `AbortSignal.timeout` et de la réponse JSON LiteLLM. La limite de taille s’appuie sur l’en-tête `content-length` lorsqu’il est disponible.

### services/api/lib/costs/usage.js

- Calcule la consommation d’IA d’une période à partir des réunions en base, sans modifier les données. Les dates de réunion déterminent l’audio et la détection d’actions, `generatedAt` les comptes rendus, et `infographic.updatedAt` les infographies.
- `speechRateOf(meetings)` — prend un tableau de réunions et retourne le débit mesuré en caractères par seconde, ou `null` si les données plausibles cumulées représentent moins d’une heure. Ignore les durées ou textes absents, non positifs et les débits hors de 2–40 caractères/s. Sans effet de bord.
- `measureUsage({ meetings, from, to, detectionOff, assumptions })` — retourne les compteurs d’usage (réunions, secondes audio et de détection, durées déduites ou non mesurées, comptes rendus et infographies, volumes de texte), ainsi que le débit retenu et `measuredSpeechRate`. Sans effet de bord.
- Points d’attention :
  - Les durées ou tailles de transcription manquantes sont estimées avec le débit mesuré, ou avec `assumptions.speechCharsPerSecond`. Les réunions sans durée ni texte sont comptées dans `unmeasured`.
  - `detectionOff` exclut les comptes concernés de la détection, mais pas de l’audio. Les dates de période sont inclusives.
  - `versions` absent déclenche un compte rendu à la date de réunion ; `versions: []` n’en compte aucun. Chaque version est datée par `generatedAt`, avec repli sur la date de réunion.
  - Seules les infographies `ready` ou `pending` sont comptées ; une seule dernière infographie par réunion est prise en compte. Les versions de compte rendu supprimées ne sont pas comptabilisées.
  - Dépend de `meetingDate` et `ownerKey` (`../stats.js`) et de `ASSUMPTIONS` (`./assumptions.js`).

### services/api/lib/infographic.js

- Génère en arrière-plan une infographie pour un compte rendu. Enregistre l’image dans la collection `infographics` et l’état (`ready` ou `error`) dans le document `resume`.
- Exports :
  - `INFOGRAPHICS_COLLECTION` : nom de la collection de stockage des images (`'infographics'`).
  - `INFOGRAPHIC_IMAGE_SIZE` : format fixe de l’image (`'1024x1536'`, portrait).
  - `generateAndSaveInfographic({ app, log, email, meetingId, body })` : fonction asynchrone, sans valeur de retour utile. Prépare les matériaux depuis la transcription, les actions, les notes, la langue et le style configuré ; fait réécrire le prompt par le modèle texte, puis génère et enregistre l’image. Effet de bord : écrit l’image et ses métadonnées dans `infographics`, puis met à jour `resume.infographic.status`.
- Points d’attention :
  - La réécriture du prompt est facultative : en cas d’échec ou de résultat vide, la génération utilise les matériaux bruts. Le prompt réécrit est limité à `INFOGRAPHIC_PROMPT_MAX`.
  - Si la génération échoue ou ne renvoie pas d’image, le statut passe à `error`. L’image est enregistrée avant le statut `ready`.
  - Le modèle d’image et le style sont relus depuis les réglages à chaque génération ; le format reste fixe.
  - Dépend de `app.db`, `app.openai`, `app.settings`, `app.config`, des utilitaires `ownerFilter`/`ownerFields` et des prompts de `prompts.js`. Les écritures sont limitées au propriétaire via `email`.
  - L’image est stockée séparément du document `resume` ; ce dernier ne contient que l’état.

### services/api/lib/infographicModels.js

- Définit les modèles d’image d’infographie proposés à l’administration, distincts du modèle texte qui réécrit le prompt.
- Exports :
  - `DEFAULT_INFOGRAPHIC_IMAGE_MODEL` : modèle par défaut (`gpt-image-2.5-flare`).
  - `INFOGRAPHIC_IMAGE_MODELS` : liste fermée des modèles proposés, dans l’ordre d’affichage (`gpt-image-2.5-flare`, `gpt-image-2`).
  - `isInfographicImageModel(id)` : prend un identifiant ; retourne `true` s’il figure dans la liste, sinon `false`. Aucun effet de bord.
  - `resolveInfographicImageModel(stored, envModel)` : prend la valeur enregistrée en administration et le modèle d’environnement déjà résolu ; retourne le modèle effectif. Priorité : valeur enregistrée valide, puis valeur d’environnement non vide après conversion en chaîne et suppression des espaces, puis valeur par défaut. Aucun effet de bord.
- Points d’attention :
  - Une valeur enregistrée hors liste est ignorée ; une valeur d’environnement hors liste est conservée, notamment pour permettre des modèles non proposés dans l’écran.
  - La liste concerne le modèle qui dessine l’image, pas celui qui réécrit le prompt. Le format d’image reste fixe et est défini ailleurs (`lib/infographic.js`).
  - Aucune dépendance externe dans ce fichier ; `envModel` est fourni par `lib/config.js`.

### services/api/lib/legacyVersion.js

- Convertit un compte rendu stocké dans `resume`, sans versions enregistrées, en version persistable. Sert notamment à préserver les anciens résumés avant leur remplacement et à permettre leur retouche.
- Exports :
  - `LEGACY_VERSION_ID` : identifiant fixe `'v_legacy'`, commun à l’affichage et au stockage.
  - `WITHOUT_VERSIONS` : filtres MongoDB pour les documents dont `versions` est absent, nul ou vide.
  - `legacyVersionOf(doc)` : reçoit un document ou `null`; retourne la version à inscrire (`id`, `html`, `template`, métadonnées nulles et `generatedAt`), ou `null` si le document est absent, contient déjà des versions non vides, ou n’a pas de `resume` non blanc. Aucun effet de bord.
- Points d’attention :
  - Un tableau `versions` vide est accepté; une valeur non nulle qui n’est pas un tableau vide est refusée.
  - `template` et `now` deviennent `null` s’ils sont absents ou nuls. `generatedAt` reprend `doc.now`.
  - `WITHOUT_VERSIONS` n’inclut pas les valeurs de `versions` d’une forme inattendue.
  - Dépendances : opérateurs de filtre MongoDB; identifiant partagé avec `src/utils/summary.js`.

### services/api/lib/myBrain/client.js

- Client HTTP de l’API myBrain (`/api/v1`), authentifiée par clé Bearer. Les redirections ne sont pas suivies afin de ne pas transmettre la clé à un autre hôte.
- Exports :
  - `MYBRAIN_TIMEOUT_MS` : délai par défaut, **15 000 ms**.
  - `MyBrainError(code, details?)` : erreur avec `code`, `status`, `upstreamMessage`, `retryable`, `ambiguous` et `location`. `details()` fournit les informations transmissibles à une route d’administration, sans la clé API.
  - `createMyBrainClient({ fetchImpl?, timeoutMs? }?)` : retourne un client. `fetchImpl` est injectable pour les tests ; utilise `globalThis.fetch` par défaut.
    - `whoami({ url, apiKey })` : `Promise<{ application, droits, api }>` ; appelle `GET /api/v1` et valide la forme de la réponse.
    - `feed({ url, apiKey, deposit })` : `Promise<{ job, pour, avertissements }>` ; appelle `POST /api/v1/nourrir` avec le dépôt. Un corps 2xx absent ou illisible est considéré accepté : `job` vaut `''` et `pour` vaut `undefined`.
- Points d’attention :
  - Les erreurs distinguent les échecs relançables (`retryable`) des dépôts potentiellement déjà reçus (`ambiguous`) ; un HTTP 500 est ambigu et non relançable.
  - Les réponses d’erreur myBrain sont lues dans le champ JSON `erreur`, limité à 300 caractères. Une réponse 2xx mal formée fait échouer `whoami`, mais pas `feed`.
  - Les erreurs réseau classent les causes de connexion initiale comme relançables ; délai dépassé et perte de connexion en cours de requête sont ambigus.
  - Dépend de `fetch`, `AbortSignal.timeout` et des réponses JSON de myBrain ; les erreurs HTTP sont converties en slugs `mybrain_*`.

### services/api/lib/myBrain/document.js

- Construit les dépôts Markdown envoyés à myBrain à partir d’un document de réunion : métadonnées, notes, actions visibles, compte rendu et transcription. N’inclut pas la provenance de l’outil.
- Exports :
  - `MYBRAIN_TEXT_MAX`, `MYBRAIN_PARTS_MAX`, `MYBRAIN_TITLE_MAX` : plafonds respectifs de 120 000 caractères par texte, 8 parties et 300 caractères par titre.
  - `htmlToText(html)` : convertit un compte rendu HTML en texte Markdown en conservant une structure simplifiée ; retourne le texte nettoyé. Un contenu sans balises est conservé.
  - `formatMeetingDuration(seconds)` : retourne une durée lisible ou `''` si la valeur est absente, invalide ou non positive.
  - `meetingDateOf(meeting)` : retourne la première date valide parmi `meetingStartTime`, `lastConnecion`, `lastConnection` et `now`, ou `null`.
  - `buildMyBrainDeposits(meeting, context?)` : retourne un tableau de dépôts `{ titre, texte, pour?, end }`, ou `[]` si aucun contenu utile. `context` accepte `authorName`, `authorEmail`, `tagLabel`, `maxChars`, `maxParts` et `cuts`.
- `buildMyBrainDeposits` découpe les longues transcriptions aux fins de ligne, répète l’en-tête dans chaque partie et réserve notes, actions et compte rendu à la première. `end` indique la fin de transcription de la partie ; `cuts` permet de rejouer des frontières déjà enregistrées. Les sections d’appoint sont plafonnées à 20 000, 15 000 et 40 000 caractères.
- Points d’attention :
  - Au-delà de 8 parties, la transcription restante n’est pas envoyée et le texte l’indique. Une ligne plus longue que la place disponible peut être coupée.
  - Les titres sont limités à 300 caractères ; `pour` n’est ajouté que si l’adresse auteur contient `@`.
  - Les actions masquées (`show: false`) et les valeurs de remplacement historiques sont ignorées.
  - Dates formatées avec le fuseau `Europe/Paris`. Dépend de `UNTITLED_MEETING` (`../prompts.js`) et de `isLegacyActionPlaceholder` (`../notesActions.js`). Les fonctions de ce module ne font pas d’appel réseau.

### services/api/lib/myBrain/feed.js

- **Rôle :** gère l’éligibilité, l’envoi des réunions à myBrain, l’état d’envoi en base et les relances. Les erreurs d’envoi ne font pas échouer l’action qui les déclenche.
- **Exports :**
  - `MYBRAIN_MAX_ATTEMPTS` — nombre maximal de tentatives automatiques : `5`.
  - `MYBRAIN_SENDING_STALE_MS` — délai avant qu’un envoi bloqué soit considéré comme interrompu : `15 min`.
  - `MYBRAIN_RETRY_INTERVAL_MS` — intervalle par défaut de la boucle de relance : `10 min`.
  - `myBrainEligibility(app, email)` — retourne une `Promise` contenant disponibilité, activation, politique, préférence du compte, date d’activation et paramètres. Lit les réglages d’installation et du compte.
  - `feedMeetingToMyBrain({ app, log, email, meetingId, manual = false })` — retourne une `Promise` avec le statut `inactive`, `skipped`, `empty`, `sent` ou `error`. Réclame atomiquement la réunion, compose et envoie ses dépôts, puis met à jour `resume.myBrain`. Ne rejette pas. `manual` autorise la reprise d’un échec ambigu ou d’un envoi bloqué.
  - `retryMyBrainFeeds({ app, log, now = new Date(), limit = 10 })` — retourne une `Promise<number>` indiquant le nombre de réunions échues traitées. Marque les envois bloqués comme ambigus, puis traite les relances dues en série. Ne rejette pas.
  - `startMyBrainRetryLoop(app, { intervalMs = MYBRAIN_RETRY_INTERVAL_MS } = {})` — démarre la boucle de relance et retourne `{ stop }`. Programme un premier passage après 60 s, empêche les passages simultanés et rend les timers non bloquants (`unref` si disponible).
- **Points d’attention :**
  - Un envoi automatique n’est permis que pour une réunion commencée après l’activation applicable (`activeSince`, et `enabledSince` si le compte choisit l’envoi). Les réglages d’installation sont relus à chaque envoi.
  - La réclamation atomique évite les doublons entre déclencheurs concurrents. Les dépôts partiels conservent leurs identifiants (`jobs`) et frontières (`cuts`) pour reprendre sans renvoyer les parties acceptées.
  - Seuls les échecs explicitement relançables sont réessayés automatiquement, avec au plus cinq tentatives. Les issues ambiguës ne sont jamais relancées automatiquement ; une reprise manuelle peut créer un doublon.
  - Une réunion sans contenu exploitable retourne `empty` et son état `myBrain` est supprimé. Les réunions encore en enregistrement sont exclues.
  - Dépend de MongoDB (`resume`, `userTags`), du contexte `app` (`myBrainSettings`, `userActions`, `myBrain.feed`, utilisateurs, suivi des tâches), ainsi que de `ownerFilter`, `isMyBrainActive`, `MyBrainError`, `buildMyBrainDeposits` et `meetingDateOf`.

### services/api/lib/notesActions.js
- Centralise le schéma et les règles de validation des notes et actions acceptées par les routes d’historique et par le résumé.
- Exporte :
  - `isLegacyActionPlaceholder(value)` — prend une valeur quelconque, retourne un booléen indiquant si son texte correspond à un placeholder historique, après conversion en chaîne, suppression des espaces périphériques et comparaison sans casse. Utilise une liste figée de libellés.
  - `notesSchema` — schéma Ajv acceptant une chaîne pour les notes.
  - `actionsSchema` — schéma Ajv acceptant un tableau d’objets action avec les propriétés déclarées (`id`, `title`, `owner`, `dueDate`, `description`, `newBadge`, `show`) ; les propriétés supplémentaires sont interdites. Les actions masquées restent valides.
  - `notesActionsFields(body = {})` — prend un corps de requête, retourne un fragment `$set` contenant uniquement `notes` si c’est une chaîne et `actions` si c’est un tableau. N’efface donc pas un champ absent ; ne modifie pas la base directement.
  - `withoutLegacyPlaceholders(actions)` — prend une valeur quelconque, retourne une liste d’actions où les champs de contenu vides ou égaux à un placeholder historique sont remplacés par `''`. Une entrée non-tableau donne `[]` ; les éléments non-objets sont conservés.
  - `hasNotesActionsContent({ notes, actions } = {})` — retourne un booléen : vrai si les notes contiennent du texte ou si une action a du contenu dans `title`, `owner`, `dueDate` ou `description`. Une action vierge ou contenant seulement des placeholders ne compte pas.
- Points d’attention : Ajv/Fastify peut retirer les propriétés d’action inconnues (`removeAdditional`) plutôt que rejeter la requête. Le schéma vérifie la forme, pas la taille ; la limite de corps de l’API est appliquée ailleurs. `newBadge` et `show` ne comptent pas comme contenu ; les placeholders sont comparés après normalisation, sans distinction de casse.

### services/api/lib/pageMeter.js

- **Rôle** — Mesure la longueur du résumé IA en pages estimées selon la mise en page PDF, et fournit au serveur les outils pour borner et vérifier cette longueur. Jumeau de `src/lib/pageMeter.js` : toute modification de la logique de mesure doit être répercutée des deux côtés.
- **Constantes exportées** — `PAGE_STEPS` (positions acceptées), `MIN_PAGES` et `MAX_PAGES` (bornes), `WORDS_PER_PAGE` (450), `MATERIAL_RATIO` (0,45) et `TOLERANCE` (0,2). Aucun effet de bord.
- **Fonctions exportées** :
  - `normalizePages(value)` — convertit une chaîne ou un nombre en position valide la plus proche, ou renvoie `null` si absent, non fini ou hors bornes. Accepte la virgule décimale.
  - `stepIndex(pages)` — renvoie l’index de la position normalisée ; si elle est invalide, renvoie l’index de 1 page.
  - `stepAtOrBelow(pages)` — renvoie la plus grande position de `PAGE_STEPS` qui ne dépasse pas la valeur.
  - `countWords(text)` — compte les mots après retrait des balises HTML et des entités ; convertit les valeurs falsy en chaîne vide.
  - `wordsForPages(pages)` — renvoie `pages × 450`, arrondi à l’entier.
  - `materialCapPages(transcriptWords)` — estime le plafond en pages selon la matière disponible, borné à `MIN_PAGES`–`MAX_PAGES` ; une transcription non positive ou inconnue donne `MAX_PAGES`.
  - `effectivePages(requested, transcriptWords)` — renvoie la demande normalisée, plafonnée par la matière, ou `null` si invalide.
  - `lengthVerdict(measured, target)` — renvoie `'short'`, `'long'` ou `'ok'` selon une tolérance de 20 % avec plancher absolu de 0,05 page.
  - `estimatePages(html)` — estime les pages occupées par un fragment HTML dans le PDF, sans en-tête ; renvoie `0` si aucun bloc de texte n’est détecté.
  - `splitAtAnchors(html, anchors)` — découpe le HTML en `{head, body, tail}` autour des ancres ; renvoie `null` si une ancre requise est introuvable ou mal ordonnée.
- **Effets de bord** — Aucun : les fonctions calculent et renvoient des valeurs, sans modifier le HTML ni effectuer d’E/S.
- **Points d’attention** — Le parseur HTML et le calcul de mise en page sont volontairement simplifiés et calibrés pour le HTML de résumé (titres, paragraphes, listes, gras), pas pour du HTML arbitraire. Les mesures reposent sur des dimensions PDF, des tables de largeur de glyphes et des règles de rendu internes ; les caractères absents des tables utilisent une largeur moyenne. `splitAtAnchors` dépend des chaînes d’ancrage fournies par les templates : en cas d’échec, le serveur évite de mesurer ou de reprendre le résumé.

### services/api/lib/pageTarget.js
- Pilote le **Pagimètre côté serveur** : mesure la longueur du résumé principal et tente de le rapprocher de la cible, sans faire échouer le compte rendu si une reprise échoue. Seul le résumé entre les ancres est repris ; le reste du HTML est préservé.
- Fonctions exportées :
  - `parsePagePlan(raw, transcription)` — valide le plan reçu du client et renvoie `null` si la cible est absente ou invalide ; sinon retourne les pages demandées, la cible recalculée depuis la transcription, les ancres et les consignes de reprise. Ne modifie pas les entrées.
  - `mainVerbosity(target)` — retourne `'low'`, `'medium'` ou `'high'` selon la cible.
  - `enforcePageTarget({ html, plan, transcription, chat, log, maxPasses, canRetry })` — retourne une promesse `{ html, report }`. Mesure le résumé, puis peut appeler `chat({ system, user, verbosity })` pour le développer ou le condenser. Le HTML initial est conservé si la reprise échoue, déborde sur les ancres ou n’améliore pas l’écart à la cible. Effets notables : appels au modèle et journalisation via `log.info` / `log.warn`.
  - `SECOND_PASS_BUDGET_MS` — constante exportée : `150_000` ms, budget destiné à autoriser ou non une seconde reprise via `canRetry`.
- Points d’attention :
  - Dépend de `pageMeter.js` pour normaliser la cible, découper aux ancres, mesurer le texte et déterminer l’écart à la cible.
  - Les chaînes d’ancres sont limitées à 500 caractères ; chaque consigne de reprise à 60 000 caractères. Les ancres absentes ou non exploitables entraînent un retour sans reprise.
  - `maxPasses` vaut `1` par défaut ; `canRetry` n’est consulté qu’à partir de la deuxième passe. La constante de budget n’est pas appliquée directement par le fichier.
  - Une reprise doit faire évoluer la mesure dans le bon sens et réduire l’écart relatif à la cible ; sinon elle est écartée.

### services/api/lib/personalStats.js

- **Rôle** : calcule les statistiques d’usage d’un seul compte, avec le crédit du mois civil. Ne projette que des volumes et des métadonnées de modèles, jamais le contenu des réunions.
- **Fonctions exportées** :
  - `rangeWindow(range, period)` — retourne `{ days, since }` pour `90`, `365`, `all` ou, par défaut, le mois de crédit (`period.start`).
  - `summaryCounts(meetings)` — retourne `{ count, regenerated }`. Un document sans tableau `versions` compte comme un compte rendu ; `versions: []` n’en compte aucun.
  - `labelsByTemplate(orgTemplates, userTemplates)` — retourne une `Map` des valeurs de modèles vers leurs libellés français et anglais. Les modèles du compte remplacent ceux de l’organisation.
  - `computePersonalStats({ meetings, labels, range, period, now })` — fonction pure ; retourne les périodes, totaux, séries, jours de la semaine, tranches de durée et statistiques par modèle, sans crédit. `labels` est facultatif.
  - `personalStats({ db, quota }, identity, range, now)` — lit les réunions et les modèles, calcule les statistiques et ajoute `credit` à l’objet retourné. Effets de bord : lectures MongoDB et appel à `quota.creditFor(identity, now)`.
- **Points d’attention** :
  - `PERSONAL_RANGES` expose `month`, `90`, `365`, `all`. Toute valeur inconnue est traitée comme `month` par `rangeWindow`.
  - `personalStats` choisit l’adresse via `identity.doc?.email || identity.email` et filtre les réunions et modèles du compte avec `ownerFilter`.
  - Dépendances : `ownerScope.js`, `stats.js` (`computeUsageStats`, `meetingDate`) et `quota.js` (`currentPeriod`).
  - Les projections MongoDB sont strictes : seuls les champs nécessaires aux calculs et aux libellés sont lus.

### services/api/lib/quota.js

- **Rôle** : calcule le quota mensuel de transcription par compte, en minutes de réunions commencées pendant le mois civil à Paris. Agrège l’historique et les traces de réunions supprimées ; expose aussi les données de consommation pour les statistiques.
- **Constantes exportées** :
  - `QUOTA_TIME_ZONE` : fuseau des périodes, `Europe/Paris`.
  - `DELETED_USAGE_COLLECTION` : nom de la collection des traces de consommation supprimée (`deletedMeetingUsage`).
  - `PACE_ALERT_THRESHOLD` : seuil d’alerte d’avance sur le rythme régulier (`0.15`).
- **Fonctions exportées** :
  - `zonedMidnight(year, month, day, timeZone = QUOTA_TIME_ZONE)` → `Date` : convertit un minuit civil en instant ; accepte les débordements de mois et de jour.
  - `currentPeriod(now = new Date(), timeZone = QUOTA_TIME_ZONE)` → `{start, end, timeZone}` : bornes ISO UTC du mois civil contenant `now` dans le fuseau indiqué ; `end` est exclu.
  - `effectiveLimit(groups)` → `{minutes, group}` : sélectionne le quota de groupe le plus élevé ; `null` signifie illimité. Sans groupe, renvoie aussi une limite illimitée.
  - `sumDurations(docs)` → `number` : somme les durées validées ; pour un même `meetingId`, ne retient que la plus longue. Les documents sans identifiant sont comptés séparément.
  - `deletedUsageTrace(email, doc, now)` → `object | null` : prépare la trace de consommation à conserver avant suppression. Renvoie `null` si la durée est absente et la réunion n’est pas en cours, si la date est invalide ou si son mois est terminé. Ne réalise aucune écriture.
  - `buildQuotaStatus({minutes, group, usedSeconds, period})` → `object` : construit l’état du quota (utilisation, minutes restantes, limite atteinte). Une limite est considérée atteinte s’il reste moins de 60 secondes.
  - `dayKey(date, timeZone = QUOTA_TIME_ZONE)` → `string` : jour civil au format `YYYY-MM-DD` dans le fuseau indiqué.
  - `dailyUsage(docs, period)` → tableau `{date, usedSeconds}` : consommation de chaque jour du mois, jours sans réunion inclus ; déduplique par réunion selon sa durée maximale.
  - `exhaustedDay(days, limitMinutes)` → `string | null` : premier jour où le crédit est épuisé selon la règle de la minute restante.
  - `creditPace(status, now = new Date())` → objet de prévision ou `null` : estime le rythme, la date d’épuisement et l’éventuelle alerte ; renvoie `null` sans période ou pour un compte illimité.
  - `createQuotaService({db, users, groups})` → service asynchrone :
    - `statusFor(identity, now = new Date())` → état du quota ; lit les réunions conservées et supprimées, sauf si le compte est illimité ou sans email.
    - `creditFor(identity, now = new Date())` → état enrichi des statistiques mensuelles : consommation par jour, part supprimée, rythme et jour d’épuisement. Lit les réunions même sans limite pour calculer `monthSeconds`.
    - `keepDeletedUsage(email, meetingId, now = new Date())` → nombre de traces créées ; doit être appelé **avant** la suppression. L’écriture des traces peut faire échouer la suppression.
    - `recordLateStop(email, meetingId, seconds)` → booléen indiquant si une trace existante a été mise à jour. Ignore une durée nulle ; `$max` rend les arrêts rejoués idempotents.
- **Points d’attention** :
  - La durée est attribuée au mois et au jour de début (`lastConnecion`, nom de champ conservé tel quel), pas à la date d’arrêt. Les bornes de période sont calculées dans le fuseau demandé, puis stockées/comparées en ISO UTC.
  - `createQuotaService` dépend de MongoDB (`db`), des dépôts `users` et `groups`, ainsi que de `ownerScope.js`, `meetingDuration.js` et `repositories/groups.js`.
  - Les traces portent les champs de propriété et de réunion nécessaires au filtrage et sont destinées à expirer en fin de mois via un index TTL sur `expiresAt`. Tout nouveau chemin de suppression doit appeler `keepDeletedUsage` auparavant.
  - Une réunion supprimée pendant l’enregistrement peut laisser une trace sans durée ; `recordLateStop` y inscrit ensuite la durée. Une suppression avant

### services/api/lib/repositories/groups.js

- **Rôle :** accès MongoDB à la collection `userGroups` et normalisation des groupes, appartenances, quotas et droits. C’est le seul module qui connaît le schéma de cette collection.
- **Constantes exportées :** `GROUPS_COLLECTION`, identifiants et noms des groupes fixes, palette et limites (`GROUP_COLORS`, `GROUP_NAME_MAX`, `GROUP_DESCRIPTION_MAX`, `GROUPS_MAX`, `QUOTA_MINUTES_MAX`).
- **Fonctions exportées :**
  - `normalizeQuotaMinutes(value)` — retourne un entier entre 0 et le plafond, sinon `null` (quota illimité). Aucune écriture.
  - `normalizeInfographicAllowed(doc)` — retourne le droit effectif ; un champ absent vaut `true` pour le groupe par défaut, `false` pour les autres. Aucune écriture.
  - `rightsOf(groupDocs)` — retourne `{ infographic }` à partir des groupes fournis ; aucun groupe résolu donne le droit par défaut (`true`).
  - `groupIdOf(ids)` / `normalizeGroupIds(ids)` — normalisent l’appartenance en un identifiant, avec repli sur `default` ; la seconde retourne `[id]`.
  - `groupAfterRoleChange(currentId, role)` / `groupForRole(role)` — déterminent le groupe après changement de rôle ou à la création, sans effet de bord.
  - `pickGroupId(all, ids)` — choisit, parmi les groupes actuels, celui qui préserve le quota le plus généreux ; départage par droit aux infographies, préférence pour un groupe autre que `default`, puis ordre fourni.
  - `groupNameKey(name)` — retourne une clé de nom insensible à la casse et aux espaces répétés.
  - `toPublicGroup(doc, memberCount = 0)` — projette un document pour l’administration ; retourne `null` si `doc` est absent. Le nombre de membres est fourni par l’appelant.
  - `toUserGroup(doc)` — projette les champs `id`, `name` et `color` pour l’utilisateur.
  - `groupsOfUser(all, doc)` — retourne une liste d’un document de groupe ; groupe inconnu ou supprimé : repli sur `default`, ou liste vide si celui-ci manque.
  - `createGroupsRepo(db)` — construit le dépôt MongoDB. Méthodes :
    - `list()` — tous les groupes, défaut en tête puis ordre par nom.
    - `findById(id)` — document ou `null`.
    - `count()` — nombre de documents.
    - `unknownIds(ids)` — identifiants normalisés qui ne sont pas présents en base.
    - `docsForUser(doc)`, `forUser(doc)`, `rightsForUser(doc)` — groupe(s), projection utilisateur ou droits du compte ; effectuent une lecture du catalogue.
    - `create(input)` — crée un groupe avec UUID et dates ; insère le document et le retourne. Le droit aux infographies vaut `false` par défaut ; couleur et quota sont normalisés.
    - `update(id, fields)` — met à jour les champs fournis, actualise `updatedAt`, puis retourne le document relu ou `null`. Un quota `null` signifie illimité ; une couleur invalide est ignorée.
    - `remove(id)` — supprime le document. **Ne détache pas ses membres** : l’appelant doit les réaffecter avant suppression.
    - `ensureDefault()` / `ensureAdmin()` — crée le groupe fixe manquant par upsert idempotent ; retourne `true` uniquement s’il vient d’être créé. `ensureAdmin` évite un conflit de nom avec un autre groupe.
- **Points d’attention :**
  - Un compte est interprété comme appartenant à un seul groupe ; les tableaux historiques multiples sont réduits au premier identifiant, sauf lors de la reprise `pickGroupId`.
  - `GROUP_NAME_MAX`, `GROUP_DESCRIPTION_MAX` et `GROUPS_MAX` sont des constantes ; ce fichier ne les applique pas lui-même.
  - `createGroupsRepo` dépend d’une base MongoDB (`db.collection`) et de `node:crypto` pour les UUID. Les fonctions de normalisation et de projection sont pures.

### services/api/lib/repositories/myBrainSettings.js

- **Rôle** : gérer les réglages d’organisation myBrain dans `appSettings` (`key: 'myBrain'`), sceller la clé API au repos et fournir une projection publique qui ne révèle jamais le secret.
- **Constantes exportées** : `MYBRAIN_SETTINGS_KEY` (`'myBrain'`), `MYBRAIN_POLICIES` (`off`, `optin`, `forced`), `MYBRAIN_URL_MAX` (500) et `MYBRAIN_KEY_PATTERN` (format des clés `mbk_…`).
- **`normalizeMyBrainUrl(raw)`** : normalise une URL HTTP(S) et renvoie `{ url, problem }`. Refuse identifiants, requête, ancre et URL trop longue ; retire le suffixe `/api/v1` et les barres finales. Une valeur vide est acceptée.
- **`normalizeMyBrainKey(raw)`** : retire espaces et préfixe `Bearer`, puis renvoie `{ key, problem }`. Une valeur vide est acceptée ; une clé mal formée est signalée sans appel réseau.
- **`myBrainKeyHint(key)`** : renvoie l’aperçu `8 premiers caractères…4 derniers`, ou une chaîne vide.
- **`isMyBrainActive(settings)`** : renvoie `true` si URL et clé sont présentes et que la politique n’est pas `off`.
- **`toPublicMyBrainSettings(settings)`** : construit la projection d’administration (configuration, état actif, aperçu, vérification et métadonnées), sans inclure la clé.
- **`createMyBrainSettingsRepo(db, secretBox = PLAIN_BOX)`** : crée le dépôt MongoDB ; dépend de `SETTINGS_COLLECTION` et du coffre `seal/open`. Le coffre par défaut est en clair, prévu pour les tests.
  - **`get()`** : lit les réglages et ouvre la clé ; renvoie les valeurs par défaut si le document ou certains champs manquent. Si la clé ne peut pas être ouverte, renvoie `apiKey: ''` et `keyUnreadable: true`.
  - **`toPublic(settings)`** : expose la projection publique.
  - **`update(patch, context)`** : valide et met à jour uniquement les champs fournis ; un champ `apiKey` vide retire la clé, un champ absent la conserve. Scelle toute clé non vide, met à jour `updatedAt`/`updatedBy` et renvoie les réglages relus. Réinitialise `activeSince` quand l’envoi devient actif ou que la politique change alors qu’il est actif ; une rotation de clé ou d’URL seule ne le modifie pas.
  - **`saveVerification(verified)`** : enregistre ou efface le résultat du dernier test réussi, sans modifier l’auteur des réglages ; renvoie les réglages relus.
- **Points d’attention** :
  - `update` lève une erreur si l’URL, la clé ou la politique est invalide ; la validation est faite dans le dépôt, pas seulement dans la route.
  - `activeSince` évite les envois rétroactifs. Pour les anciens documents, il retombe sur `updatedAt`.
  - `verified` est effacé seulement si `update` reçoit explicitement `verified: null` ; `saveVerification(null)` l’efface directement.
  - L’AAD de chiffrement est fixe (`appSettings:myBrain`) : une clé copiée dans un autre emplacement ne peut pas être ouverte.
  - Le coffre réel utilise `CONNECTIONS_ENC_KEY` via `secretBox.js` ; sans coffre fourni, le dépôt stocke la clé en clair.

### services/api/lib/repositories/pricing.js

- **Rôle** : dépôt MongoDB du dernier relevé de tarifs d’IA, stocké dans `appSettings` sous la clé `pricing`. Ce relevé complète le catalogue intégré ; il contient les tarifs fusionnés et le taux de change.
- **`createPricingRepo(db)`**
  - Paramètre : `db`, connexion à la base de données.
  - Retour : dépôt exposant `get()` et `save()`.
  - Effet de bord : aucun à la création ; les opérations utilisent la collection `SETTINGS_COLLECTION`, importée de `settings.js`.
- **`get()`**
  - Paramètre : aucun.
  - Retour : `Promise<object|null>` — relevé sans `_id`, ou `null` s’il n’existe pas.
  - Effet de bord : aucun.
- **`save({ models, fx }, { actor = null } = {})`**
  - Paramètres : `models` (tarifs par modèle), `fx` (taux de change ou `null`) ; contexte facultatif avec `actor` (email de l’administrateur ou `null`).
  - Retour : `Promise<object|null>` — résultat de `get()` après écriture.
  - Effet de bord : remplace les champs du relevé, renseigne `refreshedAt` et `refreshedBy`, et crée le document si nécessaire (`upsert`). `createdAt` n’est défini qu’à la création.
- **Points d’attention**
  - La fusion avec le relevé précédent et le nettoyage sont effectués en amont ; ce dépôt écrit les données reçues sans les recalculer.
  - La suppression du document fait revenir à l’utilisation du catalogue intégré.
  - Les tarifs stockés sont publics ; aucune donnée secrète n’est concernée.

### services/api/lib/teamCredits.js

- Calcule les crédits de temps de l’équipe pour une période, sans effet de bord. Exclut les comptes désactivés et trie les comptes par urgence : crédits épuisés, alerte de rythme, autres comptes limités, puis comptes sans limite.
- **`computeTeamCredits({ users, groups, kept, deleted, history, period, now })`**
  - Paramètres : comptes servis, catalogue des groupes, réunions conservées et supprimées de la période, historique complet, période `{ start, end, timeZone }` et date courante `now`.
  - Retour : `{ period, groups, summary, accounts }`. Chaque compte inclut son groupe, sa limite, son utilisation, le solde, l’état d’épuisement, l’alerte de rythme, le nombre de réunions conservées et la date de sa dernière réunion.
  - Effet de bord : aucun. Les réunions supprimées de la période contribuent à l’utilisation, mais pas au nombre de réunions.
- **Points d’attention**
  - Applique les règles de quota de `quota.js`, notamment la limite effective des groupes et la période civile définie par `period`.
  - Une réunion est attribuée à son propriétaire via `ownerKey`; les durées et dates dépendent de `sumDurations`, `meetingDate` et des fonctions de quota importées.
  - Dépend aussi de `groupsOfUser` et `toUserGroup` (`repositories/groups.js`).
  - Le tri utilise `name` ou `email` pour départager les comptes; les comptes sans limite sont classés par consommation décroissante.

### services/api/lib/text.js

- Fournit des utilitaires partagés d’échappement et de normalisation de texte.
- `escapeRegExp(value)` : convertit `value` en chaîne et échappe les métacaractères des expressions régulières. Aucun effet de bord.
- `escapeHtml(value)` : convertit `value` en chaîne, remplace `null` et `undefined` par `''`, puis échappe `&`, `<`, `>`, `"`. Convient au contenu HTML et aux attributs entre guillemets doubles. Aucun effet de bord.
- `normalizeLang(raw)` : renvoie le code langue nettoyé s’il correspond au format accepté (`fr`, `en`, `pt-BR`, etc.), sinon `'fr'`. Aucun effet de bord.
- Points d’attention : `escapeHtml` n’échappe pas les apostrophes ; `normalizeLang` valide la forme du code, pas sa prise en charge. Dépend uniquement des fonctions natives de JavaScript.

### services/api/lib/transcriptCorrections.js

- Centralise le nettoyage et le bornage des corrections de transcription configurées pour tous les comptes. Le serveur les conserve et les fournit ; leur application en direct est faite côté navigateur.
- Constantes exportées : `CORRECTIONS_MAX` (50 lignes), `VARIANTS_MAX` (10 variantes par ligne), `TERM_MAX` (60 caractères) et `REPLACEMENT_MAX` (80 caractères).
- `foldKey(s)` — convertit `s` en clé de comparaison normalisée ; retourne une chaîne. Ignore casse et accents, harmonise apostrophes, espaces et traits d’union.
- `sanitizeTranscriptCorrections(raw)` — prend une valeur inconnue ; retourne une liste `{ from: string[], to: string }`. Nettoie et borne les termes, retire les variantes de moins de deux caractères alphanumériques, identiques à la correction ou déjà vues, puis ignore les lignes sans variante valide. Ne modifie pas `raw`.
- Points d’attention : une entrée qui n’est pas un tableau retourne `[]` ; les doublons sont détectés entre toutes les lignes, selon `foldKey`. `cleanTerm` et `letterCount` sont internes. Utilise `String.prototype.normalize` et les expressions régulières Unicode (`\p{…}`), à prendre en compte selon l’environnement JS.

### services/api/routes/admin/configChecks.js

- Enregistre la route `GET /api/admin/config-checks`, réservée aux administrateurs, pour fournir les problèmes de configuration de l’organisation.
- Fonction exportée par défaut `adminConfigChecksRoutes(app)` :
  - Paramètre : `app`, instance de l’application Fastify.
  - Retour : aucun retour explicite.
  - Effet notable : crée un cache de verdicts partagé entre les appels à la route pendant la durée de vie de l’application, puis enregistre la route.
- La route vérifie les droits avec `requireAdmin(req, reply)` ; si l’accès est refusé, elle renvoie `undefined`. Sinon, elle renvoie `{ issues }`, où `issues` provient de `organizationChecks(app, { cache })`.
- Dépendances : `requireAdmin` (`lib/rbac.js`), `organizationChecks` et `createVerdictCache` (`lib/configChecks.js`), qui porte la logique des vérifications.
- Point d’attention : les contrôles sont exécutés à chaque requête ; seul leur cache de verdicts est réutilisé.

### services/api/routes/admin/groups.js

- Enregistre les routes d’administration des groupes. L’accès est contrôlé par `requireAdmin`; les erreurs utilisent `fail`.
- **Export par défaut — `adminGroupsRoutes(app)`** : reçoit l’instance Fastify, enregistre les routes et ne renvoie pas de valeur. Les routes modifient les groupes et les appartenances des comptes.
  - `GET /groups` : renvoie le catalogue, l’effectif de chaque groupe et les paramètres utiles à l’interface (palette, plafond, identifiants fixes).
  - `POST /groups/create` : crée un groupe et renvoie `{ group }` avec le statut `201`. Refuse les noms en doublon et le dépassement du plafond.
  - `POST /groups/update` : met à jour un groupe et renvoie `{ group }` avec son effectif. La mise à jour est partielle; le groupe par défaut reste modifiable.
  - `POST /groups/delete` : supprime un groupe et renvoie `204`. Avant suppression, réaffecte ses membres au groupe par défaut; les groupes par défaut et administrateurs sont protégés.
  - `POST /groups/members` : ajoute et retire des comptes par adresse, puis renvoie le groupe et le résultat de `changeGroupMembers`. Toute adresse inconnue fait échouer l’appel avant écriture.
- **Points d’attention**
  - Les corps sont validés par les schémas `adminGroup*Body`; la validation locale contrôle nom, description et couleur. Les noms sont comparés via `groupNameKey`.
  - Les adresses sont normalisées avec `normalizeEmail` et dédupliquées. Une entrée dans un groupe remplace l’appartenance précédente; un retrait renvoie au groupe par défaut.
  - Les opérations s’appuient sur `app.groups` et `app.users`. Les membres se consultent via `GET /admin/users?group=<id>`, et non par une route dédiée.

### services/api/routes/admin/myBrain.js

- **Rôle :** routes d’administration pour consulter et configurer la connexion de myBrief au myBrain de l’organisation, tester cette connexion et vérifier le droit `nourrir`. Réservé aux administrateurs.
- **Export par défaut — `adminMyBrainRoutes(app)`**
  - **Paramètre :** instance Fastify `app`.
  - **Retour :** aucun retour explicite ; enregistre les routes.
  - **Effets de bord :** expose `GET /settings/mybrain`, `POST /settings/mybrain` et `POST /settings/mybrain/test` ; lit ou met à jour les réglages et leur vérification.

- **Routes :**
  - `GET /settings/mybrain` : renvoie les réglages publics, sans clé.
  - `POST /settings/mybrain` : applique un patch de connexion et/ou de politique. Vérifie la connexion si l’URL ou la clé change, puis enregistre le patch et les résultats de vérification.
  - `POST /settings/mybrain/test` : teste les valeurs fournies, complétées par celles enregistrées ; ne persiste pas un brouillon. Met à jour la vérification uniquement si les valeurs testées sont celles enregistrées. Un corps absent est traité comme `{}`.

- **Points d’attention :**
  - Champ absent = inchangé ; pour l’enregistrement, une clé vide la retire. Dans le test, un champ vide signifie « utiliser la valeur enregistrée ».
  - Changer d’hôte sans fournir une nouvelle clé est refusé (`mybrain_key_required`) afin d’éviter d’envoyer la clé enregistrée à une nouvelle adresse.
  - Une connexion configurée exige le droit `nourrir`. Les erreurs `MyBrainError`, y compris les réponses myBrain 401/403, sont renvoyées en 400 avec un slug.
  - Le corps rejette les propriétés supplémentaires et borne les longueurs de l’URL et de la clé. Les normalisations et limites dépendent de `myBrainSettings.js`.
  - Dépendances : `requireAdmin`, `fail`, `MyBrainError`, `app.myBrain`, `app.myBrainSettings` ; `app.myBrainSettings.toPublic` garantit que la clé ne ressort pas.

### services/api/routes/configChecks.js

- Enregistre la route `GET /config-checks` pour diagnostiquer la configuration du compte du demandeur, sans permettre de cibler un autre compte.
- Fonction exportée par défaut `configChecksRoutes(app)` :
  - **Paramètre :** `app`, instance de l’application.
  - **Retour :** valeur de retour de l’enregistrement de la route.
  - **Effet de bord :** crée un cache de verdicts partagé entre les requêtes de cette route et enregistre le handler.
- Le handler authentifie l’utilisateur avec `requireUser(req, reply)` ; si aucun utilisateur n’est retourné, il s’arrête et renvoie `undefined`. Sinon, il répond avec `{ issues: await accountChecks(app, user, { cache }) }`.
- **Points d’attention :** les vérifications et leur logique sont déléguées à `lib/configChecks.js`. Le cache est créé une fois à l’enregistrement des routes.

### services/api/routes/myBrain.js

- **Rôle** : expose les réglages et les envois MyBrain côté utilisateur. Les données de réunion sont relues en base sous le scope du compte ; la destination provient des réglages d’organisation.
- **Export par défaut — `myBrainRoutes(app)`** : enregistre les routes Fastify et le limiteur d’envois par compte. À la fermeture de l’application, arrête ce limiteur.
  - `GET /mybrain/settings` : authentifie l’utilisateur et retourne sa vue MyBrain (`available`, `policy`, `enabled`, `active`, `reviewUrl`, derniers envois). Les envois récents sont limités à 8 et ne contiennent pas le contenu des réunions.
  - `POST /mybrain/settings` — `{ enabled: boolean }` : vérifie l’origine, l’activation et la politique, puis met à jour le choix de l’utilisateur et retourne la vue actualisée. Répond `409` si MyBrain est désactivé ou imposé.
  - `POST /mybrain/send` — `{ meetingId: string }` : vérifie l’origine, applique une limitation par compte, contrôle l’éligibilité et la propriété de la réunion, puis tente un nouvel envoi et retourne la vue actualisée. Répond notamment `409` si la réunion est déjà envoyée, en cours d’enregistrement ou non réessayable ; `404` si elle est introuvable ; `429` si le quota est dépassé ; `502` en cas d’erreur MyBrain.
- **Points d’attention** :
  - Authentification via `requireUser` ; les écritures contrôlent aussi l’origine via `isSameOrigin`.
  - Le choix utilisateur n’est modifiable qu’avec la politique `optin` ; les politiques `forced` ou fermée produisent un conflit `409`, pas une erreur d’authentification.
  - Un renvoi est réservé aux réunions ayant déjà un état d’envoi, non envoyées et non ambiguës ; l’envoi n’est pas rétroactif. Un envoi déjà réclamé par un autre déclencheur répond `409`.
  - Dépend des réglages et dépôts MyBrain, de `feedMeetingToMyBrain`, du scope propriétaire `ownerFilter`, du limiteur configuré dans `app.config.rateLimits.myBrainSendByAccount` et de la base MongoDB (`resume`).

### services/api/routes/quota.js

- Enregistre la route `GET /quota`, qui fournit le statut du quota de minutes de réunion du compte courant, notamment pour les rafraîchissements de l’interface.
- Fonction exportée par défaut : `quotaRoutes(app)` — ne retourne pas de valeur utile ; enregistre la route sur `app`.
  - La route vérifie l’identité avec `requireEmail(req, reply)`. Si la vérification échoue, elle interrompt le traitement.
  - Sinon, retourne le résultat de `app.quota.statusFor(req.user)`.
- Points d’attention :
  - Cette route expose le statut du quota, mais ne refuse pas les opérations ; les contrôles de refus sont dans `routes/ai.js`.
  - Le calcul du quota est délégué à `lib/quota.js`. La forme initiale est fournie par `/init` (`routes/core.js`).

### services/api/routes/stats.js

- Enregistre la route `GET /stats/me` pour fournir les statistiques personnelles et le crédit de temps du compte courant, sur la période demandée.
- Fonction exportée par défaut `statsRoutes(app)` :
  - `app` : instance Fastify, avec `db` et `quota`.
  - Retour : aucun retour explicite ; enregistre la route.
  - Effet de bord : ajoute la route `GET /stats/me`.
- La route valide la query avec `personalStatsQuery`, obtient l’adresse via `requireEmail`, puis appelle `personalStats` avec `db`, `quota`, l’email, `req.user?.doc` et `range` (par défaut `month`). Si l’email est absent, elle s’arrête après l’appel à `requireEmail`.
- Points d’attention : le calcul est délégué à `lib/personalStats.js`, partagé avec la route d’administration ; le comportement pour les périodes acceptées dépend du schéma `personalStatsQuery`.

### services/api/lib/mistral.js

- Client minimal de l’API Mistral : jeton pour la transcription en direct, transcription de fichiers et génération de comptes rendus. Utilise `createKeyedRequester` et `UpstreamError` de `openai.js` ; URL par défaut : `https://api.mistral.ai/v1`.
- Fonctions exportées :
  - `chatText(content)` — extrait et concatène les morceaux `text` d’une réponse de chat, ou retourne la chaîne reçue. Ignore les morceaux de raisonnement et retourne `''` si le contenu n’est ni une chaîne ni une liste exploitable.
  - `verifyMistralKey({ apiKey, baseUrl?, fetchImpl?, timeoutMs? })` — teste la clé avec `GET /models` ; résout en `{ ok: true }` ou lève `UpstreamError` avec le statut et le corps de l’erreur. Délai par défaut : 15 s.
  - `createMistralClient({ apiKey, baseUrl?, timeoutMs?, fetchImpl? })` — crée un client et expose :
    - `realtimeClientSecret(model, { key? }?)` — demande un jeton court via `POST /client/sessions` ; retourne la réponse de l’API (`client_secret`). `key` permet d’utiliser une clé candidate sans l’enregistrer.
    - `chat({ model, messages, verbosity?, reasoningEffort?, timeoutMs?, key? })` — appelle `POST /chat/completions` et retourne le texte extrait de la première réponse, ou `''` si absent. `verbosity` et `reasoningEffort` sont ignorés ; `key` permet une clé candidate.
    - `transcribe({ path?, buffer?, filename?, mimetype?, model })` — envoie le fichier à `POST /audio/transcriptions` et retourne `{ text }` (chaîne vide si absent). Lit `path` avec `openAsBlob`, sinon construit un `Blob` depuis `buffer`.
- Points d’attention :
  - `apiKey` peut être une chaîne ou une fonction relue à chaque appel ; la clé reste côté serveur. `fetchImpl` est injectable pour les tests.
  - Pour la transcription, fournir `path` ou `buffer` ; le modèle est requis. Aucun paramètre de langue n’est envoyé : Voxtral la détecte. Les redirections sont refusées.
  - Le jeton temps réel est lié au modèle ; la langue est transmise séparément par le navigateur.

### services/api/lib/assemblyai.js

- Client AssemblyAI pour la transcription de fichiers et l’obtention de jetons temporaires pour le direct. L’authentification transmet la clé telle quelle dans `Authorization` (sans `Bearer`).
- Fonctions exportées :
  - `verifyAssemblyAiKey({ apiKey, fetchImpl? })` — demande un jeton pour vérifier la clé candidate ; retourne `{ ok: true }` ou lève une erreur amont. N’effectue pas de transcription.
  - `createAssemblyAiClient({ apiKey, timeoutMs?, fetchImpl?, sleep?, now? })` — retourne un client ; `apiKey` peut être une chaîne ou une fonction relue à chaque requête. Les dépendances injectables permettent les tests.
    - `realtimeClientSecret(_model, { key? }?)` — retourne `{ client_secret: { value } }`, enveloppe commune du jeton temporaire ; `key` permet de tester une clé candidate. Lève une erreur si aucun jeton n’est renvoyé. Le modèle n’est pas utilisé.
    - `transcribe({ path?, buffer?, mimetype?, model })` — envoie le fichier, lance la transcription avec le modèle demandé et `universal-2` en repli, puis interroge son état ; retourne `{ text }`. Effet notable : lectures réseau répétées toutes les 3 s, pendant au plus 10 min.
- Points d’attention :
  - Fournir `path` ou `buffer` ; si les deux sont fournis, `path` est prioritaire. `mimetype` vaut par défaut `application/octet-stream`.
  - La transcription utilise la détection automatique de langue. Les statuts en erreur ou l’absence d’URL d’envoi / d’identifiant entraînent une erreur amont ; l’échéance dépassée entraîne une erreur 504.
  - Dépend de `node:fs` (`openAsBlob`) et de `./upstream.js` (requêtes authentifiées, erreurs et temporisation). Utilise les hôtes AssemblyAI globaux, sans bascule européenne.

### services/api/lib/speechProviders.js

- Regroupe les clients de transcription Mistral, Speechmatics et AssemblyAI, la vérification de leurs clés et le nettoyage des clés saisies. Les clients respectent le contrat de transcription et de création de secret temps réel ; Mistral fournit aussi `chat()`.
- `createSpeechClients(resolveKey)` — reçoit une fonction asynchrone `(provider) => Promise<string>` et retourne un objet `{ mistral, speechmatics, assemblyai }` de clients. Chaque client relit sa clé via `resolveKey` à chaque appel, pour appliquer les changements sans redémarrage.
- `verifyProviderKey(provider, key)` — vérifie une clé candidate auprès du fournisseur et retourne le résultat de son vérificateur. Peut rejeter avec une `UpstreamError` en cas de refus du fournisseur. Un nom de fournisseur inconnu ne dispose pas de vérificateur.
- `normalizeProviderKey(raw)` — convertit l’entrée en chaîne, retire tous les espaces et retourne `{ key, problem }`. `problem` vaut `''` pour une clé plausible, `provider_key_looks_openai` pour une clé `sk-…`, ou `provider_key_malformed` si elle compte moins de 20 caractères. Ne valide pas la clé auprès du fournisseur.
- **Dépendances :** clients et vérificateurs importés de `mistral.js`, `speechmatics.js` et `assemblyai.js` ; les erreurs amont sont des `UpstreamError` définies dans `openai.js`.

### services/api/lib/speechmatics.js

- Client Speechmatics pour obtenir une clé temporaire de transcription en direct et transcrire des fichiers via l’API de tâches, hébergée dans l’UE.
- Fonctions exportées :
  - `verifySpeechmaticsKey({ apiKey, fetchImpl? })` — vérifie la clé en demandant une clé temporaire ; retourne `{ ok: true }`. Effet notable : appel réseau, sans créer de transcription.
  - `createSpeechmaticsClient({ apiKey, timeoutMs?, fetchImpl?, sleep?, now? })` — crée un client ; `apiKey` peut être une chaîne ou une fonction relue à chaque requête. Retourne :
    - `realtimeClientSecret(_model, { key? }?)` — retourne `{ client_secret: { value } }`, clé temporaire valable 60 s. `key` permet de tester une clé candidate.
    - `transcribe({ path?, buffer?, filename?, mimetype?, model, lang? })` — retourne `Promise<{ text: string }>` ; téléverse le fichier, crée une tâche puis attend son achèvement. Utilise `path` s’il est fourni, sinon `buffer`.
- Points d’attention :
  - `transcribe` accepte les modèles `melia-1` et `enhanced` ; la langue par défaut est `fr`.
  - La tâche est interrogée avec une attente serveur de 30 s, jusqu’à une limite de 10 min ; les états `rejected`, `deleted` et `expired` échouent. Une tâche sans identifiant ou sans clé temporaire produit aussi une erreur amont.
  - Si le texte n’est pas inclus dans la réponse finale, il est relu via `/transcript`.
  - Dépendances : `node:fs` (`openAsBlob`), `FormData`, `Blob`, `fetch` et les utilitaires de `./upstream.js`. Les options `fetchImpl`, `sleep` et `now` sont injectables pour les tests.

### services/api/lib/upstream.js

- Fournit des utilitaires communs aux clients de fournisseurs TIERS : résolution de clé à chaque appel, authentification, relances et transmission des erreurs amont sous forme d’`UpstreamError`.
- Fonctions exportées :
  - `retryOnUpstream(err)` — indique si l’erreur doit être relancée : panne réseau, statut 429 ou statut 5xx.
  - `missingKeyBody(label, provider)` — renvoie en JSON le corps d’erreur indiquant qu’une clé manque. N’effectue aucune requête.
  - `upstreamFailure(status, message, code)` — construit une `UpstreamError` avec un corps JSON synthétique.
  - `createKeyedRequester({...})` — crée une fonction `request(path, init?, options?)`, qui renvoie une `Promise` de JSON ou de texte. Lit la clé via `resolveKey`, sauf si une clé candidate est fournie dans `options`; ajoute les en-têtes d’authentification et appelle `fetchImpl`. Une réponse non réussie devient une `UpstreamError`; les erreurs réseau, 429 et 5xx sont relancées selon `withRetry`.
  - `defaultSleep(ms)` — renvoie une `Promise` résolue après `ms` millisecondes.
- Points d’attention :
  - Sans clé, `request` lève une `UpstreamError` de statut 503 **hors** des relances.
  - `path` peut être relatif à `baseUrl` ou être une URL absolue. `options.timeoutMs` remplace le délai par défaut pour cet appel.
  - Une clé candidate sert aux tests et n’est pas stockée. `fetchImpl` est injectable; par défaut, il s’agit de `fetch`.
  - Dépend de `retry.js` (`withRetry`, `isNetworkError`) et de `openai.js` (`UpstreamError`). Les erreurs HTTP amont conservent leur statut, leur corps texte et leur type de contenu.

### services/api/lib/summaryModels.js

- Centralise les modèles disponibles pour la rédaction des comptes rendus, leur fournisseur et la résolution du modèle effectif.
- Exports :
  - `DEFAULT_SUMMARY_MODEL` : identifiant du modèle par défaut (`gpt-5.4`), seul modèle mesuré.
  - `SUMMARY_PROVIDERS` : objet associant chaque identifiant accepté à `openai` ou `mistral`, dans l’ordre d’affichage.
  - `SUMMARY_MODELS` : tableau des identifiants acceptés, dérivé des clés de `SUMMARY_PROVIDERS`.
  - `isSummaryModel(id)` : retourne `true` si `id` est une clé propre de `SUMMARY_PROVIDERS`, sinon `false`.
  - `summaryProvider(id)` : retourne le fournisseur du modèle ; retourne `openai` si l’identifiant n’est pas listé.
  - `summaryClient(app, model)` : retourne `app.openai` ou `app.speech[provider]`, le client utilisé pour rédiger. Dépend des clients fournis dans `app`.
  - `resolveSummaryModel(stored, envModel)` : retourne le modèle enregistré s’il est accepté, sinon la valeur d’environnement `OPENAI_MODEL_SUMMARY` (nettoyée), sinon `DEFAULT_SUMMARY_MODEL`.
- Points d’attention :
  - La liste est un garde-fou pour les valeurs de l’administration ; une valeur d’environnement non vide est conservée même si elle n’est pas listée.
  - Un identifiant non listé est associé à OpenAI par `summaryProvider`.
  - Les performances et la fidélité au scaffold des modèles ajoutés sans mesure restent à valider en recette ; le défaut demeure le seul modèle mesuré.
  - Le filtrage des paramètres propres aux modèles est géré par `lib/openai.js`, pas par ce fichier.
