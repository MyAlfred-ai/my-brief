# Captures de la documentation utilisateur

Les images de `docs/user/images/` qui montrent l'écran — aujourd'hui `ecran-principal.png`, de la
section « Se repérer dans myBrief » de [Premiers pas](../../user/premiers-pas.md) — se refont ici :
myBrief lancé en local, sur des données fictives. **Jamais sur une instance réelle** : l'image est
publiée telle quelle, et le contrôle anti-fuite du wiki ne lit pas les images
([standard 13 de my-docs](https://github.com/MyAlfred-ai/my-docs/blob/main/standards/13-doc-utilisateur.md#captures-décran)).

## Refaire une capture

Il faut Docker, Google Chrome, les dépendances du dépôt (`npm ci` à la racine et dans
`services/api/`), et un clone de my-docs à côté, outil installé :
`npx --yes pnpm@12.3.4 install --dir tools/captures`.

1. `docs/tech/captures/lancer.sh` — base jetable, API sur le port 3100, données fictives, Vite sur le
   5174. Il tourne à côté de la pile de dev sans la toucher. Ctrl+C arrête tout.
2. Depuis my-docs : `node tools/captures/capture.mjs my-brief --chemin ../myBrief`.
3. Relire l'image, puis la commiter avec le changement d'écran qui l'a rendue nécessaire.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `lancer.sh` | myBrief en local, sur une base en mémoire, sans clé OpenAI : aucun appel d'IA ne part |
| `donnees-fictives.mjs` | Camille Martin, le projet Atlas, huit réunions ; les dates partent d'aujourd'hui |
| `vite.config.mjs` | `vite.config.local.js`, branché sur l'API jetable plutôt que sur celle de dev |
| `ecran-principal.capture.mjs` | L'état à préparer, ce qu'on masque, et les dix numéros, dans l'ordre du tableau de la page |

## Quand l'écran change

- **Un numéro qui ne trouve plus sa cible arrête l'outil** : corriger sa `cible` — un rôle et un
  libellé de préférence, une classe sinon.
- **Une zone ajoutée ou retirée** : le repère et la ligne du tableau de la page changent dans le même
  commit.
- **Une donnée à montrer** : elle s'ajoute à `donnees-fictives.mjs`, inventée. Aucune donnée copiée
  d'une vraie base, même « anonymisée ».
