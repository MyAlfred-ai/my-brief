---
title: Enregistrer une visio dans Firefox ou Safari
description: Installer une fois un périphérique audio virtuel, pour que myBrief entende vos interlocuteurs et le son des applications là où le navigateur ne partage pas le son.
sidebar:
  order: 3
---

Firefox et Safari ne savent pas partager le son d'un onglet ou de l'écran : leur fenêtre de partage
ne transporte que l'image. Pour que myBrief entende quand même vos interlocuteurs, ou le son d'une
application comme Teams, Zoom ou un lecteur vidéo, on passe par un **périphérique audio virtuel** : un
petit logiciel qui présente le son de l'ordinateur comme s'il était un micro. Il s'installe une fois
par ordinateur ; myBrief l'ouvre ensuite à chaque **Réunion avec visio**, en plus de votre micro.

**Le plus simple reste Chrome ou Edge**, qui partagent le son sans rien installer : voir
[Enregistrer une réunion en visio](enregistrer-une-reunion-en-visio.md).

## Avant de commencer

- **Un ordinateur** : Mac, Windows ou Linux. Sur iPhone, sur iPad et dans l'application mobile,
  myBrief n'enregistre que le micro.
- **Les droits d'administrateur** de l'ordinateur, pour installer le périphérique. Sur un poste géré
  par votre service informatique, demandez-lui de le faire.
- **Un casque**, de préférence, comme pour toute visio : avec des haut-parleurs, la voix de vos
  interlocuteurs revient aussi dans votre micro.

## 1. Installer le périphérique audio virtuel

Le périphérique reçoit le son de l'ordinateur et le transmet à myBrief. Le réglage consiste à y
envoyer ce son **tout en continuant à l'entendre** dans votre casque.

### Sur Mac : BlackHole

1. Installez **BlackHole 2ch**, gratuit, de l'éditeur Existential Audio.
2. Ouvrez **Configuration audio et MIDI**, dans **Applications → Utilitaires**.
3. En bas à gauche, cliquez **+**, puis **Créer un périphérique à sorties multiples**.
4. À droite, cochez votre casque ou vos haut-parleurs **et** **BlackHole 2ch**. Choisissez votre
   casque comme **Périphérique principal**, et cochez **Correction de la dérive** en face de
   **BlackHole 2ch**.
5. Dans **Réglages Système → Son → Sortie**, choisissez ce **Périphérique à sorties multiples**.

Le son de l'ordinateur part alors à la fois dans votre casque et dans BlackHole 2ch. Les touches de
volume du Mac n'agissent pas sur ce périphérique : réglez le volume dans l'application de visio ou
dans le lecteur. Après la réunion, vous pouvez revenir à votre sortie habituelle au même endroit.

### Sur Windows : VB-CABLE

1. Installez **VB-CABLE**, gratuit, de l'éditeur VB-Audio, puis redémarrez l'ordinateur. Deux
   périphériques apparaissent : **CABLE Input**, une sortie, et **CABLE Output**, une entrée.
2. Dans **Paramètres → Système → Son**, choisissez **CABLE Input** comme sortie.
3. Pour continuer à entendre : dans **Paramètres → Système → Son → Plus de paramètres de son**,
   onglet **Enregistrement**, ouvrez **CABLE Output**. Dans l'onglet **Écouter**, cochez **Écouter ce
   périphérique**, choisissez votre casque dans **Lecture sur ce périphérique**, puis **OK**.

**Sans rien installer**, certains ordinateurs proposent **Mixage stéréo** : dans le même onglet
**Enregistrement**, faites un clic droit dans la liste, **Afficher les périphériques désactivés**,
puis un clic droit sur **Mixage stéréo** et **Activer**. Il ne capte que le son qui sort par la carte
son de l'ordinateur, pas celui d'un casque USB ou Bluetooth.

### Sur Linux

Rien à installer : le système propose déjà, pour chaque sortie audio, une entrée **Monitor of …** qui
en reprend le son.

## 2. Le choisir dans myBrief

1. Ouvrez myBrief dans Firefox ou Safari, puis **Ma configuration → Réglages audio**. Si la fenêtre
   **Navigateur partiellement compatible** s'affiche, son bouton **Régler le son de l'ordinateur** y
   mène directement.
