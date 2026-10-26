# Fonctionnalités

Ce que fait MyBrief, et **pourquoi** chaque garde-fou est là. La mécanique
audio/transcription a son propre document ([TRANSCRIPTION.md](./TRANSCRIPTION.md)),
l'identité aussi ([AUTHENTIFICATION.md](./AUTHENTIFICATION.md)).

- [1. Le parcours d'une réunion](#1-le-parcours-dune-réunion)
- [2. Comptes rendus et templates](#2-comptes-rendus-et-templates)
- [3. Détection d'actions en direct](#3-détection-dactions-en-direct)
- [4. Notes de réunion](#4-notes-de-réunion)
- [5. Tags de conversation](#5-tags-de-conversation)
- [6. Connexions de comptes externes](#6-connexions-de-comptes-externes)
- [7. Actions post-réunion](#7-actions-post-réunion)
- [8. Infographie de compte rendu](#8-infographie-de-compte-rendu)
- [9. Administration](#9-administration)
- [10. Extension Chrome](#10-extension-chrome)
- [11. Accueil, aide et « Quoi de neuf ? »](#11-accueil-aide-et--quoi-de-neuf-)
- [12. MyBrain : nourrir le cerveau partagé](#12-mybrain--nourrir-le-cerveau-partagé)

---

## 1. Le parcours d'une réunion

Trois gestes : démarrer, arrêter, générer. Tout le reste est rangé.

**Avant de démarrer, le quota de minutes.** Quand le groupe du compte en porte
un (Administration → Groupes), l'anneau de l'avatar et la ligne sous le nom
(capsule de compte, `ui/CreditAvatar.svelte`, `quotaNow`) disent ce qui reste ce
mois-ci et descendent en direct pendant la réunion ; atteint, « Démarrer »
devient « Quota atteint » et le serveur refuse `/tempkey` en 409. La règle, ses
alternatives écartées et ses deux portes sont dans AUTHENTIFICATION.md §3
(« Le quota de minutes ») ; « Ce mois-ci » et la jauge de « Mes
statistiques » au §9.2.

**La réunion existe dès le premier mot.** Un document `resume` ne naissait
autrefois qu'à la première génération de compte rendu : une réunion en cours,
ou terminée sans résumé, n'existait nulle part — fermer l'onglet effaçait tout
ce qui avait été dit. Désormais `stores/liveMeeting.js` ouvre la réunion au
démarrage (`/history/start`), pousse la transcription au fil de l'eau et la
clôt à l'arrêt (`/history/stop`). Elle apparaît **en italique** dans la sidebar
tant qu'elle tourne.

Trois points à ne pas défaire :

- l'italique s'appuie sur une vérité **locale** (`liveMeetingIdStore`), jamais
  sur un drapeau renvoyé par le backend ;
- `currentMeetingId` fait partie de l'instantané `localStorage` — sans lui, un
  rechargement en pleine réunion fait disparaître le tag et **duplique** la
  conversation ;
- un `/history/start` en échec (hors ligne) **ne bloque pas** l'enregistrement :
  la réunion naîtra à la première génération, comme avant. Le serveur purge les
  réunions restées vides ;
- `/history/start` ne part qu'une fois la capture **vraiment** démarrée.
  `startRecording` avale ses échecs : un refus du micro ouvrait sinon une ligne
  que rien ne fermait — la purge n'a lieu qu'à `/history/stop`, jamais appelé
  pour un enregistrement qui n'a pas commencé.

**Au démarrage, « présentiel » ou « visio ».** Sur ordinateur (Chrome, Edge), le
micro obtenu, `MeetingTypeModal` demande le type de réunion ; seule la visio
ouvre `getDisplayMedia`, dans le clic même — c'est lui qui fournit le geste que
l'API exige. L'écran d'avant posait la question en termes techniques
(« Capturer l'audio Teams », « Passer (micro seulement) ») et ne décrivait que
l'application de bureau (« Tout l'écran ») : le chemin sûr, l'onglet, n'y
figurait pas. **Écarté** : un écran d'aide avec le schéma du dialogue de
partage avant de l'ouvrir — un clic de plus à chaque visio, pour un rappel
qu'une ligne sous les boutons suffit à donner.

Dans **Firefox et Safari**, la question n'est posée que si un son de
l'ordinateur (périphérique virtuel) est réglé, cf. TRANSCRIPTION.md §1 : la
visio ouvre alors ce périphérique, et la ligne de rappel le nomme au lieu de
décrire une fenêtre de partage qui ne s'ouvrira pas. Un périphérique absent est
signalé **avant** la question : proposer une visio qu'on sait muette n'a pas de
sens. Sans réglage, « Navigateur partiellement compatible » s'affiche à
l'ouverture et mène au réglage ; une fois le périphérique choisi, plus jamais.

**« Annuler » passe par le `catch` de `startRecording`** (le fond et Échap
aussi) : le micro est déjà ouvert, et le nettoyage d'un échec est exactement ce
qu'il faut — pistes coupées, `AudioContext` fermé, wake lock rendu, aucune
réunion inscrite. `recordingStartErrorKey` y reconnaît l'annulation et ne rend
aucun message. Un second chemin de sortie aurait fini par diverger du premier.

**Deux gestes de fin.** Générer le compte rendu, ou seulement **enregistrer la
réunion** : une route dédiée `/history/title` titre la réunion sans produire de
version. Ce n'est pas un drapeau sur `/stop` — un brouillon a **zéro version**,
et `saveOnStop` est lu par `closeLiveMeeting`.

**Hors ligne, l'enregistrement est tout-terrain** (mobile surtout) : l'audio est
capté, segmenté et persisté localement, les passages manqués par le direct sont
transcrits en différé via `/record` puis réinsérés à leur place (marqueur
⟨passage hors ligne⟩). Voir `src/platform/offlineRecording.js` et
`src/utils/offlineGaps.js`.

**Exports** : compte rendu en PDF, transcription en `.txt`, audio.

**Le PDF du compte rendu est du texte, pas une capture** (`src/lib/pdf/`). Le
navigateur met toujours en page le HTML du résumé hors écran, avec les mêmes
styles ; le module relève la position de chaque mot, et jsPDF l'écrit dans une
police embarquée — DejaVu Sans Condensed, à 2 % de la chasse de Tahoma, que la
feuille de style obtenait sur Mac. Mesuré le 2026-09-17 sur un compte rendu de
six pages : 4,5 Mo en capture html2canvas (une JPEG par page : l'extraction de
myBrain n'en tirait que les pieds de page, 460 caractères), 75 Ko en texte —
17 400 caractères extraits.

- **Écartés** : `jsPDF.html()` (sa pagination « text » cumule un décalage par
  mot et tranche les fonds), un Chromium côté serveur (image Docker et
  déploiement alourdis pour un seul document), une mise en page réécrite en
  JavaScript (deux feuilles de style à tenir en miroir).
- **Invariant** : la police du conteneur hors écran est celle qu'embarque le
  PDF. Sinon chaque mot garde sa place, mais pas sa largeur.
- **Pièges payés** : jsPDF tronque une chaîne au premier glyphe absent — emoji
  et invisibles passent donc en petite image ; WebKit arrondit les rectangles
  de texte au pixel englobant (`snappedLeft`) ; jsPDF 2.5 déclare la collection
  « Adobe-Identity-H », que poppler signale en erreur à chaque page — corrigée
  à l'écriture (`pdfBytes`).
- **Repli** : police injoignable (hors ligne, jamais mise en cache) ou voie
  texte en échec → l'ancienne capture image, pour qu'un PDF sorte toujours. Elle
  passe par **`html2canvas-pro`** et non html2canvas 1.4 : les couleurs modernes
  (`color-mix`, `color(srgb …)`) que produit le thème font échouer la version
  historique — la panne du 2026-08-27 sur « envoyer » et « entreposer » venait
  de là.

---

## 2. Comptes rendus et templates

**Six modèles intégrés** (Standard, Décision, RH, Brainstorming, Planification,
Rétrospective) et jusqu'à **5 modèles par utilisateur**. Prospect IA a été
retiré le 2026-09-15 : écrit pour la prospection de MyAlfred (nom de société,
partenaires en dur), il était livré à toutes les organisations.

Un template a deux blocs :

- 🤖 **Directives à l'IA** — style, contenu, longueur du résumé ;
- 🧱 **Mise en forme** — squelette de sortie avec placeholders `{{date}}`,
  `{{author}}`, `{{actions}}`, `{{résumé}}` (la balise où l'IA écrit).

Le prompt du résumé est construit **côté frontend**
(`src/config/templates.js`, `resolveSystemPrompt`) et passé tel quel dans le
corps de `/resume` : le backend est un passe-plat, comme n8n l'était.

**Les six défauts sont modifiables depuis l'administration.** La fusion se
fait **côté client** (pas de seed en base), l'écrasement passe par un champ
`value`, et « Rétablir le défaut » revient au texte intégré. Les variables ne
sont **jamais interpolées dans les instructions** — seulement dans la mise en
forme.

**Un défaut tourne par sa forme éditable** (directives + mise en forme), celle
que l'administration affiche — un test garde « l'enregistrer tel quel ne
change pas le rendu ». Écarté : l'ancien `buildPrompt` caché, doublé d'une
« traduction » pour l'éditeur. La première sauvegarde d'un défaut changeait le
document (la doc admin devait prévenir de relire), et les deux textes
divergeaient. Coût accepté : la mise en forme est recopiée mot pour mot, donc
chaque défaut porte aussi un `scaffoldEn` pour l'interface anglaise — une
version adaptée par un admin, elle, garde ses titres dans les deux langues.
Même squelette pour les six (titre daté, auteur, durée, synthèse, actions) ;
seules les directives changent, courtes et en puces. **Entretien RH ne produit
ni évaluation ni recommandation** : l'IA rapporte l'avis exprimé — évaluer des
candidats est un usage à haut risque au sens du règlement européen sur l'IA.

**Blocs IA du scaffold.** ✨ « Résumé IA » est obligatoire : déplaçable, jamais
supprimable. Les blocs « 20 mots », « 100 mots » et « points clés » sont des
**appels IA isolés** (slots opaques, assemblage côté serveur). Deux tentatives
de les obtenir par une seule consigne de prompt ont échoué avant cet
arbitrage (2026-08-27).

**Pagimètre — la longueur en pages** (`src/lib/pageMeter.js`, jumeau
`services/api/lib/pageMeter.js`, `services/api/lib/pageTarget.js`). Un curseur
de ¼ de page à 10 pages, proposé par template (`pageMeter` = position par
défaut ; Standard : 1 page). Les décisions :

- **Il règle le ✨ Résumé IA, pas le document.** Titre, auteur et actions de la
  mise en forme occupent déjà ~0,3 page : « ¼ de page » pour le document entier
  ne laisserait aucune place au résumé. **Une page = une page A4 du PDF exporté**.
- **On estime la mise en page, on ne compte pas des mots** : à mots égaux, la
  densité va de 356 à 511 mots par page selon la structure (puces courtes ou
  prose). L'estimation rejoue le PDF sans DOM (elle tourne aussi sur le
  serveur) : retour à la ligne mot par mot avec la chasse réelle de DejaVu Sans
  Condensed, hauteurs et marges de la feuille de `utils/pdf.js`. Calibrée le
  2026-09-30 contre le vrai moteur (Chromium headless + `measureLayout` +
  `paginate`) : 15 986 lignes exactes sur 15 988 ; hors échantillon, 240 blocs
  jusqu'à 19,5 pages, écart médian 0,12 %, p90 1,4 %. Une moyenne de chasse par
  caractère ratait une ligne sur treize (chiffres, « % ») : d'où la table.
  Écarté aussi : demander des « pages » au modèle, qui n'en voit aucune.
- **Le modèle rate sa cible, le serveur vérifie.** La consigne donne des mots
  (450 par page, fourchette ±10 %) et une FORME qui suit la taille (sans
  intertitre à ¼ de page, parties développées à 10) ; elle remplace la consigne
  de profondeur, qui dit « ne t'auto-censure pas sur la longueur ». La
  verbosité d'API suit la cible (`low` ≤ ½ page, `medium` ≤ 2, `high` au-delà).
  Le serveur découpe le résumé entre ses ancres, le mesure, et hors de ±20 %
  (plancher ±0,05 page) le fait reprendre — développer depuis la transcription
  ou condenser —, deux fois au plus, la seconde seulement si la génération dure
  depuis moins de 150 s. Une reprise n'est gardée que si elle rapproche de la
  cible sans recopier une ligne de la mise en forme : titre, actions et blocs
  fixes ne passent jamais par elle. Pourquoi deux passes : une reprise qui
  change la forme (¼ → 1 page gagne des intertitres) change la densité mesurée.
- **Les ancres ne regardent jamais le résumé** : `before` à sa n-ième
  occurrence (le nombre de fois qu'il figure avant le marqueur), `after` unique
  dans la fin du scaffold, cherché par la FIN. Un `</ul>` ou un titre repris
  dans le résumé ne peut pas couper la découpe. Ancre ambiguë ou introuvable :
  pas de reprise, la consigne seule.
- **La matière borne la longueur** : 45 % des mots de la transcription au plus
  (une heure ≈ 8 pages). Dix pages pour dix minutes, ce serait délayer ; la
  carte le dit avant de générer, hachures à l'appui.
- **Un Standard recouvert AVANT le Pagimètre n'en a pas** : un enregistrement
  remplace entièrement le défaut, et imposer une page à des directives adaptées
  changerait leurs comptes rendus sans prévenir. L'admin l'active dans
  l'éditeur. Le champ n'est écrit que s'il est activé : les documents des
  templates sans Pagimètre sont ceux d'avant. Template V1 (prompt libre) : pas
  de Pagimètre, rien n'y sépare le résumé du reste.
- **Mesuré, pas éprouvé en réel** : le 2026-09-30, sans appel au modèle (choix
  de l'utilisateur), une simulation de la chaîne réelle (consigne, reprise,
  mesure) avec un modèle qui rate de ±28 % : 50 % des premiers jets dans ±20 %,
  95 % après vérification ; 54 des 56 résumés finaux dans ±20 % une fois passés
  dans le vrai moteur PDF. En production, chaque génération laisse la trace
  `/resume : Pagimètre` (demandé, visé, mesuré, passes, final) : c'est là que se
  lit l'écart réel du modèle.

Filets : `pageMeter.parity.test.js` (les deux jumeaux), six résumés mesurés
dans le vrai PDF (`pageMeter.calibration.json`, écart < 3 %), et un test qui
lit la feuille de `utils/pdf.js` — la retoucher impose de recalibrer.

**Éditeur TipTap** (`src/lib/tiptap/`, `src/config/scaffold.js`) : barre fixe
H2/H3, autosave discret sans toast de succès. Le scaffold est stocké en
markdown côté backend et converti en document ProseMirror pour l'édition —
**le format stocké ne bouge pas**. Un nœud `variable` ne réémet que sa clé
d'allowlist : impossible d'injecter un `{{…}}` arbitraire par le document.

**Versions** : chaque régénération est conservée, comparable, supprimable.

**La barre des documents** (`components/DocumentBar.svelte`, extraite d'App) :
un sélecteur — « Transcription », puis un segment par version —, le tag,
« Partager » et le seul bouton plein de l'écran, « Résumer » / « Nouveau
résumé ». Règle : **un même geste n'a qu'un endroit**. Le bouton de résumé
n'apparaît que si le dock ne propose pas déjà « Résumer → » (`dockOffered`,
App.svelte) ; et le dock s'efface dès qu'un compte rendu existe, sur ordinateur
comme sur téléphone — son « Résumer → » doublait « Nouveau résumé ». Ouverte
depuis le dock, la carte de génération se referme par « Annuler » (le bouton
qui l'aurait refermée n'est pas là). Écarté : garder les deux — l'ancienne
bande offrait le résumé à deux endroits avec deux styles, et le partage à un
troisième, ce qui se lisait comme du désordre en fin de réunion. La croix d'une
version n'existe que sur l'onglet affiché : pour supprimer, on affiche d'abord.

**La fin de réunion** (`components/Dock.svelte`, `EndMeetingSheet.svelte`) :
pendant l'enregistrement, le dock ne montrait qu'une onde et un rond
« pause », et c'est de la pause que se décidait la fin — Résumer, Enregistrer,
corbeille. Personne ne le devinait : « pause » n'évoque pas « terminer », et
seule l'infobulle du rond le disait. Désormais deux commandes nommées,
« Pause » et « Terminer » ; en pause, « Reprendre » (en plein : c'est alors le
geste principal) et « Terminer », avec l'état en clair — « En pause — la
réunion n'est pas terminée ». « Terminer » ouvre « Terminer la réunion ? »,
qui explique chaque fin en une ligne (Résumer maintenant, Enregistrer sans
résumé, Supprimer la réunion) et relaie aux fonctions d'avant ; « Annuler » ne
touche pas à l'enregistrement. Le chemin le plus courant garde ses deux clics
(Terminer → Résumer maintenant, comme pause → Résumer hier). Écarté : garder
les trois fins directement dans la barre de pause, nommées — la fin restait
cachée derrière la pause. La feuille est téléportée dans <body>
(`utils/portal.js`) : le dock est centré par transform, qui capturerait un
`position: fixed`. Le téléphone a la même feuille et le même vocabulaire
(MOBILE.md).

---

## 3. Détection d'actions en direct

Les tâches évoquées apparaissent **pendant** la réunion, sans attendre l'arrêt.

`src/utils/actionDetectionScheduler.js` — trois défauts corrigés d'un coup :

1. l'action n'apparaissait qu'au bout de 5 segments finalisés ;
2. les fenêtres étaient **disjointes** (1-5, puis 6-10…) : une action à cheval
   n'était jamais vue en entier → **fenêtre glissante** recalculée à chaque appel ;
3. rien n'empêchait deux appels de se chevaucher → **verrou**.

⚠️ **Ne jamais raisonner sur la longueur de l'historique.** La déduplication
d'écho (`transcriptEcho.js`) *retire* des éléments : la longueur peut décroître
et repasser un seuil déjà franchi. Le déclencheur est un drapeau « du texte est
arrivé depuis le dernier appel ».

La fusion des réponses (`src/utils/liveActionsMerge.js`) est **immutable** et
se fait **par id** : nouveau tableau, nouvel objet pour les seules cartes
modifiées. Les cartes intactes gardent leur référence, sinon les `bind:value`
des champs en cours d'édition sont reconstruits sous les doigts. Le marqueur
d'animation `flash` **n'est jamais persisté** et le CSS borne de lui-même le
nombre d'itérations.

**Aucune analyse pendant la consultation d'une archive.** L'enregistrement
continue, mais l'écran porte la transcription et les actions de l'archive :
une relance de fin partie à ce moment les analysait, et y écrivait — en base,
maintenant que les actions y sont gardées au fil de l'eau. La détection reprend
au segment suivant du direct.

**Masquer, pas supprimer.** La corbeille d'une carte pose `show: false` :
l'action quitte la liste, le compte rendu et l'infographie, mais reste dans les
données, sous « Actions masquées », d'où « Rétablir » la ramène. L'autre option
— une vraie suppression confirmée — a été écartée : elle perdait le signal
`dismissed` envoyé au modèle, qui aurait reproposé la tâche à la phrase
suivante, et un geste réversible n'a pas besoin de confirmation.

**Aucun texte de remplacement n'est écrit dans une action.** « Nouvelle
action », « À définir », « Description de l'action... » étaient stockés comme de
vraies valeurs et ressortaient dans `{{actions}}` et dans l'infographie. Ce sont
désormais des placeholders ; les valeurs déjà en base sont reconnues par une
liste FIGÉE (`LEGACY_ACTION_PLACEHOLDERS`, recopiée côté API pour la
régénération d'infographie) et vidées à l'ouverture. Figée parce que c'est de la
donnée historique : un libellé d'écran peut changer, pas ce qui est déjà écrit.

**La langue des actions est celle de l'interface**, envoyée par le client à
`/api/actions` comme au banc d'essai — pas celle de la transcription. Les
actions entrent dans le compte rendu par `{{actions}}`, rédigé dans cette
langue : deux langues dans un même document, c'est ce que voyait l'interface
anglaise, la consigne en français faisant écrire les actions en français. Repli
`fr`, comme le résumé ; le code est normalisé (`normalizeLang`) avant d'entrer
dans la consigne.

**Six réglages par utilisateur** (`GET/POST /api/actions/detection`) :
le **rythme** (`enabled`, `windowSize`, `minSentences`) est appliqué par le
navigateur — seul à savoir combien de phrases ont été transcrites ; le
**contexte métier** compose la consigne côté serveur. L'onglet d'administration
correspondant a été supprimé : le contexte d'organisation vit dans Templates.

Le store s'hydrate quand `isRecordingStore` passe à vrai — pas au démarrage de
l'application : la route exige une identité, et l'appeler avant la connexion
renverrait un 401, donc l'écran de connexion à chaque rafraîchissement. En
échec, les valeurs intégrées s'appliquent : une réunion doit démarrer même si
la route est indisponible.

---

## 4. Notes de réunion

Zone de texte libre sous le panneau Actions, dans la colonne de droite.

Son rôle premier n'est pas de compléter le compte rendu, c'est **l'orthographe
des noms et des sigles** : un nom propre écorché par la transcription est
corrigé à partir des notes (consigne explicite, sigle défini, mot écorché — cf.
`buildNotesBlock` dans `src/config/templates.js`).

Les notes sont injectées dans **les deux chemins de prompt** (template et
scaffold) — l'oublier dans l'un des deux donne un comportement qui dépend du
modèle choisi. La hauteur est partagée par la grille de `.side-col`, pas réglée
dans le composant ; le brouillon est sauvé au blur.

**Notes et actions vivent en base sans compte rendu.** Elles n'y arrivaient
qu'avec `/resume` : une réunion close par « Enregistrer » se rouvrait sans
elles, et une retouche sur une réunion rouverte se perdait. Elles partent
désormais :

- dans la requête de **clôture** (`/history/stop`) — la même écriture décide de
  la purge, et une réunion qui porte des notes n'est jamais « vide ». L'état est
  relu JUSTE avant l'envoi, pas au clic : l'envoi final de la transcription
  peut durer des secondes, et un instantané pris au clic écrasait une retouche
  écrite entre-temps ;
- dans celle du **rangement** (`/history/title`) ;
- à **chaque modification**, en différé et par réunion (`/history/notes-actions`,
  `stores/notesActionsSave.js`), les écritures d'une même réunion en file ;
- après `/resume`, qui écrit l'état de SA requête, partie des secondes plus
  tôt : l'état le plus récent de la réunion générée est réécrit par-dessus —
  seulement s'il est plus récent que la requête, sinon il effacerait ce qu'un
  autre appareil a changé depuis ;
- à la fermeture de la page (`pagehide`, `keepalive`), pour ce qui attendait
  encore son délai.

**Rien n'est écrit sans changement.** Ni à l'ouverture d'une réunion, ni en
quittant un champ intact, et seul le champ modifié part (notes OU actions) :
une copie d'historique périmée — onglet ouvert depuis le matin — écraserait
sinon ce qu'un autre appareil vient d'enregistrer. La référence est l'état
CONFIRMÉ en base, comparé au moment où l'écriture part (une précédente a pu
échouer) ; elle est oubliée dès qu'un autre écrivain passe (clôture, rangement,
`/resume`) ou qu'une écriture échoue, et l'écriture suivante repart entière.

**La session locale est celle du direct.** Pendant la consultation d'une
archive, rien n'est écrit dans le `localStorage` : « Reprendre », après une
coupure, restaurerait l'archive à la place de la réunion en cours. Et le
brouillon des notes, écrit à chaque frappe, ne l'est que si la session locale
porte la même réunion — restauré avec la transcription d'une autre, il
partirait dans la mauvaise.

---

## 5. Tags de conversation

Chaque conversation se range dans **un** tag : une étiquette nommée et colorée,
propre à l'utilisateur. La sidebar affiche une pastille et une barre de filtre.

**Un classeur, pas une étiquette libre.** Une conversation en porte un seul, et
ce n'est pas une limite d'implémentation : un tag porte des règles d'action
(destinataires, dossier de dépôt) ; deux tags concurrents signifieraient deux
destinations contradictoires, sans règle pour trancher.

### Modèle

`userTags` : `{ email, emailLower, id, label, labelLower, color, shape, createdAt, updatedAt }`.
`labelLower` neutralise casse et espaces multiples (« Client Dupont » et
« client  dupont » sont le même classeur). Sur `resume`, le champ `tagId` est
**absent** quand la conversation n'est pas rangée (`$unset`, jamais `''`).
`shape` est absent sur les tags d'avant les formes : un rond, sans migration.

Palette **fermée et servie par l'API** (`GET /tags` renvoie `colors` et
`shapes`) : vingt et un slugs de couleur — quatorze teintes unies, sept
pastilles à motif (`blue-stripes`, `violet-ring`, `navy-orange`…) — et sept
formes (`circle square diamond triangle hexagon star heart`). Le serveur
valide les slugs, le frontend rend via `--tag-<slug>` / `-soft` / `-fill` et
`--tag-shape-<slug>` (`styles/tokens.css`). Ajouter une couleur ou une forme
demande les **deux** côtés ; `tagColorVars()` et `tagShapeClip()` font
retomber un slug inconnu sur `slate` / `circle` plutôt que de peindre une
pastille invisible. Un test (`test/tags.test.js`) tient les trois côtés
alignés : slugs servis, jetons CSS, noms FR/EN lus par les lecteurs d'écran.

**Couleur libre, mais bornée.** La seule valeur que l'utilisateur compose
est `hue-<angle>-<clarté>` : l'angle de teinte (0 à 359) et la clarté oklch,
réglés aux deux curseurs sous la palette. La clarté est bornée par le serveur
(`TAG_HUE_LIGHTNESS`, servi par `GET /tags` : 35 à 68 %, défaut 60) et le
chroma est un jeton (`--tag-hue-c`) : pas de gris, pas de pastel délavé. Le
plafond est la clarté des pastilles les plus pâles de la palette (ambre, vert
anis — contraste 2,9 et 2,8 sur blanc) ; mesuré dans Chromium, le contraste
d'une couleur libre va de 2,5 (68 %) à plus de 9 (35 %), 3,3 au moins à la
clarté par défaut. Un slug sans suffixe (`hue-<angle>`) vaut la clarté par
défaut. Un `<input type="color">` a été écarté — fenêtre système différente
sur chaque appareil, et un blanc sur blanc possible. Les angles hors gamut
sRGB sont ramenés par le navigateur. Piège de mesure : `getComputedStyle`
rend un `oklch(...)` tel quel dans Chromium — lire les pixels d'un canvas
pour obtenir du sRGB.

**Les formes sont des `clip-path`**, le rond compris : les pastilles n'ont
plus de `border-radius` (il s'intersecterait avec les autres formes), et une
ombre portée sur l'élément découpé disparaît avec lui — le halo de la fiche de
« Mes tags » est sur un parent. Retenues au prototype pour rester
reconnaissables à 12 px sur un écran ×2 ; écartés : le pentagone (un rond) et
la croix (un « plus »).

### Deux points de sécurité

- **Le tag est revérifié comme appartenant au demandeur** sur `/history/tag`.
  Sans ce contrôle, un client inscrirait l'identifiant d'un tag d'autrui dans sa
  propre conversation — inoffensif à l'affichage, mais ces tags portent des
  règles d'envoi.
- **La suppression détague avant de supprimer.** Si la seconde écriture échoue,
  il reste un tag sans conversation : inoffensif et rejouable. L'ordre inverse
  laisserait des conversations pointant vers un tag inexistant, donc absentes de
  tout filtre. Un test verrouille l'ordre.

### Écran « Mes tags »

**Une liste et une fiche**, plus une grille de cartes. La grille répétait sur
chaque carte deux blocs (étiquette, pastille d'état *Dossier dédié* /
*Sous-dossier automatique* / *Liste par défaut*, bouton, « Réinitialiser »),
sous deux bandeaux qui expliquaient dépôt et envoi avant qu'on ait choisi un
tag : dès six tags, un mur. À gauche désormais la liste (pastille, nom, nombre
de conversations, deux icônes teintes quand le tag a SA règle — le dossier
porte alors le logo de sa bibliothèque) ; à droite la fiche du tag choisi
(`settings/TagFiche.svelte`), qui pose deux questions à deux réponses : la
règle commune, ou une règle à lui. Les bandeaux sont devenus l'entrée
« Réglages communs » (`settings/TagCommonSettings.svelte`), qui ne règle que
l'interrupteur des sous-dossiers : dossier principal et destinataires
habituels servent aussi aux conversations sans tag et renvoient à leur page —
deux endroits pour éditer une même valeur, deux brouillons qui divergent.

**Un choix n'est jamais coché d'avance.** Les réponses sont des boutons
`role="radio"` dont l'état vient des réglages ENREGISTRÉS : « Dans un dossier
que je choisis » ouvre la fenêtre de navigation, et la fiche ne bascule qu'une
fois le dossier écrit. Des `<input type="radio">` natifs se cochaient au clic,
et fermer la fenêtre sans choisir laissait une fiche qui mentait.

Les écritures sont des patchs partiels (`{ storage: { tagFolders } }`,
`{ mail: { tagRecipients } }`), reconstruits depuis les valeurs enregistrées.
Le logo (`StorageLogo`) vient de `libraryKind` : SharePoint dès que le nom est
composé « Site / Bibliothèque », rien tant que le fournisseur est inconnu.

Le formulaire (`TagForm.svelte`) montre d'abord les quatorze teintes unies ;
motifs et couleur libre vivent sous « Plus de choix », ouvert d'office quand le
tag en porte déjà un. Un motif se reconnaît à son slug composé
(`blue-stripes`), la convention des jetons de `tokens.css`.

Sur téléphone (≤ 760 px), liste et fiche sont deux écrans (`detailOpen`).

### Optimisme : oui pour la pose, non pour la création

**Poser un tag** est optimiste — c'est un geste de rangement, un aller-retour
réseau s'y verrait ; en échec, la valeur précédente est **restaurée**.
**Créer ou modifier** ne l'est pas : c'est le serveur qui attribue l'id,
arbitre les doublons et le plafond (20). Un `GET /tags` en échec **laisse la
liste précédente à l'écran** plutôt que de la vider.

### États incohérents traités

| Situation | Comportement |
|---|---|
| `tagId` absent du catalogue | aucune pastille (pas de rond gris orphelin) |
| Filtre persisté sur un tag disparu | se comporte comme « Tous » |
| Aucun tag créé | la barre de filtre est masquée |

### Écarté volontairement

**Aucune suggestion automatique par IA.** Le tag pilote des envois : une erreur
de classement deviendrait une erreur de destinataire.

---

## 6. Connexions de comptes externes

Relier son compte Google ou Microsoft pour que MyBrief agisse **en son nom** :
envoyer un compte rendu, le déposer sur son Drive.

### Trois couches à ne pas confondre

| Couche | Question | Où | Se termine par |
|---|---|---|---|
| **Identité** | Qui es-tu ? | `lib/auth/` | une session (`mybrief_sess`) |
| **Connexions** | À quel compte externe a-t-on accès en ton nom ? | `lib/connections/` | un refresh token en base |
| **Actions** | Qu'en fait-on ? | `routes/actions/` | un mail parti, un fichier déposé |

Les connexions sont **indépendantes** du mode de connexion : un compte
authentifié par mot de passe peut relier un Google, un compte SSO Entra peut ne
rien relier.

⚠️ Les deux registres nomment Microsoft différemment, **volontairement** : côté
identité c'est **`entra`** (il ouvre une session), côté connexions
**`microsoft`** (il appelle Graph). Mêmes identifiants OAuth, cycles de vie
différents.

### Ce que chaque fournisseur accorde

| | Google | Microsoft |
|---|---|---|
| Scopes | `openid email` + `gmail.send` + `drive.file` + `drive.readonly` | `openid email offline_access` + `Mail.Send` + `Files.ReadWrite` + `Sites.ReadWrite.All` |
| Envoi | `gmail/v1/users/me/messages/send` (MIME) | `/me/sendMail`, ou brouillon + session au-delà de 3 Mo |
| Dépôt | session « resumable » | session d'envoi, tranches de 3 276 800 octets |
| Page suivante | jeton opaque | **URL complète** `@odata.nextLink` |
| Révocation | `oauth2.googleapis.com/revoke` | **aucune API** — l'utilisateur retire l'accès sur myaccount.microsoft.com |

**Aucune lecture de boîte mail, jamais.** Les scopes ne le permettent pas.

`drive.file` (Google) ne montre que ce que MyBrief a créé ; `Files.ReadWrite`
(Microsoft) voit tout le drive. D'où le **scope de navigation**, qui sert à
désigner un dossier existant dans une fenêtre plutôt qu'à taper un chemin :

- Google — `drive.readonly` ouvre l'arborescence **et les Drive partagés** ;
  sans lui la fenêtre répond `browse_scope_missing` (elle serait vide) ;
- Microsoft — `Files.ReadWrite` **suffit** à parcourir le OneDrive : la fenêtre
  s'ouvre, seules les bibliothèques SharePoint manquent (`sharedDrivesMissing`
  le dit). Exiger `Sites.ReadWrite.All` pour ouvrir la fenêtre — ce que faisait
  une version antérieure — la fermait pour rien aux connexions nouées avant son
  ajout.

Dans les deux cas **le dépôt n'en dépend pas** : une connexion antérieure
continue de déposer sans rien changer.

#### `Sites.ReadWrite.All` conditionne la liaison ENTIÈRE

Entra **ne fait pas de consentement partiel** : un annuaire qui n'a pas consenti
à un scope demandé refuse tout — AADSTS90094 ou AADSTS65001, « Approbation de
l'administrateur requise » —, y compris à qui ne voulait que son OneDrive. Or le
réglage par défaut d'Entra, « Laisser Microsoft gérer vos paramètres de
consentement », ne laisse l'utilisateur consentir qu'aux permissions **classées
« faible impact »** par l'administrateur, et aucune ne l'est par défaut : le
consentement administrateur n'est donc pas une éventualité, c'est un prérequis.

`Sites.ReadWrite.All` est, des trois, celle qu'un annuaire refuse le plus
souvent — elle ouvre « tous les sites SharePoint auxquels la personne a accès ».
D'où le réglage `actions.connections.sharepoint` : à faux, `connectScopes()` la
retire de la demande, et la liaison aboutit avec les deux autres. C'est le SEUL
scope retirable (`optionalScope`), et seulement chez Microsoft — les autres
conditionnent l'envoi ou le dépôt, donc les retirer ne dégraderait pas, ça
casserait.

Conséquence pour la lecture de `sharedDrivesMissing` : il ne décrit **jamais**
un tenant qui refuse le scope — chez lui, il n'existe aucune connexion vivante à
dégrader. Il ne décrit que les connexions **antérieures** à son ajout. Et il
reste FAUX quand l'installation ne demande pas le scope (`sharedDrivesOffered`) :
le message invite à reconnecter son compte, ce qui ne rendrait rien.

⚠️ Le réglage ne touche **pas** les connexions en place — leurs scopes sont
mémorisés à la liaison. Couper SharePoint ne retire ses bibliothèques à personne ;
le rétablir n'en rend à personne. Seul un « Reconnecter mon compte » applique le
réglage courant.

#### `hasScope` : ce que le fournisseur RENVOIE n'est pas ce qu'on a demandé

Google rend la forme longue demandée
(`https://www.googleapis.com/auth/drive.file`). **Entra rend souvent le nom
court** (`Files.ReadWrite`), parfois l'URI, parfois percent-encodée, sans
garantie de casse. Toute comparaison `scopes.includes(...)` rendait `driveReady`
faux pour une connexion Microsoft pourtant complète : « reconnectez votre
compte » en boucle, `storage_scope_missing` à chaque dépôt — et **aucun test ne
le voyait**, tous écrivant la forme longue.

`hasScope(granted, wanted)` (`lib/connections/providers.js`) est la **seule**
comparaison admise : forme normalisée, puis dernier segment de l'URI. Le
segment est sans ambiguïté chez les deux (`drive.file` ≠ `drive.readonly` ;
`Files.ReadWrite` ≠ `Files.ReadWrite.All`). **Ne jamais revenir à `includes`.**

#### Drive partagés Google

`drives.list` est la seule API qui les énumère, et Google ne l'ouvre qu'à
`drive` ou `drive.readonly` — d'où le passage à `drive.readonly` (le moindre des
deux). Côté dépôt, l'identifiant d'un Drive partagé **est** celui de son dossier
racine, et toutes les requêtes portent `supportsAllDrives=true`
(+ `corpora=drive` pour borner une recherche). Sans ces paramètres, l'API ne
trouve jamais le dossier visé et en **recrée un homonyme** dans Mon Drive à
chaque dépôt. Le cache de dossier porte donc aussi le `driveId`.

⚠️ **À faire dans chaque console Google Cloud** : ajouter
`https://www.googleapis.com/auth/drive.readonly` à l'écran de consentement,
sinon l'autorisation échoue au moment de relier un compte.

#### Recherche et pagination Graph

- `searchFolders` utilise `root/search(q=…)` sur la bibliothèque visée
  (apostrophe doublée), et résout le chemin absolu par `parentReference.path` ;
- une page suivante **n'est suivie que si l'URL commence par
  `https://graph.microsoft.com/`** — c'est le client qui la renvoie, et la
  suivre sans contrôle enverrait le jeton d'accès à l'hôte de son choix
  (`graph_page_token_invalid`) ;
- « Afficher plus » **ajoute** la page à la liste : au-delà de 100 (Google) ou
  200 (Graph) dossiers, le reste était invisible.

### Les deux URI de redirection

| Fournisseur | URI de retour | À déclarer |
|---|---|---|
| Google | `https://<domaine>/api/mail/google/callback` | console Google Cloud, en plus de celle du login |
| Microsoft | `https://<domaine>/oauth2/callback` | **déjà déclarée** — ne rien ajouter |

Le chemin Google dit « mail » alors que la connexion couvre aussi le Drive :
nom **historique**, déjà enregistré dans les consoles existantes. Le renommer
casserait la connexion de tout le monde pour un gain cosmétique.

Microsoft reprend l'URI du login parce que les installations on-prem ne peuvent
pas en déclarer une autre. Deux flux arrivent donc sur `/oauth2/callback` :
`routes/oauth2.js` lit le marqueur de flux du `state` **sans le consommer**
(`peekProvider`) et route ; le login Entra reste le défaut, y compris pour un
`state` inconnu.

⚠️ **Conséquence sur les cookies** : le flux Microsoft **partage** le cookie
`mybrief_oauth` du login (Google a le sien, `mybrief_oauth_connect`). Le routeur
Traefik reconnaît la requête à ce cookie précis :
`HeaderRegexp(Cookie, (^|;\s*)mybrief_oauth=)`. L'ancre finit par `=` :
`mybrief_oauth_connect` **ne matcherait pas**. Élargir la règle demanderait de
modifier cinq composes, dont celui en Traefik v2.11 où une erreur de matcher
retire le routeur *silencieusement*. `test/traefikWiring.test.js` l'épingle.

### Stockage des jetons

`userConnections` : `{ emailLower, provider, account, refreshToken, scopes[], drive, … }`.
`account` peut différer du compte MyBrief (se connecter au bureau, relier un
Gmail personnel). `scopes` enregistre ce qui a été **réellement accordé**.
`drive` mémorise le dossier résolu — invalidé si le chemin change ou si le
fournisseur répond 404.

Une connexion est supprimée **et révoquée** (quand c'est possible) à la
suppression du compte, sans attendre l'option « purger les données » : un
refresh token est un accès, pas une donnée métier.

### Ce qui compte comme une révocation

Lever `ConnectionAuthError` **supprime la connexion** : l'utilisateur doit
refaire tout le flux. D'où le tri :

| Signal | Révocation ? |
|---|---|
| `invalid_grant` au rafraîchissement | **oui** |
| `interaction_required`, `consent_required` | **oui** |
| `401` sur un appel d'API | **oui** |
| `403` de quota (`rateLimitExceeded`…) | non — transitoire |
| `403` non identifié | non — le doute profite à la connexion |
| `429`, `5xx`, réseau | non |

Un dépassement de quota traité comme une révocation infligeait un parcours OAuth
complet pour un incident de quelques minutes.

### Sur mobile

Le flux est le même, son **déclenchement** non : `POST /api/connect/mobile/ticket`
(un `fetch`, donc porteur du Bearer) mint un billet à usage unique, l'app ouvre
`/api/connect/start?ticket=…` dans le **navigateur système**, et le retour passe
par `mybrief://auth/connect`. Détails et pièges natifs : [MOBILE.md](./MOBILE.md).

### Nettoyage différé — à faire une fois la bascule éprouvée

Deux vestiges **volontaires** tant qu'un retour arrière reste envisageable :

1. **`userMailAccounts`** — plus rien n'y écrit hormis la reprise au démarrage.
   Elle reste la seule copie des refresh tokens si l'on redéployait une version
   antérieure. Avant de la retirer :
   `db.userConnections.countDocuments() >= db.userMailAccounts.countDocuments({refreshToken:{$exists:true}})`.
2. **Miroir `actions.storage.provider`** (`gdrive`/`sharepoint`) — encore écrit
   à côté de `connections.provider`. La **lecture** des valeurs historiques
   (`connectionProviderOf`) doit, elle, être **conservée** : des bases clientes
   les portent encore.

---

## 7. Actions post-réunion

Trois actions : **Envoyer par mail**, **Entreposer**, **Télécharger**.

### 7.1 Qui décide quoi

| Réglage | Qui | Où |
|---|---|---|
| Quels boutons existent (6 interrupteurs) | **Administration seule** | `appSettings{key:'actions'}` |
| Fournisseur du compte externe | **Administration seule** | idem |
| Plafond de destinataires, politique SMTP | **Administration seule** | idem |
| Dossier de dépôt | **Tag**, à défaut utilisateur, à défaut administration | `userActionSettings` → `appSettings` |
| Destinataires | **Tag**, à défaut utilisateur | `userActionSettings.mail.*` |
| Objet du mail, nom de fichier, approbation | Utilisateur, à défaut administration | `userActionSettings` |

**L'administration est un plafond, jamais un défaut** pour les interrupteurs :
le schéma ajv de `POST /api/actions/settings` n'accepte aucun champ
d'interrupteur, et le résolveur ne les lit que du document d'organisation.

### 7.2 La couche « tag » : deux règles, une mécanique

`lib/actions/resolve.js`, entre l'utilisateur et l'organisation. La règle du tag
**REMPLACE** celle du compte, elle ne s'y ajoute pas — cumuler aurait envoyé le
compte rendu d'un client aux interlocuteurs d'un autre. Le compte connecté reste
**toujours en copie**. `recipientsSource` vaut alors `'tag'`.

Une liste de tag **vide retire l'entrée** (pas de ligne fantôme) ; à l'inverse,
un dossier de tag vide est une ligne ouverte, pas encore remplie.

Deux façons pour un tag de porter un dossier, ordonnées :

1. une **destination explicite** choisie dans la fenêtre, qui peut viser une
   autre bibliothèque (un site SharePoint dédié au client) ;
2. à défaut, et si *Un sous-dossier par tag* est coché, un sous-dossier au **nom
   du tag** sous le dossier de base.

⚠️ **Une destination est un COUPLE `(bibliothèque, chemin)`, et elle existe dès
que l'un des deux est renseigné.** Choisir « ce Drive partagé, à sa racine »
donne `folder: ''` avec un `driveId` : tester la seule présence du chemin
jetait la destination **sans un mot**, et le document partait dans « Mon Drive »
sous le chemin de repli — qui existe vraiment, donc rien ne le signalait.
Partout : `folder || driveId`. Le message de confirmation **nomme la
bibliothèque** (`actionStoredIn`) ; sans elle, deux dépôts très différents
produisaient un message identique, ce qui rendait le défaut indétectable.

**Le tag n'arrive jamais par le corps de la requête** : seulement par le
`meetingId`, relu en base sous le scope du demandeur.

### 7.3 Le point de sécurité : ouvrir le destinataire

`/api/actions/email` envoyait autrefois **toujours** au compte authentifié : la
route ne pouvait pas servir de relais de spam. Ce garde-fou est levé, remplacé
par cinq compensations qui ne valent qu'**ensemble** :

**a) La destination ne vient JAMAIS de la requête d'envoi.** Règle sans
exception (`routes/actions/execute.js`) : le corps ne porte ni destinataire ni
dossier, ils viennent des réglages persistés. Trois raisons — la route est
ouverte à tout compte authentifié (relais ouvert écrivant depuis l'adresse
SPF-alignée du serveur) ; un réglage persisté est un geste délibéré et auditable ;
et **la branche multipart n'a pas d'ajv** (son corps est un flux), donc le
`removeAdditional` de Fastify qui neutralise un `to` en JSON ne s'y applique pas.

**b) Normalisation stricte.** `EMAIL_PATTERN` ne suffit pas : il n'interdit ni
la virgule, ni les chevrons — `a@b.fr,victime` ne porte qu'un `@` et le
**valide**. `lib/actions/recipients.js` rejette `, ; : < > " \ ( ) [ ]`, espaces
et caractères de contrôle. La normalisation tourne **deux fois** : à l'écriture
(la route nomme ce qu'elle refuse) et à la lecture (le résolveur filtre en
silence), donc un document écrit par une version antérieure ne contourne rien.

**c) Plafond, avec un plafond dur.** `mail.maxRecipients` (défaut 10), borné par
`MAX_RECIPIENTS_CEILING = 20` que l'administration elle-même ne peut dépasser.

**d) Le compte connecté est toujours en copie.** Sans exception. Liste vide ⇒
`to = [compte]`, `cc = []` — exactement le comportement d'avant.

**e) Piste d'audit.** `actionMailLog`, une ligne par tentative, réussie comme
échouée : `{emailLower, kind, via, from, to[], cc[], subject, ok, error,
degraded, at}`. **Jamais le contenu ni la pièce jointe** — ce sont les données
de réunion de l'utilisateur ; une piste d'audit qui les recopierait en serait une
seconde copie, conservée trois mois. TTL 90 jours, dans `OWNED_COLLECTIONS`
(tension assumée : la promesse de suppression complète prime). **Une trace qui
ne s'écrit pas ne fait jamais échouer l'envoi** — le mail est déjà parti.

### 7.4 Relais SMTP et destinataires tiers

| | Compte relié | Relais SMTP du serveur |
|---|---|---|
| `from` | la boîte de l'utilisateur | le `no-reply` de l'exploitant |
| DKIM/SPF | aligné par le fournisseur | dépend du domaine de l'exploitant |
| Rebonds | reviennent à l'utilisateur | vers `no-reply`, donc nulle part |

D'où **`actions.mail.allowSmtpExternal`, faux par défaut** : déployer ne change
rien à une installation existante.

| Valeur | Comportement quand la liste contient un tiers ET que le transport est SMTP |
|---|---|
| `false` | L'envoi **part quand même**, au seul compte connecté. 200 + `degraded: 'smtp_recipients_dropped'`, annoncé dans le toast. |
| `true` | Liste complète + `replyTo` = l'utilisateur. |

**On dégrade le destinataire, jamais l'envoi.** Ce chemin est aussi celui qu'em-
prunte un envoi dont le jeton Gmail vient d'être révoqué **en vol** : le refuser
ferait perdre le compte rendu au pire moment. Rien n'est silencieux — la
dégradation remonte dans la réponse, le toast et la piste d'audit.

### 7.5 Gabarits

Grammaire `{{clé}}`, allowlist fermée : `titre` `date` `type` `compte`
(+ alias `title` `kind` `account`). **Ce n'est pas `interpolateTemplate`** de
`src/config/templates.js`, qui enchaîne des `.replace()` et **réinterpole** —
acceptable pour un prompt qu'on écrit pour soi, inacceptable pour un objet de
mail alimenté par un titre de réunion. Cinq règles
(`lib/actions/templating.js`) :

1. **une seule passe** ;
2. ce sont les **valeurs** qu'on assainit (`\r\n`, caractères de contrôle) —
   c'est ce qui tue `Objet: X\r\nBcc: victime@…` ;
3. variable inconnue **retirée**, et **refusée à l'enregistrement**
   (`template_variable_unknown`) ;
4. résultat plafonné à 200 caractères ;
5. **l'extension n'est jamais gabaritable** — `{{titre}}.exe` donne `titre-exe.pdf`.

**L'extension suit les octets.** Le renommage a lieu dans `renamed()`, seul point
que traversent les trois transports et le dépôt. Sans cette règle, le document
factice du bouton « Tester » (du texte) se déposerait en `.pdf`.

**Duplication assumée** : le nom réel est fabriqué côté navigateur (c'est lui qui
produit les octets du PDF) et le Dockerfile de l'API ne copie pas `src/`. Deux
implémentations, un filet : `src/utils/filenameTemplate.parity.test.js`.

### 7.6 Le bouton « Tester »

`POST /api/actions/test` — **exécution réelle**, pas un aperçu. Un aperçu ne dit
pas si le jeton est valide, si le dossier existe, si le relais répond.

**La garantie qui compte** : un bouton de test qui a son propre chemin
d'exécution ne prouve rien.

```
routes/actions/execute.js ─┐
                           ├─▶ lib/actions/execute.js ─▶ lib/actions/resolve.js
routes/actions/test.js ────┘        (SEUL appelant)
```

`routes/actions/test.js` ne contient **aucune** occurrence de
`resolveActionContext`, `buildDocumentEmail`, `gmailSend`, `graphSend`,
`mailer`, `driveStore`. La garantie est vérifiée par **comportement** : le test
« anti-simulacre » change les destinataires enregistrés, relance, et assert que
le transport voit la nouvelle liste.

Le fichier déposé est **toujours un `.txt`** (le PDF est tiré de la mise en page
du navigateur, que le serveur n'a pas) et **n'est pas supprimé après coup** : un
fichier qui apparaît et disparaît est le contraire d'un diagnostic.

Un administrateur teste **toujours avec son compte** : `scope: 'admin'` ignore
sa surcharge personnelle pour n'exercer que les valeurs d'organisation, il ne
change pas d'identité. Anti-abus : `actionTestByAccount` 10/h,
`actionTestByIp` 30/h, `actionEmailByAccount` 60/h.

### 7.7 Approbation avant dépôt

Réglage **personnel**, faux par défaut. Il existe pour qui range dans un espace
**partagé**, où l'on veut relire la destination avant qu'un collègue ne découvre
le document.

Le verrou est **côté serveur** : tant que le réglage est actif et que la requête
ne porte pas `approved`, `POST /api/actions/store` répond **409
`approval_required`** avec le plan résolu et **n'écrit rien**, pas même le
sous-dossier du tag. Un **409, surtout pas un 401/403** : l'intercepteur du
frontend traite ces deux codes comme une perte de session. Côté client,
`runStoreAction` **consomme** l'accord (la relance passe
`onApprovalRequired: null`) — un serveur qui redemanderait s'arrête là au lieu
de boucler.

### 7.8 Les écrans

**Une carte = une action**, avec son état, ses réglages et son bouton de test.
Le découpage précédent (destinataires d'un côté, dossier au milieu, un
« Tester » commun à la fin) obligeait à des allers-retours pour savoir ce que le
test venait de valider. Trois conséquences non cosmétiques :

- **le compte relié est visible** (`ConnectionStatusBanner`) ; `driveReady`
  distingue « reliez » de « **RE**connectez » — une connexion héritée « Gmail
  seul » envoie des mails mais ne peut pas déposer ;
- un plafond entièrement fermé est **expliqué**, plus seulement vide ;
- **le fournisseur a sa propre carte** côté administration : il sert au mail ET
  au dépôt.

**Le test s'exécute sur les réglages ENREGISTRÉS.** Avec des modifications en
attente, le bouton devient « Enregistrer et tester l'envoi » et enchaîne les
deux. Un résultat déjà affiché est **grisé et annoté** dès que les réglages
changent, jamais effacé : il reste vrai de ce qui a été testé.

**Le diagnostic dit la PROVENANCE de chaque valeur** (`recipientsSource`,
`subjectSource`, `folderSource`). « Ce dossier vient de VOS réglages » et « il
vient de l'organisation » ne se corrigent pas au même endroit ; un simple
vert/rouge obligeait à ouvrir les journaux.

**Le brouillon survit au changement d'onglet** (`actionDraft`, singleton de
module) — et il est **purgé à la déconnexion**, sinon les destinataires du compte
précédent s'afficheraient, et seraient enregistrables, sous le compte suivant.

**Côté réunion, les actions sont dans `PostActions.svelte`** : un seul bouton
« Partager » et son mini-menu, sur ordinateur comme sur téléphone, dans la barre
des documents (`DocumentBar.svelte`). Les trois icônes de l'ordinateur ont été
écartées : nommées au survol seulement, elles envoyaient un mail d'un clic sans
dire à qui — le menu nomme chaque entrée et dit où part le document (le tag, ou
vos réglages), au prix d'un clic. Le menu est né sur téléphone (pourquoi cette
forme : [MOBILE.md](./MOBILE.md#fin-de-réunion-sur-téléphone)). Deux règles
valent partout :

- **une action à la fois, le PDF compris** : le verrou d'App NOMME l'action en
  cours, que le bouton affiche. Le téléchargement du PDF en était exclu — un
  double clic fabriquait deux PDF et, en natif, ouvrait une seconde feuille de
  partage que le système refuse ;
- **le titre vient de la réunion COURANTE** (`currentMeetingId`), pas de la
  sélection d'historique : celle-ci reste vide juste après une génération, et
  l'objet du mail comme le nom des fichiers partaient génériques tant que la
  réunion n'était pas rouverte depuis la liste. Même résolution que le tag.

### 7.9 « Rédiger dans ma messagerie » (téléphone)

Une entrée du menu « Partager », sur téléphone seulement — masquée en CSS
sur ordinateur, où un `mailto:` de 20 000 caractères dépasse ce que Windows
transmet à la messagerie : un `mailto:` qui ouvre la messagerie du téléphone,
document dans le corps (`utils/mailDraft.js`). L'envoi automatique part tel quel ; ici l'utilisateur
relit, ajoute l'interlocuteur de passage, écrit deux mots — et c'est SA
messagerie qui envoie.

- **Aucun garde-fou du §7.3 n'est contourné** : ils protègent le relais du
  serveur. Ici le serveur n'envoie rien, et l'utilisateur voit chaque
  destinataire avant d'envoyer. Rien n'est écrit dans `actionMailLog`, qui
  trace les envois du serveur.
- **Destinataires pré-remplis par la règle de l'envoi automatique** : la liste
  du tag, sinon la liste par défaut. La règle de `resolveRecipients` est
  REPRISE côté client (`draftRecipients`) — duplication assumée : elle ne
  décide d'aucun envoi, seulement d'un brouillon relu. Le compte n'est pas mis
  en copie : c'est lui qui écrit. Réglages pas encore chargés ⇒ aucun
  destinataire, jamais de faux.
- **L'interrupteur « Envoyer par mail » de l'administration s'applique** :
  fermer l'envoi d'un document par mail ferme les deux chemins. Sans lui, une
  organisation qui ferme l'envoi de la transcription la verrait partir quand
  même, d'un geste. En revanche, pas besoin de moyen d'envoi côté serveur —
  c'est même le seul envoi possible d'une installation sans relais ni compte
  relié.
- **Objet : celui de l'envoi automatique** — gabarit personnel, sinon celui de
  l'organisation (§7.5), sinon l'objet intégré de `mailer.js`. Le serveur ne
  voit pas ce mail : le gabarit se développe côté client
  (`renderSubjectTemplate`, réplique de `renderActionTemplate` sous le filet
  de `filenameTemplate.parity.test.js`). Sans lui, une organisation qui impose
  un format d'objet le verrait contourné d'un geste.
- **Corps en texte, plafonné à 20 000 caractères** : titres et listes gardés,
  pas de pièce jointe (un `mailto:` n'en porte pas). Au-delà, coupé avec une
  note, et un toast le dit.

### 7.10 « Votre résumé est prêt » — après le premier résumé

Une fenêtre (`components/AfterSummaryDialog.svelte`) propose, en un geste, de
ranger la réunion dans un tag, d'envoyer le résumé par mail et de l'entreposer.
Elle suit le PREMIER résumé d'une réunion seulement (`!hasGeneratedSummary` au
lancement de la génération) : une régénération n'est pas une fin de réunion.
Mêmes actions que « Partager » (mêmes fonctions d'App, même verrou, mêmes
notifications), même liste de ce qui est ouvert (`stores/actionAvailability.js`,
extrait d'App pour être partagé).

- **Ouverte quand la réunion est relue**, pas à la réponse de `/resume`
  (`stores/afterSummary.js`) : le titre généré en tâche de fond fait l'objet du
  mail et le nom du fichier, et un tag posé pendant l'enregistrement n'est
  visible qu'après la relecture de l'historique. Ouverte plus tôt, elle
  proposait de ranger une réunion déjà rangée et envoyait « Résumé de votre
  réunion myBrief ». Réglages relus aussi : ils ont pu changer sur un autre poste.
- **Choisir, puis lancer.** Les cartes se cochent ; le bouton principal nomme
  ce qui va partir (« Ranger, envoyer et entreposer »). Écarté : une action par
  clic — avec un tag qui change les destinataires, cliquer « Envoyer » avant
  d'avoir rangé partait à la liste d'avant.
- **Le tag d'abord, et seul s'il échoue** : le serveur relit le tag en base
  (§7.2). Un tag non posé ⇒ ni mail ni dépôt, sinon ils partiraient vers la
  liste et le dossier d'avant. Le tag n'est posé qu'au lancement — « Plus tard »
  ne range rien.
- **Ce qui est annoncé suit le tag CHOISI**, avant qu'il soit posé : aperçu de
  `resolveRecipients` / `resolveFolder` côté client (`utils/afterSummary.js`),
  dans le même ordre. Le dossier de l'organisation n'est pas servi au client :
  l'aperçu le nomme sans chemin plutôt que d'en inventer un.
- **Ajouter un destinataire = l'ENREGISTRER** (§7.3 : jamais de destinataire
  dans la requête d'envoi). Tag choisi ⇒ liste du tag, même s'il n'en avait
  pas : elle naît alors de la liste par défaut affichée plus l'adresse. Écarté :
  écrire dans la liste par défaut — l'adresse d'un client y recevrait les
  comptes rendus de tous les autres. La note sous le champ dit où l'adresse va.
  Une adresse ajoutée dans la fenêtre s'y retire ; une liste de tag née ici et
  revenue à la liste par défaut est supprimée plutôt que gardée en copie figée.
- **« Ne plus me proposer »** : `afterSummary.offer` dans les réglages
  d'actions du compte (`userActionSettings`), vrai par défaut — seul un `false`
  explicite l'éteint. Rallumé par l'interrupteur « Après le premier résumé »
  des deux pages Actions de « Ma configuration ». Sur le compte et non dans le
  navigateur : le choix suit l'utilisateur sur son téléphone.
- **Notifications** : celles de « Partager », plus le rangement et une
  notification d'attente le temps du PDF. Le toast d'envoi cite désormais les
  destinataires réels (`to`, rendu par `/actions/email`) et non plus le compte,
  qui n'est qu'en copie.
- **Piège Svelte 4 payé ici** : écrire un store PENDANT les `$:` d'un composant
  qui y est abonné perd l'invalidation (le drapeau est remis à zéro en fin de
  passe). La fenêtre retirait sa demande dans un `$:` quand la réunion affichée
  changeait — `request` gardait l'ancienne valeur et la fenêtre se rouvrait au
  retour. Le retrait passe par `tick()`.

---

## 8. Infographie de compte rendu

Une image portrait qui résume la réunion, générée en tâche de fond après
`/resume`.

**Pipeline** : un réécrivain `gpt-5.4` transforme les matériaux de la réunion
(transcription, actions visibles, notes) en consigne d'image, puis un modèle
d'image la dessine. Le réécrivain est passé de `gpt-5-mini` à `gpt-5.4`, le
défaut du résumé, le 2026-09-15 : avec la direction artistique ci-dessous, c'est
lui qui décide de la forme, et `gpt-5-mini` suivait mal une consigne structurée —
mesuré sur le résumé (`lib/summaryModels.js`). Effort de raisonnement `medium`,
explicite ; `OPENAI_MODEL_INFOGRAPHIC` change le modèle, l'écran
d'administration non.

**Deux modèles, deux natures de réglage.** Celui qui ÉCRIT le prompt reste un
réglage de déploiement (ci-dessus) ; celui qui DESSINE est passé dans
Administration → IA le 2026-09-16 (`lib/infographicModels.js`). Il était fixe
dans le code jusque-là, au motif qu'« en faire un réglage ajouterait deux pannes
possibles sans besoin exprimé ». Ce qui a changé : la génération 2.5 introduit
des **paliers** là où il n'y avait qu'un modèle, et l'arbitrage
rapidité/coût/accès de l'organisation n'est pas le nôtre. Défaut
`gpt-image-2.5-flare` — annoncé par OpenAI meilleur que `gpt-image-2` pour
environ moitié moins de latence, **non mesuré depuis ce dépôt** (clé et
facturation de l'organisation) : à juger en recette, en régénérant une réunion
connue. C'est précisément pourquoi `gpt-image-2` reste proposé — mesuré, lui
(lettrage sans coquille, composition entière dans le cadre, les deux défauts de
`gpt-image-1` que des règles de prompt compensaient mal, **retirées depuis**) —,
et pourquoi le revirement se fait depuis l'écran, sans déploiement. Liste fermée
côté écran : `/images/generations` accepterait n'importe quelle chaîne et
n'échouerait qu'en **tâche de fond**, l'utilisateur voyant `error` et
l'administrateur rien. `OPENAI_MODEL_INFOGRAPHIC_IMAGE` reste la porte de sortie
vers un palier non listé (`gpt-image-2.5-sunburst`, écarté faute de mesure qui le
départage de Flare). Le **format**, lui, reste fixe : la page portrait est un
choix de produit, et la direction artistique ci-dessous est écrite pour elle.

**Direction artistique** (2026-09-15) : constat sur les images produites —
contenu juste, forme pauvre. Le réécrivain recevait des consignes de maquette
génériques (« palette harmonieuse », « hiérarchie forte ») et rendait une liste
de zones remplies de phrases, que le modèle d'image dessinait en document à
cases. Ses règles (`INFOGRAPHIC_WRITER_RULES`) décrivent désormais ce qu'un
directeur artistique exigerait : l'architecture de la page (bandeau, **un**
élément héros, grille de cartes, tableau des actions, pied qui ferme), la
traduction de chaque donnée en forme graphique (grand nombre, barres, frise,
coche, badge), une palette **nommée en hexadécimal** — un nom de couleur se rend
au hasard, un code se rend tel quel —, trois tailles de texte, un budget de 150
à 250 mots, et les textes de l'image **entre guillemets** pour séparer consigne
et lettrage. Ce budget n'est pas la règle de densité retirée le 2026-09-02, qui
compensait les pieds coupés de `gpt-image-1` : c'est une règle de lisibilité,
qui ne touche que le réécrivain, jamais le prompt d'image. Non re-mesurée sur
génération réelle depuis le dépôt : à juger en recette, en régénérant une
réunion connue. Le format reste 1024 × 1536, « A4 portrait » côté produit.

**Style graphique de l'installation** (Administration → IA, facultatif, vide par
défaut) : un texte libre — couleurs, ton des schémas, mention à faire figurer —
joint à la **demande** envoyée au réécrivain, où une règle de préséance le fait
passer devant le libre choix de palette qu'on lui accorde par ailleurs. Il vit
dans la demande et non dans les règles du réécrivain pour deux raisons : il
change d'un client à l'autre, et c'est ce qui le fait survivre au repli
(réécrivain en panne → les matériaux bruts partent quand même au modèle
d'image). Il est posé **en phrase** et non dans un bloc étiqueté : un bloc en
tête se fait recopier tel quel sur l'image, leçon déjà payée avec `#ACTIONS`.
Vide, la demande est exactement celle d'avant ce réglage — imposer un habillage
par défaut avait été explicitement rejeté, ce qui ne l'était pas, c'est qu'une
organisation impose le sien.

**Langue de l'image** (2026-10-21) : celle de l'interface, comme le compte
rendu — et non plus « la langue des matériaux », que suivaient les règles du
réécrivain : une réunion tenue en anglais sortait en anglais sous une interface
française, et l'inverse. La langue voyage dans la **demande**, en phrase, pour
la raison du style ci-dessus : le repli doit la respecter. Une **régénération**
prend la langue sélectionnée au clic, pas celle du résumé ; à défaut (ancien
client), celle stockée avec la réunion. Repli `fr`, code normalisé
(`normalizeLang`) avant d'entrer dans la demande.

**Qui peut en générer** (2026-09-25) : l'installation doit la proposer
(Administration → IA) ET un groupe du compte en donner le droit, cumulatif
d'un groupe à l'autre ; « Défaut » le donne au départ. Le pourquoi, les portes
et le 409 sont dans AUTHENTIFICATION.md §3.

**L'image vit dans une collection dédiée** (`infographics`) : `/history` renvoie
les documents `resume` entiers, y embarquer plusieurs Mo de base64 ferait peser
chaque réunion illustrée sur chaque chargement d'historique. Le document
`resume` ne porte que `infographic.status`.

**Préséance des deux sources** : l'historique **amorce** l'état, `GET
/infographic` donne l'état frais. Un instantané d'historique daté ne rétrograde
jamais un cycle en cours — sinon un rechargement de la liste rejouerait
l'animation sur une image déjà affichée. `stamp` (l'`updatedAt` écrit à chaque
changement d'état) distingue « instantané daté » de « nouvelle génération ».

**Polling borné** : le serveur règle le drapeau dans **tous** les cas de sortie
(`ready` / `error`, jamais `pending` à demeure). Le plafond ne couvre que le cas
du serveur disparu en route.

⚠️ L'affichage passe **obligatoirement par un portal** (montage à la racine), et
l'organisation OpenAI doit être **vérifiée** pour appeler le modèle d'image.

---

## 9. Administration

Dix sections, une barre d'enregistrement unique par section, et des composants
partagés (`ui/SettingsCard`, `ui/StatusBadge`, `ui/ToggleSwitch`, `ui/GroupChip`).

| Section | Contenu |
|---|---|
| **Utilisateurs** | comptes, rôles, groupes (puces, cases de la fiche, filtre), réinitialisation, désactivation, suppression |
| **Groupes** | groupes d'utilisateurs : colonne des comptes à glisser sur les cartes (ou sélectionner, au clavier et au doigt), cartes (initiales des membres, effectif, quota, droits), membres (ajout par recherche, retrait), groupe par défaut, quota de minutes de réunion par mois, droit aux infographies — cf. AUTHENTIFICATION.md §3 |
| **Crédit de temps** | minutes restantes de chaque compte ce mois-ci, dans l'ordre d'urgence ; la page « Mes statistiques » d'un collègue (§9.2) |
| **Authentification** | fournisseurs d'identité, domaines autorisés, modes de la page de connexion |
| **IA** | clé OpenAI (vérifiée avant enregistrement), modèle de résumé, modèle de transcription, deux boutons **Tester** réels, infographie (interrupteur général, au-dessus des droits de groupe, + style graphique facultatif) |
| **Actions** | interrupteurs, fournisseur, plafonds, politique SMTP, gabarits |
| **Templates** | modèles d'organisation + les 6 défauts éditables + contexte d'organisation |
| **Configuration** | logo, phrase d'accueil, couleurs, vocabulaire de l'organisation, corrections automatiques de la transcription (cf. TRANSCRIPTION.md §3) |
| **MyBrain** | adresse et clé du cerveau partagé (vérifiées), qui lui envoie ses réunions — cf. §12 |
| **Statistiques** | usage réel de l'installation, dépenses d'IA estimées et tarifs actualisables (§9.2) |

Règle transverse : **l'écran n'envoie que les champs modifiés**. `POST
/api/admin/settings/ai` accepte les deux champs séparément — absent = inchangé,
vide = retour au défaut. Sans cette distinction, changer de modèle effacerait la
clé OpenAI de l'installation.

### 9.1 Branding

Logo, phrase d'accueil et **deux couleurs**, servis à tout le monde par la sonde
publique `GET /api/auth/config` — elles habillent aussi l'**écran de connexion**,
avant toute identité.

Les couleurs **surchargent les variables CSS** sur `<html>` : `tokens.css` et
`style.css` gardent leurs valeurs par défaut, retirer la surcharge suffit à
revenir aux oranges d'origine. Les deux rôles ne sont pas symétriques :

- **PRIMAIRE = accents** (survol, texte, halos), déclinaisons dérivées par
  assombrissement RGB ;
- **SECONDAIRE = surfaces** (fonds de cartes, fonds d'onglets, badges), leurs
  bordures et la teinte des neutres — tout part de `--brand-secondary-rgb`, donc
  **une** surcharge suffit.

⚠️ **Plus jamais de littéral orange dans le code.** Les couleurs sémantiques
(succès, erreur) et les couleurs de tags restent **hors marque** : elles portent
un sens, pas une identité. Recette : canvas 1×1 pour lire la couleur rendue.

### 9.2 Statistiques d'usage

`GET /api/admin/stats?days=` (liste fermée : 7, 30, 90, 365, 0), ou
`from`/`to` (`AAAA-MM-JJ`, jours entiers inclus, **heure de Paris** comme le
crédit de temps), plus `group`, `user`, `template`.

**Le périmètre s'applique avant tout calcul** (`applyScope`, lib/stats.js) :
indicateurs, séries, tableau des comptes, période précédente et dépenses parlent
de la même population. Filtrer la courbe sans les tuiles ferait se contredire
deux cartes. Les **options** de chaque filtre (`filters.options`) ne dépendent,
elles, d'aucun filtre — choisir un groupe ne doit pas faire disparaître les
autres. Un groupe inconnu (supprimé entre-temps) rend une population vide, pas
une erreur. Les réunions d'un compte supprimé comptent pour toute
l'organisation, et sortent dès qu'un filtre de groupe ou de compte est posé :
on ne sait plus à qui elles étaient.

**Période précédente** : même longueur, juste avant (`previous`). « Tout » n'en
a pas. Le taux d'adoption s'y compare en **points**, et se rapporte aux comptes
ouverts *à la fin* de cette période, pas à ceux créés depuis.

**Statut d'adoption** par compte (`adoptionStatus`) : régulier si des réunions
au moins une semaine ISO sur deux (`REGULAR_SHARE`), occasionnel, en sommeil
(rien sur la période, déjà utilisé), jamais démarré. Les semaines se comptent
**depuis la création du compte** quand elle tombe dans la période — sans quoi un
compte ouvert il y a dix jours ne serait jamais « régulier » sur un trimestre.
Sur une période passée, un compte est jugé tel qu'il était à sa fin : créé
après, il n'existe pas ; démarré après, il n'avait « jamais démarré ». Le
tableau par utilisateur (`accounts`) remplace « Comptes les moins actifs », huit
lignes fixes : trié ou filtré par statut, il répond à la même question sans
s'arrêter au huitième.

**Une durée absente n'est pas une durée nulle.** La durée n'existe en base que
depuis le 2026-08-18 : ces réunions comptent dans le nombre, et disparaissent
des sommes, moyennes et médiane. `coverage.withDuration` dit sur combien de
réunions la moyenne porte. Deux états distincts à l'écran — *aucune* réunion
mesurée (tuiles « — », figures vides, bandeau explicatif) et *une partie*
mesurée (« Sur 12 réunions sur 40 ») : ils affichaient auparavant « 0 min » et
une aire plate, ce qui se lisait « personne n'a enregistré » alors que
84 réunions étaient là.

**Les durées anciennes se rattrapent** par un chemin inattendu : le chronomètre
n'était pas écrit en base, mais il était passé au prompt, et les gabarits
l'impriment en toutes lettres (`*Auteur : … — Durée : 01:23:45*`).
`backfillDurationsFromSummaries` va l'y relire, par lots de 500 par démarrage.
Le motif **exige le mot « Durée »** : sans lui, « rendez-vous à 14:30:00 »
deviendrait une réunion de quatorze heures. `meetingDurationSource`
(`timer` / `resume` / `unknown`) sert de marqueur pour ne pas relire deux fois.

**Projection stricte = confidentialité.** `MEETING_FIELDS` ne demande ni
`transcription`, ni `resume`, ni le contenu des `versions` (leur seule date,
pour les dépenses d'IA) : un administrateur voit des **volumes**, jamais le
texte des réunions de ses collègues. Un test le verrouille.
Ajouter un champ à cette projection est une décision de confidentialité, pas un
détail de performance. `transcriptionChars` existe pour ça.

**Le calcul est en JavaScript, pas en `$aggregate`** : les dates sont des chaînes
ISO avec deux champs concurrents, le **fake Mongo des tests n'implémente pas
`aggregate`**, et le volume est de quelques milliers de réunions. Le point de
bascule serait un pipeline **et** l'extension du fake — les deux.

**Graphiques maison** (SVG/HTML, ~200 Ko de dépendance évités). Palette validée
avant écriture (clarté, chroma, protanopie/deutéranopie, contraste) ; les pas
intermédiaires passent sous 3:1, d'où la valeur en clair sur chaque ligne.
**Jamais deux axes verticaux sur un même cadre** — un double axe inventerait une
corrélation absente. Chaque carte porte son **jumeau tableau** : une infobulle
n'est jamais le seul accès à une valeur.

**Étendre** : une mesure → `computeUsageStats` (+ son test) puis `StatsTab`, et
`stats/pdfReport.js` si elle doit figurer au rapport ; une période →
`RANGE_DAYS`, l'`enum` d'`adminStatsQuery`, `RANGES` de `stats/StatsFilters` et
`uiText.js` (FR + EN) — les quatre, sinon le serveur répond 400. Ce que l'écran
et le rapport lisent tous deux (écarts, périmètre en mots, tri, CSV) vit dans
`stats/statsView.js` : un rapport qui dirait « +12 % » là où l'écran dit
« +11 % » ferait douter des deux.

#### Rapport PDF et export CSV

**Le PDF passe par le moteur du compte rendu** (`htmlToPdfBlob`, utils/pdf.js) :
le navigateur met en page, jsPDF écrit du **texte** — une dizaine de pages
pèsent quelques dizaines de Ko, et les chiffres se recopient. Une capture
d'écran des cartes aurait donné des images floues et lourdes. Conséquence sur
le dessin : le moteur ne connaît que texte, fonds et filets rectangulaires —
graphiques en blocs, pas d'arrondi, pas d'espacement de lettres, graisses 400
et 700 seulement.

**`data-pdf-keep`** (measure.js) rend un élément insécable : un atome invisible
de sa hauteur, que la pagination fond en une ligne. Piège payé à la mise au
point : un titre DANS un bloc est « à garder avec la suite » ; propagé au bloc,
il enchaînait tous les blocs titrés et chaque page n'en montrait qu'un
(`lineGroups` l'ignore désormais pour une ligne insécable). Le tableau par
utilisateur est découpé en tranches d'une page (`ROWS_PER_SLICE`), chacune
insécable avec son en-tête : à la page 3, on sait encore ce que dit la cinquième
colonne. D'où des lignes de hauteur **fixe** (chaînes raccourcies en amont) :
une tranche doit tenir à coup sûr dans une page.

**CSV** : `;` en français (Excel réglé en français), `,` en anglais, BOM UTF-8,
durées en minutes et dates ISO — des valeurs qu'un tableur trie et additionne.

#### Dépenses d'IA estimées

`costs`, dans la même réponse que l'usage et sur la même période : dépense par
mois, coût d'une heure, répartition par poste, comparaison des modèles
proposés (`services/api/lib/costs/`, carte `stats/CostCard.svelte`).

**Une estimation, pas une facture — et elle le dit.** Les jetons réellement
facturés ne sont connus que dans la réponse d'OpenAI, que myBrief ne garde pas ;
l'API de coûts d'OpenAI, elle, exige une clé d'administration de
l'organisation, que les installations n'ont pas. Le calcul multiplie donc des
VOLUMES MESURÉS (durées, longueur des transcriptions, versions de compte rendu,
infographies) par des HYPOTHÈSES NOMMÉES (`assumptions.js` : jetons par
caractère, jetons produits, rythme de la détection d'actions), servies à
l'écran. Les tailles de consigne du serveur y sont relues au démarrage : elles
suivent les prompts. Le reste est à recaler sur une vraie facture.

**Trois horloges.** La transcription et la détection suivent la date de la
réunion, comme les statistiques ; un compte rendu se date à SA génération
(`versions.generatedAt` — régénérer en septembre une réunion de juin est une
dépense de septembre) ; une infographie à son dessin. D'où trois champs de plus
dans `MEETING_FIELDS` : des dates et un état, jamais `versions.html` ni la
consigne — le test de confidentialité le vérifie, et le fake Mongo projette
désormais dans les tableaux comme le vrai (`'versions.generatedAt'` rendait
`undefined`, donc zéro version).

**Les tarifs : le plus récent gagne.** `catalog.js` livre le dernier relevé
(en dollars, la devise de facturation) ; « Actualiser les tarifs » le recouvre
modèle par modèle dans `appSettings{key:'pricing'}`, et un catalogue livré
plus tard recouvre à son tour une actualisation plus ancienne. Jamais de relevé
automatique : l'affichage ne dépend d'aucun site tiers. Sources :
- **LiteLLM** (JSON public) plutôt que la page de tarifs d'OpenAI : pas d'API
  chez OpenAI, et gratter une page web casse au premier changement de mise en
  page. LiteLLM couvre aussi Azure, Mistral, Anthropic… — un fournisseur ajouté
  demain y est probablement déjà ;
- **taux de référence de la BCE**, et le jeu public currency-api (jsDelivr) en
  secours, qu'un filtrage sortant laisse plus souvent passer.
Ce qui vient de l'extérieur passe par `sanitizePrice`/`sanitizeFx` : une grille
corrompue ne peut qu'échouer à actualiser.

**Un modèle sans tarif n'est jamais compté pour zéro** : son tirage sort du
total, et la carte affiche « Tarif inconnu ». Un modèle imposé par
l'environnement hors liste est demandé à l'actualisation comme les autres.

**Défaut connu** : une réunion en visio transcrit DEUX flux (micro + son de la
visio), que la base ne distingue pas — sa transcription est sous-estimée
jusqu'à moitié. Le corriger demande de persister le type de réunion.

**Étendre** : un modèle → `catalog.js` ; un poste de dépense (autre API, autre
usage) → une entrée de `COST_LINES` qui dit ce qu'elle tire et sur quel
modèle ; une facturation d'un genre nouveau → un compteur dans `METERS` et son
champ dans `PRICE_FIELDS` ; une source de prix → un module de `sources/` au
contrat `fetchPrices`/`fetchRate`, ajouté à `createPriceSources`.

**Le prix au moment de choisir (onglet IA).** `GET /settings/ai` sert, avec
les réglages, le prix d'une heure de chaque modèle de transcription proposé
(`referencePrices`, mêmes tarifs et même nomenclature que la carte, sur la
réunion type : aucune réunion lue) ; `ModelPicker` l'affiche en niveau « € »
et en euros. Le niveau est RELATIF aux modèles proposés et logarithmique : le
moins cher vaut « € », chaque € de plus ≈ un prix doublé
(`src/utils/modelPrices.js`). **Écartés** : une échelle linéaire, qui écrasait
0,16 € et 0,32 € l'heure au même niveau face à 0,90 € ; un simple rang, qui
mettait deux niveaux entre 0,24 € et 0,32 €. Des tarifs illisibles rendent
`prices: null` : l'écran montre les modèles sans prix, le réglage reste
possible. `referencePrices` vaut pour tout poste qui se choisit : montrer le
prix des modèles de rédaction ou d'image, c'est passer leurs options au même
composant.

#### « Mes statistiques » et le crédit de temps

Pour TOUS les comptes : un panneau (`StatsPanel`, `#my-stats`) ouvert par
« Voir mes statistiques », dans le bloc « Ce mois-ci » du menu de compte. Son usage
(`GET /api/stats/me?range=month|90|365|all`) et la jauge de son crédit — et
RIEN d'autre, administrateur compris. Le crédit de chacun est dans
l'administration, section « Crédit de temps » (`admin/CreditsTab`,
`GET /api/admin/stats/credits`), avec la page d'un collègue
(`POST /api/admin/stats/account`). Il était d'abord un onglet « Équipe » de
« Mes statistiques » réservé aux administrateurs : une page « Mes … » qui
montre les autres a été refusée à la recette.

**Le curseur est la poignée au bout de l'arc, le rythme un triangle HORS de
l'arc.** Le rythme régulier était d'abord un trait sombre en travers de
l'arc : on l'a pris pour l'aiguille, « bloquée » — il ne bouge qu'avec la date.
L'arc se remplit depuis zéro à l'ouverture (`tweened`) : la poignée se voit
bouger, même quand une minute sur cinq heures ne la déplace que d'un pixel.

**Un seul calcul pour soi et pour l'administrateur** (`lib/personalStats.js`) :
les deux pages ne peuvent pas diverger. `computeUsageStats` restreint par
`ownerFilter`, avec la même projection stricte que ci-dessus — et l'adresse
d'un collègue dans le CORPS : en GET, elle finissait dans les journaux d'accès.

**« Ce mois » est le mois CIVIL du quota**, pas trente jours glissants
(`since` de `computeUsageStats`) : la jauge et les tuiles sous elle parlent du
même mois. Les autres périodes restent glissantes, la jauge ne bouge pas.

**La jauge est un réservoir** : elle se remplit de ce qui RESTE, comme l'anneau
du rail replié. Alternative écartée : un compteur du consommé, qui monte —
« combien il me reste » se lisait à l'envers. Quatre tons hors marque
(`--credit-*`, `utils/creditTone.js`), partagés avec l'anneau de l'avatar, « Ce
mois-ci » et les anneaux de « Crédit de temps » ; l'ancien compteur n'en avait que trois (normal, moins
d'un cinquième, atteint), et son normal était l'orange de marque — qui se lisait
déjà comme un avertissement.

**L'alerte de rythme part à 15 POINTS d'avance** sur la consommation en ligne
droite (`PACE_ALERT_THRESHOLD`, `creditPace`). Un écart relatif criait au loup
le 2 du mois pour une réunion d'une heure. La projection extrapole le rythme du
mois écoulé — elle ne connaît pas l'agenda.

**Le jour par jour (`dailyUsage`) suit les règles du compteur** : réunions
supprimées comprises (leur trace), une réunion comptée une fois, au jour de son
début à l'heure de Paris. La somme des jours vaut toujours `usedSeconds` (un
test le verrouille) ; les jours du mois se comptent sur le calendrier — le
passage à l'heure d'hiver fait un jour de 25 h. La tuile « Temps enregistré »,
lue dans l'historique, peut donc être plus courte que le consommé : l'écran
nomme l'écart (`deletedSeconds`).

**Sa propre page suit le compteur en direct** (`stores/quota.js` +
`liveElapsedStore`) : jauge et graphique déduisent la réunion en cours. La vue
d'un collègue reste figée sur la réponse du serveur.

**Le résumé du mois vit dans le menu de compte** (`stats/AccountMonth.svelte`),
pas dans une carte de colonne. Les statistiques avaient trois portes — la carte
« Temps de réunion » du bas de la colonne, une icône muette à côté de la roue
crantée, une ligne du menu de compte —, et aucune ne disait rien avant d'ouvrir
une page plein écran ; la carte prenait 75 px en permanence. La carte est
devenue l'anneau de l'avatar et une ligne sous le nom (la capsule de compte), et
le menu montre le crédit, le rythme et trois chiffres, avec le lien vers la page.
Pistes écartées (maquettes d'octobre 2026) : une barre en haut à droite comme
sur téléphone — une bande de plus sur chaque écran — et un rail d'icônes à la
Teams — une refonte du layout pour le même gain. Le crédit vient de `quotaNow`
(là et vivant, la barre s'affiche sans attendre) ; rythme et chiffres de
`/stats/me`, relu à chaque ouverture, gardé par compte le temps de la relecture.

**« Crédit de temps » se calcule en une lecture** (`lib/teamCredits.js`) plutôt qu'un
`statusFor` par compte (deux lectures chacun) : la période de toute
l'installation, les groupes résolus en mémoire (`groupsOfUser`), l'ordre
d'urgence calculé au serveur.

### 9.3 Utilisateurs

**Une ligne par compte, et seulement les exceptions.** Les cartes de 141 px
(rangée de groupes comprise) montraient quatre comptes par écran, un seul sur
téléphone ; la liste en montre seize (de cinq à neuf sur téléphone, selon
qu'il y a des groupes). Les libellés vivent une fois dans l'en-tête, les pastilles ne
disent que l'exception — **Admin**, **Désactivé**, jamais « Utilisateur ».
« SSO uniquement » est passé dans la fiche : sur une installation SSO, il
aurait été sur toutes les lignes, c'est-à-dire qu'il n'aurait rien dit.

**La ligne ouvre la fiche**, qui porte réinitialisation et suppression : le
téléphone n'a pas de survol, les raccourcis de survol ne peuvent pas être le
seul accès. Grille à colonnes fixes (`--au-cols`) plutôt qu'un `<table>` : la
bascule en deux lignes — requête de **conteneur**, pas d'écran, la barre
latérale prenant une largeur variable — réordonne les cellules, ce qu'une
table ne fait pas sans perdre sa sémantique dans Safari.

**La colonne Groupes n'existe qu'à partir de deux groupes** (même règle que le
filtre) : seule, elle répéterait « Défaut » partout. Ses puces sont **en
ligne**, pas en flex : rétrécies ensemble, elles tombaient toutes à « D… » ;
en ligne, `text-overflow` masque d'un bloc celles qui débordent. « Défaut »
passe en dernier, c'est lui qui cède. Six colonnes réclament plus de largeur :
deux niveaux sous 680 px, trois sous 560. Les chevauchements se contrôlent à
la capture (cellule qui passe sous l'interrupteur) — `nowrap` donne à une
cellule placée par `justify-self` sa ligne entière pour largeur minimale.

**Piège** : un `position: sticky` s'arrête au bord du *padding* de la zone
qui défile, pas à son bord. L'en-tête remonte de `--ap-body-pad-top`
(AdminPanel) ; sans quoi les lignes défilaient visibles au-dessus de lui.

---

### 9.4 Pastilles de configuration

Une pastille dit « il reste quelque chose à régler ici », sur la section qui le
corrige (colonne de gauche, déroulant mobile) et sur le bouton qui ouvre le
panneau (roue crantée, bouclier, bouton menu mobile). Le serveur rend des
constats `{ section, code, level, vars }` (`lib/configChecks.js`), l'écran les
met en phrases (`uiText.configChecks`).

- **Deux périmètres.** L'organisation (`GET /api/admin/config-checks`) n'est
  montrée qu'aux administrateurs ; le compte (`GET /api/config-checks`) à son
  titulaire. Écarté : une vue « tous les comptes » pour l'administrateur — il
  faudrait sonder le Drive de chacun avec ses jetons, et l'administrateur ne peut
  de toute façon ni relier le compte d'un collègue ni choisir ses dossiers.
- **Vérifications réelles, mémorisées.** « Une clé est enregistrée » ne dit pas
  qu'elle marche : clé OpenAI, connexion myBrain, jeton du compte relié et chaque
  dossier sont essayés. La clé de la mémoire est l'EMPREINTE de ce qui est
  vérifié (clé, jeton, chemins) : une correction enregistrée repart à neuf sans
  qu'aucune écriture ait à invalider quoi que ce soit. Succès gardé 10 min, échec
  2 min — c'est l'échec qu'on attend de voir disparaître après une correction
  faite hors de l'app. Budget de 6 s par sonde : au-delà, pas de constat dans
  cette réponse, la sonde finit en arrière-plan pour la suivante.
- **Un doute ne vaut pas une pastille.** 5xx, délai, limitation : rien. Seul un
  404 fait conclure à une bibliothèque disparue (un 403 est une limitation chez
  Google comme chez Graph). Chez OpenAI, seul 401 condamne la clé : `/models`
  répond 403 à une clé à droits restreints qui transcrit très bien.
- **Un compte qui n'a réglé aucun dossier n'est pas alerté** : il ne dépose
  peut-être jamais, et une pastille « reliez votre compte » chez tout le monde
  deviendrait un bruit qu'on ne regarde plus.
- **La sonde ne crée ni ne purge rien** (`probeFolderPath`, `driveBrowser.probe`),
  contrairement au dépôt qui recrée un dossier manquant et supprime une connexion
  révoquée. Même requête que `ensureFolderPath` : « introuvable » veut dire
  exactement « le prochain dépôt le recréera » — y compris, avec `drive.file`,
  pour un dossier créé à la main que myBrief ne voit pas.
- **Relecture** : par la Sidebar (montée partout ; App.svelte est plafonné), à
  chaque changement de compte et à chaque ouverture ou fermeture de panneau, et
  après chaque enregistrement qui peut corriger un constat. Les appels pendant
  une lecture sont rejoués une fois ensuite, jamais perdus.
- **Téléphone** : pas de survol pour ouvrir la bulle, la phrase est écrite sous
  le libellé de la section (`@media (hover: none)`, déroulant `PanelTabs`).

## 10. Extension Chrome

Une icône dans la barre de Chrome : ouvrir MyBrief, ou démarrer une réunion d'un
clic (`Alt+Maj+M`). Manifest V3, **aucune dépendance, aucun build**.

- **Nouvelle réunion** : deep-link `#record`, l'app démarre l'enregistrement dès
  que la session est connue (`stores/recordDeepLink.js`). Un onglet MyBrief déjà
  ouvert est **réutilisé** (changement de hash, pas de rechargement) : jamais
  deux onglets, une réunion en cours n'est ni doublée ni interrompue. Le hash
  est effacé après consommation.
- **Liaison sans saisie** : depuis l'onglet MyBrief, « Utiliser ce site comme
  mon MyBrief » demande la permission pour ce seul hôte
  (`optional_host_permissions`). Une extension unique sert toutes les
  installations.
- **Badge REC** : l'app annonce son état (`state`), relayé par `content.js` au
  service worker, qui pose « REC » (gris en pause) et la durée en info-bulle.
- **Rappel visio** (opt-in) : point bleu si une visio Meet/Teams/Zoom/Webex est
  ouverte sans enregistrement. Teams « application » (`/v2/`) n'est pas reconnu.

**Sécurité du pont** (`stores/extensionBridge.js`) : tout message est filtré sur
`event.source === window` **et** `event.origin === location.origin` — un iframe
ou une autre origine ne peut pas se faire passer pour l'extension. Le contenu
n'est jamais exécuté, il est lu.

**Distribution** : `npm run build:extension` (lancé par `prebuild`/`predev`)
produit `public/mybrief-extension.zip`, proposé tant que `EXTENSION_STORE_URL`
(`src/config/constants.js`) est vide. Cible : fiche **non répertoriée** du Chrome
Web Store. Détails : [`extension/README.md`](../extension/README.md).

⚠️ Le popup n'a **jamais été testé dans un vrai Chrome** — seules les fonctions
pures de `extension/lib/core.js` le sont.

---

## 11. Accueil, aide et « Quoi de neuf ? »

### Modale de bienvenue

S'affiche à la première connexion, une seule fois par utilisateur (mémorisé dans
`localStorage`), réapparaît après une déconnexion/reconnexion.

**Courte exprès** : une phrase, trois gestes, un rappel pour la visio. Elle
enchaînait exigences, cinq étapes commentées et un schéma du partage d'écran,
qu'on faisait défiler sans les lire. La visio se guide désormais au démarrage
(« Quel type de réunion ? »), au moment où elle sert.

### Aide

« Aide » et « Déclarer un bug ou une idée », dans « Ma configuration », sont des
liens : la documentation en ligne (`DOCS_URL`, publiée depuis `docs/user/`) et le
formulaire de remontées, dans un nouvel onglet. L'aide intégrée tenait une
seconde copie du mode d'emploi, qui dérivait : retirée le 2026-09-15.

**Ajouter une section de configuration** = trois choses : une ligne dans
`CONFIG_SECTIONS`, son icône dans `SettingsPanel`, son libellé dans
`uiText.config` (fr + en). Le test dit lequel manque.

### « Quoi de neuf ? »

Cliquer le numéro de version, en bas à droite. Sur téléphone (≤ 768 px), le
badge du coin est masqué et l'entrée « Quoi de neuf ? » vit en pied du tiroir :
au-dessus de tout, le badge se posait sur « Terminer » (barre de réunion),
« Enregistrer » (réglages) et « Actions » (réunion rouverte) — le coin bas-droit
d'un téléphone appartient aux commandes. Une seule popup, rendue par l'instance
du coin au niveau d'App : le tiroir a une `transform`, une popup fixe rendue
dedans y serait enfermée. Une popup affiche les **10
dernières nouveautés**, une pastille orange signale une nouveauté jamais ouverte
sur ce navigateur (`localStorage`, `mybrief_whatsnew_seen`). La liste est
**embarquée dans le build** : rien ne part au serveur, ça marche hors ligne.

```
NOUVEAUTES.md (rédigé) → scripts/generate-whats-new.mjs → src/whats-new.json → WhatsNewBadge.svelte
```

**Des nouveautés rédigées, pas des sujets de commit.** Jusqu'au 10/09/2026, la
popup reprenait les `feat:` et `fix:` filtrés par portée, retouchés par SHA dans
un fichier de surcharges. Une fonctionnalité y tenait trois entrées, et dès que
personne ne retouchait plus, des corps de commit (« 320 px, overflow auto »)
arrivaient sous les yeux des utilisateurs. Le modèle est désormais celui de
MIA : **`NOUVEAUTES.md`**, à la racine, écrit à la main dans le même commit que
l'évolution — une entrée **par fonctionnalité**, qu'on enrichit quand la
fonctionnalité progresse, et rien du tout pour l'outillage, le déploiement ou
un correctif qui n'a jamais atteint la production. Le numéro de version avance
à chaque commit ; la liste ne bouge que par ce fichier. Son mode d'emploi
(forme, genres, règles d'écriture) est en tête du fichier.

Trois choix de conception :

- **L'identifiant est écrit à la main, stable à vie** (`<!-- id: … -->`). Il
  date l'entrée — premier commit dont le diff ajoute sa ligne, lu en un seul
  `git log -p` — et allume la pastille. Enrichir une entrée ne la fait donc pas
  remonter devant celles de la veille, ni ne rallume la pastille ; changer son
  identifiant, si.
- **`pour: administrateurs` ne filtre rien** : tout le monde voit toute la
  liste, une pastille « Administration » dit à qui l'entrée s'adresse.
- **La source est lue dans `HEAD`**, pas sur le disque : une retouche non
  indexée de `NOUVEAUTES.md` serait sinon publiée alors qu'aucun commit ne la
  contient.

Une entrée invalide (identifiant manquant ou en double, genre inconnu, texte
vide) reste à quai avec un avertissement, sans faire échouer la génération.
`scripts/whats-new.test.mjs` refuse toute anomalie de la source et le jargon
qui a déjà fui (chemins, `px`, noms de modèles…).

```bash
npm run whats-new                               # régénère si nécessaire
npm run whats-new:check                         # sort en 1 si obsolète (CI)
node scripts/generate-whats-new.mjs --verbose   # liste ce qui est publié, daté
npx vitest run scripts/whats-new.test.mjs       # vérifie une retouche de NOUVEAUTES.md
```

**Publication** : après le commit qui touche `NOUVEAUTES.md`, `npm run
whats-new` régénère `src/whats-new.json`, validé dans le commit suivant ; la CI
lance `npm run whats-new:check`. Une entrée ajoutée porte la date et la version
du commit qui l'apporte — d'où une génération APRÈS ce commit.

Le générateur est **déterministe** : aucun horodatage « maintenant », date et
version viennent du commit de naissance (sa date d'auteur, qui survit à un
`--amend` ou un rebase) et **jamais du SHA**, que ces réécritures changent.

---

## 12. MyBrain : nourrir le cerveau partagé

myBrain (dépôt `MyAlfred-ai/mybrain`) est le wiki d'équipe de l'organisation :
il ingère des sources et en tire des faits datés, fiche par fiche. MyBrief s'y
branche comme une **application** — une clé `mbk_…` émise dans myBrain
(Administration → Clés d'API), droit « nourrir » — et lui dépose les réunions
terminées par `POST /api/v1/nourrir`. **Tout y part en proposition dans la
revue de myBrain** : rien n'atteint le cerveau sans une décision humaine, quel
que soit le réglage de myBrain. Le contrat de l'API a été lu dans le code de
myBrain (`web/src/lib/server/applications.ts`), pas deviné.

### 12.1 Qui décide quoi

| Réglage | Qui | Où |
|---|---|---|
| Adresse de myBrain, clé d'application | **Administration** | `appSettings{key:'myBrain'}` |
| Politique : `off` · `optin` · `forced` | **Administration** | idem |
| « Envoyer mes réunions » | Utilisateur, en `optin` seulement | `userActionSettings.myBrain.enabled` |

`off` par défaut : déployer ne change rien. En `optin`, le choix de
l'utilisateur est **faux par défaut** — une transcription n'entre dans le
cerveau partagé que par un geste de son auteur, ou parce que l'administration
l'impose. Imposé, l'interrupteur reste **visible, allumé et verrouillé** : un
envoi que l'utilisateur ne verrait nulle part serait une surprise. Écrire le
choix hors `optin` répond **409**, jamais 403 (perte de session côté client).

### 12.2 Quand une réunion part

**Au geste qui la termine, une seule fois** : « Générer le résumé »
(`/resume`) ou « Enregistrer » (`/history/title`), **après** la génération du
titre, qui nomme la source dans le cerveau. Écarté :

- **à l'arrêt** (`/history/stop`) : la réunion n'a encore ni titre ni compte
  rendu, et l'utilisateur n'a pas dit qu'il la gardait (un enregistrement lancé
  par erreur est purgé à l'arrêt). Une réunion abandonnée sans l'un des deux
  gestes ne part donc pas ;
- **à chaque régénération** : chaque dépôt est une proposition dans la revue de
  myBrain, et renvoyer la réunion y empilerait des doublons. Un renommage ou un
  tag posé après coup ne repartent pas non plus ; ce qui compte — ce qui a été
  dit — est parti avec la transcription.

**Jamais le passé : seules partent les réunions COMMENCÉES après l'activation**
— de l'installation (`appSettings.myBrain.activeSince`) et, en `optin`, du
compte (`userActionSettings.myBrain.enabledAt`). `activeSince` est reposé quand
l'envoi devient actif (connexion rétablie, politique rouverte) et à **chaque
changement de politique** : passer de « au choix » à « imposé » n'emporte pas
les réunions de ceux qui n'avaient rien demandé ; une rotation de clé ne le
touche pas. La borne ne s'applique qu'à la première tentative : une réunion
déjà tentée finit son envoi. Sans elle — trouvé en relecture —, régénérer le
résumé d'une réunion de mars, ou la ranger depuis l'historique, la déposait
dans le cerveau partagé, transcription comprise, alors que l'écran promettait
le contraire. Pour la même raison, « Réessayer » (`/mybrain/send`) refuse une
réunion jamais tentée (`409 mybrain_not_retryable`).

La politique et le choix sont relus **à chaque envoi**, sans cache.

### 12.3 Ce qui part

Un texte Markdown en français (`lib/myBrain/document.js`, fonctions pures) :
titre, **date et heure** (heure de Paris, comme les prompts), durée, **auteur**
(nom et adresse), **tag**, puis les **notes**, les **actions** visibles, le
**compte rendu** (HTML ramené au texte, structure gardée) et la
**transcription intégrale**. `pour` = l'adresse de l'auteur : myBrain lui
adresse la question de la revue s'il a un compte, sinon au responsable de la
fiche ou aux curateurs (`recipientUnknown`, montré à l'utilisateur).

Deux absences voulues :

- **le nom de l'outil**. myBrain pose lui-même la provenance (`transmis_par`
  en frontmatter, d'après la clé) ; écrite dans le texte, elle devenait une
  *entité* pour son modèle — leçon payée côté myBrain ;
- **les textes de remplacement** que l'écran des actions enregistrait comme
  valeurs (« À définir », « Description de l'action… ») : ils finiraient en
  personnes et en faits dans le cerveau. La liste est figée — ce sont les
  textes HISTORIQUES en base, pas ceux de l'interface du jour.

### 12.4 Le plafond de 120 000 caractères

C'est celui de l'API de myBrain par texte (413 au-delà). Une heure de réunion
en fait la moitié. Au-delà, la transcription est découpée **aux fins de
ligne** — une prise de parole n'est coupée que si elle dépasse à elle seule une
partie —, **chaque partie reprend l'en-tête** (myBrain analyse chaque dépôt sans
voir les autres : une partie sans date ni auteur serait une source orpheline),
et notes, actions et compte rendu ne voyagent qu'avec la première. Huit parties
au plus (l'horizon d'analyse de myBrain), la fin est alors coupée et le texte
le dit.

**Une reprise ne recalcule pas le découpage : elle le rejoue.** Les positions de
coupe de la transcription (`myBrain.cuts`) sont gardées au premier dépôt
accepté. Recalculées, les frontières glissaient avec tout ce qui avait bougé
entre deux essais — un compte rendu régénéré change la place laissée à la
transcription dans la partie 1 — et des répliques étaient perdues ou doublées
en silence, la réunion affichée « Envoyée ». Du texte ajouté à la transcription
après coup n'est pas glissé dans une partie : le texte dit que la fin n'a pas
été envoyée.

### 12.5 L'état, et les relances

`resume.myBrain` : `sending` → `sent` | `error`, avec les `jobs` acceptés au fil
de l'eau. La réclamation est **atomique** (`findOneAndUpdate` sur l'état) : le
geste de fin, une relance et un « Réessayer » simultanés n'envoient qu'une
fois. Une réunion en trois parties qui échoue à la deuxième reprend à la
deuxième.

| Issue | Le dépôt a pu arriver ? | Relance automatique ? |
|---|---|---|
| Connexion jamais établie (DNS, refus, certificat), 429, 502/503/504 | non | **oui** — 5 tentatives, à 5 min, 15 min, 1 h, 4 h |
| Clé refusée, droit manquant, contenu refusé | non | non — à corriger, puis « Réessayer » |
| **Délai dépassé**, **connexion coupée en route**, **500**, **envoi interrompu** (processus arrêté) | **peut-être** (`ambiguous`) | **jamais** |
| 2xx au corps illisible | **oui** — compté comme accepté | — |

Une issue **ambiguë** — la requête est partie, la réponse s'est perdue — n'est
jamais relancée sans l'utilisateur, ni par la boucle, ni par un geste de fin :
même règle que `lib/retry.js` pour un mail, relancer doublerait la
proposition. La distinction se lit dans la **cause** que rend undici
(`err.cause.code`) : `ECONNREFUSED`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`… ne
sont survenues qu'avant l'envoi ; `ECONNRESET`, `UND_ERR_SOCKET` ou une cause
inconnue, peut-être après. Un 429 est sûr : myBrain compte son plafond avant
de créer le job. Un 500, non : c'est myBrain qui répond, peut-être après.
L'écran le dit (« Elle est peut-être arrivée : vérifiez dans la revue ») avant
« Réessayer ».

La boucle de relance tourne dans `server.js` (toutes les 10 min, jamais dans
`buildApp` : les tests n'ont pas d'horloge qui tourne), en série et par lots
de 10 : **les 60 dépôts par heure de la clé sont partagés par toute
l'installation**. Elle interroge un **index partiel** sur `myBrain.status` —
sans lui, chaque passage balaierait toute la collection `resume`,
transcriptions comprises.

### 12.6 Sécurité

- **La clé est scellée au repos** par le coffre des refresh tokens
  (`CONNECTIONS_ENC_KEY`, AAD `appSettings:myBrain`) — la seule valeur de
  `appSettings` à l'être : elle lit tout le wiki partagé si le droit « lire »
  est coché. Jamais renvoyée ; l'écran montre l'aperçu **au format de myBrain**
  (`mbk_AbCd…wxyz`) pour rapprocher les deux listes de clés.
- **Vérifiée avant d'être enregistrée** (`GET /api/v1` : application, droits,
  « nourrir » exigé) : une clé « lire » seule répondrait au test et refuserait
  chaque réunion ensuite.
- **« Tester la connexion » essaie la saisie**, avant tout enregistrement
  (champ absent = valeur enregistrée), et n'écrit rien : seul le test de la
  connexion enregistrée met à jour sa vérification. Le réserver à la connexion
  enregistrée laissait le bouton grisé, sans raison visible, à la première
  configuration — précisément quand on veut essayer. Sans corps, la route teste
  la connexion enregistrée (un onglet resté sur l'écran précédent).
- **Aucune redirection suivie** (`redirect: 'manual'`) : elle emporterait la
  clé ailleurs. Une adresse en `http://` qui redirige se corrige à l'écran.
- **La clé enregistrée ne part jamais vers un autre hôte.** La vérification
  l'envoie dans un en-tête avant de savoir si l'adresse est un myBrain : une
  session d'administration détournée n'aurait eu qu'à poster une adresse pour
  la recevoir. Changer d'hôte exige de recoller la clé dans la même requête
  (`400 mybrain_key_required`), à l'enregistrement comme au test ; changer
  seulement de chemin, non.
- **Aucun 401/403 de myBrain relayé** : 400 à l'administration, 502 au
  « Réessayer ».
- **« Réessayer » est plafonné** (`myBrainSendByAccount`, 30 par heure et par
  compte) : chaque clic est un appel sortant sur une clé partagée par tous.
- **Rien ne vient du corps de la requête** : le contenu est relu en base sous le
  scope du propriétaire, l'adresse vient des réglages d'organisation (règle des
  actions, §7.3).
- L'écran de l'utilisateur ne voit que **l'état** de ses envois, jamais leur
  contenu (projection stricte, testée).

### 12.7 Ce que ça ne fait pas

- **Supprimer une réunion, ou un compte, ne retire rien de myBrain** : ce qui a
  été approuvé y vit, et s'y supprime.
- **Le serveur de MyBrief doit joindre myBrain.** Sur une installation sur site
  au trafic sortant filtré, le flux est à ouvrir ; l'adresse peut être interne
  (`http://mybrain:3000`), le lien « Ouvrir la revue » prend alors l'adresse
  publique que myBrain annonce pour lui-même.
