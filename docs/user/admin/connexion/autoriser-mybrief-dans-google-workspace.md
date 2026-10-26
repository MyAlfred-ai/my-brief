---
title: Autoriser myBrief dans Google Workspace
description: Le projet Google Cloud, les API, les autorisations exactes et les réglages de la console d'administration Google pour Continuer avec Google, l'envoi par Gmail et le dépôt dans Google Drive.
sidebar:
  order: 5
---

Tout ce que myBrief demande chez Google. Deux consoles entrent en jeu : la **console Google Cloud**, où
l'on déclare myBrief, et la **console d'administration Google**, où l'on décide ce que les applications
peuvent faire dans votre organisation. À faire avec la personne qui administre votre Google Workspace.

## En un coup d'œil

| Fonction de myBrief | API à activer | Autorisations (scopes) |
|---|---|---|
| **Continuer avec Google** | Aucune | `openid`, `email`, `profile` |
| **Compte relié Google** : envoyer les comptes rendus par Gmail, les déposer dans Google Drive | Gmail API, Google Drive API | `openid`, `email`, `gmail.send`, `drive.file`, `drive.readonly` |

Un seul identifiant client sert aux deux, avec **deux URI de redirection**. Hors `openid`, `email` et
`profile`, un scope s'écrit en entier : `https://www.googleapis.com/auth/gmail.send`. myBrief ne
demande ni la lecture des mails, ni l'écriture dans le reste du Drive, ni délégation au niveau du
domaine.

## Avant de commencer

- Dans la console Google Cloud : le rôle **Propriétaire** — ou **Éditeur** — d'un projet **rattaché à
  l'organisation** de votre Google Workspace. C'est la condition du type **Interne**.
- Dans la console d'administration Google : un **super-administrateur**.
- Les deux URI, dans **Administration → Authentification**, carte **Connexion avec Google** : **URI de
  redirection autorisée** et **URI de redirection (envoi par mail)**.

## Déclarer myBrief dans Google Cloud

1. Choisissez ou créez le projet, dans votre organisation.
2. **API et services → Bibliothèque** : activez **Gmail API** et **Google Drive API**. Sans la seconde,
   l'envoi marche mais le dépôt échoue.
