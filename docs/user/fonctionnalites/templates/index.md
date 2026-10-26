---
title: Les templates
description: Décider une fois de la forme de vos comptes rendus — ce que l'IA y met, dans quel ordre — et l'obtenir à chaque réunion.
sidebar:
  order: 8
---

Un **template** décide de la forme du compte rendu : ce que l'IA doit y écrire, et comment le document
est construit. Vous le choisissez juste avant de générer le résumé ; myBrief rédige alors toujours
le même type de document pour le même type de réunion.

## À quoi ça sert

À ne plus réécrire ses consignes à chaque réunion. Un point d'équipe, un comité de pilotage, un
entretien de recrutement n'appellent pas le même compte rendu : un template par usage, et chacun
obtient le bon format sans y penser. C'est ce qui distingue myBrief d'une simple transcription.

## Comment ça marche

**Trois provenances**, réunies dans la liste au moment de générer :

| Provenance | Qui les crée | Où vous les trouvez |
|---|---|---|
| **Templates fournis** — Standard, Réunion de décision, Entretien RH, Brainstorming, Planification, Rétrospective | myBrief ; votre administrateur peut les avoir adaptés | Section **Templates** |
| **Templates de votre organisation** | Votre administrateur, pour tous les comptes | Section **Templates**, avant les templates fournis |
| **Mes templates** | Vous, jusqu'à **cinq** | Section **Mes templates**, en dessous |

**Deux blocs par template** :

| Bloc | Ce qu'il décide |
|---|---|
| **Directives à l'IA** | Le **fond** du résumé principal : ce qu'il faut retenir, le style, la longueur |
| **Mise en forme du résumé** | La **structure** du document : vos titres et vos textes, repris tels quels, et des **pastilles** que myBrief remplace |

Les pastilles se rangent en deux familles :

| Blocs IA — rédigés par l'IA | Infos réunion — remplies par myBrief |
|---|---|
| **✨ Résumé IA** — le résumé principal, qui suit vos directives. Toujours présent, il ne peut pas être retiré | **📋 Actions** — la liste des actions visibles, ou « Aucune action » |
| **⚡ Résumé en 20 mots** — une phrase | **📅 Date** — la date et l'heure de la **génération** |
| **📃 Résumé en 100 mots** — un paragraphe, sans liste | **⏱ Durée** — la durée enregistrée, pauses exclues |
| **🎯 Points clés** — de deux à huit puces, par ordre d'importance | **👤 Auteur** — le nom de votre compte |
| | **🌐 Langue** — fr ou en |

Chaque bloc IA figure au plus une fois dans une mise en forme ; les infos réunion, autant de fois
que vous voulez.

**La date est celle de la génération**, pas celle de la réunion : un compte rendu généré le
lendemain porte la date du lendemain.

**Les templates fournis partagent une mise en forme** : un titre avec la date, l'auteur et la durée,
une **Synthèse** — le bloc **✨ Résumé IA** —, puis la liste des actions. Leurs directives, courtes,
fixent les parties de la synthèse : voir [Choisir un template](choisir-un-template.md).

**Ce qui nourrit le résumé, quel que soit le template** : la transcription, corrections comprises,
vos [notes](../notes/index.md), votre [contexte](../configuration/decrire-son-contexte.md) et le
vocabulaire de votre organisation. Les [actions](../detection-d-actions/index.md) visibles ne partent
que si le template les appelle.

Supprimer un template ne touche pas aux comptes rendus déjà produits avec lui.

## Les façons de s'en servir

| Vous voulez… | Page |
|---|---|
| Savoir quel template choisir, et ce que chacun produit | [Choisir un template](choisir-un-template.md) |
| Créer le template qui correspond à votre métier | [Créer son template](creer-son-template.md) |
| Partir d'exemples prêts à recopier | [S'inspirer d'exemples de templates](exemples-de-templates.md) |

## Ce que vous pouvez régler

- **Mes templates** : cinq au maximum, dans **Ma configuration → Mes templates**. Vous les créez,
  les modifiez et les supprimez à tout moment.
- Au moment de générer, des **Instructions supplémentaires** orientent un seul résumé sans toucher au
  template — voir [Générer un résumé](../resumes/generer-un-resume.md).
- Le **Pagimètre** : un template peut proposer de régler la longueur du résumé en pages, de ¼ de page
  à 10 pages, au moment de générer. **Standard** le propose, réglé sur 1 page ; sur vos templates, vous
  décidez s'il apparaît et d'où part le curseur — voir
  [Régler la longueur du résumé](../resumes/regler-la-longueur.md).

Les templates de l'organisation et les modifications des templates fournis dépendent de votre
administrateur : ils s'imposent à tous les comptes.

## Exemples

**Le point d'équipe du lundi.** Un template personnel « Point hebdo » : ⚡ Résumé en 20 mots en tête,
🎯 Points clés, puis 📋 Actions. Chaque lundi, le compte rendu tient sur un écran et chacun sait ce
qu'il a à faire.

**Un rendez-vous client.** Le template **Standard** donne un compte rendu avec la date, la durée,
l'auteur et les actions, d'une page par défaut. Vous ajoutez, pour cette fois, l'instruction « mets en
avant les objections du client », et poussez le Pagimètre à 2 pages.

**Un comité qui tranche.** **Réunion de décision** : la décision d'abord, puis le contexte, les options
étudiées et les réserves ; les actions viennent en fin de document, sous **Prochaines étapes**.

**Un entretien de recrutement.** **Entretien RH** : parcours, motivations, points forts, points de
vigilance, et la conclusion telle que le recruteur l'a exprimée.

## Voir aussi

- [Les résumés](../resumes/index.md) — générer, éditer, garder plusieurs versions
- [La prise de notes](../notes/index.md) — ce que vos notes ajoutent au compte rendu
- [La détection d'actions](../detection-d-actions/index.md) — ce que contient la pastille 📋 Actions
