---
title: Préparer le serveur
description: Réunir avant l'installation ce que l'installeur ne peut pas faire seul — le serveur, le nom de domaine, les ports ouverts et les accès.
sidebar:
  order: 1
---

L'installeur vérifie ce qu'il peut, mais il ne crée ni le serveur, ni le nom de domaine, ni les accès.
Réunissez-les avant de le lancer : le certificat ne s'obtient que si le domaine pointe déjà sur le
serveur.

## Avant de commencer

- Un compte chez l'hébergeur du serveur, et la main sur le nom de domaine de l'organisation.
- Le choix de l'adresse de myBrief, par exemple `mybrief.exemple.fr`.

## Étapes

1. **Créez le serveur.**

   | Élément | Ce qu'il faut |
   |---|---|
   | Système | Linux. Le cas prévu est un VPS Ubuntu |
   | Mémoire | 2 Go suffisent : rien n'est compilé sur le serveur |
   | Compte | Un compte qui a le droit `sudo` |
   | Logiciels | `git`. Docker n'est pas obligatoire : s'il manque, l'installeur propose de l'installer, avec le script officiel de Docker pour Ubuntu |

2. **Faites pointer le nom de domaine sur le serveur.** Chez le gestionnaire du domaine, un
   enregistrement DNS de l'adresse choisie vers l'adresse IP du serveur. Faites-le tôt : un
   changement de DNS peut mettre du temps à se propager.
3. **Ouvrez les ports 80 et 443** dans le pare-feu de l'hébergeur, et laissez-les libres sur le
   serveur. Let's Encrypt passe par le port 80 pour vérifier le domaine avant de délivrer le
   certificat.
4. **Si un Traefik tourne déjà sur le serveur**, relevez sa version — la 3 est requise — le nom de son
   réseau Docker (`docker network ls`), son point d'entrée HTTPS et son résolveur de certificats.
   L'installeur les demande ; myBrief se branche alors derrière lui, sans occuper les ports.
5. **Obtenez les accès de MyAlfred** : au dépôt de myBrief, pour récupérer l'installeur, et à son
   registre d'images. Le registre demande un jeton GitHub de portée `read:packages` si ses images
   ne sont pas publiques.

## Résultat

Un serveur joignable, le domaine qui pointe dessus, les ports 80 et 443 ouverts, et l'accès au dépôt.
Suite : [Installer myBrief sur le serveur](installer-mybrief-sur-le-serveur.md).

## Ce que vous pouvez préparer pour la suite

| Pour… | Il faut… | Quand |
|---|---|---|
| La transcription et les résumés | La clé OpenAI de l'organisation | À l'installation, ou plus tard dans l'onglet **IA** — voir [Enregistrer la clé OpenAI](../ia/enregistrer-la-cle-openai.md) |
| Le premier compte | L'adresse mail de la personne qui administrera myBrief | À l'installation |
| La connexion par Google ou par Microsoft | Une application déclarée chez Google Cloud ou dans Microsoft Entra | Google : après l'installation, les adresses de redirection à y déclarer s'affichent dans l'onglet **Authentification** — voir [Autoriser myBrief dans Google Workspace](../connexion/autoriser-mybrief-dans-google-workspace.md). Microsoft : **avant**, ses identifiants se posent au déploiement — voir [Autoriser myBrief dans Microsoft Entra ID](../connexion/autoriser-mybrief-dans-microsoft-entra-id.md) |

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| Les ports 80 et 443 sont déjà pris par un autre serveur web | Arrêtez-le, ou, si c'est un Traefik en version 3, installez myBrief derrière lui (étape 4). |
| Le Traefik en place est en version 2 | Le second parcours de l'installeur ne le prend pas en charge : l'installation se prépare avec MyAlfred. |
| Le serveur n'est pas joignable depuis Internet | Let's Encrypt ne peut pas délivrer de certificat : l'installation se prépare avec MyAlfred. |
