---
title: Autoriser myBrief dans Microsoft Entra ID
description: L'inscription d'application, les autorisations Microsoft Graph et le consentement exacts à accorder dans Entra ID pour Continuer avec Microsoft, l'envoi par Outlook et le dépôt dans OneDrive et SharePoint.
sidebar:
  order: 6
---

Tout ce que myBrief demande dans Microsoft Entra ID — l'annuaire de votre Microsoft 365 : une
inscription d'application, ses autorisations exactes, et le consentement. À faire avec la personne qui
administre votre annuaire. Votre service informatique crée l'inscription et transmet ses identifiants à
MyAlfred, qui les pose au déploiement ; la carte de myBrief est décrite dans
[Activer Microsoft Entra ID](activer-microsoft-entra-id.md).

## En un coup d'œil

| Fonction de myBrief | Autorisations Microsoft Graph, toutes déléguées |
|---|---|
| **Continuer avec Microsoft**, et le **SSO historique** s'il tourne encore | `openid`, `profile`, `email` |
| **Compte relié Microsoft** : envoyer les comptes rendus depuis Outlook, les déposer dans OneDrive et dans SharePoint | `openid`, `email`, `offline_access`, `Mail.Send`, `Files.ReadWrite`, `Sites.ReadWrite.All` |

Une seule inscription sert à tout, avec le **consentement administrateur**. Aucune autorisation
d'application : myBrief n'agit jamais sans utilisateur. Et il ne lit jamais les mails : ni `Mail.Read`,
ni `Mail.ReadWrite`.

