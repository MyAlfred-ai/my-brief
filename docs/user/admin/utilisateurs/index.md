---
title: Les utilisateurs
description: Créer les comptes, donner le rôle d'administrateur, les ranger en groupes, suspendre un accès, réinitialiser un mot de passe, supprimer un compte.
sidebar:
  order: 4
---

L'onglet **Administration → Utilisateurs** liste les comptes qui accèdent à myBrief sur votre instance,
et permet de les créer, de les modifier, de les suspendre et de les supprimer. L'onglet **Groupes**,
juste après, range ces comptes en ensembles : services, équipes, profils.

## À quoi ça sert

À décider qui entre et avec quels droits — et à couper un accès sans attendre quand quelqu'un quitte
l'organisation. Et à organiser les comptes en groupes, qui portent leurs règles : un quota de minutes
de réunion, le droit de générer des infographies.

## Comment ça marche

**Deux rôles.** **Utilisateur** : myBrief, ses réunions, ses réglages. **Administrateur** : en plus,
l'écran d'administration.

**Des groupes.** Chaque compte est dans au moins un groupe ; le groupe **Défaut** accueille tout nouveau
compte et tout compte qui n'en a plus d'autre. Dès qu'il existe un second groupe, la ligne d'un compte
montre les siens en puces, et la liste se filtre par groupe. Voir [Gérer les groupes](gerer-les-groupes.md).

**Deux façons d'avoir un compte.**

| | Comment | Mot de passe |
|---|---|---|
| **Créé par vous** | **Nouvel utilisateur** | Provisoire, à changer à la première connexion |
| **Créé à la première connexion** | Par Google ou Microsoft, si le domaine de l'adresse est autorisé — voir [Restreindre aux domaines autorisés](../connexion/restreindre-aux-domaines-autorises.md) | Aucun : **SSO uniquement**, dans la fiche du compte |

**La liste** tient une ligne par compte : **Nom**, **Email**, **Groupes** s'il en existe plus d'un,
**Dernière connexion** — en fait sa dernière ouverture de myBrief, dite « il y a 3 jours » — et
l'interrupteur **Actif**. Seules les
exceptions portent une pastille : **Admin**, **Désactivé**. Les comptes arrivent par ordre alphabétique
d'adresse, cent à la fois : **Afficher la suite**, en bas, charge les suivants ; **Rechercher un
utilisateur…** porte sur le nom et l'adresse.

**La fiche du compte** s'ouvre d'un clic sur sa ligne. Elle porte ce que la liste tait : la date exacte
de **Dernière connexion**, la mention **SSO uniquement** pour un compte sans mot de passe, et les gestes
rares — **Réinitialiser le mot de passe**, **Supprimer le compte**. Sur ordinateur, ces deux gestes
apparaissent aussi au survol de la ligne : la clé et la corbeille.

**Tout agit immédiatement** : pas de bouton d'enregistrement pour l'onglet. Désactiver un compte, changer
son rôle ou réinitialiser son mot de passe ferme ses sessions en cours.

**Les garde-fous.** On ne peut ni désactiver ni supprimer son propre compte, ni retirer le dernier
administrateur actif. Aucun mail n'est envoyé aux personnes : c'est à vous de leur transmettre leurs
accès.

**Ce que vous ne voyez pas** : le contenu de leurs réunions.

## Configurer

| Réglage | Où | Effet | Page |
|---|---|---|---|
| **Nouvel utilisateur**, **Rôle**, **Actif** | Utilisateurs | Qui entre, avec quels droits | [Gérer les comptes](gerer-les-comptes.md) |
| **Réinitialiser le mot de passe** | Utilisateurs, fiche du compte | Un mot de passe provisoire, à changer à la connexion | [Réinitialiser un mot de passe](reinitialiser-un-mot-de-passe.md) |
| **Supprimer le compte** | Utilisateurs, fiche du compte | Le compte et toutes ses données, définitivement | [Supprimer un compte](supprimer-un-compte.md) |
| **+ Nouveau groupe**, glisser un compte sur un groupe, **Retirer** | Groupes, et **Groupes** dans la fiche d'un compte | Qui est dans quel groupe | [Gérer les groupes](gerer-les-groupes.md) |
| **Minutes de réunion par mois**, **Générer des infographies** | Groupes, formulaire du groupe | Le quota et les droits de ses membres | [Gérer les groupes](gerer-les-groupes.md) |

## Exemples de configuration

**Une organisation sous Google Workspace.** Le domaine autorisé suffit : chacun entre par **Continuer avec
Google**, son compte se crée. Vous ne créez à la main que les comptes de prestataires, avec mot de passe.

**Un départ.** Le jour du départ, l'interrupteur **Actif** coupé : ses sessions tombent. Après récupération
de ce qui doit l'être, suppression du compte.

**Deux administrateurs.** Toujours au moins deux comptes **Administrateur**, dont un à mot de passe :
un recours si l'un est absent ou si Google et Microsoft sont indisponibles.

## Vérifier que tout fonctionne

Connectez-vous avec un compte de test créé ici : la fenêtre **Choisissez votre mot de passe** s'ouvre à
la première connexion ; le compte apparaît ensuite avec une date de **Dernière connexion**.

## Voir aussi

- [La connexion](../connexion/index.md) — les modes de connexion et les domaines autorisés
- [Les statistiques](../statistiques/index.md) — l'activité des comptes
