# Transcription : capture, direct, locuteurs

Le cœur technique du produit. Ce document dit ce que le code ne dit pas : ce qui
a été **mesuré** contre l'API réelle, et les invariants qu'aucune convention ne
protège.

---

## 1. Le chemin de l'audio

```
micro ──────────────┐
                    ├─► AudioContext ─► PCM16 ─► WebSocket OpenAI Realtime ─► deltas + completed
son de l'ordinateur ┘        │                    ou d'un tiers (dialecte) ─► traduits en deltas
(getDisplayMedia, ou         │                    (jeton éphémère /api/tempkey)
 périphérique virtuel)       └─► MediaRecorder ─► segments locaux ─► /api/record (différé)
```

**Deux sessions Realtime séparées**, une par source :

| Flux | Source | Tag `source` | Rendu |
|---|---|---|---|
| micro | `getUserMedia` | `local` | normal |
| son de l'ordinateur | `getDisplayMedia` (Chrome, Edge) ou `getUserMedia` sur un périphérique virtuel (Firefox, Safari) | `remote` | pastille « Visio », couleur distincte |

C'est une séparation **par périphérique, pas par voix** : elle sépare « moi » de
« ce qui sort des haut-parleurs ». Deux personnes dans la même pièce partagent le
micro et restent indiscernables (cf. §5).

### Firefox et Safari : un périphérique virtuel, pas le partage d'écran

Leur `getDisplayMedia` ne rend **jamais** de piste audio, sur aucun système
(données de compatibilité MDN, relues le 2026-10-01), et aucune autre API web ne
capte le son d'une autre application. La seule voie restante passe par le
système : un **périphérique audio virtuel** (BlackHole, VB-CABLE, Mixage stéréo,
moniteur PulseAudio) qui présente la sortie de l'ordinateur comme une entrée.
L'utilisateur le choisit une fois par navigateur (Réglages → Pendant la réunion → Micro et son → Son de l'ordinateur, `stores/audioDevices.js`) ; « Réunion avec visio »
l'ouvre ensuite comme un second micro (`src/lib/audio/systemAudio.js`).

Écarté : une application de bureau capturant le son du système. C'est la seule
autre voie (les extensions Firefox et Safari n'ont pas d'équivalent à la capture
d'onglet de Chrome), au prix d'un produit de plus à signer et distribuer par
système, pour un besoin que Chrome et Edge couvrent déjà.

Deux entrées ouvertes ensemble tiennent dans les deux navigateurs, **vérifié dans
leurs sources** et non sur du matériel : Firefox branche tout appareil au-delà du
premier en « non natif », avec correction de dérive d'horloge
(`dom/media/DeviceInputTrack.h`) ; Safari donne une unité audio à part à toute
entrée sans annulation d'écho (`CoreAudioCaptureSource.cpp`, `createNonVPIOUnit`).
Ce qui fixe les invariants de `buildSystemAudioConstraints` :

- **annulation d'écho, réduction de bruit et gain automatique coupés.** L'écho se
  calcule contre ce que joue le navigateur : une visio ouverte dans un onglet
  serait soustraite de l'entrée qui doit la capter. Et Safari n'a qu'une unité
  avec annulation d'écho : la demander ici la retirerait au micro ;
- **`deviceId: { exact }`.** Sans lui, un périphérique débranché ouvrirait le micro
  par défaut, et chaque mot serait transcrit deux fois. Pour la même raison, un
  son de l'ordinateur égal au micro n'est jamais ouvert (`systemDeviceIsMic`) ;
- **retrouvé par son nom.** Le navigateur renouvelle ses identifiants (données du
  site effacées) : le nom est gardé avec l'identifiant, et le réglage se recolle
  au nouvel identifiant.

Rien ne le teste sur une vraie carte son : le bouton « Tester le son » du réglage
(`src/lib/audio/levelProbe.js`, crête ≥ 0,01, soit ≈ −40 dBFS) est le contrôle,
côté utilisateur, du seul défaut courant : une sortie audio qui n'est pas envoyée
au périphérique.

**Contrat** : l'enregistrement du micro ne dépend jamais du son de l'ordinateur.
Rien ne lève depuis `systemAudio.js` ; un échec rend le micro seul et un statut,
seul « Annuler » arrête le démarrage.

**L'audio du direct ne transite jamais par `services/api`** : le navigateur parle
directement au fournisseur du modèle (OpenAI, Mistral, Speechmatics ou
AssemblyAI) avec un jeton éphémère. Seuls les fichiers (import, reprise hors
ligne) passent par `/api/record`.

⚠️ `aiBaseUrl` est la base du endpoint Realtime **sans suffixe** : le WebSocket
en tire `wss://…/v1/realtime`. `/calls` est le chemin WebRTC, abandonné (code
supprimé). **Un patch de prod ajoutant `/calls` ici a cassé la transcription
le 2026-08-03.**

---

## 2. Le modèle de transcription, et ce qui a été mesuré

Réglable dans **Administration → IA**, avec un bouton **Tester** qui ouvre une
vraie session.

Chaque modèle a été essayé contre l'API réelle : une phrase synthétisée poussée
dans une session Realtime, puis lecture des événements reçus.

| Modèle | Deltas | `…transcription.completed` |
|---|---|---|
| `gpt-realtime-whisper` *(défaut)* | incrémentaux, mot à mot | **jamais émis** |
| `gpt-live-transcribe` | incrémentaux, mot à mot | **jamais émis** |
| `gpt-transcribe` | incrémentaux, mot à mot | un par segment |
| ~~`gpt-4o-transcribe`~~ | incrémentaux, mot à mot | un par segment |
| ~~`gpt-4o-mini-transcribe`~~ | incrémentaux, mot à mot | un par segment |
| ~~`whisper-1`~~ | un seul par segment | un par segment |

Les trois modèles barrés sont **retirés par OpenAI le 2027-02-26** (annonce du
2026-08-26) et ne sont plus proposés depuis le 2026-10-14. Leurs mesures restent
ici : c'est elles qui expliquent le code du direct (§3), qui garde le désordre
des segments et le segment livré d'un bloc relevés sous `whisper-1`.

Deux enseignements que la liste des modèles ne donne pas :

- **un modèle valide en général ne l'est pas pour une clé donnée** —
  `gpt-4o-transcribe-diarize` (retiré lui aussi le 2027-02-26) répondait « Your
  organization does not have access to this transcription model ». D'où le
  bouton Tester ;
- **le flux d'événements change avec le modèle** — c'est ce qui a exigé la
  correction du §3.

La liste de `services/api/lib/transcriptionModels.js` est la transcription
fidèle de ce qu'accepte l'API, **pas une préférence** : un identifiant hors liste
est refusé à la création de session.

### Chaîne de résolution

`appSettings{key:'ai'}.transcriptionModel` → `OPENAI_MODEL_TRANSCRIPTION` →
`gpt-realtime-whisper`. Une valeur inconnue est **ignorée**, jamais propagée :
elle ferait échouer toutes les transcriptions de l'installation.

**Un modèle retiré n'est pas une valeur inconnue.** `gpt-4o-transcribe`,
`gpt-4o-mini-transcribe` ou `whisper-1`, encore enregistrés ou dans
l'environnement, sont **traduits** en `gpt-transcribe` à la résolution
(`RETIRED_TRANSCRIPTION_MODELS`), pas ignorés : ignorés, ils feraient retomber
l'installation sur le défaut, à 0,017 $/min — 3 à 6 fois le choix de
l'administrateur. `gpt-transcribe` parce qu'il a leur flux (deltas **puis**
`completed`) et coûte moins que deux d'entre eux.

Écarté : une migration au boot qui réécrit `appSettings`. Elle ne couvrait pas
`OPENAI_MODEL_TRANSCRIPTION`, et il fallait un champ de plus pour que l'écran
dise le remplacement. Ici la base garde l'ancien nom ; `GET /settings/ai` sert
`transcriptionModelRetired: {from, date}`, l'onglet IA l'annonce, et **Garder
gpt-transcribe** enregistre le remplaçant — l'avis disparaît.

⚠️ **`/api/tempkey` crée le jeton avec ce modèle ET le renvoie au client.** Le
navigateur envoie ensuite un `session.update` ; s'il n'y remettait pas le même
modèle, la session repartirait sur celui d'OpenAI et le réglage n'aurait **aucun
effet visible** — un écran qui annonce « Enregistré » sans que rien ne change.
Côté client, les canaux relisent le modèle **à chaque rotation** (`getModel()`,
`lib/realtime/channel.js`) : ils sont construits au chargement de
l'application, le modèle n'arrive qu'au premier `/tempkey`.

`POST /api/admin/settings/ai` accepte les champs **séparément** — absent =
inchangé, vide = retour au défaut. Sans cette distinction, changer de modèle
effacerait la clé OpenAI.

**Le fichier n'a pas de réglage à lui** : sous OpenAI, `/api/record` (import,
reprise hors ligne) appelle `/audio/transcriptions` avec
`FILE_TRANSCRIPTION_MODEL` (sous Voxtral, voir plus bas). Cet endpoint
n'accepte pas les modèles du direct (`gpt-realtime-whisper`,
`gpt-live-transcribe`) — y brancher le réglage casserait la reprise hors ligne.
`whisper-1` jusqu'au 2026-10-14, puis `gpt-transcribe`, le seul remplaçant que
la documentation d'OpenAI donne pour les fichiers : même endpoint, même réponse
`{ text }` sans `response_format`, 0,0045 $/min au lieu de 0,006.

