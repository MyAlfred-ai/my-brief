---
title: Installer myBrief sur ses appareils
description: Mettre myBrief sur son ordinateur, son téléphone et dans Chrome — ce qu'il faut installer, et ce qui n'a rien à installer.
sidebar:
  order: 98
---

myBrief s'utilise dans un navigateur : sur un ordinateur, l'adresse de votre organisation suffit. Il
s'installe sur les appareils où vous vous en servez souvent — le téléphone que vous posez sur la
table, le Chrome dans lequel vous travaillez.

## Sur un ordinateur

Rien à installer. Ouvrez l'adresse de myBrief de votre organisation et mettez-la en favori.

Pour enregistrer une réunion en visio, il faut **Chrome ou Edge** : eux seuls savent partager le son
d'un onglet. Voir
[Enregistrer une réunion en visio](enregistrement/enregistrer-une-reunion-en-visio.md).

## Sur un téléphone ou une tablette

| Appareil | Comment |
|---|---|
| **iPhone, iPad** | Ouvrez myBrief dans Safari, puis **Partager → Sur l'écran d'accueil**. Il n'y a pas d'application à installer. |
| **Android, dans le navigateur** | Ouvrez myBrief dans Chrome, puis **Ajouter à l'écran d'accueil**. |
| **Android, application** | Elle n'est pas proposée pour toutes les installations : votre administrateur vous dit si elle l'est pour la vôtre, et où la télécharger. |

Dans l'application Android, **Se connecter** ouvre l'écran de connexion dans le navigateur du
téléphone, puis vous ramène dans l'application. La connexion tient trente jours.

L'application affiche toujours la dernière version de myBrief : rien à mettre à jour. Si un écran
paraît ancien, fermez l'application et relancez-la.

**L'application Android apporte deux choses que le navigateur n'a pas** : l'enregistrement continue
écran verrouillé, et il fonctionne hors ligne. Ce qui change ensuite à l'usage :
[Enregistrer sur son téléphone](enregistrement/enregistrer-sur-son-telephone.md).

## L'extension Chrome

L'extension met une icône myBrief dans la barre de Chrome : un clic ouvre myBrief, un autre démarre
une réunion, d'où que vous soyez sur le web. Elle n'existe que sur un ordinateur, dans Chrome ou un
navigateur qui en dérive — Edge, Brave. Elle n'est pas encore sur le Chrome Web Store : Chrome la
charge depuis un dossier.

1. Dans myBrief, ouvrez **Ma configuration → Extension Chrome**, puis cliquez **Télécharger
   l'extension (.zip)**.
2. Décompressez le fichier : un dossier « mybrief-extension » apparaît. **Gardez-le** : Chrome lit
   l'extension dedans, le supprimer la désinstalle.
3. Ouvrez l'adresse `chrome://extensions`, puis activez **Mode développeur**, en haut à droite.
4. Cliquez **Charger l'extension non empaquetée** et choisissez le dossier décompressé.
5. Épinglez l'icône : la pièce de puzzle à droite de la barre d'adresse, puis la punaise à côté de
   myBrief.

### Lier l'extension à votre myBrief

L'extension doit savoir où est votre myBrief. Elle le lit dans l'onglet ouvert : rien à saisir.

1. Restez sur l'onglet myBrief.
2. Cliquez l'icône myBrief dans la barre de Chrome.
3. Cliquez **Utiliser ce site comme mon MyBrief**, puis acceptez la demande d'accès de Chrome : c'est
   ce qui permet à l'extension de retrouver votre onglet au lieu d'en ouvrir un second.

Dans **Ma configuration → Extension Chrome**, la ligne d'état passe au vert : « Extension installée et
liée à ce site ». Ce que l'extension sait faire ensuite :
[Démarrer une réunion depuis l'extension Chrome](enregistrement/demarrer-depuis-l-extension-chrome.md).

## Résultat

| Vous avez installé… | Ce que vous y gagnez |
|---|---|
| **L'écran d'accueil**, sur téléphone ou tablette | myBrief s'ouvre comme une application, sans barre d'adresse |
| **L'application Android** | L'enregistrement continue écran verrouillé, et hors ligne |
| **L'extension Chrome** | Une réunion démarre d'un clic ou au clavier, depuis n'importe quel onglet |

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| **Sur l'écran d'accueil** est absent du menu Partager, sur iPhone | Vous n'êtes pas dans Safari : ni Chrome ni Firefox ne posent d'icône sur iOS. |
| L'application Android est introuvable | Elle n'est pas proposée pour toutes les installations : demandez à l'administrateur de votre organisation. |
| « Extension non détectée dans ce navigateur » | L'extension n'est pas installée, ou pas liée : refaites les étapes, en restant sur l'onglet myBrief pour la liaison. |
| L'extension a disparu de Chrome | Le dossier décompressé a été déplacé ou supprimé : rechargez-la depuis `chrome://extensions`. |
