---
title: La détection d'actions
description: Les tâches évoquées en réunion apparaissent d'elles-mêmes pendant qu'on parle — qui fait quoi, pour quand — à corriger avant le compte rendu.
sidebar:
  order: 5
---

Pendant la réunion, myBrief repère les **actions** — les tâches que quelqu'un annonce, prend en charge ou
se voit confier — et les affiche dans le panneau **Actions détectées**, en haut de la colonne de droite.
Chacune porte un titre, un porteur, une échéance et une description, que vous pouvez corriger.

Ne pas confondre avec les [actions après réunion](../actions/index.md) — envoyer, entreposer,
télécharger le compte rendu.

## À quoi ça sert

À repartir de la réunion avec la liste de qui fait quoi, sans l'avoir saisie. Les actions rejoignent le
compte rendu quand le template les appelle, et l'infographie.

## Comment ça marche

**En direct.** Après chaque phrase terminée, l'IA relit les dernières phrases et cherche une tâche. Une
action apparaît quelques secondes après avoir été énoncée, avec une animation ; si la suite de la
conversation précise son porteur ou son échéance, la carte se complète et le champ modifié s'éclaire.
Une dernière analyse a lieu à l'arrêt.

**Ce que l'IA remplit.** Un titre, une description courte, le **porteur** et l'**échéance** — seulement
s'ils ont été dits : elle ne les invente jamais. Une échéance comme « vendredi » est convertie en date.
Titre et description sont rédigés dans la [langue de l'interface](../configuration/changer-la-langue.md),
comme le compte rendu.

**Ce que vous faites.** Corriger une carte, en ajouter une à la main, masquer celles qui n'en sont pas.
Une action masquée quitte la liste, le compte rendu et l'infographie, et l'IA ne la repropose plus ;
elle attend sous **Actions masquées**, en bas de la liste, d'où **Rétablir** la ramène.

**Où elles vont.** Dans le compte rendu, par la pastille **📋 Actions** des templates — tous les templates
fournis la contiennent —, et dans l'infographie. Jamais dans les mails à part : seulement à travers le
résumé.

**Quand elles sont gardées.** À chaque modification, avec la réunion : pendant l'enregistrement, à la
fin — par **Résumer** comme par **Enregistrer** — et sur une réunion rouverte depuis l'historique. Une
action modifiée après coup n'entre dans le compte rendu qu'au résumé suivant.

**Le contexte.** L'IA s'appuie sur le vocabulaire de votre organisation — noms de clients, sigles —
déclaré par votre administrateur, et sur les noms donnés aux participants de la visio.

## Les façons de s'en servir

| Vous voulez… | Page |
|---|---|
| Voir les actions apparaître pendant la réunion | [Suivre les actions en direct](suivre-les-actions-en-direct.md) |
| Corriger une action, en ajouter une, masquer une fausse ou la rétablir | [Corriger et compléter les actions](corriger-et-completer-les-actions.md) |
| Rendre la détection plus stricte, plus large, plus rapide | [Régler la détection](regler-la-detection.md) |

## Ce que vous pouvez régler

Tout, et pour vous seul, dans **Ma configuration → Détection d'actions** : la détection elle-même, sa
**sensibilité**, les **mots déclencheurs**, la correction des actions au fil de la réunion, et le
**rythme** des analyses. Un **banc d'essai** juge un réglage sur un extrait avant de l'adopter.

Votre administrateur n'a pas de réglage sur la détection, sauf le vocabulaire de l'organisation.

## Exemples

**« Je m'en occupe. »** Sophie dit : « je relance le client demain ». Une carte apparaît : *Relancer le
client*, porteur Sophie, échéance au lendemain.

**Une action précisée plus tard.** « Il faudra préparer le devis. » … « Julie, tu peux le faire pour
vendredi ? » La carte *Préparer le devis* reçoit Julie et la date de vendredi.

**Une fausse action.** « On verra ça à l'occasion » a produit une carte : vous la masquez d'un clic sur
la corbeille. Masquée par erreur ? **Actions masquées**, puis **Rétablir**.

**Un atelier foisonnant.** Sensibilité **Large** : tout ce qui ressemble à une tâche remonte, même sans
porteur. Mieux vaut masquer une carte en trop qu'en oublier une.

## Voir aussi

- [La prise de notes](../notes/index.md) — l'autre panneau de la colonne de droite
- [Les templates](../templates/index.md) — ceux qui joignent la liste des actions
- [Nommer les participants](../transcription/nommer-les-participants.md) — pour des porteurs justes en visio
