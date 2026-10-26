# Transcription : capture, direct, locuteurs

Le cœur technique du produit. Ce document dit ce que le code ne dit pas : ce qui
a été **mesuré** contre l'API réelle, et les invariants qu'aucune convention ne
protège.

---

## 1. Le chemin de l'audio

```
micro ──────────────┐
                    ├─► AudioContext ─► PCM16 ─► WebSocket OpenAI Realtime ─► deltas + completed
son de l'ordinateur ┘        │                    (jeton éphémère /api/tempkey)
(getDisplayMedia, ou         │
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
L'utilisateur le choisit une fois par navigateur (Ma configuration → Réglages
audio → Son de l'ordinateur, `stores/audioDevices.js`) ; « Réunion avec visio »
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
directement à OpenAI avec un jeton éphémère. Seuls les fichiers (import, reprise
hors ligne) passent par `/api/record`.

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

**Le fichier n'a pas de réglage** : `/api/record` (import, reprise hors ligne)
appelle `/audio/transcriptions` avec `FILE_TRANSCRIPTION_MODEL`. Cet endpoint
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

### Autres filets

| Mécanisme | Rôle |
|---|---|
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
