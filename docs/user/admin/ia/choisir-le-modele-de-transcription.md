---
title: Choisir le modèle de transcription
description: Choisir le modèle qui transcrit la parole en direct pendant l'enregistrement, en voyant ce qu'il coûte, et le tester avant de l'adopter.
sidebar:
  order: 3
---

**Administration → IA**, carte **Modèle de transcription**. Le modèle transcrit la parole en direct ; il
ne change ni les résumés ni la détection d'actions.

## Les modèles proposés

Chaque modèle affiche **son prix** : un niveau de **€** à **€€€€**, et le coût d'une heure de
transcription en euros, par exemple « 0,16 €/h ». À l'écran, les modèles sont rangés du moins cher au
plus cher.

**Lire les €.** Le moins cher des modèles proposés a un seul **€**, en vert. Chaque **€** de plus marque
un prix environ deux fois plus élevé ; le plus cher s'affiche en rouge. Deux modèles au même niveau
coûtent à peu près la même chose : leur coût en euros les départage.

| Modèle | Repère |
|---|---|
| **gpt-realtime-whisper** | Le défaut historique : mot à mot, éprouvé sur les longues réunions |
| **gpt-live-transcribe** | Conçu pour le direct : mot à mot, même famille que le défaut |
| **gpt-transcribe** | Le plus récent : mot à mot, texte final reponctué par segment |

**gpt-4o-transcribe**, **gpt-4o-mini-transcribe** et **whisper-1** ne sont plus proposés : OpenAI les
retire le 26 février 2027.

## Étapes

1. Dans **Modèle utilisé en direct**, choisissez le modèle. Celui qui tourne aujourd'hui porte la
   mention **En service**.
2. Lisez l'écart qui s'affiche sous la liste, par exemple « 0,74 € de moins par heure que le modèle en
   service. » : c'est ce que le changement fera gagner, ou coûter, à chaque heure transcrite.
3. Cliquez **Tester ce modèle** : le test ouvre une vraie session de transcription et révèle un modèle
   indisponible pour votre organisation. « Modèle opérationnel ».
4. Cliquez **Enregistrer**, en bas de l'onglet.

## Résultat

Le modèle s'applique aux enregistrements suivants. Une réunion en cours peut basculer en route, lors
d'une reconnexion.

## Ce qu'il faut savoir

- **Les prix** sont ceux de la carte **Dépenses d'IA estimées** : le tarif public d'OpenAI, converti en
  euros au dernier taux relevé. Leur date et le taux s'affichent sous la liste ; **Actualiser les
  tarifs dans Statistiques** mène à la carte, où un clic les relève en ligne. Voir
  [Estimer les dépenses d'IA](../statistiques/estimer-les-depenses-ia.md).
- **En visio**, le son de vos interlocuteurs est transcrit à part : une heure de visio coûte jusqu'à
  deux fois le prix affiché.
- **L'import d'un fichier audio** utilise toujours son propre modèle, **gpt-transcribe**, quel que soit
  ce réglage.
- **Un modèle retiré par OpenAI** et encore choisi est déjà remplacé par **gpt-transcribe**, qui
  transcrit de la même façon : moins cher que **gpt-4o-transcribe** et **whisper-1**, un peu plus que
  **gpt-4o-mini-transcribe**. La carte le dit, avec la date du retrait. **Garder gpt-transcribe** enregistre ce choix et retire le
  message ; vous pouvez aussi choisir un autre modèle, puis **Enregistrer**.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « OpenAI a refusé ce modèle de transcription. » | Votre organisation n'y a pas accès : gardez le modèle actuel. |
| Les utilisateurs signalent une transcription dégradée | Revenez à **gpt-realtime-whisper**. |
| « …, choisi pour cette installation, est retiré par OpenAI le … » | Rien ne casse : le remplaçant tourne déjà. Cliquez **Garder gpt-transcribe**, ou choisissez un autre modèle. |
| « Tarif inconnu » à la place d'un prix | Le dernier relevé ne connaît pas ce modèle : cliquez **Actualiser les tarifs dans Statistiques**, puis **Actualiser les tarifs**. |
| Aucun prix ne s'affiche | Les tarifs n'ont pas pu être lus : les modèles restent au choix, sans prix. Rouvrez l'onglet plus tard. |
