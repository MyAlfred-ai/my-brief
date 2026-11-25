---
title: L'Aide IA en réunion
description: Décider de ce que l'Aide IA propose pendant une réunion — domaines, mot d'appel, niveau d'intervention — et de quels groupes y ont droit.
sidebar:
  order: 8
---

La page **Administration → Capacités → Aide IA** règle ce que l'installation propose pendant une
réunion. Qui s'en sert se décide ailleurs : dans **Administration → Personnes → Groupes**.

## À quoi ça sert

À laisser une IA suivre les réunions de ceux qui en ont l'usage — relever une décision contraire au
projet, répondre à une question, suivre l'ordre du jour — sans l'imposer à tout le monde, et sans ouvrir
le wiki de l'organisation à plus de comptes que vous ne le voulez.

## Comment ça marche

**Deux étages, tous deux nécessaires.** Cette page décide de ce qui existe dans l'installation ; le
groupe de chaque compte décide s'il y a droit. **Au départ, aucun groupe n'a le droit** : mettre
myBrief à jour n'allume l'Aide IA chez personne.

**Qui y a droit.** La première carte de la page nomme les groupes dont les membres voient l'Aide IA,
et ceux qui lisent myBrain. Tant qu'aucun groupe n'a le droit, elle le dit — **Personne pour
l'instant** — et **Ouvrir Groupes** y mène. Elle vous prévient aussi quand votre propre compte n'est
dans aucun de ces groupes : vous ne verriez pas l'Aide IA dans vos réunions. Un droit donné s'applique
dès que vous fermez l'administration, sans recharger la page.

La carte dit aussi ce que **votre** compte obtient : **Votre compte : l'Aide IA lit myBrain dans vos
réunions**, ou la raison pour laquelle elle ne le lit pas — le droit **Aide IA avec myBrain** qui
manque à votre groupe, la clé sans le droit **lire**, myBrain qui n'est pas relié. C'est la première
chose à regarder quand l'IA répond sans consulter myBrain.

**Les domaines d'intervention proposés.** Un domaine coupé ici n'apparaît chez personne. Tous les
autres sont allumés d'office au début de chaque réunion : celui qui la lance n'a rien à régler avant,
et coupe pendant ce qui le gêne, pour cette réunion seulement. C'est le niveau des **interventions
spontanées**, plus bas, qui règle combien l'IA se manifeste.

| Domaine | Ce que fait l'IA |
|---|---|
| **Garde-fou du projet** | Alerte quand une décision contredit l'objectif, le périmètre ou une échéance du projet de la réunion. Demande myBrain |
| **Questions-réponses** | Répond aux questions, à voix haute ou par écrit. Avec myBrain : les fiches. Sans : la réunion en cours. Coupé, on peut encore lui demander un geste : tag, note, pause… |
| **Ordre du jour** | Retient les points à traiter, annoncés en réunion ou ajoutés au pupitre. Dit s'ils ont été tenus, signale ceux qu'on oublie et, à la fin, ceux qu'on n'a pas abordés |
| **Boîte à idées** | Propose de temps à autre une piste ou une question à se poser |

**Le mot d'appel** est le prénom que les participants donnent à l'IA pour lui parler à voix haute :
lui poser une question, ou lui demander un geste. Vide, il revient à sa valeur d'origine. Pendant une réunion, il est écrit à côté de l'orbe de
l'Aide IA, pour que chacun sache par quel mot commencer sa phrase : choisissez-le court.

Préférez un prénom de **cinq lettres ou plus**, et qui ne soit celui de personne dans vos réunions. La
transcription l'écorche parfois (« Alfrède », « Al Fred ») : l'Aide IA le reconnaît quand même, mais
seulement à partir de cinq lettres — un prénom plus court doit être transcrit lettre pour lettre.

**Ce que coûte une question.** Quand l'Aide IA lit myBrain, chaque question fait deux appels au
modèle au lieu d'un : le premier prépare la recherche — les noms cités, sous les graphies qui se
prononcent pareil —, le second répond. Sans myBrain, un seul.

**Les interventions spontanées** — ce que l'IA signale d'elle-même :

| Niveau | Ce qu'elle signale |
|---|---|
| **Discrètes** | Seulement les contradictions nettes, aucune idée |
| **Normales** | Les contradictions, les points qu'on oublie, une idée toutes les dix minutes au plus et, en fin de réunion, les points qu'on n'a pas abordés |
| **Soutenues** | Aussi les dérives légères, et une idée toutes les cinq minutes au plus |

