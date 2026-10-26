---
title: L'envoi des réunions à myBrain
description: Relier myBrief au myBrain de l'organisation, et décider qui y envoie ses réunions.
sidebar:
  order: 7
---

L'onglet **Administration → MyBrain** relie myBrief au myBrain de votre organisation — son adresse et une
clé d'API — et décide qui lui envoie ses réunions.

## À quoi ça sert

À ce que les réunions nourrissent le wiki d'équipe sans que personne ait à les recopier : décisions,
échéances, interlocuteurs rejoignent les bonnes fiches. Rien n'entre dans le cerveau sans avoir été
validé dans la revue de myBrain.

## Comment ça marche

**La clé vient de myBrain.** Un administrateur de myBrain la crée dans **Administration → Clés d'API**,
avec le droit **Nourrir le cerveau** — voir
[Créer une clé d'API](https://docs.myalfred.ai/my-brain/admin/applications/creer-une-cle-d-api/), dans la
documentation de myBrain. Elle agit au nom de l'application, jamais d'une personne : nommez-la « myBrief ».
L'adresse et la clé sont **vérifiées auprès de myBrain avant d'être enregistrées**.

**Vous décidez qui envoie :**

| Envoi des réunions | Ce que ça donne |
|---|---|
| **Désactivé** | Aucune réunion ne part. La section **MyBrain** n'apparaît pas aux utilisateurs |
| **Au choix de chaque utilisateur** | Chacun active l'envoi dans **Ma configuration → MyBrain**. Rien ne part tant qu'il ne l'a pas activé |
| **Imposé à tous** | Les réunions de tous les comptes partent. Chacun le voit dans **Ma configuration → MyBrain**, sans pouvoir le désactiver |

**Une réunion part quand elle se termine** — **Générer le résumé** ou **Enregistrer** —, une seule
fois : un résumé régénéré ne la renvoie pas. Elle part avec son titre, sa date et son heure, sa durée,
son auteur, son tag, ses notes, ses actions, son compte rendu et sa transcription intégrale. **Seules
partent les réunions commencées après l'ouverture de l'envoi**, ou après votre dernier changement
d'**Envoi des réunions** : passer à **Imposé à tous** n'emporte pas les réunions passées de ceux qui
n'avaient rien demandé.

**Elle arrive dans la revue de myBrain**, en proposition : la question est posée à son auteur s'il a un
compte myBrain à la même adresse, sinon au responsable de la fiche, ou aux curateurs.

**Un envoi qui échoue** parce que myBrain est momentanément injoignable est retenté automatiquement,
plusieurs fois, dans les heures qui suivent. Les autres échecs sont signalés à l'utilisateur, qui peut
réessayer.

**Limites.** myBrain accepte 60 réunions par heure et par clé, partagées par toute l'instance : au-delà,
les envois attendent et repartent d'eux-mêmes. Une très longue réunion part en plusieurs parties.

## Configurer

| Réglage | Où | Effet | Page |
|---|---|---|---|
| **Adresse de MyBrain**, **Clé d'API** | MyBrain → Connexion à MyBrain | Le myBrain qui reçoit les réunions | [Relier myBrief à myBrain](relier-mybrief-a-mybrain.md) |
| **Envoi des réunions** | MyBrain → Envoi des réunions | Qui envoie ses réunions | [Relier myBrief à myBrain](relier-mybrief-a-mybrain.md) |

## Exemples de configuration

**Pour commencer.** **Au choix de chaque utilisateur** : les volontaires essaient, la revue de myBrain
reste lisible, et vous jugez la qualité de ce qui arrive avant d'aller plus loin.

**Une équipe dont toutes les réunions doivent nourrir le cerveau.** **Imposé à tous** : plus aucune
réunion n'échappe au wiki. Prévenez l'équipe — une réunion envoyée est lue par ceux qui valident la
revue de myBrain.

**Une pause.** **Désactivé** le temps de réorganiser le wiki : rien ne part, et la clé reste
enregistrée pour la reprise.

## Vérifier que tout fonctionne

1. **Tester la connexion** : « Connexion opérationnelle », et « Connecté en tant que « myBrief » ».
2. Avec un compte de test : activez **Envoyer mes réunions à MyBrain**, faites une courte réunion,
   terminez-la par **Enregistrer**. **Ma configuration → MyBrain** l'affiche « Envoyée », et elle attend
   dans la revue de myBrain.

## Voir aussi

- [L'envoi des réunions à myBrain, côté utilisateur](../../fonctionnalites/mybrain/index.md)
- [Les actions après réunion](../actions/index.md) — ce que deviennent aussi les comptes rendus
