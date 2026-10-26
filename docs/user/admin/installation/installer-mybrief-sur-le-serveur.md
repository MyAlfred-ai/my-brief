---
title: Installer myBrief sur le serveur
description: Lancer l'installeur, répondre à ses questions, et obtenir myBrief en ligne en HTTPS avec son compte d'amorçage.
sidebar:
  order: 2
---

L'installeur fait tout ce qui se passe sur le serveur : il vérifie le nom de domaine et les ports,
installe Docker s'il manque, écrit la configuration, télécharge myBrief, le démarre et attend que le
site réponde en HTTPS. Vous répondez à ses questions ; il ne devine rien.

## Avant de commencer

- Le serveur préparé : domaine qui pointe dessus, ports 80 et 443 ouverts, accès au dépôt — voir
  [Préparer le serveur](preparer-le-serveur.md).
- Un terminal sur le serveur, avec un compte qui a le droit `sudo`.
- Si vous l'avez déjà, la clé OpenAI de l'organisation.

## Étapes

1. Récupérez l'installeur, puis placez-vous dans son dossier :

   ```bash
   git clone https://github.com/MyAlfred-ai/myBrief.git
   cd myBrief/install
   ```

   Choisissez son emplacement une fois pour toutes : ce dossier ne se déplace plus ensuite.
2. Lancez l'installeur :

   ```bash
   bash install.sh
   ```

3. Choisissez le parcours :

   | Choix | Quand |
   |---|---|
   | **1) VPS vierge** | Rien d'autre ne sert de site web sur ce serveur. myBrief embarque son propre Traefik et obtient son certificat |
   | **2) Serveur avec un Traefik déjà en place** | Un Traefik en version 3 sert déjà d'autres sites sur ce serveur |

   Si vous choisissez **1** alors qu'un Traefik tourne, l'installeur le signale et propose de passer
   au second parcours : deux Traefik ne peuvent pas se partager les ports 80 et 443.
4. Si Docker manque, l'installeur propose de l'installer : répondez **O**.
5. Répondez aux questions :

   | Question | Votre réponse |
   |---|---|
   | **Nom de domaine** | L'adresse de myBrief, sans `https://`. L'installeur vérifie qu'elle pointe sur ce serveur, et prévient sinon |
   | **Email pour Let's Encrypt** | L'adresse qui recevra les avis d'expiration du certificat. Premier parcours seulement |
   | **Clé API OpenAI** | La clé de l'organisation, en saisie masquée. Vide si vous ne l'avez pas : elle se saisit ensuite dans l'onglet **IA** |
   | **Email du premier administrateur** | L'adresse du compte d'amorçage : la vôtre, ou celle de la personne qui administrera myBrief |

   Le second parcours demande en plus trois réglages du Traefik en place : **Réseau docker du
   Traefik** — l'installeur propose celui du conteneur qu'il a trouvé —, **Entrypoint TLS du
   Traefik** et **Certresolver du Traefik**, son résolveur de certificats.
6. L'installeur tire au hasard les secrets de l'instance — le mot de passe de la base, le mot de
   passe provisoire du premier administrateur et la clé qui chiffre en base les comptes reliés et la
   clé d'API myBrain —, les écrit dans `.env`, télécharge les images, démarre myBrief, attend que
   l'API réponde, puis vérifie que l'adresse répond en HTTPS. Le certificat met environ une minute à
   arriver.
7. Lisez le résumé « Installation terminée » : l'adresse de myBrief, l'adresse du premier
   administrateur et son mot de passe provisoire. Gardez ce mot de passe pour la première connexion ;
   s'il vous échappe, il est aussi dans `.env`, à la ligne `ADMIN_SEED_PASSWORD`.
8. Copiez le fichier `.env` du dossier en lieu sûr, hors du serveur : il porte le mot de passe de la
   base, sans lequel elle ne s'ouvre plus, et la clé de chiffrement, sans laquelle comptes reliés et
   clé d'API myBrain sont à refaire.

## Résultat

L'adresse de myBrief ouvre la page de connexion, « Bienvenue sur MyBrief ». **Enchaînez aussitôt sur
la première connexion** : tant que le mot de passe provisoire n'est pas remplacé, qui le connaît peut
prendre le compte. Voir [Faire les réglages de base](faire-les-reglages-de-base.md).

## Les réglages du serveur

