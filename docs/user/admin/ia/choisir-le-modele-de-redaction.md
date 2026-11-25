---
title: Choisir le modèle de rédaction
description: Choisir le modèle d'IA qui rédige les comptes rendus, chez OpenAI ou Mistral, en voyant ce que coûte un compte rendu, et vérifier que votre organisation y a accès.
sidebar:
  order: 2
---

**Administration → Modèles IA → Modèles**, tuile **Comptes rendus** : un clic déplie le **Modèle
de rédaction du compte rendu**. La tuile dit le modèle en service, son fournisseur et ce que coûte un
résumé.

## Les modèles proposés

Une ligne par modèle, du moins cher au plus cher : son nom, son fournisseur, son prix. Les boutons
au-dessus de la liste — **Tous**, **OpenAI**, **Mistral** — filtrent par fournisseur ; un cadenas marque
celui dont la clé manque. Le survol d'une ligne montre l'identifiant technique du modèle, et le modèle
choisi est décrit sous la liste. On n'en choisit qu'un.

**Le prix est celui d'un résumé**, par exemple « 0,083 €/résumé » : le coût estimé du compte rendu d'une
réunion d'une heure, au tarif public du fournisseur converti en euros. Il est **approximatif** : un
compte rendu réel coûte plus ou moins selon la durée de la réunion et ce que le modèle écrit. Le ⓘ à côté
du titre le rappelle.

**Lire les €.** Le moins cher des modèles proposés a un seul **€**, en vert ; chaque **€** de plus marque
un prix environ **quatre fois** plus élevé — les modèles de rédaction vont de quelques millièmes d'euro à
une trentaine de centimes. Le plus cher s'affiche en rouge. Sur téléphone, l'échelle s'efface pour
laisser la place au nom ; le prix reste.

| Fournisseur | Modèle | Identifiant | Repère |
|---|---|---|---|
| OpenAI | **GPT-6 Astra** | `gpt-6-astra` | Le plus capable d'OpenAI, raisonnement le plus poussé — et de loin le plus cher |
| OpenAI | **GPT-6.1 Sol** | `gpt-6.1-sol` | Proche d'Astra sur les réunions complexes, pour cinq fois moins cher |
| OpenAI | **GPT-5.6 Sol** | `gpt-5.6-sol` | Génération précédente, son palier le plus capable |
| OpenAI | **GPT-5.4** | `gpt-5.4` | **Recommandé** : éprouvé sur nos comptes rendus, la meilleure structure pour le prix. Le modèle par défaut |
| OpenAI | **GPT-5.4 mini** | `gpt-5.4-mini` | Économique et rapide : un compte rendu plus ramassé, moins de nuances |
| OpenAI | **GPT-6 Luna** | `gpt-6-luna` | Le plus léger et le moins cher d'OpenAI, pour des réunions simples |
| Mistral | **Mistral Large 4** | `mistral-large-4` | Le plus capable de Mistral. En aperçu public |
| Mistral | **Mistral Medium 3.5** | `mistral-medium-3-5` | Le plus récent de Mistral en version stable, polyvalent |
| Mistral | **Mistral Large 3** | `mistral-large-2512` | Grand modèle éprouvé de Mistral, à petit prix |
| Mistral | **Mistral Small 4** | `mistral-small-2603` | Le plus léger et le moins cher de Mistral |

**Les modèles Mistral demandent la clé Mistral** — la même que celle de ses modèles de transcription.
Sans elle, ils restent visibles, prix compris, mais ne se choisissent pas : **Ajouter la clé Mistral**, sous
le filtre, mène à la page **Clés API**, ouverte sur Mistral, son champ ouvert.

## Étapes

1. Pour un modèle Mistral sans clé enregistrée, commencez par la clé : page **Clés API**, pastille
   **Mistral**, **Ajouter une clé**, collez-la, puis **Enregistrer**. Revenez ensuite sur la page
   **Modèles**.
2. Choisissez le modèle dans la liste. Avant d'enregistrer, un encadré dit l'écart de prix par compte
   rendu avec le modèle en service : en vert s'il fait économiser, en ambre s'il coûte plus.
3. Cliquez **Tester l'accès au modèle** : « Modèle accessible ». Le test vérifie que votre organisation a
   accès au modèle ; il ne juge pas la qualité, et ne coûte qu'une fraction de centime.
4. Cliquez **Enregistrer**, en bas de la page.

## Résultat

Le modèle rédige les comptes rendus suivants, pour tous les comptes, chez son fournisseur. Les comptes
rendus déjà produits ne changent pas. Les titres des réunions et la détection d'actions gardent leur
propre modèle, chez OpenAI.

## Ce qu'il faut savoir

- **La clé et le modèle s'enregistrent en deux temps**, chacun sur sa page : la clé sur **Clés API**,
  puis le modèle sur **Modèles**. Une clé collée mais pas enregistrée est perdue en changeant de page.
- **La clé Mistral ne se retire pas** tant qu'un modèle Mistral rédige les comptes rendus ou transcrit :
  choisissez d'abord un modèle d'un autre fournisseur.
- **Un modèle imposé par la configuration du serveur**, hors de la liste, y figure quand même, coché et
  signalé. En choisir un dans la liste le remplace, sans retour possible depuis cet écran.
- Pour juger la qualité, générez un même compte rendu avec deux modèles : **Nouveau résumé** sur une
  réunion de test, entre deux changements. C'est particulièrement utile pour les modèles autres que
  **GPT-5.4** : la longueur et la structure des comptes rendus peuvent varier d'un modèle à l'autre.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « OpenAI a refusé ce modèle de rédaction — votre organisation n'y a probablement pas accès. » | Choisissez un autre modèle, ou demandez l'accès chez OpenAI. |
| « Ce modèle a besoin d'une clé Mistral. », et **Clé requise** sur la tuile | **Ajouter la clé Mistral** ouvre la page **Clés API** sur Mistral : collez la clé, puis **Enregistrer**. |
| « Mistral a refusé cette clé. » | Recollez la clé depuis votre console Mistral. |
| « Mistral a refusé ce modèle — votre compte n'y a probablement pas accès. » | Choisissez un autre modèle Mistral, ou vérifiez votre abonnement Mistral. |
| Une pastille rouge, sur **Clés API**, dit « Mistral est choisi pour les comptes rendus, mais sa clé n'est pas enregistrée » | Ajoutez la clé Mistral sur cette page, ou revenez à un modèle OpenAI sur **Modèles**. |
