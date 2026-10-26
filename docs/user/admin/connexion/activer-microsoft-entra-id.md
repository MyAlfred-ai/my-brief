---
title: Activer Microsoft Entra ID
description: Ouvrir Continuer avec Microsoft et les comptes Microsoft reliés, à partir de l'application déclarée dans votre annuaire Entra.
sidebar:
  order: 3
---

**Administration → Authentification**, carte **Connexion avec Microsoft Entra ID**.

## Avant de commencer

L'application myBrief doit être déclarée dans votre annuaire Microsoft Entra — une *app registration* —,
et ses identifiants fournis à MyAlfred au déploiement : la marche à suivre est dans
[Autoriser myBrief dans Microsoft Entra ID](autoriser-mybrief-dans-microsoft-entra-id.md). Sans eux, la
carte affiche « Aucun identifiant Entra n'est configuré sur ce serveur. » : contactez MyAlfred.

## Étapes

1. Vérifiez l'**ID client** et l'**Annuaire (URL de découverte)** : repris de la configuration du
   déploiement, ils ne se modifient pas ici.
2. Si besoin, collez un nouveau **Secret client** — à son expiration, par exemple. Laissé vide, le secret
   actuel est conservé.
3. Activez la connexion.
4. Cliquez **Enregistrer**, en bas de l'onglet, puis **Tester**, dans la carte **Page de connexion**.

## Côté Microsoft

- **L'URI de redirection** affichée est **déjà** déclarée dans votre app registration : n'en changez pas.
  Elle sert aussi au retour des comptes Microsoft reliés.
- **Pour les comptes reliés**, l'app registration doit porter les permissions déléguées Microsoft Graph
  **Mail.Send** — envoyer les comptes rendus — et **Files.ReadWrite** — les déposer dans le OneDrive —,
  plus **Sites.ReadWrite.All** — les bibliothèques SharePoint des sites suivis — tant que vous proposez
  ces dernières.
- **Le consentement administrateur** est indispensable avec le réglage par défaut de Microsoft : sans
  lui, vos utilisateurs voient Microsoft demander l'accord d'un administrateur. Le détail, autorisation
  par autorisation : [Autoriser myBrief dans Microsoft Entra ID](autoriser-mybrief-dans-microsoft-entra-id.md).
- **Si votre annuaire refuse Sites.ReadWrite.All**, désactivez **Proposer les bibliothèques SharePoint**
  dans **Administration → Actions** : myBrief cesse de la demander, et la liaison aboutit pour Outlook et
  OneDrive — voir [Choisir le compte relié](../actions/choisir-le-compte-relie.md). Sans cela, une
  permission refusée fait échouer la liaison entière.
- **Le secret expire** à la date choisie dans Entra : notez-la, et remplacez-le avant.

## Ce qu'il faut savoir

- **Qui obtient un compte** : les adresses des **Domaines autorisés** — voir
  [Restreindre aux domaines autorisés](restreindre-aux-domaines-autorises.md). Deux adresses du profil
  Entra comptent : l'adresse email, et le nom d'utilisateur principal avec lequel la personne se
  connecte.
- **Le SSO historique** peut encore tourner en parallèle : la carte le signale. Masquez-le une fois la
  connexion Microsoft testée — voir [Choisir les modes de connexion](choisir-les-modes-de-connexion.md).
- Pour que les utilisateurs déposent dans leur OneDrive, choisissez aussi **Microsoft (Outlook +
  OneDrive)** comme fournisseur — voir [Choisir le compte relié](../actions/choisir-le-compte-relie.md).

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Votre compte ne publie aucune adresse email exploitable. » chez un utilisateur | Son profil Entra n'a pas d'adresse email, et son nom d'utilisateur principal n'a pas la forme d'une adresse : complétez le profil dans l'annuaire. |
| La connexion échoue après des mois sans souci | Le secret a expiré : créez-en un dans Entra et collez-le ici. |
| Les bibliothèques SharePoint n'apparaissent pas chez un utilisateur | Son compte a été relié avant l'ajout de **Sites.ReadWrite.All** : il le relie à nouveau, avec **Reconnecter mon compte**. Si personne ne les voit, vérifiez **Proposer les bibliothèques SharePoint** dans **Administration → Actions**. |
| Microsoft demande l'accord d'un administrateur à chaque liaison | Le consentement administrateur n'a pas été accordé : voir [Autoriser myBrief dans Microsoft Entra ID](autoriser-mybrief-dans-microsoft-entra-id.md). |
