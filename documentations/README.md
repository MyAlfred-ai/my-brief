# Documentation MyBrief

Quatre documents, et rien d'autre. Chacun explique **pourquoi** le code est ainsi —
la mécanique, elle, est dans les en-têtes des fichiers source.

| Document | Quand l'ouvrir |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | carte du code, toutes les routes, modèle de données, conventions, tests, pièges Svelte |
| [FONCTIONNALITES.md](./FONCTIONNALITES.md) | ce que fait le produit : templates, tags, actions, connexions de comptes, infographie, administration, extension |
| [TRANSCRIPTION.md](./TRANSCRIPTION.md) | capture audio, Realtime, modèles mesurés, tenue de la connexion, locuteurs |
| [AUTHENTIFICATION.md](./AUTHENTIFICATION.md) | les trois chemins d'identité, rôles, SSO, bascule Entra, historique des pannes OIDC |
| [DEPLOIEMENT.md](./DEPLOIEMENT.md) | les trois cibles, `update`/`backup`/`rollback`, pièges par serveur |
| [MOBILE.md](./MOBILE.md) | app Capacitor `server.url`, auth mobile, builds, distribution, dépannage |

Ailleurs dans le dépôt :

- [`../README.md`](../README.md) — vue d'ensemble, stack, démarrage
- [`../CLAUDE.md`](../CLAUDE.md) — instructions pour les agents de code
- [`../install/readme.md`](../install/readme.md) — installer sur un serveur
- [`../extension/README.md`](../extension/README.md) — extension Chrome
- [`../CHANGELOG.md`](../CHANGELOG.md) — l'histoire détaillée, commit par commit
- `../docs/technique/code/` — doc générée par IA (workflow `docs.yml`), **ne pas éditer**

## Écrire ici

Un ajout va dans l'un des six documents ci-dessus. **Créer un septième fichier
demande une raison** : ce dossier a compté 34 fichiers, dont six vides et trois
récits successifs du même correctif — l'index ne disait plus la vérité, et
personne ne savait lequel lire.

Ce qui mérite d'être écrit : une décision et son alternative écartée, un piège
mesuré (pas déduit), un invariant qu'aucun test ne protège. Ce qui ne le mérite
pas : la description d'un écran, un journal de correctifs (`CHANGELOG.md`), un
récit d'investigation dont la conclusion est déjà dans le code.
