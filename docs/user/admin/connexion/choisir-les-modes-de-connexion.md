---
title: Choisir les modes de connexion
description: Afficher ou masquer le mot de passe, Google, Microsoft et le SSO historique sur la page de connexion, et tester chaque mode.
sidebar:
  order: 1
---

**Administration → Organisation → Authentification**, carte **Page de connexion** : une pastille par
mode — **Email et mot de passe**, **Google**, **Microsoft** et, s'il existe encore, **SSO historique**.

## Étapes

1. Cliquez la pastille du mode : son détail se déplie sous la ligne de pastilles.
2. Basculez **Proposer sur la page de connexion**. Google et Microsoft demandent aussi leurs
   identifiants — voir [Activer la connexion Google](activer-la-connexion-google.md) et
   [Activer Microsoft Entra ID](activer-microsoft-entra-id.md).
3. Cliquez **Enregistrer**, en bas de la page.
4. Dépliez chaque mode affiché et cliquez **Tester**.

## Résultat

Chaque pastille porte un point vert quand le mode est **Affiché**, un point creux quand il est **Masqué**,
d'après l'état réel du serveur après enregistrement ; la carte les compte, par exemple « 3 sur 4
affichés ». Vos utilisateurs ne voient que les modes affichés. Avant l'enregistrement, la pastille
porte **Modifié**.

## Tester

**Tester** joue le vrai parcours de connexion dans un nouvel onglet ; il reste grisé tant que le mode
est masqué. Si vous le terminez avec un autre compte que le vôtre, **votre session bascule sur ce
compte** : testez avec votre propre compte, ou dans une fenêtre de navigation privée — l'ⓘ à côté du
bouton le rappelle. Le mot de passe n'a pas de bouton **Tester** : déconnectez-vous pour le voir.

## Ce qu'il faut savoir

- **Au moins un mode doit rester affiché** : sinon, le bouton **Enregistrer** se grise et l'avertissement
  « Au moins un mode de connexion doit rester affiché… » s'affiche.
- **Gardez le mot de passe pour un compte de secours** : si Google ou Microsoft deviennent indisponibles,
  c'est le seul moyen d'entrer.
- **« Désactivé par la configuration du déploiement »** sur le mot de passe : le serveur l'interdit ;
  demandez à MyAlfred de le rouvrir si besoin.
- **Le SSO historique** fonctionne en parallèle de la connexion native. Masquez-le une fois le passage à
  Google ou Microsoft fait et testé : la page n'en sera que plus claire.
- **Mot de passe oublié ?** n'apparaît que si le mot de passe est affiché et que le serveur sait envoyer
  des mails.
