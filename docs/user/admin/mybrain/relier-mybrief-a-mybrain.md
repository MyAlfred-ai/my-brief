---
title: Relier myBrief à myBrain
description: Enregistrer l'adresse de myBrain et sa clé d'API, tester la connexion, puis choisir qui envoie ses réunions.
sidebar:
  order: 1
---

**Administration → MyBrain.**

## Avant de commencer

- L'**adresse** de votre myBrain.
- Une **clé d'API** créée pour myBrief dans myBrain, avec le droit **Nourrir le cerveau** — voir
  [Créer une clé d'API](https://docs.myalfred.ai/my-brain/admin/applications/creer-une-cle-d-api/). Le
  droit **Lire le cerveau** n'est pas nécessaire.
- Le serveur de myBrief doit pouvoir joindre myBrain.

## Étapes

1. Carte **Connexion à MyBrain** : collez l'adresse dans **Adresse de MyBrain**. L'« URL de l'API » que
   myBrain affiche à la création de la clé, terminée par `/api/v1`, convient aussi.
2. Collez la clé dans **Clé d'API** — elle commence par `mbk_`.
3. Cliquez **Tester la connexion** : « Connexion opérationnelle : « myBrief », droits : lire, nourrir.
   Enregistrez pour l'appliquer. » Rien n'est encore enregistré. Tant qu'il manque l'adresse ou la
   clé, le bouton reste grisé et la carte dit ce qui manque — « Pour tester : une clé d'API. », par
   exemple.
4. Carte **Envoi des réunions** : choisissez **Désactivé**, **Au choix de chaque utilisateur** ou
   **Imposé à tous**.
5. Cliquez **Enregistrer**, en bas de l'onglet. L'adresse et la clé sont vérifiées de nouveau auprès
   de myBrain avant d'être enregistrées : une clé refusée, ou sans le droit **Nourrir le cerveau**,
   l'est ici.

## Résultat

Le badge passe à **Connecté**, et la carte indique « Connecté en tant que « myBrief » », avec les droits
de la clé. **Clé enregistrée** en montre le début et la fin, « mbk_AbCd…wxyz » — le même aperçu que
dans la liste des clés de myBrain. La clé ne quitte jamais le serveur.

Sauf **Désactivé**, vos utilisateurs trouvent la section **MyBrain** dans **Ma configuration**.

## Remplacer, retirer

- **Remplacer la clé** : dans myBrain, créez une nouvelle clé du même nom ; collez-la ici et
  enregistrez ; supprimez l'ancienne dans myBrain.
- **Retirer la clé** : plus aucune réunion ne part, jusqu'à ce qu'une nouvelle clé soit enregistrée.
- **Changer d'envoi** — de **Au choix de chaque utilisateur** à **Imposé à tous**, par exemple — ne
  demande ni l'adresse ni la clé, et vaut dès la réunion suivante.

## Ce qu'il faut savoir

- **Une réunion envoyée est lue par myBrain**, et par les personnes qui valident sa revue.
- **Supprimer une réunion, ou un compte, dans myBrief ne retire rien de myBrain** : ce qui y a été
  validé s'y supprime.
- **Seules partent les réunions commencées après l'ouverture de l'envoi**, ou après votre dernier
  changement d'**Envoi des réunions**.
- **Changer d'adresse pour un autre serveur demande de recoller la clé** : la clé enregistrée n'est
  jamais envoyée à une autre adresse. Corriger le chemin sur le même serveur, non.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Cette clé n'a pas le droit « Nourrir le cerveau »… » | Créez dans myBrain une clé qui a ce droit. |
| « MyBrain a refusé cette clé : elle est inconnue, ou a été supprimée. » | Collez-la de nouveau, entière, ou créez-en une nouvelle dans myBrain. |
| « Cette clé ne ressemble pas à une clé MyBrain… » | C'est sans doute une autre clé : celle de myBrain commence par `mbk_`. |
| « Aucun MyBrain ne répond à cette adresse. » ou « Cette adresse ne répond pas comme un MyBrain. » | Vérifiez l'adresse de votre myBrain. |
| « Cette adresse renvoie vers une autre : saisissez l'adresse finale. » | Reprenez l'adresse affichée à la suite du message — souvent la même, en `https://`. |
| « MyBrain est injoignable depuis le serveur de MyBrief. » | Le serveur de myBrief ne joint pas myBrain : voyez avec MyAlfred. |
| « Nouvelle adresse : collez de nouveau la clé… » | Vous changez de serveur : collez la clé dans **Clé d'API**, puis enregistrez. |
| « La clé enregistrée ne peut plus être lue par ce serveur… » | Collez la clé de nouveau, ou créez-en une dans myBrain. |
| Vos utilisateurs signalent « La connexion à MyBrain est à revoir » | **Tester la connexion**, corrigez l'adresse ou la clé ; ils peuvent ensuite **Réessayer**. |
