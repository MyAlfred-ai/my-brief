# Captures de la documentation utilisateur

Les images de `docs/user/images/` qui montrent l'écran (tableau « Les captures », plus bas) se
refont ici : myBrief lancé en local, sur des données fictives. **Jamais sur une instance réelle** : l'image est
publiée telle quelle, et le contrôle anti-fuite du wiki ne lit pas les images
([standard 13 de my-docs](https://github.com/MyAlfred-ai/my-docs/blob/main/standards/13-doc-utilisateur.md#captures-décran)).

## Refaire une capture

Il faut Docker, Google Chrome, les dépendances du dépôt (`npm ci` à la racine et dans
`services/api/`), et un clone de my-docs à côté, outil installé :
`npx --yes pnpm@12.3.4 install --dir tools/captures`.

1. `docs/tech/captures/lancer.sh` — base jetable, API sur le port 3100, données fictives, Vite sur le
   5174. Il tourne à côté de la pile de dev sans la toucher. Ctrl+C arrête tout.
   Sans Docker : `node docs/tech/captures/api-en-memoire.mjs` (même API, sur la base en mémoire des
   tests), puis le Vite de la fin de `lancer.sh` dans un second terminal.
2. Depuis my-docs : `node tools/captures/capture.mjs my-brief --chemin ../myBrief` — toutes, ou
   `--capture <nom>` pour une seule.
3. Relire chaque image, puis la commiter avec le changement d'écran qui l'a rendue nécessaire.

## Les captures

| Capture | Ce qu'elle montre | Page |
|---|---|---|
| `ecran-principal` | La réunion « Comité de pilotage » ouverte, dix numéros dans l'ordre du tableau | [Premiers pas](../../user/premiers-pas.md), « Se repérer dans myBrief » |
| `nouveau-resume` | La carte de génération : templates, Pagimètre, tuiles « Ajouter au compte rendu » | En tête de [Les résumés](../../user/fonctionnalites/resumes/index.md) et de [Les templates](../../user/fonctionnalites/templates/index.md) |
| `transcription` | L'onglet Transcription, et « Reprendre l'enregistrement » au pied | En tête de [La transcription](../../user/fonctionnalites/transcription/index.md) |
| `reglages` | Réglages → Préférences IA : le sommaire, et « Mon contexte » rempli | En tête de [Réglages](../../user/fonctionnalites/configuration/index.md) |
| `usage-et-credits` | Réglages → Usage & crédits : la jauge du mois et la courbe « Au fil du mois » | En tête de [Usage & crédits](../../user/fonctionnalites/statistiques/index.md) |
| `mes-tags` | Réglages → Mes tags, la fiche du tag « Projet Atlas » | En tête de [Les tags](../../user/fonctionnalites/tags/index.md) |
| `admin-consommation` | Administration → Consommation : les chiffres des trente jours et la santé de l'adoption | En tête de [Les statistiques](../../user/admin/statistiques/index.md) |
| `admin-groupes` | Administration → Groupes : les sept comptes, les groupes Défaut, Admin et Commerciaux | En tête de [Les utilisateurs](../../user/admin/utilisateurs/index.md) |
| `admin-modeles` | Administration → Modèles : les trois tuiles, celle des comptes rendus dépliée | En tête de [L'IA](../../user/admin/ia/index.md) |
| `admin-templates` | Administration → Templates : les six templates fournis, « Standard » ouvert dans l'éditeur | En tête de [Les templates](../../user/admin/templates/index.md) (administration) |

Les pages de **Réglages** affichent, à côté du titre, l'adresse du compte : celle de l'identité simulée
par `vite.config.local.js`. Leurs captures la masquent (`.sp-whoami`), et se prennent sur 880 points
de haut, pour que « Se déconnecter » ne passe pas sous la carte du compte.

### L'administration

L'identité simulée, Camille Martin, est une simple utilisatrice : les captures de la documentation
utilisateur la montrent sans bouton **Admin**. Les captures `admin-*` passent sous l'identité de
**Léa Robert**, administratrice fictive, par un cookie (`mybrief_capture_admin`) que pose
`ouvrirAdministration` (`administratrice.mjs`) et que lit le proxy de `vite.config.mjs` : même banc,
même passage de l'outil, et l'écran principal ne change pas.

Elles masquent toutes les adresses — à côté du titre « Administration », sous le nom sur la carte du
compte, dans les listes de comptes — et les pastilles du diagnostic (`.cad`), qui ne disent que ce qui
manque au banc : aucune clé d'IA, exprès. La liste est dans `administratrice.mjs`.

Aucun template d'organisation n'est ajouté au jeu : il paraîtrait aussi dans la carte de génération de
Camille, et changerait `nouveau-resume`. Un réglage d'administration qui se voit côté utilisateur
s'ajoute en sachant quelles captures il touche.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `lancer.sh` | myBrief en local, sur une base en mémoire, sans clé OpenAI : aucun appel d'IA ne part |
| `api-en-memoire.mjs` | La même API sans Docker, sur la base en mémoire des tests |
| `donnees-fictives.mjs` | Camille Martin, le projet Atlas, huit réunions, trois tags, « Mon contexte » ; son équipe — six comptes, dont l'administratrice, leurs réunions des deux derniers mois, le groupe Commerciaux ; les dates partent d'aujourd'hui |
| `administratrice.mjs` | Léa Robert, l'administratrice fictive ; le cookie qui fait basculer sur elle, et ce que masquent les captures `admin-*` |
| `vite.config.mjs` | `vite.config.local.js`, branché sur l'API jetable plutôt que sur celle de dev ; avec le cookie de bascule, l'identité simulée devient l'administratrice |
| `<nom>.capture.mjs` | L'écran à préparer, ce qu'on masque, et les numéros s'il y en a — dix pour `ecran-principal`, dans l'ordre du tableau de la page |

## Quand l'écran change

- **Un numéro qui ne trouve plus sa cible arrête l'outil** : corriger sa `cible` — un rôle et un
  libellé de préférence, une classe sinon.
- **Une zone ajoutée ou retirée** : le repère et la ligne du tableau de la page changent dans le même
  commit.
- **Une donnée à montrer** : elle s'ajoute à `donnees-fictives.mjs`, inventée. Aucune donnée copiée
  d'une vraie base, même « anonymisée ».
