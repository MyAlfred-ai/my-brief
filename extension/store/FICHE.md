# Fiche Chrome Web Store — MyBrief

Tout ce que demande le tableau de bord du Chrome Web Store, prêt à coller. Ce
dossier n'est **pas** empaqueté dans le zip de l'extension.

- Paquet à téléverser : `public/mybrief-extension.zip` (`npm run build:extension`).
- Images : `images/` — à régénérer par `render.mjs` quand le popup change (en-tête du script).
- Visibilité : **Non répertorié**. Pas « Privé » : réservé au domaine Google
  Workspace de l'éditeur et à ses testeurs, les clients ne pourraient pas l'installer.

Les champs marqués **À RENSEIGNER** dépendent de MyAlfred : aucune adresse n'a été inventée.

---

## 1. Fiche (onglet « Fiche Play Store » / « Store listing »)

**Nom** et **résumé** : lus dans le manifest, par langue (`_locales/`) — rien à saisir.

| | FR | EN |
|---|---|---|
| Nom | MyBrief | MyBrief |
| Résumé (≤ 132 car.) | Ouvrez MyBrief ou démarrez une réunion d'un clic, depuis n'importe quel onglet. | Open MyBrief or start a meeting in one click, from any tab. |

**Catégorie** : Productivité › Workflow et planification.
**Langue principale** : français (`default_locale`), puis ajouter l'anglais.

### Description détaillée — FR

```text
MyBrief, l'assistant de réunion de votre organisation, à portée de clic dans Chrome.

Cette extension accompagne MyBrief : il vous faut un compte sur le MyBrief de votre organisation.

• Nouvelle réunion : depuis n'importe quel onglet, l'extension ouvre MyBrief et lance l'enregistrement. Raccourci clavier : Alt+Maj+M.
• Un seul onglet : si MyBrief est déjà ouvert, l'extension y revient au lieu d'en ouvrir un second. Une réunion en cours n'est jamais doublée ni interrompue.
• REC sur l'icône : pendant l'enregistrement, l'icône affiche REC (en gris pendant une pause) et le menu, la durée. « Revenir à la réunion » vous y ramène.
• Rappel visio, en option : un point bleu sur l'icône quand une visio Google Meet, Zoom, Webex ou un lien de réunion Teams est ouvert sans enregistrement.
• Liaison sans saisie : ouvrez votre MyBrief, cliquez l'icône, puis « Utiliser ce site comme mon MyBrief ».

Vie privée
• L'extension n'accède qu'au site MyBrief que vous liez, et seulement après votre accord dans Chrome.
• Le rappel visio, désactivé par défaut, demande à part de lire l'adresse des onglets de visio, rien d'autre.
• Rien n'est envoyé à MyAlfred ni à un tiers : l'extension ne communique qu'avec votre MyBrief.
```

### Description détaillée — EN

```text
MyBrief, your organisation's meeting assistant, one click away in Chrome.

This extension works with MyBrief: you need an account on your organisation's MyBrief.

• New meeting: from any tab, the extension opens MyBrief and starts recording. Keyboard shortcut: Alt+Shift+M.
• One tab only: if MyBrief is already open, the extension goes back to it instead of opening a second one. A running meeting is never duplicated or interrupted.
• REC on the icon: while recording, the icon shows REC (grey while paused) and the menu shows the time. "Back to the meeting" takes you there.
• Video call reminder, optional: a blue dot on the icon when a Google Meet, Zoom or Webex call, or a Teams meeting link, is open without recording.
• No typing to link it: open your MyBrief, click the icon, then "Use this site as my MyBrief".

Privacy
• The extension only accesses the MyBrief site you link, and only after you agree in Chrome.
• The video call reminder, off by default, separately asks to read the address of video call tabs, nothing else.
• Nothing is sent to MyAlfred or any third party: the extension only talks to your MyBrief.
```

### Images

| Champ | Fichier | Format |
|---|---|---|
| Icône de la fiche | `../icons/128.png` | 128×128 |
| Captures FR (ordre) | `images/capture-fr-1.png` … `capture-fr-4.png` | 1280×800 |
| Captures EN (ordre) | `images/capture-en-1.png` … `capture-en-4.png` | 1280×800 |
| Petite vignette | `images/vignette-440x280.png` | 440×280 — non localisable, en français |
| Grande vignette (marquee) | — | facultative, non fournie |

