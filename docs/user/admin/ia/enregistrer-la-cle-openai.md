---
title: Enregistrer la clé OpenAI
description: Enregistrer, tester, remplacer ou retirer la clé OpenAI qui fait tourner la transcription, les résumés et la détection d'actions.
sidebar:
  order: 1
---

**Administration → Modèles IA → Clés API**, carte **Fournisseurs d'IA** : cliquez la pastille
**OpenAI** — elle est déjà ouverte quand aucune clé n'est configurée.

## Avant de commencer

Une clé créée sur la plateforme d'OpenAI, pour le compte de votre organisation, avec du crédit.

## Étapes

1. Regardez le badge : **Configurée** ou **Absente**, et la provenance de la clé actuelle — « Clé
   enregistrée depuis cet écran », « Clé fournie par la configuration du serveur », ou « Aucune clé
   configurée ».
2. Cliquez **Remplacer** pour ouvrir le champ — sans clé, il est déjà ouvert — et collez la clé : elle
   commence par `sk-`.
3. Cliquez **Enregistrer**, en bas de la page. La clé est **vérifiée auprès d'OpenAI** avant d'être
   enregistrée : une clé invalide est refusée ici, plutôt que de casser l'application.
4. **Tester la clé** : « Clé valide ».

## Résultat

La clé s'applique aussitôt, pour tous. La ligne OpenAI montre son début et sa fin, et qui l'a
enregistrée ; elle ne quitte jamais le serveur.

## Remplacer, retirer

- **Remplacer** : cliquez **Remplacer**, collez la nouvelle clé et enregistrez.
- **Retirer la clé** : proposé seulement pour une clé enregistrée depuis cet écran. myBrief revient à
  celle de la configuration du serveur, s'il y en a une ; sinon, plus rien n'est transcrit ni généré.

## Ce qu'il faut savoir

- **Une clé enregistrée ici prime** sur celle du serveur.
- **Tout est facturé sur cette clé** : transcription, résumés, détection d'actions, titres, infographies.
  Deux exceptions : la transcription, quand un modèle de Mistral, Speechmatics ou AssemblyAI la fait —
  elle passe alors sur la clé de ce fournisseur (voir
  [Choisir le modèle de transcription](choisir-le-modele-de-transcription.md)) —, et les résumés, quand
  un modèle Mistral les rédige — ils passent sur la clé Mistral (voir
  [Choisir le modèle de rédaction](choisir-le-modele-de-redaction.md)).
  Surveillez son crédit chez OpenAI : épuisé, il bloque toute l'instance.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Cette clé commence par « sk-sk- »… » | Elle a été collée par-dessus un « sk- » : collez la clé entière dans un champ vide. |
| « Cette clé ne ressemble pas à une clé OpenAI… » | Vérifiez que c'est bien une clé OpenAI complète. |
| « OpenAI a refusé cette clé. » | Clé révoquée, erronée ou sans crédit : vérifiez-la chez OpenAI. |
| Vos utilisateurs voient « Crédit d'IA épuisé » | Rechargez le crédit du compte OpenAI de l'organisation. |
