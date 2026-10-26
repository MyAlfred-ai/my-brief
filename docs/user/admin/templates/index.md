---
title: Les templates
description: Proposer à tous les comptes les templates de compte rendu de l'organisation, et adapter les six templates fournis.
sidebar:
  order: 2
---

L'onglet **Administration → Templates** gère les templates proposés à **tous les comptes** : les six
templates fournis par myBrief, que vous pouvez adapter, et ceux que vous créez pour l'organisation.

## À quoi ça sert

À donner à toute l'organisation les mêmes formats de compte rendu — le comité de direction, la revue de
projet, le rendez-vous client — sans que chacun les recrée. Et à corriger un template fourni qui ne
correspond pas à vos usages.

## Comment ça marche

**La liste** montre les six templates fournis, avec le badge **défaut** — **défaut modifié** une fois
adaptés —, puis les templates que vous avez créés. **Ajouter un template** en crée un ; il n'y a pas de
limite.

**Côté utilisateurs**, vos templates et les templates fournis forment la section **Templates** de la
carte de génération, les vôtres en tête ; les templates personnels de chacun viennent en dessous, dans
**Mes templates**. Les utilisateurs voient vos changements au prochain chargement de myBrief.

**L'éditeur est celui des utilisateurs** — **Identité**, **Directives à l'IA**, **Mise en forme du
résumé**, **Pagimètre** —, en français, avec un nom anglais facultatif.

**Le Pagimètre** fait régler la longueur du résumé en pages, de ¼ de page à 10 pages, dans la carte de
génération. Vous décidez, template par template, s'il est proposé (**Proposer le Pagimètre**) et d'où
part le curseur (**Position par défaut**). **Standard** le propose d'origine, sur 1 page ; les autres
templates fournis ne le proposent pas. Quand il est proposé, il prime sur toute longueur écrite dans
les directives.

**Un Standard adapté avant l'arrivée du Pagimètre ne l'a pas** : votre version remplace entièrement
celle d'origine, et elle a été enregistrée sans lui. Ouvrez-la, activez **Proposer le Pagimètre**,
puis **Sauvegarder** — ou **Rétablir le défaut** pour retrouver Standard tel que myBrief le livre.

**Adapter un template fourni** remplace sa version d'origine **pour tous les comptes**. **Rétablir le
défaut** y revient à tout moment. Un template fourni ne se supprime pas.

**L'éditeur montre la version qui s'applique** : directives et mise en forme d'un template fourni sont
celles que les comptes utilisent. L'enregistrer sans rien modifier ne change pas son rendu.

**La version anglaise.** Dans l'interface en anglais, un template fourni garde sa structure, avec des
titres en anglais. Une fois adapté, il garde vos titres dans les deux langues : seul le texte rédigé
par l'IA suit la langue de l'interface.

Les points de départ proposés aux utilisateurs dans **Mes templates** restent les versions d'origine de
myBrief, même si vous les avez adaptées.

## Configurer

| Réglage | Où | Effet | Page |
|---|---|---|---|
| **Ajouter un template** | Administration → Templates | Un template de plus, pour tous les comptes | [Créer un template d'organisation](creer-un-template-d-organisation.md) |
| Modifier un template **défaut**, **Rétablir le défaut** | Administration → Templates | La version utilisée par tous | [Modifier un template par défaut](modifier-un-template-par-defaut.md) |
| **Proposer le Pagimètre**, **Position par défaut** | Administration → Templates, section **Pagimètre** | La longueur du résumé se règle en pages, et part de cette position | [Régler la longueur du résumé, côté utilisateur](../../fonctionnalites/resumes/regler-la-longueur.md) |

## Exemples de configuration

**Un format maison pour les comités.** Un template « Comité de direction » : décisions, avancement par
chantier, risques, actions. Tous les directeurs l'ont dans leur liste.

**Vos rendez-vous commerciaux.** Un template « Rendez-vous client » : le besoin exprimé, les solutions
évoquées, les objections, les prochaines étapes — avec votre activité et vos offres dans les
directives. Tous vos commerciaux produisent le même compte rendu.

**Standard enrichi.** Un **⚡ Résumé en 20 mots** ajouté en tête de **Standard**, pour que chaque compte
rendu s'ouvre sur l'essentiel.

**Des comités en trois pages.** Le Pagimètre activé sur « Comité de direction », position par défaut
3 pages : chaque directeur part de trois pages, et peut réduire à une pour une réunion courte.

## Vérifier que tout fonctionne

Avec un compte de test, rechargez myBrief, puis générez un résumé d'une réunion existante avec le
template créé ou modifié : **Nouveau résumé**, template, **Générer →**.

## Voir aussi

- [Les templates, côté utilisateur](../../fonctionnalites/templates/index.md) — les pastilles, les
  exemples, les templates personnels
- [La configuration de l'instance](../configuration/index.md) — le vocabulaire joint à chaque compte rendu
