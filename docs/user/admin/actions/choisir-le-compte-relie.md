---
title: Choisir le compte relié
description: Choisir Google ou Microsoft comme fournisseur des comptes que vos utilisateurs relient, décider si les bibliothèques SharePoint sont proposées, et fixer le dossier de dépôt par défaut.
sidebar:
  order: 2
---

Le **compte relié** est le compte Google ou Microsoft que chaque utilisateur autorise, pour que myBrief
envoie ses mails depuis sa boîte et dépose ses documents dans son Drive. Vous choisissez le
fournisseur ; chacun relie ensuite son propre compte.

## Avant de commencer

Les identifiants du fournisseur doivent être enregistrés dans **Administration → Authentification** —
voir [Activer la connexion Google](../connexion/activer-la-connexion-google.md) ou
[Activer Microsoft Entra ID](../connexion/activer-microsoft-entra-id.md). La connexion par ce fournisseur
n'a pas besoin d'être activée : seuls ses identifiants comptent.

| Fournisseur | À prévoir chez lui |
|---|---|
| **Google** | Gmail API et Google Drive API activées ; la seconde URI de redirection, « envoi par mail », déclarée — voir [Autoriser myBrief dans Google Workspace](../connexion/autoriser-mybrief-dans-google-workspace.md) |
| **Microsoft** | Les permissions déléguées Microsoft Graph **Mail.Send** et **Files.ReadWrite**, plus **Sites.ReadWrite.All** si vous proposez les bibliothèques SharePoint — voir [Autoriser myBrief dans Microsoft Entra ID](../connexion/autoriser-mybrief-dans-microsoft-entra-id.md) |

## Étapes

1. **Administration → Actions**, carte **Compte relié** : choisissez le **Fournisseur** — **Google
   (Gmail + Drive)** ou **Microsoft (Outlook + OneDrive)**.
2. Avec Microsoft, décidez de **Proposer les bibliothèques SharePoint** — voir ci-dessous.
3. Carte **Entreposer** : le **Dossier cible**, par exemple *myBrief/Comptes-rendus*. Vide, les
   documents vont dans un dossier « myBrief ».
4. Cliquez **Enregistrer**.

## Proposer les bibliothèques SharePoint

Ce réglage n'apparaît qu'avec **Microsoft**, et il gouverne une seule chose : la permission
**Sites.ReadWrite.All** est-elle demandée quand quelqu'un relie son compte ?

| | Activé (par défaut) | Désactivé |
|---|---|---|
| Ce que la liaison demande | **Mail.Send**, **Files.ReadWrite**, **Sites.ReadWrite.All** | **Mail.Send**, **Files.ReadWrite** |
| Où l'on peut déposer | OneDrive **et** bibliothèques des sites suivis | OneDrive seulement |
| Ce que votre annuaire doit accorder | Les trois, **Sites.ReadWrite.All** comprise | Les deux premières |

**Désactivez-le si votre annuaire refuse Sites.ReadWrite.All.** Microsoft ne consent pas à moitié :
tant que myBrief demande cette permission et que l'annuaire ne l'accorde pas, **aucun compte ne se
relie** — pas même pour le seul OneDrive. C'est la seule permission que ce réglage retire ; le
consentement administrateur reste requis si votre annuaire l'exige pour les deux autres.

**Les comptes déjà reliés ne changent pas.** Ils gardent les permissions accordées le jour de la
liaison, bibliothèques comprises, jusqu'à ce que leur titulaire utilise **Reconnecter mon compte**.
Un réglage désactivé puis réactivé n'a donc d'effet que sur les liaisons suivantes.

## Ce qu'il faut savoir

- **Le dossier cible est dans l'espace personnel de chaque utilisateur** — son Drive ou son OneDrive —,
  jamais dans un espace partagé. Chacun peut choisir son propre dossier, un Drive partagé ou une
  bibliothèque SharePoint, dans **Ma configuration → Entreposer** ou par tag.
- **Google** : myBrief ne voit que les dossiers qu'il a créés, ou que l'utilisateur lui désigne. Un
  dossier déjà existant du même nom peut donc se retrouver en double.
- **Changer de fournisseur** oblige les utilisateurs à relier leur compte chez le nouveau fournisseur.
- **Aucun** masque le bouton **Entreposer**, mais n'empêche pas de relier un compte Google pour l'envoi
  des mails si Google est configuré.

## Vérifier

Relier votre propre compte dans **Ma configuration → Connexion**, puis **Tester le dépôt** dans
l'onglet **Actions** — voir [Tester la configuration](tester-la-configuration.md).