En **Discrètes**, l'ordre du jour reste retenu, suivi et restitué quand on le demande ; l'IA ne
rappelle rien d'elle-même, pas même quand la réunion se termine.

**La lecture de myBrain.** Le **Garde-fou du projet** et les réponses tirées des fiches demandent que
myBrain soit relié, avec une clé qui porte le droit **lire** en plus de celui de nourrir le cerveau. La
carte **Lecture de myBrain** dit où vous en êtes. Sans ce droit, l'Aide IA fonctionne quand même, sur
la seule réunion. Les droits de la clé sont redemandés à myBrain chaque fois que vous ouvrez cette
page : si un administrateur de myBrain vient d'ajouter **lire** à la clé, il n'y a rien d'autre à
faire ici. Lire myBrain ne dépend pas de l'**Envoi des réunions** : l'un peut être désactivé et
l'autre ouvert.

**Tester la lecture.** Dans la carte **Lecture de myBrain**, posez une question comme en réunion :
la page montre les fiches que myBrain rend à myBrief pour y répondre, un extrait, et ce que trouve
la recherche par mots-clés, qui prend le relais quand myBrain ne rend aucune fiche. C'est la façon de
savoir si une réponse pauvre vient de myBrain — il ne sait rien, ou sa fiche est dans une zone
restreinte — ou du droit du compte.

**Qui lit quoi.** L'Aide IA lit le wiki partagé au nom de l'application, pas de la personne : tout
compte autorisé y a le même accès, quels que soient ses droits dans myBrain. Les zones restreintes de
myBrain lui restent fermées. C'est le droit **Aide IA avec myBrain** du groupe qui décide de qui voit le
wiki à travers elle.

**Ce que ça coûte.** Tant que l'Aide IA est allumée, myBrief interroge le modèle au fil de la réunion,
avec la clé de l'installation : au plus une lecture toutes les vingt secondes, plus une par question.
Le domaine **Ordre du jour** suffit à déclencher ces lectures, même sans point saisi : l'IA écoute ce
qui s'annonce.

**Sa voix.** Chacun peut lui faire lire ses interventions à voix haute, dans ses propres réglages.
La voix du navigateur ne coûte rien. Celles d'OpenAI et de Mistral passent par les clés de
l'installation, et ne sont proposées que si la clé est renseignée **et** qu'un essai vient de réussir
— myBrief essaie chaque modèle avant de l'offrir, puis garde le résultat six heures. Rien à allumer
ici : retirer une clé retire sa voix.

**Défaut connu.** Ces appels — lectures, questions et voix — n'apparaissent pas encore dans les
dépenses estimées de **Consommation**.

## Configurer

Dans **Administration → Capacités → Aide IA** : les domaines proposés, le mot d'appel, le niveau des
interventions spontanées. **Enregistrer** n'envoie que ce que vous avez modifié.

| Vous voulez… | Page |
|---|---|
| Donner l'Aide IA à un groupe, avec ou sans myBrain | [Gérer les groupes](../utilisateurs/gerer-les-groupes.md#les-droits-de-laide-ia) |
| Relier myBrain, ou changer sa clé | [Relier myBrief à myBrain](../mybrain/relier-mybrief-a-mybrain.md) |

## Exemples

**Un essai avec quelques personnes.** Créez un groupe « Pilotes », donnez-lui **Aide IA en réunion**,
placez-y trois comptes. Les autres ne voient rien changer.

**Le wiki réservé aux chefs de projet.** Donnez **Aide IA en réunion** à tous les groupes, et **Aide IA
avec myBrain** au seul groupe des chefs de projet : les autres ont les questions, l'ordre du jour et les
idées, sur leur réunion seule.

**Une IA qui se fait trop entendre.** Passez les interventions spontanées à **Discrètes**, ou coupez la
**Boîte à idées** pour toute l'installation.

## Voir aussi

- [Gérer les groupes](../utilisateurs/gerer-les-groupes.md) — les deux droits de l'Aide IA
- [L'envoi des réunions à myBrain](../mybrain/index.md) — la connexion à myBrain et sa clé
- [L'IA](../ia/index.md) — la clé du modèle que l'Aide IA utilise