`Sites.ReadWrite.All` est la seule que vous pouvez écarter, en désactivant **Proposer les
bibliothèques SharePoint** dans myBrief — voir [Le consentement](#le-consentement).

## Avant de commencer

| Pour… | Rôle Entra, au minimum |
|---|---|
| Créer l'inscription | **Développeur d'applications** (*Application Developer*) — aucun rôle si votre annuaire laisse les utilisateurs inscrire des applications |
| Accorder le consentement administrateur | **Administrateur d'application cloud** (*Cloud Application Administrator*) ou **Administrateur d'application** |

L'adresse de retour de myBrief : son adresse, suivie de `/oauth2/callback` —
`https://mybrief.exemple.fr/oauth2/callback` pour une installation sur *mybrief.exemple.fr*. Une fois
myBrief installé, la carte **Connexion avec Microsoft Entra ID** l'affiche.

## Inscrire myBrief

1. Dans le centre d'administration Microsoft Entra, **Entra ID → Inscriptions d'applications →
   Nouvelle inscription** (*App registrations → New registration*).
2. Nom : *myBrief*. **Types de comptes pris en charge** : **locataire unique** — myBrief ne connaît que
   votre annuaire.
3. **URI de redirection** : plateforme **Web** — pas « Application monopage (SPA) » —, avec l'adresse
   de retour ci-dessus.
4. **Certificats & secrets → Nouveau secret client** : copiez sa **valeur**, pas son ID, et notez sa
   date d'expiration.
5. **Autorisations d'API → Ajouter une autorisation → Microsoft Graph → Autorisations déléguées**
   (*API permissions → Delegated permissions*) : celles du tableau ci-dessous.
6. **Accorder le consentement administrateur pour** *votre organisation* (*Grant admin consent*) :
   chaque ligne passe à « Accordé ».
7. Transmettez à MyAlfred, par un canal sûr, l'**ID d'application (client)**, l'**ID de l'annuaire
   (locataire)** — tous deux sur la **Vue d'ensemble** — et la valeur du secret.

| Autorisation déléguée | Ce que Microsoft permet | Ce que myBrief en fait |
|---|---|---|
| `openid`, `profile`, `email` | Identifier la personne | La connecter, et lire son adresse |
| `offline_access` | Garder l'accès entre deux connexions | Envoyer et déposer sans redemander l'accord |
| `Mail.Send` | Envoyer des mails au nom de la personne | Envoyer ses comptes rendus à la liste qu'elle a réglée — sans jamais lire sa boîte |
| `Files.ReadWrite` | Lire et écrire tout son OneDrive | Parcourir ses dossiers, et y déposer les documents |
| `Sites.ReadWrite.All` | Lire et écrire dans tous les sites SharePoint auxquels elle a accès | Lister les bibliothèques des sites qu'elle suit, et déposer dans celle qu'elle choisit. **Écartable** — voir « Le consentement » |

## Le consentement

**Accordez le consentement administrateur** — étape 6. C'est la configuration qui marche quels que
soient les réglages de votre annuaire, y compris quand il interdit aux utilisateurs de consentir, ou
quand l'application exige une affectation.

**Sans lui, la liaison est refusée à tous** avec le réglage par défaut de Microsoft, **Laisser
Microsoft gérer vos paramètres de consentement** : il ne laisse chacun accepter que les autorisations
que vous avez classées « faible impact », et aucune ne l'est tant que vous n'en classez pas. Chacun
voit alors « Approbation de l'administrateur requise ».

**L'omettre de l'inscription ne suffit pas.** myBrief demande ce qu'il demande, et Microsoft refuse
la liaison **entière** si une seule autorisation manque — OneDrive compris, même pour qui ne voulait
que lui.

**Si votre annuaire refuse `Sites.ReadWrite.All`**, ne la retirez pas de l'inscription : désactivez
**Proposer les bibliothèques SharePoint** dans **Administration → Actions**, carte **Compte relié**.
myBrief cesse alors de la demander, et vos utilisateurs relient leur compte pour Outlook et OneDrive —
voir [Choisir le compte relié](../actions/choisir-le-compte-relie.md). C'est la seule des trois qui
s'écarte ainsi.

Les comptes reliés **avant** l'ajout de `Sites.ReadWrite.All` n'en disposent pas non plus : ils
déposent dans OneDrive, pas dans SharePoint, jusqu'à ce qu'ils relient leur compte de nouveau.

**Continuer avec Microsoft** seul ne demande rien de plus : le consentement administrateur, ou celui de
chacun si votre annuaire l'autorise.

## Cas particuliers

| Situation | Ce qu'il faut savoir |
|---|---|
| **Réserver myBrief à certaines personnes** | **Applications d'entreprise → myBrief → Propriétés → Affectation requise ? : Oui**, puis **Utilisateurs et groupes**. Le consentement administrateur devient alors indispensable. |
| **Accès conditionnel** | Vos stratégies s'appliquent à la connexion et à la liaison. myBrief envoie et dépose ensuite **depuis son serveur** : une stratégie par emplacement doit connaître l'adresse de sortie du serveur ; une fréquence de connexion imposée oblige chacun à relier son compte de nouveau à l'échéance. |
| **Licences** | L'envoi exige une boîte Exchange Online, le dépôt un OneDrive : des licences qui les incluent. |
| **Bibliothèques SharePoint** | myBrief ne propose que celles des sites que la personne **suit** dans SharePoint. |
| **Invités de votre annuaire** | Ils se connectent, mais n'envoient ni ne déposent par un compte relié : leur boîte et leur OneDrive dépendent de leur propre organisation. |
| **Comptes Microsoft personnels** | Refusés : l'inscription n'accepte que votre annuaire. |
| **Le secret expire** | À l'échéance, la connexion et les envois s'arrêtent : créez un secret, collez sa valeur dans **Administration → Authentification**, carte **Connexion avec Microsoft Entra ID**, puis supprimez l'ancien. |
| **Couper l'accès de myBrief** | Pour tout l'annuaire : **Applications d'entreprise → myBrief → Propriétés → Activé pour que les utilisateurs se connectent ? : Non**. **Déconnecter**, dans myBrief, oublie le compte relié sans retirer l'accord chez Microsoft : chacun le retire depuis son compte Microsoft. |

## Vérifier

1. **Administration → Authentification**, carte **Page de connexion** : **Tester** sur **Continuer avec
   Microsoft**.
2. Avec un compte **sans rôle d'administrateur** : **Ma configuration → Connexion → Connecter mon
   compte Microsoft**, puis **Tester l'envoi** et **Tester le dépôt**.
3. Dans **Entreposer**, la fenêtre de choix du dossier propose les bibliothèques des sites suivis.

## En cas de problème

| Ce qui arrive | Cause | Quoi faire |
|---|---|---|
| Microsoft affiche « Approbation de l'administrateur requise » (**AADSTS90094**, **AADSTS65001**) | Consentement administrateur absent | L'accorder — étape 6. Si votre annuaire refuse `Sites.ReadWrite.All`, désactivez **Proposer les bibliothèques SharePoint** — voir « Le consentement » |
| **AADSTS50105** | Affectation requise, personne non affectée | L'ajouter dans **Utilisateurs et groupes** |
| **AADSTS50011** | Adresse de retour non déclarée | L'ajouter, plateforme **Web** |
| **AADSTS9002326** | Adresse déclarée en « Application monopage (SPA) » | La retirer de SPA et l'ajouter sous **Web** |
| **AADSTS7000215**, **AADSTS7000222** | Secret mal copié, ou expiré | Coller la **valeur** du secret, ou en créer un |
| « Le fournisseur n'a pas accordé d'autorisation durable… » | `offline_access` absente de l'accord | La déclarer, consentir, puis relier le compte de nouveau |
| « Vos bibliothèques SharePoint n'apparaissent pas ici… » | Compte relié avant l'ajout de `Sites.ReadWrite.All` | **Reconnecter mon compte** |
| Aucune bibliothèque SharePoint, et aucun message | **Proposer les bibliothèques SharePoint** est désactivé | Le réactiver, une fois `Sites.ReadWrite.All` consentie |
| « Dépôt non autorisé » | Compte relié sans `Files.ReadWrite` | **Reconnecter mon compte** |
| « Votre compte ne publie aucune adresse email exploitable. » | Profil Entra sans adresse email, et nom d'utilisateur principal qui n'a pas la forme d'une adresse | Compléter le profil dans l'annuaire |
