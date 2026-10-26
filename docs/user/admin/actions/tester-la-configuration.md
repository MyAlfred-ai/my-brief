---
title: Tester la configuration
description: Vérifier l'envoi et le dépôt avec les valeurs de l'organisation, puis faire vérifier par un utilisateur.
sidebar:
  order: 5
---

**Administration → Actions** : **Tester l'envoi** dans la carte **Envoyer par mail**, **Tester le
dépôt** dans la carte **Entreposer**.

## Ce que fait le test

Une **exécution réelle**, pas un aperçu : un vrai mail, un vrai fichier `mybrief-test.txt` déposé. Un
aperçu ne dirait pas si le compte est valide, si le dossier existe, si le relais répond.

Le test tourne **avec votre compte** et **les seules valeurs de l'organisation** : vos réglages
personnels sont ignorés. Le mail part donc à vous seul, avec l'objet et le nom de fichier de
l'organisation ; le dépôt va dans le dossier cible de l'organisation.

## Étapes

1. Enregistrez vos réglages.
2. Cliquez **Tester l'envoi** ou **Tester le dépôt**.
3. Lisez le résultat et le diagnostic : transport, expéditeur, destinataires, objet, fournisseur,
   dossier, fichier.

## Ce qu'il faut savoir

- **Tester l'envoi** est grisé sans relais d'envoi sur le serveur, même si vous avez relié votre
  compte : testez alors depuis **Ma configuration → Envoi d'email**.
- **Tester le dépôt** est grisé sans fournisseur. Il demande que votre propre compte soit relié.
- **Dix tests par heure** au plus.
- Le fichier de test déposé n'est pas supprimé : effacez-le vous-même.

## Faire vérifier par un utilisateur

Votre test ne prouve pas que tout fonctionne **pour lui** : il n'utilise ni ses destinataires, ni son
dossier, ni ses tags. Après chaque changement important, demandez à un utilisateur de lancer **Tester
l'envoi** et **Tester le dépôt** depuis **Ma configuration** — voir
[Tester l'envoi et le dépôt](../../fonctionnalites/actions/tester-l-envoi-et-le-depot.md).