### Imports longs : découpés en tranches de 5 min, sur le serveur

`whisper-1` transcrivait 100 min d'un tenant (25 Mo seulement). La famille de
`gpt-transcribe` a deux plafonds que sa documentation ne donne pas, relevés
publiquement sur `gpt-4o-transcribe` : un refus au-delà de ~1 400-1 500 s, et
surtout **2 000 jetons de sortie** — une transcription **tronquée sans erreur**
au bout de 8 à 11 min de parole. Ceux de `gpt-transcribe` n'ont pas été mesurés
(pas d'appel réel). Au-delà de 5 min 15, `/record` coupe donc l'audio en
tranches **égales** de 5 min au plus (`lib/audioChunks.js`), les transcrit trois
à la fois et les remet bout à bout. 5 min : ~1 200 jetons de français, et la
taille des segments hors ligne, qui passent entiers.

Mesuré le 2026-10-15 avant de choisir, sur un m4a de 25 Mo / 100 min et un
stéréo de 26 min :

| Où découper | Coût mesuré |
|---|---|
| navigateur (`decodeAudioData`, puis WAV 16 kHz) | **+4,2 Go** de RAM (+2,9 Go en stéréo) et ~190 Mo de WAV à envoyer : écarté, surtout sur téléphone |
| serveur, ffmpeg `-c copy` (sans réencodage) | < 1 s, **50 Mo** au pic dans l'image de l'API limitée à 256 Mo ; m4a, webm/opus, mp3, ogg |

Le paquet alpine `ffmpeg` coûte **101 Mo** d'image (codecs vidéo compris) ; un
ffmpeg compilé pour l'audio seul a été écarté (build CI, liste de formats à
tenir). Pièges payés pendant la mesure : à 300 s fixes, 100 min laissaient une
21e tranche de 0,03 s qu'OpenAI refuse — d'où des tranches égales ; sans
`-reset_timestamps 1`, une tranche garde la durée du fichier entier.

⚠️ **ffmpeg lit un fichier de l'utilisateur.** `-protocol_whitelist file` et
`-format_whitelist` (les seuls formats audio attendus) l'empêchent d'ouvrir une
playlist HLS ou un script `concat` déguisés en audio — lecture de fichiers du
serveur ou SSRF. Vérifié sur le vrai ffmpeg : le piège part entier, non ouvert.

