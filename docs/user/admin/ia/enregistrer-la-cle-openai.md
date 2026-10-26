---
title: Enregistrer la clé OpenAI
description: Enregistrer, tester, remplacer ou retirer la clé OpenAI qui fait tourner la transcription, les résumés et la détection d'actions.
sidebar:
  order: 1
---

**Administration → IA**, carte **Clé API OpenAI**.

## Avant de commencer

Une clé créée sur la plateforme d'OpenAI, pour le compte de votre organisation, avec du crédit.

## Étapes

1. Regardez le badge : **Configurée** ou **Absente**, et la provenance de la clé actuelle — « Clé
   enregistrée depuis cet écran », « Clé fournie par la configuration du serveur », ou « Aucune clé
   configurée ».
2. Collez la clé dans **Nouvelle clé** — elle commence par `sk-`.
3. Cliquez **Enregistrer**, en bas de l'onglet. La clé est **vérifiée auprès d'OpenAI** avant d'être
   enregistrée : une clé invalide est refusée ici, plutôt que de casser l'application.
4. **Tester la clé** : « Clé valide ».

## Résultat

La clé s'applique aussitôt, pour tous. La carte montre son début et sa fin, et qui l'a enregistrée ;
elle ne quitte jamais le serveur.

## Remplacer, retirer

- **Remplacer** : collez la nouvelle clé dans **Nouvelle clé** et enregistrez.
- **Retirer la clé** : proposé seulement pour une clé enregistrée depuis cet écran. myBrief revient à
  celle de la configuration du serveur, s'il y en a une ; sinon, plus rien n'est transcrit ni généré.

## Ce qu'il faut savoir

- **Une clé enregistrée ici prime** sur celle du serveur.
- **Tout est facturé sur cette clé** : transcription, résumés, détection d'actions, titres, infographies.
  Surveillez son crédit chez OpenAI : épuisé, il bloque toute l'instance.
- **L'infographie** demande que votre organisation soit vérifiée chez OpenAI.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Cette clé commence par « sk-sk- »… » | Elle a été collée par-dessus un « sk- » : collez la clé entière dans un champ vide. |
| « Cette clé ne ressemble pas à une clé OpenAI… » | Vérifiez que c'est bien une clé OpenAI complète. |
| « OpenAI a refusé cette clé. » | Clé révoquée, erronée ou sans crédit : vérifiez-la chez OpenAI. |
| Vos utilisateurs voient « Crédit d'IA épuisé » | Rechargez le crédit du compte OpenAI de l'organisation. |
