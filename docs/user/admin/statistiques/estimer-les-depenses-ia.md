---
title: Estimer les dépenses d'IA
description: Ce que coûte myBrief en IA, en euros, par mois, par heure de réunion et poste par poste ; comment l'estimation est calculée, et comment actualiser les tarifs.
sidebar:
  order: 2
---

**Administration → Statistiques**, carte **Dépenses d'IA estimées**, sous le tableau **Utilisation par
utilisateur**. Elle suit la période et les filtres de la page : choisissez un **Groupe** pour savoir ce
que coûte une équipe.

## Les trois chiffres

| Chiffre | Ce qu'il mesure |
|---|---|
| **Dépenses par mois** | La dépense de la période, ramenée à un mois au rythme de cette période |
| **Une heure de myBrief** | La dépense de la période divisée par les heures de réunion. Sans réunion sur la période : une réunion type d'une heure, sans infographie |
| **Sur la période** | La dépense de la période choisie, et ce que coûte une réunion en moyenne |

## La dépense poste par poste

| Poste | Ce qu'il couvre |
|---|---|
| **Transcription** | La transcription en direct, facturée à la minute d'audio |
| **Comptes rendus** | Chaque compte rendu généré, régénérations comprises |
| **Infographies** | La maquette puis l'image de chaque infographie |
| **Assistants en réunion** | La détection d'actions pendant la réunion, et le titre de chaque réunion |

Chaque ligne donne ses modèles, son coût unitaire (l'heure, le compte rendu ou l'infographie) et sa
part des dépenses. **Données** affiche les mêmes valeurs en tableau, avec les volumes de la période.

## Comparer les modèles

**Comparer les modèles** chiffre la même activité avec chacun des modèles proposés dans l'onglet **IA** :
**Tarif public**, **Coût unitaire**, dépense **Par mois** et **Écart par mois**. Le modèle **En
service** est surligné. Sur téléphone — ou quand la carte est étroite —, chaque modèle se lit en fiche :
la dépense par mois en tête, puis le tarif, le coût unitaire et l'écart.

Seul le prix change : la qualité, elle, se juge à l'essai. Voir
[Choisir le modèle de rédaction](../ia/choisir-le-modele-de-redaction.md).

Les mêmes tarifs s'affichent dans l'onglet **IA**, au moment de choisir le modèle de transcription :
chaque modèle y montre son niveau de prix en **€** et le coût d'une heure en euros. Voir
[Choisir le modèle de transcription](../ia/choisir-le-modele-de-transcription.md).

## Actualiser les tarifs

1. Cliquez **Actualiser les tarifs**, en bas de la carte.
2. Le serveur relève en ligne les prix publics des modèles, et le taux de change de référence de la
   Banque centrale européenne.
3. La carte se recalcule. Sous les chiffres : « Tarifs du … » et « 1 $ = … € », avec leur source.

Sans actualisation, la carte applique les derniers tarifs relevés : ceux de la dernière actualisation,
ou ceux livrés avec myBrief. Un clic suffit à les rafraîchir, rien ne se fait tout seul.

## Comment l'estimation est calculée

**Hypothèses de calcul**, dans la carte, en donne le détail. L'essentiel :

- **Des tarifs publics**, hors taxes, sans remise ni crédit gratuit : une estimation, pas une facture.
  Les tarifs restent en dollars, comme sur la page de tarifs d'OpenAI ; les dépenses sont en euros.
- **Des volumes mesurés** : la durée des réunions, la longueur des transcriptions, les comptes rendus
  générés, les infographies. Les jetons réellement facturés, myBrief ne les connaît pas : la carte les
  estime, et le dit.
- **La période** est celle choisie en haut de l'onglet. Une instance plus jeune que la période se
  mensualise depuis sa première réunion.
- **Les modèles** sont ceux en service dans l'onglet **IA**.

## Ce qu'il faut savoir

- **Une réunion en visio n'est comptée que pour un flux audio.** Elle en transcrit deux, le micro et le
  son de la visio : sa transcription peut coûter jusqu'à deux fois l'estimation. C'est un défaut connu de
  l'estimation.
- **Seule la dernière infographie d'une réunion est comptée** : une infographie régénérée remplace la
  précédente.
- **Les réunions d'avant août 2026 n'ont pas de durée enregistrée** : elle est déduite de la longueur du
  texte transcrit, et **Une heure de myBrief** le signale.
- **Non comptés** : l'import de fichiers audio, la relecture de la transcription par les notes, les
  essais de l'onglet **IA**.
- **« Tarif inconnu »** : un modèle imposé par la configuration du serveur, que ni myBrief ni les
  sources en ligne ne connaissent. Sa dépense n'est pas comptée, et la carte le signale.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Les sources de tarifs sont injoignables depuis le serveur : les derniers tarifs relevés restent appliqués. » | Le serveur ne sort pas sur Internet. Demandez à la personne qui l'administre d'ouvrir l'accès ; d'ici là, l'estimation reste calculée aux derniers tarifs |
| « Tarifs actualisés. Le taux de change n'a pas pu être relevé : le dernier connu reste appliqué. » | Rien d'urgent : réessayez plus tard |
| « L'estimation des dépenses n'a pas pu être calculée. Les autres statistiques restent justes. » | Cliquez **Actualiser**, en haut de l'onglet |
