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
- [13. Aide IA : l'IA dans la réunion](#13-aide-ia--lia-dans-la-réunion)

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
- **Charte (2026-11-18)** : logo de l'entreprise en tête, dégradé primaire →
  secondaire de Marque & apparence (bande de chaque page, barre sous le titre,
  trait devant les intertitres, filet du pied), logo de MyBrief au pied. Le
  texte reste noir sur blanc. Tout se loge dans les marges, la réserve du pied
  ou en position absolue : la zone de texte que rejoue le Pagimètre n'a pas
  bougé d'un pixel — y toucher imposerait de le recalibrer. Les dégradés sont
  **peints en bandes** de 0,5 mm (`gradientBands`) et non décrits par un motif
  de dégradé PDF : jsPDF n'en offre qu'en API avancée, en repère inversé, et
  les aplats se lisent pareil dans tous les lecteurs comme à l'impression.
  jsPDF arrondit les couleurs au centième : paliers de 1 %, invisibles.

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
archive, c'est le direct mis de côté qui est écrit dans le `localStorage`,
jamais l'archive : « Reprendre », après une coupure, la restaurerait à la place
de la réunion en cours. (Rien n'y était écrit du tout : une application tuée à
ce moment perdait ce qui s'était dit depuis l'ouverture de l'archive.) Et le
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

`userTags` : `{ email, emailLower, id, label, labelLower, color, shape, context, createdAt, updatedAt }`.
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

### Contexte du dossier : ce que l'IA doit savoir

Un tag peut porter un texte libre (`context`, 1 500 caractères au plus) qui
décrit le projet ou le client qu'il range : acteurs et rôles, sigles. Il est
lu par le compte rendu, l'infographie et l'Aide IA d'une conversation taguée
(`services/api/lib/tagContext.js`).

**Éclairage, jamais source.** Le risque propre à ce texte : il contient des
faits (« livraison en juin 2027 ») qu'un compte rendu reprendrait comme dits
en réunion. Les trois consignes le déclarent donc de quoi comprendre et écrire
juste les noms, et interdisent d'en tirer un fait, un chiffre ou une date. Le
contexte d'organisation et celui de l'utilisateur n'avaient pas besoin de
cette clause : ce sont un vocabulaire et une identité, pas un dossier.

**Deux chemins de lecture, voulus.** Le prompt du compte rendu est assemblé
par le navigateur (`config/templates.js`), comme pour les deux autres
contextes : le texte descend avec `GET /tags` et s'insère entre l'organisation
et l'utilisateur. L'infographie et l'Aide IA, dont les prompts s'assemblent
côté serveur, le relisent EN BASE par l'id du tag, sous le compte du
demandeur — le corps de `/resume` ne porte que `tagId`. Ce `tagId` est
nécessaire : pendant un enregistrement, un tag choisi avant que la réunion
existe reste en attente côté écran (`pendingTagId`) et n'est posé qu'après la
réponse de `/resume`.

**Aide IA : plus pertinente, pas plus lente.** Le dossier est lu EN MÊME
TEMPS que le reste (`Promise.all` avec `whoIsAsking`) : aucune attente
ajoutée. Ses noms et sigles (`tagContextTerms`) rejoignent le vocabulaire qui
prépare la recherche dans myBrain : un nom dicté de travers y retrouve sa
graphie, et sa fiche — sans appel au modèle de plus (deux, comme avant, test
à l'appui). Le texte lui-même pèse 1 500 caractères au plus dans le prompt.

**La transcription aussi** : le contexte sert de référence à la relecture des
phrases en direct, derrière un filtre local qui évite un appel par phrase
(documentations/TRANSCRIPTION.md, « Le contexte du tag, seconde référence de
la relecture »).

**Écrit par `POST /tags/context`, pas par `/tags/save`** : la fiche
l'enregistre à une pause de frappe sans renvoyer nom, couleur et forme, et un
client qui ignore le champ ne peut pas l'effacer en changeant une couleur.
Texte normalisé à l'écriture (fins de ligne, une ligne vide au plus), refusé
au-delà de la borne, jamais coupé en silence. La borne tient le coût : le
texte part avec chaque appel d'une conversation taguée.

### Logo d'un tag, et une fiche qui s'enregistre seule

**Le logo vit à part** (`userTagLogos`, dans `OWNED_COLLECTIONS`) : `GET /tags`
est lu à chaque ouverture de « Mes tags » et du sélecteur, trente logos
dedans pèseraient plusieurs Mo. Le tag n'en porte que `logoAt`, qui dit au
navigateur qu'il y en a un et si sa copie est à jour ; le logo se lit un par
un (`GET /tags/logo`, `ensureTagLogo`, une requête par version) et vit en
data URL — utilisable tel quel par l'infographie, son export PNG et jsPDF,
y compris dans l'application mobile où une `<img>` vers l'API ne porterait pas
le jeton. Le navigateur réduit l'image à 512 px en PNG avant l'envoi
(`utils/tagLogo.js`, SVG compris) ; le serveur n'admet que PNG, JPEG, WebP,
vérifie les premiers octets, borne à 300 000 caractères. Remplacer = retirer
puis insérer (jamais d'upsert sur `ownerFilter`), et `logoAt` s'écrit APRÈS le
logo : un échec laisse un logo non annoncé, jamais une annonce sans logo.

**Infographie** : le logo du tag prend la place du pictogramme du gabarit, en
médaillon blanc au centre de l'anneau de la couverture, dans la colonne que le
titre (70 u) laisse libre — aucun des six corps ne bouge ; la couverture
s'allonge à 40 u pour le porter. **PDF** : à droite du logo d'entreprise
(`TAG_LOGO_BOX`, plus étroit), préparé par le même `logoForPdf`. `pdfConfig`
porte `tagId` (App.svelte, sans grossir : un commentaire paraphrasant le code
a fait la place).

**Fiche** : le formulaire « Nom et apparence » a disparu du premier plan. Le
nom se modifie sur place, couleur et forme dans une petite fenêtre
(`TagPastillePopover`, teintes unies et formes), chaque geste enregistré
aussitôt par `upsertTag` avec le corps complet ; le formulaire complet reste
pour les motifs et la couleur libre. Rangement et envoi sont repliés en une
ligne (`TagRule`) : la réponse retenue se lit, « Modifier » déplie les deux
choix d'avant — repliées, les deux règles ne prennent plus un écran chacune
pour un choix binaire réglé une fois.

### Trouver un tag

Une seule règle de correspondance (`src/utils/tagSearch.js`) pour le
sélecteur, le filtre de l'historique et la liste de « Mes tags » : le NOM
(ceux qui commencent par la recherche d'abord), puis le CONTEXTE, extrait à
l'appui. Chercher dans le contexte, c'est trouver un classeur par la personne
qu'on a en tête (« martin » → « Projet Atlas »). Casse et accents ignorés,
mais l'extrait rendu garde le texte écrit : le repli se fait caractère par
caractère en gardant la position d'origine, et l'extrait est coupé sur des
limites de mot.

**Créer depuis le sélecteur.** Un nom qui n'est celui d'aucun tag (règle du
serveur, `labelKey` : casse et espaces neutralisés, accents GARDÉS) se crée et
se pose d'un geste, pastille choisie par `freshTagColor` comme après le premier
résumé. Plafond atteint : « Créer » inactif et la limite dite, plutôt qu'un
refus après coup.

**Récents à partir de six tags** — les tags des dernières réunions, lus dans
l'historique (trié par date décroissante), sans stockage. En dessous, les
sections seraient du bruit. La recherche du filtre et de « Mes tags » garde le
seuil de sept tags, sauf dans « Mes tags » dès qu'un tag a un contexte : ce
qu'il cite ne se lit pas dans la liste. Le champ du sélecteur ne prend le focus
que sur un écran à souris (un clavier tactile recouvrirait le menu), et passe à
16 px sur écran tactile : en dessous, Safari iOS zoome la page.

**Écarté pour l'instant** : suggérer un tag d'après la transcription (noms et
sigles des contextes entendus en réunion). La transcription ne vit que dans
`App.svelte`, au plafond de lignes : la brancher demande d'abord d'en extraire
quelque chose.

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
  des deux onglets de la page Actions des réglages. Sur le compte et non dans le
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

Une page portrait qui résume la réunion, générée en tâche de fond après
`/resume` : l'IA en écrit le **contenu** (`lib/infographicLayout.js`), six
**gabarits** le mettent en page dans le navigateur (`src/components/infographic/`)
avec le logo et les couleurs de Marque & apparence.

**Pourquoi des gabarits et plus une image** (2026-11-17). De 2026-08-31 à
2026-11-17, un modèle texte rédigeait un prompt d'image, puis un modèle d'image
(`gpt-image-2`, puis `gpt-image-2.5-flare`) dessinait toute la page, lettrage
compris : une à trois minutes, deux appels, des coquilles possibles dans le
texte dessiné, et **aucun moyen de poser le logo** — le prompt interdisait même
« logo ou marque », un modèle d'image ne reproduisant pas un fichier existant.
Écartés : garder l'image avec un logo collé par-dessus (le dessin restait lent
et inégal, et rien ne réservait sa place) ; laisser l'IA écrire une page HTML
libre (lent — une page de HTML coûte bien plus de jetons qu'un JSON —, rendu au
hasard, impossible à tester, et du HTML d'IA tiré d'une transcription injecté
dans l'application). Retenu : **un cadre fixe, six corps de page**, un contrat
JSON borné. Le lecteur retrouve toujours au même endroit le logo (haut gauche,
sur fond blanc pour qu'aucun logo ne disparaisse sur sa propre couleur),
l'essentiel en grand, les actions en bas.

**Le choix du gabarit est celui de l'IA, validé par le code.** Les règles
(`INFOGRAPHIC_LAYOUT_RULES`, `lib/prompts.js`) décrivent les six gabarits et ce
qui fait choisir chacun ; le template du compte rendu part en **indice**
(nommé seulement s'il est intégré : un identifiant de template personnel ne dit
rien au modèle). `normalizeLayout` ne garde que les clés connues, borne chaque
texte et chaque liste (la mise en page compte sur ces bornes — pas de
`line-clamp`, que l'export ne sait pas rendre), ramène chaque énumération à une
valeur permise, et **rétrograde en Synthèse** un gabarit sans sa matière (une
feuille de route sans trois jalons serait une page vide). Une réponse illisible
fait échouer l'infographie : sans contenu, rien à mettre en page.

**Les actions viennent du code, pas du modèle** : celles que l'écran montre
(`show !== false`), recopiées telles quelles — les faire réécrire, c'était
risquer un écart avec la liste de l'écran pour rien. Quatre au plus sur la page A4,
sur deux colonnes ; une ligne renvoie au compte rendu pour les autres.

**Les chiffres ont une forme**, choisie par le modèle (il sait ce que le chiffre
veut dire) : part → anneau, progression → barre vers la cible, objectif →
règle à repère, évolution → flèche et barres comparées. Une forme sans sa
donnée (une progression sans cible) redevient un nombre : jamais de graphique
faux. Les nombres arrivent en nombres et prennent ici le format de la langue.

**Un appel court, en même temps que le compte rendu** (2026-11-17, « la
génération prend du temps », constaté en recette). Trois leviers, du plus au
moins payant :
- **en parallèle** : demandée avec le résumé, l'écriture du contenu part dès
  le début de `/resume` — elle ne dépend que des matériaux — et seul son
  enregistrement attend que la réunion soit écrite (`composeInfographicLayout`
  puis `saveInfographic`, lib/infographic.js). Avant, elle partait après la
  rédaction : son temps s'ajoutait à celui du compte rendu. Rédaction en échec :
  l'écriture s'achève sans rien enregistrer (son coût est perdu, cas rare) ;
- **le palier rapide** : `gpt-6-luna`, effort `low`, à la place de `gpt-5.4` —
  trier une réunion dans des rubriques bornées ne demande pas le modèle du
  compte rendu ; `none` est écarté, le choix du gabarit demande un peu de
  jugement ;
- **un JSON compact** : la réponse (~400 jetons) s'écrit jeton par jeton, et
  l'indentation pèse un quart des caractères (mesuré au banc sur six contenus).
Côté écran, la relecture passe de 4 à 2 s. **Non mesuré sur génération
réelle** depuis ce dépôt (clé de l'organisation) — ni la durée, ni la justesse
du choix de gabarit sur le palier rapide : à juger en recette sur des réunions
connues ; `OPENAI_MODEL_INFOGRAPHIC=gpt-5.4` rend l'ancien modèle sans
redéployer, l'écran d'administration non.

**Une page A4, toujours** (demande du 2026-11-17). La feuille a la hauteur de
l'A4 (√2 × sa largeur), jamais plus : une première version laissait la page
s'allonger avec le contenu (jusqu'à 2,6 fois sa largeur au banc), refusé. Deux
leviers : des bornes de contenu réglées pour l'A4 (`LAYOUT_LIMITS`, et les
mêmes nombres dans les consignes de l'IA), et un AJUSTEMENT — montée, la
feuille se mesure et réduit l'échelle de tout son contenu (`--ig-k`, cf.
`src/lib/infographic/fit.js`) jusqu'à tenir, par dichotomie, plancher 0,72 en
deçà duquel le texte deviendrait illisible (le bas serait alors rogné). Mesuré
au banc sur six réunions fictives denses : échelle de 0,77 (Atelier, Tableau
de bord) à 1, aucun débordement. Les actions passent sur deux colonnes, quatre
au plus sur la page.

**Écran et PNG identiques.** Toutes les dimensions sont en unités de page
(1 % de la largeur × l'échelle) : la même feuille s'affiche en miniature de
86 px, en grand, et se rend en PNG de 1 080 px ×2 (`exportPng.js`,
html2canvas-pro), qui attend l'ajustement avant la photo. Deux contraintes de
l'export, invisibles à l'écran : html2canvas sérialise chaque `<svg>` en image
isolée, où ni classe ni variable CSS n'existent — d'où les couleurs
**littérales** calculées par `palette.js` pour les pictogrammes et anneaux ;
et un logo SVG sans dimensions propres sortait **absent** du PNG (mesuré au
banc) — d'où sa conversion en bitmap juste avant la capture.

**Deux logos, lus à l'affichage** (pas à la génération : une marque changée
s'applique aux infographies existantes sans les régénérer). En tête, celui de
l'ENTREPRISE (`companyLogo`) ; en pied, discret, celui de l'APPLICATION avec
« myBrief ». Le premier n'est PAS dans la sonde publique `/api/auth/config`,
qui porte déjà le second à chaque démarrage et que la page de connexion n'a
pas besoin d'alourdir : il se lit à part (`GET /api/branding/company-logo`,
compte connecté), une fois par session, à la première infographie affichée.
Absent, le logo de l'application prend sa place en tête, et un constat de
configuration (`company_logo_missing`, avertissement) pose une pastille sur
Marque & apparence : un manque visible de tous ceux qui reçoivent
l'infographie mérite plus qu'un conseil.

**Dégradés partout, mais des contours en vraies bordures.** Les bandeaux,
tuiles et piliers sont en dégradés calculés dans `palette.js` — le bandeau
part vers une teinte plus profonde quand son texte est blanc, plus claire
quand il est encre, pour que le contraste tienne d'un bout à l'autre (test à
l'appui). Constaté au banc d'essai : html2canvas efface du PNG un `box-shadow`
utilisé comme contour, et transforme un `inset` en aplat — d'où des bordures
pour tous les contours, les ombres ne servant qu'au relief. Le **style
graphique** (texte libre de l'ère image) et le **modèle d'image** ont quitté
l'écran : la mécanique des réglages reste (`lib/infographicModels.js`, l'API
les accepte, des valeurs sont en base) mais plus rien ne les lit.

**Langue** (2026-10-21) : celle de l'interface, comme le compte rendu, posée en
phrase dans la demande. Une **régénération** prend la langue sélectionnée au
clic, à défaut celle stockée avec la réunion. Les libellés imprimés par le
gabarit (« Actions », « Décisions »…) suivent `layout.langue`, pas l'écran :
ils doivent parler la langue des textes de l'IA.

**Qui peut en générer** (2026-09-25) : l'installation doit la proposer
(Administration → IA) ET le groupe du compte en donner le droit (un seul
groupe par compte depuis le 2026-10-26) ; « Défaut » et « Admin » le donnent au
départ. Le pourquoi, les portes
et le 409 sont dans AUTHENTIFICATION.md §3.

**Le contenu vit dans une collection dédiée** (`infographics`) : `/history`
renvoie les documents `resume` entiers, qui ne portent que
`infographic.status`. Un document y porte `layout` (gabarit) ou, d'avant les
gabarits, `image` (plusieurs Mo de base64) — `GET /infographic` sert l'un ou
l'autre, et une régénération remplace l'image par un gabarit (`$unset`), jamais
les deux.

**Préséance des deux sources** : l'historique **amorce** l'état, `GET
/infographic` donne l'état frais. Un instantané d'historique daté ne rétrograde
jamais un cycle en cours — sinon un rechargement de la liste rejouerait
l'animation sur une image déjà affichée. `stamp` (l'`updatedAt` écrit à chaque
changement d'état) distingue « instantané daté » de « nouvelle génération ».

**Polling borné** : le serveur règle le drapeau dans **tous** les cas de sortie
(`ready` / `error`, jamais `pending` à demeure). Le plafond ne couvre que le cas
du serveur disparu en route.

⚠️ La visionneuse passe **obligatoirement par un portal** (montage à la racine).

---

## 9. Administration

Un tableau de bord pour accueil, puis treize pages rangées en cinq rubriques
repliables (Personnes, Modèles IA, Capacités, Coûts, Organisation — cf. §11,
« Deux espaces »), une barre d'enregistrement unique par page, et des
composants partagés (`ui/SettingsCard`, `ui/StatusBadge`, `ui/ToggleSwitch`, `ui/GroupChip`).

**Clés API et Modèles, Entreprise et Marque & apparence, Authentification et
Actions sont des tableaux de bord REPLIÉS** (2026-10-28) : `ui/DashCard` (bloc d'en-tête ou panneau déplié, l'explication
derrière un ⓘ), `ui/DashPill` (un fournisseur, un mode de connexion — point vert
quand c'est en service) et `ui/DashTile` (ce qui est en place, « Modifié » jusqu'à
l'enregistrement), un seul réglage déplié à la fois. Décision : ces onglets
dépassaient 1 800 px chacun, à lire de bout en bout pour retrouver un réglage ;
repliés, ils tiennent sous 550 px. Deux règles en découlent, qu'aucun test ne
protège entièrement : **la saisie vit dans l'onglet, pas dans le panneau** —
replier ne doit rien perdre — et **ce qui demande un geste ne reste pas replié**
(clé OpenAI absente, fournisseur activé que le serveur ne sert pas), ni ne se
tait : ce qui bloque l'enregistrement s'écrit hors des panneaux ou sur la tuile —
comme un bouton d'action activé qui n'apparaîtra pas (« Aucun relais », « Compte
requis »).

| Rubrique → page | Contenu |
|---|---|
| **Tableau de bord** | points à régler — les constats des pastilles en phrases, du plus grave au plus léger, avec le chemin de la page — et activité des 30 derniers jours |
| **Personnes → Comptes** | comptes, rôles, groupes (puces, cases de la fiche, filtre), réinitialisation, désactivation, suppression |
| **Personnes → Groupes** | groupes d'utilisateurs : colonne des comptes à glisser sur les cartes (ou sélectionner, au clavier et au doigt), cartes (initiales des membres, effectif, quota, droits), membres (ajout par recherche, retrait), groupe par défaut, quota de minutes de réunion par mois, droit aux infographies — cf. AUTHENTIFICATION.md §3 |
| **Coûts → Crédit de temps** | minutes restantes de chaque compte ce mois-ci, dans l'ordre d'urgence ; la page « Usage & crédits » d'un collègue (§9.2) |
| **Organisation → Authentification** | fournisseurs d'identité, domaines autorisés, modes de la page de connexion |
| **Modèles IA → Clés API, Modèles** | clés OpenAI et tierces (vérifiées avant enregistrement), modèle de résumé (OpenAI ou Mistral), modèle de transcription, deux boutons **Tester** réels, infographie (interrupteur général, au-dessus des droits de groupe) |
| **Capacités → Actions** | interrupteurs, fournisseur, plafonds, politique SMTP, gabarits |
| **Capacités → Templates** | modèles d'organisation + les 6 défauts éditables + contexte d'organisation |
| **Organisation → Entreprise, Marque & apparence** | logo, phrase d'accueil, couleurs, vocabulaire de l'organisation, corrections automatiques de la transcription (cf. TRANSCRIPTION.md §3) |
| **Capacités → MyBrain** | adresse et clé du cerveau partagé (vérifiées), qui lui envoie ses réunions — cf. §12 |
| **Coûts → Consommation** | usage réel de l'installation, dépenses d'IA estimées et tarifs actualisables (§9.2) |

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
dépense de septembre) ; une infographie à sa génération. D'où trois champs de plus
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

**Les modèles de rédaction aussi (2026-10-29)** : même liste, même filtre par
fournisseur (`ProviderFilter`), même verrou sans clé, et le coût ESTIMÉ d'un
compte rendu d'une réunion d'une heure (`prices.summary`, sur les hypothèses de
`assumptions.js` — d'où la mention « Coût estimé » au-dessus de la colonne).
Leur échelle avance au pas de QUATRE, pas de deux : de GPT-6 Luna à GPT-6 Astra
les prix vont de 1 à 100, et au doublement sept modèles sur dix plafonnaient à
« €€€€ ». Le pas est dit dans l'infobulle de chaque liste. La rédaction peut
partir chez Mistral (`SUMMARY_PROVIDERS`, `lib/summaryModels.js`), sur la clé
qui débloque déjà Voxtral : le client Mistral tient le même `chat()` que celui
d'OpenAI, sans `verbosity` ni effort de raisonnement, qu'il refuserait. Les
paliers GPT-6 et les modèles Mistral sont proposés **sans mesure** sur nos
comptes rendus (recopie du scaffold, longueur — GPT-6 ne reçoit pas
`verbosity: 'high'`) : le défaut reste gpt-5.4, le seul mesuré, jusqu'à leur
essai en recette.

#### « Usage & crédits » et le crédit de temps

Pour TOUS les comptes : une page des réglages (`stats/PersonalStats`, section
`usage` ; l'ancien lien `#my-stats` y mène toujours). Son usage
(`GET /api/stats/me?range=month|90|365|all`) et la jauge de son crédit — et
RIEN d'autre, administrateur compris. Le crédit de chacun est dans
l'administration, page « Crédit de temps » (`admin/CreditsTab`,
`GET /api/admin/stats/credits`), avec la page d'un collègue
(`POST /api/admin/stats/account`). Il était d'abord un onglet « Équipe » de
cette page réservé aux administrateurs : une page personnelle qui montre les
autres a été refusée à la recette. La page elle-même fut un panneau à part,
« Mes statistiques » : sa consommation est une affaire de compte comme les
autres, elle a rejoint les réglages (§11, « Deux espaces »).

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

**Le résumé du mois vit sur la carte du compte du téléphone**
(`stats/AccountMonth.svelte`), pas dans une carte de colonne. Les statistiques
avaient trois portes — la carte « Temps de réunion » du bas de la colonne, une
icône muette à côté de la roue crantée, une ligne du menu du nom —, et aucune
ne disait rien avant d'ouvrir une page plein écran ; la carte prenait 75 px en
permanence. Elle est devenue l'anneau de l'avatar et une ligne sous le nom ; sur
téléphone, où cette ligne est masquée, la carte que l'avatar ouvre montre le
crédit, le rythme et trois chiffres, avec le lien vers la page. Sur ordinateur
le bloc a disparu avec le menu du nom : la ligne sous le nom suffit, le détail
est à un clic (« Réglages → Usage & crédits »).
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
panneau (boutons « Réglages » et « Admin » de la carte du compte, avatar et
déroulant des sections sur téléphone). Le serveur rend des
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

### Deux espaces : Réglages et Administration

La carte du compte, en bas de la colonne, porte deux boutons libellés :
« Réglages » (ce qui regarde la personne connectée) et « Admin » (ce qui regarde
l'organisation, administrateurs seulement). C'est le découpage de MIA, repris
tel quel (2026-11-13) pour qu'on retrouve l'un en connaissant l'autre : une page
n'est que dans l'un des deux espaces, et les rubriques portent les mêmes noms.

Ce que ça remplace : une roue crantée muette, une ligne « Administration »
cachée dans le menu déroulant du nom, et ce menu lui-même — à la fois fiche
(identité, groupe, langue, mot de passe) et navigation. La fiche est devenue la
page « Mon profil », accueil des réglages ; « Mes statistiques », qui était un
troisième panneau, y est la page « Usage & crédits » ; « Se déconnecter » ferme
la colonne. Côté administration, onze onglets à plat mêlaient ce qu'on règle
une fois, ce qu'on gère et ce qu'on consulte : ils sont rangés en cinq
rubriques repliables.

Décisions, et ce qui a été écarté :

- **Pas de tuiles « Espaces » sur l'accueil** (templates, tags, import, comme
  dans MIA) : refusées à la maquette. « Ma bibliothèque » reste un groupe des
  réglages, « Outils » une page de leur pied de colonne.
- **Pas de teinte propre à l'administration.** MIA teinte son bouton « Admin »
  en violet ; ici le violet est réservé à l'Aide IA (`--ai`, `tokens.css`),
  seule teinte hors marque de l'interface. Le bouton de l'espace ouvert se
  signale par `aria-current` et le fond des entrées actives.
- **Les pages à onglets gardent un écran par réglage** (`ui/SubTabs` —
  « Préférences IA », « Pendant la réunion », « Après la réunion », qui
  s'appelait « Actions ») plutôt qu'une page qui les empile : mail et dépôt
  avaient déjà été séparés parce qu'on les réglait l'un sous l'autre sans les
  distinguer. Empiler « Mon contexte » et « Détection d'actions » a été essayé :
  deux « Enregistrer » se retrouvaient à l'écran, dont celui de la détection,
  collé en pied de page, qui semblait valoir pour les deux.
- **Les identifiants des pages n'ont pas bougé** (`ai`, `branding`, `stats`,
  `mail`, `action-storage`…) : le diagnostic du serveur range ses constats sous
  ces identifiants (`lib/configChecks.js`). Renommer une page se fait dans
  `uiText`, jamais dans son identifiant ; aucun test ne lie les deux côtés.
- **Les anciens liens tiennent** : `#my-stats`, `#my-templates` et `#my-tags`
  ouvrent les réglages sur la bonne page (`stores/panels.js`).
- **Sur téléphone, la carte s'ouvre depuis l'avatar** (`AccountMenu`) et garde
  « Ce mois-ci » : la capsule de la colonne y est masquée, c'est le seul
  endroit où le crédit se lit sans ouvrir une page.
- **Le pli d'une rubrique est mémorisé par appareil**, et arriver sur une page
  déplie la sienne : la page affichée ne peut pas être introuvable dans la
  colonne.

**Le tableau de bord et les pages découpées** (seconde étape, 2026-11-13).
L'administration s'ouvre sur un tableau de bord (`admin/DashboardTab`) : les
constats du diagnostic en phrases, la plus grave d'abord, chacun avec le chemin
de sa page. Il lit le store des pastilles : il ne peut pas les contredire. Avant
lui, il fallait ouvrir les rubriques une à une pour savoir ce que leurs
pastilles voulaient dire, et l'administration s'ouvrait sur une page de réglage
prise au hasard de l'ordre de la colonne.

« Clés API » et « Modèles » sont deux pages servies par UN composant (`AiTab`,
prop `view`), comme « Entreprise » et « Marque & apparence » (`BrandingTab`) :
même chargement, même règle « on n'envoie que ce qui a changé », et chaque page
ne peut modifier que la moitié qu'elle montre. Écarté : deux composants par
écran — ce qui relie les moitiés (un modèle verrouillé sans la clé de son
fournisseur, la barre d'enregistrement) aurait été dupliqué.

Ce que le découpage coûte : on ne colle plus une clé ET on ne choisit plus son
modèle d'un seul « Enregistrer ». Depuis « Modèles », « Ajouter la clé » mène à
« Clés API », ouverte sur le bon fournisseur (l'onglet visé passe par
`panelNav.sub`). Et sur « Clés API », un modèle en service sans sa clé ne
bloque plus l'enregistrement d'une AUTRE clé : on ne peut pas y changer de
modèle, ce serait une impasse.

Côté serveur, un seul constat a changé de section : le vocabulaire vide est
rangé sous `company` (la page « Entreprise ») et non plus `branding`. Les
autres identifiants n'ont pas bougé — `ai` est la page « Clés API », `branding`
« Marque & apparence ».

**La recherche dans les réglages** (2026-11-13). Une douzaine de pages côté compte,
quatorze côté organisation, des onglets et des tuiles repliées dedans : savoir
OÙ se règle une chose était devenu le vrai coût. En mode réglages, la pilule
sous « Nouvelle réunion » cherche un réglage au lieu d'une réunion, ses
résultats prennent la place des sections ; Ctrl K (⌘ K) y mène de partout ; sur
téléphone, le champ est en tête du déroulant des sections.

- **Elle trouve des RÉGLAGES, pas des pages** : le catalogue
  (`config/settingsSearch.js`) liste les cartes, tuiles et pastilles de chaque
  page en plus des pages elles-mêmes, et le choix d'un résultat ouvre la page,
  son onglet, déplie la tuile et allume la carte (`utils/revealSetting.js`).
  Ne chercher que dans les noms de pages aurait laissé « logo » sans réponse.
- **Le réglage se retrouve à l'écran par le texte de son titre**, celui que
  `uiText` donne à la fois à l'écran et au catalogue : aucune ancre à poser
  dans quinze composants, un titre renommé suit seul. Le prix : une carte dont
  le titre change de clé `uiText` sans que le catalogue suive ne s'allume plus
  (la page s'ouvre quand même). `config/settingsSearch.test.js` vérifie que
  chaque titre existe dans les deux langues, pas qu'il est encore affiché.
- **Les mots qu'on tape ne sont pas ceux de l'écran** : synonymes par entrée
  dans `uiText.settingsSearch.keywords`, FR et EN. Le moteur
  (`utils/settingsSearch.js`) ignore accents et mots vides (« changer la
  langue »), accepte un mot à moitié tapé, et une faute de frappe — seulement
  pour un mot que rien ne contient tel quel : sinon « logo » ramenait
  « login ». Le mot exact passe avant le début de mot (« micro » : « Micro et son »
  avant « Microsoft »).
- **Un administrateur trouve les deux espaces depuis l'un ou l'autre** : on
  ne sait pas toujours si une chose se règle pour soi ou pour tous. À égalité,
  le panneau ouvert d'abord ; un résultat de l'autre porte son nom en tête de
  chemin. Ouvrir une page de l'AUTRE panneau a demandé de corriger
  `openPanel` : la page visée était posée sur la nav du panneau sortant, que
  le suivant écrasait en s'enregistrant (le même défaut guettait tout
  raccourci vers une page des réglages pris depuis l'administration).
- **Rien n'est proposé qu'on ne puisse ouvrir** : la recherche suit la colonne
  affichée (« Comptes connectés », l'onglet MyBrain, la carte du mot de passe,
  le son de l'ordinateur n'existent pas partout). Les pages de
  l'administration sont décrites dans `config/adminSections.js`, sorti
  d'`AdminPanel` pour que la recherche les connaisse panneau fermé.
- Écarté : une palette de commandes en surimpression (à la VS Code). La
  colonne est déjà le sommaire ; y chercher garde le résultat à l'endroit où
  on l'aurait trouvé à la main.

**Les réglages suivent le fil de la réunion** (2026-11-14). « Mon compte »
comptait sept entrées, dont quatre réglaient la réunion et non le compte ; l'IA
était à trois endroits (« Préférences IA », « Aide IA », « Détection
d'actions ») ; « actions » avait deux sens — ce que l'IA repère en réunion, ce
que devient la réunion ensuite. La colonne se lit désormais dans l'ordre où
l'on s'en sert : « Mon compte » (les quatre pages de MIA, sous leurs noms),
« Mes réunions » (« Pendant la réunion », puis « Après la réunion », l'ancienne
« Actions »), « Ma bibliothèque », et « Outils » en pied de colonne. Onze
entrées sont devenues neuf ; les écrans et leurs boutons « Enregistrer » n'ont
pas changé, ils ont changé de place.

- **Deux autres découpages ont été écartés.** Cinq pages sans onglets, à
  enregistrement automatique comme dans MIA : le moins d'entrées, mais des
  pages longues sur téléphone, et tous les écrans à réécrire. Une vue
  d'ensemble en page d'accueil, avec l'état de chaque réglage : la plus
  lisible, mais une page qui doit connaître l'état de tout. Le tri par moment
  ne coûte qu'un déménagement.
- **« Aide IA » est sous DEUX pages** : « Pendant la réunion », où elle joue,
  et « Préférences IA », où on la cherche. Même écran, même libellé, même
  icône. La recherche liste l'onglet sous ses deux pages, ses cartes une seule
  fois (sous « Pendant la réunion ») ; « Réglages de l'Aide IA », depuis le
  pupitre d'une réunion, mène à « Pendant la réunion ».
- **L'icône de l'Aide IA est son orbe à la sonnette** (`icons/AiHelpIcon`),
  dans sa teinte — pas la cloche de notification que la colonne portait : on
  reconnaît en réglages ce qu'on a vu en réunion. C'est la seule icône
  d'onglet ; une par onglet allongeait la rangée d'un téléphone sans rien
  dire de plus.
- **Sans droit à l'Aide IA, « Préférences IA » n'a qu'un écran**, et pas de
  rangée d'onglets : une rangée d'un seul onglet n'apprend rien.
- **« Outils » est une section sans groupe** : la colonne et le déroulant du
  téléphone la rangent sous le filet, avec les liens. Sous « Ma bibliothèque »
  sans rien pour l'en détacher, elle aurait eu l'air d'en faire partie. Ses
  deux blocs s'empilent sur une page : aucun n'a de bouton Enregistrer, la
  raison d'être des onglets ne joue pas.
- **Les anciennes adresses tiennent** (`movedConfigTarget`) : `audio`,
  `aiHelp`, `import`, `extension`, `ai/detection`, `ai/corrections` mènent à
  leur place d'aujourd'hui. Piège payé : la redirection doit être la PREMIÈRE
  déclaration réactive de `SettingsPanel`. Svelte les exécute dans l'ordre du
  fichier, une fois par passe ; placée après le calcul des onglets, elle
  changeait la nav trop tard, et la page s'ouvrait sur son premier onglet au
  lieu de celui visé. Aucun test ne monte le panneau entier : c'est vérifié à
  la main, panneau ouvert puis fermé.
- **La rangée d'onglets défile jusqu'à l'onglet ouvert** (`ui/SubTabs`) :
  quatre onglets ne tiennent pas sur un téléphone, et un raccourci peut ouvrir
  le dernier — l'écran affiché, sans rien pour dire lequel c'est.
- Les identifiants `ai`, `actions` et `mail` n'ont toujours pas bougé (les
  constats du diagnostic) ; `meeting` et `tools` sont nouveaux.

### Modale de bienvenue

S'affiche à la première connexion, une seule fois par utilisateur (mémorisé dans
`localStorage`), réapparaît après une déconnexion/reconnexion.

**Courte exprès** : une phrase, trois gestes, un rappel pour la visio. Elle
enchaînait exigences, cinq étapes commentées et un schéma du partage d'écran,
qu'on faisait défiler sans les lire. La visio se guide désormais au démarrage
(« Quel type de réunion ? »), au moment où elle sert.

### Aide

« Aide » et « Déclarer un bug ou une idée », dans « Réglages », sont des
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

---

## 13. Aide IA : l'IA dans la réunion

Pendant une réunion, une IA lit la transcription au fil de l'eau et intervient
par écrit : elle relève une décision qui contredit le projet, répond à une
question, suit l'ordre du jour, propose une idée. Avec myBrain (§12), elle
s'appuie sur la fiche du projet ; sans, sur la seule réunion. Code :
`services/api/lib/aiHelp/`, `routes/aiHelp.js`, `src/stores/aiHelp.js`,
`src/components/aiHelp/`.

### 13.1 Qui décide quoi

| Décision | Qui | Où |
|---|---|---|
| Domaines proposés, mot d'appel, niveau d'intervention | **Administration** | `appSettings{key:'aiHelp'}` |
| Droit « Aide IA », droit « Aide IA avec myBrain » | **Administration**, par groupe | `userGroups.aiHelpAllowed` / `aiHelpMyBrainAllowed` |
| Allumée ou non, domaines, ordre du jour, projet | **Celui qui lance la réunion** | `resume.aiHelp`, et son dernier choix dans `userActionSettings.aiHelp` |

Les deux droits naissent **refusés partout**, groupes fixes compris — à
l'inverse de l'infographie, qui avait un existant à préserver. Déployer n'allume
donc rien. Le droit se relit à **chaque** appel : retiré en cours de réunion, il
éteint l'Aide IA à la lecture suivante (409, jamais 403).

**Lire myBrain ne dépend pas de la politique d'envoi** (`off`/`optin`/`forced`) :
nourrir le cerveau et le consulter sont deux décisions. Il faut une clé dont la
vérification a rendu le droit `lire`.

### 13.2 Décisions, et ce qui a été écarté

- **C'est le modèle de MyBrief qui rédige ; myBrain ne fournit que la matière**
  (`/api/v1/fiche`, `/contexte`, `/recherche` — aucune n'appelle de modèle chez
  lui). Écarté : son `/api/v1/question`, un tour d'agent qui peut durer quatre
  minutes et n'en mène que trois de front par clé. Une intervention qui arrive
  une minute après la phrase qu'elle commente ne sert à rien.
- **Périmètre de l'APPLICATION, pas de la personne** (choix produit, 2026-11-12).
  myBrain identifie la clé, pas l'utilisateur : tout compte qui a le droit « avec
  myBrain » lit le même wiki, hors zones restreintes. Écarté : les droits de la
  personne, qui demandaient une évolution de myBrain. C'est le droit de groupe
  qui fait office de périmètre — d'où les DEUX droits.
- **Une intervention à la fois, sur une « scène » au bas de la transcription.**
  Écartés après maquette : des bulles dans le fil de la transcription (elles
  défilent et disparaissent avec la conversation, précisément quand une alerte
  compte) et une colonne dédiée (elle cache les actions et les notes).
- **Une teinte réservée à l'IA, hors marque** (`--ai`, tokens.css) et un orbe
  animé. Demande explicite après une première maquette aux couleurs de
  l'application : une intervention de l'IA ne s'y distinguait pas d'une carte
  d'action.
- **Des cartes et un signal sonore, pas de voix de synthèse** : elle couperait
  la parole et repasserait dans la transcription. Revu le 2026-11-13 à la
  demande du produit : une voix, choisie par chacun et éteinte par défaut, et
  son écho reconnu (13.14).
- **Le mot d'appel doit OUVRIR la phrase** (`utils/wakeWord.js`) : on ne répond
  jamais à une conversation qui ne nous était pas adressée. C'est le défaut qui
  ferait couper la fonction. Une exception depuis le 2026-11-13 (13.12) : le
  prénom qui FERME la phrase après une virgule — « tu en penses quoi,
  Alfred ? ».
- **Les interventions restent sur la réunion, hors compte rendu.** Ni `/resume`
  ni le dépôt dans myBrain ne lisent `resume.aiHelp`. Décision de produit.
- **Le réglage se reprend « comme la dernière fois »**, et se change en un geste
  avant comme pendant : c'est la contrainte qui a dessiné la carte de l'accueil
  et la pastille du dock (un clic par domaine, sans panneau à ouvrir). Depuis
  le 2026-11-13 les domaines y sont rangés dans un menu — cf. 13.11.

### 13.3 Cadence et coût

Une **lecture** est un appel au modèle. Elle attend deux phrases finalisées,
laisse retomber la rafale (1,5 s), et ne repart pas avant vingt secondes : au
plus 180 par heure, sous le plafond du serveur (240 par compte). Aucune lecture
ne part si seules les questions sont allumées. Une question est un appel de
plus (60 par heure et par compte).

La transcription vient du **corps** de la requête, comme pour la détection
d'actions : la copie en base a jusqu'à vingt secondes de retard. Ce n'est qu'un
texte donné au modèle ; ce qui s'écrit l'est sous le compte du demandeur, sur
une réunion qui est la sienne et qui est **en cours** — hors réunion, ces routes
ne dépensent rien.

⚠️ **Non mesuré.** Aucun appel à un vrai modèle n'a été fait avant la mise en
recette : la justesse du garde-fou, son silence le reste du temps, la latence et
le coût réel restent à éprouver. Le modèle est celui de la détection d'actions
(`OPENAI_MODEL_AI_HELP` pour en changer). Ces appels ne sont pas encore dans les
dépenses estimées des statistiques (§9.2).

### 13.4 Pièges payés

- **Le passage où le projet est reconnu a été lu sans sa fiche.** Tant que le
  projet est inconnu, la lecture demande au modèle le nom qu'il entend, puis à
  myBrain la fiche. Une contradiction dite dans ce même passage était perdue —
  le passage est marqué lu. `watchMeeting` le relit donc aussitôt contre la
  fiche, pour le seul garde-fou du projet (un appel de plus, une fois par
  réunion). Vu au premier parcours de bout en bout.
- **Un nom que myBrain ne résout pas n'est demandé qu'une fois**
  (`aiHelp.lastGuess`) : sinon chaque lecture relançait la même recherche.
- **L'état d'une intervention vit dans une table à part** (`aiHelp.states`), pas
  dans le tableau : une intervention s'ajoute par `$push` pendant que
  l'utilisateur en acquitte une autre, et réécrire le tableau en perdrait une.
  L'identifiant sert de clé de champ : hexadécimal, revérifié avant usage.
- **La réserve sous la transcription** (pour que la dernière phrase reste
  au-dessus de la carte) était écrasée par la colonne flex : 148 px rendus pour
  253 demandés. `flex: none`.
- **Le dock recouvre déjà le bas du panneau Notes** (il est centré sur toute la
  zone principale). Avec la pastille, l'onde est réduite à `8vw` : mesuré à
  1 280 px, 25 px de recouvrement en plus, contre 64 à `14vw`.

- **Un droit donné en administration n'apparaissait qu'après rechargement.**
  L'écran ne lisait ses droits qu'au montage de l'accueil, que l'administration
  ne démonte pas. Ils sont relus à chaque fermeture de panneau et à chaque
  ouverture de réunion (le « + » du téléphone ne passe pas par l'accueil). Vu
  en recette : l'administrateur qui venait d'ouvrir l'Aide IA à son groupe ne la
  trouvait pas — et l'onglet ne disait nulle part qu'aucun groupe n'y avait
  droit. D'où la carte « Qui y a droit ».
- **L'IA ne savait pas à qui elle parlait.** La première version ne lui donnait
  ni le nom du compte, ni son contexte (« Réglages → Préférences IA »), ni les noms des
  intervenants (le store lisait `author`, « Intervenant » partout). Elle reçoit
  maintenant les trois, les mêmes étiquettes que l'écran
  (`effectiveSpeakerLabels`), et — avec myBrain — la fiche de la personne,
  cherchée par son nom et gardée dix minutes, absence comprise.
- **« myBrain ne sait pas » ne se distinguait pas de « myBrain n'a pas été
  consulté ».** Une réponse porte désormais ce que myBrain a apporté
  (`knowledge` : `none`, `down`, `empty`, `offered`, `used`), dit sur la carte ;
  et Administration → Aide IA a une sonde « Tester la lecture », qui montre ce
  que myBrain rend pour une question.
- **Contexte vide → recherche par mots-clés.** L'assemblage de myBrain est fait
  pour une question rédigée ; quand il ne rend aucune fiche, on cherche les noms
  propres de la question (`keywordsOf`) et on lit les deux premières fiches.
  Non mesuré : ajouté sur un cas rapporté (« c'est quoi le projet AMBRE »), pas
  sur un échantillon.

- **Les droits de la clé myBrain étaient une photo qu'on ne reprenait jamais.**
  `verified.droits` date du dernier test de connexion. Une clé créée pour
  nourrir le cerveau — tout ce que myBrief demandait jusque-là —, à laquelle on
  AJOUTE « lire » dans myBrain, gardait ici « nourrir » seul : l'Aide IA
  concluait « pas de lecture », sans jamais reposer la question, et rien à
  l'écran ne le disait. `refreshMyBrainRights` redemande à myBrain : de
  lui-même quand un compte qui a le droit du groupe bute sur une clé « sans
  lire » (au plus toutes les dix minutes, cinq secondes d'attente), à chaque
  ouverture de l'onglet d'administration, et dès que myBrain refuse la clé en
  pleine réunion (le cas inverse : « lire » retiré).
- **« Elle ne cherche pas dans myBrain » avait quatre causes, toutes
  muettes** : le groupe sans le droit « avec myBrain », la clé sans « lire »,
  myBrain non relié, myBrain qui ne rend rien. `aiHelpAccess` rend la raison
  (`brainReason`) ; elle est dite sous la réponse (`knowledge` : `no_right`,
  `no_key_right`), au pupitre, et dans Administration → Aide IA pour le compte
  de l'administrateur lui-même (`me`, calculé par la fonction qui décide en
  réunion). Signalé deux fois en recette avant d'être rendu lisible.
- **La première phrase d'une réunion ne déclenchait rien.** La scène est montée
  avant que la réunion ait son identifiant ; le store, qui ignore tout sans lui,
  ne faisait donc son « premier passage » qu'à la première phrase — et la
  rangeait parmi les lignes « déjà là ». Ni mot d'appel, ni lecture. Vu en
  jouant l'ordre du jour dicté, dont c'est justement la phrase. `AiHelpStage`
  rappelle maintenant l'observation dès que l'identifiant existe.

### 13.5 L'ordre du jour dicté (2026-11-12)

Demande : définir l'ordre du jour PENDANT la réunion, que l'IA le retienne, le
restitue, dise s'il a été tenu, et signale à la fin ce qui n'a pas été abordé.

- **Un seul ordre du jour, quelle que soit son origine.** `aiHelp.agenda` reste
  un texte, un point par ligne ; un point annoncé à voix haute y est ajouté par
  le serveur. Écarté : une liste « entendue » à côté de la liste saisie — deux
  listes à l'écran, et un état à suivre pour chacune.
- **Deux chemins pour un point dicté.** Annoncé sans appeler l'IA (« à l'ordre
  du jour… »), il est retenu par la LECTURE (`agenda_new`). Dicté à l'IA
  (« Alfred, à l'ordre du jour… »), par la RÉPONSE (`agenda_add`) — sinon elle
  aurait répondu « c'est noté » sans rien noter, la lecture ne passant que
  vingt secondes plus tard.
- **Ce que l'utilisateur retire ne revient pas.** `aiHelp.agendaHeard` garde la
  clé des points venus de la réunion et de ceux qu'on a retirés ; la lecture ne
  les remet pas, même redits. Une demande expresse à l'IA passe outre.
- **Pendant la réunion, l'écran n'envoie plus jamais le texte entier** : il
  effacerait un point que l'IA vient de retenir. Il envoie « ajoute ce point »,
  « retire celui-là » ; le texte saisi sur l'accueil est un brouillon qui part
  une fois. Et le serveur relit l'ordre du jour APRÈS l'appel au modèle, qui
  dure plusieurs secondes.
- **Un point traité le reste.** Le modèle ne lit que la fin de la
  transcription : sans cliquet, le premier point d'une longue réunion redevenait
  « pas encore abordé », et le rappel de fin l'aurait compté oublié. Le prompt
  reçoit l'état connu de chaque point, et `todo` ne défait ni `now` ni `done`.
- **Le rappel de fin ne dépend pas de la plume du modèle.** S'il dit « la
  réunion se termine » (`ending`) et qu'un point reste `todo`, l'intervention
  part : son texte s'il en a écrit un, la liste des points sinon. Pas deux fois
  pour les mêmes points en dix minutes ; rien si tout est traité ; rien en
  « Discrètes ». Il sonne, comme une contradiction.
- **Non mesuré.** Aucun vrai modèle : ni la justesse de « la réunion se
  termine », ni celle des points retenus (un sujet évoqué pris pour un point
  annoncé), ni la tenue des états sur une longue réunion.
- **Limite connue.** Deux libellés ne sont le même point qu'à la casse, aux
  accents et à la ponctuation près. « Le budget » et « Budget 2027 » font deux
  points si le modèle ne les rapproche pas — la consigne le lui demande.

### 13.6 Le prénom qui déclenche, dans la teinte de l'IA (2026-11-12)

Demande : quand le mot d'appel déclenche l'Aide IA, il apparaît d'une autre
couleur dans la transcription.

- **Coloré = entendu, jamais l'inverse.** `wakeWordSpan` (où est le prénom) et
  `matchWakeWord` (a-t-il déclenché) lisent le texte par la même fonction. Et
  seules les lignes que le store a réellement prises pour un appel
  (`aiHelpCalledLines`) sont marquées : « Alfred » cité en milieu de phrase,
  ou dit quand les questions sont coupées, reste du texte ordinaire.
- **`EditableTranscript` ne connaît pas l'Aide IA** : il reçoit une fonction
  (`aiMark`) qui rend, pour une ligne, ce qu'il faut écrire autrement.
  `LiveTranscript` la REFAIT quand la liste des lignes, le mot d'appel ou la
  langue change — la réactivité de Svelte ne voit pas ce qu'une fonction lit
  en dedans (le piège déjà payé quatre fois).
- La ligne reste un seul texte : le double-clic l'édite entière.

### 13.7 Tout allumé d'office, et des gestes (2026-11-12)

Demandes : toutes les options actives par défaut et invisibles avant la
réunion ; des actions (poser un tag, fermer sa fenêtre, ajouter une note, un
rappel sonore dans N minutes) ; une sonnette d'hôtel au centre de l'orbe.

- **Le réglage de départ est posé par le SERVEUR**, à la première lecture d'une
  réunion qui n'en a pas (`POST /ai-help/session` réduit à `meetingId`) : allumée,
  tous les domaines. Écarté : le laisser à l'écran, comme avant — une page
  rechargée en pleine réunion repoussait « tout allumé » par-dessus ce qu'on
  venait de couper. Le store ne pousse plus rien à l'ouverture, il relit.
- **Plus de « comme la dernière fois »** pour l'état et les domaines : sans
  écran avant la réunion, un domaine coupé un jour le restait sans qu'on le
  voie. Seul le signal sonore suit le compte.
- **La carte de l'accueil n'est plus montée** (`AiHelpSetupCard`, ses styles
  `.welcome-with-ai` et le brouillon d'ordre du jour du store restent dans le
  dépôt, inactifs) : à supprimer ou à remonter selon ce que donnera l'essai.
- **Un geste n'est jamais exécuté par le modèle.** Il le nomme (`actions` de la
  réponse) ; le serveur le vérifie — le tag doit exister chez ce compte, le
  délai tenir entre 1 et 240 minutes — et garde ce qui a été fait (`acts`) sur
  la réponse ; l'écran énonce ces lignes lui-même. Sans cela, la phrase du
  modèle annonçait un tag posé alors qu'aucun ne portait ce nom.
- **Elle ne crée pas de tag.** Trente au plus par compte, et un nom mal
  transcrit en userait un : un tag inconnu est dit, pas créé.
- **Le tag et la note sont faits par l'ÉCRAN** (`runAction`, stores/aiHelp.js) :
  les notes d'une réunion en cours vivent dans `App.svelte` et la base les
  suit — une note écrite côté serveur aurait été écrasée à la sauvegarde
  suivante. Elle passe par une file (`aiHelpNotes`) que vide
  `MobileMeetingOverlays`, seul composant lié aux notes qui soit monté pendant
  toute réunion, à l'ordinateur comme au téléphone. Aucune ligne dans
  `App.svelte`.
- **Un rappel est une intervention DATÉE** (`kind: 'reminder'`, `dueAt`), gardée
  avec la réunion : l'écran la tait jusqu'à son heure, un minuteur la fait
  sonner, et un rechargement de page la réarme. Écarté : un minuteur seul, que
  le moindre rechargement aurait perdu.
- **« Ferme », « merci » ne passent pas par le modèle** (`isDismissal`) : deux
  secondes d'attente pour une carte qui dit « je ferme » seraient l'inverse du
  service. Volontairement étroit — une phrase qui ne dit que cela ; le reste va
  au modèle, qui sait aussi fermer (`{"type":"close"}`).
- **Non mesuré** : aucun vrai modèle n'a nommé ces gestes ; un geste pris à
  tort (une phrase de réunion lue comme un ordre) reste à observer en recette.

### 13.8 Le pupitre est une conversation (2026-11-12)

Demande : la fenêtre de « Demander » doit être surtout une zone où l'IA
répond, avec quelques exemples et rien de plus ; les échanges s'empilent vers
le bas, comme un fil de discussion ; on y demande une synthèse, l'ordre du
jour, les actions, des idées.

- **Le fil remplace le journal.** Il montre tout ce que l'IA a dit, réponses
  et interventions spontanées, dans l'ordre. Une question posée là reçoit sa
  réponse là, rangée d'emblée (`seen`) : elle ne ressurgit pas sur la scène
  quand on referme. Écarté : garder la scène pour toutes les réponses — le
  pupitre se refermait à chaque question, on ne pouvait pas enchaîner.
- **Les réglages passent derrière une icône** (`AiHelpSettings`,
  `aiHelpDeskView`) : sur téléphone c'est le seul endroit pour éteindre l'IA
  ou couper un domaine, on ne pouvait pas les retirer. « Corriger », sur la
  carte de l'ordre du jour, y mène directement.
- **Une question porte sur la réunion ENTIÈRE.** La transcription jointe à une
  question passe de 12 000 à 48 000 caractères, et le prompt reçoit les
  actions déjà relevées (`<actions_relevees>`, celles que le panneau montre) :
  « fais une synthèse » ne résumait que le dernier quart d'heure. Coût : une
  question pèse jusqu'à ~12 000 jetons d'entrée sur une longue réunion — une
  question, pas une lecture au fil de l'eau, qui reste courte.
- **Une réponse peut être une liste** : 1 800 caractères au plus, sauts de
  ligne gardés (`block`), rendus tels quels (`white-space: pre-line`). Sur la
  scène, une longue réponse défile au lieu de couvrir la transcription.
- **Piège payé : `$: … tick().then(…)`.** Suivre le bas du fil par une
  instruction réactive qui appelle `tick()` relançait un rendu à chaque rendu :
  la boucle d'événements ne rendait plus la main (le test de composant ne se
  terminait jamais — c'est lui qui l'a montré). `afterUpdate` fait la même
  chose sans rien programmer.
- **Non mesuré** : la qualité d'une synthèse sur une vraie réunion, et sa
  latence avec 48 000 caractères de transcription.

### 13.9 Le Markdown des réponses (2026-11-12)

Signalé en recette : les réponses s'affichaient en texte brut, astérisques et
crochets compris — myBrain écrit ses fiches en Markdown, le modèle le reprend.

- **Un arbre, jamais du HTML.** `src/utils/miniMarkdown.js` lit un Markdown
  simple (gras, italique, code, listes, liens, citations ; titres et tableaux
  aplatis) en un arbre de nœuds que `AiMarkdown` rend élément par élément.
  Écarté : une bibliothèque de Markdown et `{@html}` — l'appli n'insère de HTML
  brut nulle part, et ce texte vient d'un modèle qui a lu une transcription et
  un wiki. Il aurait fallu l'assainir, et faire confiance à l'assainisseur.
- **Un lien n'est cliquable qu'en http(s)**, ou relatif à la racine quand on
  connaît l'adresse de myBrain (seule source de liens relatifs). Tout le reste
  — `javascript:`, `data:` — n'est que son texte.
- **Pas de regard en arrière dans les expressions régulières** (`(?<=…)`) : les
  Safari d'avant 16.4 les refusent au chargement du script, et c'est toute
  l'appli qui ne démarrerait pas. D'où la lecture caractère par caractère.
- **Le gabarit en ligne tient sur une ligne** (`prettier-ignore`) : un retour à
  la ligne entre deux nœuds est un espace à l'écran (« gras , »).
- La réponse qui s'écrit mot à mot referme le gras et le code restés ouverts
  (`closeOpenMarkdown`), pour qu'on ne voie pas passer la syntaxe.

### 13.10 Une seule fenêtre, et sa taille (2026-11-13)

Demandes : les fenêtres de réponse se superposaient — une seule modale, une
seule chose à fermer ; pouvoir agrandir et réduire la fenêtre et son texte,
par des boutons et à la voix.

- **Une carte, la dernière.** La scène ne montre plus qu'une intervention ;
  les autres ne se parcourent plus carte après carte (« 1 autre », « 2
  autres »), elles se lisent dans la conversation, que la carte ouvre d'un
  bouton. Écarté : empiler toutes les interventions ouvertes dans la carte —
  trois réponses couvraient la transcription.
- **Fermer ferme tout** (`closeAiHelpCards`) : la croix, « Compris », Échap,
  « Demander » une seconde fois (`toggleAiHelpDesk`), la croix de la
  conversation, « Alfred, ferme ». Ce qui reste ouvert est rangé avec elle.
  Conséquence assumée : une alerte non lue derrière une réponse est rangée
  aussi — elle reste dans le fil, et la carte annonçait qu'il y en avait
  d'autres.
- **La taille est UNE variable** : la scène pose `--ai-scale` (1 ; 1,2 ; 1,45)
  et chaque taille de texte des composants de l'Aide IA s'écrit
  `calc(Npx * var(--ai-scale, 1))`. Écarté : `zoom`, qui fausse les mesures de
  hauteur dont la transcription a besoin pour garder sa dernière ligne au-dessus
  de la fenêtre. Hors de la scène (pastille du dock), la variable est absente
  et vaut 1.
- **La largeur suit, sans sortir de la colonne de la transcription** (640, 780,
  940 px au plus). À 1 280 px de large la colonne n'en offre que 580 : la
  fenêtre y grandit en hauteur et en texte, pas en largeur. Écarté : la laisser
  déborder sur les actions et les notes.
- **Gardée sur l'appareil** (`localStorage`), pas sur le compte : la bonne
  taille d'un écran de salle n'est pas celle d'un téléphone.
- **« Agrandis », « plus petit » ne passent pas par le modèle**
  (`sizeRequest`), comme « ferme » ; dits autrement (« j'ai du mal à te
  lire »), le modèle nomme le geste (`{"type":"size"}`) et l'écran le fait.

### 13.11 Des gestes sur la réunion, le mot d'appel visible, les domaines en menu (2026-11-13)

Demandes : pouvoir demander à l'IA de mettre en pause, de reprendre, de
terminer ; de corriger ou de remplacer un texte de la transcription ; le compte
rendu et son template, avant la fin de la réunion. Faire apparaître le mot
d'appel, discrètement, près de l'orbe. Retirer de la barre les quatre boutons
de domaine, qui prennent trop de place, sans perdre le moyen de les couper.

- **Même circuit que les autres gestes** : le modèle NOMME (`meeting`,
  `summary`, `replace`), le serveur vérifie et rend `actions`, l'écran fait.
  Ce qui est refusé est DIT sur la réponse (`acts[].ok` faux) et ne part pas :
  « reprends » sur une réunion qui tourne, un template qu'aucun ne porte, un
  passage absent de la transcription.
- **Ni l'enregistrement ni la transcription ne vivent dans un store** : ils
  sont dans `App.svelte`, plafonné. Le store pose donc le geste dans une file
  (`aiHelpCommands`, `aiHelpEdits`), lue par un composant déjà monté pendant
  la réunion et qui tient déjà la fonction : `AiHelpMeetingBridge` (dans
  `MobileMeetingOverlays`, qui a pause / reprise / enregistrer) et
  `AiHelpStage` (dans `LiveTranscript`, qui a les lignes et relaie déjà
  l'événement `edit` d'une correction à la main). App n'y gagne que trois
  attributs — payés par `meetingElapsed`, sorti dans `utils/formatUtils.js`.
- **« Termine » = « Enregistrer sans résumé ».** Écarté : ouvrir la feuille
  « Terminer la réunion ? » — elle demande un clic, alors que la commande sert
  à s'en passer, et l'enregistrement continuerait si personne ne répond.
  Écarté aussi : ouvrir le sélecteur de templates, qui laisse la réunion ni
  rangée ni résumée si on s'en va. Ranger ne perd rien, et le compte rendu
  reste possible depuis l'historique. **Supprimer n'est pas un geste de l'IA**,
  et ne doit pas le devenir : une phrase dite en réunion ne doit rien pouvoir
  effacer.
- **« Reprends » ne s'entend pas** : la pause coupe les pistes du micro, donc
  la transcription, donc le mot d'appel. Il se demande par écrit. Le texte de
  la pause le dit, pour qu'on ne reste pas à parler à une IA sourde.
- **Le pont relit l'état AU MOMENT du geste** (`isPaused`, `live`), et ne
  rejoue ni une pause ni une reprise sans objet : `resumeRecording` sur une
  réunion qui tourne remettrait le chronomètre à zéro et doublerait son
  minuteur. Le serveur le vérifie aussi (`paused`, dit par l'écran) — mais
  plusieurs secondes séparent la question du geste.
- **Les templates sont NOMMÉS par l'écran** (`templates`, dans le corps de la
  question) : les templates par défaut vivent dans le frontend
  (`config/templates.js`), le serveur ne les connaît pas. Ce n'est pas une
  donnée qu'on croit : elle ne décide que de ce que ce même écran s'entendra
  demander. Un nom inconnu ne termine pas la réunion — on ne coupe pas un
  enregistrement sur un nom mal transcrit.
- **« À la fin, le compte rendu avec… »** (`when: 'end'`) pose le template
  courant d'App (le sélecteur le présélectionne) et le store s'en souvient :
  « termine » rédige alors ce compte rendu au lieu de ranger. Cette mémoire
  est dans le store, pas sur la réunion : un rechargement de page l'oublie.
- **Une correction lit comme une correction automatique**
  (`replacePassage`, dans `utils/transcriptCorrections.js`) : mot entier, casse
  et accents indifférents, majuscule de début de phrase gardée. Le serveur fait
  la même lecture sur la transcription jointe (`saidInMeeting`), en écartant
  la question elle-même : dictée, elle contient toujours le mot à remplacer.
  L'écran n'écrit ni la ligne en cours, ni une phrase adressée à l'IA
  (`aiHelpCalledLines`), et ne vide jamais une prise de parole.
- **Le store relit en place une ligne qui a changé** (`lineOf`) — corrigée par
  l'IA, à la main, ou une voix qu'on vient de nommer. Avant, sa copie de la
  transcription gardait le premier texte lu : l'IA répondait d'après un nom
  déjà corrigé à l'écran. La comparaison porte sur le texte brut : une ligne
  inchangée ne coûte rien, même à chaque delta du direct.
- **Écarté : reconnaître « pause » ou « termine » sans le modèle**, comme
  « ferme ». Fermer une fenêtre par erreur ne coûte rien ; couper un
  enregistrement, si. Les deux secondes du modèle sont le prix du jugement
  (« on termine bientôt » n'est pas « termine »), que la consigne demande
  expressément.
- **Le mot d'appel sous « Aide IA »**, en petit, dans la pastille ; sur
  téléphone il REMPLACE le libellé du bouton — cinq commandes de front, pas la
  place d'une ligne de plus. Il n'est écrit que s'il déclenche quelque chose
  (allumée ; « questions ouvertes » aussi jusqu'au 2026-11-14, cf. 13.15).
  Écarté : une bulle d'aide à la première
  réunion — elle disparaît le jour où l'administrateur change le prénom.
- **Les domaines dans un menu**, derrière un bouton de la pastille. Écarté :
  les laisser aux seuls réglages du pupitre — une fenêtre de la moitié de
  l'écran pour un interrupteur. Écarté : garder les icônes en plus petit —
  elles ne disaient déjà leur nom qu'au survol. Le menu dit le nom, l'effet et
  l'état ; un point sur le bouton dit qu'un domaine est coupé. Calé sur le bord
  DROIT de la pastille : à gauche, il sortait de l'écran sous 800 px. La
  pastille passe de ~400 à ~290 px ; ses libellés tiennent jusqu'à 1 120 px de
  large (1 280 avant).
- **Non mesuré** : la tenue du modèle sur ces consignes en réunion réelle —
  faux « termine », passage mal recopié —, et le coût d'un « remplace
  partout » sur une transcription de plusieurs heures (une écriture par ligne
  changée, par l'événement `edit`).

### 13.12 Une demande dictée : l'entendre entière, l'entendre juste, chercher large (2026-11-13)

Trois reproches après usage : « il coupe trop tôt et comprend la moitié
de la phrase », « la transcription écorche les mots, il faudrait trouver des
équivalents », « il trouve très peu d'informations dans myBrain ». Chacun avait
une cause précise dans le code.

**Elle coupait trop tôt.** La question partait dès que la ligne portant le mot
d'appel était bouclée — or une ligne se boucle à la première ponctuation de fin
de phrase, ou à la première respiration (un segment de la détection de voix se
ferme après 500 ms). « Alfred, j'ai une question. Est-ce que… » envoyait « j'ai
une question » ; la suite, sans mot d'appel, n'était lue par personne.
`utils/voiceRequest.js` écoute maintenant la demande jusqu'au SILENCE de celui
qui parle, mesuré sur son texte — lignes bouclées et ligne en cours, du même
flux :

| La demande a l'air… | Elle part après |
|---|---|
| finie (une question, une phrase complète) | 2,5 s sans mot nouveau |
| en suspens (une amorce — « j'ai une question », « tu peux me dire » —, une virgule, un mot de liaison en dernier, pas de ponctuation sur moins de six mots) | 4 s |
| un geste (« ferme », « agrandis ») | 0,9 s |

Plafond : 30 s. 2,5 s : une respiration en milieu de phrase fait 1 à 2 s, et
la transcription suit la voix avec une demi-seconde de retard. Écarté : se fier
à la ponctuation seule — le moteur met un point à la fin de chaque segment,
finie ou non, d'où l'heuristique `looksFinished`, faite pour se tromper du côté
« pas finie ». Écarté aussi : un seul délai long pour tout — « Alfred, ferme »
ne peut pas attendre quatre secondes.

L'inverse existait aussi : une demande dite sans ponctuation finale restait
« en cours » jusqu'à dix secondes, et rien ne partait tant que personne ne
reparlait. Lire la ligne en cours règle les deux.

**Deux phrases d'une traite n'étaient lues qu'à moitié.** Sous le modèle par
défaut, la ponctuation boucle une ligne sans changer de segment : la ligne
suivante porte le MÊME `itemId`. Le store reconnaissait une ligne par lui seul
— la seconde écrasait la première dans sa copie de la transcription, tour à
tour à chaque rendu, et n'était jamais lue : ni pour un mot d'appel (« Bon.
Alfred, … » ne déclenchait rien), ni pour une lecture, ni dans la transcription
jointe aux questions. `aiHelpLineKey` porte maintenant l'horodatage de la
ligne, et un rang pour celles qui se ressembleraient encore.

**Le prénom se compare à l'oreille** (`utils/soundsLike.js`, copie serveur dans
`lib/aiHelp/soundsLike.js`, tenues ensemble par un test de parité) : mêmes
lettres, puis même clé phonétique (« Alfrède », « Halfred », « Alfraid »), puis
une lettre d'écart à partir de cinq lettres, deux à partir de neuf. Jamais un
mot PLUS LONG d'une lettre qui s'entend : « Alfredo » n'est pas « Alfred » — le
test d'origine le dit, il tient toujours. « Al Fred » est recollé. Le nom d'un
tag ou d'un template demandé à l'IA passe par la même comparaison
(`closestName`), à condition d'être SEUL à sonner ainsi : deux candidats, et
rien n'est pris.

**Le prénom en fin de phrase**, après une virgule, appelle aussi : c'est la
ponctuation d'une adresse, et la phrase qu'il ferme est la question. Sans la
virgule (« j'en ai parlé à Alfred », « on est chez My Alfred ») : rien. C'est
revenir sur une décision de 13.2, à la demande (« qu'il regarde en arrière ») ;
le garde-fou reste la virgule, et trois mots au moins avant elle.

**« Regarder en arrière » est une consigne, pas un mécanisme.** La
transcription part déjà avec chaque question ; ce qui manquait, c'est de dire
au modèle de s'en servir. Une question dictée porte maintenant deux consignes :
relire les dernières répliques pour la compléter, et rapprocher à l'oreille un
nom qui ne correspond à rien. Une question écrite ne les reçoit pas.

**myBrain : chercher les NOMS, sous toutes leurs graphies**
(`lib/aiHelp/brainSearch.js`). Relu dans le code de myBrain : sa recherche est
un plein texte par préfixe qui exige TOUS les mots et ne tolère aucune faute ;
son contexte n'épingle une fiche nommée que par égalité stricte ; sa fiche par
nom tolère une lettre mais ne rend pas la fiche qu'elle jugeait probable. Une
question dictée dont un nom est écorché tombait dans les trois. Et même bien
écrite, elle ne lisait que le contexte — deux fiches de repli si, et seulement
si, il était vide.

Désormais, avec myBrain :

1. en même temps que le contexte, le modèle PRÉPARE la recherche
   (`searchPlanPrompt`) : la question telle qu'on a voulu la poser, les noms
   sur lesquels elle porte avec leurs graphies plausibles à l'oreille — il a
   sous les yeux la fin de la réunion, les tags, le projet, les notes, le
   vocabulaire de l'organisation —, et un à trois sujets ;
2. chaque nom est cherché seul : la fiche qui porte ce nom, le plein texte sur
   ce nom, puis — si aucun TITRE ne lui ressemble — le plein texte sur ses
   trois premières lettres, dont on ne garde que les titres qui sonnent pareil.
   C'est ce dernier pas qui retrouve Marquet sous « Market » sans le modèle ;
3. les fiches désignées par leur nom passent devant celles qui le citent ;
   quatre au plus sont lues et jointes AVANT le contexte assemblé ;
4. si le contexte était vide, il est redemandé sur la question comprise.

Coût : **un appel de plus au modèle par question** quand myBrain est lu
(compté à part, `aiHelp.calls.plan`), 8 s au plus — au-delà, ou en panne, la
recherche part des noms tels qu'écrits. Et 2 à 3 lectures de myBrain par nom,
six noms au plus. Écarté : la route `/mcp` de myBrain, qui liste tous les noms
de fiches — un second protocole à tenir, deux mille noms à relire par question.

⚠️ **Non mesuré.** Aucun appel à un vrai modèle ni à un vrai myBrain : ni la
qualité des graphies proposées, ni la latence ajoutée (une préparation, puis
des lectures), ni le taux de faux départs du prénom en fin de phrase. Vérifié
dans le navigateur avec un canal de transcription simulé qui parle comme le
modèle par défaut (mot à mot, un segment, pas de `completed`), et contre un
faux myBrain strict comme le vrai.

**Limites.** La sonde « Tester la lecture » d'Administration → Aide IA ne
montre toujours que le contexte de myBrain, pas la recherche élargie. Une faute
en DÉBUT de nom (« Zabre ») échappe au préfixe : seule la préparation du modèle
la rattrape. Après l'envoi d'une demande, ce que la personne ajoute sans redire
le prénom n'est pas pour l'IA. Côté myBrain, `/fiche?nom=` perd la fiche qu'il
juge « probable » (elle n'est ni rendue ni listée en candidat) : à corriger
là-bas, ce contournement-ci n'en dépend pas.

### 13.13 Un son par sens (2026-11-13)

Demande : « un petit son, une sonnette d'hôtel, courte mais audible, quand
l'aide intervient pour une idée ; quand elle identifie une action à réaliser,
un son bref et sobre qui suggère qu'elle a compris et qu'elle agit ».

- **Trois sons, pas un** (`utils/chime.js`) : le carillon reste à l'urgent
  (contradiction, rappel, fin de réunion) ; l'idée a la sonnette — le visage
  de l'IA, déjà une sonnette de comptoir (13.7) ; le geste fait, deux frappes
  de maillet à la quinte montante. Écarté : un seul son pour tout — on ne
  saurait plus, sans regarder, s'il faut lever les yeux.
- **Le geste ne s'entend que FAIT.** `runAction` dit s'il a agi : un tag
  introuvable, un template que l'écran ne connaît plus restent muets — un
  « compris » sur un geste raté mentirait. Un rappel posé compte comme fait.
  « Ferme » et « agrandis », traités sans le modèle, s'entendent aussi.
- **Un son par lecture** : l'urgent couvre l'idée arrivée avec lui.
- **Une réponse reste muette** : on l'attend, les yeux sur l'écran.
- **Niveaux mesurés** (rendu hors ligne, crête / RMS max sur 50 ms) :
  carillon 0,10 / 0,04 ; sonnette 0,19 / 0,08, audible 0,6 s ; geste
  0,09 / 0,03, 0,16 s. La sonnette est la plus forte, à la demande — et dans
  l'aigu (si 6, ~2 kHz), qui perce la conversation sans la couvrir.

⚠️ **Non mesuré** : si la sonnette, captée par le micro, repasse dans la
transcription des participants à distance — le risque que le carillon
évitait en restant faible. Un son n'est pas de la parole, mais un moteur de
transcription peut en tirer un mot.

### 13.14 Le son verrouillé, le bouton muet, les préférences, la voix (2026-11-13)

Retour après 13.13 : « les sons sont très bien, mais aucun son depuis
l'application web ». Puis : couper le son pendant la réunion ; un menu dédié
pour les réglages par défaut ; faire parler l'Aide IA, avec l'outil choisi
parmi les IA renseignées — « tout doit être bien testé avant d'être proposé ».

- **Le son était VERROUILLÉ par Chrome.** Mesuré dans Chrome : une page sans
  aucun clic crée un contexte audio `suspended`, et `resume()` ne rend jamais
  la main ; après un clic, même sept secondes plus tard, il joue. La page de
  test jouait dans un clic ; l'application, après une réponse réseau. Une
  réunion peut démarrer sans un clic dans l'onglet (extension, `#record`) puis
  se mener à la voix. Désormais : le contexte naît au PREMIER geste de la page
  (`armAiHelpAudio`, monté avec la scène) ; un son dû pendant le verrou est TU,
  pas mis en attente — il éclaterait au premier clic, en retard sur ce qu'il
  annonçait ; la cloche porte alors un point et son clic déverrouille.
  ⚠️ Non mesuré : l'atténuation des « communications » de Windows (−80 % par
  défaut quand un micro est ouvert) pourrait encore rendre les sons faibles en
  réunion — hypothèse, rien ne l'a montré.
- **Le muet vaut pour UNE réunion, et ne part pas au serveur.** Avant, la
  cloche du pupitre écrivait `aiHelp.sound` sur le compte : couper le son
  d'une réunion le coupait pour toutes, sans le dire. Elle coupe maintenant
  sons ET voix pour cette réunion (`setAiHelpSound`) ; un rechargement de page
  le rétablit (assumé, documenté). `sound` reste accepté par
  `/ai-help/session`, ignoré : un onglet resté sur l'ancienne version l'envoie.
- **Les préférences vivent sous `aiHelp.preferences`** (Réglages → Pendant la réunion → Aide IA,
  `lib/aiHelp/preferences.js`) : démarrage (allumée, domaines), les sons (quatre depuis 13.16),
  voix. Écarté : relire `aiHelp.enabled` / `aiHelp.domains`, restés de « comme
  la dernière fois » (13.7) — des comptes y gardent un `enabled: false` posé
  sans le savoir, leurs réunions auraient démarré éteintes. Seul un ancien
  `sound: false` est repris : il coupe tous les sons.
- **La voix, trois moteurs.** Le navigateur (`speechSynthesis`, gratuit, local)
  et, sur les clés de l'installation, OpenAI (`/audio/speech`) et Mistral
  (Voxtral TTS). Un moteur n'est PROPOSÉ qu'après un essai réussi, modèle par
  modèle (`voiceCatalog`, gardé 6 h par clé, 10 min s'il a échoué) : c'est la
  lecture littérale de « testé avant d'être proposé ». Relevés de documentation
  du jour : les trois modèles OpenAI s'arrêtent le 6 janvier 2027 (`retiresAt`
  les retire ce jour-là, l'essai le ferait de toute façon) ; Mistral rend
  l'audio en base64 (`audio_data`) et refuse tout champ inconnu (422 sur
  `speed`) — rien d'autre ne part que `model`, `input`, `voice_id`,
  `response_format`.
- **Le store choisit quoi lire, un composant en fait des phrases.** La file
  `aiHelpSpeech` porte des interventions ; `AiHelpVoice` (monté avec la scène)
  a les libellés (« Contradiction. … », « C'est l'heure du rappel : … ») et
  confie le texte à `lib/aiHelp/voice.js`, une phrase à la fois. Couper le son,
  « Alfred, ferme », fermer la fenêtre : elle se tait, file comprise.
- **Son écho n'est pas relu** (`utils/speechEcho.js`) : une ligne de trois mots
  au moins dont 70 % viennent d'une phrase dite depuis moins de six secondes
  est écartée de ce que l'IA lit et écoute. Écarté : couper le micro pendant
  qu'elle parle — on perdrait qui l'interrompt. La ligne reste, elle, dans la
  transcription (App.svelte, plafonné) : défaut documenté.
- **Compté, pas encore chiffré** : chaque phrase lue par OpenAI ou Mistral
  incrémente `aiHelp.speech.<moteur>.calls/chars` sur la réunion.

⚠️ **Non mesuré.** Aucun appel à un vrai OpenAI ni à un vrai Mistral : le
parcours complet (essai des modèles, Réglages, « Écouter », lecture dans la
page) a été vérifié dans le navigateur contre de faux fournisseurs qui rendent
un vrai WAV, et la voix du navigateur sur celle du système. Ni la latence d'une
phrase, ni la qualité des voix en français, ni les seuils de l'écho face à une
vraie transcription.

### 13.15 Questions-réponses coupées : les gestes restent (2026-11-14)

Retour : « quand on désactive la discussion avec l'IA, le mot-clé qui permet
justement de la déclencher ne marche plus — on ne peut plus actionner les
autres demandes ». Exact : tout ce qu'on dit à « Alfred, … » passe par
`/ai-help/ask`, gestes compris (13.7, 13.11), et le domaine `qa` fermait ce
chemin à trois endroits — l'écoute du prénom, l'envoi, la route (409).
Personne ne l'avait décidé : les gestes sont arrivés après les questions et en
ont hérité l'interrupteur. L'écran le cachait : « Répond à « Alfred, … » ».

- **Le prénom s'écoute dès que l'Aide IA est allumée**, et le pupitre garde
  son champ. `qa` ne coupe plus que les RÉPONSES : la route passe
  `answers: false` au moteur, qui ne lit ni myBrain ni l'historique et donne
  une consigne à part (`commandPrompt`) — les gestes, la dictée de l'ordre du
  jour, rien d'autre.
- **C'est le modèle qui dit si c'était un geste** (`command`). Écarté : une
  liste de verbes côté écran — « Alfred, on fait une pause ? » est un geste,
  « Alfred, c'est quoi la pause ? » une question. Le prix : une question posée
  réponses coupées coûte un appel (compté), pour un 409 `ai_help_domain_off`.
  Le modèle qui répond quand même n'est pas cru : sans `command`, sa phrase est
  jetée ; du texte libre aussi. Avec un geste, une phrase de 280 caractères au
  plus — confirmer, ou demander confirmation (« dans le doute… », 13.11).
- **Le refus se voit sur la scène** : la carte « en attente » d'une question
  dictée s'efface ; le bandeau `questions_off` dit pourquoi. Au pupitre, la
  même phrase vient de l'erreur.
- **Le droit retiré par l'administration suit la même règle.** Un groupe sans
  « Questions-réponses » peut encore demander un tag ou une pause : un appel au
  modèle par demande. Si un administrateur a coupé le domaine pour limiter
  les appels, ce n'est plus tout à fait le cas — à revoir s'il le faut, par un
  droit « gestes » à part.

⚠️ **Non mesuré** : la justesse du tri geste / question par le vrai modèle.
Vérifié avec un faux modèle (route, store, écran) ; « Alfred, ferme » et
« agrandis » ne passent pas par le modèle, ils sont sûrs.

### 13.16 Le minuteur (2026-11-17)

Demande : « que les actions de l'aide IA puissent déclencher un minuteur
visible à l'écran ; l'aide pourra l'arrêter ou le modifier à la demande ; à la
fin du décompte, une petite mélodie de quelques secondes. Simple, design,
cohérent dans l'interface et robuste dans le fonctionnement. »

- **Un geste de plus, pas une variante du rappel.** Le rappel se TAIT jusqu'à
  son heure puis dit de quoi il s'agit ; le minuteur se VOIT décompter et ne
  dit que « c'est fini ». Écarté : étendre `reminder` d'un drapeau « visible »
  — un rappel est une intervention (carte, « Compris », gardée dans le fil),
  un minuteur n'en est pas une : il n'a rien à dire après zéro.
- **Un seul, trois verbes** (`lib/aiHelp/timer.js`) : `start` REMPLACE celui
  qui tourne, `add` le rallonge ou le raccourcit, `stop`. Écarté : plusieurs
  minuteurs — « arrête le minuteur » deviendrait ambigu, et deux décomptes à
  lire en réunion, c'est un de trop. Écarté aussi : une pause du minuteur —
  « mets en pause » désigne déjà la réunion.
- **Gardé avec la réunion** (`aiHelp.timer`), pas dans l'écran : une page
  rechargée le retrouve. Le serveur garde une HEURE (`endsAt`) et ne rend que
  le temps RESTANT : l'écran pose l'échéance sur sa propre horloge. Un poste
  décalé de trente secondes afficherait sinon un décompte faux d'autant.
  Arrivé à zéro, il n'existe plus à la lecture — rien à effacer quand
  personne n'est là pour le voir finir.
- **Même circuit que les autres gestes** : le modèle NOMME, le serveur
  vérifie (durée de 5 s à 4 h, un seul geste par réponse), et la carte dit ce
  qui a été fait — « Aucun minuteur ne tourne » quand on lui demande d'en
  changer un qui n'existe pas. Le modèle sait où il en est (« il reste
  3 min 20 ») : c'est ce qui donne un sens à « ajoute deux minutes ».
  Différence : le geste est FAIT par le serveur, pas par l'écran, qui s'y
  conforme (champ `timer` de la réponse). Seul l'arrêt a un bouton, donc une
  route sans modèle (`POST /ai-help/session`, `timer: 'stop'`).
- **Une horloge relue, pas un délai attendu** (`stores/aiHelpTimer.js`) : le
  reste est recalculé contre l'heure quatre fois par seconde. Écarté : un
  `setTimeout` de la durée — un poste mis en veille le fait sonner à son
  réveil. En retard de moins d'une minute, il sonne ; au-delà, il s'efface
  sans bruit.
- **Deux réponses qui se croisent** : une session relue AVANT la demande et
  arrivée après effacerait le minuteur qu'on vient de lancer. Chaque
  changement fait à l'écran avance un compteur (`timerRev`) ; une session
  partie avant lui ne touche pas au minuteur. Et à moins de cinq secondes de
  la fin, une session qui le dit fini ne l'efface pas : l'horloge de l'écran
  a quelques dixièmes de retard sur celle du serveur, il va sonner.
- **Dans le flux, pas par-dessus** (`AiHelpTimer.svelte`, monté par
  `LiveTranscript` — zéro ligne dans `App.svelte`). Première version : une
  capsule en surimpression au coin de la transcription. Elle masquait la fin
  des lignes qui passaient dessous (vu à la capture à 1 280 px). Elle a donc
  sa rangée, au-dessus de la liste, qui cède sa hauteur le temps du décompte.
  Écarté aussi : une carte de la scène — elle n'en montre qu'une et se ferme
  d'un geste, le décompte aurait disparu à la première question.
- **Un quatrième son** (`playTimerMelody`, `sounds.timer`) : une phrase de
  boîte à musique en sol majeur, comme l'alerte, qui finit sur l'accord de
  tonique. Mesurée (rendu hors ligne de Chromium) : audible 3,4 s, crête
  0,23, sans saturer — au niveau de la sonnette. Elle a son interrupteur et
  son bouton **Écouter** dans Réglages → Aide IA ; écarté : la ranger sous
  « Alertes » — couper les contradictions aurait fait taire un minuteur
  qu'on a demandé exprès.
- **Fermer la fenêtre de l'IA n'arrête pas le minuteur** ; elle range celui
  qui vient de sonner.

⚠️ **Non mesuré** : aucun vrai modèle n'a nommé ce geste — sa justesse entre
« minuteur » et « rappel », la conversion des durées dites (« un quart
d'heure », « une minute trente »), la reprise du libellé quand on change la
durée. Vérifié avec un faux modèle : route, store, écran, et le parcours joué
dans la vraie appli à 1 280 et 375 px. La mélodie n'a pas été ÉCOUTÉE, ni son
passage éventuel dans la transcription par le micro (cf. 13.13).

### 13.17 Le tag retient le projet (2026-11-23)

Constat à l'usage : au démarrage, l'IA « tombe à côté » ou propose des
homonymes. Lu dans les deux codes : sans lien tag → fiche, le serveur
demande à myBrain le NOM du tag (`GET /api/v1/fiche?nom=`). myBrain y passe
le nom seul à son rapprochement — sans le type attendu ni les indices qui
départagent —, et un mot partagé suffit à faire un candidat, de tout type ;
il rend les candidats sans leur type. Côté myBrief, une fiche « sûre » est
prise sans regarder si c'est un projet : un tag au nom d'un client peut
retenir la fiche du client.

Décision : ne plus deviner pour une réunion taguée. Dès que la réunion a
son projet (choisi, reconnu au tag ou à ce qui se dit) et que son tag ne
mène pas à lui, la scène propose **Relier le tag « … » à ce projet ?**
(`stores/aiHelpTagLink.js`). La route existait (`POST /ai-help/tag-project`,
qui relit la fiche dans myBrain) ; l'écran manquait.

- **Au moment où les deux sont connus**, pas dans « Mes tags » : c'est en
  réunion qu'on sait quel projet va avec quel tag, sans rien chercher.
- **Après les interventions ouvertes** : une alerte n'attend pas une
  question de rangement.
- **Un tag relié à un AUTRE projet se propose aussi** : seule façon, à ce
  jour, de corriger un lien faux.
- **« Pas maintenant » vaut pour la réunion et ce projet** — mémoire de
  l'écran, rien en base. Écarté : relier sans demander (un tag de client
  qui couvre plusieurs projets resterait collé au premier venu), et un refus
  définitif (aucun autre écran ne relie un tag : la porte serait fermée).
- **Écarté pour l'instant** : ouvrir le type et les indices sur l'API de
  myBrain (`kind`, `indices` de `vault_resolve_entity`) et filtrer les
  candidats par type côté myBrief. Ils restent la voie pour une réunion SANS
  tag, où le projet se devine encore.

### 13.18 Des idées rares, et qui servent (2026-11-25)

Constat à l'usage : les idées sont « trop nombreuses et pas toujours
pertinentes ». Trois causes lues dans le code : une lecture toutes les vingt
secondes pouvait rendre une idée à chaque fois, rien ne les espaçait ; le
niveau d'intervention ne les touchait pas (la consigne « idée » partait en
« Discrètes », alors que l'administration les annonçait aux seules
« Soutenues ») ; la consigne les tirait du NOUVEAU passage, vingt secondes de
parole, sans barre ni droit de se taire.

Décision (option retenue : espacer selon le niveau) —
`lib/aiHelp/ideas.js` :

- **L'espacement est tenu par le serveur, pas par le modèle.** Une idée n'est
  DEMANDÉE que lorsqu'elle est permise : dix minutes au moins après la
  précédente en « Normales », cinq en « Soutenues », jamais en « Discrètes » ;
  pas avant ~3 000 caractères de réunion (trois minutes de parole) ; pas
  redemandée moins de deux minutes après une demande restée sans réponse
  (`aiHelp.ideasLookedAt`). Sinon sa consigne n'entre pas dans le prompt, et
  une idée rendue quand même est jetée. Écarté : « une idée de temps en
  temps » écrit dans la consigne — le modèle ne voit pas l'heure de ses idées,
  et chaque lecture était un tirage de plus où la plus faible finissait par
  passer.
- **Une seule par lecture, et pas une redite.** Même titre aux accents près,
  ou deux mots porteurs en commun formant les trois cinquièmes du plus court
  (`repeatsIdea`, mots vides écartés). Toutes les idées de la réunion sont
  rappelées au modèle, pas seulement les douze dernières interventions :
  espacées, elles en sortaient vite.
- **Une barre dans la consigne.** Sur le sujet des dernières minutes (fin de
  `<transcription_avant>` + nouveau passage), appuyée sur le dossier, le
  projet, l'organisation ; jamais une généralité, un conseil de méthode, une
  reformulation ou la logistique ; « une idée moyenne coûte plus qu'aucune ».
- **Un effort de raisonnement `medium`** pour la lecture qui demande une idée,
  `low` pour les autres : juger qu'aucun participant ne l'a eue demande plus
  qu'un repérage. Au plus une lecture sur six, deux minutes au moins entre
  deux.
- Bonus : une boîte à idées seule allumée, sans idée permise, ne coûte plus
  aucun appel.

⚠️ **Non mesuré** contre un vrai modèle : si la barre fait taire les bonnes
idées avec les mauvaises, la latence d'une lecture en `medium`, et si dix
minutes est le bon rythme. À éprouver en recette ; les durées sont des
constantes (`IDEA_GAP_MS`).

### 13.19 Ce que ça ne fait pas encore

- Les interventions d'une réunion terminée ne se relisent pas depuis
  l'historique (elles sont en base, `aiHelpItemsOf` sait les relire).
- Le lien d'un tag à son projet ne se voit ni ne se délie dans « Mes tags » :
  il se pose ou se change en réunion (13.17). Sans tag, le projet se devine
  toujours par le nom entendu, avec les homonymes de myBrain.
- Le prénom coloré dans la transcription ne survit pas à la réunion : la liste
  des phrases qui ont appelé l'IA vit dans le store, pas sur la réunion. Une
  réunion rouverte, ou la page rechargée en cours de route, ne le montre plus.
- Un rappel posé ne s'annule pas, et aucun écran ne liste ceux qui restent à
  venir. L'IA ne crée pas de tag, ne retire ni tag ni note.
- Le minuteur ne se met pas en pause, et il n'y en a qu'un à la fois. Il
  s'arrête avec la réunion. Son arrêt par la croix, si le réseau manque à cet
  instant, n'est pas rejoué : il revient à la relecture suivante de la session.
- L'ordre du jour d'une réunion ne se reprend pas à la suivante, et une réunion
  REPRISE ne relit pas ce qui s'est dit avant la reprise.
- Une correction demandée à l'IA ne s'annule pas d'un geste (elle se reprend à
  la main), ne vaut que pour ce qui est déjà dit — la suite de la réunion
  garde l'orthographe du moteur — et ne porte que sur un passage tenant dans
  une prise de parole. Le serveur ne la vérifie que sur les 48 000 derniers
  caractères de la transcription.
- Un compte rendu commandé pour la fin ne survit pas à un rechargement de page.

