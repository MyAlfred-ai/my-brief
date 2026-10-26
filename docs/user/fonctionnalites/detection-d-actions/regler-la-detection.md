---
title: Régler la détection
description: Choisir ce que l'assistant repère pendant vos réunions, et à quel rythme — puis juger le réglage sur un extrait avant de l'adopter.
sidebar:
  order: 3
---

**Ma configuration → Détection d'actions.** Ces réglages n'appartiennent qu'à vous et valent pour toutes
vos réunions, y compris celle en cours.

## Les réglages

**Détection en réunion**

- **Détecter les actions pendant la réunion** — activé par défaut. Coupé, aucune action n'est proposée ;
  vous pouvez toujours en ajouter à la main.

**Ce que l'assistant cherche**

| Réglage | Valeurs | Par défaut |
|---|---|---|
| **Sensibilité** | **Stricte** : seulement ce qui est annoncé comme une action. **Équilibrée** : aussi ce que quelqu'un prend en charge ou se voit confier — « je m'en occupe », « tu peux relancer le client ? ». **Large** : tout ce qui ressemble à une tâche, même sans porteur — « il faut envoyer le devis » | **Équilibrée** |
| **Mots déclencheurs** | Des mots, séparés par des virgules, qui annoncent une action — 20 au plus. Laissé vide, le champ reprend « action » | action |
| **Corriger les actions au fil de la réunion** | Activé : une action se complète quand la suite précise son porteur, son échéance ou ce qu'il faut livrer. Désactivé : chaque action reste telle qu'elle a été détectée | Activé |

**Rythme**

| Réglage | Valeurs | Par défaut |
|---|---|---|
| **Profondeur d'écoute** | Le nombre de phrases relues à chaque analyse, de 3 à 30. Plus large, l'IA comprend mieux une action énoncée en plusieurs temps | 8 dernières phrases |
| **Espacement des analyses** | **À chaque phrase**, ou toutes les 2 à 10 phrases. Espacer réduit le nombre d'appels à l'IA ; l'écran indique le délai d'apparition à attendre | À chaque phrase |

Cliquez **Enregistrer**. Le réglage s'applique aussitôt, réunion en cours comprise.

## Essayer avant d'adopter

Le **Banc d'essai**, en bas de la page :

1. Collez un extrait de conversation dans **Extrait de conversation**, par exemple :

   ```text
   Marc : il faut relancer les établissements Durand avant vendredi.
   Sophie : je m'en occupe, je les appelle demain.
   Marc : action pour Julie, préparer le devis de reconduction.
   ```

2. Cliquez **Tester la détection**.
3. Lisez le résultat : « 3 action(s) détectée(s) » et leur liste, ou « Aucune action détectée dans cet
   extrait. »

Le test utilise les réglages **affichés**, enregistrés ou non — sauf le rythme, qui ne se teste pas. Si
vous changez un réglage ensuite, le résultat se grise : « Les réglages ont changé depuis cet essai. »
**Voir la consigne envoyée au modèle** montre le texte exact que reçoit l'IA. Les actions y sont
rédigées dans la langue de l'interface, comme en réunion.

Dix essais par heure au plus.

## Exemples de réglages

**Comités et réunions formelles.** **Stricte**, mots déclencheurs « action, à faire, décision » : peu de
bruit, seules les tâches annoncées remontent.

**Ateliers et brainstormings.** **Large**, profondeur 12 : tout remonte, vous retirez l'excédent.

**Réunions longues et bavardes.** **Équilibrée**, espacement toutes les 3 phrases : moins d'analyses,
des actions un peu plus lentes à apparaître.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Collez un extrait de conversation avant de tester. » | Le champ de l'extrait est vide. |
| « Trop d'essais en peu de temps. Réessayez dans quelques minutes. » | La limite de dix essais par heure est atteinte : attendez jusqu'à une heure. |
| Trop de fausses actions | Passez en **Stricte**, ou retirez un mot déclencheur trop courant. |
| Des engagements passent inaperçus | Passez en **Équilibrée** ou **Large**, ou augmentez la profondeur d'écoute. |
