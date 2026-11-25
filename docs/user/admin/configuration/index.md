---
title: La configuration de l'instance
description: Le vocabulaire de l'organisation, joint à chaque compte rendu, les corrections automatiques de la transcription, et l'apparence de myBrief — logo, phrase d'accueil, couleurs.
sidebar:
  order: 1
---

Deux pages de **Administration → Organisation** règlent ce qui vaut pour toute l'instance :
**Entreprise**, pour le **vocabulaire et le contexte de votre organisation** et les **corrections
automatiques de la transcription** ; **Marque & apparence**, pour l'**apparence** de myBrief.

## À quoi ça sert

- **Le vocabulaire** fait écrire juste, dans tous les comptes rendus, les noms que l'IA ne peut pas
  deviner : vos clients, vos produits, vos sigles. La détection d'actions s'en sert aussi.
- **Les corrections automatiques** remplacent d'office, dans la transcription de toutes les réunions,
  les noms que la transcription écrit mal à chaque fois — « Klobex » devient « Globex ».
- **L'apparence** donne à myBrief les couleurs et le logo de votre organisation, jusque sur la page de
  connexion.

## Comment ça marche

**Le vocabulaire** est un texte de 2 000 caractères au plus, joint à **chaque compte rendu, pour tous
les comptes**, et à chaque analyse de la **détection d'actions**. Il fait foi pour l'orthographe des
noms. Chaque utilisateur peut y ajouter son propre contexte, dans **Réglages → Préférences IA → Mon
contexte**.

Laissé vide, rien n'est joint aux comptes rendus, et la détection d'actions reçoit un contexte par
défaut qui ne décrit pas votre organisation : renseignez-le dès la mise en service.

**Les corrections automatiques** sont une liste « ce que la transcription écrit → ce qu'il faut écrire
à la place », **valable pour toutes les réunions, de tous les comptes** : à manier avec modération,
pour les noms propres et les sigles seulement. Le remplacement porte sur des mots entiers, sans tenir
compte des majuscules ni des accents, quand chaque phrase se termine ; le mot corrigé s'éclaire un
instant à l'écran. Les réunions passées ne changent pas. Le réglage se termine par **Essayer** : une
phrase tapée montre le résultat avant d'enregistrer.

**L'apparence** :

| Élément | Où il s'affiche |
|---|---|
| **Logo** | La barre latérale, la page de connexion — y compris dans l'application mobile —, l'écran d'accueil, la fenêtre de bienvenue. Sur un écran de téléphone, la barre du haut garde le logo intégré : c'est un défaut |
| **Phrase d'accueil** | Sous le nom de l'application, dans la barre latérale — en français et en anglais, selon la langue de l'interface |
| **Couleur primaire** | Les boutons, les liens, les accents, la page de connexion |
| **Couleur secondaire** | Les surfaces claires, les fonds de cartes et d'onglets, les bordures |

Les couleurs d'alerte et celles des tags ne changent pas : elles portent un sens, pas une identité.

**Chaque page s'ouvre repliée**, sur un groupe de tuiles : **Entreprise** porte **Les mots de
l'organisation** — **Vocabulaire**, **Corrections** ; **Marque & apparence** porte **Apparence** —
**Logo**, **Phrase d'accueil**, **Couleurs**. Chaque tuile dit ce qui est en place : le début du
vocabulaire, le nombre de corrections et la première d'entre elles, le logo, la phrase, les deux
couleurs. Un clic déplie son réglage sous le groupe, un seul à la fois ; l'ⓘ de son titre en rappelle
l'usage. Replier une tuile ne perd rien : elle porte **Modifié** jusqu'à l'enregistrement, ou **À
corriger** quand une saisie bloque l'enregistrement.

**Chaque page a son bouton Enregistrer**, qui n'enregistre que ce qu'elle montre : passer de l'une à
l'autre sans enregistrer perd la saisie en cours. Vous voyez l'effet aussitôt ; les autres comptes, au
prochain chargement de myBrief.

## Configurer

| Réglage | Où | Effet | Page |
|---|---|---|---|
| **Texte joint aux comptes rendus** | Entreprise → tuile **Vocabulaire** | L'orthographe des noms et la compréhension des allusions, pour tous | [Renseigner le vocabulaire de l'organisation](renseigner-le-vocabulaire-de-l-organisation.md) |
| **La transcription écrit…**, **Écrire à la place** | Entreprise → tuile **Corrections** | Les mots remplacés dans la transcription de toutes les réunions | [Corriger automatiquement la transcription](corriger-automatiquement-la-transcription.md) |
| **Logo**, **Phrase d'accueil**, **Couleurs de l'interface** | Marque & apparence → tuiles **Logo**, **Phrase d'accueil**, **Couleurs** | L'identité visuelle de myBrief | [Personnaliser l'apparence](personnaliser-l-apparence.md) |

## Exemples de configuration

**Un industriel.** Vocabulaire : « Nous fabriquons des pompes hydrauliques. « ADV » désigne
l'administration des ventes ; nos clients principaux sont les établissements Durand et Martin
Distribution. » Une correction automatique : « Klobex, Clobex » → « Globex », le nom d'un client que la
transcription écorche à chaque réunion. Logo de l'entreprise, couleur primaire à sa charte.

**Un cabinet de conseil.** Vocabulaire : les noms des missions en cours et leurs sigles, mis à jour
chaque trimestre. Apparence laissée par défaut.

## Vérifier que tout fonctionne

1. Générez un compte rendu d'une réunion où un nom du vocabulaire est prononcé : il est écrit juste.
2. Dans **Réglages → Pendant la réunion → Détection d'actions**, le **Banc d'essai** avec un extrait qui
   cite un client : la consigne affichée par **Voir la consigne envoyée au modèle** contient votre
   vocabulaire.
3. Dans **Essayer**, une phrase avec un mot à corriger : le **Résultat** le remplace. Puis une courte
   réunion où le mot est prononcé : il s'écrit juste dès la fin de la phrase.
4. Déconnectez-vous : la page de connexion porte le logo et la couleur primaire.

## Voir aussi

- [Les templates](../templates/index.md) — l'autre réglage qui façonne les comptes rendus
- [L'IA](../ia/index.md) — le modèle qui rédige
