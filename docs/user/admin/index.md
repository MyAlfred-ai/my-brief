---
title: Administration
description: Ce qu'un administrateur de l'instance myBrief règle depuis l'interface, onglet par onglet, et dans quel ordre.
sidebar:
  label: Vue d'ensemble
  order: 0
---

Ces pages sont réservées aux personnes qui administrent l'instance myBrief de leur organisation. Elles
suivent, autant que possible, les sujets de la documentation utilisateur : un sujet réglé ici renvoie à
sa page côté utilisateur.

## L'écran Administration

**Administration**, dans le menu de compte — votre nom, en bas de la colonne de gauche ; sur
téléphone, votre avatar, en haut à droite —, ouvre l'administration. La ligne n'apparaît qu'aux comptes
qui ont le rôle **Administrateur**.

| Onglet | Ce qu'on y règle | Sujet |
|---|---|---|
| **Configuration** | Le vocabulaire de l'organisation, les corrections automatiques de la transcription, le logo, la phrase d'accueil, les couleurs | [La configuration de l'instance](configuration/index.md) |
| **Templates** | Les templates proposés à tous, et les templates fournis | [Les templates](templates/index.md) |
| **Actions** | Les boutons après réunion, le compte relié, les limites d'envoi | [Les actions après réunion](actions/index.md) |
| **Utilisateurs** | Les comptes, les rôles, les mots de passe | [Les utilisateurs](utilisateurs/index.md) |
| **Groupes** | Les groupes d'utilisateurs, et qui est dans lequel | [Gérer les groupes](utilisateurs/gerer-les-groupes.md) |
| **Authentification** | La page de connexion, Google, Microsoft, les domaines autorisés | [La connexion](connexion/index.md) |
| **IA** | La clé OpenAI, les modèles de rédaction et de transcription, l'infographie | [L'IA](ia/index.md) |
| **MyBrain** | Le myBrain de l'organisation, et qui lui envoie ses réunions | [L'envoi des réunions à myBrain](mybrain/index.md) |
| **Statistiques** | L'usage de l'instance, compte par compte, ce qu'il coûte en IA, et le rapport PDF | [Les statistiques](statistiques/index.md) |

## Les pastilles : ce qui reste à régler

Une **pastille** sur votre nom — sur téléphone, sur votre avatar —, puis sur la ligne
**Administration** du menu de compte, signale qu'un réglage de l'organisation est à revoir ; la même
pastille marque ensuite, dans la colonne de gauche, l'onglet où il se corrige. Survolez-la : une bulle
dit ce qui ne va pas et ce que cela coûte. Sur téléphone, la pastille apparaît aussi sur le bouton
menu, et la phrase est écrite sous le nom de l'onglet.

| Couleur | Sens |
|---|---|
| Rouge | Une panne : quelque chose ne marche plus, pour tout le monde |
| Orange | Un réglage sans effet : un bouton proposé qui n'apparaîtra chez personne |
| Bleu | Un conseil : rien n'est cassé, le résultat serait meilleur |

| Onglet | Ce qui allume sa pastille |
|---|---|
| **Configuration** | Logo, phrase d'accueil et couleurs d'origine ; vocabulaire de l'organisation vide |
| **Actions** | **Entreposer** proposé sans fournisseur choisi ; **Envoyer par mail** proposé alors que le serveur n'a pas de relais d'envoi et qu'aucun compte ne peut être relié |
| **Authentification** | Le fournisseur choisi dans **Actions** n'a pas ses identifiants : personne ne peut relier son compte |
| **IA** | Aucune clé OpenAI, ou une clé qu'OpenAI refuse |
| **MyBrain** | La clé ne peut plus être lue, myBrain la refuse, lui a retiré le droit « nourrir », ou ne répond pas |
| **Statistiques** | Tarifs d'IA relevés il y a plus de trente jours |

La clé OpenAI et la connexion à myBrain sont réellement essayées, pas seulement lues. Une pastille
disparaît dès que vous enregistrez la correction. Après une correction faite hors de myBrief — un
serveur myBrain redémarré, par exemple —, rouvrez l'administration : elle suit dans les deux minutes.
Un incident passager, un service lent, n'allume jamais de pastille.

La **roue crantée** porte, comme pour tout le monde, vos pastilles personnelles : votre compte relié,
vos dossiers de dépôt. Elles ne concernent que vous, et vous ne voyez pas celles de vos collègues.

## Mettre une instance en service

L'installation sur le serveur, puis les réglages sans lesquels personne ne peut se servir de myBrief —
votre mot de passe, la clé OpenAI, la connexion, les comptes —, se font dans cet ordre :
[L'installation](installation/index.md). Sur une instance déjà installée, commencez à
[Faire les réglages de base](installation/faire-les-reglages-de-base.md).

## Le principe à retenir

**Pour les actions après réunion, l'administration est un plafond, pas un défaut.** Ce que vous fermez,
un utilisateur ne peut pas le rouvrir ; ce que vous ouvrez, il l'affine dans vos limites. Pour le reste
— templates, vocabulaire, corrections de la transcription, apparence —, vos réglages s'appliquent à tous
les comptes.

## Enregistrer vos réglages

Les onglets **Configuration**, **Authentification**, **IA**, **Actions** et **MyBrain** ont une barre d'enregistrement
en bas : « Modifications non enregistrées », **Annuler**, **Enregistrer**. Aucun avertissement ne vous
retient si vous changez d'onglet sans enregistrer. **Utilisateurs** et **Groupes** agissent
immédiatement ; chaque template s'enregistre à part.

Les autres comptes voient la plupart des changements au prochain chargement de myBrief.

## Ce que vous voyez, et ce que vous ne voyez pas

Vous voyez les comptes, leur dernière connexion et des volumes d'usage, par personne. Vous ne voyez
**jamais** le contenu des réunions de vos collègues : ni transcription, ni résumé, ni notes. Une réunion
envoyée à myBrain y est lue, elle, par les personnes qui valident sa revue — voir
[L'envoi des réunions à myBrain](mybrain/index.md).

Les réunions ne sont jamais supprimées automatiquement : chacun garde les siennes jusqu'à ce qu'il les
supprime, ou que son compte soit supprimé.

## Qui fait quoi

| Relève de votre organisation | Relève de MyAlfred |
|---|---|
| Comptes, rôles, connexion, domaines autorisés | Installation — voir [L'installation](installation/index.md) —, mises à jour, serveur, sauvegardes |
| Clé OpenAI et choix des modèles | Le relais d'envoi des mails du serveur |
| Actions, templates, vocabulaire, apparence | Les identifiants Microsoft Entra fournis au déploiement |
| Applications Google Cloud et Microsoft Entra de votre organisation | L'activation ou non de la connexion par mot de passe au niveau du serveur |
