---
title: Choisir le modèle de transcription
description: Choisir le modèle qui transcrit la parole en direct pendant l'enregistrement, chez OpenAI, Mistral, Speechmatics ou AssemblyAI, en voyant ce qu'il coûte, et le tester avant de l'adopter.
sidebar:
  order: 3
---

**Administration → Modèles IA → Modèles**, tuile **Transcription** : un clic déplie la liste des
modèles. Le modèle transcrit la parole en direct ; il ne change ni les résumés ni la détection
d'actions.

## Les modèles proposés

Chaque modèle affiche **son prix** : un niveau de **€** à **€€€€**, et le coût d'une heure de
transcription en euros, par exemple « 0,16 €/h ». À l'écran, les modèles sont rangés du moins cher au
plus cher.

**Lire les €.** Le moins cher des modèles proposés a un seul **€**, en vert. Chaque **€** de plus marque
un prix environ deux fois plus élevé ; le plus cher s'affiche en rouge. Deux modèles au même niveau
coûtent à peu près la même chose : leur coût en euros les départage.

Une ligne par modèle, du moins cher au plus cher : son nom, son fournisseur, son prix. Les boutons
au-dessus de la liste — **Tous**, **OpenAI**, **Mistral**, **Speechmatics**, **AssemblyAI** — filtrent par
fournisseur ; un cadenas marque ceux dont la clé manque. Le survol d'une ligne montre l'identifiant
technique du modèle, celui des factures du fournisseur, et le modèle choisi est décrit sous la liste. Sur
téléphone, l'échelle en **€** s'efface pour laisser la place au nom ; le prix reste.

| Fournisseur | Modèle | Identifiant | Repère |
|---|---|---|---|
| OpenAI | **GPT Realtime Whisper** | `gpt-realtime-whisper` | Le défaut historique : mot à mot, éprouvé sur les longues réunions |
| OpenAI | **GPT Live Transcribe** | `gpt-live-transcribe` | Conçu pour le direct : mot à mot, même famille que le défaut |
| OpenAI | **GPT Transcribe** | `gpt-transcribe` | Le plus récent : mot à mot, texte final reponctué par segment |
| Mistral | **Voxtral Realtime** | `voxtral-mini-transcribe-realtime-2602` | Mot à mot, ponctué au fil de la parole. Version stable |
| Mistral | **Voxtral Realtime 3** | `voxtral-mini-transcribe-realtime-3-0` | Le plus récent de Mistral, plus de langues. En aperçu public |
| Speechmatics | **Melia 1** | `speechmatics-melia-1` | Le plus récent de Speechmatics, passe seul d'une langue à l'autre |
| Speechmatics | **Enhanced** | `speechmatics-enhanced` | Le plus éprouvé de Speechmatics, très juste en français |
| AssemblyAI | **Universal-Streaming Multilingual** | `universal-streaming-multilingual` | Le moins cher d'AssemblyAI, 6 langues dont le français |
| AssemblyAI | **Universal-3.6 Pro** | `universal-3-6-pro` | Le plus juste d'AssemblyAI, 32 langues |

**gpt-4o-transcribe**, **gpt-4o-mini-transcribe** et **whisper-1** ne sont plus proposés : OpenAI les
retire le 26 février 2027.

## Étapes

1. Cliquez la tuile **Transcription**, puis choisissez le modèle dans la liste. Celui qui tourne
   aujourd'hui porte la mention **En service** ; la tuile affiche **Modifié** tant que le choix n'est pas
   enregistré.
2. Lisez l'écart qui s'affiche sous la liste, par exemple « 0,74 € de moins par heure que le modèle en
   service. » : c'est ce que le changement fera gagner, ou coûter, à chaque heure transcrite.
3. Cliquez **Tester ce modèle** : le test ouvre une vraie session de transcription et révèle un modèle
   indisponible pour votre organisation. « Modèle opérationnel ».
4. Cliquez **Enregistrer**, en bas de la page.

## Choisir un modèle de Mistral, Speechmatics ou AssemblyAI

Les modèles de ces trois fournisseurs transcrivent avec le compte de votre organisation chez eux, et
leur propre clé. Sans elle, ils restent visibles, prix compris, mais verrouillés, par exemple :
« Ajoutez une clé Speechmatics pour choisir ces modèles. »

La clé s'enregistre sur la page **Clés API**, le modèle se choisit ensuite sur la page **Modèles** :
deux pages, deux **Enregistrer**.

1. Créez une clé sur la console du fournisseur, pour le compte de votre organisation.
2. Page **Clés API**, carte **Fournisseurs d'IA** : cliquez la pastille du fournisseur (« + » en
   pointillés), puis **Ajouter une clé** — le champ s'ouvre. Ou, depuis la page **Modèles**, filtrez la
   liste sur ce fournisseur et cliquez **Ajouter la clé …** : la page **Clés API** s'ouvre sur lui, son
   champ ouvert.
