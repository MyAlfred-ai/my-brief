---
title: Gérer les comptes
description: Créer un compte, changer son nom ou son rôle, le désactiver et le réactiver.
sidebar:
  order: 1
---

**Administration → Utilisateurs.**

## Créer un compte

1. Cliquez **Nouvel utilisateur**, à côté de la recherche — sur téléphone, le bouton n'affiche que son
   icône.
2. Renseignez :
   - **Adresse email** — elle ne se modifie plus ensuite ;
   - **Nom affiché** — facultatif ; vide, myBrief prend le début de l'adresse ;
   - **Rôle** : **Utilisateur** ou **Administrateur** ;
   - **Groupes** : le groupe par défaut est coché ; cochez les autres groupes du compte — voir
     [Gérer les groupes](gerer-les-groupes.md) ;
   - **Mot de passe initial** — vide, myBrief en génère un ;
   - **Demander le changement de mot de passe à la première connexion** — cochée par défaut : laissez-la.
3. Cliquez **Enregistrer**.

Si le mot de passe a été généré, la fenêtre **Mot de passe à transmettre** l'affiche : « Notez-le
maintenant : il ne sera plus affiché. » **Copier**, puis transmettez-le à la personne par un canal sûr,
avec l'adresse de myBrief. Aucun mail ne lui est envoyé.

Un compte qui entre par Google ou Microsoft avec un domaine autorisé n'a pas besoin d'être créé : il se
crée à la première connexion.

## Modifier

Cliquez la ligne du compte : sa fiche s'ouvre. Modifiez le **Nom affiché**, le **Rôle**, les
**Groupes** ou **Compte désactivé**, et **Enregistrer**. Changer le rôle ferme les sessions de la
personne : elle se reconnecte avec ses nouveaux droits. Changer ses groupes ne la déconnecte pas.

Pour retrouver les comptes d'un groupe, le filtre **Tous les groupes**, à côté de la recherche, se
règle sur un groupe.

## Désactiver, réactiver

L'interrupteur **Actif**, sur la ligne du compte, agit tout de suite :

- **désactivé** : les sessions sont fermées, la personne ne peut plus entrer ; ses réunions et ses
  réglages sont conservés ;
- **réactivé** : elle retrouve tout.

Désactivez plutôt que supprimer tant qu'un doute existe : c'est réversible.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Un compte existe déjà avec cette adresse. » | Le compte existe, peut-être créé par une connexion Google ou Microsoft : cherchez-le dans la liste. |
| « Impossible : c'est le dernier administrateur actif. » | Donnez d'abord le rôle **Administrateur** à un autre compte. |
| « Vous ne pouvez pas appliquer cette action à votre propre compte. » | Un autre administrateur doit le faire. |
| Le compte n'apparaît pas dans la liste | La liste charge les comptes cent par cent : **Afficher la suite**, en bas de la liste, ou **Rechercher un utilisateur…**. |
