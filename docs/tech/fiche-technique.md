# Fiche technique — myBrief

> Établie le 9 septembre 2026 par `/doc-init` à partir du code (la volumétrie date de ce jour-là) ;
> faits corrigés le 16 octobre 2026.

## Identité

| | |
|---|---|
| Nom affiché | myBrief |
| Dépôt | `MyAlfred-ai/myBrief` |
| À quoi ça sert | Enregistre, transcrit et résume automatiquement les réunions, au format défini par l'utilisateur |
| Catégorie | gros |
| Responsable | à confirmer |
| Statut | actif |

## Pile

| | |
|---|---|
| Interface | Svelte 4 + Vite, **en JavaScript, pas en TypeScript** |
| API | Fastify 5, Node.js |
| Base de données | **MongoDB** |
| Authentification | OIDC (Google par défaut), Microsoft Entra, mot de passe local |
| Transcription | OpenAI Realtime API, via WebSocket |
| Résumé, titre, actions | OpenAI |
| Mobile | Capacitor (iOS et Android, mode `server.url`), extension Chrome |
| Déploiement | Docker |

## Volumétrie du code

| | |
|---|---|
| Fichiers JavaScript | 307 |
| Composants Svelte | 88 |
| Routes déclarées | 166 |
| Variables d'environnement | 9 |
| Docs markdown | 47, dont 0 en `docs/user/` avant cette reprise |

## Fonctions principales

Enregistrement micro et audio système avec pause et reprise, transcription en temps réel, résumé par
modèle (6 modèles fournis, 5 modèles personnels par utilisateur), détection d'actions, versionnage
des régénérations, historique par semaine avec recherche et étiquettes, envoi par mail, dépôt sur un
stockage externe, téléchargement, application mobile et extension de navigateur, interface FR/EN.

## Points d'attention

- **MongoDB est la seule occurrence du parc.** Le standard 04 impose PostgreSQL pour tout nouveau
  projet ; myBrief migre à la reprise. Sans schéma ni validation, c'est aussi le point le plus
  risqué à maintenir seul.
- **JavaScript sans TypeScript**, alors que le reste du parc converge vers TypeScript strict.
- **Svelte 4** quand myBrain est en Svelte 5.
- **La configuration se lit dans `docker/.env.example`** (recette) et `install/env*.example`
  (productions), commentés variable par variable.
- **`documentations/` tient en six documents** (architecture, fonctionnalités, transcription,
  authentification, déploiement, mobile) : les 47 fichiers de journal de bord d'avant la reprise ont
  été triés. Rien de tout cela n'est de la documentation utilisateur, qui vit dans `docs/user/`.
- **Deux URI de redirection distinctes** — une pour la connexion, une pour les autorisations mail et
  stockage. Source d'erreur classique à l'installation.

## Ce qu'il faut savoir avant de modifier

- Tests : Vitest, côté interface et côté API
- CI : 7 workflows GitHub Actions
- Les garde-fous d'envoi (destination jamais issue de la requête, expéditeur toujours en copie,
  plafond de destinataires) sont des règles de sécurité, pas des options : voir
  `documentations/FONCTIONNALITES.md` §7