3. Collez la clé, puis cliquez **Tester la clé** : « Clé valide ». Rien n'est encore enregistré.
4. Cliquez **Enregistrer**, en bas de la page. La clé est vérifiée avant d'être enregistrée ; la ligne
   affiche ensuite son début et sa fin, avec le badge **Configurée**.
5. Page **Modèles**, tuile **Transcription** : ses modèles sont débloqués, et seulement les siens.
   Choisissez-en un, **Tester ce modèle**, puis **Enregistrer**.

Une clé collée mais pas enregistrée est perdue en changeant de page : ses modèles restent verrouillés.

## Résultat

Le modèle s'applique aux enregistrements suivants. Une réunion en cours peut basculer en route, lors
d'une reconnexion.

## Ce qu'il faut savoir

- **Les prix** sont ceux de la carte **Dépenses d'IA estimées** : le tarif public de chaque fournisseur,
  converti en euros au dernier taux relevé. Leur date et le taux s'affichent sous la liste ; **Actualiser les
  tarifs dans Consommation** mène à la carte, où un clic les relève en ligne. Voir
  [Estimer les dépenses d'IA](../statistiques/estimer-les-depenses-ia.md).
- **En visio**, le son de vos interlocuteurs est transcrit à part : une heure de visio coûte jusqu'à
  deux fois le prix affiché.
- **L'import d'un fichier audio** suit le fournisseur : avec un modèle OpenAI, il utilise toujours
  **gpt-transcribe** ; avec un modèle d'un autre fournisseur, il est transcrit par ce fournisseur aussi.
  Les titres et la détection d'actions restent chez OpenAI, sur la clé OpenAI ; les comptes rendus
  suivent le modèle de rédaction.
- **Les clés Speechmatics et AssemblyAI** ne servent qu'à la transcription ; **la clé Mistral** sert
  aussi à la rédaction des comptes rendus, si un modèle Mistral y est choisi. Une clé ne se
  retire pas tant qu'un modèle de son fournisseur est en service : choisissez d'abord un autre modèle et
  enregistrez, puis **Retirer la clé**, sur sa ligne de la page **Clés API**.
- **AssemblyAI facture la durée de la réunion**, pauses comprises, et non le seul temps de parole.
- **Speechmatics** traite l'audio en Europe.
- **Un modèle retiré par OpenAI** et encore choisi est déjà remplacé par **gpt-transcribe**, qui
  transcrit de la même façon : moins cher que **gpt-4o-transcribe** et **whisper-1**, un peu plus que
  **gpt-4o-mini-transcribe**. La carte le dit, avec la date du retrait. **Garder gpt-transcribe** enregistre ce choix et retire le
  message ; vous pouvez aussi choisir un autre modèle, puis **Enregistrer**.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « OpenAI a refusé ce modèle de transcription. » | Votre organisation n'y a pas accès : gardez le modèle actuel. |
| Les utilisateurs signalent une transcription dégradée | Revenez à **gpt-realtime-whisper**. |
| « Speechmatics a refusé cette clé. » (ou Mistral, AssemblyAI) | Clé révoquée, erronée ou sans crédit : vérifiez-la sur la console du fournisseur. |
| « C'est une clé OpenAI (« sk-… ») : … » | La clé OpenAI a été collée sur la ligne d'un autre fournisseur : collez la clé créée chez lui. |
| « … a refusé ce modèle — … » | Votre compte n'y a pas accès : essayez l'autre modèle du même fournisseur, ou gardez le modèle actuel. |
| « Un modèle … est encore en service avec cette clé (transcription ou comptes rendus) : … » | Choisissez un modèle d'un autre fournisseur, enregistrez, puis retirez la clé. |
| « Ce modèle a besoin d'une clé … », et **Clé requise** sur la tuile | Un modèle est en service sans la clé de son fournisseur : **Ajouter la clé …** ouvre la page **Clés API** sur ce fournisseur. Collez-la, puis **Enregistrer**. |
| Pastille « … refuse la clé enregistrée… », sur **Clés API** | La clé a été révoquée chez le fournisseur : sur sa ligne, **Remplacer**, collez-en une nouvelle, puis **Enregistrer**. |
| « …, choisi pour cette installation, est retiré par OpenAI le … » | Rien ne casse : le remplaçant tourne déjà. Cliquez **Garder gpt-transcribe**, ou choisissez un autre modèle. |
| « Tarif inconnu » à la place d'un prix | Le dernier relevé ne connaît pas ce modèle : cliquez **Actualiser les tarifs dans Consommation**, puis **Actualiser les tarifs**. |
| Aucun prix ne s'affiche | Les tarifs n'ont pas pu être lus : les modèles restent au choix, sans prix. Rouvrez la page plus tard. |
