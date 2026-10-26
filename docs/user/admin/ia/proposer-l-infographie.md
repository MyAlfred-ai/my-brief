---
title: Proposer l'infographie
description: Proposer ou masquer l'infographie des réunions, décider qui peut s'en servir, choisir le modèle qui dessine l'image et lui donner le style graphique de l'organisation.
sidebar:
  order: 4
---

**Administration → IA**, carte **Infographie de compte rendu**. L'infographie est une image générée à
partir de la transcription, des actions et des notes d'une réunion.

## Étapes

1. **Proposer l'infographie** : **Proposée** ou **Masquée**. Elle est proposée par défaut.
2. **Modèle qui dessine l'image** : **gpt-image-2.5-flare** par défaut.
3. Facultatif : le **Style graphique** — les couleurs à respecter, le ton des schémas, les mentions à
   faire figurer. 1 000 caractères au plus.
4. Cliquez **Enregistrer**, en bas de l'onglet.

## Résultat

- **Proposée** : la case **Générer une infographie** apparaît dans la carte de génération, et
  l'invitation **Créer une infographie** sur les réunions résumées, pour chaque compte dont un groupe
  donne le droit. Au départ, le groupe « Défaut » le donne : tout le monde en profite.
- **Masquée** : la case et l'invitation disparaissent pour tous, quels que soient les groupes, et toute
  nouvelle génération est refusée. Les images déjà créées restent visibles et supprimables.

## Qui peut s'en servir

L'infographie proposée, ce sont les groupes qui décident qui la génère : **Administration → Groupes**,
interrupteur **Générer des infographies** de chaque groupe. Les droits s'additionnent : un seul groupe
qui l'accorde suffit. Voir [Gérer les groupes](../utilisateurs/gerer-les-groupes.md).

## Le modèle qui dessine

| Modèle | Ce qu'il change |
|---|---|
| **gpt-image-2.5-flare** | Recommandé. Des images plus nettes que la génération précédente, et environ deux fois plus rapides. |
| **gpt-image-2** | La génération précédente. Plus lente, éprouvée sur les infographies de réunion. |

Le choix ne change ni le format de l'image — toujours une page portrait — ni ce qu'elle raconte : les
mêmes matériaux de réunion partent au modèle. Il change la vitesse, la finesse du dessin et le coût
de chaque image.

Un modèle changé s'applique à l'infographie suivante. Les images déjà créées ne changent pas : pour
comparer deux modèles, régénérez une infographie sur une réunion que vous connaissez.

## Le style graphique

Exemple : « Les couleurs à respecter sont le violet, l'orange et le rose. Les schémas sont clairs et
professionnels. Le nom de notre société en haut à gauche. »

Laissé vide, le modèle choisit lui-même sa palette et sa mise en page. Rempli, votre consigne passe
devant ses propres choix, pour chaque image.

## Ce qu'il faut savoir

- **Chaque image est facturée** sur la clé OpenAI de l'organisation : un modèle plus rapide coûte
  aussi moins cher.
- **Votre organisation doit être vérifiée chez OpenAI** pour que le modèle d'image réponde.
- Une image demande en général une à trois minutes.
