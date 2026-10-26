---
title: Activer la connexion Google
description: Créer l'identifiant OAuth dans Google Cloud, le reporter dans myBrief, et ouvrir Continuer avec Google et les comptes Google reliés.
sidebar:
  order: 2
---

**Administration → Authentification**, carte **Connexion avec Google**.

## Avant de commencer

Un accès à la **console Google Cloud** de votre organisation, avec le droit de créer des identifiants.

## Côté Google Cloud

1. Créez un identifiant **OAuth**, de type **Application Web**.
2. Dans **URI de redirection autorisés**, collez **les deux adresses** affichées par myBrief, telles
   quelles :
   - **URI de redirection autorisée** — pour la connexion ;
   - **URI de redirection (envoi par mail)** — pour relier les comptes Gmail et Drive des utilisateurs.
     Sans elle, relier un compte échoue avec l'erreur « redirect_uri_mismatch ».
3. **Activez Gmail API et Google Drive API** dans le projet.
4. Choisissez l'audience **Interne** : sans elle, Google exige un examen de l'application, ou fait
   expirer les comptes reliés au bout de 7 jours.
5. Notez l'**ID client** et le **secret client**.

Les autorisations exactes, l'audience et les réglages de la console d'administration Google qui
peuvent bloquer les comptes reliés :
[Autoriser myBrief dans Google Workspace](autoriser-mybrief-dans-google-workspace.md).

## Côté myBrief

1. Collez l'**ID client** et le **Secret client**. Le secret n'est jamais réaffiché ; laissé vide ensuite,
   il est conservé.
2. Cochez **Activer** pour afficher **Continuer avec Google** sur la page de connexion.
3. Cliquez **Enregistrer**, en bas de l'onglet.
4. **Tester**, dans la carte **Page de connexion**.

## Ce qu'il faut savoir

- **Les mêmes identifiants** servent aux comptes Google reliés — envoi par Gmail, dépôt dans le Drive —,
  même si vous n'activez pas la connexion par Google.
- **Qui obtient un compte** : les adresses des **Domaines autorisés** — voir
  [Restreindre aux domaines autorisés](restreindre-aux-domaines-autorises.md). Google exige une adresse
  vérifiée.
- Pour que les utilisateurs déposent dans leur Drive, choisissez aussi **Google (Gmail + Drive)** comme
  fournisseur — voir [Choisir le compte relié](../actions/choisir-le-compte-relie.md).

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Renseignez l'ID client et le secret avant d'activer la connexion Google. » | Complétez les deux champs. |
| Google répond « redirect_uri_mismatch » | Une URI de redirection manque dans la console, ou diffère d'un caractère : recopiez-la depuis myBrief. |
| Relier un compte échoue alors que la connexion marche | La seconde URI ou Gmail API manquent, ou la console d'administration bloque myBrief : voir [Autoriser myBrief dans Google Workspace](autoriser-mybrief-dans-google-workspace.md). |
| L'envoi marche, le dépôt dans le Drive échoue | Google Drive API n'est pas activée dans le projet. |
| « La connexion Google n'est pas configurée sur ce serveur. » chez un utilisateur | Les identifiants ne sont pas enregistrés, ou la connexion n'est pas activée. |
