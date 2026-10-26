---
title: Régler la longueur du résumé (Pagimètre)
description: Choisir, au moment de générer, combien de pages le résumé remplira — de ¼ de page à 10 pages —, et laisser myBrief vérifier le résultat.
sidebar:
  order: 2
---

Le **Pagimètre** règle la longueur du résumé, en pages : un quart de page pour un point rapide, dix
pages pour un atelier d'une journée. Il apparaît dans la carte de génération quand le template choisi
le propose — c'est le cas de **Standard**, réglé sur **1 page**.

## Étapes

1. Ouvrez la carte de génération — voir [Générer un résumé](generer-un-resume.md).
2. Cliquez un template qui porte la pastille **1 p.** (ou **½ p.**, **3 p.**…) : le Pagimètre s'ouvre
   sous les templates, sur la position de départ de ce template.
3. Faites glisser le curseur, ou cliquez un repère : **¼**, **½**, **1**, **2**, **3**, **5**, **10**.
   Au clavier, les flèches passent d'une position à la suivante.
4. Cliquez **Générer →**.

Pendant le réglage, trois indications suivent le curseur : la longueur (« 1 page »), des feuilles qui se
remplissent — une par page, la dernière au prorata —, et l'équivalent en mots et en temps de lecture
(« ≈ 450 mots · 2 min de lecture »).

## Résultat

Le résumé est rédigé à la longueur choisie, puis **vérifié** : myBrief mesure la place qu'il prend et,
s'il s'écarte de plus d'un cinquième de la longueur demandée, le fait reprendre — développer en
puisant dans la transcription, ou condenser — avant de l'afficher.

Le badge au-dessus du résumé rappelle la longueur obtenue : **📝 Standard · ≈ 1 page**. Au survol de la
longueur, une infobulle donne la longueur demandée et celle obtenue.

## Ce que compte le Pagimètre

- **Le résumé rédigé par l'IA, pas le document entier.** Le Pagimètre règle le bloc **✨ Résumé IA**.
  Le titre, la date, l'auteur, la liste des actions et les résumés complémentaires de la mise en forme
  s'y ajoutent : sur ordinateur, la carte le rappelle, « Titre, infos et actions de la mise en forme
  s'y ajoutent. »
- **Une page, c'est une page A4 du PDF** que myBrief exporte, soit environ 450 mots. Une liste de
  puces courtes remplit plus vite une page qu'un texte suivi : c'est la place occupée qui compte,
  pas le nombre de mots.
- **La forme suit la longueur.** À ¼ de page, le résumé tient en un court paragraphe ou quelques
  puces, sans intertitre ; à 10 pages, chaque sujet a sa partie, développée.
- **Le Pagimètre passe avant les directives du template** : si elles demandent « dix lignes » et que
  vous choisissez 3 pages, c'est 3 pages.

## Cas particuliers

- **Une réunion courte.** Un résumé fidèle ne peut pas être plus long que ce qui a été dit. Quand la
  réunion ne permet pas la longueur choisie, la fin du curseur est hachurée et la carte prévient :
  « Réunion courte : au-delà de 1,5 page, il n’y aurait plus rien de vrai à écrire. Le résumé
  s’arrêtera vers 1,5 page. » myBrief n'invente rien pour atteindre la longueur.
- **Régénérer une version.** **Nouveau résumé** avec le même template repart de la longueur de la
  version affichée : il suffit de déplacer le curseur pour un résumé plus court ou plus long.
- **Passer d'un template à l'autre** dans la carte garde le réglage de chacun, jusqu'à la fermeture
  de la carte : la pastille de chaque carte affiche la longueur réglée (**3 p.** après avoir choisi
  3 pages).
- **Un template sans Pagimètre** génère comme avant : sa longueur suit ses directives. La carte le dit
  à la place du curseur : « Ce template ne propose pas le Pagimètre : la longueur du résumé suit ses
  directives. »
- **La vérification prend un peu de temps** : une reprise ajoute de quelques secondes à une ou deux
  minutes pour les résumés les plus longs.
- **Si l'IA a retouché la mise en forme** (un titre de section réécrit), la longueur ne peut pas être
  mesurée : le résumé part sans reprise, et le badge rappelle la longueur demandée.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| Le Pagimètre n'apparaît pas | Le template choisi ne le propose pas : la carte l'indique sous les templates. Prenez **Standard**, ou activez-le sur votre template — voir [Créer son template](../templates/creer-son-template.md). |
| Le résumé est plus court que demandé | La réunion n'avait sans doute pas assez de matière : la carte le signale avant la génération. Complétez vos [notes](../notes/index.md) si des points manquent, puis **Nouveau résumé**. |
| Le PDF fait plus de pages que le réglage | Le titre, les infos et les actions s'ajoutent au résumé. Pour un document plus court, baissez le Pagimètre. |

## Voir aussi

- [Générer un résumé](generer-un-resume.md) — la carte de génération
- [Créer son template](../templates/creer-son-template.md) — proposer le Pagimètre sur vos templates
