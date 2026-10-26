# Changelog

Les changements notables de MyBrief, version par version. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; numérotation
[SemVer](https://semver.org/lang/fr/). Ce que voient les utilisateurs est
raconté à part, dans [`NOUVEAUTES.md`](NOUVEAUTES.md) (popup « Quoi de neuf ? »).

## [Non publié]

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

[Non publié]: https://github.com/MyAlfred-ai/MyBrief/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/MyAlfred-ai/MyBrief/releases/tag/v1.3.0
