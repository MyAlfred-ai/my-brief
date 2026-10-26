---
title: Corriger automatiquement la transcription
description: Remplacer d'office, dans les réunions de tous les comptes, les noms propres et les sigles que la transcription écrit mal à chaque fois.
sidebar:
  order: 2
---

**Administration → Configuration**, carte **Corrections automatiques de la transcription**, juste sous
le vocabulaire de l'organisation.

## Avant de commencer

Ces corrections sont **valables pour toutes les réunions, de tous les comptes**. Soyez modéré :
réservez-les aux noms propres et aux sigles que la transcription écorche à chaque fois. Un mot courant
serait remplacé partout — même là où il était juste.

## Étapes

1. Cliquez **Ajouter une correction**.
2. Dans **La transcription écrit…**, tapez le mot tel que la transcription l'écrit : « Klobex ».
   Plusieurs écritures fautives ? Séparez-les par des virgules : « Klobex, Clobex ».
3. Dans **Écrire à la place**, tapez le mot juste : « Globex ».
4. Dans **Essayer**, tapez une phrase : le **Résultat** s'affiche aussitôt, mots remplacés surlignés —
   avant même d'enregistrer.
5. Cliquez **Enregistrer**, en bas de la page.

Le badge de la carte passe à **1 correction**, **2 corrections**…, avec le nom de la personne qui les a
enregistrées. Pour en retirer une, cliquez la corbeille au bout de sa ligne, puis **Enregistrer**.

## Comment le remplacement se fait

| Règle | Exemple |
|---|---|
| **Mots entiers seulement** | « Paul » ne touche pas « Paulette » |
| **Majuscules et accents ne comptent pas** | « klobex », « KLOBEX » et « Klobèx » deviennent « Globex » |
| **Une espace accepte aussi un trait d'union**, une apostrophe droite ou courbe | « la dévé » corrige aussi « la-dévé » |
| **En début de phrase, le mot juste prend la majuscule** | « la dévé » → « l'ADV » donne « L'ADV valide. » ; « iPhone » reste « iPhone » |
| **Pas de correction en chaîne** ; ce qui est déjà juste ne bouge pas | avec « Alfred » → « Alfred Dupont », « Alfred Dupont » prononcé en entier n'est pas doublé |

## Ce qu'il faut savoir

- **La correction a lieu quand la phrase se termine.** La ligne en cours d'écriture, en italique, montre
  encore le mot tel qu'entendu ; dès qu'elle devient définitive, le mot juste prend sa place et
  s'éclaire un instant.
- Elles s'appliquent aux transcriptions qui suivent l'enregistrement : en direct, à l'import d'un
  fichier audio et à la reprise d'un passage hors ligne. **Les réunions passées ne changent pas.**
- Vous les voyez à l'œuvre dès l'enregistrement ; les autres comptes, au prochain chargement de
  myBrief.
- Le compte rendu est rédigé à partir de la transcription corrigée.
- **50 corrections au plus**, dix écritures fautives par correction.
- Ce n'est pas le vocabulaire de l'organisation : le vocabulaire aide l'IA à rédiger juste le compte
  rendu, les corrections réécrivent la transcription elle-même. Les deux se complètent — voir
  [Renseigner le vocabulaire de l'organisation](renseigner-le-vocabulaire-de-l-organisation.md).

## Les messages sous une correction

| Message | Ce qu'il veut dire |
|---|---|
| « … est un mot courant : il serait remplacé dans toutes les phrases, même là où il est juste. » | Un avertissement : l'enregistrement reste possible, assurez-vous que c'est voulu. |
| « … est très court : un vrai mot pourrait s'écrire pareil, accents et majuscules confondus. » | Un avertissement : « ca » → « CA » changerait aussi chaque « ça ». |
| « … apparaît deux fois dans la liste. » | Le même mot est déjà corrigé plus haut : retirez l'un des deux. |
| « … est déjà écrit ainsi : rien à corriger. » | Les deux champs sont identiques. |
| « Indiquez ce que la transcription écrit. » / « Indiquez ce qu'il faut écrire à la place. » | Un champ est vide : **Enregistrer** reste grisé tant qu'il l'est. |
