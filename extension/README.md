# Extension Chrome MyBrief

Une icône dans la barre de Chrome : ouvrir MyBrief, ou démarrer une réunion, d'un clic
(ou par `Alt+Maj+M`). Manifest V3, aucune dépendance, aucun build : le dossier se charge
tel quel dans Chrome.

## Ce qu'elle fait (V1)

- **Nouvelle réunion** : ouvre MyBrief avec le deep-link `#record` — l'app démarre
  l'enregistrement dès que la session est connue (`src/stores/recordDeepLink.js`). Un onglet
  MyBrief déjà ouvert est réutilisé (changement de hash, pas de rechargement) : jamais deux
  onglets, une réunion en cours n'est jamais doublée ni interrompue.
- **Ouvrir MyBrief** : retrouve l'onglet ou en ouvre un.
- **Liaison sans saisie** : depuis l'onglet MyBrief, le popup propose « Utiliser ce site
  comme mon MyBrief ». La permission d'hôte est demandée pour ce seul site
  (`optional_host_permissions`). Une extension unique sert toutes les installations.
- **Pont avec l'app** : `content.js`, inscrit sur le site lié, se signale à la page
  (`postMessage`) ; la page « Extension Chrome » de « Ma configuration » passe au vert.

- **Badge REC (V2)** : l'onglet MyBrief annonce son état d'enregistrement (`state`), relayé
  par `content.js` au service worker, qui pose « REC » sur l'icône (gris en pause) et la
  durée dans l'info-bulle. Effacé si l'onglet se ferme ou se recharge.
- **Rappel visio (V2, opt-in)** : case « Me rappeler quand une visio est ouverte » dans le
  popup. L'activer demande la permission de lire l'adresse des onglets Meet / Teams / Zoom /
  Webex (`VIDEO_CALL_HOST_PATTERNS`). Point bleu sur l'icône si une visio est ouverte sans
  enregistrement. Teams « application » (`/v2/`) n'est pas reconnu : même URL en tchat.

Pas encore : la capture audio de l'onglet visio (tabCapture, V3).

## Fichiers

| Fichier               | Rôle                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `manifest.json`       | MV3 ; permissions `activeTab`, `storage`, `scripting` ; hôtes optionnels   |
| `background.js`       | Service worker : raccourci clavier, ré-inscription du script de contenu    |
| `popup/`              | Le menu (deux écrans : lié / à lier)                                       |
| `content.js`          | Le pont vers l'app, injecté sur le site lié                                |
| `lib/core.js`         | Fonctions pures, testées (`core.test.js`, lancé par `npm test`)            |
| `lib/instance.js`     | Site lié : stockage, sonde, session, onglets, script de contenu            |
| `lib/state.js`        | État d'enregistrement (storage.session), rappel visio, calcul du badge      |
| `_locales/{fr,en}/`   | Textes du popup et du manifest                                             |

## Charger en développement

1. `chrome://extensions` → « Mode développeur » → « Charger l'extension non empaquetée » →
   ce dossier.
2. Ouvrir un MyBrief (`npm run dev` suffit : `http://localhost:5173`), cliquer l'icône,
   « Utiliser localhost:5173 comme mon MyBrief ».
3. Après une modification : bouton ↻ de la carte de l'extension dans `chrome://extensions`.
   Le popup et le service worker ont leur propre console (« Inspecter les vues »).

## Distribution

- `npm run build:extension` (lancé aussi par `prebuild`/`predev`) produit
  `public/mybrief-extension.zip` — ce que la page de configuration propose tant que
  `EXTENSION_STORE_URL` (`src/config/constants.js`) est vide.
- Cible : fiche **non répertoriée** du Chrome Web Store (installation en un clic, mises à
  jour automatiques, installation forcée possible par la DSI via `ExtensionInstallForcelist`).
  Renseigner `EXTENSION_STORE_URL` fait basculer la page sur « Ajouter à Chrome ». Le zip à
  téléverser sur le store est le même fichier.
- Monter `version` dans `manifest.json` à chaque publication.