Captures : 1 nouvelle réunion · 2 badge REC · 3 rappel visio · 4 liaison. Données fictives
(hôtes « exemple », personnes inventées).

### Liens

- Site officiel : **À RENSEIGNER** (site de MyAlfred).
- Assistance : **À RENSEIGNER** (page ou adresse d'assistance de MyAlfred).

---

## 2. Confidentialité (onglet « Pratiques de confidentialité »)

Les examinateurs lisent l'anglais : coller la version EN, la FR sert de référence.

### Objectif unique

- **EN** — Launch and return to MyBrief meetings from Chrome: open the user's MyBrief or
  start a recording in one click, and show on the icon that a recording is running.
- **FR** — Lancer et retrouver les réunions MyBrief depuis Chrome : ouvrir le MyBrief de
  l'utilisateur ou démarrer un enregistrement d'un clic, et montrer sur l'icône qu'un
  enregistrement est en cours.

### Justification des autorisations

| Autorisation | EN (à coller) | FR |
|---|---|---|
| `activeTab` | When the user clicks the icon to link the extension, reads the address of the open tab and checks, from that tab, that it is a MyBrief site. Only on that click, only that tab. | Au clic de l'utilisateur pour lier l'extension : lire l'adresse de l'onglet ouvert et vérifier, depuis cet onglet, qu'il s'agit d'un MyBrief. Seulement à ce clic, seulement cet onglet. |
| `storage` | Remembers the address of the linked MyBrief site, the video call reminder preference, and whether a recording is running (session storage). | Retenir l'adresse du MyBrief lié, la préférence du rappel visio, et si un enregistrement tourne (stockage de session). |
| `scripting` | Registers a small script on the linked MyBrief site only, so the page can tell the extension that a recording started, paused or stopped (REC badge). | Inscrire un petit script sur le seul site MyBrief lié, pour que la page signale à l'extension le début, la pause et la fin d'un enregistrement (badge REC). |
| `alarms` | Refreshes once a minute, while recording, the elapsed time shown in the icon tooltip. | Rafraîchir chaque minute, pendant un enregistrement, la durée affichée dans l'info-bulle de l'icône. |
| Hôtes (optionnels) `https://*/*`, `http://*/*` | MyBrief is self-hosted: each organisation runs it on its own domain, unknown in advance. The extension requests, at runtime and with the user's consent, access to that single site when linking, to find the open MyBrief tab instead of opening a second one. If the user turns on the video call reminder, it separately requests read access to video call sites (Google Meet, Teams, Zoom, Webex) to detect an open call. No host access at install. | MyBrief s'installe chez chaque organisation, sur son propre domaine, inconnu d'avance. L'extension demande, au moment de la liaison et avec l'accord de l'utilisateur, l'accès à ce seul site, pour retrouver l'onglet MyBrief au lieu d'en ouvrir un second. Si l'utilisateur active le rappel visio, elle demande à part de lire les sites de visio (Google Meet, Teams, Zoom, Webex) pour repérer une visio ouverte. Aucun accès aux sites à l'installation. |

Attendre un **examen approfondi** : l'accès optionnel à tous les sites l'impose, le délai s'allonge.

### Code distant

**Non.** Tout le code est dans le paquet ; aucun script chargé à distance, aucun `eval`.

### Données utilisateur

Ce que l'extension manipule, pour cocher les cases en connaissance de cause :

| Donnée | Où elle va |
|---|---|
| Adresse du MyBrief lié | `chrome.storage.sync` : synchronisée par Chrome avec le compte Google de l'utilisateur, si la synchronisation est active. |
| Préférence du rappel visio | `chrome.storage.sync`, idem. |
| État d'enregistrement (en cours, en pause, depuis quand) | `chrome.storage.session` : effacé à la fermeture de Chrome. |
| Nom de l'utilisateur connecté | Lu sur le MyBrief de l'organisation, affiché dans le menu, jamais stocké. |
| Adresse des onglets MyBrief et, sur option, des onglets de visio | Lue localement pour retrouver l'onglet ou repérer une visio, jamais stockée ni transmise. |

Aucune requête vers MyAlfred ni vers un tiers : les seules requêtes partent vers le MyBrief
de l'organisation (ou, à la liaison, vers le site de l'onglet ouvert, pour vérifier que c'en
est un). Aucune mesure d'audience.

