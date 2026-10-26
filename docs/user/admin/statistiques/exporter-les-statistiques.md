---
title: Exporter les statistiques
description: Sortir un rapport PDF des sections choisies, sur la période et le périmètre affichés, ou le tableau par utilisateur en CSV pour un tableur.
sidebar:
  order: 4
---

**Administration → Statistiques.** Réglez d'abord la période et les filtres : les exports reprennent ce
que l'écran affiche.

## Le rapport PDF

**Exporter en PDF**, en haut à droite, ouvre le choix des sections. La boîte rappelle la **Période** et
le **Périmètre** du rapport.

| Section | Ce que le rapport contient |
|---|---|
| **Indicateurs clés** | Réunions, temps enregistré, durée moyenne, taux d'adoption, comptes rendus, réunions par compte actif, avec leurs écarts à la période précédente |
| **Santé de l'adoption** | La répartition des comptes en quatre statuts |
| **Réunions dans le temps**, **Temps enregistré** | Les deux histogrammes de la période |
| **Répartition des durées**, **Activité par jour** | Côte à côte |
| **Utilisateurs les plus actifs**, **Templates utilisés** | Côte à côte |
| **Dépenses d'IA estimées** | Les trois montants et la répartition par poste |
| **Utilisation par utilisateur** | Le tableau complet, du plus au moins actif, en annexe |

**Tout cocher** et **Tout décocher** vont vite ; le dernier choix est retenu dans votre navigateur.
**Générer le PDF** télécharge `mybrief_statistiques_<date>.pdf`.

Le rapport est un vrai document texte : ses chiffres se sélectionnent et se recopient. Un graphique
n'est jamais coupé entre deux pages, et le tableau par utilisateur répète ses en-têtes de colonne en
haut de chaque page.

Quand la page est centrée sur une personne, **Santé de l'adoption**, **Utilisateurs les plus actifs** et
**Utilisation par utilisateur** sont grisées : elles n'ont de sens que pour un groupe.

## Le tableau en CSV

**Exporter en CSV**, sur la carte **Utilisation par utilisateur**, télécharge le tableau tel qu'il est
affiché — recherche, statut et tri compris — dans `mybrief_utilisation_<date>.csv`. Les durées y sont en
minutes et les dates au format `AAAA-MM-JJ`, pour qu'un tableur sache les trier et les additionner. En
français, les colonnes sont séparées par des points-virgules, comme l'attend Excel réglé en français.

## Ce qu'il faut savoir

- **Le rapport nomme des personnes** : partagez-le avec discernement.
- **Ni le PDF ni le CSV ne contiennent de contenu de réunion** : des volumes, des dates, des noms de
  templates.
