# api

### services/api/app.js

- **Rôle du fichier**
  - Construit et configure l’instance Fastify de l’API principale (`mybrief-api`), de façon indépendante de l’environnement (pour test, portabilité et injection de dépendances).
  - Définit les limites (payloads JSON, multipart) dimensionnées sur les usages réels (transcriptions longues, audio).
  - Regroupe et enregistre tous les plugins/routes API, et centre la configuration (dependencies injection).

- **Fonctions/constantes exportées**
  - `BODY_LIMIT`
    - Limite maximale du corps des requêtes HTTP : `32 Mo`.
  - `FILE_LIMIT`
    - Taille maximale (octets) d’un fichier envoyé en multipart : `25 Mo`.
  - `FIELD_LIMIT`
    - Limite (octets) pour la taille d’un champ multipart, alignée sur `MAX_CONTENT` (action documents).
  - `buildApp({ ...deps })`
    - **Paramètres** : objet de dépendances :
      - `db` (Mongo Client, obligatoire)
      - `openai` (client OpenAI, obligatoire)
      - `mailer` (optionnel, faux par défaut / en mode test)
      - Moyens de surcharger d’autres dépendances : `verifyApiKey`, `gmailSend`, `graphSend`, `gmailRevoke`, `driveStore`, `driveBrowser`, `config`, etc.
      - `logger` (désactivé par défaut)
    - **Retour** : instance Fastify entièrement configurée (routes, plugins, décorateurs…).
    - **Effets de bord notables** :
      - Les dépendances sont ajoutées comme décorateurs sur l’instance Fastify pour un accès global dans les routes/plugins.
      - Configuration des routes sous `/api`, et de certains endpoints hors `/api` (`/oauth2/*`, `/auth/mobile/*`).
      - Enregistre un gestionnaire d'erreur unifié via `slugErrorHandler`.
      - Multiplie les points d’injection/fakes pour que les tests ne fassent jamais d’accès réseau réel.

- **Points d’attention & edge cases**
  - **bodyLimit/multipart limits** : par défaut Fastify coupe les corps > 1Mo sans signaler l’erreur ; ici porté à 32Mo/25Mo pour éviter toute troncature silencieuse sur des payloads légitimes.
  - **Injection/décoration de dépendances** : TOUTE dépendance externe (OpenAI, stockage drive, envoi mail, …) est décorée/injectable, notamment pour permettre des mocks/espions en tests unitaires.
  - **Sécurité/trustProxy** : paramètre `trustProxy` activé, nécessaire dans l’architecture Docker+proxy pour que le rate-limit et l’IP source soient corrects (sinon DoS possible par blocage global).
  - **Synchronisation des limites** : l’alignement `FIELD_LIMIT`/`MAX_CONTENT` est essentiel : il faut changer les deux ensemble pour éviter des situations où les gros contenus passent en JSON mais sont refusés en multipart.
  - **Plug-ins “hors /api”** : certaines routes d’auth/OAuth ne passent pas par l’`authPlugin`, par nécessité opérationnelle (entra relay, mobile, etc.).
  - **Dépendances critiques** :
    - `lib/config.js`, `lib/errors.js`, `lib/crypto/secretBox.js` — tout changement dans leur comportement impacte toute l’API.
    - Décorateurs construisant des accès Mongo (`createXRepo`) : dépendant du schéma et des TTL de config.
  - **Composabilité/testabilité** : Le fichier est fait pour ne jamais toucher directement l’environnement ou lancer le serveur : possibilité d’utiliser `.inject()` sur l’instance retournée pour tout test unitaire ou d’intégration.
  - **Désactivation des mails** : sans dépendance explicite fournie (`mailer`), toute tentative d’envoi mail lèvera l’erreur `'mailer_disabled'` (pas de no-op silencieux).

### services/api/lib/actions/document.js

- **Rôle du fichier**
  - Centralise la validation et la normalisation des documents soumis à l’API (transcriptions, résumés), via JSON ou multipart/form-data.
  - Garantit l’unicité des règles de validation entre plusieurs points d’entrée (ajv et flux multipart).
  - Fournit des bornes (tailles, formats) réutilisables dans toute l’application.

- **Fonctions et constantes exportées**
  - `MAX_CONTENT` : Taille maximale du champ `content` (2 Mo).
  - `TITLE_MAX` : Longueur maximale du titre (300 caractères).
  - `DOCUMENT_KINDS` : Liste des types de documents acceptés (`transcription`, `summary`).
  - `DOCUMENT_LANGS` : Langues acceptées (`fr`, `en`).
  - `MEETING_ID_MAX` : Longueur maximale pour un ID de réunion (UUID) : 64 caractères.
  - `actionDocumentSchema` : Schéma de validation JSON ajv des documents.
  - `jsonOnlyBody` : Sous-schéma OpenAPI : applique `actionDocumentSchema` uniquement pour les requêtes JSON.
  - `safeFilename(name, fallback)`
    - **Paramètres** :  
      - `name` : Nom de fichier à nettoyer.  
      - `fallback` : Valeur de repli si le nom est vide (`document` par défaut).
    - **Retour** : Chaîne nettoyée, sans caractères interdits pour les systèmes de fichiers, max. 200 caractères.  
    - **Effets de bord** : Aucun.
    - **Remarques** : Évite les noms masqués ou risquant la traversée de répertoire (`..`).
  - `normalizeDocument(raw)`
    - **Paramètres** :  
      - `raw` : Objet brut possiblement partiel (voir schéma plus haut).
    - **Retour** :  
      - `{ document }` normalisé, prêt à l’usage,  
      - ou `{ error: 'invalid_kind'|'invalid_content' }` selon l’erreur rencontrée.
    - **Effets de bord** : Aucun (ne modifie pas l’entrée).
    - **Remarques** : Unifie la validation pour tous les points d’entrée, bornes ré-appliquées ; distingue la cause des erreurs.
  - `readMultipartDocument(req)`
    - **Paramètres** :  
      - `req` : Requête HTTP Fastify avec support multipart (ex : via @fastify/multipart).
    - **Retour** :  
      - Promise résolue avec :
        - `{document, approved, file}` si succès,
        - ou `{error}` en cas d’échec (ex : fichier manquant, trop volumineux...).
    - **Effets de bord** : Lit le flux fichier, conversion en Buffer, appelle `normalizeDocument` sur champs multipart ; pourrait throw hors erreur prévue.
    - **Remarques** : Les destinataires/dossiers ne doivent en aucun cas être lus/écrits ici.

