---
title: Tester l'envoi et le dépôt
description: Vérifier que vos réglages d'envoi et de dépôt fonctionnent vraiment, sans attendre une réunion, et savoir d'où vient chaque valeur.
sidebar:
  order: 5
---

Le bouton **Tester** exécute un **vrai** envoi ou un **vrai** dépôt, avec vos réglages enregistrés. C'est
le seul moyen de savoir si votre compte, votre dossier et vos destinataires fonctionnent.

## Étapes

1. Ouvrez **Ma configuration → Envoi d'email** — ou **Entreposer**.
2. Cliquez **Tester l'envoi** — ou **Tester le dépôt**. Si des modifications ne sont pas enregistrées,
   le bouton devient **Enregistrer et tester l'envoi** et fait les deux.

## Ce qui se passe vraiment

- **Envoi** : un mail de test part **à votre liste de destinataires**, vous en copie, avec un fichier
  `mybrief-test.txt` joint. Prévenez vos destinataires, ou videz d'abord la liste pour ne tester qu'avec
  vous.
- **Dépôt** : un fichier `mybrief-test.txt` est déposé dans votre dossier, créé au besoin. Il n'est pas
  supprimé ensuite : effacez-le vous-même.

## Résultat

Un message dit ce qui s'est passé : « Mail de test envoyé à … (via …) », « Fichier de test « … » déposé
dans « … » », ou « Le test a échoué : » suivi de la raison et du geste à faire.

Le diagnostic détaille chaque valeur **et sa provenance** — vos réglages, ceux de l'organisation, ou la
valeur intégrée :

| Envoi | Dépôt |
|---|---|
| **Transport**, **Expéditeur**, **Destinataires**, **Objet** | **Fournisseur**, **Dossier**, **Fichier** |

« Ce dossier vient de vos réglages » et « il vient de l'organisation » ne se corrigent pas au même
endroit : la provenance vous dit où agir.

## Ce qu'il faut savoir

- **Les règles des tags ne sont pas testées** : le test n'a pas de réunion, donc pas de tag.
- **Après une modification**, le résultat se grise : « Ce résultat est antérieur à vos modifications.
  Enregistrez, puis relancez le test. »
- **Dix tests par heure** au plus.
- **Confirmation avant dépôt activée** : le test du dépôt échoue. Désactivez-la le temps du test.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Trop de tests en peu de temps. Réessayez dans … » | Attendez le délai indiqué. |
| « … votre compte n'est pas relié. Reliez-le depuis le bandeau ci-dessus. » | Reliez votre compte : **Relier mon compte**, en haut de la page. |
| « … votre compte n'autorise pas le dépôt de fichiers… » | **Reconnecter mon compte**, en acceptant l'accès aux fichiers. |
| « … cette action est désactivée par votre administrateur. » | L'action est fermée : voyez avec votre administrateur. |
| « … aucun fournisseur de dépôt n'est choisi. Contactez votre administrateur. » | Le dépôt n'est pas configuré sur votre installation. |