**Cases recommandées** (choix prudent, à valider) : *Informations permettant d'identifier
personnellement l'utilisateur* (le nom affiché) et *Historique Web* (adresses d'onglets lues
localement). Déclarer moins qu'on ne manipule expose à un refus ; ces deux-là couvrent ce
que fait l'extension.

Cocher les **trois engagements** : pas de vente des données, pas d'usage sans rapport avec
l'objectif unique, pas d'usage pour évaluer la solvabilité.

### Politique de confidentialité

URL : **À RENSEIGNER** — page publique de MyAlfred. Texte proposé ci-dessous.

---

## 3. Politique de confidentialité de l'extension (à publier)

### FR

> **Extension Chrome MyBrief — Politique de confidentialité**
>
> L'extension MyBrief, éditée par MyAlfred, accompagne MyBrief, l'assistant de réunion que
> votre organisation héberge sur son propre site.
>
> **Ce que l'extension conserve.** L'adresse du site MyBrief que vous avez lié et votre
> préférence de rappel visio, dans le stockage de Chrome (synchronisé avec votre compte
> Google si vous avez activé la synchronisation de Chrome) ; l'état de l'enregistrement en
> cours, effacé à la fermeture de Chrome.
>
> **Ce qu'elle lit sans le conserver.** Votre nom, sur votre MyBrief, pour l'afficher dans
> son menu ; l'adresse des onglets ouverts sur votre MyBrief, pour y revenir au lieu d'en
> ouvrir un second ; si vous activez le rappel visio, l'adresse des onglets Google Meet,
> Teams, Zoom et Webex, pour repérer une visio ouverte.
>
> **Ce qu'elle transmet.** Rien à MyAlfred ni à aucun tiers. Elle communique uniquement avec
> le site MyBrief de votre organisation, dont le traitement des données relève de celle-ci.
>
> **Vos choix.** L'accès à votre MyBrief et la lecture des onglets de visio sont demandés
> séparément, avec votre accord, et se retirent à tout moment dans `chrome://extensions`.
> « Changer de site », dans le menu de l'extension, efface l'adresse enregistrée.
> Désinstaller l'extension efface tout ce qu'elle conserve.
>
> Contact : **À RENSEIGNER**.

### EN

> **MyBrief Chrome extension — Privacy policy**
>
> The MyBrief extension, published by MyAlfred, works with MyBrief, the meeting assistant
> your organisation hosts on its own site.
>
> **What the extension keeps.** The address of the MyBrief site you linked and your video
> call reminder preference, in Chrome storage (synced with your Google account if Chrome
> sync is on); the state of the current recording, cleared when Chrome closes.
>
> **What it reads without keeping.** Your name, from your MyBrief, to show it in its menu;
> the address of tabs open on your MyBrief, to return to one instead of opening another; if
> you turn on the video call reminder, the address of Google Meet, Teams, Zoom and Webex
> tabs, to spot an open call.
>
> **What it sends.** Nothing to MyAlfred or any third party. It only communicates with your
> organisation's MyBrief site, whose data processing is your organisation's responsibility.
>
> **Your choices.** Access to your MyBrief and reading video call tabs are requested
> separately, with your consent, and can be withdrawn at any time in `chrome://extensions`.
> "Change site", in the extension menu, clears the saved address. Uninstalling the extension
> deletes everything it keeps.
>
> Contact: **TO BE FILLED IN**.

---

## 4. Distribution

- Visibilité : **Non répertorié**.
- Régions : toutes.
- Publication : cocher « publier automatiquement après validation », ou publier à la main.

Après publication : l'adresse de la fiche va dans `EXTENSION_STORE_URL`
(`src/config/constants.js`), et Réglages → Outils → Extension Chrome propose « Ajouter à
Chrome » au lieu du .zip.
