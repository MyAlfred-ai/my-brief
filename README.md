# MyBrief

[![CI](https://github.com/MyAlfred-ai/my-brief/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MyAlfred-ai/my-brief/actions/workflows/ci.yml)

Assistant de réunion : enregistrement audio, transcription en temps réel, compte
rendu par IA selon un modèle choisi, détection des actions, puis envoi par mail
ou dépôt du document dans le Drive de l'utilisateur.

MyBrief s'installe sur votre propre serveur : les réunions, les comptes rendus
et les comptes restent dans votre base. Seuls l'audio et le texte envoyés à
l'IA quittent le serveur, vers le fournisseur dont vous donnez la clé (OpenAI).

## Fonctionnalités

- **Enregistrement** micro + audio système (visio), pause et reprise, écran
  verrouillé sur mobile, tolérant aux coupures réseau
- **Transcription en direct** (OpenAI Realtime), modèle réglable depuis
  l'administration, locuteurs de la visio nommables, corrections automatiques
  du vocabulaire de l'organisation
- **Compte rendu IA** : six modèles intégrés, éditables par l'administration,
  et jusqu'à cinq modèles par utilisateur ; éditeur WYSIWYG, versions conservées
- **Détection d'actions pendant la réunion**
- **Tags** : un classeur par interlocuteur, avec ses destinataires et son
  dossier de dépôt
- **Après la réunion** : envoi par mail et dépôt sur Google Drive, OneDrive ou
  SharePoint depuis le compte de l'utilisateur
- **Infographie** de la réunion
- **Administration** : comptes, authentification (mot de passe, Google,
  Entra ID), IA, actions, modèles, apparence, statistiques d'usage
- **Extension Chrome**, **PWA**, **app mobile** (Capacitor), interface
  **français / anglais**

## Installer

Sur un serveur Linux avec Docker, un nom de domaine qui pointe dessus et les
ports 80/443 libres :

```bash
curl -fsSLO https://github.com/MyAlfred-ai/my-brief/releases/download/v1.3.0/mybrief-kit-v1.3.0.tar.gz
tar xzf mybrief-kit-v1.3.0.tar.gz && cd kit
bash install.sh
```

L'assistant demande le domaine, génère les secrets et démarre la stack
(Traefik et certificat Let's Encrypt compris, ou branchement sur un Traefik
existant). Ensuite :

```bash
bash update.sh 1.3.1    # mise à jour vers une version précise, signature vérifiée
bash rollback.sh        # retour à la version précédente et à ses données
bash backup.sh          # sauvegarde de la base
```

Tout est détaillé dans [`kit/readme.md`](kit/readme.md).

## Développer

Prérequis : Node 20 et Docker.

```bash
npm install
npm run dev            # interface seule, Vite sur :5173
npm test               # vitest : interface, composants et API
npm run lint           # eslint
npm run check          # svelte-check
npm run build          # bundle de production dans dist/
```

### Application complète en local

```bash
cp docker/.env.example docker/.env     # puis renseigner OPENAI_API_KEY (ou plus tard, dans l'administration)
npm run dev:backend                    # MongoDB + API (docker/docker-compose.dev.yml)
npm run dev:local                      # Vite :5173, /api relayé vers :3000
```

Le compte de développement `admin@example.test` / `dev-local-password` est créé
au premier démarrage. Le code de l'API est monté en volume avec `node --watch` :
pas de reconstruction à chaque modification. `npm run dev:local:password` teste
la connexion par mot de passe ; `npm run dev:backend:logs` et
`npm run dev:backend:stop` suivent et arrêtent l'API.

### Mobile

```bash
node scripts/mobile-instance.mjs https://mybrief.example.test   # l'installation visée
npm run mobile:sync
npx cap open android                                            # ou ios (macOS)
```

L'app charge le site de l'installation : une évolution web y arrive sans
passer par un store.

## Configuration

Les variables sont décrites dans [`kit/env.example`](kit/env.example)
(installation) et [`docker/.env.example`](docker/.env.example)
(développement). Les identifiants OAuth (Google, Entra ID), la clé OpenAI et
la plupart des réglages se font ensuite dans l'administration, sans
redéploiement.

## Structure

```
src/                 interface Svelte (composants, stores, services, config)
services/api/        API Node 20 + Fastify, MongoDB
services/mobile-auth/  ancien relais d'authentification mobile (en retrait)
extension/           extension Chrome (Manifest V3)
android/ ios/        coquilles Capacitor
kit/                 kit d'installation : install, update, rollback, backup
docker/              composes de développement
scripts/             extension, documentation, « Quoi de neuf ? », mobile
documentations/      architecture, fonctionnalités, transcription, authentification
docs/                documentation utilisateur et technique (site)
```

## Sécurité

- MongoDB et l'API ne sont joignables que par le réseau Docker interne et
  Traefik ; le middleware `noident` efface les en-têtes d'identité à l'entrée,
  et un test vérifie que chaque routeur vers `/api` le porte.
- Rôles vérifiés côté serveur ; mots de passe hachés en scrypt ; sessions
  révocables ; limitation de débit par IP et par compte.
- La clé OpenAI reste côté serveur : le navigateur ne reçoit que des jetons
  Realtime éphémères.
- Destinataires et dossiers de dépôt sont lus dans les réglages enregistrés,
  jamais dans le corps d'une requête.
- L'administration ne lit aucun texte de réunion.

Pour signaler une vulnérabilité : [`SECURITY.md`](SECURITY.md).

## Documentation

| | |
|---|---|
| [`kit/readme.md`](kit/readme.md) | installer, mettre à jour, sauvegarder, dépanner |
| [`documentations/`](documentations/README.md) | architecture, fonctionnalités, transcription, authentification |
| [`docs/user/`](docs/user/) | guide de l'utilisateur et de l'administrateur |
| [`CHANGELOG.md`](CHANGELOG.md) | les changements, version par version |
| [`NOUVEAUTES.md`](NOUVEAUTES.md) | ce que lisent les utilisateurs dans « Quoi de neuf ? » |
| [`PRODUCT.md`](PRODUCT.md) | intention produit et principes de design |

## Contribuer

Voir [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

[AGPL-3.0](LICENSE).
