---
title: Proposer l'infographie
description: Proposer ou masquer l'infographie des réunions, décider qui peut s'en servir, et savoir d'où viennent sa mise en page, son logo et ses couleurs.
sidebar:
  order: 4
---

**Administration → Modèles IA → Modèles**, tuile **Infographie** : un clic déplie
l'**Infographie de compte rendu**. L'infographie est une page visuelle de la réunion : l'IA en écrit le
contenu à partir de la transcription, des actions et des notes, puis il est mis en page avec le logo et
les couleurs de l'organisation.

## Étapes

1. **Proposer l'infographie** : **Proposée** ou **Masquée**. Elle est proposée par défaut.
2. Cliquez **Enregistrer**, en bas de la page.

## Résultat

- **Proposée** : la tuile **Infographie** apparaît dans la carte de génération, et
  l'invitation **Créer une infographie** sur les réunions résumées, pour chaque compte dont un groupe
  donne le droit. Au départ, le groupe « Défaut » le donne : tout le monde en profite.
- **Masquée** : la tuile et l'invitation disparaissent pour tous, quels que soient les groupes, et toute
  nouvelle génération est refusée. Les infographies déjà créées restent visibles et supprimables.

## Qui peut s'en servir

L'infographie proposée, ce sont les groupes qui décident qui la génère : **Administration → Personnes →
Groupes**, interrupteur **Générer des infographies** de chaque groupe : chacun a le droit de son
groupe. Voir [Gérer les groupes](../utilisateurs/gerer-les-groupes.md).

## Six mises en page

L'IA choisit, pour chaque réunion, la mise en page qui montre le mieux ce qui en ressort : **Synthèse**,
**Décision**, **Feuille de route**, **Tableau de bord**, **Atelier** ou **Bilan**. Le template du compte
rendu l'oriente — une **Rétrospective** penche vers le **Bilan**, un **Brainstorming** vers l'**Atelier**
—, sans l'imposer. Une mise en page qui manquerait de matière — une feuille de route sans dates, un
tableau de bord sans chiffres — laisse la place à la **Synthèse**.

Toutes tiennent sur une page A4 et partagent le même cadre : le logo en haut à gauche, le titre, l'essentiel en grand sur la couleur
primaire, puis le corps de la mise en page, les actions et un pied de page avec les participants et la
prochaine étape.

## Son allure

Les logos et les deux couleurs viennent de **Organisation → Marque & apparence** : voir
[Personnaliser l'apparence](../configuration/personnaliser-l-apparence.md). Rien à régler ici. Le
**logo de l'entreprise** ouvre chaque infographie, en haut à gauche ; le **logo de l'application**
la signe en pied de page, avec « myBrief ». Tant que le premier manque, le second prend sa place en
tête, et une pastille le signale sur **Marque & apparence**. Un changement de logo ou de couleur
s'applique aussi aux infographies déjà créées, à l'écran comme au téléchargement.

Le **Style graphique** et le **Modèle qui dessine l'image** ont disparu de cette rubrique : l'infographie
n'est plus dessinée par un modèle d'image. Un style enregistré autrefois reste en mémoire mais ne
s'applique plus.

## Ce qu'il faut savoir

- **Chaque infographie est un appel au modèle de texte**, facturé sur la clé OpenAI de l'organisation.
  Plus d'image à dessiner : elle coûte moins qu'avant, et arrive plus vite.
- **Les infographies créées avant les mises en page** restent des images : elles s'affichent et se
  téléchargent comme avant. Les régénérer les fait passer à la nouvelle présentation.
- Les textes de l'infographie sont dans la langue de l'interface de la personne qui la demande.
