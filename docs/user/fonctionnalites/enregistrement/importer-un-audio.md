---
title: Importer un audio
description: Transformer un enregistrement fait ailleurs — dictaphone, téléphone, visio enregistrée — en transcription puis en compte rendu.
sidebar:
  order: 6
---

Un enregistrement déjà fait peut devenir une réunion myBrief : il est transcrit, puis vous en générez
le compte rendu comme pour une réunion enregistrée en direct.

## Avant de commencer

- **Un fichier audio** : mp3, m4a, wav, webm… Une vidéo est refusée : extrayez-en le son d'abord.
- **25 Mo au plus.** La durée importe peu : un long enregistrement est transcrit par morceaux de
  5 minutes, remis bout à bout. L'attente grandit avec la durée du fichier.
- **Un écran vide.** Le texte importé s'ajoute à la transcription affichée à l'écran. Si une réunion
  est affichée, videz d'abord l'écran : **Nouvelle réunion**, **Réunion en présentiel**, **Terminer**,
  **Supprimer la réunion**, puis **Supprimer**.

## Étapes

1. Ouvrez **Ma configuration → Importer un audio**.
2. Cliquez **Choisir un fichier audio** et sélectionnez le fichier. Le traitement démarre aussitôt :
   l'écran affiche « Import audio en cours ».
3. Fermez **Ma configuration** pour voir le résultat : la transcription apparaît, en un seul bloc.
4. Cliquez **Résumer →**, dans la barre du bas, choisissez le template, puis **Générer →** — voir
   [Générer un résumé](../resumes/generer-un-resume.md).

## Résultat

Une réunion ordinaire, avec sa transcription, son résumé et ses possibilités d'envoi et de dépôt. Elle
apparaît dans l'historique au premier résumé, avec un titre automatique ; sa durée est celle du
fichier.

## Ce qui change par rapport au direct

- **La transcription arrive d'un bloc**, sans découpage par prise de parole ni pastille **Visio** : il
  n'y a pas de participants à nommer.
- **La réunion n'existe qu'une fois résumée** : pas de bouton **Enregistrer** avant.
- **Les actions** sont analysées une seule fois, et seulement si l'espacement des analyses vaut
  « À chaque phrase », le réglage par défaut — voir [Régler la détection](../detection-d-actions/regler-la-detection.md).
- La langue n'est pas imposée : le service de transcription la reconnaît seul.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Veuillez sélectionner un fichier audio valide. » | Le fichier n'est pas un audio — une vidéo, par exemple. Extrayez-en le son. |
| « Le fichier est trop volumineux. La taille maximale est de 25MB. » | Réenregistrez en mp3 mono, ou découpez le fichier. |
| « Le serveur transcrit déjà d'autres fichiers. Réessayez l'import dans une minute. » | Le serveur limite le nombre de fichiers transcrits en même temps. Attendez une minute, puis choisissez à nouveau le fichier. |
| « Cet enregistrement est trop long pour être transcrit d'un seul tenant. » | Rare : le serveur n'a pas pu découper le fichier. Coupez-le en morceaux de moins de 5 minutes, puis importez-les dans l'ordre, sans vider l'écran entre deux. |
| « Erreur lors de l'import du fichier audio: … » | Le format n'est pas accepté par le service de transcription : convertissez en mp3. |
| La transcription se mêle à une autre réunion | Une réunion était affichée pendant l'import : videz l'écran et recommencez. |
| La transcription est médiocre | La qualité suit celle de l'enregistrement : un micro éloigné ou une pièce qui résonne donnent un mauvais résultat, quelle que soit l'application. |
