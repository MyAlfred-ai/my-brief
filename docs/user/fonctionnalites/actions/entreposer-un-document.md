---
title: Entreposer un document
description: Déposer le compte rendu ou la transcription dans votre Google Drive, votre OneDrive ou une bibliothèque SharePoint, dans le dossier de votre choix.
sidebar:
  order: 2
---

**Entreposer** dépose le document dans votre espace de fichiers — Google Drive ou OneDrive, selon votre
organisation — dans le dossier que vous avez choisi.

## Avant de commencer

- Un compte Google ou Microsoft **relié avec l'accès aux fichiers** — voir
  [Relier son compte Google ou Microsoft](../connexion/relier-son-compte-google-ou-microsoft.md).
- Votre administrateur a choisi le fournisseur : sans lui, l'entrée n'existe pas dans le menu **Partager**.

## Choisir votre dossier

1. Ouvrez **Ma configuration → Entreposer**.
2. Dans **Dossier de dépôt**, tapez le chemin — « Clients/Acme/Comptes-rendus » — ou cliquez
   **Parcourir…** :
   - choisissez la **Bibliothèque** : Mon Drive et vos Drive partagés chez Google ; votre OneDrive et
     les bibliothèques des sites SharePoint que vous suivez chez Microsoft ;
   - naviguez avec **Racine** et **Remonter**, ou cherchez avec **Rechercher un dossier…** ;
   - **Nouveau dossier…** puis **Créer** crée le dossier tout de suite, chez le fournisseur ;
   - cliquez **Choisir ce dossier**.
3. Facultatif :
   - **Me demander confirmation avant chaque dépôt** — une fenêtre récapitule le dossier et le nom du
     fichier avant chaque dépôt ;
   - **Un sous-dossier par tag** — voir [Donner une destination à un tag](../tags/donner-une-destination-a-un-tag.md).
4. Cliquez **Enregistrer**.

Laissé vide, le dossier est celui défini par votre administrateur ; à défaut, un dossier « myBrief » à
la racine de votre Drive, créé au premier dépôt.

## Déposer

1. Ouvrez la réunion, onglet **Résumé** — ou **Transcription**.
2. Cliquez **Partager**, à droite des onglets, puis **Entreposer via le tag** quand le tag de la réunion
   a son dossier — sinon **Entreposer dans Google Drive**, ou **OneDrive**. Le sous-titre de l'entrée
   nomme le dossier ; le bouton affiche « Dépôt… » le temps du dépôt.
3. Si la confirmation est activée, la fenêtre **Déposer ce document ?** affiche le **Dossier**, le
   **Tag**, le **Compte** et le **Fichier** : **Déposer**, ou **Annuler** — rien n'est alors déposé.

## Résultat

Un message nomme la destination : « Document déposé dans « Clients/Acme » (Mon Drive). » Le résumé est
déposé en PDF, la transcription en fichier texte.

## Ce qu'il faut savoir

- **Un dossier supprimé** entre deux dépôts est recréé.
- **Un fichier du même nom** : Microsoft renomme le nouveau automatiquement ; Google en crée un second,
  du même nom. Un nom de fichier qui contient la date et le titre évite les doublons — voir
  [Nommer les fichiers et l'objet du mail](nommer-les-fichiers-et-l-objet.md).
- **Les Drive partagés et les bibliothèques SharePoint** n'apparaissent que si votre compte a été relié
  avec les autorisations correspondantes ; sinon, un message dans la fenêtre vous invite à le relier à
  nouveau.
- **Pour une réunion taguée**, le dossier du tag passe avant le vôtre.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Le dépôt vers … n'est pas configuré. Connectez votre compte dans « Ma configuration »… » | Reliez votre compte. |
| « Votre compte n'autorise pas (ou plus) le dépôt de fichiers… » | Reliez-le à nouveau, en acceptant l'accès aux fichiers : **Reconnecter mon compte**, dans **Ma configuration → Entreposer**. |
| « Le dépôt a échoué. Réessayez dans quelques instants. » | Réessayez ; si cela se répète, testez le dépôt — voir [Tester l'envoi et le dépôt](tester-l-envoi-et-le-depot.md). |
| Vos Drive partagés n'apparaissent pas dans **Parcourir…** | Votre compte a été relié avant que myBrief sache les lister : **Déconnecter**, puis reliez-le de nouveau, dans **Ma configuration → Connexion**. |
| Vos bibliothèques SharePoint n'apparaissent pas | L'autorisation SharePoint n'a pas été accordée par votre organisation, ou vous ne suivez pas le site. Voyez avec votre service informatique. |
| « Un nom de dossier ne peut pas contenir « / ». » | Choisissez un autre nom de dossier. |