Ils ne se font pas dans l'écran d'administration, mais dans `.env`, puis se prennent en compte par
`docker compose up -d`, lancé dans le dossier de l'installation. La liste complète, avec les valeurs
attendues, est dans le dépôt : `install/env.example`.

| Pour… | Ce qu'on renseigne |
|---|---|
| Le lien **Mot de passe oublié ?**, et l'envoi par mail sans compte relié | Le serveur d'envoi de mails de l'organisation : `SMTP_HOST` et les suivants |
| Chiffrer les comptes Google et Microsoft que les utilisateurs relient, et la clé d'API myBrain | `CONNECTIONS_ENC_KEY`, que l'installeur génère. Ne la changez plus : la changer oblige chacun à relier son compte de nouveau, et l'administrateur à ressaisir la clé d'API myBrain. Si elle manque — installation plus ancienne, ou faite sans l'installeur —, générez-la une fois, `openssl rand -hex 32` : ce qui est déjà enregistré continue de fonctionner |
| Désigner un administrateur sans passer par l'écran — par exemple après la perte du compte d'amorçage | `ADMIN_EMAILS`, les adresses séparées par des virgules : ces comptes sont promus à chaque démarrage |
| L'application mobile | Son secret de signature, `MOBILE_AUTH_JWT_SECRET`, puis `docker compose --profile mobile up -d` : son service ne démarre pas sans ce profil |

## Cas particuliers

- **Relancer l'installeur sur un serveur déjà installé** ouvre un menu : **État des services**,
  **Mettre à jour** — voir [Mettre à jour myBrief](mettre-a-jour-mybrief.md) —, **Sauvegarder
  MongoDB**, **Journaux**, **Réinstaller**. Les quatre premiers
  existent aussi en commande directe : `bash install.sh status`, `update`, `backup` et `logs`. Les
  trois premières ne posent aucune question : elles se lancent aussi depuis une tâche planifiée.
- **Réinstaller** repose les questions et réécrit `.env`, en reprenant les secrets déjà en place : le
  mot de passe de la base, la clé de chiffrement et le mot de passe provisoire. La base, ses comptes
  et leurs mots de passe restent tels quels. Les réglages ajoutés à la main dans `.env` —
  serveur d'envoi de mails, application mobile, version figée… — ne sont pas repris : ils restent
  dans la copie `.env.bak.` suivie de la date, à recopier, puis `docker compose up -d`.
- **Sauvegarder** : `bash install.sh backup` écrit une copie de la base dans `backups/`. Rien ne la
  lance tout seul : planifiez-la, et gardez les copies hors du serveur.
- **Sans l'installeur**, pour une installation scriptée : écrire `.env` à partir de
  `install/env.example`, puis `docker compose up -d`. C'est ce que fait l'installeur.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « … ne résout pas encore » ou « … pointe sur … » | Le domaine ne pointe pas encore sur ce serveur. Corrigez le DNS, ou attendez sa propagation : sans lui, pas de certificat. |
| « les ports 80/443 sont déjà occupés » | Un autre serveur web les tient. Arrêtez-le, ou choisissez le second parcours si c'est un Traefik. |
| « le registre a refusé » | Les images ne sont pas publiques : acceptez de vous connecter au registre, avec le jeton fourni par MyAlfred. |
| « l'API ne devient pas saine » | Presque toujours une valeur manquante dans `.env`. Les journaux s'affichent ; `bash install.sh logs api` les rouvre. |
| L'installeur s'est arrêté avant le résumé | Corrigez la cause affichée, puis relancez `bash install.sh`. S'il a déjà écrit `.env`, il ouvre son menu : choisissez **Réinstaller**, qui reprend les mêmes secrets. Le mot de passe provisoire est dans `.env`, à la ligne `ADMIN_SEED_PASSWORD`. |
| « … ne répond pas encore avec un certificat valide » | DNS pas encore propagé, ou ports 80 et 443 filtrés. Suivez `docker compose logs -f traefik`, puis relancez `bash install.sh status`. |
| « docker demande sudo ici » | Votre compte n'est pas dans le groupe `docker` : l'installeur se sert de `sudo` et continue. |
| `504 Gateway Timeout` sur le second parcours | Le réseau Docker donné n'est pas celui du Traefik. Corrigez `TRAEFIK_NETWORK` dans `.env`, puis `docker compose up -d`. |
