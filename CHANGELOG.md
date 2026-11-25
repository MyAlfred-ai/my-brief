# Changelog

Les changements notables de MyBrief, version par version. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; numérotation
[SemVer](https://semver.org/lang/fr/). Ce que voient les utilisateurs est
raconté à part, dans [`NOUVEAUTES.md`](NOUVEAUTES.md) (popup « Quoi de neuf ? »).

## [Non publié]

## [1.4.0]

Le détail, écran par écran, est dans [`NOUVEAUTES.md`](NOUVEAUTES.md).

### Ajouté

- Aide IA en réunion : elle suit la conversation, alerte, répond aux
  questions, propose de rares idées, lance un minuteur, met en pause ou
  déclenche le compte rendu sur demande, et cherche dans myBrain s'il est
  relié (Administration → Aide IA).
- Infographies : six mises en page A4 aux couleurs de la marque, avec le logo
  de l'entreprise, écrites pendant le compte rendu.
- Compte rendu en PDF aux couleurs de la marque.
- Une réunion terminée peut reprendre son enregistrement.
- Tags : un texte qui dit à l'IA de quoi parle le tag, un logo par tag,
  recherche et création d'un geste, jusqu'à 30 tags par personne, et un tag
  peut retenir le projet myBrain de ses réunions.
- Rédaction du compte rendu : choix du modèle avec son prix, GPT-6 et Mistral.
- Transcription en direct par Mistral (Voxtral), Speechmatics ou AssemblyAI,
  en plus d'OpenAI.
- Remplacements de mots dans les notes retenus pour les réunions suivantes.
- Administration : tableau de bord, et recherche d'un réglage par son nom
  dans Réglages et Admin.
- Extension Chrome : installation sous Windows, mises à jour annoncées.

### Modifié

- Menus Réglages et Admin réorganisés ; Configuration, Authentification et
  Actions repliées.
- Rappel du consentement des participants au démarrage d'une réunion.
- Le contenu qui accompagne le compte rendu (actions, infographie) se choisit
  à la génération ; détection d'actions en « Stricte » par défaut.
- Un seul groupe par compte, et un groupe Admin sans plafond.
- Ouverture plus rapide ; longues réunions plus légères en processeur et en
  mémoire ; sur téléphone, la réunion tient malgré un appel, une autre
  application ou une coupure réseau.
- Modèles qu'OpenAI retire : une variable `OPENAI_MODEL_*` qui en vise un est
  ignorée (le défaut s'applique, le démarrage de l'API le signale). Calendrier
  dans `services/api/lib/retiredModels.js`.
- Dépendances : jsPDF 4, Vitest 4, nginx 1.29.

### Corrigé

- Après une pause, le micro et la transcription repartent tout de suite.
- Quota atteint en pleine réunion : un message s'affiche et la réunion
  continue.
- Transcription : les phrases contenant « par » ne disparaissent plus.
- Aide IA : les demandes passent même sans les questions-réponses.
- Kit : `install.sh --help` fonctionne lancé depuis un autre dossier.

## [1.3.0]

Première version publique.

### Ajouté

- Kit d'installation versionné (`install/`) : `install.sh`, puis
  `update.sh <version>`, `rollback.sh` et `backup.sh`. Les images sont tirées
  à une version fixe, leur signature vérifiée, et une mise à jour qui échoue
  restaure la précédente avec ses données.
- `FEEDBACK_URL` et `DOCS_URL` : liens « Déclarer un bug ou une idée » et
  « Aide » propres à chaque installation. Sans `FEEDBACK_URL`, l'entrée est
  masquée.
- Outils de diagnostic dans le kit : `diagnose-account.sh`,
  `purge-duplicate-account.sh`, `recover-mongo-volume.sh`.

### Modifié

- Le compte d'amorçage n'a plus de valeur par défaut : sur une base vierge,
  l'API refuse de démarrer sans `ADMIN_SEED_EMAIL` ni `ADMIN_SEED_PASSWORD`
  (12 caractères au moins).
- La version est celle de `package.json`, reprise par le tag de publication ;
  elle n'avance plus à chaque commit.
- L'app mobile se construit pour l'URL d'une installation donnée
  (`node scripts/mobile-instance.mjs https://…`).

[Non publié]: https://github.com/MyAlfred-ai/my-brief/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/MyAlfred-ai/my-brief/releases/tag/v1.4.0
[1.3.0]: https://github.com/MyAlfred-ai/my-brief/releases/tag/v1.3.0
