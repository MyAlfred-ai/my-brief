---
title: Les statistiques
description: Suivre l'adoption de myBrief et son usage compte par compte — réunions, temps enregistré, régularité, comptes rendus —, le filtrer, en sortir un rapport PDF, et savoir ce qu'il coûte en IA, sans jamais voir le contenu des réunions.
sidebar:
  order: 8
---

L'onglet **Administration → Statistiques** montre l'usage de myBrief sur la période choisie : combien de
réunions, combien de temps enregistré, qui s'en sert régulièrement et qui ne s'en sert pas, quels
templates reviennent. Et ce que cet usage coûte en IA, en euros.

## À quoi ça sert

À vérifier que l'outil est bien adopté — par l'organisation, par une équipe, par une personne — et à
repérer les comptes à accompagner. À présenter l'usage en comité, avec un rapport PDF. À prévoir le
budget d'IA, et à choisir ses modèles en connaissant leur prix.

## Comment ça marche

**Des volumes, jamais le contenu.** Aucun texte de réunion ne quitte le serveur : ni transcription, ni
résumé, ni titre. En revanche, les chiffres sont donnés **par personne**, avec leur nom et leur adresse.

**Les filtres cadrent toute la page.** La période — **7 jours**, **30 jours** (le défaut), **90 jours**,
**12 mois**, **Tout**, ou **Dates…** pour choisir le premier et le dernier jour —, puis le **Groupe**,
l'**Utilisateur** et le **Template**. Indicateurs, graphiques, tableau et dépenses se relisent tous sur
le même périmètre, rappelé au-dessus des indicateurs. **Effacer les filtres** revient à toute
l'organisation.

**Chaque chiffre se compare** à la période précédente de même durée, juste avant : ▲ en hausse, ▼ en
baisse. Sur **Tout**, il n'y a rien à comparer.

**Quatre statuts d'adoption.** Chaque compte ouvert est **Régulier** (au moins une semaine sur deux
avec une réunion), **Occasionnel**, **En sommeil** (rien sur la période, mais déjà utilisé) ou **Jamais
démarré**. Les semaines se comptent depuis la création du compte quand elle est récente.

**Les durées n'existent que depuis août 2026.** Les réunions plus anciennes comptent dans le nombre de
réunions, mais pas dans les durées ni les moyennes ; l'écran le signale — « Sur 12 réunions sur 40 ».

**Le crédit de temps de chacun** se suit dans sa propre section : **Administration → Crédit de
temps**. Un utilisateur, lui, ne voit que sa propre consommation, dans **Mes statistiques**.

**Les dépenses d'IA sont estimées**, sur la même période et le même périmètre : les volumes mesurés, les
modèles en service et les derniers tarifs publics relevés. **Actualiser les tarifs** les relève en ligne.

## Configurer

Rien à configurer : l'onglet se consulte.

| Réglage | Où | Effet | Page |
|---|---|---|---|
| **Période** | Statistiques, en haut | La période de toute la page : glissante, ou **Dates…** au jour près | [Lire les statistiques](lire-les-statistiques.md) |
| **Groupe**, **Utilisateur**, **Template** | Statistiques, sous la période | Le périmètre de toute la page ; un utilisateur choisi centre la page sur lui | [Lire les statistiques](lire-les-statistiques.md) |
| **Exporter en PDF** | Statistiques, en haut à droite | Un rapport des sections cochées, sur la période et le périmètre affichés | [Exporter les statistiques](exporter-les-statistiques.md) |
| **Exporter en CSV** | Statistiques → Utilisation par utilisateur | Le tableau par utilisateur, pour un tableur | [Exporter les statistiques](exporter-les-statistiques.md) |
| **Actualiser les tarifs** | Statistiques → Dépenses d'IA estimées | Les prix des modèles et le taux de change de l'estimation | [Estimer les dépenses d'IA](estimer-les-depenses-ia.md) |
| **Filtrer par groupe** | Crédit de temps | Les comptes et les compteurs d'un seul groupe | [Suivre le crédit de l'équipe](suivre-le-credit-de-l-equipe.md) |

## Exemples de configuration

**Le bilan du premier mois.** Période **30 jours** : le **Taux d'adoption** et **Santé de l'adoption**
disent si le lancement a pris.

**Relancer les comptes dormants.** Dans **Santé de l'adoption**, cliquez **En sommeil**, puis **Jamais
démarré** : le tableau **Utilisation par utilisateur** n'affiche plus que ces personnes.

**Comparer deux équipes.** **Groupe** sur l'une, puis sur l'autre : mêmes indicateurs, mêmes écarts à la
période précédente.

**Préparer un entretien.** Cliquez le nom de la personne dans le tableau : toute la page se centre sur
elle — sa régularité, ses réunions dans le temps, ses templates. **Toute l'équipe** revient en arrière.

**Le rapport mensuel du comité de direction.** **Dates…** du 1er au dernier jour du mois, puis
**Exporter en PDF** avec **Indicateurs clés**, **Santé de l'adoption**, **Réunions dans le temps** et
**Dépenses d'IA estimées**.

**Faire le ménage dans les templates.** **Templates utilisés**, période **12 mois** : ceux que personne
ne choisit peuvent être revus.

**Préparer le budget d'IA.** Période **90 jours**, **Actualiser les tarifs**, puis **Dépenses par
mois** : le rythme d'un trimestre, aux prix du jour. **Comparer les modèles** dit ce que changerait un
autre modèle.

## Vérifier que tout fonctionne

Après une réunion de test, **Actualiser** : le nombre de **Réunions** augmente d'une unité, votre ligne du
tableau **Utilisation par utilisateur** aussi, et la dépense **Sur la période** suit.

## Voir aussi

- [Lire les statistiques](lire-les-statistiques.md) — chaque indicateur, chaque graphique, le tableau
- [Exporter les statistiques](exporter-les-statistiques.md) — le rapport PDF et le CSV
- [Les utilisateurs](../utilisateurs/index.md) — les comptes et leur dernière connexion
- [Les templates](../templates/index.md) — ceux que l'organisation propose
- [L'IA](../ia/index.md) — les modèles dont la carte des dépenses fait le compte