Sans ffmpeg (dev local, image ancienne) ou si la découpe échoue, le fichier part
**entier**, comme avant (choix d'Alex, plutôt que refuser tout import long). Il
peut alors être refusé : `/record` reconnaît le refus (« longer than N
seconds ») et répond **413 `audio_too_long`**, l'écran dit de couper le fichier
au lieu de citer OpenAI. Une tranche en échec fait échouer l'import **entier** :
un texte à trous passerait pour complet.

Le bouton Tester (`POST /api/admin/settings/ai/test-transcription`) ouvre une
**vraie** session avec le modèle candidat — exactement l'appel que fera
`/tempkey` — et relaie verbatim le refus d'OpenAI. Aucun audio n'est envoyé,
l'appel ne coûte rien, et le jeton n'est jamais renvoyé au client.

### Piste d'optimisation ouverte

Relevé du 2026-08-20 : `gpt-transcribe` coûte **0,0045 $/min** contre
**0,017 $/min** pour le défaut actuel, avec un taux d'erreur annoncé divisé par
deux face à `whisper-1`, et il est **déjà dans la liste** et déjà mesuré — il
transcrit d'ailleurs les fichiers depuis le 2026-10-14. Les
nouveaux modèles acceptent en plus des *keyword hints* — de quoi corriger
l'orthographe des prénoms **à la transcription** plutôt qu'au résumé (cf. les
notes de réunion). À basculer avec le bouton Tester.

### Fournisseurs tiers : Mistral, Speechmatics, AssemblyAI

Depuis le 2026-10-27, la liste porte, à côté de ceux d'OpenAI, les modèles de
trois fournisseurs tiers, chacun avec sa clé :

| Fournisseur | Modèles (identifiant chez nous) | Direct | Fichiers |
|---|---|---|---|
| Mistral | `voxtral-mini-transcribe-realtime-2602` (disponible en général), `…-3-0` (aperçu public depuis le 2026-10-20) | 0,006 / 0,008 $/min | `voxtral-mini-2602`, `voxtral-mini-transcribe-3-0` |
| Speechmatics | `speechmatics-melia-1` (en direct depuis le 2026-10-13, change seul de langue), `speechmatics-enhanced` | 0,40 / 0,80 $/h | même `model` (`melia-1`, `enhanced`), tâche par lot |
| AssemblyAI | `universal-3-6-pro` (32 langues), `universal-streaming-multilingual` (6, dont le français) | 0,45 / 0,15 $/h, **à la durée de session** | `universal-3-5-pro`, `universal-2` en repli |

Identifiants versionnés, jamais `-latest` : un alias qui bascule changerait le
protocole ou le prix sans que l'administrateur l'ait choisi. Speechmatics
n'ayant pas d'identifiant de modèle à lui seul, le préfixe `speechmatics-` rend
les siens uniques ici (`speechmaticsModel()` le retire).

⚠️ **AssemblyAI facture la durée de la SESSION**, pauses et silences compris,
pas l'audio transcrit : une réunion en pause continue de coûter. L'estimation
des dépenses, qui compte la durée des réunions, reste donc juste.

**Le fournisseur suit le modèle** (`TRANSCRIPTION_PROVIDERS`). Écarté : un
réglage « fournisseur » à part, qui pourrait contredire le modèle. Il décide de
tout, sans second réglage :

| | OpenAI | Mistral | Speechmatics | AssemblyAI |
|---|---|---|---|---|
| Jeton du direct (`/tempkey`) | `/realtime/client_secrets` | `POST /v1/client/sessions` → `rt_…`, **lié au modèle** | `POST mp.speechmatics.com/v1/api_keys?type=rt` `{ttl:60}` → `key_value` | `GET streaming.assemblyai.com/v3/token?expires_in_seconds=60` → `token` |
| Socket | `aiBaseUrl`, jeton en sous-protocole | `wss://api.mistral.ai/…/realtime?model=…`, jeton en sous-protocole | `wss://eu.rt.speechmatics.com/v2?jwt=…` | `wss://streaming.assemblyai.com/v3/ws?token=…&speech_model=…` |
| Audio | JSON base64, 24 kHz | JSON base64, 16 kHz | **binaire**, 16 kHz | **binaire**, 16 kHz |
| Fichiers (`/record`) | `/audio/transcriptions` | `/v1/audio/transcriptions` | tâche `POST eu1…/v2/jobs?wait=30&format=txt`, relue jusqu'à `done` | `/v2/upload` puis `/v2/transcript`, relue jusqu'à `completed` |
| En-tête de la clé | `Bearer` | `Bearer` | `Bearer` | la clé **telle quelle** |

Une installation passée à un tiers n'envoie plus **aucun** audio à OpenAI,
imports compris ; OpenAI garde le résumé, les titres, les actions et la
relecture. La découpe des imports longs (5 min) s'applique aussi : inutile pour
ces fournisseurs, qui acceptent des heures, mais sans risque et sans branche de
plus. Une tâche de fichier qui n'aboutit pas en 10 min échoue (504) plutôt que
de tenir `/record` indéfiniment ; refusée, elle échoue aussi (502) — jamais un
texte vide qui passerait pour complet.

**Résidence des données.** Speechmatics passe par ses hôtes **européens** (direct
et fichiers). AssemblyAI a aussi des hôtes européens (`streaming.eu.…`,
`api.eu.…`), mais sa documentation ne publie le jeton que sur l'hôte global et
ne dit pas qu'un jeton global ouvre un socket européen : hôtes globaux tant que
ce n'est pas mesuré.

**Les clés tierces n'ont pas d'environnement** : elles se règlent dans la carte
« Fournisseurs d'IA » de l'onglet IA, une ligne par fournisseur
(`ProviderKey.svelte`), et nulle part ailleurs. Sans sa clé, les modèles d'un
fournisseur restent visibles mais verrouillés : la clé débloque les modèles,
c'est le schéma de l'écran. Stockées comme la clé OpenAI (en clair dans
`appSettings{key:'ai'}.<fournisseur>ApiKey`, jamais servies : un indice
seulement). Le code est commun aux trois (`lib/speechProviders.js`,
`KEYED_PROVIDERS`) : mêmes erreurs (`provider_key_*`, qui nomment le
fournisseur), mêmes garde-fous, jugés sur l'état d'**arrivée** de
l'enregistrement — un modèle tiers sans la clé de son fournisseur est refusé
(`provider_key_missing`), retirer cette clé pendant qu'il transcrit aussi
(`provider_key_in_use`). Le bouton Tester éprouve la clé **collée** en
demandant un jeton du direct, gratuit : coller, tester, enregistrer, dans
l'ordre de l'écran. Un 401 y accuse la clé, un autre refus le modèle. Chez
Mistral, le jeton est lié au modèle et prouve aussi son accès ; chez
Speechmatics et AssemblyAI, il ne prouve que la clé. La pastille de
configuration sonde la clé du fournisseur en service.

**Côté navigateur, un dialecte par fournisseur** (`lib/realtime/dialects.js`),
créé à chaque ouverture de socket d'après le modèle que renvoie `/tempkey`
(préfixe `voxtral-`, `speechmatics-`, `universal-` ; aligné sur la liste du
serveur par un test de l'API). Il traduit ce qu'il reçoit en événements
d'OpenAI : la pile, le superviseur, `handleMessage` et toute la mise en forme
du §3 sont inchangés. Un message sans équivalent passe tel quel : ignoré par
`handleMessage`, il prouve quand même au chien de garde que le canal vit. Une
erreur reçue avant que le socket soit prêt fait échouer la rotation sur-le-champ,
sans attendre le délai d'ouverture. Ce que chacun fait autrement :

- **Mistral** — attend `session.created` avant d'envoyer sa configuration ;
  `transcription.text.delta` devient un delta, sans `item_id` ni `completed` :
  une ligne se boucle à la ponctuation, ou après `PENDING_STALE_MS`, comme sous
  `gpt-realtime-whisper`. `transcription.done` (le texte **entier**) n'est pas
  traduit : le verser doublerait tout ce que les deltas ont écrit.
- **Speechmatics** — `StartRecognition` à l'ouverture, audio après
  `RecognitionStarted`. Seuls les **définitifs** (`AddTranscript`) sont lus :
  un partiel se révise, il ne s'ajoute pas, et le direct n'ajoute que des
  deltas. `max_delay` à 1 s pour garder le rythme. Le texte est recomposé depuis
  `results` (ponctuation collée selon `attaches_to`). Chaque paquet d'audio est
  accusé (`AudioAdded`) : le chien de garde ne manque jamais de signal.
- **AssemblyAI** — chaque `Turn` porte la transcription **entière** du tour,
  **révisée** d'un message à l'autre sous Universal-3.6 Pro. Le dialecte
  n'écrit que les mots au-delà de ceux déjà écrits, en deltas du segment
  `aai-<turn_order>`, puis le final mis en forme (`end_of_turn` +
  `turn_is_formatted`) devient le `completed` du segment, qui remplace ses
  lignes — le chemin de `gpt-transcribe` (§3). `format_turns=true` donne ce
  final mis en forme sous Universal-Streaming.
- **Tous** : un socket remplacé reçoit sa fin d'audio (`input_audio.end`,
  `EndOfStream` avec le numéro du dernier paquet, `Terminate`) et n'est fermé
  que 3 s plus tard : ces fournisseurs écrivent avec un retard, le fermer net
  perdrait une fin de phrase à chaque rotation.

La langue de l'interface part avec le direct, et avec les fichiers
(`/record?lang=`, `utils/recordUrl.js`) : Speechmatics l'exige pour un fichier,
les autres la détectent.

⚠️ **Rien de tout cela n'a été mesuré contre les API réelles** : relevé dans la
documentation de chaque fournisseur le 2026-10-27, sans clé de test. Les
clients serveur sont éprouvés contre un faux `fetch`, les dialectes contre un
faux socket. À vérifier en recette, fournisseur par fournisseur :

1. **le jeton borne-t-il la session ?** La doc récente de Mistral le dit court
   (~60 s, réglable) : il ne servirait qu'à ouvrir le socket. Celui d'AssemblyAI
   est explicitement une fenêtre d'ouverture (session de 3 h au plus) ; celui de
   Speechmatics, à vérifier. Si une session tombait à l'expiration du jeton, le
   superviseur reconnecterait, avec un « Connexion perdue » ;
2. **durées maximales** : Speechmatics 48 h, AssemblyAI 3 h, Mistral non
   documentée — la rotation de 25 min (§4) les couvre toutes ;
3. **`language`** dans la configuration de Voxtral 2602 (documenté pour
   Voxtral 3) : un refus arriverait en `error`, journalisé sans toast ;
4. **le chien de garde** (§4) attend un message dans les 40 s d'audio non
   silencieux : Mistral et AssemblyAI n'émettent a priori rien sans parole. Un
   bruit de fond soutenu pourrait provoquer des reconnexions inutiles, bornées
   par le backoff. Speechmatics, qui accuse chaque paquet, n'est pas concerné ;
5. **la réponse de `GET /v2/jobs/{id}`** de Speechmatics : à plat
   (`{id, status, txt}`) ou enveloppée (`{job: {status}}`) — les deux sont lues.

Piste ouverte : les frontières de prise de parole (l'`item_id` du §3) manquent
encore sous Mistral et Speechmatics. Voxtral 3 (`turn_detection`) et
Speechmatics (`EndOfUtterance`) les donnent ; écartées tant qu'elles ne sont pas
mesurées.

---

## 3. Direct : deltas, doublons, position

### Le doublon que le réglage de modèle a révélé

L'application avait été écrite pour un modèle qui **n'émet jamais** `completed` :
les deltas sont accumulés, et la ligne est bouclée quand elle se termine par une
ponctuation de fin de phrase. Sous `gpt-4o-transcribe`, la même phrase arrivait
donc **deux fois** — une par les deltas, bouclée à la ponctuation, puis réécrite
par le `completed` qui suit. Chaque phrase en double dans la transcription, donc
dans le résumé, donc dans le compte rendu envoyé.

`src/utils/transcriptDeltas.js` retient ce que les deltas ont écrit depuis le
dernier `completed`, **par flux** (micro et audio système s'entrelacent). Quand
le `completed` dit la même chose et qu'aucune ligne n'est en cours, il n'y a
rien à ajouter.

⚠️ La déduplication est **indexée par `source`**. Introduire un locuteur par
ligne en direct demanderait une clé composite `(source, speaker)`.

### Un delta peut n'être qu'une espace

Le tokeniseur des modèles OpenAI détache l'espace qui précède un nombre :
« jusqu'à 4 h » arrive en `jusqu` · `'à` · `␣` · `4` · `␣h`. `App.svelte`
écartait les deltas vides **après `trim()`** : l'espace sautait, et le direct
écrivait « jusqu'à4 h », « le12 mars » (constaté le 2026-10-19). Visible surtout
sous les modèles sans `completed` — rien ne venait remettre la ligne au propre.
`handleMessage` ne filtre plus que le delta vide ; `applyLiveDelta` ajoute
l'espace à la ligne en cours de son segment, mais une espace seule n'ouvre
aucune ligne et ne boucle pas celle d'un autre segment (c'est le mot suivant
qui décide). ⚠️ Aucun test ne monte `handleMessage` : n'y remettez pas de
`trim()`.

### Trois invariants de position (`src/utils/transcriptLive.js`)

Le bug corrigé, constaté en visio quand les interlocuteurs alternent : la ligne
« en cours » d'un flux restait plantée au milieu de l'historique dès que l'autre
flux écrivait après elle. Faute de ponctuation elle n'était jamais bouclée, et
les premiers mots de la prise de parole **suivante** du même flux se fusionnaient
dedans — du texte neuf apparaissait plus haut, et le bas de l'écran ne montrait
rien avant la première ponctuation.

1. **LE DIRECT RESTE EN BAS.** Les lignes en cours (`isDelta`) vivent en queue
   d'historique, au pire une par flux — comme les deux bulles vivantes d'un
   sous-titrage. Toute ligne finale s'insère **avant** elles (`finalInsertIndex`),
   jamais après.
2. **UN SEGMENT VAD = UNE LIGNE.** Chaque delta porte l'`item_id` du segment
   détecté par la VAD serveur. Un delta d'un **autre** item signe une nouvelle
   prise de parole : l'ancienne ligne est bouclée sur-le-champ. Sans `item_id`
   (événements historiques), une ligne muette depuis `PENDING_STALE_MS` (10 s)
   est bouclée de la même façon — c'est le seul délai qu'un flux applique à
   **sa propre** ligne.
3. **UNE LIGNE MUETTE N'EST PLUS LE DIRECT** (2026-10-13). Sous le modèle par
   défaut, qui n'émet jamais `completed`, un « Voilà » sans ponctuation restait
   en cours tant que son auteur ne reprenait pas la parole : en queue, il
   voyait chaque phrase bouclée de la visio s'insérer devant lui, et la
   dernière réplique de l'utilisateur s'affichait en avant-dernier pendant des
   minutes. Dès qu'un flux écrit, la ligne en cours de l'**autre** flux muette
   depuis `LIVE_SILENCE_MS` (1,5 s) est bouclée sur place, avant lui.
   Le seuil : les deltas arrivent toutes les 300-500 ms et la VAD coupe après
   500 ms de silence. Plus court, une hésitation couperait une phrase en deux
   lignes ; plus long, une réponse brève passerait encore devant. Écarté :
   un minuteur qui boucle les lignes muettes même quand personne ne parle —
   sans écriture de l'autre flux, rien ne s'insère devant, l'ordre est déjà
   juste.

Le `completed` finalise **sur place**, il ne déplace pas la ligne.

Un segment peut pourtant s'étaler sur **plusieurs** lignes avant son
`completed` : la ponctuation d'un delta boucle « Bonjour. », la suite du même
item ouvre une autre ligne. Cela n'arrive qu'aux modèles qui émettent
`completed` (gpt-transcribe, comme avant lui gpt-4o-transcribe,
gpt-4o-mini-transcribe et whisper-1) — le défaut gpt-realtime-whisper n'a que
la ponctuation pour boucler.
Le `completed` portant la transcription **entière** du segment, l'invariant 2
s'applique au moment où il arrive : le texte va dans la **première** ligne du
segment, les autres sont retirées, et le texte complet est re-dérivé de
l'historique (`recompute`). Remplacer la seule ligne en cours — ou la dernière
bouclée — écrivait le début du segment deux fois, jusque dans le compte rendu
(constaté le 2026-10-13). Écarté : ne verser que ce qui dépasse le texte déjà
bouclé. Le `completed` reponctue et recase le début, le préfixe ne se retrouve
pas à l'identique, et c'est sa graphie qui fait autorité.

### Écho de visio

Le mix contient micro + audio système : quand l'annulation d'écho laisse passer,
la même voix apparaît deux fois. `src/utils/transcriptEcho.js` la retire côté
texte. ⚠️ Cette déduplication **retire des éléments de l'historique** : aucun
mécanisme ne doit raisonner sur `finalTranscriptions.length` (cf. la détection
d'actions).

### Corrections automatiques de l'organisation

Administration → Configuration porte une liste « ce que la transcription écrit
→ ce qu'il faut écrire » (`appSettings{key:'transcriptCorrections'}`, moteur
`src/utils/transcriptCorrections.js`), appliquée aux réunions de **tous** les
comptes. Un remplacement **déterministe**, choisi contre deux alternatives :

- **une relecture par l'IA**, comme celle des notes (`transcriptRefine.js`) :
  un appel par phrase, un coût, et des garde-fous phonétiques pour l'empêcher
  d'inventer. Ici l'administrateur dit exactement quoi remplacer : rien à
  deviner ;
- **un indice envoyé au moteur** (`prompt` de session) : il ne profiterait
  qu'à l'audio suivant, et sa prise en compte par `gpt-realtime-whisper`
  n'est pas mesurée (§2, piste ouverte). Il ne remplacerait pas la correction
  de toute façon : un modèle qui reçoit « Globex » peut encore écrire
  « Klobex ».

Invariants que les tests tiennent, et pourquoi :

1. **À la clôture d'une ligne, jamais sur un delta** (`finalizeAt` et
   `applyLiveFinal`, `transcriptLive.js`). Un delta coupe les mots : corrigé au
   fil de l'eau, « Klobex » + « ol » donnerait « Globexol ». La ligne en
   italique montre donc le mot tel qu'entendu ; le mot juste s'éclaire à la
   clôture (`refineFlash`, même marqueur que la relecture, jamais persisté).
2. **Avant la déduplication d'écho, et `completed` comparé dans la graphie
   corrigée.** L'historique est corrigé : l'écho de l'autre flux et le
   `completed` d'une ligne déjà bouclée (cas 2) doivent être lus dans la même
   graphie, sinon le `completed` remettrait « Klobex » à la place de
   « Globex ».
3. **Un passage, plus long terme d'abord, et ce qui est juste ne bouge pas.**
   Pas de chaîne A → B → C ; et « Alfred » → « Alfred Dupont » ne double pas un
   « Alfred Dupont » prononcé en entier — les occurrences exactes des mots
   justes sont protégées, ce qui rend l'application idempotente.
4. **Le bord gauche d'un mot est capturé, pas regardé en arrière** :
   l'application mobile tourne dans une vue web, et WebKit n'a les lookbehind
   que depuis iOS 16.4.

Chemins couverts côté navigateur : le direct, l'import d'un fichier (il passe
par `applyLiveFinal`) et les passages hors ligne (`handleOfflineGapTranscribed`).
`/api/record` **ne corrige pas** : le serveur ne fait que garder et servir la
liste, avec `GET /api/templates` comme le vocabulaire — jamais par la sonde
publique `/api/auth/config`, ce sont des noms de clients. Les réunions déjà
enregistrées ne sont **pas** réécrites.

### Le contexte du tag, seconde référence de la relecture

Les noms et sigles écrits dans « Que doit savoir l'IA ? » (le tag de la réunion
EN DIRECT, `liveTagContext`) servent de référence à la relecture comme les
notes : le client envoie `tagId`, le serveur relit le contexte en base sous le
compte du demandeur et l'ajoute après les notes, avec la même règle (rétablir
une graphie écorchée, jamais remplacer un nom par un autre). Garde et prompt
inchangés.

**Pas d'appel par phrase pour un dossier qui ne la concerne pas.** Un tag ne
s'écrit pas pendant la réunion : sans notes, relire chaque phrase finalisée
coûterait un appel au modèle à chaque fois. Un filtre local et gratuit
(`mentionsTerm`) ne laisse partir l'appel que si une des deux phrases contient
un mot proche d'un nom ou d'un sigle du contexte — même mot à la casse et aux
accents près (« pac » → « PAC »), ou proche à l'oreille au seuil de la garde
(0,7) — sans l'être déjà mot pour mot. Les noms se lisent comme côté serveur
(`contextTerms` ↔ `tagContextTerms`, test de parité) : mots à majuscule qui
n'ouvrent pas une phrase, réunis quand ils se suivent, et sigles. Avec des
notes, la relecture part comme avant.

**Écarté : l'indice de vocabulaire au moteur.** Contrairement aux notes, le
contexte est connu AVANT la réunion : le passer en `prompt` de transcription
profiterait à tout l'audio. Mais le champ n'est pas vérifié sur
`gpt-realtime-whisper` ni chez les fournisseurs tiers, et un `session.update`
refusé couperait la transcription. À mesurer avec une vraie clé avant d'y
toucher.

### « Mots remplacés » du compte, appris des notes

Un remplacement écrit dans les notes (« Remplace Alexe par Alex ») ne valait
que pour sa réunion, par la relecture (deux dernières phrases, un appel au
modèle, notes tronquées à 4 000 caractères) et par le compte rendu. Il est
maintenant versé dans une liste **par compte**
(`userActionSettings.transcriptCorrections`, `GET/POST /api/transcript-corrections`),
compilée avec celle de l'organisation en un seul correcteur
(`stores/transcriptCorrections.js`) : même moteur, mêmes invariants, aucun
appel. Décisions, et ce qui a été écarté :

- **Par compte, pas dans la liste de l'organisation.** Elle vaut pour tous :
  n'importe qui aurait réécrit la transcription des autres en prenant des
  notes. La liste du compte passe **avant** l'autre à la compilation — sur une
  même écriture, son mot juste gagne — et ce que l'organisation corrige déjà de
  la même façon n'y est pas recopié.
- **N'est retenu que ce qui se prononce presque pareil**
  (`utils/noteReplacements.js`, seuil `REFINE_SIMILARITY_MIN`, sigles épelés :
  « la dévé » / « l'ADV »). Dans une réunion, une consigne mal lue est
  inoffensive : elle ne s'applique que si le modèle fait exactement ce
  remplacement. Retenue, elle réécrit toutes les réunions à venir — et des
  notes disent aussi « Remplacer Paul par Marie sur le projet », « Budget →
  validé ». Écarté : retenir toute consigne « Remplace… » (les notes de
  décision y passent) ; exiger que le mot figure dans la transcription (« Paul »
  y figure justement). Le prix est assumé : « Remplace Bob par Robert » n'est
  pas retenu, il s'ajoute à la main.
- **Appris quand on QUITTE le champ des notes**, pas à la frappe : une consigne
  à moitié tapée (« Remplace Alexe par Al ») deviendrait une règle. Une mémoire
  de session évite de reproposer la même consigne à chaque clic, et de faire
  revenir aussitôt un remplacement que l'utilisateur vient de retirer.
- **Toujours dit** (toast), parce qu'une ligne ajoutée en silence réécrirait
  des transcriptions sans que personne sache d'où elle vient ; et coupable
  d'un interrupteur, tenu par le serveur.
- **Plafond : 100 lignes** (50 pour l'organisation). Ce n'est pas le moteur
  qui le fixe — mesuré : 150 lignes (les deux listes pleines) coûtent 0,03 ms
  par phrase, 500 lignes 0,4 ms, et c'est à 500 que corriger une transcription
  entière de 70 000 caractères commence à se sentir (0,1 s). C'est la relecture
  de la liste par son auteur, et le risque de faux positifs qui croît avec
  elle. Au plafond rien n'est évincé : le remplacement n'est pas retenu, et
  c'est dit une fois par session.
- **Non fait** : les lignes déjà écrites de la réunion en cours ne sont pas
  reprises par le nouveau remplacement (la relecture ne voit toujours que les
  deux dernières phrases) ; les remplacements demandés à l'Aide IA (« Alfred,
  remplace partout… ») ne sont pas appris.

Modération tenue par l'écran ET par le plafond : 50 lignes, 10 variantes,
avertissement sur les mots courants et les termes de trois lettres ou moins —
avec accents et casse confondus, « ca » → « CA » change aussi chaque « ça ».

---

## 4. Tenir la connexion pendant des heures

`src/lib/realtime/` : `channel.js` (un socket), `supervisor.js` (la machine à
états), `stack.js` (les deux flux ensemble).

### Rotation préventive — 25 minutes

OpenAI coupe une session Realtime **au plus tard à 60 min**, et des fermetures
serveur ont été observées **dès ~45 min** : à 50 min la rotation arrivait parfois
après la coupure, d'où les toasts « Connexion perdue » en pleine réunion.
`RECONNECT_INTERVAL_MS = 25 min` garde une marge large.

La rotation est **make-before-break** : l'ancien socket continue de transcrire
pendant que le nouveau se connecte et se configure ; la bascule (le processor
audio lit `current` à chaque frame) n'a lieu qu'une fois le nouveau prêt. Ses
dernières transcriptions arrivent encore par son `onmessage` — **aucune parole
perdue**. En échec (timeout 10 s), l'ancien reste en service et `rotate()`
rejette : l'appelant décide du retry. Elle est **silencieuse** : sa fréquence est
invisible pour l'utilisateur.

### Une seule reconnexion en vol

Le superviseur remplace trois mécanismes non coordonnés qui se partageaient deux
booléens (`isReconnecting`, `isRecording`) : retry aveugle à 5 s, rotation
préventive, health check. L'historique du dépôt contient un **deadlock** où
`isReconnecting` restait vrai pour toujours et où plus aucune rotation ne
partait. Ici : **single-flight strict**, un seul échéancier, et `stop()` remet
tout à zéro quoi qu'il arrive. Le superviseur ne touche ni au WebSocket ni à
l'interface — il orchestre des callbacks.

Le canal audio système n'avait **aucun** superviseur avant `stack.js` : ni
rotation propre, ni health check.

### Le socket zombie — le seul signal qui l'attrape

Incident du 2026-08-26 : un socket resté `readyState === OPEN` a **cessé
d'émettre pendant 11 min 19 s** en pleine réunion. Ni fermeture, ni erreur : rien
que le health check (qui ne teste que `readyState`) pouvait voir, et aucune
reconnexion n'est partie.

Le seul signal fiable est **le temps écoulé depuis le dernier message reçu**,
quel qu'en soit le type (`delta`, `completed`, `session.updated`,
`speech_started` — n'importe lequel prouve que le canal répond).
`REALTIME_SILENT_STREAM_MS = 40 s`, vérifié toutes les `5 s`. Sur un canal sain,
l'écart entre deux messages reste de l'ordre de 10-15 s au pire ; 40 s laisse
plus du double de marge tout en tenant le critère « reconnexion en moins d'une
minute ».

Deux faux positifs déjà traités : la **pause** (le chien de garde ne tourne pas)
et la **rotation** en cours (l'ancien socket est remplacé, pas mort).

Les incidents remontent par `POST /api/client-event` — identité **facultative**,
une coupure vaut d'être tracée même si la session vient de mourir, c'est
justement un cas suspect. Le journal ne porte **jamais** de contenu de réunion.

### Le réseau annoncé par le navigateur

`offline` et `online` n'étaient écoutés nulle part pour le direct. Un socket
dont le réseau disparaît reste souvent `OPEN` : il avale l'audio jusqu'à ce que
le chien de garde tranche, 40 s d'audio plus tard — et c'est seulement là que
s'ouvrait la capture du passage (ci-dessous). `stack.noteNetwork(false)`
l'**abandonne** tout de suite (`channel.abandon`) : la perte part par le chemin
habituel, la coupure commence à l'instant vrai. `noteNetwork(true)` relance sans
attendre le retry de 5 s.

Écarté : juger le socket sur `bufferedAmount` pour trancher plus tôt qu'à 40 s
sans événement `offline`. Sur une coupure de 10 à 30 s où TCP survit — le cas
courant d'un téléphone qui traverse une zone faible —, l'audio en attente part
au retour du réseau et rien n'est perdu ; l'abandonner l'aurait jeté.

⚠️ **Limite connue** : sans événement `offline` (réseau présent, données
absentes), l'audio parti dans un socket mort avant que le chien de garde ne
tranche n'est ni transcrit ni capté comme passage manquant — 40 s au plus.

### Ce que le direct manque est rattrapé, web compris

La capture segmentée (`platform/offlineRecording.js`) n'existait que dans l'app
native. Sur le web — donc dans la PWA, qui change de réseau bien plus qu'un
ordinateur —, ce qui se disait pendant une coupure n'était jamais transcrit.
Elle tourne maintenant partout (`isGapCaptureSupported`) : à la perte du direct
un passage s'ouvre, ses segments partent vers `/record` au retour, et le texte
remplace le marqueur ⟨passage hors ligne⟩.

Ce qui reste propre au natif (`isOfflineCaptureSupported`) : **démarrer** sans
réseau, et garder les segments sur disque. Sur le web ils vivent en mémoire, et
seulement ceux d'une coupure (32 kb/s, 14 Mo par heure de coupure) — un segment
couvert par le direct n'y protégerait de rien. Une page fermée avant le retour
du réseau emporte donc l'audio de la coupure ; à la restauration, son marqueur
dit « non transcrit » au lieu de promettre (`settleRestoredHistory`). Écarté :
IndexedDB. Reprendre des segments après un rechargement demande de retrouver
leur réunion, leur ordre et leur marqueur — le natif lui-même ne le fait pas
(les orphelins y sont purgés à 7 jours).

Les identifiants de coupure sont uniques par capture : chacune repartait de
`gap-1`, et après un arrêt puis un nouveau départ sur la même transcription le
texte d'une coupure remplaçait le marqueur resté de la précédente.

### Tenir la CAPTURE : appel, arrière-plan, micro perdu

Tout ce qui précède surveille le **réseau**. Sur téléphone, c'est la capture
elle-même qui tombe : un appel prend le micro, iOS gèle une PWA en arrière-plan.
`lib/recording/captureGuard.js` remplace l'écouteur de visibilité, le contrôle
10 s et les écouteurs de piste d'App.svelte, dont la relecture a montré quatre
trous :

1. **un micro redemandé n'alimentait plus la transcription.** Il était rebranché
   sur la destination d'enregistrement, pas sur le processor du direct ni sur
   le détecteur de silence : la réunion continuait « en cours », muette,
   jusqu'à l'arrêt. `adoptMicrophone` (App.svelte) le rebranche partout ;
2. **une piste restée muette n'était jamais reprise** — `muted` n'est pas
   `ended`, le contrôle ne regardait que `readyState` ;
3. **le contexte audio n'était relancé que `suspended`.** iOS le met
   `interrupted` pendant un appel ;
4. **deux toasts par contrôle en échec**, dont un persistant : soixante pour un
   appel de cinq minutes.

**Le signal est la trame**, pas un état ni un minuteur. Le processor du micro en
rend ~12 par seconde tant que l'audio coule ; une page gelée, un contexte
interrompu n'en rendent plus, quoi que disent `state` et `readyState`. Un
minuteur ne prouve rien : onglet caché, le navigateur le ralentit jusqu'à une
fois par minute alors que la capture continue. Le trou est donc mesuré de la
dernière trame à la suivante, et constaté **par cette trame** au retour.

Au rétablissement, trois seuils (`config/constants.js`) :

| Trou | Effet |
|---|---|
| ≥ 8 s | marqueur ⟨enregistrement interrompu pendant …⟩ dans la transcription — le compte rendu sait qu'il manque un passage — et toast |
| ≥ 15 s | `stack.refresh()` : rotation du socket sans attendre le chien de garde. Sous une page gelée, il est le plus souvent mort sans que `onclose` soit passé |
| ≥ 10 s sans reprise | toast persistant « touchez l'écran » |

**Le toucher compte.** iOS refuse parfois `AudioContext.resume()` hors d'un
geste. Tout appui pendant une interruption retente, dans le geste même ; au
retour d'un appel, l'utilisateur touche forcément l'écran.

**Un nouveau micro n'est demandé qu'écran visible**, toutes les 12 s au plus, et
n'est adopté que s'il n'est pas muet lui aussi : pendant l'appel, la demande
échoue ou rend une piste muette, et l'ancienne piste se rétablit le plus souvent
seule à la fin.

Écarté : reconstruire tout le graphe audio (nouveau contexte) en dernier
recours. L'enregistrement téléchargeable est UN flux MediaRecorder sur la
destination du contexte ; un second contexte donne un second fichier, et deux
WebM mis bout à bout ne se lisent pas. Le cycle `suspend`/`resume` relance un
contexte « running » qui ne rend plus rien, sans rien casser.

Écarté aussi : tenir un silence numérique exact pour une panne. Android rend des
zéros pendant un appel sans le signaler, mais un micro avec réduction de bruit
agressive aussi, dans une salle calme : le marqueur mentirait.

**« Pause » du système met en pause.** L'action `pause` de Media Session (écran
verrouillé, bouton d'un casque, téléphone qui reprend l'audio) appelait
`stopRecording` : un appui involontaire clôturait la réunion en base.

⚠️ **Rien de tout cela n'a été éprouvé sur un vrai téléphone** : ni l'état
`interrupted` d'iOS, ni le retour d'un appel, ni le gel d'une PWA. Les tests
rejouent ces états avec des pistes et un contexte factices ; le protocole est
dans MOBILE.md §6.

### Reprendre après une pause

Signalé par un client le 2026-11-18 : « pas de son sur le micro après une pause de
15 minutes ». Sa production (`59a3229`, 29/10) précédait le garde de capture :
un micro perdu pendant la pause (casque éteint, ordinateur en veille) y était
redemandé mais rebranché sur l'enregistrement seul — le trou n° 1 ci-dessus —,
et la réunion restait muette jusqu'à l'arrêt. Deux angles morts restaient, que
la pause rend probables :

- **Le socket a dormi.** En pause, les pistes sont coupées (`enabled = false`)
  et rien ne circule sur le socket, dans un sens ni dans l'autre. Après des
  minutes, un NAT, un proxy d'entreprise ou le fournisseur a pu le couper sans
  que le navigateur le sache : la parole de la reprise partait dans un socket
  mort jusqu'au chien de garde, 40 s au mieux. Au-delà de
  `REALTIME_PAUSE_REFRESH_MS` (60 s), la reprise renouvelle donc les canaux
  (`stack.noteResumed`, rotation sans coupure, une clé éphémère). Sous une
  minute, le socket vient de servir : il est gardé.
- **La pause passait pour une panne.** Un ordinateur mis en veille pendant la
  pause gèle les trames ; à son réveil, le garde écrivait ⟨ Enregistrement
  interrompu pendant 15 min ⟩ dans la transcription, alors que rien ne
  s'enregistrait. En pause, le trou n'est plus marqué ; encore ouvert à la
  reprise, il ne compte qu'à partir d'elle (`captureGuard.resumed`). Le canal,
  lui, est renouvelé sur la durée réelle : le socket a vécu tout le trou.

Écarté : envoyer du silence pendant la pause pour garder le socket éveillé. La
transcription se facture à la durée d'audio envoyée : une pause d'une heure
aurait coûté une heure.

⚠️ **Non éprouvé sur un poste réel** : ni la coupure d'un socket inactif (aucune
mesure de son délai), ni le réveil d'un ordinateur pendant une pause. Les tests
rejouent le scénario avec un faux socket et une fausse horloge.

### Reprendre après une fermeture sans préavis

Le témoin « une réunion enregistre » n'était écrit qu'à `beforeunload`. Un
téléphone tue une PWA en arrière-plan sans cet événement : au lancement suivant,
pas de fenêtre « Réunion interrompue », et un chronomètre reparti de sa dernière
pause — donc des horodatages faux pour la suite. `utils/liveSession.js` le
réécrit toutes les 5 s et à chaque passage en arrière-plan.

Il porte l'identifiant de la réunion qui **enregistre** : la reprise la rouvre
dans son document (`startLiveMeeting({resumeId})`, `/history/start` ne réécrit
rien d'un document existant). Avant, elle ouvrait une seconde réunion, complète,
à côté de la première restée figée à la coupure. `/tempkey` reçoit le même
identifiant : une reprise n'est pas refusée pour un quota atteint depuis le
démarrage.

Le chronomètre repart de sa valeur au dernier battement : le temps d'absence
n'est pas compté (ni minutes de quota, ni horodatages décalés), il est dit par
un marqueur. À l'inverse, un trou **sans** fermeture (appel, gel) reste dans le
chronomètre, qui suit l'horloge : les horodatages de la suite sont ceux de la
réunion réelle.

« Terminer la réunion » remplace « Abandonner », qui vidait l'écran et laissait
la réunion `recording` en base, sans durée — hors du compteur de minutes — et
arrêtée au dernier envoi périodique. Elle est close comme par un arrêt
(`closeInterruptedMeeting` : copie locale, durée, notes, actions) et reste à
l'écran, prête à résumer.

À l'arrière-plan, la transcription part en base avec `keepalive` — sous 24 000
caractères seulement : le navigateur refuse `keepalive` au-delà de 64 Kio de
corps. Une longue réunion part sans lui ; la copie locale, écrite à chaque
phrase, reste la référence de la reprise.

### Reprendre une réunion TERMINÉE

Seule la réunion interrompue se reprenait. Une réunion arrêtée — trop tôt, pour
le déjeuner, ou qui continue le lendemain — ne pouvait qu'ouvrir une **autre**
réunion, et le compte rendu de l'une ignorait l'autre. « Reprendre » (dock,
après l'arrêt) et « Reprendre l'enregistrement » (bas de la transcription d'une
réunion rouverte ou résumée — un seul endroit à la fois, comme « Résumer ») font
repartir la capture **dans le même document**, par la voie de la reprise après
coupure : `resumeMeetingId`, `/tempkey?meetingId=`, `/history/start` rejoué.

Décisions, et ce qu'elles écartent :

- **`/history/start` sur un document existant le repasse `recording`** et date
  la reprise (`resumedAt`). L'Aide IA refuse une réunion qui n'est pas
  `recording`, et myBrain n'envoie pas une réunion qui l'est encore : laisser
  `ended` aurait privé la suite de l'une et livré l'autre à moitié.
- **Le quota s'applique à la reprise d'une réunion close** : au premier
  `/tempkey`, elle est `ended`, donc pas « en cours ». Ensuite, ses rotations de
  jeton ne sont jamais refusées : `isLiveMeeting` (routes/ai.js) accepte
  `resumedAt` récent comme `meetingStartTime` récent — une réunion de la semaine
  dernière aurait sinon perdu son direct au premier socket à rouvrir, quota
  atteint en cours de route.
- **Le chronomètre repart de la durée de CETTE réunion**
  (`utils/meetingResume.js`) : celle de la liste d'historique, à défaut celle
  lue à l'ouverture de l'archive ; le chronomètre du poste seulement si l'écran
  n'a pas quitté le direct. « Enregistrer » sélectionne la réunion sans
  recharger l'archive (`fallbackMeetingDuration` reste celui de la DERNIÈRE
  archive ouverte), et le chronomètre du poste est celui de la dernière réunion
  enregistrée ici — chacun pris seul se trompait de réunion. Il est posé en
  mémoire ET dans le stockage, que `setRecordingState` relit au démarrage.
- **Le crédit en direct ne déduit que la suite** (`resumedCountedS`) : la durée
  d'avant est déjà comptée par le serveur ; la déduire encore faisait chuter
  l'anneau de toute la première partie le temps de la reprise.
- **Un marqueur daté** (« ⟨ Enregistrement repris le … à … ⟩ ») plutôt que
  « interrompu pendant … » : l'écart peut être de plusieurs jours, et l'heure
  de fin de la première partie n'est pas connue à la seconde.

⚠️ **Prix acceptés.** L'audio téléchargeable ne couvre que la dernière partie :
deux webm de deux `MediaRecorder` ne se concatènent pas en un fichier lisible.
Le quota compte une réunion au mois de sa DATE (`lastConnecion`, cf.
lib/quota.js) : reprendre en novembre une réunion d'octobre verse les minutes
nouvelles à octobre. La date affichée n'est pas déplacée pour autant — la
réunion resterait introuvable à sa place dans l'historique. Une réunion déjà
envoyée à myBrain n'y est pas renvoyée après sa reprise. Une reprise tuée en
route puis reprise par « Réunion interrompue » déduit de nouveau la première
partie du crédit affiché, jusqu'à l'arrêt.

### Autres filets

| Mécanisme | Rôle |
|---|---|
| `lib/recording/captureGuard.js` | micro, contexte audio et page surveillés ; rétablissement et marqueur du trou (ci-dessus) |
| `utils/liveSession.js` | témoin de reprise réécrit toutes les 5 s (ci-dessus) |
| `utils/audioKeepAlive.js` | tonalité inaudible (`KEEP_ALIVE_VOLUME = 0.002`, toutes les 500 ms) : empêche la suspension du contexte audio en arrière-plan |
| `utils/wakeLock.js` + `platform/keepAwake.js` | écran/CPU maintenus (3 couches sur le web, plugin natif sur mobile) |
| `platform/backgroundRecording.js` | foreground service Android / `UIBackgroundModes=audio` iOS |
| `MAX_RECORDING_DURATION_MS` (8 h) | arrêt **propre** (sauvegarde + toast persistant), jamais silencieux |
| `CONTINUE_PROMPT_AFTER_MS` (3 h, puis 1 h) | invite « Poursuivre / Arrêter » ; l'enregistrement **continue** pendant l'invite, 5 min sans réponse = arrêt sauvegardé |
| `LIVE_TRANSCRIPT_SAVE_MS` (20 s) | pousse la transcription en base pendant la réunion — un onglet fermé ne laisse pas une ligne vide |

### Historique des correctifs de stabilité

Trois campagnes, toutes closes, résumées ici parce que leurs symptômes
reviennent périodiquement :

- **Enregistrement desktop (nov. 2025)** — le micro était branché trop tard dans
  la séquence de démarrage et le navigateur suspendait le contexte audio ; la
  demande de partage d'écran, si elle restait sans réponse, bloquait tout. Fix :
  micro connecté immédiatement, `AudioContext` créé plus tôt, timeout de 10 s sur
  `getDisplayMedia`, nettoyage systématique en cas d'erreur.
- **Instantanéité (fév. 2026)** — les transcriptions n'apparaissaient qu'aux
  segments finalisés (~2 s de latence perçue). L'affichage des **deltas** a ramené
  ça à 300-500 ms. C'est le comportement qui a rendu nécessaire tout le §3.
- **Déconnexions ICE à ~30 s (juin 2026)** — chemin WebRTC, remplacé depuis par
  le WebSocket. Le code WebRTC (`utils/peerConnection.js`) a été supprimé.

Le détail commit par commit est dans `CHANGELOG.md`.

---

## 5. Qui parle

### Ce qui est livré

**Les étiquettes vivent DANS le texte envoyé au modèle**, pas dans un schéma à
part (`src/utils/transcriptAttribution.js`). Format script : une ligne
d'étiquette `[Nom]` / `[Visio]` à **chaque changement de locuteur**, puis les
lignes de ce locuteur. Sans cela, `generateSummary` aplatissait tout en texte
brut et le compte rendu n'attribuait rien.

Deux garde-fous :

- **deux étiquettes distinctes exigées** — une réunion mono-flux (micro seul :
  Firefox ou Safari sans son de l'ordinateur réglé, mobile, visio sans partage)
  produit un texte plat **identique** à l'ancien `join`, et `attribution: null`
  pour que le prompt n'en parle pas ;
- `REMOTE_SPEAKER_LABEL` est **intouchable** : c'est la valeur de repli qui
  garantit qu'une ligne distante a toujours une étiquette.

Les marqueurs de passage hors ligne n'appartiennent à personne : ils traversent
tels quels et ne cassent pas le groupement.

**Affichage** : la pastille est **inline dans la réplique** depuis le
2026-08-28 — plus d'heure par ligne en archive, la colonne est conditionnelle.
Le contraste de la pastille distante est passé de 2,57 à 5,14.

### Nommer les voix de la visio

L'utilisateur pose lui-même un nom sur une prise de parole distante, pendant ou
après la réunion : la pastille « Visio » devient « Marie »
(`src/utils/transcriptSpeakers.js`, `SpeakerNamePopover.svelte`).

**Une étiquette est un en-tête qui vaut jusqu'à la suivante.** Deux portées :

- **« à partir d'ici »** — la ligne visée et les lignes distantes qui suivent
  tant qu'elles portent la même étiquette effective, jusqu'au prochain
  participant déjà nommé. Les tours de parole de l'utilisateur entre deux **ne
  coupent pas** la portée : en tête-à-tête, nommer la première réplique nomme
  toute la réunion ;
- **« partout »** — toutes les lignes distantes qui portent l'étiquette effective
  de la ligne visée (renommer « Marie » en « Marie Dupont », ou tout « Visio »
  d'un coup).

Le nom est posé **explicitement sur chaque ligne** de la portée, pas seulement
sur la première : une réunion rouverte relit chaque ligne avec son étiquette,
l'héritage ne joue que pour les lignes qui arrivent **en direct**.

⚠️ Le parseur **exige `selfLabel`**. Pièges du popover : donner le focus **après**
le flush, valider par un `Entrée` explicite, et se méfier des `Return` vides dans
un navigateur piloté.

**En direct, la liste bouge sous le menu** : une finale s'insère devant les
lignes en cours (§3), l'écho retire des lignes. Suivi par sa position dans une
liste non keyée, le menu perdait son ancre et se fermait dès que la visio
parlait — ou visait la ligne voisine. Il suit donc **sa ligne par clé** (le
segment `itemId`, sinon l'horodatage de naissance), se réancre après chaque rendu
et ne se ferme que si elle a disparu ; `LiveTranscript` suspend le suivi du direct
tant qu'il est ouvert. Piège payé : un `afterUpdate` ne tourne qu'**une fois par
flush** — le replacement sur la nouvelle ancre vit donc dans le popover, réactif
à son `anchor`.

### Diarisation automatique — étude de faisabilité

Question : peut-on savoir qui parle avec l'API déjà configurée ?
**Oui, mais pas en direct.** OpenAI ne diarise que sur
`/v1/audio/transcriptions` (batch) ; sa documentation **exclut explicitement**
les sessions Realtime, qui sont le chemin du live.

⚠️ **`gpt-4o-transcribe-diarize` est retiré le 2027-02-26**, et ses remplaçants
désignés (`gpt-transcribe`, `gpt-live-transcribe`) n'ont pas de diarisation
documentée : l'option B ci-dessous est à requalifier avant toute mise en œuvre.

`gpt-4o-transcribe-diarize` : `response_format=diarized_json` → segments
`{speaker, start, end, text}` ; `chunking_strategy` **obligatoire au-delà de
30 s** ; `known_speaker_names[]` + `known_speaker_references[]` pour de vrais
noms (**4 locuteurs maximum**, extraits de 2 à 10 s) ; ~0,006 $/min, le même
ordre de grandeur que l'existant. **L'accès de l'organisation reste à
vérifier** : le refus mesuré portait sur une session Realtime, chemin où le
modèle n'est de toute façon pas supporté. Sonde minimale avec la clé de
l'installation :

```bash
curl -s -X POST https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model=gpt-4o-transcribe-diarize -F response_format=diarized_json \
  -F chunking_strategy=auto -F file=@extrait.wav
```

**Options, ordonnées** — A (propager `source` dans le prompt) est **livrée** ;
B (passe de diarisation après la réunion, sur le micro seul, **un seul appel**,
étiquettes renommables) est l'option réaliste ; C.2 (deviner les prénoms depuis
les Notes, comme suggestion modifiable) après B ; C.1 (empreintes vocales) est
une **décision produit** — ce sont des données biométriques (RGPD art. 9) ;
D (fournisseur tiers avec diarisation en flux) ne s'engage pas avant que B ait
prouvé le besoin.

**Pièges à ne pas découvrir en route :**

- **les étiquettes ne sont pas stables entre deux requêtes** — diariser les
  segments hors ligne de 5 min un par un produirait un charabia. Un seul appel,
  ou `known_speaker_references` ;
- **plafond de 25 Mo** (OpenAI et Fastify `FILE_LIMIT`). Les segments natifs sont
  à 32 kbps (≈ 14 Mo/h), mais le `MediaRecorder` du desktop n'impose aucun
  `audioBitsPerSecond` : au débit par défaut de Chrome, une heure dépasse ;
- **timeout du client OpenAI : 120 s** — une heure d'audio le dépasse ;
- **nouveau chemin de données** : l'audio du direct ne passe aujourd'hui jamais
  par le serveur MyBrief (seuls les imports et les segments hors ligne passent
  par `/record`). Une passe de diarisation de la réunion entière change cela —
  politique de confidentialité et rétention à traiter ;
- **`/record` ne renvoie que `{ text }`** : `diarized_json` a une autre forme ;
- **diariser le micro seul** et garder le tag `remote` pour la visio évite le
  locuteur fantôme créé par l'écho, et garde la distinction « moi / distant »,
  plus fiable que n'importe quelle diarisation.
