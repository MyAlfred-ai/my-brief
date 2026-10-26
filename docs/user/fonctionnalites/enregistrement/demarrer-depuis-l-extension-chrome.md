---
title: Démarrer une réunion depuis l'extension Chrome
description: Ouvrir myBrief ou lancer une réunion d'un clic depuis la barre de Chrome, où que vous soyez sur le web.
sidebar:
  order: 4
---

L'**extension Chrome** met une icône myBrief dans la barre de Chrome : un clic ouvre myBrief, un autre
démarre une réunion, d'où que vous soyez sur le web. Rien ne change dans myBrief lui-même.

## Avant de commencer

- Chrome, ou un navigateur qui en dérive : Edge, Brave… Sur Firefox et Safari, il n'y a pas
  d'extension.
- Sur un ordinateur. L'extension n'existe pas dans l'application mobile.
- L'extension installée et liée à votre myBrief : [Installer myBrief sur ses appareils](../installer-mybrief-sur-ses-appareils.md).

## Utiliser

| Geste | Effet |
|---|---|
| **Nouvelle réunion**, dans le menu de l'icône | Ouvre myBrief et démarre l'enregistrement, ou revient sur l'onglet déjà ouvert. Une réunion en cours n'est jamais interrompue : le bouton devient **Revenir à la réunion**. |
| **Ouvrir MyBrief** | Retrouve votre onglet, ou en ouvre un. |
| **Alt + Maj + M** (Option + Maj + M sur Mac) | Démarre une réunion sans ouvrir le menu. Modifiable dans `chrome://extensions/shortcuts`. |
| Badge **REC** sur l'icône | Rouge pendant l'enregistrement, gris en pause. La durée s'affiche au survol ; elle compte les pauses, elle peut donc différer du chronomètre de myBrief. |
| **Me rappeler quand une visio est ouverte** | Un point bleu apparaît sur l'icône dès qu'un onglet Meet, Teams, Zoom ou Webex est ouvert sans réunion myBrief. Chrome demande l'accès à l'adresse des onglets de ces seuls sites. |

Le démarrage suit le même parcours que dans myBrief : le micro, puis **Quel type de réunion ?** —
**Réunion avec visio** pour partager l'écran, voir
[Enregistrer une réunion en visio](enregistrer-une-reunion-en-visio.md). L'extension ne capte
pas le son elle-même.

## Ce qu'il faut savoir

- **Si une réunion est déjà affichée** dans l'onglet myBrief, démarrez plutôt par **Nouvelle réunion**
  dans myBrief : l'écran se vide avant l'enregistrement.
- Le rappel ne reconnaît pas Teams ouvert en mode application dans le navigateur, ni les applications de
  bureau Teams et Zoom.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| Un « ! » sur l'icône au raccourci clavier | L'extension n'est liée à aucun site : liez-la en restant sur l'onglet myBrief — voir [Installer myBrief sur ses appareils](../installer-mybrief-sur-ses-appareils.md). |
| « Extension non détectée dans ce navigateur » | L'extension n'est pas installée, ou pas liée : [Installer myBrief sur ses appareils](../installer-mybrief-sur-ses-appareils.md). |
| L'extension a disparu | Le dossier décompressé a été déplacé ou supprimé : rechargez-la depuis `chrome://extensions`. |
