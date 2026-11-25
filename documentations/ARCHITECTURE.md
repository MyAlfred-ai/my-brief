# Architecture et conventions

Carte du code, règles qui le tiennent, et pièges à ne pas réintroduire.
Pour ce que fait le produit : [FONCTIONNALITES.md](./FONCTIONNALITES.md).
Pour l'installation et l'exploitation : [DEPLOIEMENT.md](./DEPLOIEMENT.md).

---

## 1. Les trois pièces

```
                ┌─────────────────────────────────────────┐
                │              Traefik                    │
                │  ├─ oidc      → injecte X-User-Email    │
                │  └─ noident   → EFFACE ces en-têtes     │
                │       (/api/auth, ou cookie natif)      │
                └────────┬────────────────────────────────┘
        ┌────────────────┴─────────────────┐
        ▼                                  ▼
   ┌─────────┐                      ┌──────────────┐
   │ nginx   │  ◄──── fetch ─────►  │ services/api │
   │ (SPA)   │        /api/*        │ (Fastify)    │
   └─────────┘                      └──────┬───────┘
                          identité = session native (cookie)
                                    OU en-têtes OIDC/mobile
                                           ▼
                                   ┌──────────────┐
                                   │ MongoDB 7    │
                                   └──────────────┘
```

| Couche | Tech | Où |
|---|---|---|
| SPA | Svelte 4 + Vite | `src/` |
| Backend | Node 22 + Fastify | `services/api/` |
| Sidecar auth mobile | Node 22 (**en retrait**, rapatrié dans l'API) | `services/mobile-auth/` |
| Extension Chrome | Manifest V3, sans build | `extension/` |
| App mobile | Capacitor 8, mode `server.url` | `android/`, `ios/`, cf. [MOBILE.md](./MOBILE.md) |

L'audio du direct **ne transite jamais** par `services/api` : le navigateur
parle directement au fournisseur du modèle de transcription — OpenAI Realtime,
Mistral, Speechmatics ou AssemblyAI — avec un jeton éphémère obtenu sur
`/api/tempkey`.
Seuls les fichiers (import, reprise hors ligne) passent par `/api/record`, qui
les confie au même fournisseur (cf. [TRANSCRIPTION.md](./TRANSCRIPTION.md) §2).

---

## 2. Frontend (`src/`)

```
src/
├── App.svelte            Layout + orchestration de la réunion (PLAFONNÉ, cf. §5)
├── components/
│   ├── Dock.svelte                        composer bas (chips + record)
│   ├── Sidebar.svelte                     historique, recherche, filtre par tag
│   ├── LiveTranscript / EditableTranscript / SpeakerNamePopover
│   ├── MarkdownEditor.svelte              éditeur TipTap du compte rendu
│   ├── ActionsPanel / MeetingNotesPanel   colonne de droite
│   ├── ResumeOverlays / MobileMeetingOverlays / MobileAppBar / PanelTabs
│   ├── DocumentBar.svelte                 barre des documents : Transcription / Résumé n, tag, « Partager », « Résumer »
│   ├── PostActions.svelte                 mail / dépôt / téléchargement — « Partager » et son mini-menu
│   ├── SettingsPanel.svelte               « Réglages » (colonne + pages du compte)
│   ├── AdminPanel.svelte                  administration (tableau de bord, 5 rubriques, 13 pages)
│   ├── Tag*.svelte                        pastille, sélecteur, formulaire, panneau
│   ├── WhatsNewBadge / WelcomeModal / ToastHost / SummarySaveStatus
│   ├── actions/  admin/  auth/  help/  icons/  settings/  stats/  ui/
│   ├── lazy/                              écrans chargés à la demande (cf. ci-dessous)
├── store.js              langue courante et textes (`uiText`), niveau micro
├── stores/               source de vérité par domaine (cf. §2.1)
├── services/             transport HTTP seul (apiClient + un client par domaine)
├── config/               templates, scaffold, sections de config, i18n, constantes
├── lib/realtime/         canal WebSocket Realtime et ses dialectes (un par fournisseur), superviseur, chien de garde
├── lib/audio/            sonde de niveau, capture du son de l'ordinateur
├── lib/pdf/              moteur PDF : mise en page navigateur, texte jsPDF
├── lib/pageMeter.js      Pagimètre (jumeau de services/api/lib/pageMeter.js)
├── lib/tiptap/           extensions de l'éditeur
├── platform/             web ⇄ natif (download, keepAwake, auth, enregistrement, retour Android)
├── utils/                fonctions pures (transcription, formats, erreurs HTTP)
└── styles/tokens.css     jetons de couleur — À CHARGER AVANT style.css
```

**Écrans chargés à la demande** (`components/lazy/`, 2026-11-13). L'administration,
les réglages et l'éditeur du compte rendu (TipTap) faisaient 44 % du JavaScript lu au
démarrage ; ils ont chacun leur fichier, chargé à l'ouverture — l'éditeur, pendant un
temps mort après le démarrage (`main.js`). Entrée : 2,3 Mo → 1 Mo (gzip 719 → 336 Ko).
App importe l'**enveloppe** (`lazy/AdminPanel.svelte`…), au même contrat que le
composant. Un nouvel écran lourd et rarement ouvert s'y range de même.
Le risque propre au découpage : un onglet resté ouvert pendant un déploiement demande un
fichier que le serveur n'a plus (404). Le service worker garde ceux de sa version ; sans
lui, `LazyFailed` affiche une phrase et « Recharger » — jamais pendant une réunion, où
recharger couperait l'enregistrement. TipTap vit dans `editor-vendor-*.js`
(`manualChunks`, vite.config.js) : son empreinte ne change qu'avec ses versions.

### 2.1 Les stores, et ce que chacun possède

| Store | Possède |
|---|---|
| `auth.js` | identité, capacités du serveur, `authMode` — **source unique** |
| `history.js` | la liste des réunions, `meetingIdOf()` |
| `liveMeeting.js` | cycle de vie en base de la réunion en direct (`/history/start`, `/stop`, sauvegarde du direct) |
| `recording.js` | `isRecording` / `isPaused`, et `liveMeetingIdStore` — la réunion **en cours d'enregistrement** |
| `summaryGeneration.js` / `afterSummary.js` | comptes rendus en cours de rédaction ; la fenêtre « Et maintenant ? » qui suit le premier |
| `notesActionsSave.js` | notes et actions écrites en base au fil des modifications |
| `tags.js` | catalogue des tags + pose (lit/écrit `history.js`, jamais l'inverse) |
| `actionSettings.js` / `actionDetection.js` | réglages d'actions et de détection |
| `actionAvailability.js` | les actions ouvertes sur ce compte, et par où elles partent |
| `quota.js` | minutes restantes du mois (anneau de l'avatar, carte du compte), refus au démarrage |
| `configChecks.js` | pastilles de configuration (constats du diagnostic serveur) |
| `audioDevices.js` / `meetingType.js` | micro et son de l'ordinateur choisis ; « Quel type de réunion ? » |
| `transcriptCorrections.js` | corrections automatiques de la transcription : liste de l'organisation et « Mots remplacés » du compte, appris des notes |
| `infographic.js` | l'infographie de la réunion affichée (gabarit ou ancienne image), et son polling |
| `branding.js` | couleurs et logo de l'installation |
| `panels.js` | quel panneau plein écran est ouvert (exclusion structurelle) |
| `sidebar.js` | barre latérale ouverte ou repliée : tiroir jusqu'à 1100 px (rail, puis surimpression — poussée, elle écrasait le document sur tablette), colonne au-delà |
| `extensionBridge.js` | dialogue `postMessage` avec l'extension Chrome |
| `myBrain.js` | « Réglages → Après la réunion → MyBrain » : disponibilité, choix, derniers envois |
| `aiHelp.js` | Aide IA d'une réunion : droits, réglage, lectures cadencées, mot d'appel, interventions — observe le direct par LiveTranscript, App.svelte n'en sait rien |
| `toasts.js` | pile de toasts |
| `orgContext.js`, `recordDeepLink.js`, `storeApproval.js` | vocabulaire de l'organisation, `#record`, approbation avant dépôt |

Règle : **un store ne parle jamais à l'utilisateur**. Il renvoie `{ok, error}`
avec le slug du serveur ; l'appelant choisit le message dans `config/uiText.js`.

⚠️ `liveMeetingIdStore` (réunion qui tourne) ≠ `currentMeetingId` d'App.svelte
(réunion affichée). Consulter une archive pendant qu'on enregistre change le
second, jamais le premier.

---

## 3. Backend (`services/api/`)

```
services/api/
├── server.js             seul point qui touche l'environnement réel
├── app.js                buildApp({db, openai, …}) — testable par app.inject()
├── lib/
│   ├── auth/             scrypt, cookies, sessions, OAuth/PKCE, résolution d'identité
│   ├── connections/      comptes externes : Google Drive, MS Graph, scopes, navigation
│   ├── actions/          résolution des réglages, exécution, gabarits, journal de mail
│   ├── myBrain/          client de l'API myBrain, texte déposé, envoi et relances
│   ├── aiHelp/           Aide IA d'une réunion : domaines, prompts, session, lecture et réponse
│   ├── repositories/     users, groups, settings, myBrainSettings, connections, userActions (schémas confinés)
│   ├── crypto/secretBox  chiffrement des refresh tokens et de la clé myBrain
│   ├── costs/            coûts d'IA : relevé des tarifs, usage, estimation (Statistiques)
│   ├── bootstrap.js      index Mongo + reprises/backfills au démarrage
│   ├── ownerScope.js     ownerFilter/ownerFields + OWNED_COLLECTIONS
│   ├── errors.js         contrat d'erreur unifié (slugErrorHandler)
│   ├── text.js           échappements partagés (expression régulière, HTML)
│   ├── prompts.js        prompts LLM (verbatim n8n, sauf actionsPrompt)
│   ├── quota.js          crédit de minutes du mois, réunions supprimées comprises
│   ├── configChecks.js   diagnostic de configuration (pastilles)
│   ├── stats.js          computeUsageStats — fonction pure
│   ├── infographic.js    contenu de l'infographie, en tâche de fond
│   └── infographicLayout.js  contrat du contenu, validé avant stockage
└── routes/
    ├── core / clientEvents / ai / meetings / templates / tags
    ├── quota / stats / configChecks
    ├── actions/{detection,execute,settings,storage,test}
    ├── auth/{login,session,password,recovery,sso,ssoFlow}
    ├── admin/{users,groups,settings,stats,myBrain,aiHelp,configChecks}
    ├── connect.js        relier un compte externe
    ├── myBrain.js        « Réglages → Après la réunion → MyBrain », « Réessayer »
    ├── oauth2.js         callback Entra — HORS /api
    └── mobileAuth.js     /auth/mobile/* et /auth/verify — HORS /api
```

### 3.1 Toutes les routes

Sous le préfixe `/api`, sauf les deux dernières sections.

| Route | Méthode | Usage |
|---|---|---|
| `/init` | GET | Bootstrap de l'utilisateur |
| `/ping` | GET | Healthcheck (sonde des déploiements) |
| `/branding/company-logo` | GET | Logo de l'entreprise (en tête des infographies), hors sonde publique |
| `/logout` | POST | Déconnexion |
| `/client-event` | POST | Trace d'incident client (coupure), identité facultative |
| `/tempkey` | GET | Jeton éphémère Realtime (porte le modèle choisi) |
| `/record` | POST | Transcription d'un fichier (import, reprise hors ligne) — `gpt-transcribe`, en tranches de 5 min au-delà (ffmpeg) |
| `/actions` | POST | Extraction des actions |
| `/refine-transcript` | POST | Nettoyage d'un passage transcrit |
| `/transcript-corrections` `/learn` | GET/POST | « Mots remplacés » du compte ; `/learn` y verse les remplacements écrits dans les notes |
| `/quota` | GET | Minutes restantes du mois du compte |
| `/stats/me` | GET | « Usage & crédits » (`?range=month\|90\|365\|all`) |
| `/config-checks` | GET | Pastilles de configuration du compte |
| `/resume` | POST | Génération du compte rendu (template ou scaffold) |
| `/infographic` | GET | Infographie de la réunion : contenu à mettre en page, ou ancienne image |
| `/infographic/regenerate` `/delete` | POST | Relancer / supprimer l'infographie |
| `/history` | GET | Réunions de l'utilisateur — `?view=list` : sans transcription ni HTML des comptes rendus (le client à jour) ; sans paramètre, complètes (onglets restés sur l'ancienne version) |
| `/history/item` | GET | Une réunion complète, à son ouverture (`?meetingId=`) |
| `/history/status` | GET | `{ title, titlePending }` — l'attente du titre après un résumé |
| `/history/start` `/stop` | POST | Ouverture / clôture de la réunion en direct (notes et actions comprises) |
| `/history/title` | POST | Titrer une réunion enregistrée sans résumé (notes et actions comprises) |
| `/history/notes-actions` | POST | Notes et actions modifiées, sans compte rendu — 404 si la réunion n'existe pas, jamais d'upsert |
| `/history/rename` `/delete` `/tag` | POST | Renommer, supprimer, ranger dans un tag |
| `/transcription/update` | POST | Transcription éditée |
| `/versions/add` `/delete` `/update` | POST | Versions d'un compte rendu |
| `/templates` `/save` `/delete` | GET/POST | Templates d'organisation — **admin** en écriture |
| `/user-templates` `/save` `/delete` | GET/POST | Templates de l'utilisateur (max 5) |
| `/user-config` `/save` | GET/POST | Contexte de l'utilisateur |
| `/tags` `/save` `/delete` | GET/POST | Tags (max 20, palette servie par `GET /tags`) |
| `/actions/email` `/store` | POST | Envoi et dépôt réels |
| `/actions/settings` | GET/POST | Réglages d'actions de l'utilisateur |
| `/actions/detection` | GET/POST | Réglages de détection en réunion |
| `/actions/detection/test` | POST | Essai de la détection sur un texte fourni |
| `/actions/test` | POST | Exécution réelle avec un document factice |
| `/actions/storage/drives` `/folders` `/path` | GET/POST | Fenêtre de choix de dossier |
| `/connect/status` `/start` `/disconnect` | GET/POST | Compte externe relié |
| `/mail/google/callback` | GET | Retour de Google après « Relier mon compte » |
| `/connect/mobile/ticket` | POST | Billet à usage unique (WebView → navigateur système) |
| `/mybrain/settings` | GET/POST | Envoi des réunions à myBrain : disponibilité, choix, derniers envois |
| `/mybrain/send` | POST | « Réessayer » l'envoi d'une réunion qui n'est pas arrivée |
| `/ai-help` | GET | Aide IA : ce que le compte peut faire, son dernier réglage |
| `/ai-help/session` | POST | Réglage de l'Aide IA pour UNE réunion (allumée, domaines, ordre du jour, projet) |
| `/ai-help/watch` `/ask` | POST | Une lecture du passage qui vient d'être dit ; une question — réunion du compte, en cours, plafonnées |
| `/ai-help/item` | POST | Acquitter ou ranger une intervention |
| `/ai-help/projects` | GET | Chercher la fiche d'un projet dans myBrain |
| `/ai-help/tag-project` | POST | Relier un tag à la fiche d'un projet |
| `/auth/config` | GET | Capacités du serveur — **public** |
| `/auth/session` | GET | État de session — **public**, ne renvoie jamais 401 |
| `/auth/login` `/logout` `/change-password` | POST | Mot de passe |
| `/auth/forgot-password` `/reset-password` | POST | Réinitialisation (si SMTP) |
| `/auth/google/start` `/callback`, `/auth/entra/start` | GET | SSO natif |
| `/admin/users` + `/create` `/update` `/reset-password` `/delete` | GET/POST | Comptes — **admin** ; `?group=` filtre sur un groupe, `groupIds` à la création et à la modification |
| `/admin/groups` + `/create` `/update` `/delete` `/members` | GET/POST | Groupes d'utilisateurs — **admin** (cf. AUTHENTIFICATION.md §3) |
| `/admin/settings/auth` `/ai` `/actions` `/branding` `/org-context` `/transcript-corrections` | GET/POST | Réglages — **admin** |
| `/admin/settings/ai/test` `/ai/test-transcription` `/ai/test-summary` | POST | Sondes réelles — **admin** |
| `/admin/settings/mybrain` + `/test` | GET/POST | Connexion à myBrain (vérifiée), politique d'envoi — **admin** |
| `/admin/settings/ai-help` | GET/POST | Aide IA : domaines proposés, mot d'appel, niveau d'intervention — **admin** |
| `/admin/stats` | GET | Statistiques d'usage filtrables (période, groupe, compte, template) : adoption, tableau par compte, dépenses d'IA estimées (`costs`) — **admin** |
| `/admin/stats/prices/refresh` | POST | Relevé en ligne des tarifs d'IA et du taux de change — **admin** |
| `/admin/stats/credits` | GET | Crédit de temps du mois, compte par compte — **admin** |
| `/admin/stats/account` | POST | « Usage & crédits » d'un collègue, telles qu'il les voit — **admin** |
| `/admin/config-checks` | GET | Pastilles de configuration de l'installation — **admin** |

Hors `/api` : `/oauth2/callback` (retour Entra, URI héritée du plugin),
`/auth/mobile/start`, `/auth/mobile/exchange`, `/auth/verify`.

### 3.2 Règles du backend

- **`app.js` reçoit ses dépendances**, `server.js` est le seul à lire
  l'environnement. Tout se teste par `app.inject()`, sans réseau ni process.
- **Contrat d'erreur** : vrai code HTTP + `{ error: '<slug>' }`
  (`lib/errors.js`). Le `200 {ok:false}` de `routes/templates.js` est un
  héritage n8n **qu'on n'étend pas**.
- **Appartenance** : toute lecture/écriture scopée passe par `ownerFilter()`,
  tout document inséré porte `ownerFields()`. Ne **jamais** upserter sur
  `ownerFilter()` — il renvoie un `$or`, dont Mongo ne dérive aucune égalité :
  le document créé n'aurait ni `email` ni `emailLower`. Filtre d'écriture
  `{ emailLower }` + `$setOnInsert: ownerFields(email)`.
- **Toute nouvelle collection par utilisateur va dans `OWNED_COLLECTIONS`**,
  sinon la suppression d'un compte laisse des données derrière elle
  (`infographics` y manquait jusqu'au 2026-10-16 : les images survivaient au
  compte).
- **Chaque route commence par `requireEmail` / `requireUser`**, sauf celles
  qui n'ont pas d'identité à exiger (`/ping`, `/logout`, `/client-event`, les
  routes `/auth/*` de connexion et de récupération) et les flux OAuth qui la
  résolvent eux-mêmes (`/connect/start`, les callbacks). Le
  routeur Traefik de la session native laisse passer toute requête qui porte un
  cookie `mybrief_sess`, valide ou non : c'est l'API qui juge. Les routes IA
  l'ont oublié jusqu'au 2026-10-16 — un cookie inventé dépensait la clé OpenAI
  hors quota (`test/aiAuth.test.js`).
- **Un identifiant lu dans un corps sans schéma est une chaîne** (`idOf` de
  `routes/meetings.js`, ou un `schema.body`). Passé tel quel dans un filtre
  Mongo, un objet `{"$ne": ""}` y devient un opérateur : `/history/delete`
  effaçait toutes les réunions du demandeur (`test/meetingsBodyIds.test.js`).
- **`bodyLimit` 32 Mo, multipart 25 Mo, `fieldSize` = `MAX_CONTENT`** :
  dimensionnés sur les vrais payloads (une transcription de 8 h fait plusieurs
  Mo). Le défaut Fastify d'1 Mo refuserait les longues réunions (413).
- **Un corps anonyme n'est jamais lu** (`lib/authPlugin.js`) : sans identité,
  toute requête avec corps répond 401 dès `onRequest`, sauf les six routes de
  `ANONYMOUS_BODY_PATHS` (connexion, récupération, déconnexion, trace
  d'incident), plafonnées à quelques Ko. Avant, `requireEmail` refusait dans le
  handler, APRÈS l'analyse de 32 Mo : cinq requêtes anonymes suffisaient à
  faire tuer l'API (256 Mo). La limite des comptes connectés reste 32 Mo
  partout — n'importe lequel peut déjà l'atteindre sur `/resume`, la baisser
  ailleurs ne protégerait rien. Une route publique nouvelle s'ajoute à la
  liste ; `test/anonymousBody.test.js` énumère toutes les routes.
- `trustProxy: true` — sans lui, le rate-limit par IP devient un verrou global
  (toutes les requêtes portent l'IP du conteneur Traefik).

---

## 4. Modèle de données (MongoDB, base `mybrief`)

| Collection | Contenu |
|---|---|
| `resume` | une réunion : transcription, compte rendu, versions, actions, `tagId`, `meetingId`, durée, `infographic.status`, `myBrain` (état de l'envoi), `aiHelp` (réglage et interventions de l'Aide IA — jamais lu par un compte rendu) |
| `infographics` | le contenu (`layout`) ou l'ancienne image, **à part** : `/history` renvoie les documents entiers ; index `meetingId`, purgée avec le compte |
| `user` | comptes, rôle (`user`/`admin`), mot de passe scrypt, état, `groupIds` (jamais vide : `default` à défaut) |
| `userGroups` | groupes d'utilisateurs (`id`, `name`, `nameLower`, `color`, `isDefault`) ; le groupe `default` est créé au démarrage et ne se supprime pas |
| `userTemplates` / `templates` | modèles de compte rendu (utilisateur / organisation) |
| `userConfig` | contexte de l'utilisateur — **réécrite à zéro à chaque sauvegarde** |
| `userTags` | tags (id, `label`, `labelLower`, `color`, `myBrainProject` : la fiche de projet reliée) |
| `userActionSettings` | destinataires, dossiers, gabarits, approbation, règles par tag, choix d'envoi à myBrain, dernier réglage de l'Aide IA |
| `userConnections` | comptes externes reliés (refresh token, scopes accordés, cache de dossier) |
| `appSettings` | réglages d'organisation : `auth`, `ai`, `actions`, `branding`, `org-context`, `myBrain` (clé scellée), `aiHelp` |
| `actionMailLog` | piste d'audit des envois, TTL 90 j — **jamais le contenu** |
| `deletedMeetingUsage` | minutes des réunions supprimées, comptées au quota jusqu'à la fin de leur mois (TTL) |
| `authSession`, `authResetToken`, `authOAuthState` | sessions et jetons éphémères (décorateurs `app.sessions`, `app.resetTokens`, `app.oauthStates`) |
| `userMailAccounts` | héritée : plus aucun code n'y écrit, gardée pour la purge tant qu'elle existe en base |

Deux dates cohabitent sur un `resume` : **`lastConnecion`** (faute héritée de
n8n) porte la date de la RÉUNION, `now` la date de dernière écriture.
L'historique et les statistiques suivent `lastConnecion` — sinon régénérer un
vieux résumé le déplacerait dans le mois courant.

`lib/bootstrap.js` pose les index et joue les reprises idempotentes au
démarrage (durées relues dans les comptes rendus, `transcriptionChars` calculé
dans Mongo, migration `userMailAccounts` → `userConnections`).

---

## 5. Le cliquet `App.svelte`

`eslint.config.js` impose `max-lines` sur `src/App.svelte`, **fixé à sa taille
courante** (la valeur vit là, nulle part ailleurs : un chiffre recopié ici était
faux à l'extraction suivante) et **abaissé** à chaque extraction. Un refactor l'avait ramené
à ~2 300 lignes ; il est remonté à ~6 400 faute de garde-fou.

**Ne jamais remonter cette valeur.** Ajouter une fonctionnalité à App.svelte se
paie en sortant autre chose — c'est ainsi que sont nés `ToastHost.svelte`,
`transcriptLive.js`, `liveMeeting.js`, `infographic.js`. Deux conséquences de
conception, préférables de toute façon :

- les sections de « Réglages » sont **autonomes** (elles chargent,
  enregistrent et lisent `$uiText` elles-mêmes) ;
- ce qui doit remonter passe par un **store**, pas par des props qui
  traverseraient App (`storeApproval.js` en est l'exemple : la boîte
  d'approbation n'a aucune prop).

---

## 6. Pièges Svelte rencontrés (4 fois, au moins)

**La réactivité ne suit que les identifiants qu'elle voit.** Écrire
`d={barPath(point.value, i)}` ou `class:stale={isStale()}` dans un gabarit ne
recalcule rien quand une dépendance est cachée derrière l'appel. Tout état
dérivé se déclare : `$: geometry = layout(points, width, height, max, ticks)`.
Symptômes déjà payés : colonnes tassées dans le quart gauche d'un graphique,
bouton « Enregistrer » figé, résultat de test périmé présenté comme valable.

**Un `{#each}` de liste vivante doit être keyé** (`{#each items as it (it.id)}`),
sinon les champs en cours d'édition sont reconstruits sous les doigts.

**Un voile de bas de page existe** : `.main-area` porte un fondu de 110 px en
`z-index: 40`. Un élément posé en bas de la zone principale apparaît « délavé »
sans que rien dans ses propres styles ne l'explique.

**`tokens.css` avant `style.css`** : l'ordre est requis (jetons `--tag-*`,
`--brand-*`). Une recette qui charge l'inverse teste des couleurs qui n'existent
pas en production.

---

## 7. Tests

```bash
npm test                    # les deux projets vitest
npm run lint                # eslint (dont le cliquet max-lines)
npm run check               # svelte-check
bash test-api.sh            # smoke test CRUD du backend (sans IA)
```

Deux projets vitest (`vitest.config.js`) :

- **`node`** — fonctions pures du front, backend `services/api/**`, scripts,
  fonctions pures de l'extension ;
- **`dom`** — composants Svelte (`*.component.test.js`), jsdom +
  `@testing-library/svelte`. `svelteTesting` (auto-cleanup) et le plugin
  `unplugin-icons` y sont obligatoires : sans ce dernier, tout composant portant
  une icône est intestable.

Le backend se teste **contre un faux Mongo** (`services/api/test/helpers.js`),
qui n'implémente **pas `aggregate`** — c'est l'une des raisons pour lesquelles
`lib/stats.js` calcule en JavaScript.

Quelques tests verrouillent des invariants qu'aucune convention ne protège :

| Test | Invariant |
|---|---|
| `test/traefikWiring.test.js` | tout routeur vers `api` cite `noident` ; formes v2.11 (`HeadersRegexp`) **et** v3 (`HeaderRegexp`) |
| `test/actionsTest.test.js` | le bouton « Tester » n'a **pas** son propre chemin d'exécution |
| `test/adminStats.test.js` | l'administration ne lit **aucun** contenu de réunion |
| `test/myBrainFeed.test.js` | une réunion part **une** fois ; un échec ambigu (délai, interruption) n'est jamais relancé sans l'utilisateur |
| `test/myBrainDocument.test.js` | le texte déposé dans myBrain ne nomme jamais l'outil ; aucune réplique perdue au découpage |
| `test/aiHelp.test.js` | personne n'a l'Aide IA sans le droit de son groupe ; la fiche d'un projet n'entre dans un prompt que pour un compte qui peut lire myBrain ; le modèle n'est appelé que pour une réunion du compte, en cours ; myBrain en panne ne casse pas la réunion |
| `src/stores/aiHelp.test.js` | une phrase n'est lue qu'une fois, reconnue par son identifiant ; une lecture en échec n'efface pas le passage |
| `src/utils/wakeWord.test.js` | le prénom cité au milieu d'une phrase ne déclenche rien |
| `src/utils/filenameTemplate.parity.test.js` | client et serveur nomment les fichiers pareil |
| `src/config/configSections.test.js` | « Aide » ouvre la documentation en ligne, le formulaire de remontées garde son accès, chaque entrée a son libellé FR **et** EN |
| `scripts/whats-new.test.mjs` | `NOUVEAUTES.md` valide et sans jargon, datation par le commit de naissance (y compris après amende), forme du fichier publié |

---

## 8. Outillage et conventions

```bash
npm run dev                 # Vite :5173 (predev : zip de l'extension)
npm run dev:backend         # Mongo + API en Docker (docker-compose.dev.yml)
npm run dev:local           # Vite + proxy /api → :3000, OIDC simulé
npm run dev:local:password  # idem sans simulation OIDC (chemin mot de passe)
npm run format              # prettier
npm run whats-new           # régénère src/whats-new.json depuis NOUVEAUTES.md
npm run docs:generate       # doc technique auto (docs/technique/code/) — CI
```

- **Commits en Conventional Commits, en français.**
- **Une évolution visible met `NOUVEAUTES.md` à jour dans le même commit** :
  c'est lui, et non les sujets de commit, qui alimente la popup « Quoi de
  neuf ? » (cf. [FONCTIONNALITES.md](./FONCTIONNALITES.md)).
- **Version** : celle de `package.json`, reprise par `src/version.json` (un
  test le vérifie) et par le tag de publication `vX.Y.Z`. Elle change à la
  publication d'une version, pas à chaque commit.
- **Nouveautés publiées** : après un commit qui touche `NOUVEAUTES.md`,
  `npm run whats-new` régénère `src/whats-new.json`, à valider dans un
  commit séparé ; la CI vérifie qu'il est à jour (`npm run whats-new:check`).
- **Pas de TypeScript** : JSDoc dans les fichiers `.js`, `jsconfig.json` pour
  l'éditeur. Décision assumée.
- **Commentaires en français, orientés « pourquoi »**. Les en-têtes de fichier
  de ce dépôt expliquent la décision et le piège, pas la mécanique — c'est la
  documentation la plus fiable qu'il ait, et elle vieillit avec le code.
- `docs/technique/code/` est **généré par l'IA** (workflow `docs.yml`, PR
  labellisée `docs-auto`) : ne pas l'éditer à la main.
- `CHANGELOG.md` reste l'histoire détaillée, destinée aux développeurs ;
  `NOUVEAUTES.md` est ce que lisent les utilisateurs.