3. **Google Auth Platform → Audience** : type d'utilisateur **Interne** — voir
   [Interne ou externe](#interne-ou-externe).
4. **Google Auth Platform → Accès aux données → Ajouter ou supprimer des scopes** : ceux du tableau.
   Facultatif en interne, indispensable en externe.
5. **Google Auth Platform → Clients → Créer un client** : type **Application Web**, et dans **URI de
   redirection autorisés**, les **deux** URI de myBrief, telles quelles.
6. Recopiez l'**ID client** et le **secret client** dans la carte **Connexion avec Google** — voir
   [Activer la connexion Google](activer-la-connexion-google.md).

| Scope | Classement Google | Ce que Google permet | Ce que myBrief en fait |
|---|---|---|---|
| `openid`, `email`, `profile` | Non sensible | Identifier la personne | La connecter |
| `gmail.send` | Sensible | Envoyer des mails au nom de la personne | Envoyer ses comptes rendus à la liste qu'elle a réglée — sans jamais lire sa boîte |
| `drive.file` | Non sensible | Gérer les fichiers créés par l'application | Créer ses dossiers et y déposer les documents |
| `drive.readonly` | Restreint | Lire tous les fichiers du Drive, Drive partagés compris | Lister les dossiers et les Drive partagés, pour choisir où déposer — aucun contenu lu |

L'écran de Google annonce la lecture de tout le Drive : `drive.readonly` est le seul droit qui
permette d'énumérer les Drive partagés. Une personne qui décoche cette case garde l'envoi et le dépôt,
mais choisit son dossier en tapant son chemin, sans la fenêtre de navigation.

## Interne ou externe

| Audience | Qui peut relier son compte | Ce que Google exige |
|---|---|---|
| **Interne** — recommandé | Les comptes de votre organisation Google Workspace | Rien : aucun examen, même pour le scope restreint |
| **Externe**, état **Test** | Les **utilisateurs test** déclarés, 100 au plus | Rien, mais l'accès expire au bout de **7 jours** : chacun doit relier son compte de nouveau chaque semaine |
| **Externe**, **En production** | Tout compte Google | La **validation** de l'application par Google pour `gmail.send`, et une **évaluation de sécurité** annuelle pour `drive.readonly`. Sans elles, un écran « Google n'a pas validé cette application » et 100 utilisateurs au plus |

L'externe ne se justifie que si des comptes hors de votre organisation doivent relier leur compte.
**Continuer avec Google** seul n'est touché ni par l'examen, ni par l'expiration.

## Dans la console d'administration Google

Rien à faire si votre organisation laisse ses utilisateurs se servir des applications tierces : c'est
le réglage par défaut. Il faut agir dans trois cas :

| Dans votre console | Conséquence | Quoi faire |
|---|---|---|
| **Applications → Google Workspace** : Gmail, ou Drive et Docs, désactivé pour certains utilisateurs | L'envoi ou le dépôt ne marche pas pour eux | Activer le service, si c'est voulu |
| **Sécurité → Contrôle des accès et des données → Commandes des API → Gérer les services Google** : Gmail, ou Drive et Docs, en **Restreint** | Google refuse la liaison, sauf aux applications approuvées | Approuver myBrief, ci-dessous |
| **Commandes des API → Paramètres → Applications tierces non configurées** : accès interdit, ou limité aux informations de « Se connecter avec Google » | Google refuse la liaison du compte | Configurer myBrief, ci-dessous |

Pour approuver myBrief : **Commandes des API → Gérer l'accès des applications tierces → Configurer une
nouvelle application**, cherchez l'**ID client** de myBrief, choisissez les unités organisationnelles,
puis l'accès :

- **Approuvée** : myBrief accède à tous les services, restreints compris ;
- **Données Google spécifiques** : myBrief n'accède qu'aux scopes que vous cochez — `gmail.send`,
  `drive.file` et `drive.readonly` ;
- **Limitée** : les seuls services non restreints — elle suffit quand aucun service ne l'est.

Autre voie : **Commandes des API → Paramètres → Applications internes → Approuver les applications
internes**, qui approuve d'un coup les applications des projets de votre organisation, myBrief compris
si son projet y est rattaché.

Passer Gmail ou Drive en **Restreint** coupe aussitôt les comptes reliés des applications qui ne sont
pas approuvées : approuvez myBrief d'abord.

## Cas particuliers

| Situation | Ce qu'il faut savoir |
|---|---|
| **Changement de mot de passe** | Google coupe l'envoi par Gmail : myBrief le découvre au premier envoi, supprime la liaison, et la personne relie son compte de nouveau. |
| **Un compte relié différent du compte de connexion** | Possible : chacun relie le compte Google de son choix, dans les limites de l'audience. |
| **Le SSO historique**, s'il tourne encore sur Google | Il s'appuie sur l'identifiant fourni au déploiement, avec les seuls droits d'identité : `openid`, `email`, `profile`. |
| **Couper l'accès de myBrief** | Pour toute l'organisation : **Commandes des API**, myBrief en **Bloquée**. Pour une personne : **Déconnecter**, dans myBrief, retire l'accès chez Google. |

## Vérifier

1. **Administration → Authentification**, carte **Page de connexion** : **Tester** sur **Continuer avec
   Google**.
2. Avec un compte de test : **Ma configuration → Connexion → Connecter mon compte Google**, puis
   **Tester l'envoi** et **Tester le dépôt**.
3. Dans **Entreposer**, la fenêtre de choix du dossier propose **Mon Drive** et les Drive partagés.

## En cas de problème

| Ce qui arrive | Cause | Quoi faire |
|---|---|---|
| Google affiche **redirect_uri_mismatch** | Une des deux URI manque, ou diffère d'un caractère | Les recopier depuis la carte **Connexion avec Google** |
| Google affiche « Accès bloqué », erreur **admin_policy_enforced** | Gmail ou Drive restreint, ou applications non configurées interdites | Approuver myBrief dans **Commandes des API** |
| Google affiche l'erreur **org_internal** | Audience **Interne**, compte hors de l'organisation | Relier un compte de l'organisation, ou passer en externe |
| Google affiche l'erreur **access_denied**, « n'a pas terminé la procédure de validation » | Externe en test, compte absent des utilisateurs test | L'ajouter aux **utilisateurs test** |
| L'envoi marche, le dépôt échoue | Google Drive API non activée | L'activer sur le projet, puis patienter quelques minutes |
| Relier un compte échoue alors que la connexion marche | Seconde URI, Gmail API, ou console d'administration | Reprendre les étapes 2 et 5, puis les commandes des API |
| Chacun doit relier son compte chaque semaine | Externe en test : accès de 7 jours | Passer en **Interne** |
| « Autorisation annulée : le compte n'a pas été connecté. » | Écran de Google refusé ou fermé | Recommencer, en acceptant toutes les autorisations |