- **Points d’attention & edge cases**
  - **Multipart** : ajv ne peut pas valider les requêtes multipart ; la validation se fait en JS pur avec `normalizeDocument`.
  - **Validation stricte** : Les propriétés additionnelles sont interdites (`additionalProperties: false` dans le schéma) ; le backend doit veiller à ne pas enrichir le document d’autres champs dans ce module.
  - **Sécurité des noms de fichiers** : Seuls certains caractères sont filtrés dans les noms de fichiers (ne supprime pas espace, tiret, etc. pour conservation des noms lisibles/utiles).
  - **Limites coordonnées** : Il faut veiller à garder en cohérence la limite de taille côté JSON (MAX_CONTENT) et du middleware multipart (`fieldSize` dans app.js).  
  - **Effets de flux** : En multipart, le fichier DOIT être consommé pour ne pas bloquer la requête, même si la validation échoue ensuite.
  - **Dépendances** :
    - `@fastify/multipart` : pour le traitement des fichiers uploadés.
    - Toute incohérence du schéma/constantes impactera potentiellement plusieurs couches de validation.
  - **meetingId** : N’est pas une destination, mais une référence (cf. `lib/actions/resolve.js`). Risque limité si forgé, car scope utilisateur vérifié en aval.  
  - **langue par défaut** : Si non spécifiée ou non valide, la langue par défaut est `'fr'`.  
  - **Longueur de titre/contenu** : Sont systématiquement tronqués si dépassement (pas

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

- **Rôle du fichier**  
  Résout de façon centralisée et déterministe tous les paramètres d'une action (destinataires, dossiers, modèles, etc.), en appliquant les priorités (utilisateur > organisation > valeur par défaut) et en tenant compte des "tags" associés à un dossier (pour le classement).

- **Fonctions exportées**
  - `todayPart(now = new Date())`
    - **Paramètres** : `now` (Date, optionnel)
    - **Retour** : `string` (format AAAA-MM-JJ, heure locale)
    - **Effets de bord** : Aucun
  - `templateVars({ document, account })`
    - **Paramètres** : objet `{ document: object, account: string }`
    - **Retour** : objet `{ titre, date, type, compte }` utilisé pour alimenter les gabarits de mails/fichiers
    - **Effets de bord** : Aucun
  - `resolveActionContext(app, { user, document, ignorePersonal? })`
    - **Paramètres** :
      - `app` : instance Fastify
      - `{ user, document, ignorePersonal? }` :
        - `user` : objet utilisateur (doit avoir `email`)
        - `document` : objet document (doit avoir au moins `kind`, `lang`, peut avoir `meetingId`, `title`)
        - `ignorePersonal` : booléen optionnel (par défaut `false`) — pour simuler une action "sans réglages personnels" (utilisé par les admins)
    - **Retour** : `{ toggles, recipients, subject, filename, folder, tag, requireApproval, policy, provider }`
      - Chaque champ possède sa source (`user` | `admin` | `builtin`), pour la traçabilité.
    - **Effets de bord** :  
      - Accès base de données (lecture dans les collections `resume` pour l'extraction de tag, `tags` pour info de classification).
      - Appelle des fonctions utilitaires dépendantes d'autres parties de l'API.

- **Points d'attention**
  - **Priorité stricte** des sources de configuration : utilisateur > organisation > défaut intégré ; à l’exception des "interrupteurs" (toggles) qui sont contrôlés uniquement côté administration.
  - **Sécurité** :
    - Le tag (classement/rangement) n’est jamais fourni par la requête, toujours relu en base avec contrôle de scope (évite l'accès à des dossiers tiers via un `tagId` contrefait).
    - La destination d’un stockage combine dossier ET bibliothèque (drive). Un bug passé montre qu'il faut toujours vérifier les deux, pas seulement le chemin.
  - **Edge cases** :
    - Tag absent, supprimé, ou conversation non possédée ⇒ fallback sur dossier par défaut, sans erreur.
    - Nom de tag : les `/` dans les labels de tag sont neutralisés pour éviter la création de chemins inattendus.
    - Simuler l’absence de réglage utilisateur (`ignorePersonal`) désactive aussi l’approbation automatique de dépôt.
  - **Dépendances** :
    - `./recipients.js` (résolution des destinataires)
    - `./templating.js` (rendu des modèles de mails/fichiers)
    - `../ownerScope.js` (filtrage/scopage propriétaire pour l'accès DB)
    - `../../routes/tags.js` (constante de nom de collection pour les tags)
    - Appuie sa logique métier sur la structure et les valeurs d’administration (`app.settings.getActions()`).

- **Particularités**
  - Il s'agit de **l'unique point** de résolution des paramètres d'action, utilisé aussi bien par l’exécution normale que par le bouton « Tester » (tests réalistes).
  - Structure de retour documentée et source de chaque paramètre, pour auditabilité et debugage dans l’interface admin.

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

- **Rôle du fichier :**
  - Genère un document de test destiné à vérifier la configuration du système d’envoi de documents (droits, accès, nommage, etc.) via la même chaîne d’exécution qu’une action réelle, sans recourir à des données de réunion réelles.
  - Produit systématiquement un fichier `.txt` (jamais de PDF, car la génération PDF dépend d’outils spécifiques au navigateur).

- **Fonctions exportées :**
  - `buildTestDocument({ user, kind = 'summary', lang = 'fr', now = new Date() })`
    - **Paramètres :**
      - `user` (objet, requis) : doit contenir au moins la propriété `email`
      - `kind` (`'transcription'` | `'summary'`, optionnel, défaut: `'summary'`)
      - `lang` (code langue, `'fr'` ou `'en'`, optionnel, défaut: `'fr'`)
      - `now` (objet `Date`, optionnel, défaut: `nouvelle date`)
    - **Retour :**
      - Objet contenant :
        - `document` (formaté et normalisé comme pour un envoi réel)
        - `file` :
          - `filename` : `'mybrief-test.txt'`
          - `content` : Buffer du contenu texte indiquant origine et date de dépôt
          - `contentType` : `'text/plain; charset=utf-8'`
    - **Effets de bord notables :**
      - Aucun effet de bord direct, mais le fichier généré n’est pas supprimé après test (permet à l'utilisateur de vérifier la présence et la réussite du dépôt).

- **Points d’attention :**
  - **Dépendances :** utilise la fonction `normalizeDocument` du même dossier (`./document.js`), garantissant que la normalisation suit le même traitement que pour les documents réels.
  - **Edge cases :**
    - Paramètre `lang` : si la langue n’est pas supportée, français par défaut (`TEXTS.fr`)
    - Le paramètre `kind` impacte le format (`'summary'` génère du HTML, `'transcription'` du texte brut)
    - La propriété `user.email` doit être renseignée pour générer le document correctement
  - **Design :**
    - Le document est créé pour être visible par l’utilisateur dans la cible (non supprimé automatiquement)
    - Le contenu et le nom du fichier servent de preuve technique du bon fonctionnement (dossier, droits, etc.), mais pas des capacités de rendu avancé (PDF non couvert)

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

- **Rôle du fichier**
  - Centralise la logique commune des flux OAuth 2.0 / OIDC (avec PKCE et contrôle anti-CSRF) utilisée pour :
    - La connexion utilisateur (SSO)
    - L'autorisation d'accès à un compte externe (ex : envoi d’emails tiers)
  - Évite la duplication de code critique de sécurité entre les différents flux OAuth.
  - Ne gère pas les cas de redirection ou le traitement métier du profil utilisateur.

- **Fonctions exportées**

  - `createStateCookie(app, name)`
    - **Paramètres** :
      - `app` : Instance Fastify.
      - `name` : Nom du cookie de flux.
    - **Retour** : `{ name, set(reply, state), clear(reply) }`
      - Méthodes pour poser et nettoyer le cookie d’état CSRF d’un flux.
    - **Effet de bord** : Pose/efface un cookie HTTP sur la réponse.
    - **Point d’attention** : Le nom du cookie doit être spécifique par flux pour éviter les collisions si plusieurs flux sont actifs en parallèle.

  - `endpointsFor(provider, conf)`
    - **Paramètres** :
      - `provider` : Déclaration du fournisseur OAuth (ex : Google, Microsoft).
      - `conf` : Configuration du fournisseur (clientId, discoveryUrl…).
    - **Retour** : Les endpoints OIDC extraits via discovery/fallback.
    - **Dépendances** : Dépend de `getEndpoints`.

  - `startOAuth(app, req, reply, opts)`
    - **Paramètres** :
      - `app` : Instance Fastify.
      - `req` : Requête entrante.
      - `reply` : Réponse HTTP.
      - `opts` :
        - `cookie`: Cookie d’état du flux (`{set}`)
        - `flow`: Tag du flux
        - `clientId`, `redirectUri`, `endpoints`, `scopes`
        - `next?`: Redirection finale
        - `meta?`: Métadonnées à stocker dans l’état
        - `extraParams?`: Params additionnels pour l’URL d’auth
    - **Retour** : `Promise<string>` URL de redirection vers l’IdP.
    - **Effet de bord** : Génère et stocke le state anti-CSRF ; met le PKCE en base ; pose un cookie d’état.
    - **Point d’attention** : Le code_verifier n’est jamais exposé au navigateur, seulement persisté côté serveur.

  - `consumeState(app, req, reply, opts)`
    - **Paramètres** :
      - `app` : Instance Fastify.
      - `req` : Requête entrante.
      - `reply` : Réponse HTTP.
      - `opts` :
        - `cookie`: Cookie d’état du flux
        - `flow`: Tag du flux à valider
        - `state?`, `code?`: Valeurs reçues depuis l’URL de retour de l’IdP
    - **Retour** : `Promise<{ok: true, pending}|{ok: false}>`
      - Retourne le document d’état prêt pour l’échange si toutes les vérifications passent.
    - **Effet de bord** : Supprime systématiquement le cookie d’état (mitigation CSRF).
    - **Points d’attention** :
      - Vérifie le triple contrôle (état dans l’URL, le cookie, la base) et la correspondance du `flow`.
      - En cas d’échec du contrôle, le cookie est quand même supprimé.  
      - Prise en charge d’anciens documents sans champ provider (suppose ‘google’ par défaut).

  - `exchangeForProfile({ code, conf, pending, endpoints })`
    - **Paramètres** :
      - `code`: Code d’autorisation à échanger.
      - `conf`: Credentials client (id, secret).
      - `pending`: Document d’état (redirectUri, codeVerifier).
      - `endpoints`: Endpoints OIDC.
    - **Retour** : `Promise<{tokens, profile}>` (tokens OAuth + profil utilisateur)
    - **Effet de bord** : Aucun.
    - **Point d’attention** :
      - Lève une erreur si l’échange code/token ou la récupération du profil échoue (doit être catch côté appelant).

- **Points d’attention & Edge Cases**
  - **Cookies** : Chaque flux doit avoir un nom de cookie unique pour éviter l’écrasement (ex : Google connect vs login).
  - **Consommation d’état** : Un état consommé est détruit (anti-rejeu). Impossible de retraiter le même retour.
  - **Provider anciens** : Si le document d’état n'a

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

- **Rôle du fichier :**
  - Implémente un client générique OAuth 2.0 / OpenID Connect (OIDC) utilisé par l’API pour interagir avec des fournisseurs OIDC (sans code spécifique à un fournisseur).
  - Centralise les opérations courantes OIDC : découverte des endpoints, PKCE, génération d’URL, échange de code contre token, récupération d’infos utilisateur.
  - Externalise toute connaissance fournisseur vers `providers.js` (URL, scopes, claim email, etc.).

- **Fonctions exportées :**
  - `getEndpoints({ discoveryUrl, fallback?, fetchImpl? })`
    - **Paramètres** : URL de découverte OIDC, fallback éventuel (endpoints), implémentation fetch alternative.
    - **Retour** : Promise résolue avec `{ authorization_endpoint, token_endpoint, userinfo_endpoint }`.
    - **Effet de bord** : met en cache les endpoints OIDC par URL pour accélérer les accès suivants.
    - **Exceptions** : lève si la découverte échoue et pas de fallback fourni.
  - `createPkcePair()`
    - **Paramètres** : aucun.
    - **Retour** : `{ verifier, challenge }` (chaîne aléatoire + hash : PKCE S256).
    - **Effet de bord** : aucun.
  - `buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, endpoints, scopes?, loginHint? })`
    - **Paramètres** : infos client, PKCE, endpoints, scopes optionnel, loginHint optionnel.
    - **Retour** : URL (string) de l’endpoint d’autorisation OIDC.
    - **Effet de bord** : aucun.
  - `exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier, endpoints, fetchImpl? })`
    - **Paramètres** : code auth retourné, crédentials client OIDC, endpoints, codeVerifier PKCE, fetch alternative.
    - **Retour** : Promise `{ access_token: … }` (et potentiellement autres data OIDC).
    - **Effet de bord** : effectue un POST sur l’endpoint de token.
    - **Exceptions** : lève en cas d’échec (message avec statut HTTP uniquement, pas le contenu).
  - `fetchUserInfo({ accessToken, endpoints, fetchImpl? })`
    - **Paramètres** : token d’accès, endpoints OIDC, fetch alternative.
    - **Retour** : Promise avec claims OIDC (au moins `sub`, possiblement email, name, upn, etc.).
    - **Effet de bord** : aucun.
    - **Exceptions** : lève si l’appel échoue.
  - `resetDiscoveryCache()`
    - **Paramètres** : aucun.
    - **Retour** : void.
    - **Effet de bord** : vide le cache interne des endpoints (utile pour les tests).

- **Points d’attention :**
  - **Cache** : endpoints découverts mis en cache 24h, possibilité de reset.
  - **Sécurité** : communication uniquement via TLS ; validation de l’identité via userinfo et access_token (pas de vérification JWT en local).
  - **Timeouts** : tous les fetch sont coupés si pas de réponse sous 5s ou 10s selon contextes.
  - **Fallback** : importante pour les cas où la découverte échoue (ex: endpoints dynamiques selon tenant).
  - **Scopes et claims** : la gestion de la claim à utiliser pour l’email, etc., est déléguée à la configuration du fournisseur.
  - **Dépendances** : nécessite l’API native `fetch` ou un polyfill, `node:crypto`, et le module global `AbortSignal`.
  - **Edge cases** : gestion prudente des erreurs (ne jamais relayer de secrets dans les logs), certaines erreurs côté IdP peuvent écho le secret client.

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

- **Rôle du fichier :**
  - Fournit les fonctions de gestion des mots de passe utilisateurs (hachage, vérification, génération, politique), en s'appuyant sur l'algorithme `scrypt` du module natif `node:crypto`.
  - Centralise la politique de mot de passe, le filtrage des mots de passe interdits, et protège contre les attaques par timing (oracle d'existence).

- **Fonctions exportées :**
  - `hashPassword(password: string): Promise<string>`
    - Hache un mot de passe avec `scrypt`, génère un sel aléatoire.
    - Retourne une chaîne auto-descriptive au format : `scrypt$N=...,r=...,p=...$<sel>$<clé>`.
    - **Effet de bord :** Consomme de l'entropie (génère du sel).
  - `verifyPassword(password: string, stored: string): Promise<boolean>`
    - Vérifie si un `password` correspond à un hash `stored` (auto-descriptif).
    - Retourne `true` si l'authentification est bonne, `false` sinon (y compris si `stored` est corrompu).
    - **Effet de bord :** Jamais d'exception lancée pour des données invalides.
  - `dummyHash(): Promise<string>`
    - Retourne un hash bidon, calculé une fois puis réutilisé. Sert à synchroniser la latence côté login quand l'utilisateur n'existe pas (protection contre l'énumération).
  - `burnVerify(password: string): Promise<false>`
    - Appelle une vérification de mot de passe sur un hash bidon pour brûler le même temps CPU qu'une vraie vérification, puis retourne `false`.
  - `checkPasswordPolicy(password: string, ctx?: { email?: string }): {ok: true}|{ok: false, reason: string}`
    - Valide la conformité du mot de passe à la politique locale :
      - Non vide, longueur entre `MIN_PASSWORD_LENGTH` (10) et `MAX_PASSWORD_LENGTH` (200).
      - Interdit les mots de passe trop courants (liste en dur).
      - Interdit un mot de passe contenant l'email (si précisée).
    - Retourne `{ok: true}` ou `{ok: false, reason}`.
  - `generatePassword(bytes?: number = 12): string`
    - Génère un mot de passe aléatoire, lisible, en base64url.
    - **Effet de bord :** Consomme de l'entropie (`randomBytes`).

- **Constantes exportées :**
  - `SCRYPT_PARAMS` – Paramètres recommandés pour scrypt (N=16384, r=8, p=1, keylen=64, maxmem=64Mo).
  - `MIN_PASSWORD_LENGTH` – Longueur minimale (10).
  - `MAX_PASSWORD_LENGTH` – Longueur maximale (200).

- **Points d'attention :**
  - **Déploiement/dépendances :**
    - Utilise `scrypt` de Node, pas de dépendance native externe, compatible toutes plateformes Node >= 10.
    - Pas d’outil de build natif requis (avantage pour CI/CD & docker Alpine).
  - **Hash auto-descriptif :**
    - Les paramètres de scrypt sont inclus dans chaque hash (renouvelabilité de la politique sans invalider l’existant).
  - **Gestion des erreurs :**
    - `verifyPassword` ne lève jamais : un hash corrompu/ancien ne provoque pas d’exception en base, la connexion est juste refusée.
  - **Sécurité/timing attacks :**
    - Pour login d’utilisateur inexistant, dummyHash/burnVerify assurent une latence identique à une vérification réelle.
  - **Edge cases :**
    - Les saisies de mot de passe > 200 caractères sont rejetées (protection contre DoS via scrypt sur données énormes).
    - Les emails courts ne sont pas pris en compte pour interdire un mot de passe contenant l’email (localPart < 3).
    - La blacklist est indicative, pas une défense forte (l’entropie et la longueur sont prioritaires).
    - Le bootstrap d’admin (hors politique) n’est PAS concerné par `checkPasswordPolicy`.

### services/api/lib/auth/providers.js

- **Rôle du fichier**
  - Définit la configuration et la logique d’activation pour les fournisseurs d’identité OIDC supportés par l’API (ex. Google, Microsoft Entra ID).
  - Centralise les spécificités (URLs, scopes, gestion des emails, codes d’erreur) pour un usage unique par le flux SSO (`routes/auth/ssoFlow.js`).

- **Fonctions / exports**
  - `PROVIDERS`
    - Objet contenant la définition des providers "google" et "entra" :
        - **Attributs principaux** :  
          - `id` (string),  
          - `label` (string),
          - `callbackPath` (string),
          - `startPath` (string),
          - `scopes` (string),
          - `discoveryUrlOf` (function, paramètres varient selon provider),
          - `fallbackEndpoints` (object/null),
          - `requireVerifiedEmail` (boolean),
          - `emailOf(profile)` (function, extrait l’email du profil utilisateur),
          - `errors` (mapping des codes d’erreur spécifiques).
        - **Effets de bord** : aucun direct, pure data/config.
    
  - `PROVIDER_IDS`
    - Tableau contenant la liste des IDs configurés dans `PROVIDERS`.
    - Généré dynamiquement via `Object.keys(PROVIDERS)`.
    - **Effet de bord :** aucun, pure valeur calculée.
  
  - `isProviderUsable(id, settings)`
    - **Paramètres :**
      - `id` (string) : identifiant du provider
      - `settings` (object) : sous-arbre de configuration de l’application pour les providers (doit inclure clientId, clientSecret, etc.)
    - **Retour :**
      - `boolean` : true si le provider d’identité est utilisable (activé + configuration complète)
    - **Effet de bord notable :** aucun, fonction pure.
    - **Implémentation :**
      - Vérifie existence du provider et la présence des valeurs `enabled`, `clientId`, `clientSecret` dans les settings.
      - Pour Entra (pas de `fallbackEndpoints`), exige que l’URL de découverte soit présente.

- **Points d’attention / Edge cases**
  - **Entra** :
    - Le chemin `/oauth2/callback` ne doit **jamais** être modifié sans accès admin Entra.
    - L’URL de redirection et le couple clientId/secret sont hérités du plugin OIDC d’origine.
    - Traefik doit filtrer l’accès à ce callback (middleware `noident`), sinon risque d’usurpation.
    - Pas de fallback pour les endpoints Entra : l’URL de découverte dépend du tenant.
    - `emailOf` doit gérer plusieurs emplacements possibles pour l’email (`email`, puis `preferred_username`, puis `upn`).
  - **Google** :
    - Fallback statique possible pour les endpoints en cas de panne réseau lors du bootstrap.
    - Nécessite que l’email soit vérifié (`requireVerifiedEmail: true`), sinon refus.
  - **Dépendances** :
    - Utilisé par les flux d’authentification OIDC mutualisés (`routes/auth/ssoFlow.js`).
    - Fortement couplé à `appSettings` pour les secrets et configurations runtime.
  - **Edge cases** :
    - Un provider activé mais mal configuré (manque clientId/clientSecret/etc.) est filtré par `isProviderUsable`.
    - Un provider sans discovery URL valide (Entra) sera ignoré.

- **Pas d’effets de bord directs ou d’accès I/O dans ce module.**

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

- **Rôle :**
  - Gestion sécurisée des jetons de réinitialisation de mot de passe via la collection MongoDB `authResetToken`. Émission, consommation atomique, et purge des jetons, dont seul le hash SHA-256 est stocké.

- **Fonctions exportées :**
  - `RESET_COLLECTION`
    - Nom de la collection utilisée : `'authResetToken'`.
  - `createResetTokenStore(db, { ttlMs })`
    - **Paramètres :**
      - `db` : instance de la base MongoDB.
      - `ttlMs` (optionnel) : durée de validité des jetons en ms (défaut : 30 min).
    - **Retour** : objet avec trois méthodes :
      - `issue({ emailLower, ip })`
        - **Paramètres :**
          - `emailLower` (string, obligatoire) : email cible.
          - `ip` (string/null, optionnel) : IP d’émission.
        - **Retour** : `{ token, expiresAt }` (token clair à transmettre à l’utilisateur, date d’expiration).
        - **Effet de bord** : insertion du hash du token dans la collection.
      - `consume(token)`
        - **Paramètre** :
          - `token` (string, obligatoire).
        - **Retour** : `{ emailLower }` si succès, `null` sinon.
        - **Effet de bord** : marque le token comme utilisé (champ `usedAt`) de façon atomique.
      - `purgeFor(emailLower)`
        - **Paramètre** :
          - `emailLower` (string, obligatoire).
        - **Retour** : `undefined` (Promise résolue après suppression).
        - **Effet de bord** : suppression de tous les jetons liés à cet email.

- **Points d’attention :**
  - **Atomicité :** La consommation d’un jeton est atomique (update sur `usedAt: null`), évitant doubles utilisations concurrentes.
  - **Sécurité :** Le token lu/écrit en clair n’est jamais persisté ; seul le hash est en base.
  - **TTL réel :** Index TTL sur la collection, mais contrôle applicatif explicite car Mongo ne purge que périodiquement (~60s).
  - **Dépendances :** Nécessite Node.js `crypto` (pour `randomBytes`, `createHash`), et MongoDB pour la persistence.
  - **Edge cases :**
    - Jetons sans valeur (`null/undefined`) : immédiatement rejetés.
    - Jetons expirés ou déjà utilisés : consommés comme invalides (`null`).
    - Appel de purgeFor sans email : fonction no-op.

### services/api/lib/auth/resolve.js

- **Rôle du fichier**
  - Point central de résolution de l'identité utilisateur pour chaque requête API.
  - Fusionne l’authentification "native" (cookie de session) et OIDC (en-têtes HTTP injectés).
  - Détermine la priorité et la fiabilité des sources d’identité (cookie vs en-têtes).
  - Définit comment exposer le mode et le fournisseur d’authentification.

- **Fonctions exportées**

  - `authModeOf(user)`
    - **Paramètres** : `user` (objet ou `null`) — identité retournée par `resolveIdentity()`.
    - **Retour** : `'oidc' | 'password' | 'sso'` — type d’authentification actuel de l'utilisateur.
    - **Effet de bord** : Aucun.
    - **Notes** : Prend en compte la source et la présence d’un mot de passe pour distinguer les modes.
  
  - `authProviderOf(user)`
    - **Paramètres** : `user` (objet ou `null`) — identité retournée par `resolveIdentity()`.
    - **Retour** : `'oidc' | 'password' | 'google' | 'entra' | 'sso'` — fournisseur utilisé pour la session.
    - **Effet de bord** : Aucun.
    - **Notes** : Distingue finement OIDC et SSO Google/Microsoft selon la session et l'historique du compte.

  - `resolveIdentity({ req, users, sessions })`
    - **Paramètres** :
      - `req`: Objet requête HTTP (doit contenir les en-têtes).
      - `users`: Gestionnaire d’utilisateurs (implémente `.findByEmail(email)` et `.findByEmailLower(emailLower)`).
      - `sessions`: Gestionnaire de sessions (implémente `.resolve(token)`, `.touch(session)`, `.destroyAllFor(emailLower)`).
    - **Retour** : `Promise<{user: object|null, sessionInvalid: boolean}>`
      - `user`: Objet identité ou `null` (anonyme/non authentifié).
      - `sessionInvalid`: Booléen ; indique si le cookie doit être purgé client-side.
    - **Effets de bord notables** :
      - Rafraîchit la session native (`sessions.touch()`) si valide.
      - Détruit les sessions si le compte a été supprimé ou désactivé (`sessions.destroyAllFor()`).
    - **Notes** :
      - Priorise le cookie de session, ignore les en-têtes si le chemin est explicitement "native".
      - OIDC/ForwardAuth : identités issues uniquement des en-têtes HTTP.
      - Évite d’authentifier à partir d’en-têtes falsifiables grâce au header marqueur `"x-mybrief-auth-path": "native"`.

- **Points d’attention**

  - **Ordre d’évaluation crucial** : Un seul chemin d’authentification est pris en compte selon le contexte et la protection du header central ; attention notamment en cas de déploiements/reverse proxies qui ne mettent pas ce header.
  - **Effacement/fiabilité des en-têtes d'identité** : Dépend de middlewares externes (`noident`, OIDC/FwdAuth) qui doivent garantir l’état des en-têtes avant que cette logique ne s’exécute.
  - **Statut session/cookie** : Retourne `sessionInvalid` quand le cookie ne correspond plus à un utilisateur valide (compte supprimé/désactivé).
  - **Edge cases** :
    - Sessions sans doc utilisateur associé (si supprimé ou jamais vu par `/init`).
    - Sessions ouvertes avant capture du fournisseur (`sessionProvider` peut être null).
    - Utilisateurs sans mot de passe (sso Google/Entra uniquement).
  - **Dépendances** :
    - `../identity.js` : Pour extraction d’identité des en-têtes.
    - `./cookies.js` : Pour lecture du token de session via cookie.
    - `./sessions.js` : Pour les vérifications/rafraîchissements/détructions de sessions actives.

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

- **Rôle du fichier :**
  - Met en place le mécanisme d'authentification sur toutes les routes `/api` dans une instance Fastify.
  - Affecte `req.user` à chaque requête, en ajoutant un verrou côté serveur obligeant le changement de mot de passe si nécessaire.

- **Fonctions exportées :**
  - **Export par défaut : `authPlugin(api)`**
    - **Paramètres :**
      - `api` : instance Fastify enrichie (doit exposer `.users`, `.sessions`, `.config.cookieSecure`)
    - **Retour :** `void`
    - **Effets de bord notables :**
      - Ajoute les décorateurs `user` et `identityResolved` à chaque requête (`req`).
      - Ajoute deux hooks `onRequest` :
        - Résolution d'identité (définit `req.user`, purge le cookie de session si session invalide).
        - Blocage de l'accès à toute l'API (hors `/api/auth` et chemins exemptés) si l'utilisateur doit changer son mot de passe, avec retour HTTP 428.
  
- **Points d'attention :**
  - **Edge cases / comportements particuliers :**
    - Exemption de certaines routes (`/api/ping`, `/api/init`, `/api/auth/*`) du verrou de changement de mot de passe.
    - Utilisation d'un code HTTP 428 (et non 401/403) pour éviter la déconnexion automatique côté front.
    - Nettoyage explicite du cookie de session lors d'une session invalide.
    - L'ordre des hooks d'authPlugin est important pour que la résolution d'identité précède la vérification du verrou.
  - **Dépendances :**
    - `resolveIdentity` (résolution de l'utilisateur à partir de la requête)
    - `clearSessionCookie` (suppression du cookie de session)
    - `fail` (émission d'une erreur avec code HTTP)
    - Le fichier n'utilise pas `fastify-plugin` pour simplifier l'intégration et limiter la portée des décorateurs/hooks au périmètre `/api`.

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

- **Rôle du fichier**
  - Initialise et prépare la base de données lors du démarrage de l'API.
  - Effectue la création/mise à jour d'index MongoDB, migrations de données, contrôle/mise en place de l’administration, backfill de champs historiques, etc.
  - Toutes les opérations sont idempotentes : le script peut s’exécuter à chaque démarrage sans effet secondaire indésirable.
  - Centralise la logique qui était autrefois dispersée (ex : index dans `server.js`).

- **Fonctions exportées**

  - `async function dedupeMailAccounts(db, log)`
    - **Paramètres** : `db` (DB mongo), `log` (logger)
    - **Retour** : `Promise<number>` (nombre de doublons supprimés)
    - **Effets** : Supprime les doublons dans `userMailAccounts` avant création de l’index unique.
    - **Remarques** : Empêche la création de l’index d’échouer (fail-fast).

  - `async function migrateMailAccountsToConnections(db, log)`
    - **Paramètres** : `db`, `log`
    - **Retour** : `Promise<number>` (nombre de comptes migrés)
    - **Effets** : Migre les anciennes connexions Google Mail vers la collection unifiée `userConnections`.
    - **Remarques** : Ne modifie rien si la migration a déjà eu lieu.

  - `async function migrateBusinessContextToOrgContext(db, log)`
    - **Paramètres** : `db`, `log`
    - **Retour** : `Promise<boolean>` (true si migration effectuée)
    - **Effets** : Transfère le contexte métier vers `orgContext` si absent.
    - **Remarques** : Ne s’exécute qu’une fois, migration non bloquante en cas d’erreur.

  - `async function warnDuplicateEmails(db, log)`
    - **Paramètres** : `db`, `log`
    - **Retour** : `Promise<number>` (nombre de doublons détectés)
    - **Effets** : Log les cas de doublons d’emails (même adresse ou même adresse à la casse près).
    - **Remarques** : Laisse l’opérateur humain décider (aucune fusion automatique).

  - `async function seedAdmin(db, { email, password, enabled }, log)`
    - **Paramètres** : `db`, `{ email, password, enabled }`, `log`
    - **Retour** : `Promise<object>` (contenant `created: boolean` et raison si pas créé)
    - **Effets** : Crée ou complète un compte administrateur d’amorçage selon la situation (voir JSDoc).
    - **Remarques** : Ne crée pas ce compte si la base contient déjà des comptes utilisateurs.

  - `async function bootstrap(db, config, log, env)`
    - **Paramètres** : `db` (mongo), `config` (struct voir JSDoc), `log` (logger), `env` (object env)
    - **Retour** : `Promise<void>`
    - **Effets** : Orchestration : exécute toutes les étapes d’amorçage & migration ci-dessus, ainsi que la promotion des administrateurs via emails ou domaines.
    - **Remarques** : C’est la fonction principale à appeler lors du boot de l’API.

- **Points d’attention**
  - **Déclenchement des erreurs** :
    - `ensureIndexes` est fail-fast : un échec sur un index fait échouer tout le bootstrap.
    - La plupart des migrations/backfills loggent mais ne provoquent pas d'arrêt, sauf index.
  - **Préexistence/doublons** :
    - Certains backfills font les records un par un pour ne pas bloquer sur un doublon (ex : `backfillEmailLower`).
    - Les cas de doublons d’adresses mails (même adresse, ou casse différente) sont signalés mais jamais corrigés automatiquement : nécessite une intervention manuelle.
  - **Migration d’administrateurs** :
    - Plusieurs stratégies sont gérées : compte d’amorçage (`seedAdmin`), promotion explicite par email (`ADMIN_EMAILS`), promotion par domaine (`ADMIN_EMAIL_DOMAINS`).
    - Le compte d’amorçage est bloqué si la base n’est pas vierge.
  - **Dépendances notables** :
    - Nombreux imports internes : manipulation des users, settings, logs mails, scopes, etc.
    - Dépend fortement de la structure de la base Mongo (collections, nomenclature des champs).
    - Nécessite un niveau Mongo >= 4.2 pour certains backfills pipelines.
  - **Idempotence** :

### services/api/lib/config.js

- **Rôle du fichier :**
  - Centralise la lecture et la validation de la configuration applicative, basée sur les variables d’environnement.
  - Permet l’injection de valeurs pour les tests sans manipuler `process.env`.
  - Sert de source unique pour connaître les paramètres configurables en production.

- **Fonctions exportées :**
  - `loadConfig(env = process.env)`
    - **Paramètre :**  
      - `env` : objet (`Record<string, string|undefined>`) représentant les variables d’environnement (par défaut : `process.env`)
    - **Retour :**  
      - Objet de configuration structurée contenant : connexions Mongo, port, SMTP, rate-limits, paramètres session, options d’authentification, OpenAI, etc.
    - **Effet de bord notable :**  
      - Aucun (fonction pure, ne modifie pas d’état externe).

- **Autres fonctions internes :**
  - `bool(value, fallback)`
    - **Usage :** Convertit une valeur d’environnement en booléen, avec prise en charge des alias courants ("0", "false", "no", "off").
  - `int(value, fallback)`
    - **Usage :** Convertit une valeur d’environnement en entier positif, sinon retourne la valeur de repli.

- **Points d’attention :**
  - **Edge cases :**
    - La plupart des valeurs (notamment mongoUrl, smtp.host, openai.apiKey…) peuvent être vides ou non définies, ce qui désactive certains modules (ex : mailer désactivé si SMTP_HOST absent).
    - Certains traitements appliquent des valeurs par défaut strictes (ex : ports, TTLs, modèles IA).
    - Les modèles OpenAI définis dans l’environnement ne sont que des amorçages qui peuvent être écrasés à runtime dans l’application.
    - Pour les tests, surcharger l’objet de config via `env` permet de simuler tous les cas de figures (mauvaise configuration, désactivation…).
    - Les listes d’administrateurs (emails, domaines) acceptent des chaînes vides ou malformées (espaces, virgule à la fin).
    - `mobile.jwtSecret` vide (<32 caractères) désactive totalement la feature d’auth mobile (réponse 503).
  - **Dépendances/imports :**
    - Aucune dépendance externe directe dans ce fichier ; utilisé et validé par d’autres modules (ex : `server.js`, `lib/mailer.js`, `lib/crypto/secretBox.js`, etc).
    - La cohérence de certaines valeurs reste de la responsabilité du module appelant (ex : validation d’un mongoUrl valide).
    - La structure et les noms de certains objets sont attendus ailleurs dans le codebase (`config.rateLimits.*`, `config.openai.models.*`).  
  - **Remarque :**
    - Modifications dans les clés d’environnement ou la structure retournée doivent être synchronisées à toutes les utilisations du repo.

### services/api/lib/connections/access.js

- **Rôle du fichier**
  - Centralise la logique d'accès au stockage utilisateur via fournisseur (Google Drive, OneDrive, etc.).
  - Vérifie la connexion, les scopes OAuth, et récupère les identifiants nécessaires à l'accès au stockage selon le fournisseur choisi pour l'organisation.

- **Fonction exportée**
  - `resolveStorageAccess(app, { user, providerId, requireBrowse = false })`
    - **Paramètres :**
      - `app` : instance Fastify (contenant les connexions et settings)
      - `user` : objet utilisateur (doit contenir `emailLower`)
      - `providerId` : identifiant du fournisseur de stockage souhaité (ex. 'google', 'microsoft')
      - `requireBrowse` (facultatif, booléen) : exige que la connexion ait des scopes de navigation/lecture (par défaut `false`)
    - **Retour :**
      - Promesse résolue par :
        - `{ provider, providerId, connection, credentials }` : tous les éléments nécessaires pour interagir avec le stockage
        - Ou `{ error, status, extra? }` : objet d’erreur détaillant le type de blocage détecté
    - **Effets de bord notables :**
      - Effectue des accès asynchrones à la base (connexions utilisateur, settings globaux)
      - Peut révéler la liste des scopes acquis par un utilisateur pour un provider

- **Points d'attention**
  - **Gestion des cas d’erreur** : renvoie des erreurs spécifiques selon le point de blocage (`storage_not_configured`, `storage_not_connected`, `storage_scope_missing`, `browse_scope_missing`)
  - **Scopes OAuth** : vérifie la présence des scopes nécessaires pour l’écriture et, optionnellement, pour la navigation du drive ; supporte plusieurs variantes de scopes pour compatibilité rétroactive
  - **Dépendances** :
    - `CONNECT_PROVIDERS` et `connectionCredentials` depuis `./providers.js` ; dépend des descriptions de providers et de leur configuration OAuth
    - Nécessite que la méthode `app.connections.getByProvider` et `app.settings.get` soient disponibles et opérationnelles
  - **Edge cases** :
    - Connexion existante mais pas pour le bon provider → erreur
    - Connexion sans tous les scopes requis (rétrocompatibilité scopes anciens/nouveaux) → erreur adaptée
    - Renvoyé objet d’erreur si données manquantes ou invalides à n’importe quelle étape

### services/api/lib/connections/browse.js

- **Rôle du fichier :**
  - Fournit une abstraction de navigation dans l’arborescence de stockage distant (Google Drive, Microsoft Graph) pour la sélection de dossiers.
  - Présente un point d’entrée unique pour interroger/lister les dossiers, sans exposer les particularités des fournisseurs à l’extérieur.
  - Retourne des chemins de dossiers (ex : « Clients/Acme ») et NON des identifiants, garantissant ainsi la compatibilité avec la logique historique du dépôt.

- **Fonctions exportées :**
  - `joinPath(segments:Array<string>): string`
    - Joint proprement les segments d’un chemin en utilisant le séparateur « / ».
    - Filtre les segments falsy ou vides.
    - **Effet de bord :** Aucun.
  - `createDriveBrowser(): {drives, list, pathOf, create}`
    - Retourne un ensemble de fonctions asynchrones adaptées au fournisseur (`provider`: 'google' ou 'microsoft'), avec interface suivante :
      - `drives({credentials, connection, fetchImpl})`
        - Liste les espaces de stockage de l’utilisateur (Drives/racines).
        - Pour Google, peut inclure ou non les Drives partagés selon les scopes consentis.
        - **Retourne**: Promise<Array<{id, name, site?}>>
        - **Effet de bord** : Renouvelle les tokens d’accès si nécessaire.
      - `list({credentials, connection, driveId, cursor, search?, pageToken?, fetchImpl})`
        - Liste les sous-dossiers depuis un point (cursor = id ou chemin selon provider).
        - **Retourne**: Promise<{folders: Array<{name, cursor}>, nextPageToken?}>
          - Exclut les dossiers dont le nom contient "/" (voir ci-dessous).
        - **Effet de bord** : Renouvelle les tokens d’accès si nécessaire.
      - `pathOf({credentials, connection, driveId, cursor, fetchImpl})`
        - Retourne le chemin absolu pour un dossier cible, utile après recherche (notamment côté Google).
        - **Retourne**: Promise<string>
        - **Effet de bord :** Renouvelle les tokens d’accès si nécessaire.
      - `create({credentials, connection, driveId, cursor, name, fetchImpl})`
        - Crée un sous-dossier dans l’arborescence courante.
        - **Retourne**: Promise<{name, cursor}>
        - **Effet de bord** : Renouvelle les tokens d’accès si nécessaire, appel distant.
    - **Effet de bord notables** : gestion des tokens d’accès (appel à `refreshGoogleAccessToken` et `refreshGraphAccessToken`).

- **Points d’attention / Edge cases / Dépendances :**
  - Les dossiers contenant un « / » dans leur nom sont systématiquement filtrés (voir la fonction `addressable`) car l’aller-retour via un chemin sera ambigu ou produira une structure différente.
  - Différences de curseur :
    - **Google** : le curseur est un identifiant opaque (id de dossier).
    - **Microsoft Graph** : le curseur est un chemin (« / » séparé).
  - Selon les scopes OAuth octroyés à la connexion, certains espaces de stockage peuvent être invisibles (par exemple, absence de Drives partagés Google ou sites SharePoint Microsoft).
  - **Dépendances externes :**
    - Accès à Google Drive : `./googleDrive.js`, `./googleTokens.js`
    - Accès à Microsoft Graph : `./msGraph.js`, `./providers.js`
  - L’interface attend que le `provider` soit validé en amont ; une absence d’implémentation lance une erreur explicite.
  - Token d’accès toujours rafraîchi avant toute requête, ce qui peut augmenter la latence d’appel.
  - **Usage historique du chemin** : toute l’application manipule des chemins utilisateur, le stockage et le cache restent donc indépendants de la source du chemin (navigation ou saisie manuelle).

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

- **Rôle du fichier** :
  - Fournit les fonctions de connexion et d’interaction avec Google Drive pour déposer des documents depuis l’application, sans utiliser le SDK Google (utilisation directe des API REST pour plus de légèreté).
  - Gère la navigation dans l’arborescence des Drives/partages, la création et la résolution de dossiers, et l’upload de fichiers via une session "resumable".

- **Fonctions exportées** :

  - `DEFAULT_FOLDER`
    - **Description** : Nom du dossier par défaut ("myBrief") si aucun chemin n'est fourni.
    - **Effet de bord** : Aucun.

  - `folderSegments(folderPath)`
    - **Paramètres** : `folderPath: string`
    - **Retour** : `string[]` - segments du chemin ou [DEFAULT_FOLDER] si vide.
    - **Effet de bord** : Aucun.
    - **Remarque** : Jamais la racine du Drive.

  - `listSharedDrives({ accessToken, fetchImpl, pageSize })`
    - **Paramètres** :
      - `accessToken: string`
      - `fetchImpl: Function` (optionnel, défaut : fetch)
      - `pageSize: number` (optionnel)
    - **Retour** : `Promise<Array<{id, name, site}>>` — Drives partagés accessibles en écriture.
    - **Effet de bord** : Aucun.
    - **Remarque** : Exige `drive.readonly`. Ne retient que ceux où l’utilisateur peut déposer.

  - `listFolders({ accessToken, driveId, parentId, search, pageToken, pageSize, fetchImpl })`
    - **Paramètres** :
      - Identifiants du Drive/dossier, critères de recherche, pagination, fetch personnalisé
    - **Retour** : `Promise<{folders: Array<{id, name}>, nextPageToken: string}>`
    - **Effet de bord** : Aucun.
    - **Remarque** : N'affiche que les dossiers, selon le parent ou la recherche.

  - `folderPathSegments({ accessToken, folderId, driveId, fetchImpl, maxDepth })`
    - **Paramètres** : Identifiants de dossier/drive, fetch, profondeur maximale du path
    - **Retour** : `Promise<string[]>` - segments du chemin depuis la racine
    - **Effet de bord** : Aucun.

  - `ensureChildFolder({ accessToken, driveId, parentId, name, fetchImpl })`
    - **Paramètres** : Identifiants parent/drive, nom du dossier, fetch optionnel
    - **Retour** : `Promise<{id, name, created: boolean}>`
    - **Effet de bord** : Crée le dossier sous le parent s'il n’existe pas.

  - `ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl })`
    - **Paramètres** : Chemin du dossier, fetch
    - **Retour** : `Promise<string>` (id du dossier le plus profond, créé si besoin)
    - **Effet de bord** : Crée chaque segment du path s’il n’existe pas.

  - `uploadToFolder({ accessToken, folderId, filename, content, contentType, fetchImpl })`
    - **Paramètres** : Id du dossier, nom de fichier, Buffer du contenu, type MIME, fetch
    - **Retour** : `Promise<{id, name}>`
    - **Effet de bord** : Upload le fichier dans le dossier via session "resumable".

  - `storeOnDrive({ credentials, connection, folderPath, driveId, file, fetchImpl })`
    - **Paramètres** :
      - `credentials: {clientId, clientSecret}`
      - `connection: {refreshToken, drive}`
      - `folderPath: string` (chemin souhaité)
      - `driveId: string` (optionnel)
      - `file: {filename, content, contentType}`
      - `fetchImpl: Function` (optionnel)
    - **Retour** :
      `Promise<{fileId, folderId, folderPath, resolvedPath, driveId, cacheUsed}>`
    - **Effet de bord** : Dépose un fichier sur le Drive en créant le chemin si nécessaire. Utilise/réactualise un cache d’id de dossier pour éviter les requêtes superflues.

---

- **Points d’attention / Edge Cases** :
    - SCOPE : Code prévu pour le scope "drive.file" (accès restreint aux fichiers créés par l'app) ⇒ la visibilité des dossiers/fichiers est limitée (risque d’homonymes non visibles).
    - Le dépôt dans des Drives partagés requiert des paramètres

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

- **Rôle du fichier**
  - Implémente des interactions directes avec l’API REST Microsoft Graph pour envoyer des e-mails et déposer des fichiers (OneDrive/SharePoint), au nom d’utilisateurs ayant relié leur compte Microsoft.
  - Gère l’authentification OAuth2, la navigation dans les drives et dossiers, la gestion des pièces jointes, en évitant l’ajout de dépendances lourdes (pas de SDK MS).

- **Fonctions exportées**
  - `refreshGraphAccessToken({ credentials, refreshToken, fetchImpl })`
    - **Paramètres** : `{credentials: {clientId, clientSecret, discoveryUrl?}, refreshToken, fetchImpl?}`
    - **Retour** : `Promise<string>` (access token Microsoft Graph)
    - **Effets de bord** : jette une `ConnectionAuthError` si le refresh token n’est plus valide/autorisé.
  
  - `listDrives({ accessToken, fetchImpl })`
    - **Paramètres** : `{ accessToken, fetchImpl? }`
    - **Retour** : `Promise<Array<{id: string, name: string, site: string}>>` (OneDrive de l’utilisateur + bibliothèques SharePoint "suivies")
    - **Effets de bord** : jette `ConnectionAuthError` si le token est révoqué.
    - **Spécificité** : si la permission manque pour SharePoint, ne retourne que le OneDrive.

  - `listFolders({ accessToken, driveId, folderPath, pageToken, fetchImpl })`
    - **Paramètres** : `{ accessToken, driveId?, folderPath?, pageToken?, fetchImpl? }`
    - **Retour** : `Promise<{folders: Array<{name: string}>, nextPageToken: string}>`
    - **Effets de bord** : jette `ConnectionAuthError` en cas d’accès révoqué.

  - `ensureChildFolder({ accessToken, driveId, folderPath, name, fetchImpl })`
    - **Paramètres** : `{ accessToken, driveId?, folderPath?, name, fetchImpl? }`
    - **Retour** : `Promise<{ name: string }>`
    - **Effets de bord** : crée le dossier enfant demandé et ses parents si besoin.

  - `ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl, defaultFolder })`
    - **Paramètres** : `{ accessToken, folderPath, driveId?, fetchImpl?, defaultFolder? }`
    - **Retour** : `Promise<string>` (id du dossier cible, créé si absent)
    - **Effets de bord** : création récursive si sous-arborescence manquante. Gère le conflit de création (409) via une nouvelle lecture.

  - `sendViaGraph({ credentials, refreshToken, to, cc, replyTo, subject, html, attachments, fetchImpl })`
    - **Paramètres** : `{credentials, refreshToken, to, cc?, replyTo?, subject, html, attachments?, fetchImpl?}`
    - **Retour** : `Promise<void>`
    - **Effets de bord** :  
      - Jette `ConnectionAuthError` en cas de révocation d’accès.
      - Envoie un mail depuis la boîte liée :
        - Envoi simple, envoi avec pièce jointe inline (<3 Mo), ou création de brouillon puis upload séquencé et envoi (pièce jointe > 3 Mo).

  - `storeOnOneDrive({ credentials, connection, folderPath, driveId, file, fetchImpl })`
    - **Paramètres** : `{ credentials, connection, folderPath, driveId?, file, fetchImpl? }`
    - **Retour** : `Promise<{fileId, folderId, folderPath, resolvedPath, driveId, cacheUsed}>`
    - **Effets de bord** :
      - Upload chunké via upload session (jamais de PUT direct).
      - Recréation automatique du dossier si le cache drive/folderId n’est plus valide.

- **Points d’attention**
  - **Dépendances internes** :  
    - `withRetry` (gestion des retries),  
    - `getEndpoints` (découverte OIDC pour endpoint token MS),  
    - `ConnectionAuthError` (gestion fine révocation/refus MS).
  - **Edge cases** :  
    - Expiration ou révocation du refresh token → `ConnectionAuthError` (déconnexion requise pour l’utilisateur).
    - Les appels au Graph sont sensibles à la validité des permissions (notamment pour SharePoint).
    - Pagination possible sur la liste des dossiers (`nextPageToken`).
    - Les conflits de création de dossier (409) sont gérés.
    - L’envoi

### services/api/lib/connections/providers.js

- **Rôle du fichier**
  - Définit le registre des fournisseurs de comptes EXTERNES (Google, Microsoft) auxquels un utilisateur peut connecter myBrief pour accéder à ses services (Mail, Drive, etc.).
  - Sépare explicitement la logique de connexion à des comptes tiers (actions sur des ressources) de la logique d’authentification/identité (login).

- **Fonctions exportées**
  - `connectionCredentials(provider, authSettings)`
    - **Paramètres :**
      - `provider` : objet d’un fournisseur dans `CONNECT_PROVIDERS`.
      - `authSettings` : document de configuration d’authentification (incluant les secrets).
    - **Retour :**
      - `{clientId: string, clientSecret: string}` si trouvé/valide, `null` sinon.
    - **Effets de bord :**
      - Aucun.
    - **Points d’attention :**
      - Ignore le champ `enabled` du provider.
      - Retourne `null` si identifiants manquants ou pas d’annuaire configuré pour Entra.
  
  - `effectiveProvider(configured)`
    - **Paramètres :**
      - `configured` : identifiant (`string`) du provider désiré (issu de la conf).
    - **Retour :**
      - L’objet fournisseur correspondant dans `CONNECT_PROVIDERS`. Par défaut, celui pour `google` si non défini ou inconnu.
    - **Effets de bord :**
      - Aucun.

  - `CONNECT_PROVIDERS`
    - Objet listant la configuration détaillée des fournisseurs compatibles (Google, Microsoft), y compris scopes, endpoints, gestion des cookies d’état, et champs spécifiques.
    - **Usage** : pour gérer et uniformiser tous les aspects liés à la connexion d’un compte tiers.

  - `CONNECT_PROVIDER_IDS`
    - Tableau des identifiants des providers configurés dans `CONNECT_PROVIDERS`.

- **Points d’attention / Edge-cases**
  - Ne tient pas compte du flag `enabled` : permettre de connecter des comptes même si le login via ce provider est désactivé (cas d'usages différenciés).
  - Gestion différente du cookie d’état entre Google et Microsoft pour des raisons d’intégration réseau (Traefik).
  - Changement des scopes Google : anciennes connexions peuvent perdre certaines fonctionnalités de navigation mais restent opérationnelles (fallback prévu).
  - Pour Microsoft, pas d’endpoint de révocation : la déconnexion consiste seulement à oublier le refresh token côté myBrief.
  - Les endpoints, extraction d’email et annuaires sont mutualisés avec ceux définis pour l’authentification.
  - L’évolution des scopes (Google/Microsoft) peut provoquer des dégradations silencieuses (ex : navigation limitée sur Drives sans reconnexion explicite).
  - Certaines configurations (ex. Entra « on-prem ») imposent des chemins de callback non modifiables.
  - La documentation mentionne les enjeux administratifs liés à l’obtention de scopes (Google « restricted », consentements Microsoft).

- **Dépendances notables**
  - Dépend de `../auth/providers.js` pour la configuration fine des endpoints et annuaires OAuth.
  - Utilise `../auth/oauthState.js` pour le nommage du cookie d’état Microsoft.

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

- **Rôle du fichier**
  - Définit un contrat unifié pour les réponses d’erreur des routes API utilisant l’authentification native, avec codes HTTP appropriés et structure JSON stable (`{ error: '<slug stable>', message?, fields? }`).
  - Normalise la gestion des erreurs côté serveur (via un handler racine) pour éviter de divulguer des détails techniques à l'utilisateur.

- **Fonctions exportées**
  - **`fail(reply, status, code, extra?)`**
    - **Paramètres** :
      - `reply` : objet FastifyReply
      - `status` : code HTTP de la réponse
      - `code` : slug d’erreur stable (string)
      - `extra` (optionnel) : objet contenant des propriétés additionnelles à ajouter à la réponse JSON
    - **Retour** : résultat de `reply.code(status).send({ error: code, ...extra })`
    - **Effets de bord** : écrit la réponse HTTP, structure le corps selon le contrat d’erreur
  - **`unauthenticated(reply, extra?)`**
    - Wrapper appelant `fail()` pour 401 « unauthenticated »
    - **Paramètres** : `reply`, `extra` (optionnel)
    - **Retour** : réponse structurée pour l’erreur d’authentification
    - **Effets de bord** : écrit la réponse HTTP 401
  - **`forbidden(reply, extra?)`**
    - Wrapper appelant `fail()` pour 403 « forbidden »
    - **Paramètres** : `reply`, `extra` (optionnel)
    - **Retour** : réponse structurée pour accès interdit
    - **Effets de bord** : écrit la réponse HTTP 403
  - **`notFound(reply, code?)`**
    - Wrapper appelant `fail()` pour 404 (slug personnalisable, défaut : 'not_found')
    - **Paramètres** : `reply`, `code` (optionnel, par défaut 'not_found')
    - **Retour** : réponse structurée pour ressource non trouvée
    - **Effets de bord** : écrit la réponse HTTP 404
  - **`slugErrorHandler(err, req, reply)`**
    - Handler d’erreur global compatible Fastify, à poser sur l’app
    - **Paramètres** : `err` (erreur capturée), `req` (requête), `reply` (réponse)
    - **Retour** : réponse d’erreur normalisée, selon cause (voir ci-dessous)
    - **Effets de bord** :
      - Pour erreurs de validation AJV : 400 `{ error: 'invalid_body', fields }`
      - Autres erreurs : renvoi statut original si `<500`, sinon 500, corps `{ error: 'internal_error' }`
      - Logge l’erreur côté serveur ; n’envoie jamais de détails internes à l’utilisateur

- **Points d'attention**
  - **Edge cases**
    - Les erreurs de validation (schema AJV) sont traitées spécifiquement pour afficher les chemins ou propriétés manquantes.
    - Les routes héritées (ex: n8n) peuvent retourner des réponses d’erreur en HTTP 200 dans certains cas, ce comportement n’est PAS répété ici.
    - Les détails techniques des erreurs (messages, stack, etc.) NE SONT JAMAIS envoyés au client final.
  - **Dépendances**
    - Utilise l’API `FastifyReply` de Fastify (nécessite d’être appelé dans une route Fastify).
    - Dépend du système de validation AJV intégré à Fastify pour le traitement des erreurs d’entrée.
    - Certaines routes spécifiques relayant des erreurs d’API en amont (ex: OpenAI) ne passent pas par ce handler global.

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

- **Rôle du fichier**
  - Gestion de l'identité utilisateur obtenue via des en-têtes injectés par Traefik (OIDC et mobile).
  - Extraction et décodage correct de l'identité dans `req.headers`, centralisé pour garantir la cohérence sur toute l'API.
  - Alternatives compatibles : session OIDC via proxy ou session native (voir lib/auth/).

- **Fonctions exportées**
  - `utf8Header(headers, name)`
    - **Paramètres** : 
      - `headers` (Object) : les en-têtes HTTP (typiquement `req.headers`)
      - `name` (string) : nom de l’en-tête (en minuscules)
    - **Retour** : 
      - (string) valeur décodée en UTF-8
    - **Effet de bord notable** :
      - Corrige le problème de mojibake dû au décodage latin1 de Node.js sur des valeurs UTF-8 (noms avec accents etc.)

  - `identityFromHeaders(headers)`
    - **Paramètres** :
      - `headers` (Object) : les en-têtes HTTP
    - **Retour** :
      - `{ email: string, name: string }` : objet identité utilisateur
    - **Effet de bord notable** :
      - Applique un repli automatique : récupère l’email sur `x-user-email` puis `x-auth-request-user` en cas d'absence (pour compenser les différences entre fournisseurs OIDC).

  - `requireEmail(req, reply)`
    - **Paramètres** :
      - `req` (FastifyRequest) : requête HTTP
      - `reply` (FastifyReply) : réponse HTTP
    - **Retour** :
      - (string|null) : l’email extrait ou `null` (après réponse 401)
    - **Effet de bord notable** :
      - Retourne une 401 + message JSON si l’email ne peut être déterminé.
      - Prend l'identité prioritairement depuis `req.user` (posée par authPlugin.js), sinon lit directement les en-têtes mais uniquement si le hook du plugin ne s'est pas exécuté (cas typique : tests unitaires).

- **Points d'attention**
  - **Edge cases** :
    - En-têtes mal codés ou caractères spéciaux sans utf8Header → valeurs corrompues possibles.
    - Email requis : requests non authentifiées stoppées net (401, pas de fallback silencieux).
    - Risque d’usurpation d’identité si requireEmail utilisait toujours les en-têtes sans vérif (protection assurée par le contrôle req.identityResolved).
  - **Dépendances** :
    - Nécessite le placement correct de `req.user` par le plugin d’authentification (`lib/authPlugin.js`).
    - Utilisé dans un contexte Fastify, s’attend à des objets type FastifyRequest/Reply.
    - Dépend du comportement de Traefik / traefikoidc pour la présence et la nature des en-têtes d'identité.

### services/api/lib/mailer.js

- **Rôle du fichier**
  - Gestion centrale de l'envoi d'e-mails via SMTP (Nodemailer) : réinitialisation de mot de passe, envoi de documents (transcription, résumé) à l'utilisateur.
  - Permet le déploiement on-prem sans dépendance à une API tierce.
  - Fonctionne dans plusieurs langues (français/anglais).
  - Se désactive proprement si SMTP non configuré, sans impacter l'app.

- **Fonctions exportées**
  - `buildDocumentEmail({ kind, title = '', content, lang = 'fr', subject })`
    - **Paramètres** :  
      - `kind`: `'transcription'` ou `'summary'` (type de document)  
      - `title`: titre optionnel  
      - `content`: contenu (texte brut ou HTML)  
      - `lang`: 'fr' ou 'en' (défaut 'fr')  
      - `subject`: sujet personnalisé optionnel
    - **Retour** :  
      - Objet `{ subject, text, html }`
    - **Effet de bord** :  
      - Aucune, pure transformation de données

  - `createMailer(smtp, log = noopLogger)`
    - **Paramètres** :
      - `smtp`: config `{ host, port, secure, user, pass, from }`
      - `log` (optionnel): logger compatible `{ info, warn }`
    - **Retour** :  
      - Objet mailer `{ enabled, sendPasswordReset, sendDocument }`
    - **Effet de bord notable** :  
      - Initialise une connexion SMTP (non bloquante, log si échec)
      - Si `smtp.host` absent, expose `{ enabled: false, ... }` avec méthodes lèvant des erreurs sur appel

      - **Méthodes de l'objet mailer :**
        - `sendPasswordReset({ to, link, lang = 'fr', expiresInMinutes = 30 })`
          - Envoie un mail de réinitialisation de mot de passe (jamais de mot de passe transmis)
          - **Effet de bord** : envoie un mail SMTP
        - `sendDocument({ to, cc, replyTo, kind, title = '', content, lang = 'fr', subject, attachments })`
          - Envoie un document à son propriétaire (texte ou résumé, avec ou sans pièce jointe)
          - **Effet de bord** : envoie un mail SMTP

- **Points d'attention (edge cases, dépendances)**
  - **Dépendance externe** : utilise `nodemailer`.
  - **SMTP désactivé** (`host` vide) : renvoie un mailer inoffensif (aucun crash, erreurs contrôlées).
  - **Les fonctions d'envoi** lèvent en cas d'erreur SMTP, à capturer côté appelant.
  - **Gestion des langues** : fallback systématique au français si langue non reconnue.
  - **Sécurité** : aucun mot de passe en clair n'est jamais contenu dans les emails.
  - **Données utilisateurs ("to", "cc")** : toujours issues des réglages persistés, jamais postées librement.
  - **Signalétique** : `replyTo` important pour la bonne distribution des réponses, car l'expéditeur (`from`) est toujours un "no-reply".

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

- **Rôle du fichier :**
  - Client minimal pour l’API OpenAI (chat, transcription, Realtime), sans dépendance externe.
  - Gestion centralisée des erreurs et statuts, adaptation pour un usage backend exposé à un frontend.
  - Support de clé API dynamique modifiable à chaud.

- **Fonctions & classes exportées :**
  - `UpstreamError` (classe)
    - **Paramètres** : `status` (number), `body` (string), `contentType` (string, défaut `'application/json'`)
    - **Retour** : instance d’erreur enrichie (status HTTP, corps de réponse, type MIME)
    - **Effets** : Encapsulation des erreurs OpenAI pour relai direct au client.
  - `relayStatus(upstreamStatus)`
    - **Paramètres** : `upstreamStatus` (number)
    - **Retour** : code HTTP (préserve 402/429/5xx, mappe 400/401 en 502)
    - **Effets** : Indique le status à retourner côté frontend pour une erreur OpenAI.
  - `replyUpstreamError(reply, err)`
    - **Paramètres** : `reply` (objet réponse fastify-like), `err` (erreur)
    - **Retour** : void
    - **Effets** : Transmet l’erreur OpenAI telle quelle si nature `UpstreamError`, sinon relance.
  - `normalizeApiKey(raw)`
    - **Paramètres** : `raw` (string)
    - **Retour** : `{key: string, problem: string}` (`problem === ''` si valide)
    - **Effets** : Nettoie/valide une clé OpenAI, détecte doublons de préfixe et erreurs fréquentes.
  - `verifyOpenAiKey(opts)`
    - **Paramètres** : `{apiKey, baseUrl?, fetchImpl?, timeoutMs?}`
    - **Retour** : `Promise<{ok: true}>` si valide
    - **Effets** : Vérifie la validité d’une clé en appelant `/models`. Lance `UpstreamError` sinon.
  - `createOpenAiClient(opts)`
    - **Paramètres** : `{apiKey, baseUrl?, timeoutMs?, fetchImpl?}` (`apiKey` peut être une fonction synchrone/asynchrone)
    - **Retour** : objet `{chat, transcribe, realtimeClientSecret}`
      - **chat({model, messages})** : `Promise<string>`
        - Renvoie la complétion chat du premier choix.
      - **transcribe({buffer, filename?, mimetype?, model?})** : `Promise<{text: string}>`
        - Transcription d'un buffer audio OpenAI Whisper.
      - **realtimeClientSecret(lang, model?)** : `Promise<Object>`
        - Récupère un token éphémère pour session Realtime.

- **Points d’attention :**
  - **Edge cases :**
    - Clé API absente : statut 503 et message explicite, n’appelle jamais OpenAI sans clé.
    - Erreurs OpenAI 401/400 sont remappées en 502 (évite confusion “session expirée” côté client).
    - Les 4xx “métier” (crédit épuisé, clé invalide…) sont relayés avec leur corps pour inspection côté frontend.
    - `apiKey` peut être une fonction pour une MAJ dynamique sans redémarrage du service.
    - Les fonctions principales (`chat`, `transcribe`, `realtimeClientSecret`) sont idempotentes et relançables via retry automatique sur pannes ou rate limit.
  - **Dépendances :**
    - Utilise `withRetry`, `isNetworkError` de `./retry.js` pour gestion de la robustesse réseau.
    - Modèles par défaut issus de `./transcriptionModels.js`.
    - Utilise les API natives : `fetch`, `AbortSignal`, `FormData`, etc. (Node.js 20+ requis).
  - **Remarques techniques :**
    - Aucun fallback sur les tentatives réseau pour les erreurs logiques type 4xx métier.
    - Le corps d’erreur OpenAI est toujours relayé verbatim.
    - Pas de correction silencieuse sur les erreurs de clé pour éviter des erreurs de sécurité.

### services/api/lib/ownerScope.js

- **Rôle du fichier**
  - Centralise la gestion de la "portée utilisateur" pour les collections métier liées à un utilisateur (ex : `resume`, `userTemplates`, etc.).
  - Unifie et sécurise la logique de filtrage des documents par l’email utilisateur tout en assurant la compatibilité et la migration des anciens documents (champ `email` ou `emailLower`).
  - Fournit les outils pour appliquer, compléter et purger cette portée.

- **Fonctions exportées**
  - `ownerFilter(email: string, extra?: object) : object`
    - Construit un filtre MongoDB pour sélectionner les documents d’un utilisateur, compatible avec anciens (email) et nouveaux documents (emailLower).
    - Paramètres :  
      - `email` (string) : email utilisateur (casse quelconque)
      - `extra` (object, optionnel) : filtres additionnels (fusionnés avec le filtre principal)
    - Retour : objet filtre MongoDB (`$or` sur `emailLower` et `email`)
    - 📌 Point d'attention : Ne couvre que les documents où `emailLower` a été renseigné ou où `email` matche exactement ; voir edge case purges.

  - `ownerPurgeFilter(email: string) : object`
    - Génère un filtre MongoDB pour la suppression complète des documents liés à un utilisateur.
    - Paramètre :  
      - `email` (string) : email utilisateur
    - Retour : objet filtre MongoDB élargi (insensible à la casse via regex)
    - 📌 Effet : Peut déclencher des balayages non indexés — acceptable pour les opérations d’admin rares (purge).

  - `ownerFields(email: string) : { email: string, emailLower: string }`
    - Prépare les champs de propriété à insérer dans un document métier.
    - Paramètre :  
      - `email` (string) : email utilisateur
    - Retour : objet `{ email, emailLower }`

  - `OWNED_COLLECTIONS : string[]`
    - Liste toutes les collections métier soumises à la portée utilisateur.  
    - 📌 Ajouter une collection utilisateur nécessite de l’ajouter ici : omission = données non purgées.

  - `backfillOwnerEmails(db: object, log: {info: Function, warn: Function}) : Promise<number>`
    - Script idempotent pour compléter le champ `emailLower` sur les documents qui n’en ont pas.
    - Paramètres :
      - `db` : instance de base de données (MongoDB)
      - `log` : logger avec fonctions `info` et `warn`
    - Retour : Nombre total de documents modifiés (Promise<number>)
    - 📌 Effet de bord : Modifie les documents directement en base, par collection ; un échec sur une collection n’arrête pas le traitement des autres.

- **Points d’attention / Edge Cases / Dépendances**
  - **Problème historique** : différence de casse de l’email générait des oublis dans les historiques ou dans les suppressions ; depuis migration, comparaison sur email normalisé uniquement.
  - **Compatibilité migration** : Filtre maintenu sur les deux champs (`email` et `emailLower`) tant que tous les documents n’ont pas `emailLower` (fonction backfill).
  - **Purges** : Pour la suppression de compte, filtre plus large et insensible à la casse (utilisation de regex) — ce qui peut provoquer des scans coûteux, mais acceptable dans un contexte d’opération rare/admin.
  - **Dépendances** :  
    - Dépend de `normalizeEmail` (importé de `repositories/users.js`).
    - Toutes les requêtes portées par utilisateur DOIVENT passer par ce module pour éviter la divergence de critères.  
    - Oublier une collection dans `OWNED_COLLECTIONS` retire la garantie de purge complète.
    - Toute nouvelle logique de migration/évolution doit passer par ce fichier.
  - **Audit** : La collection d’audit (`actionMailLog`) contient aussi des adresses de tiers et sera purgée lors de la suppression d’un compte (tension assumée).
  - **Performance** :  
    - Filtrage par index (`emailLower` ou `email`) sauf pour les purges (regex insensible à la casse -> scan).
    - `backfillOwnerEmails` applique un updateMany par casse d’email rencontrée, pour meilleure performance sur de gros volumes.

### services/api/lib/prompts.js

- **Rôle du fichier**
  - Centralise la génération et le parsing des prompts pour LLM (modèles GPT) utilisés côté backend, en conservant l’iso-comportement n8n pour l’extraction d’actions, la génération de titres et la correction de transcription.  
  - Exporte des fonctions pour construire les consignes (prompts), parser et nettoyer les retours du modèle.
  - Contient des réglages de sensibilité, des règles et des valeurs par défaut pour la gestion métier MyAlfred.ai.

- **Fonctions exportées**
  - `todayParis(now = new Date())`
    - **Paramètres :** `now` (`Date`, optionnel)
    - **Retour :** `string` — date au format `yyyy-MM-dd` fuseau Paris.
    - **Effet de bord :** Aucun.
  - `actionsPrompt({content, actions, dismissed, today, settings})`
    - **Paramètres :** objet avec :
      - `content` (`string`) : fenêtre récente de transcription ;
      - `actions` (`Array`) : actions détectées en cours ;
      - `dismissed` (`Array`) : actions explicitement supprimées par l’utilisateur ;
      - `today` (`string`) : date du jour (défaut : todayParis()) ;
      - `settings` (objet optionnel) : réglages dynamiques (sensibilité, mots déclencheurs, contexte…)
    - **Retour :** `string` — prompt à soumettre au modèle.
    - **Effet de bord :** Aucun.
  - `parseActionsOutput(raw)`
    - **Paramètres :** `raw` (`string`) — sortie LLM attendue sous forme de tableau JSON.
    - **Retour :** `Array` — liste d’actions parsées (+ nettoyage id avec `sanitizeActionItems`).
    - **Effet de bord :** Aucune, mais robustesse accrue sur les formats tolérés (JSON strict, fenced, bloc…)
  - `TITLE_RULES`
    - **Type :** `string` — consignes système pour générer un titre court de réunion.
  - `titleUserMessage({ resume, transcription })`
    - **Paramètres :** objet `{ resume: string, transcription: string }`
    - **Retour :** `string` — message utilisateur à transmettre à l’IA pour générer un titre.
    - **Effet de bord :** Aucun.
  - `UNTITLED_MEETING`
    - **Type :** `string` — titre par défaut : "Réunion sans titre".
  - `TITLE_MAX_WORDS`
    - **Type :** `number` (5) — plafond de mots autorisé pour les titres.
  - `sanitizeTitle(raw)`
    - **Paramètres :** `raw` (`string`) titre brut
    - **Retour :** `string` — titre nettoyé : coupe à 5 mots, retire ponctuation finale, 80 caractères max, rechute sur valeur par défaut si vide.
    - **Effet de bord :** Aucun.
  - `refineTranscriptPrompt({ sentences, notes })`
    - **Paramètres :** objet `{ sentences: string[], notes: string }`
    - **Retour :** `string` — prompt structuré pour améliorer la transcription à partir de notes manuscrites du client.
    - **Effet de bord :** Aucun.
  - `parseRefineOutput(raw, count)`
    - **Paramètres :** `raw` (`string`), `count` (`number`) attendu de phrases
    - **Retour :** `Array<string>` si parsing réussi et bonne longueur, sinon `null`.
    - **Effet de bord :** Aucun.

- **Points d’attention**
  - **Conformité/compatibilité** : La majorité des prompts sont repris "verbatim" du node n8n originel, même si des fautes y subsistent — ne pas corriger sans recetter.
  - **actionsPrompt** :
    - Uniquement ce prompt a été adapté pour permettre la détection directe et la mise à jour d’actions existantes (flexible selon `settings.allowUpdates`).
    - Gère dynamiquement la « sensibilité » à la détection d’action via différents niveaux (`explicit`, `balanced`, `wide`).
    - Tolère des mots déclencheurs personnalisés.
    - Prend en compte les actions « refusées » à ne jamais reproposer.
  - **parseActionsOutput**
    - Tolérant sur les formats d’entrée (JSON nu ou markdown fenced, tableau ou `{ actions: [...] }`), chute sur tableau vide si illisible ou non conforme (cf. robustesse n8n).
    - Nettoie les objets pour éviter de propager des ids erronés/non-entiers.
  - **sanitizeTitle** :

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

- **Rôle du fichier :**
  - Gère la persistance, la projection publique et la mise à jour des réglages « installation » modifiables depuis l’admin (`appSettings`).
  - Modularisé par domaines : authentification (fournisseurs IdP, domaines autorisés), intégration OpenAI, actions post-réunion, branding (visuel), contexte organisationnel.

- **Fonctions/objets exportés :**
  - **Constantes :**  
    - `SETTINGS_COLLECTION`, `BRANDING_LOGO_MAX`, `BRANDING_TAGLINE_MAX`, `BRANDING_LOGO_PATTERN`, `ORG_CONTEXT_MAX`, `STORAGE_PROVIDERS`, `CONNECTION_PROVIDERS`.
  - **Projections publiques :**
    - `toPublicSettings(doc)`  
      - **params** : doc complet `auth`  
      - **retour** : objets sans secrets (inclut hasSecret)  
      - **effet de bord** : aucun
    - `toPublicAiSettings(doc, { envKey, envModel })`  
      - **params** : doc complet `ai`, contexte env optionnel  
      - **retour** : projection clé OpenAI (jamais le secret), source, modèle  
      - **effet de bord** : aucun
    - `toPublicActionsSettings(doc, { mailerEnabled, withFolder })`  
      - **params** : doc `actions`, options  
      - **retour** : switches, fournisseur, storage, info mailing (public/admin)  
      - **effet de bord** : aucun
    - `toPublicBrandingSettings(doc, { withMeta })`  
      - **params** : doc `branding`, meta (admin)  
      - **retour** : branding, éventuellement info maj/admin  
      - **effet de bord** : aucun
    - `toPublicOrgContextSettings(doc, { withMeta })`  
      - **params** : doc contexte, meta  
      - **retour** : contexte (borne en longueur), meta optionnelle  
      - **effet de bord** : aucun
  - **Utilitaires :**
    - `keyHint(key)` : extrait indice d’une clé (pour debug/affichage, jamais le secret complet)
    - `connectionProviderOf(doc)` : détermine le fournisseur (gestion rétro-compatibilité noms historiques)
  - **Dépot principal :**
    - `createSettingsRepo(db)`  
      **Expose :**
      - Projections publiques ci-dessus
      - `get()` → Promise objet auth **(complet, secrets inclus)**  
      - `update(patch)` → maj auth
      - `getAi()`, `resolveOpenAiKey(envKey)`, `resolveTranscriptionModel(envModel)`, `updateAi(patch, ctx)`
      - `getActions()`, `updateActions(patch, ctx)`
      - `getBranding()`, `updateBranding(patch, ctx)`
      - `getOrgContext()`, `orgContextText()`, `updateOrgContext(patch, ctx)`
      - `seedFromEnv(env)` : amorce la collection à partir de l’environnement (champ par champ), jamais écrasé si déjà existant.

- **Points d’attention / Edge cases / Dépendances :**
  - **Sécurité** : *Les secrets (ex : clientSecret, apiKey) ne sortent jamais via projections publiques.*  
    - Seuls `hasSecret` / `hasKey` sont exposés.
    - Une update sans le champ secret ne le remplace pas (permet edit sans perte du secret).
  - **Compatibilité** : prise en compte de valeurs et champs historiques (aliases, migration douce entre noms/fournisseurs).
  - **Validation/Mise à jour** :
    - Champs **absents** : conservés (inchangés).  
      Champs **présents mais vides** : valeur effacée (retombée sur défaut/env si applicable).
    - Limitations en taille (contexte, logo, tagline…), pattern pour images et couleurs.
    - Protection contre l’affichage de boutons non-fonctionnels si prérequis non actifs (emailAvailable, storage).
    - Plusieurs validations et fallback sont **doublés ici** même si déjà faits en amont (schéma route) : ce repo est utilisé côté tests et init.
  - **Dépendances** :  
    - `sanitizeDomainList` (sanitize domaines emails),  
    - modèles de transcription (`transcriptionModels.js`),  
    - exporte des constantes d’autres modules (actions/recipients, templating).
  - **Mise à jour/amorçage (seed)** : L

### services/api/lib/repositories/userActions.js

- **Rôle du fichier :**
  - Gère les réglages d’actions utilisateurs (collection `userActionSettings`) : gestion personnalisée des destinataires mails, dossiers de dépôt, gabarits d’objets et de fichiers. Permet également de stocker des paramètres de détection d’actions propres à chaque utilisateur.
  - Les interrupteurs (activer/désactiver un bouton) sont gérés ailleurs.
  - Une seule entrée par utilisateur, fortement liée à l’identité (`emailLower`).

- **Fonctions exportées :**
  - `toPublicUserActions(doc)`
    - **Paramètres :** `doc` (document brut MongoDB d’un réglage utilisateur)
    - **Retour :** Projection publique nettoyée des champs non sensibles : mail, storage, naming, updatedAt
    - **Effet de bord :** Aucun
  - `createUserActionsRepo(db)`
    - **Paramètres :** `db` (connexion MongoDB)
    - **Retour :** Objet repo avec :
      - `toPublicUserActions(doc)`: Voir ci-dessus.
      - `get(email, { maxRecipients })`
        - **Paramètres:** `email` (string), `{ maxRecipients }` (optionnel, nombre)
        - **Retour:** Réglages pour l’utilisateur (mail, storage, naming, updatedAt), valeurs par défaut si non existantes
        - **Effet de bord:** Accès en lecture à MongoDB
      - `update(email, patch)`
        - **Paramètres:** `email` (string), `patch` (objet partiel)
        - **Retour:** Réglages mis à jour (après écriture)
        - **Effet de bord:** Modifie ou crée un document dans MongoDB (`updateOne` avec `upsert`)
      - `getDetection(email)`
        - **Paramètres:** `email` (string)
        - **Retour:** Réglages de détection d’actions pour l’utilisateur (normalisés)
        - **Effet de bord:** Accès en lecture à MongoDB
      - `updateDetection(email, patch)`
        - **Paramètres:** `email` (string), `patch` (objet partiel)
        - **Retour:** Réglages de détection mis à jour
        - **Effet de bord:** Modifie ou crée un document dans MongoDB (détection uniquement)

- **Points d’attention :**
  - **Edge cases :**
    - Aucun document pour un compte = réglages par défaut : le système reste passif sans configuration explicite.
    - Jamais d’`upsert` basé sur `ownerFilter()` : il s’agit d’un filtre `$or` invivable pour Mongo pour les insertions uniques. Toujours passer `{ emailLower }` en critère d’écriture.
    - Les champs de mail attendent `mail` et non `email` (attention à la cohérence lors de la mise à jour).
    - Les destinataires mail sont TOUJOURS re-normalisés en lecture pour éviter toute dérive ou manipulation directe en base.
    - Les dossiers/tagFolders sont bornés en taille (FOLDER_MAX, TAG_FOLDERS_MAX) et nettoyés à l’écriture comme à la lecture.
    - Pas de cache sur la détection d’actions: chaque appel recharge en live.
  - **Dépendances :**
    - `../ownerScope.js` (`ownerFilter`, `ownerFields`) : gestion de la portée utilisateur
    - `./users.js` : normalisation des emails
    - `../actionDetectionSettings.js` : normalisation/merge des réglages de détection
    - `../actions/recipients.js` : normalisation de la liste des destinataires
    - `../actions/templating.js` : bornage des gabarits
  - **Contraintes métiers atypiques :**
    - Les réglages utilisateurs ne transitent jamais par `userConfig` (risque de suppression à chaque écriture du contexte utilisateur).
    - Index Mongo sur `emailLower` essentiel : key pour la performance et l’unicité des documents par utilisateur.

### services/api/lib/repositories/users.js

- **Rôle du fichier**
  - Gère l'accès à la collection MongoDB `user` et encapsule tout le schéma et les opérations associées.
  - Centralise la normalisation et l’usage métier de l'adresse email, et expose les fonctions métier pour la gestion des utilisateurs (création, modification, suppression, liste, authentification).

- **Fonctions/utilitaires exportés**
  - `normalizeEmail(email: string): string`
    - Retourne l'email en minuscules et trimé.
    - **Attention** : SERT UNIQUEMENT en clé de recherche (jamais pour le scope métier).
  - `toPublicUser(doc: object): object|null`
    - Transforme un doc utilisateur (MongoDB) en projection « publique » (jamais de passwordHash).
    - Retourne null si le doc est absent.
  - `toSessionUser(doc: object, opts?: {authMode, authProvider}): object|null`
    - Formate un utilisateur selon le schéma de session frontend (/api/init).
    - Retourne null si le doc est absent.
  - `createUsersRepo(db: MongoClient)`
    - Fabrique le repository utilisateurs, avec les méthodes suivantes :
      - `findByEmailLower(emailLower: string): Promise<object|null>`
        - Recherche d'utilisateur par clé normalisée.
      - `findByEmail(email: string): Promise<object|null>`
        - Recherche via clé normalisée puis brute (legacy).
      - `list(opts?: {q?: string, limit?: number, skip?: number}): Promise<{users: object[], total: number}>`
        - Liste paginée/recherchable d’utilisateurs ; projection publique.
      - `countAdmins(): Promise<number>`
        - Compte les administrateurs actifs.
      - `create(input: {...}): Promise<object>`
        - Créé un utilisateur, renseigne les champs obligatoires.
        - Déclenche l’insertion DB.
      - `update(emailLower: string, {name, role, disabled}): Promise<object|null>`
        - Modifie un utilisateur (nom, rôle, activation).
      - `setPassword(emailLower: string, {passwordHash, mustChangePassword}): Promise<object|null>`
        - Définit un nouveaux mot de passe, rajoute « password » dans les providers si absent.
        - **Effet de bord important** : Peut modifier `authProviders`.
      - `addAuthProvider(emailLower: string, provider: string): Promise<object|null>`
        - Ajoute un provider d’auth (idempotent).
      - `remove(emailLower: string): Promise<void>`
        - Supprime l'utilisateur.
      - `purgeUserData(email: string): Promise<Record<string, number>>`
        - Purge toutes les données liées à un utilisateur via ownerPurgeFilter (multi-collections).
        - Retourne le nombre de documents supprimés par collection.

- **Points d’attention**
  - **⛔ Jamais normaliser ou altérer l’email pour les usages d’identité métier** (scope, lecture, historique).
  - Gestion des doublons/casse sur l’email : l’email BRUT reste la référence pour certains scopes, alors que `emailLower` sert uniquement pour la recherche/unicité dans la DB.
  - Migration / Documents legacy possibles (absence de champ `emailLower` → fallback sur champ `email`).
  - Suppressions multi-collections dépendent du filtre métier (`ownerPurgeFilter`).
  - Import circulaire avec `ownerScope.js`, sans effet secondaire au runtime car n'affecte que les appels.
  - **Dépendance :** MongoDB (`db`), ownerScope (`ownerPurgeFilter`, `OWNED_COLLECTIONS`).
  - Fields sensibles (`passwordHash`) ne sortent jamais via `toPublicUser`. Seules les méthodes internes du repo exposent toute la doc si besoin.

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

- **Rôle du fichier :**
  - Calcul des statistiques d’usage sur les réunions et utilisateurs, de manière pure (aucune dépendance à MongoDB/Fastify). Sert à exposer la charge utile pour l’API `/api/admin/stats`. Permet des agrégations (comptes, durée, activité, etc.) sur une fenêtre temporelle donnée.
  - Justification technique : isolement du calcul côté JS car les données de dates sont hétérogènes (chaînes ISO, plusieurs champs historiques), et le volume traité reste faible (quelques milliers de documents).

- **Fonctions et constantes exportées :**
  - `DURATION_BUCKETS`  
    - *Description :* Bornes ordonnées de tranches de durée de réunion, en secondes (ex : "lt15", "lt30", etc.).
    - *Retour :* Tableau d’objets `{id, max}`.
  - `RANGE_DAYS`  
    - *Description :* Durées prédéfinies (en jours) proposées pour le choix de la période : `[7, 30, 90, 365, 0]` (0 = depuis toujours).
    - *Retour :* Tableau de nombres.
  - `meetingDate(doc)`  
    - *Paramètres :* `doc` (objet réunion, potentiellement avec plusieurs formats de date).
    - *Retour :* Date JS ou `null` si impossible à parser.
    - *Effet de bord :* Aucun.
  - `ownerKey(doc)`  
    - *Paramètres :* `doc` (objet réunion ou utilisateur avec `email`/`emailLower`).
    - *Retour :* Email en minuscules (clé d’identification insensible à la casse).
    - *Effet de bord :* Aucun.
  - `granularityFor(days)`  
    - *Paramètres :* `days` (nombre de jours).
    - *Retour :* `"day"`, `"week"` ou `"month"` selon la fenêtre.
    - *Effet de bord :* Aucun.
  - `computeUsageStats({ meetings, users, days, now })`  
    - *Paramètres :*
      - `meetings`: tableau de documents réunion (minimum : projections dates, durée, template, propriétaire).
      - `users`: tableau de documents utilisateur (email, nom, rôle, état, dates).
      - `days`: nombre de jours (0 = depuis toujours, valeur défaut : 30).
      - `now`: date courante optionnelle (pour test, défaut : `new Date()`).
    - *Retour :* Objet contenant :
      - Informations sur la période (bornes, granularité…)
      - Statistiques globales (nb de réunions, durées moyennes/medians, nombre d’usagers actifs, nouveaux, etc.)
      - Séries temporelles par granularité calendaire, découpage par buckets de durée, activité par jour de semaine.
      - Classements des utilisateurs les plus actifs et les moins actifs sur la période.
    - *Effets de bord :* Aucun, fonction pure.

- **Points d’attention / Edge cases :**
  - Les dates sont sur plusieurs champs (`lastConnecion`, `lastConnection`, `now`) avec potentiels formats invalides ou absents → réunion prise en compte dans les totaux mais ignorée des séries temporelles si impossible à parser.
  - L’absence de `meetingDuration` (réunions anciennes) : ces réunions n’entrent pas dans les moyennes/medians de durée ni dans la couverture "durées connues".
  - Les réunions sans owner ou email partiellement normé : `ownerKey` harmonise mais certains documents peuvent être anonymes (clé vide).
  - Les découpages temporels produisent toujours tous les "buckets" entre le début et la fin de la période, y compris s'ils sont vides (affichage graphique pertinent).
  - Garde-fou sur le nombre maximal de buckets temporels générés (limité à 400).
  - Comptes désactivés exclus du classement "idle".
  - Pas de dépendance réseau ou base, fonction testable sans I/O.

- **Dépendances internes :**
  - Pas de dépendance externe, uniquement des helpers techniques internes (manipulation de dates, normalisation d’e-mails, bucketisation des valeurs).

### services/api/lib/transcriptionModels.js

- **Rôle du fichier :**
  - Centralise la liste des modèles de transcription temps réel utilisables et valides côté administration.
  - Évite que l’UI propose des modèles rejetés par les endpoints backend (évite erreurs 400 côté utilisateur).

- **Fonctions et constantes exportées :**
  - `DEFAULT_TRANSCRIPTION_MODEL`  
    - *Type :* string  
    - *Valeur :* 'gpt-realtime-whisper'  
    - *Usage :* Modèle de transcription par défaut utilisé si aucun choix explicite.
  - `TRANSCRIPTION_MODELS`  
    - *Type :* array<string>  
    - *Valeur :* Liste ordonnée des modèles acceptés côté frontend/admin.
  - `isTranscriptionModel(id)`  
    - *Paramètre :* `id` (string)  
    - *Retour :* boolean (vrai si le modèle est dans `TRANSCRIPTION_MODELS`)  
    - *Effet de bord :* Aucun.
  - `resolveTranscriptionModel(stored, envModel)`  
    - *Paramètres :*  
      - `stored` (string, optionnel) — valeur stockée côté administration  
      - `envModel` (string, optionnel) — valeur de la variable d’environnement  
    - *Retour :* string — identifiant du modèle à utiliser (garanti valide)  
    - *Effet de bord :* Aucun. Ignore une valeur non reconnue et rétablit un fallback sûr (jamais de rejet global des sessions à cause d’une erreur d’édit.)

- **Points d'attention :**
  - Les identifiants **hors liste** sont systématiquement refusés par le backend `/realtime/client_secrets` (erreur 400).
  - `resolveTranscriptionModel` protège contre une corruption de la base admin ou un env mal configuré : jamais de valeur inconnue propagée.
  - Certains modèles n’émettent *jamais* d'événement `completed` (ex : `gpt-realtime-whisper`), la gestion des "fins de ligne" dans le frontend doit en tenir compte (`src/utils/transcriptDeltas.js`).
  - Modèles susceptibles d’être ajoutés ou d'exister côté provider sans être activables (ex : `gpt-4o-transcribe-diarize`), bien vérifier la liste à chaque évolution.
  - **Aucune dépendance externe**, pure logique de whitelist.

### services/api/routes/actions/execute.js

- **Rôle du fichier :**
  - Définit les routes API pour exécuter des actions utilisateur sur une transcription ou un résumé (par ex. envoi par email, dépôt sur un drive), via des boutons configurés dans l’admin.
  - Garantit que les actions utilisent le document local affiché à l’utilisateur (modifications non persistées incluses).
  - Ne permet jamais de spécifier la destination (email, dossier…) dans la requête : les destinations sont résolues côté serveur selon la configuration (lib/actions/resolve.js), pour des raisons de sécurité et d’auditabilité.

- **Fonctions exportées :**
  - `actionsExecuteRoutes(app)` (**export par défaut**)
    - **Paramètre :** `app` (instance du serveur/routeur Fastify)
    - **Retour :** `void` (side effects : attache des routes POST `/actions/email` et `/actions/store` à l’instance)
    - **Effets de bord :** 
      - Instancie un rate-limiter par compte utilisateur (pas par IP).
      - Déclare un hook d’arrêt à la fermeture de l’app.
      - Route `/actions/email` :
        - Envoie le document en email (corps JSON ou multipart), éventuellement avec pièce jointe.
        - Vérifie l’activation de l’action, le quota par compte, et utilise les réglages persistés pour les destinataires.
        - **Retour:** `{ ok, via, degraded }` ou erreur JSON.
      - Route `/actions/store` :
        - Dépose le document sur le drive relié (reçoit uniquement des requêtes multipart contenant le fichier).
        - Peut exiger une confirmation utilisateur (`approved`) selon la destination.
        - **Retour :** `{ ok, provider, folder, driveName, tag }` ou erreur JSON.

- **Points d’attention / edge cases / dépendances notables :**
  - Refuse toute destination fournie dans la requête (sécurité, prévention relay/détournement).
  - Rate-limiting par compte utilisateur (risque d’abus par script massivement authentifié).
  - Un document peut contenir des modifications locales non encore persistées.
  - Multipart : prise en compte explicite de l’absence ou taille excessive de la pièce jointe (erreurs 400/413).
  - `/actions/store` : retour 409 (`approval_required`) pour distinction explicite entre "à confirmer" et "déposé", afin d’éviter les traitements automatiques de perte de session par le frontend.
  - Dépendances sur des modules internes (auth, rbac, rateLimit, errors, document, execute, etc.), ainsi que sur la résolution de destination/config (lib/actions/resolve.js).
  - La logique des contrôles d’accès et de la vérification de l’activation d’une action réside côté serveur, masquage côté client seul insuffisant.

- **Résumé rapide routes :**
  - **POST /actions/email** : envoie une transcription/résumé par mail ; document en JSON ou multipart, destinataires résolus serveur.
  - **POST /actions/store** : dépose un fichier sur un drive relié ; requiert multipart, parfois confirmation d’utilisateur.

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

- **Rôle du fichier :**
  - Définit les routes liées aux réglages d'actions utilisateur (destinataires email, dossier de dépôt, gabarits d’objet/nom de fichier).
  - Expose aux clients les plafonds organisationnels, variables de gabarit autorisées et limites pour garantir la cohérence avec les règles administratives.
  - Interagit avec les paramètres administrateur et spécifiques à l'utilisateur.

- **Fonctions exportées :**
  - `actionsSettingsRoutes(app)`
    - **Paramètres** :
      - `app` : Instance de l’application Fastify ou équivalent.
    - **Retour** : void (enregistre les routes sur l’application).
    - **Effets de bord notables** :
      - Registration des routes HTTP :
        - `GET /actions/settings`
          - Authentifie l’utilisateur.
          - Récupère les plafonds d’action et réglages utilisateur.
          - Retourne `{ settings, ceiling, limits, variables, defaults }`.
        - `POST /actions/settings`
          - Authentifie l’utilisateur.
          - Vérifie l’origine de la requête (protection CSRF).
          - Valide/adapte les destinataires (noms refusés, limite max).
          - Valide les variables des gabarits (rejette si inconnue).
          - Applique un patch partiel et sauvegarde les réglages utilisateur.
          - Retourne les réglages à jour et le contexte d’administration.
      - Peut refuser la requête avec code et motif explicite (cf. erreurs dédiées).

- **Points d'attention / Edge cases :**
  - **Destinataires** :
    - Toute adresse refusée bloque la requête (message d’erreur explicite, pas de filtrage silencieux).
    - Si le nombre dépasse la limite admin, rejet avec une erreur dédiée.
  - **Gabarits (templates)** :
    - Toute variable non reconnue dans un template bloque la mise à jour (erreur dédiée).
  - **CSRF** :
    - Vérification de l'origine sur `POST` (sauf cas injection/script).
  - **Patch partiel** :
    - Seuls les champs présents dans le corps de la requête sont modifiés ; aucun effacement implicite de réglages préexistants.
  - **Dépendances** :
    - Autorisations utilisateur (`requireUser`), gestion des erreurs (`fail`), contrôle d'origine (`isSameOrigin`), normalisation/validation des données entrée/sortie spécifiques (recipients, variables de template, etc).
    - Limites en provenance de la configuration administrateur, utilisées pour borner les possibilités des utilisateurs.

### services/api/routes/actions/storage.js

- **Rôle du fichier**  
  Gère les routes API pour la navigation dans le stockage connecté (Google Drive, Microsoft OneDrive/SharePoint) depuis l’interface utilisateur, sans exposer de jeton d’accès au navigateur. Permet de lister, rechercher, connaître le chemin, et créer des dossiers à travers une API serveur.

- **Fonctions exportées**
  - `actionsStorageRoutes(app)`
    - **Paramètres** :  
      - `app` : Instance de l’application (contenant notamment `settings`, `driveBrowser`).
    - **Retour** :  
      - Enregistre les routes au sein de l’application (`undefined`).
    - **Effet de bord notable** :  
      - Déclare 4 routes GET et 1 POST, toutes en lecture seule côté fournisseur sauf la POST qui permet la création de dossier.

  - **Routes créées** :
    - `GET /actions/storage/drives`
      - **Effet** : Liste les espaces de stockage racine accessibles (Drives Google, OneDrive, SharePoint suivis).
      - **Retour** :  
        - Objet `{ provider, multiDrive, sharedDrivesMissing, drives }`.
      - **Points d’attention** :  
        - La propriété `sharedDrivesMissing` indique si la liste est tronquée par manque de scope OAuth.
        - Ne purge pas la connexion en cas d’erreur d’authentification.

    - `GET /actions/storage/folders`
      - **Params Query** :  
        - `driveId` (optionnel), `cursor` (optionnel), `search` (optionnel), `pageToken` (optionnel).
      - **Effet** : Liste les sous-dossiers du dossier courant ou résultats de recherche.
      - **Retour** :  
        - `{ ok: true, ...result }` où `result` contient la liste des objets folders.
      - **Edge Cases** :
        - Limites de taille sur les paramètres via `listQuery`.
        - Échoue silencieusement en cas d’erreur d’authentification (ne purge pas la connexion).

    - `GET /actions/storage/path`
      - **Params Query** :  
        - `driveId` (optionnel), `cursor` (optionnel).
      - **Effet** : Donne le chemin absolu d’un dossier obtenu par recherche.
      - **Retour** :  
        - `{ ok: true, path }`.
      - **Edge Cases** :
        - Retourne `undefined` si le chemin n’est pas défini ou en cas d’erreur.

    - `POST /actions/storage/folders`
      - **Body** :  
        - `driveId` (optionnel), `cursor` (optionnel), `name` (requis, string).
      - **Effet** : Crée un dossier dans le stockage distant.
      - **Retour** :  
        - `{ ok: true, folder }` en cas de succès.
      - **Effet de bord** :
        - Vérification de l’origine via `isSameOrigin(req)`.
        - Rejette les noms contenant un `/` (nom de dossier non valide dans ce contexte).

- **Points d’attention**
  - **Dépendances** :
    - Repose sur `app.driveBrowser` (API d’accès unifiée pour fournisseurs).
    - Exige que le serveur possède et gère le refresh token (jamais de jeton d’accès en front).
    - Les connexions/authentifications sont gérées via des helpers (`resolveStorageAccess`, etc.).
  - **Edge Cases / Sécurité** :
    - Ne jamais supprimer la connexion utilisateur sur simple échec navigation (erreur réseau ou auth temporaire).
    - Toutes les routes sauf la POST sont en lecture seule et donc exemptes de vérification d’origine.
    - Les paramètres de requête/body sont validés en taille et format.
    - Un nom de dossier contenant un `/` est explicitement rejeté (empêche l’injection de niveaux de dossier ou ambigüités de chemin).
    - Gestion fine des erreurs d’authentification (renvoi d’un message dédié si l’auth est révoquée).
    - En cas d'erreur sur une route, la réponse est toujours contrôlée (jamais d’exception non catchée vers l’utilisateur).

- **À lire dans le code :**
  - Pour l’algorithme client : la notion de navigation par « curseur » et « nom » (adapter pour Google Drive et Graph/Onedrive/SharePoint).
  - Voir aussi le fichier `lib/connections/browse.js` pour la logique de navigation/protocole.

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

- **Rôle du fichier :**
  - Regroupe et installe les routes d'administration sous le préfixe `/api/admin` dans l'application.
  - Garantit la normalisation des erreurs (contrat cohérent avec `/api/auth`), notamment pour les erreurs de validation (ajv) et la structure des réponses d’erreur.

- **Fonction exportée :**
  - **Nom :** `adminRoutes`
  - **Paramètres :**
    - `app` (instance du serveur/app, typiquement fastify)
  - **Retour :**
    - Aucun (side effect uniquement : enregistrement des routes sur l’app)
  - **Effets de bord notables :**
    - Enregistre des sous-routes provenant de trois modules : `users.js`, `settings.js` et `stats.js` sous `/admin`
    - S’appuie sur un handler d’erreurs racine pour normaliser les réponses d’erreur

- **Points d’attention :**
  - **Dépendances importantes :**
    - Dépend des modules locaux `./users.js`, `./settings.js` et `./stats.js` pour intégrer les sous-routes d’administration.
    - Dépend du système de gestion d’erreurs global (`app.js`, `lib/errors.js`).
  - **Edge cases :**
    - Si un des modules de routes (`users`, `settings`, `stats`) échoue à l’import ou à l’enregistrement, tout ce groupe admin échouera à s’initialiser correctement.
    - La structure des erreurs dépend fortement de la cohérence avec `/api/auth` et de la normalisation ajv.
  - **Convention :**
    - Toutes les routes enfants héritent du préfixe `/api/admin`.

### services/api/routes/admin/settings.js

- **Rôle du fichier :**
  - Définit les routes API d’administration pour la gestion centralisée des réglages applicatifs : identité, IA (OpenAI), actions post-réunion, apparence (branding), et contexte d’organisation.
  - Toutes les routes sont réservées aux administrateurs (contrôle par `requireAdmin`).
  - Les valeurs sensibles (ex. clés API) ne sont jamais ré-exposées aux clients.

- **Fonctions exportées :**
  - `default function adminSettingsRoutes(app)`
    - **Paramètre** : `app` (contexte serveur, injecte settings, config, mailer, openai, etc.).
    - **Retour** : Aucun (enregistre les routes Fastify/Express sur l’instance `app`).
    - **Effets de bord notables** : Ajoute des routes HTTP protégées à l’application.
    - **Routes définies :**
      - `GET /settings/auth`
        - Retourne les réglages d’authentification publics.
      - `POST /settings/auth`
        - Met à jour les réglages d’auth (Google, Entra, domaines autorisés).
        - Relais explicites des champs : absent = inchangé, vide = suppression.
      - `GET /settings/ai`
        - Retourne les réglages OpenAI publics.
      - `POST /settings/ai`
        - Met à jour la clé et/ou le modèle de transcription OpenAI.
        - **Clé vérifiée en amont auprès d’OpenAI** ; refus explicite ≤ clé invalide/suspendue.
        - Champ absent = inchangé ; champ vide = retour à la valeur d’environnement (.env).
      - `POST /settings/ai/test`
        - Vérifie la validité de la clé OpenAI effectivement utilisée, sans changement d’état.
      - `POST /settings/ai/test-transcription`
        - Teste le modèle de transcription via un appel Realtime effectif OpenAI ; détecte accès refusé, quotas, etc.
        - Modèle testé : fourni ou, à défaut, enregistré.
      - `GET /settings/actions`
        - Retourne les réglages actions post-réunion, liste des variables de gabarit utilisables.
      - `POST /settings/actions`
        - Met à jour les réglages post-réunion (mails, fichiers, variables templates).
        - **Refus des variables inconnues** dans les templates : échec explicite si usage non autorisé.
      - `GET /settings/branding`
        - Retourne les réglages branding publics, info sur l’auteur du changement.
      - `POST /settings/branding`
        - Met à jour logo, phrase d’accueil, couleur primaire.
      - `GET /settings/org-context`
        - Retourne le contexte organisationnel (vocabulaire partagé) avec métadonnées.
      - `POST /settings/org-context`
        - Met à jour le contexte organisationnel.

- **Points d’attention :**
  - **Aucune donnée sensible n’est renvoyée dans les réponses** (masquage strict).
  - **Relayage explicite obligatoire** des champs entre schéma et dépôt (ajouter un champ côté schéma sans logique d’écriture côté route = aucun effet, message « Enregistré » trompeur).
  - **Sanitisation & validation** renforcées : ex. listes de domaines, clés, templates vérifiés côté serveur.
  - **Distinction champ absent / champ vide** : Absence ↔ valeur inchangée, chaîne vide ↔ suppression/retrait/revenir à défaut.
  - **Gestion des erreurs OpenAI** : messages d’erreur de l’amont relayés pour diagnostic, log warnings sur refus.
  - **Variables de template** : Allowlists dynamiques synchronisées serveur <-> client ; tout décalage refusera la requête côté serveur.
  - **Dépendances principales** : `app.settings` (accès aux dépôts des réglages), middlewares de validation et RBAC, utilitaires OpenAI, mailer (optionnel), schémas de validation (auth/schemas.js).
  - **Cas limites** : modification du schéma sans mise à jour des routes, passage d’une clé OpenAI erronée, modèles de transcription inaccessibles, listes de domaines malformées.

### services/api/routes/admin/stats.js

- **Rôle du fichier**  
  Fournit une route API `/stats` réservée aux administrateurs pour consulter des statistiques agrégées d'usage (nombre, volume des réunions/utilisateurs) sur l'ensemble de l'installation, sans accès au contenu détaillé des réunions.

- **Fonction exportée**
  - `adminStatsRoutes(app)`
    - **Paramètres** : `app` (instance du serveur, typiquement Fastify ou Express)
    - **Retour** : Aucune valeur explicite (enregistre la route `/stats` sur l'app).
    - **Effets de bord notables** :
      - Création de la route GET `/stats` (API admin uniquement).
      - Validation de l'admin via `requireAdmin`.
      - Requêtes vers la base MongoDB (`resume` et `user`), avec projection stricte sur les champs nécessaires.
      - Appel de la fonction pure `computeUsageStats` pour le calcul.
      - Les réponses ne contiennent que des statistiques agrégées, jamais de texte de réunion.

- **Points d'attention**
  - **Dépendances notables** :
    - `requireAdmin` (RBAC, contrôle d’accès)
    - `computeUsageStats`, `RANGE_DAYS` (calcul, validation)
    - `adminStatsQuery` (schéma de validation de la querystring)
  - **Edge cases** :
    - Si le paramètre `days` n’est pas dans `RANGE_DAYS`, il bascule sur 30 jours (par défaut).
    - Les champs Mongo projetés sont limités, tout ajout de champs dans le calcul doit être reporté ici.
    - Les noms de champs contiennent une coquille persistante : `lastConnecion` sans "t" (présent dans 2 collections).
    - La route traverse toutes les réunions et utilisateurs, attention à la volumétrie (risque sur très grandes installations).
  - **Sécurité & confidentialité** :
    - Accès réservé aux administrateurs et projection stricte pour éviter toute fuite de données sensibles.

### services/api/routes/admin/users.js

- **Rôle du fichier :**
  - Fournit les routes d'administration pour la gestion des utilisateurs (CRUD, reset mot de passe), uniquement accessibles aux administrateurs.
  - Choix de routes avec verbes dans le chemin (et non REST avec `:id`) pour éviter d'exposer les emails ou `_id` en URL.

- **Fonctions/exportations principales :**
  - **adminUsersRoutes(app)**
    - **Paramètre :** `app` (contexte principal de l’application, expose les méthodes utilisateurs et sessions)
    - **Retour :** Rien (enregistre les handlers sur l’instance `app`)
    - **Effets de bord :** Modifie l’état utilisateur, sessions associées, connexions OAuth, tokens de réinitialisation.
    - **Routes exposées :**
      - `GET /users`  
        - *Liste des utilisateurs selon critères*  
        - `q`, `limit`, `skip` (query)  
        - Retour : Tableau d'utilisateurs filtrés
      - `POST /users/create`
        - *Création d'utilisateur par admin*  
        - Paramètres : {email, name, role, password?, mustChangePassword?}
        - Retour : Utilisateur créé (+ mot de passe généré si absent en entrée)
        - **Effet :** Mot de passe stocké haché
      - `POST /users/update`
        - *Modification d’un utilisateur*  
        - Paramètres : {email, name?, role?, disabled?}
        - Retour : Utilisateur modifié
        - **Effet :** Si désactivation ou rétrogradation du rôle, toutes les sessions de l’utilisateur sont détruites
      - `POST /users/reset-password`
        - *Réinitialisation du mot de passe*  
        - Paramètres : {email, password?, mustChangePassword?}
        - Retour : Utilisateur modifié (+ mot de passe généré si absent en entrée)
        - **Effet :** Détruit toutes les sessions et tokens de reset pour ce compte
      - `POST /users/delete`
        - *Suppression d’un utilisateur (et purge possible de ses données)*
        - Paramètres : {email, purgeData?}
        - Retour : (204 No Content)
        - **Effet :** Sessions, connexions OAuth, tokens reset supprimés. Purge des données personnelles si demandé.

- **Points d'attention / Edge cases :**
  - **Protection contre la perte totale d’administration :**
    - Impossible de désactiver, rétrograder ou supprimer le dernier administrateur actif (`isLastActiveAdmin`).
  - **Opérations interdites :**
    - Un administrateur ne peut pas se désactiver ou se supprimer lui-même.
  - **Password policy :**
    - Vérification de la robustesse systématique sur création/réinitialisation; retour explicite du motif de rejet.
  - **Email en entrée :**
    - Toujours normalisé (minuscule, format homogène).
  - **Sessions :**
    - Toute désactivation/réinitialisation/suppression purge les sessions de l’utilisateur immédiatement.
  - **Connexions tierces (OAuth) :**
    - Révocation systématique des refresh tokens pour les providers proposant la fonction.
  - **Dépendances externes principales :**
    - `../../lib/auth/password.js` (gestion mots de passe)
    - `../../lib/repositories/users.js` (gestion utilisateurs)
    - `../../lib/errors.js`, `../../lib/rbac.js` (gestion droits/erreurs)
    - `../auth/schemas.js` (validation des schémas req)
    - `app.sessions`, `app.resetTokens`, `app.connections` (API interne pour manipuler sessions et connexions)

- **Remarque :**
  - Les emails n'apparaissent jamais dans l'URL (usage exclusif dans le corps/params), pour confidentialité et robustesse.

### services/api/routes/ai.js

- **Rôle du fichier**
  - Définit les routes API relatives aux fonctionnalités d’IA : gestion de jetons éphémères pour OpenAI Realtime, transcription batch via Whisper, extraction d’actions en réunion, et rafraîchissement du texte transcrit via le contexte des notes.
  - Garantit que la clé OpenAI reste côté serveur.
  - Fournit un historique des adaptations liées au workflow n8n.

- **Fonctions exportées**
  - `default function aiRoutes(app)`
    - **Paramètres :**
      - `app` : instance du serveur/serveur Fastify avec accès à la configuration et aux services (OpenAI, settings, logs, etc.).
    - **Effet de bord :** Enregistre plusieurs routes HTTP sur l’instance du serveur.
    - **Routes et logique principale :**
      - `GET /tempkey`
        - **Entrée** : paramètre de query `lang` (optionnel).
        - **Retour** : objet contenant le jeton OpenAI Realtime pour transcription live (`value`, `client_secret.value`, et `transcriptionModel`).
        - **Effets de bord** : Log des erreurs (logger de la requête), appele OpenAI pour générer un jeton.
        - **Points d’attention** : 
          - Fait coexister deux formats attendus côté client pour le jeton.
          - La langue est validée (sinon repli sur `fr`).
      - `POST /record`
        - **Entrée** : Fichier audio envoyé multipart (champ `data` attendu).
        - **Retour** : `{ text }` – texte transcrit.
        - **Effets de bord** : Log des erreurs, envoie le fichier à OpenAI pour batch transcription.
        - **Points d’attention** : 
          - Erreur 400 si fichier absent.
      - `POST /actions`
        - **Entrée** : JSON avec `content`, `actions`, `dismissed`.
        - **Retour** : `{ actions }` – liste d’actions détectées/affinées.
        - **Effets de bord** : Log des erreurs, appelle la détection 'actionDetection' avec ajout du contexte métier.
        - **Points d’attention** :
          - Prend en compte les actions déjà détectées/supprimées.
          - Si la fonctionnalité a été désactivée côté utilisateur, retour immédiat liste vide.
      - `POST /refine-transcript`
        - **Entrée** : JSON avec `sentences` (2 dernières phrases) et `notes` (notes de réunion).
        - **Retour** : `{ sentences }` – phrases éventuellement réécrites par le modèle ; sinon inchangées.
        - **Effets de bord** : Log des erreurs, prompt(s) OpenAI pour raffinage.
        - **Points d’attention** :
          - Taille des notes et phrases strictement limitée (payload minuscule).
          - Si sortie du modèle illisible ou mal alignée, on retourne les phrases sources.

- **Points d’attention, edge cases, dépendances**
  - Gestion stricte des paramètres (`lang` normalisé, défaut sur `fr`, tailles max des champs `notes` et `sentences`).
  - Si modèle OpenAI ou configurations sont changés en cours de session, les changements sont pris en compte sans redémarrage.
  - Les erreurs upstream (OpenAI) sont systématiquement loguées et relayées via `replyUpstreamError`.
  - Dépend des modules internes : `lib/openai.js`, `lib/actionDetection.js`, `lib/prompts.js`.
  - Nécessite que l’objet `app` fournisse `openai`, `settings`, `userActions`, etc.  
  - Les interactions audio en temps réel ne transitent jamais physiquement par ce service (jeton uniquement).

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

- **Rôle du fichier**
  - Définit les routes API pour la connexion et la déconnexion par mot de passe utilisateur.
  - Met en place la logique de gestion de session, validation d’origine, limitation du nombre de tentatives (rate limiting), et normalisation des données d’entrée pour l’authentification.

- **Fonction exportée**
  - `loginRoutes(app)`
    - **Paramètres** :
      - `app` : instance du serveur (ex : Fastify), contenant la configuration, les utilisateurs, les sessions, etc.
    - **Retour** : aucun (side effect : ajoute les routes `/login` et `/logout` à l’application passée en paramètre).
    - **Effets de bord notables** :
      - Ajoute deux routes POST :
        - **/login**
          - Authentifie un utilisateur par email/mot de passe.
          - Met en place deux rate limiters (par IP et par compte).
          - Émet un cookie de session à la connexion réussie.
          - S’assure que la réponse aux échecs ne fournit aucune indication sur l’existence ou l’état du compte (protection contre l’énumération).
        - **/logout**
          - Procède à la suppression de la session et du cookie associé, envoyé idempotent 204 même si l’utilisateur n’a pas de session.
      - Nettoie/réalise l’arrêt des rate limiters à la fermeture de l’application (`onClose`).
      - Dépend fortement des middlewares/dépendances internes sur gestion des cookies, vérification de mot de passe, gestion des utilisateurs et sessions, contrôle d’origine de requête, validation de schéma.
  
- **Points d’attention**
  - **Protection contre l’énumération d’utilisateurs** :
    - Même temps de réponse et mêmes messages que l’échec soit dû à un mauvais mot de passe, compte inexistant, désactivé ou sans mot de passe.
    - Utilise systématiquement une vérification CPU-intensive (`burnVerify`) sur échec pour ne pas révéler l’état du compte.
  - **Rate limit par IP ET par compte** :
    - Bloqueur efficace contre les attaques en force brute, particulièrement pour protéger les utilisateurs ciblés et l’API globale.
    - Les paramètres de limitation sont configurables via `app.config`.
  - **Validation d’origine (`isSameOrigin`)** :
    - Refuse toute authentification provenant d’une origine différente de celle attendue (CSRF).
  - **Edge cases** :
    - Les champs du formulaire sont normalisés (e-mail), mais dépendant de la consistance du schéma validé en amont (`loginBody`).
    - `/logout` retourne toujours 204, que l’utilisateur soit connecté ou non (idempotence).
  - **Dépendances notables** :
    - Modules internes : mot de passe, cookies, sessions, utilisateurs, gestion des erreurs, validation de schéma, configuration et protection contre les attaques par force brute.
    - Attendu que les couches d’accès aux users/sessions lancent correctement les exceptions/retours.
    - Les options de sécurité des cookies (`config.cookieSecure`) doivent correspondre à la politique HTTPS du déploiement.
    - Le bon fonctionnement repose sur la présence d’un corps de requête conforme (validé par `loginBody`).

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

- **Rôle du fichier**
  - Définit les schémas de validation JSON pour les corps et requêtes des routes d’authentification et d’administration (Fastify/ajv).
  - Garantit la conformité des structures reçues (validation à l’entrée).
  - Privilégie la validation déclarative native Fastify (pas de zod ni de validator custom).

- **Fonctions/schémas exportés**  
  Chacun est un objet de schéma Fastify/ajv :

  - `loginBody`  
    - Params : objet `{ email, password }`  
    - Email doit matcher un pattern défini en externalité.
    - Retour/effet : utilisé pour valider le login d’un utilisateur.
  
  - `forgotBody`  
    - Params : `{ email, lang }` (`lang` optionnel: `'fr'` ou `'en'`)
    - Effet : validation sur la demande de réinitialisation du mot de passe.

  - `resetBody`  
    - Params : `{ token, password }`, deux strings avec limitations de taille.
    - Effet : validation du reset de mot de passe via token.

  - `changePasswordBody`  
    - Params : `{ currentPassword, newPassword }`
    - Effet : validation du changement de mot de passe.

  - `adminCreateBody`  
    - Params : `{ email, password, name, role, mustChangePassword }`
    - Role : `"user"` ou `"admin"`.
    - Effet : création d’un utilisateur en admin.

  - `adminUpdateBody`  
    - Params : `{ email, name, role, disabled }`
    - Effet : mise à jour partielle d’un utilisateur par l’admin.

  - `adminResetBody`  
    - Params : `{ email, password, mustChangePassword }`
    - Effet : réinitialisation du mot de passe d’un utilisateur par l’admin.

  - `adminDeleteBody`  
    - Params : `{ email, purgeData }`
    - Effet : suppression d’un utilisateur, option pour purger ses données.

  - `adminSettingsBody`  
    - Params : configuration des providers OAuth (google/entra), et liste de domaines autorisés.
    - Dépendances : valeurs max/importées pour les longueurs et enums.

  - `adminAiSettingsBody`  
    - Params : `{ apiKey, transcriptionModel }`. Les deux sont facultatifs, voir section "points d’attention" pour signification.

  - `adminBrandingSettingsBody`
    - Params : `{ logo, tagline, primaryColor }` ; changement apparence installation.

  - `adminOrgContextSettingsBody`
    - Params : `{ context }` ; contexte organisation.

  - `userActionDetectionBody`
    - Params : réglages détection d’action utilisateur (`enabled`, `sensitivity`, `triggerWords`, etc.).

  - `userActionDetectionTestBody`
    - Params : `{ content, settings }`
    - Usage : tester la détection sans effet de bord.

  - `adminTranscriptionTestBody`
    - Params : `{ model }` ou `null`
    - Usage : tester un modèle de transcription, même schéma que pour la sélection.

  - `adminActionsSettingsBody`
    - Params : actions proposées après transcription/résumé, connexion provider, mail policy…

  - `userActionsSettingsBody`
    - Params : préférences d’action utilisateur (destinataires, stockage, etc.).

  - `actionTestBody`
    - Params : `{ target, kind, lang, scope }`
    - Usage : tester l’action (mail, stockage), distinction admin/user.

  - `adminListQuery`
    - Params : `{ q, limit, skip }`
    - Usage : Recherche et pagination liste d’utilisateurs admin.

  - `adminStatsQuery`
    - Params : `{ days }`, enum restrictif.

- **Points d’attention / edge cases / dépendances**
  - Aucune réponse n’est strictement schématisée (`schema.response` absent) : ne pas déclarer car Fastify retirerait alors tout champ inconnu sans alerter, générant des bugs côté frontend.
  - Les validations côté serveur sont doublées côté lecture (ex : détection d’action, mailPolicy…), pour éviter les incohérences si des documents hors-schéma surviennent.
  - `format: 'email'` n’est PAS utilisé, car la dépendance `ajv-formats` n’est pas incluse (évite toute erreur de compilation ajv).
  - Beaucoup de bornes et patterns sont importés dynamiquement depuis d’autres modules, attention lors de la modification des valeurs limites (ex: taille des mots de passe, nombre max de destin

### services/api/routes/auth/session.js

- **Rôle du fichier :**
  - Définit les routes publiques d'API pour l'authentification : exposition des capacités du serveur (SSO, options de connexion) et information sur l’état de la session utilisateur.
  - Utilisé au démarrage du frontend pour configurer l’UI (affichage conditionnel des boutons, branding, etc.).

- **Fonction exportée :**
  - `sessionRoutes(app)`
    - **Paramètres :**
      - `app` : Objet application (doit exposer `.get()`, `.settings`, `.config`, `.mailer`, etc.).
    - **Retour :**
      - Aucun (enregistre les routes via `app.get()`).
    - **Effets de bord notables :**
      - Définit deux routes GET publiques :  
        - `/config` : retourne capacités et configuration publique du serveur.
        - `/session` : retourne l’état d’authentification de l’utilisateur actuel.
    - **Pas d’état global modifié.**

- **Détail des routes :**
  - `/config`
    - Retourne un objet JSON de configuration publique (présence SSO, fournisseurs activés, politique de mot de passe, actions post-réunion, branding…).
    - Donne seulement les informations nécessaires au frontend pour afficher les bons boutons/éléments.
    - Utilise :  
      - `isProviderUsable()` pour la validation dynamique des providers (Google, Entra),
      - les méthodes `app.settings` pour actions et branding.
  - `/session`
    - Retourne `{ authenticated: false }` si l’utilisateur n’est pas identifié (pas d’email dans `req.user`).
    - Sinon, retourne `{ authenticated: true, user: ... }` où `user` est réduit par `toSessionUser()`.
    - **Ne jamais renvoyer 401** (important pour éviter un flicker de l’UI au boot frontend).

- **Points d’attention / Edge cases :**
  - **Jamais de 401 sur `/session`** : en cas d’absence de session, renvoyer `{ authenticated: false }`.
  - Réponses à `/config` et `/session` doivent être rapides et indépendantes du contexte utilisateur (routes publiques, infos non sensibles).
  - Les capabilities (ex : SSO activé ou non) dépendent à la fois des settings dynamiques et de la config process (`app.config`, `app.settings`, etc.).
  - `isProviderUsable()` dépend de la bonne configuration des identifiants dans les settings.
  - Pour l’avenir : le flag Traefik OIDC (`oidcEnabled`) est legacy, à retirer ultérieurement.

- **Dépendances notables :**
  - Libs internes :  
    - `lib/auth/password.js` (MIN_PASSWORD_LENGTH)  
    - `lib/repositories/users.js` (toSessionUser)  
    - `lib/auth/providers.js` (isProviderUsable)  
    - `lib/auth/resolve.js` (authModeOf, authProviderOf)
  - Repose sur les propriétés et méthodes de l’objet `app` passé en paramètre (structure attendue).

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

- **Rôle du fichier :**
  - Gère les routes de démarrage et de callback du flux d’authentification SSO (OIDC) pour tous les fournisseurs, avec une gestion centralisée de la session utilisateur (cookie unique).
  - Fonctionne uniquement par navigation/redirect, jamais par des réponses JSON.
  - Sur échec, redirige toujours vers `/signin?error=<slug>`.

- **Fonctions exportées :**

  - `createStartHandler(app, provider)`
    - **Paramètres :**
      - `app` : instance Fastify de l’application.
      - `provider` : objet de configuration du fournisseur (entrée de PROVIDERS).
    - **Retour :**
      - Fonction asynchrone `(req, reply)` à monter en route, qui :
        - Contrôle le rate limit par IP.
        - Valide la disponibilité du fournisseur.
        - Récupère la configuration du fournisseur et les endpoints OAuth.
        - Prépare et redirige vers l’IdP (fournisseur) avec l’état stocké en cookie.
        - En cas d’erreur, redirige vers `/signin?error=<slug>`.
    - **Effets de bord notables :**
      - Pose un cookie d’état OAuth.
      - Dépend du rate limiter (`rateLimit.js`).
      - Ajoute un hook d’arrêt du limiter à la fermeture du serveur.

  - `createCallbackHandler(app, provider)`
    - **Paramètres :**
      - `app` : instance Fastify de l’application.
      - `provider` : objet de configuration du fournisseur.
    - **Retour :**
      - Fonction asynchrone `(req, reply)` à monter en route, qui :
        - Gère le retour IdP : vérifie état et code, puis échange l’auth code contre un profil.
        - Vérifie les emails (présence, email_verified le cas échéant, domaine autorisé).
        - Crée un utilisateur si besoin et si le domaine est autorisé.
        - Ajoute le provider à l’utilisateur existant si absent.
        - Crée une session (cookie `mybrief_sess`).
        - Redirige vers le “next” validé par le flux initial.
        - Redirige vers `/signin?error=<slug>` en cas d’échec à n’importe quelle étape.
    - **Effets de bord notables :**
      - Pose/supprime un cookie d’état OAuth.
      - Crée ou met à jour des utilisateurs, crée une session.

- **Points d’attention / Edge cases :**
  - **Rate limit** (démarrage du flux SSO) : tentatives trop fréquentes → redirection erreur.
  - **Disponibilité des fournisseurs** : Si désactivé ou endpoints OIDC injoignables → erreur.
  - **Vérification du state OAuth** : sécurité renforcée (triple contrôle, state + flow).
  - **Emails non vérifiés** (si requis), ou absents → refusé.
  - **Domaines restreints** : si l’inscription libre n’est pas autorisée, le domaine doit être explicitement dans `allowedDomains`.
  - **Échecs/annulations utilisateurs** : gestion fine des retours `?error=...` de l’IdP.
  - **Création d’utilisateurs** : automatique uniquement si domaine autorisé.
  - **Sécurité redirection finale** : la valeur “next” est revalidée même stockée côté serveur (cf. safeNext).
  - **Dépendances techniques :**
    - Fonctionne avec divers helpers d’authentification génériques (`lib/auth/` : cookies, rateLimit, oauthFlow, providers, originCheck, safeNext).
    - Nécessite accès à la base utilisateurs et sessions (`app.users`, `app.sessions`).
    - La gestion des erreurs/translations côté frontend repose sur le slug passé dans l’URL.

### services/api/routes/connect.js

- **Rôle du fichier**
  - Gère l’ensemble du flux de connexion d’un compte externe (actuellement Google, Microsoft à venir) via OAuth pour l’envoi de mails et le dépôt de documents.
  - Centralise et généralise la logique de connexion, en s’appuyant sur les spécificités des fournisseurs dans `lib/connections/providers.js`.
  - Fournit des routes Fastify pour démarrer, suivre, valider ou révoquer une connexion.

- **Fonctions exportées**
  - `createConnectCallback(app, provider, { resolveUser })`
    - **Paramètres** :
      - `app` : instance Fastify
      - `provider` : configuration du fournisseur OAuth (cf. `CONNECT_PROVIDERS`)
      - `{ resolveUser }` (optionnel) : fonction asynchrone pour déterminer l’utilisateur
    - **Retour** : handler Fastify asynchrone (req, reply) gérant le callback OAuth, enregistre/rejette la connexion, redirige toujours.
    - **Effet de bord notable** : Écrit/efface des cookies d’état, écrit en DB la connexion OAuth, potentiellement révoque des tokens.

  - `connectRoutes(app)` (export par défaut)
    - **Paramètres** :
      - `app` : instance Fastify
    - **Retour** : void (monte les routes sur l’app)
    - **Effets de bord notables** :
      - Monte les routes suivantes :
        - `GET /connect/status` : retourne l’état de connexion du compte courant ou undefined.
        - `POST /connect/mobile/ticket` : génère un billet à usage unique pour démarrer le flux OAuth depuis une app native (nécessite session active/valide).
        - `GET /connect/start` : démarre le flux OAuth (redirection selon compte en session ou billet natif).
        - Google – Callback : monte une route pour le retour du flux via `createConnectCallback`.
        - `POST /connect/disconnect` : révoque et supprime toutes les connexions du compte utilisateur.
      - Instancie un rate limiter par IP pour limiter les créations de tickets/start.
      - Utilise les hooks Fastify (onClose).

- **Points d'attention**
  - **Connexion mobile (app native) :**
    - Utilise un système de billet (ticket) pour relier identité et navigation OAuth, à usage unique et durée de vie limitée.
    - Le retour dans l’app natif utilise un `deep link` (`mybrief://auth/connect`).
  - **Edge cases / Sécurité :**
    - Contrôle rigoureux du state OAuth : vérifie le state, le flow, l’email qui a initié, utilisation de PKCE.
    - Cas particulier des installations OIDC sans cookie : le callback ne doit pas dépendre strictement d’une session HTTP.
    - Si le refresh token manque, la connexion est révoquée côté fournisseur après le consentement.
    - Lors de la reconnexion, si le compte de destination change, le refresh token antérieur est révoqué (sauf pour Microsoft).
    - Toute navigation échouée retourne vers `/?connectError=...#config` (ou déclenche un retour natif si mobile).
    - Les tokens de refresh ne quittent jamais l’API (sécurité renforcée).
    - Déconnexion : suppression locale et révocation côté fournisseur possible, mais certains (Microsoft) ne le permettent pas – simple suppression côté myBrief alors.
  - **Dépendances majeures**
    - `lib/connections/providers.js` : description des fournisseurs, discovery endpoints, scopes, callbacks.
    - `lib/auth/oauthFlow.js` : gestion état OAuth, cookies, échange code/token.
    - `lib/rbac.js`, `lib/errors.js`, `lib/auth/rateLimit.js`, `lib/auth/originCheck.js`
    - Accès à la DB pour connexions et utilisateurs, accès à la configuration d’actions/providers.
  - **Compatibilité**
    - Chemins/déclarations en lien avec les stores mobiles (intent Android sur `auth`, etc).
    - Les callbacks de Microsoft ne passent pas par le même chemin Fastify que ceux de Google.

- **À surveiller**
  - Toute optimisation/factorisation doit préserver la compatibilité entre web/natif et les différences de flux entre fournisseurs.
  - Toute suppression de refresh token doit tenir compte du comportement du provider (cas Google vs Microsoft).
  - La sécurité repose sur la bonne implémentation PKCE/state/oauth côté navigateur et serveur.
  - Ne renvoie jamais de JSON sur les routes d’enchaînement ; toujours des redirections.

### services/api/routes/core.js

- **Rôle du fichier**
  - Définit les routes « cœur » de l’API : `/init`, `/ping`, `/logout`.
  - Gestion du bootstrap utilisateur, sonde de vivacité, déconnexion.

- **Fonction exportée**
  - `coreRoutes(app)`
    - **Paramètre** : `app` (instance de l’application ou framework, exposant `.db`, `.users`, `.sessions`)
    - **Retour** : void (registre les routes sur l’app)
    - **Effet de bord notable** : Attache 3 routes HTTP.

    - **Routes et comportements ajoutés :**
      - `/init` (GET)
        - **Paramètres** : lit les propriétés de `req` et `reply` (notamment `req.user`).
        - **Retour** : Objet identité utilisateur ({email, name, role, …}).
        - **Effet de bord** : Upsert de l'utilisateur dans MongoDB (`collection('user')`), mise à jour sélective (jamais de remplacement complet), correction partielle de certains champs.
      - `/ping` (GET)
        - **Paramètres** : aucun.
        - **Retour** : `{ ok: true }`
        - **Effet de bord** : aucun.
      - `/logout` (POST)
        - **Paramètres** : `req`, `reply`
        - **Retour** : HTTP 204 No Content.
        - **Effet de bord** : Détruit la session native (si présente), supprime le cookie de session.

- **Points d'attention**
  - L’upsert `/init` ne doit PAS écraser les champs sensibles (`passwordHash`, `role`) — une mise à jour complète effacerait involontairement ces infos.
  - Le champ `lastConnecion` (faute d’orthographe persistée) doit être conservé tel quel pour cohérence historique.
  - Dépendances à l’identité utilisateur : `requireEmail`, `normalizeEmail`, gestion des cookies/session dans des fichiers de librairie associés.
  - `/logout` ne fait rien si pas de session utilisateur matérialisée.
  - La logique OIDC vs session native côté auth est affinée via `authModeOf`/`authProviderOf`.
  - Le frontend repose sur `authMode` et `authProvider` pour choisir le type de déconnexion ou d’UI à afficher.
  - `/ping` : toujours accessible, ne déclenche pas le gestionnaire d’erreur HTTP.
  - Appelle des méthodes sur `app.db`, `app.users`, `app.sessions` : dépendances injectées attendues.

### services/api/routes/meetings.js

- **Rôle du fichier**
  - Déclare les routes HTTP (API REST) liées à la gestion des réunions (meetings) : génération et stockage de résumés, historique, manipulation des versions, gestion de la transcription, tagging, renommage et suppression.
  - Tous les accès sont sécurisés par scoping via l'email utilisateur (présent dans le header).

- **Fonctions exportées**

  - **persistResume({ app, body, email, name, resumeHtml, meetingId })**
    - Paramètres : objet avec références au context app (db, config, openai), le body (payload POST), email utilisateur, nom, HTML du résumé, identifiant réunion.
    - Retour : Promise<void>
    - Effet de bord : Crée ou met à jour un document `resume` dans MongoDB ; la méthode effectue deux chemins : insertion (nouveau meeting) ou mise à jour (édition existante). Modifie également des champs liés à la durée/durée source, notes, actions…

  - **generateAndSaveTitle({ app, log, body, email, resumeHtml, meetingId })**
    - Paramètres : objet contextuel incluant app, log, payload, email, HTML résumé, id réunion.
    - Retour : Promise<void>
    - Effet de bord : Génère le titre via OpenAI (async, après le 200 HTTP) et met à jour le champ `title` (ou non en cas de défaillance).

  - **meetingsRoutes(app)**
    - Paramètre : app (contexte serveur, expose app.db, app.openai etc.).
    - Retour : void
    - Effet de bord : Enregistre toutes les routes HTTP de l’API "meetings" dans l’application (`app.post`, `app.get`…).

  - **Routes HTTP déclarées :**
    - `/resume` (POST) : Génère le résumé de la réunion (via OpenAI), écrit le `resume` en base (200 = réunion persistée), déclenche la génération du titre en fond. Insertion ou mise à jour selon la présence RÉELLE du document, jamais selon le drapeau `isEdit` du client — la réunion existe déjà quand elle a été ouverte par `/history/start`.
    - `/history` (GET) : Retourne la liste des réunions de l'utilisateur, triée par date affichée. Ne fabrique AUCUN titre de repli : une réunion sans titre sort avec `title: ''`, le libellé daté « Réunion JJ-MM-AAAA HH:MM » étant composé côté client (`src/utils/historyTitle.js`), dans le fuseau et la langue du lecteur.
    - `/history/start` (POST) : Ouvre la réunion en base au DÉMARRAGE de l'enregistrement — brouillon sans titre, sans résumé, sans version, `status: 'recording'`. Upsert par `$setOnInsert` : rejouable sans rien écraser. Retourne `{ ok: true, meetingId }`.
    - `/history/stop` (POST) : Clôt la réunion (`status: 'ended'` + durée mesurée). Avec `discardIfEmpty`, supprime la ligne si rien n'a été dit ni rédigé. Retourne `{ ok: true, discarded }`, 404 si la réunion est inconnue.
    - `/history/title` (POST) : Nomme par IA une réunion enregistrée SANS compte rendu (bouton « Enregistrer » de la fin de réunion) — titre tiré de la transcription seule. Même contrat que `/resume` : `titlePending` posé avant la réponse, titre en tâche de fond. N'écrase jamais un titre déjà là (seul le repli « Réunion sans titre » se retente), aucun appel modèle sans matière. Retourne `{ ok: true, meetingId, titlePending }`, 404 si la réunion est inconnue.
    - `/history/delete` (POST) : Supprime une réunion par id et email (sécurité fix), retourne `{ ok: true }`.
    - `/history/rename` (POST) : Renomme le titre d'une réunion, nécessite un title non vide, retourne `{ ok: true }`.
    - `/history/tag` (POST) : Ajoute ou retire un tag à une réunion (scopé, vérifie aussi la propriété du tag), retourne `{ ok: true, meetingId, tagId }`.
    - `/versions/add` (POST) : Ajoute une version de résumé dans le tableau `versions`. IDEMPOTENT par `version.id` — retourne `{ ok: true, duplicate: true }` sans rien empiler si la version y est déjà.
    - `/versions/delete` (POST) : Supprime une version donnée (`versionId`), retourne `{ ok: true }`.
    - `/versions/update` (POST) : Met à jour le HTML d'une version, synchronise aussi le `resume` principal, retourne `{ ok: true }`.
    - `/transcription/update` (POST) : Met à jour la transcription (texte + taille), retourne `{ ok: true }`.

- **Points d'attention / edge cases**

  - **Email Scoping**
    - Tous les accès sont filtrés par l’email du header (via `ownerFilter`). Évite les escalades de droits (cf. faille historique n8n).
  - **Atomicité de persistence**
    - Le résumé (document Mongo) est enregistré AVANT toute réponse HTTP 200, garantissant la présence de la donnée (ancien comportement n8n : perte silencieuse possible).
  - **Durée réunion :**
    - Deux sources possibles — chronomètre client prioritaire, repli si besoin sur l'extraction du texte du résumé.
    - Edge : Chronomètre à zéro lors de la régénération, ou réunion ancienne sans durée stockée.
  - **Titre généré en fond :**
    - Le titre peut arriver plusieurs secondes après (/resume => OpenAI). En cas de défaillance, le champ `titlePending` est géré pour éviter les lectures infinies côté frontend.
  - **Tri / dates historique :**
    - Deux dates présentes dans un `resume` (`lastConnecion`, `now`) ; tri côté serveur sur `now` mais rendu sur date de réunion réelle.
    - Edge : réécritures répétées sur un vieux meeting ne le font plus remonter en tête de la sidebar.
    - Entrées sans date valide triées en fin de liste (jamais perdues).
  - **Sécurité tagging :**
    - Ajout de tag vérifie la propriété du tag via email.
    - Un seul tag par

### services/api/routes/mobileAuth.js

- **Rôle du fichier :**
  - Gère l’authentification mobile (apps Capacitor) pour l’API. Fournit le flux d’échange d’OTT (One-Time Token) contre des JWT longue durée, utilisé par l’app mobile ; expose aussi un endpoint de vérification pour ForwardAuth Traefik.
  - S’assure que l’identification est résolue de façon unifiée via `resolveIdentity`.
  - Implémente des contrôles de rate-limit et sécurise les en-têtes d’identité transmis.

- **Fonctions/constantes exportées :**
  - `MOBILE_START_PATH`, `MOBILE_EXCHANGE_PATH`, `MOBILE_VERIFY_PATH`
    - Chemins des trois endpoints principaux du flux.
  - `mobileAuthRoutes(app)`
    - **Paramètres** : `app` (`FastifyInstance`)  
    - **Retour** : rien (side effect : ajoute routes sur l’instance Fastify)
    - **Effets de bord** :
      - Ajoute routes HTTP :
        - `GET /auth/mobile/start` :  
          - Démarre le flow d’auth (attend `?cc=` – code challenge PKCE), require user authentifié.  
          - Retourne une page HTML (soit rebond OTT → app, soit redirection login si pas connecté).
        - `POST /auth/mobile/exchange` :  
          - Prend `{ ott, verifier }` en body.  
          - Vérifie/consomme le OTT, retourne `{ token, user }` ou erreur.
        - `GET /auth/verify` :  
          - Prend JWT en header Bearer.  
          - Vérifie, renvoie en-têtes identité (`X-Auth-Request-User`, etc.) ou 401.
      - Enregistre des hooks pour nettoyer les timers de rate-limit/OTT à l’arrêt du serveur.
      - S’appuie sur la config `app.config.mobile` (`jwtSecret`, `jwtTtlDays`, etc.).

- **Points d’attention :**
  - **Edge cases & Sécurité**
    - Le flux mobile est désactivé si `jwtSecret` absent/incorrect. Toutes les routes répondent 503.
    - Pas d’émission d’OTT sans identité établie (prévention des usurpations).
    - Les chemins dépendent d’un middleware d’authentification Traefik (OIDC ou marqueur `noident`).
    - Les OTT sont liés et single-use. Validation stricte du code challenge/verifier et imposition de limites par IP.
    - Les en-têtes d’identité en sortie `/verify` sont toujours écrasés, jamais hérités de la requête.
  - **Dépendances importantes**
    - Dépend des helpers du dossier `lib/auth` (rateLimit, resolve, cookies, mobileTokens, mobileJwt, safeNext).
    - Repose sur la config Fastify (`app.config`) pour les secrets, TTL et sécurité cookies.
    - Implique le comportement de Traefik côté reverse proxy.
    - Le schéma d’exchange limite le body à 4 Ko ; possibilité d’échec si body trop gros.
  - **Remarques diverses**
    - Page de rebond mobile : pas de 302 vers deep link app, affiche une page contenant un lien JS et visible (contournement pour compat custom tabs Android/iOS).
    - Les cookies invalides sont explicitement effacés.
    - L’identité transmise à l’app se limite à email, name, picture – pas d’autres claims.  
    - Non testé côté back (hérité d’un code non testé du sidecar).

- **Principales routes gérées :**
  - **GET `/auth/mobile/start?cc=sha256(verifier)`**  
    - Précondition : utilisateur authentifié, paramètre cc valide  
    - Retour : page HTML de rebond vers app avec OTT.
  - **POST `/auth/mobile/exchange`**  
    - Body : `{ ott, verifier }`  
    - Retour : `{ token, user }` ou erreur.
  - **GET `/auth/verify`**  
    - Header : `Authorization: Bearer ...`  
    - Retour : headers identité à usage Traefik.

**Résumé** : Ce fichier implémente l’intégralité du flux d’auth mobile moderne utilisé pour une appli Capacitor, maillant JWT et OTT, et veille à ce que l’authentification soit alignée avec le reste de l’API (OAUTH/OIDC).

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

- **Rôle du fichier**
  - Gère l’API REST liée aux "tags" (étiquettes/ classeurs) de conversations, utilisés pour organiser les conversations d’un utilisateur.
  - Assure la validation, la cohérence métier et la gestion des droits d’accès sur les tags (palette fermée, étiquettes uniques par utilisateur, limite maximale).
  - Sert la palette de couleurs autorisée, le plafond par utilisateur et la liste des tags de l'utilisateur.

- **Fonctions exportées**
  - `tagsRoutes(app)`
    - **Paramètres**: 
      - `app` : instance du serveur (doit fournir accès à `.db` pour MongoDB).
    - **Retour** :
      - void (enregistre les routes via `app.get`, `app.post`)
    - **Effets de bord** :
      - Définit trois routes API :
        - `GET /tags` :
          - Liste les tags de l'utilisateur, la palette de couleurs et la limite de tags.
          - **Paramètres**: aucun (lecteur authentifié via l'email).
          - **Retour**: `{ tags: [<tag>], colors: [<couleurs>], max: <int> }`
        - `POST /tags/save` :
          - Ajoute ou édite un tag (création si sans `id`, édition sinon).
          - **Paramètres body**: `{ id?, label, color }`
          - **Retour**: `{ tag: <tag> }` ou erreur 400/404/409 selon validation.
          - **Effets de bord**: crée ou met à jour un document dans la collection `userTags`.
        - `POST /tags/delete` :
          - Supprime un tag et détache ce tag de toutes les conversations qui y font référence.
          - **Paramètres body**: `{ id }`
          - **Retour**: `{ ok: true, untagged: <nb_conversations_modifiées> }`
          - **Effets de bord**: 
            - Retire le champ `tagId` sur tous les `resume` associés.
            - Supprime le tag dans `userTags`.
  - Variables d’intérêt exportées:
    - `TAGS_COLLECTION` – nom de la collection MongoDB.
    - `TAG_COLORS` – palette autorisée.
    - `TAG_LABEL_MAX`/`USER_TAGS_MAX` – plafonds métier.

- **Points d’attention**
  - **Unicité des labels**: labels neutralisés (casse/espaces) ; doublons interdits par utilisateur (sinon 409).
  - **Palette fermée**: seuls les slugs de couleur listés côté backend (`TAG_COLORS`) sont acceptés.
  - **Plafond utilisateur**: pas plus de 20 tags ; l’ajout au-delà retourne 409.
  - **Suppression d’un tag** : s’effectue en 2 temps — les conversations sont “détaguées” avant suppression du tag pour préserver la cohérence des références.
  - **Sérialisation**: jamais de `_id` MongoDB ni de métadonnées d’appartenance exposées côté client.
  - **Contrôle d’accès**: toujours vérification de l’email du propriétaire pour lecture/écriture.
  - **Codes d’erreur**: utilise de vrais codes HTTP via `lib/errors.js` (par ex. pas de `{ok:false}` + HTTP 200).
  - **Validation**: validation JSON Schema en entrée, puis logique métier (format/longueur) ; les messages d’erreur sont précis (ex : ‘label_too_long’, ‘duplicate_label’).
  - **Dépendances** :
    - `node:crypto` (pour `randomUUID`)
    - Libs internes : `identity.js`, `ownerScope.js`, `errors.js`
    - Collection `userTags`, collection `resume` (pour `tagId`)
    - Validation AJV
  - **Edge cases** :
    - Tentative de suppression d’un tag inexistant ⇒ 404.
    - Tentative de modification avec un `id` inconnu ⇒ 404, jamais une création silencieuse.
    - Aucun tag ne peut être associé à deux conversations avec le même label pour le même utilisateur.
    - Le passage d’un label vide ou trop long, ou d’une couleur inconnue, est rejeté avec une erreur explicite.

### services/api/routes/templates.js

- **Rôle du fichier :**
  - Définit les routes API pour la gestion des templates globaux (administration), des templates utilisateur (max 5 par utilisateur), et de la configuration utilisateur ("MA configuration").
  - Gère l'accès selon les rôles (admin/utilisateur).
  - Remarque importante : en cas d'erreur de validation, la réponse HTTP est `200` avec `{ ok: false, error: "..." }` (voir commentaire en tête de fichier).

- **Fonction exportée :**
  - `default function templatesRoutes(app)`
    - Paramètre : `app` (instance Fastify/serveur, contenant le routeur, la DB et les méthodes utilitaires).
    - Effets : enregistre toutes les routes décrites ci-dessous sur `app`.

- **Routes et fonctions définies :**
  - **Templates globaux (tous les utilisateurs)**
    - `GET /templates`
      - Renvoie : `{ templates, orgContext }` (tous les templates + contexte organisation).
      - Accès : tout utilisateur authentifié.
    - `POST /templates/save`
      - Paramètres attendus : objet `{ value (string), icon (string optionnel), labels (obj optionnel), prompt (string optionnel) }` dans le body.
      - Création/mise à jour du template (suppression par value puis insertion).
      - Retour : `{ ok: true }` ou `{ ok: false, error }` (HTTP 400 seulement si valeur manquante).
      - Accès : administrateur uniquement.
    - `POST /templates/delete`
      - Paramètre attendu : `{ value }` dans le body.
      - Suppression du template par `value`.
      - Retour : `{ ok: true }` ou `{ ok: false, error }`.
      - Accès : administrateur uniquement.

  - **Templates utilisateur (propre à l'utilisateur)**
    - `GET /user-templates`
      - Renvoie : `{ templates }` (5 max, du propriétaire).
      - Accès : utilisateur authentifié.
    - `POST /user-templates/save`
      - Paramètres attendus : `{ value (slug), icon, labels, prompt }` dans le body.
      - Validation : slug, unicité par utilisateur, max 5.
      - Retour :
        - Succes : `{ ok: true }`.
        - Erreur : `{ ok: false, error: "value_required" | "value_invalid" | "limit_reached", ... }`.
      - Effet : suppression précédente entrée puis insertion.
      - Accès : utilisateur authentifié.
    - `POST /user-templates/delete`
      - Paramètre attendu : `{ value }` dans le body.
      - Suppression du template (du propriétaire).
      - Retour : `{ ok: true }` ou `{ ok: false, error }`.

  - **Configuration utilisateur ("MA configuration")**
    - `GET /user-config`
      - Renvoie : `{ context }` (string, limité à 4000 caractères).
      - Accès : utilisateur authentifié.
    - `POST /user-config/save`
      - Paramètre : `{ context (string optionnel) }` dans le body.
      - Enregistre la config utilisateur (`context`). Tronque à 4000 caractères.
      - Retour : `{ ok: true }`.

- **Dépendances et points d'attention :**
  - **Contrat d'erreur :** Validation KO → HTTP 200 `{ ok: false, error }` (ne pas casser le frontend).
  - **Edge cases / validations :**
    - Limite stricte 5 templates utilisateur, vérifiée côté serveur.
    - Slug pour `value` validé côté serveur (`/^[a-z0-9-_]+$/i`).
    - Nettoyage/remplacement des templates lors du save (deleteMany + insertOne).
    - Sauvegarde du context utilisateur tronquée à 4000 caractères.
  - **Dépendances principales :**
    - `requireEmail`, `requireAdmin` (middleware d'authentification/autorisation).
    - `ownerFilter`, `ownerFields` pour scoper les opérations DB par utilisateur.
    - Accès direct à `app.db` (Mongo-like).

### services/api/server.js

- **Rôle du fichier**
  - Point d’entrée de l’API applicative (remplace les workflows n8n).
  - Démarre le serveur HTTP après initialisation intégrale de l’environnement (configuration, connexion MongoDB, index, compte admin, client IA, mailer).
  - Garantit que l’API n’est jamais exposée publiquement : écoute uniquement en interne Docker, derrière Traefik qui gère l’authentification.
  - Gère l’injection/configuration dynamique (clé OpenAI via l’admin, e-mail, sécurité sessions).

- **Fonctions/exportations**
  - **Aucune fonction explicitement exportée** (fichier exécutable, pas un module library).
  - Fonctions internes notables :
    - `shutdown(signal)`
      - **Paramètres** : `signal` (string, par ex. 'SIGTERM')
      - **Retour** : `Promise<void>`
      - **Effets de bord** :
        - Ferme proprement le serveur HTTP (`await app.close()`)
        - Attend la fin de tous les travaux de fond (`app.background.drain()`)
        - Ferme la connexion MongoDB (`await mongo.close()`)
        - Termine le process (`process.exit(0)`)
      - **Déclenchée par** : signaux SIGTERM/SIGINT via handlers process.

- **Points d’attention**
  - **Arrêt démarrage si MONGO_URL absent** (logs + exit 1)
  - **Bootstrap bloquant & idempotent** : si migration/indexation échoue, API ne démarre pas (fail-fast pour éviter des corruptions silencieuses).
  - **La clé OpenAI** :
    - Peut être absente au boot : ne bloque pas l’API (uniquement les endpoints IA indisponibles — réponse 503 explicite).
    - Toujours résolue dynamiquement (pas en cache) : modifiable en live via l’interface admin.
  - **Sécurité/authentification** :
    - Auth principal via headers OIDC/Mobile (injection par Traefik)
    - Auth fallback ou spécifique via cookie de session native (cf. lib/auth/)
  - **Dépendances critiques** :
    - MongoDB (service critique, toute instance de la BDD échouée bloque l’API)
    - lib/bootstrap.js : création d’index, migrations, seed admin
    - lib/identity.js, lib/auth/ : gestion de l’identité utilisateur (attention à la cohérence des chemins d’auth)
    - lib/config.js et variables d'env
    - lib/openai.js / lib/mailer.js / lib/repositories/settings.js pour les intégrations externes
  - **Écoute réseau** : toujours sur `0.0.0.0` mais uniquement sur réseau interne Docker.
  - **Processus agnostique** : aucun export, conçu pour être exécuté en “singleton” dans un conteneur.

- **Edge cases**
  - Démarrage sans clé OpenAI selon attente (installation neuve)
  - Boot stoppé si index/migration échoue (raise & exit)
  - Changements de config (OpenAI, SMTP…) dynamiquement applicables via l’admin, sans restart.

- **Variables d’environnement essentielles**
  - `MONGO_URL` (obligatoire), `OPENAI_API_KEY` (optionnel/dynamique), `MONGO_DB`, `PORT`, `OPENAI_BASE_URL`
  - Pour la sécurité, e-mails et diverses options : voir lib/config.js/lib/mailer.js.

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

- **Rôle** :  
  Chemin d'exécution unique pour la détection d’actions à partir de transcriptions, utilisé par l’API utilisateur (`POST /api/actions`) et par l’interface d’administration (banc d’essai), garantissant la cohérence de l’algorithme de prompt.

- **Fonctions exportées** :  
  - `runActionDetection(params)`
    - **Paramètres** :
      - `openai` (object) : client OpenAI (décoré pour l’application)
      - `model` (string) : identifiant du modèle OpenAI à utiliser
      - `content` (string) : texte de la fenêtre de transcription à analyser
      - `actions` (Array, optionnel) : actions déjà détectées (avec leur id)
      - `dismissed` (Array, optionnel) : actions déjà supprimées par l’utilisateur
      - `settings` (object, optionnel) : paramètres de réglage pour la détection d’actions
    - **Retour** :  
      `Promise<{actions: Array, prompt: string}>`
        - `actions` : liste des actions détectées (format défini par `parseActionsOutput`)
        - `prompt` : consigne réellement envoyée (utile pour le banc d’essai)
    - **Effets de bord** :  
      - Effectue un appel distant à l’API OpenAI.

- **Points d'attention** :
  - Dépend des modules locaux `./prompts.js` (`actionsPrompt`, `parseActionsOutput`, dont la stabilité et la logique impactent directement le résultat).
  - Les valeurs de `settings` doivent impérativement différencier les cas production (paramètres DB) et banc d’essai (paramètres UI).
  - La cohérence des IDs dans `actions` et `dismissed` impacte la détection : collisions ou mauvaises références peuvent donner des résultats inattendus.
  - Si `openai.chat` échoue (erreur réseau/API), l’erreur remontera à l’appelant.
  - `content` doit être non vide et correctement formaté ; en cas contraire, le prompt généré peut être incohérent ou inefficace.

### services/api/lib/actionDetectionSettings.js

- **Rôle du fichier**
  - Définit les réglages, contraintes et valeurs par défaut liés à la détection d'actions utilisateur.
  - Normalise, valide et applique les paramètres d’action au niveau utilisateur (plus installation).
  - Permet la cohérence entre le dépôt, les routes d’API et les tests (banc d’essai).

- **Fonctions exportées**
  - `normalizeTriggerWords(words, fallback)`
    - **Paramètres** :  
      - `words` : liste ou chaîne de mots déclencheurs (peut être `undefined`)  
      - `fallback` : valeur de repli si `words` est `undefined`
    - **Retour** : `Array<string>` — liste unique, max 20 mots de max 40 caractères, fallback si non fourni.
    - **Effets de bord** : Aucuns (purement fonctionnelle).
  - `normalizeActionDetection(doc)`
    - **Paramètres** :
      - `doc` : objet partiel ou null décrivant les réglages de détection à normaliser (`enabled`, `sensitivity`, `triggerWords`, etc.)
    - **Retour** : objet complet et borné `{enabled, sensitivity, triggerWords, allowUpdates, windowSize, minSentences}`
    - **Effet de bord**: Aucuns.
  - `mergeActionDetectionPatch(current, patch)`
    - **Paramètres** :
      - `current` : réglages déjà normalisés
      - `patch` : modifications à appliquer (tout champ absent = inchangé ; vide = retour au défaut)
    - **Retour** : nouveaux réglages, norme appliquée et valeurs bornées
    - **Effet notable**:  
      - Lance une exception si la sensibilité (`sensitivity`) n’est pas reconnue.
      - Les paramètres invalides sont ignorés ou reset (jamais transmis tels quels).

- **Constantes exportées**
  - `DETECTION_SENSITIVITIES` : `['explicit', 'balanced', 'wide']`
  - Bornes pour `windowSize`, `minSentences`, nombre/longueur de triggerWords.
  - `DEFAULT_ACTION_DETECTION` : valeur par défaut appliquée en toutes circonstances.

- **Points d'attention**
  - Les valeurs sont bornées deux fois : schéma côté API et ici à la lecture côté JS.
  - Les entrées inconnues ou extrêmes sont toujours ramenées à une valeur sûre (fallback et clamp).
  - Changement notable : le vocabulaire de l’organisation n’est pas ici, il doit être injecté ailleurs.
  - L’appelant doit gérer les erreurs si la sensibilité fournie n’est pas dans la liste.
  - Indépendant de la validation de schéma : ne compte pas sur une API externe pour l’intégrité.
  - Edge cases pris en compte :
    - Importation de documents avec des valeurs hors bornes ou anciennes versions.
    - Distinction entre `undefined` (utiliser fallback) et liste vide (réinitialiser au défaut explicite).

- **Dépendances**
  - Aucune dépendance externe : tout est encapsulé, constants et fonctions incluses dans le module.

### services/api/routes/actions/detection.js

- **Rôle du fichier**
  - Définit les routes API pour la gestion et le test des réglages de détection d'actions en réunion, spécifiques à chaque utilisateur.
  - Permet aux utilisateurs de consulter, modifier et tester leurs propres réglages de détection via un "banc d'essai" sans effet de bord sur leurs données.

- **Fonctions exportées**
  - Fonction principale : `actionsDetectionRoutes(app)`
    - **Paramètre** :  
      - `app` : instance applicative Fastify/Express, fournissant contextes, dépendances (ex: openai, userActions, settings), gestion des hooks.
    - **Effets** :
      - Ajoute les routes suivantes à l'API :
        - `GET /actions/detection`
          - Retour : `{ settings }` — les réglages actuels de détection de l'utilisateur (chargés via `app.userActions.getDetection`)
          - Effet de bord : Aucune.
        - `POST /actions/detection`
          - Corps : Validé par `userActionDetectionBody`, nouveaux réglages partiels.
          - Retour : `{ settings }` — réglages mis à jour pour l'utilisateur.
          - Effet de bord : Met à jour en base les réglages personnels de l’utilisateur.
        - `POST /actions/detection/test`
          - Corps : Validé par `userActionDetectionTestBody`, inclut un contenu à tester + éventuels réglages non-enregistrés.
          - Retour : `{ ok: true, actions, prompt, model }` (résultat du test d’analyse d’actions via OpenAI).
          - Effet de bord notable : AUCUN effet permanent, mais sollicite OpenAI à chaque appel (appel facturé côté fournisseur). Active un double rate-limiting (par compte + par IP).

- **Points d'attention**
  - Système de rate-limit sur `/actions/detection/test` (par utilisateur ET par IP) pour limiter les abus/excès d’appels.
  - Vérification d’origine (CSRF) sur les requêtes POST, tolérant l’absence d’Origin pour les appels techniques.
  - Paramètre `settings` lors du test : fusionne les réglages affichés (potentiellement non sauvegardés) avec ceux persistés, via `mergeActionDetectionPatch`.
  - Dépendances critiques :
    - `openai` (via app.openai, service upstream) : erreurs amont relayées à l’utilisateur avec message explicite.
    - Validation des schémas via `userActionDetectionBody` et `userActionDetectionTestBody`.
    - `app.userActions` : accès/mise à jour base des réglages utilisateurs.
  - Edge cases :
    - Si manque de contenu à tester : code 400 `detection_test_content_missing`.
    - Si settings fournis invalides : code 400 `detection_settings_invalid`.
    - Échec OpenAI : retour 400 détaillé avec cause (extraction du message d’erreur d'OpenAI).
    - Gestion fine du prompt transmis à OpenAI : le contexte métier est toujours injecté côté serveur, jamais piloté complètement par l'appelant.
    - Les hooks d'arrêt (`onClose`) arrêtent les rate-limiters pour éviter les fuites mémoire.