2. Si les noms des périphériques n'apparaissent pas, cliquez **Autoriser le microphone** et acceptez.
3. Dans la carte **Son de l'ordinateur**, choisissez le **Périphérique** : **BlackHole 2ch**,
   **CABLE Output (VB-Audio Virtual Cable)**, **Mixage stéréo** ou **Monitor of …**. « Enregistré »
   s'affiche un instant.
4. Lancez une vidéo ou une musique sur l'ordinateur, puis cliquez **Tester le son**. La jauge doit
   bouger, puis le verdict s'affiche : « Son reçu : myBrief entendra la visio et les applications. »

## 3. Enregistrer

1. Ouvrez votre réunion, dans l'application Teams ou Zoom ou dans un onglet, et laissez-la tourner.
2. Dans myBrief, cliquez **Démarrer**, puis **Réunion avec visio**. La fenêtre nomme le périphérique
   qui va s'ouvrir : « En visio : myBrief enregistre aussi le son de l'ordinateur, par
   « BlackHole 2ch ». »
3. Si Firefox demande l'accès à ce périphérique, autorisez-le : c'est une seconde demande, distincte
   de celle du micro.

Il n'y a pas de fenêtre de partage d'écran : rien à cocher, rien à choisir. **Réunion en présentiel**
n'ouvre que votre micro.

## Résultat

Comme dans Chrome : quand vos interlocuteurs parlent, leurs répliques arrivent dans la transcription
avec la pastille **Visio**, que vous pouvez renommer, voir
[Nommer les participants](../transcription/nommer-les-participants.md). La fenêtre **Navigateur
partiellement compatible** ne s'affiche plus dans ce navigateur.

## Ce qu'il faut savoir

- **Tout ce que joue l'ordinateur est enregistré** : la visio, mais aussi une vidéo dans un autre
  onglet ou le son d'une notification. Coupez ce qui ne concerne pas la réunion.
- **Le choix vaut pour ce navigateur, sur cet ordinateur** : il ne suit pas votre compte.
- **Votre micro n'est pas proposé** comme son de l'ordinateur : chaque mot serait transcrit deux fois.
- **L'annulation d'écho, la réduction de bruit et le réglage automatique du volume sont coupés** sur ce
  périphérique : ils effaceraient la visio ou la musique qu'il doit capter. Ils restent actifs sur votre
  micro.

## En cas de problème

| Ce qui arrive | Pourquoi, et quoi faire |
|---|---|
| **Tester le son** répond « Aucun son reçu. » | Le son de l'ordinateur ne passe pas par le périphérique. Sur Mac, la sortie doit être le **Périphérique à sorties multiples** ; sur Windows, **CABLE Input**. Vérifiez aussi qu'un son jouait pendant le test. |
| Vous n'entendez plus rien | Sur Mac, la sortie est **BlackHole 2ch** seul : choisissez le **Périphérique à sorties multiples**. Sur Windows, cochez **Écouter ce périphérique** sur **CABLE Output**. |
| « … est introuvable sur cet ordinateur » dans **Réglages audio** | Le périphérique a été désinstallé ou débranché : réinstallez-le, ou choisissez-en un autre. |
| « Son de l'ordinateur introuvable, capture micro uniquement » au démarrage | Même cause : la réunion continue avec votre micro seul. |
| « Son de l'ordinateur indisponible, capture micro uniquement » au démarrage | Le navigateur n'a pas pu ouvrir le périphérique : autorisez l'accès au micro pour myBrief, puis démarrez une nouvelle réunion. |
| « Le son de l'ordinateur est réglé sur le micro, capture micro uniquement » | Le même appareil est choisi comme micro et comme son de l'ordinateur : changez l'un des deux dans **Réglages audio**. |
| La carte **Son de l'ordinateur** n'apparaît pas | Vous êtes dans Chrome ou Edge, qui partagent le son eux-mêmes : suivez [Enregistrer une réunion en visio](enregistrer-une-reunion-en-visio.md). |
| Des petits mots, « oui », « d'accord », apparaissent deux fois | Vos haut-parleurs renvoient le son dans le micro : prenez un casque. |
