---
title: Choisir les modes de connexion
description: Afficher ou masquer le mot de passe, Google, Microsoft et le SSO historique sur la page de connexion, et tester chaque mode.
sidebar:
  order: 1
---

**Administration → Authentification**, carte **Page de connexion**.

## Étapes

1. Pour **Email et mot de passe** et **SSO historique (plugin Traefik)**, basculez **Afficher**.
2. Pour Google et Microsoft, activez-les dans leur propre carte — voir
   [Activer la connexion Google](activer-la-connexion-google.md) et
   [Activer Microsoft Entra ID](activer-microsoft-entra-id.md).
3. Cliquez **Enregistrer**, en bas de l'onglet.
4. Cliquez **Tester** sur chaque mode affiché.

## Résultat

Chaque ligne affiche **Affiché** ou **Masqué**, d'après l'état réel du serveur après enregistrement. Vos
utilisateurs ne voient que les modes affichés.

## Tester

**Tester** joue le vrai parcours de connexion dans un nouvel onglet. Si vous le terminez avec un autre
compte que le vôtre, **votre session bascule sur ce compte** : testez avec votre propre compte, ou dans
une fenêtre de navigation privée.

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
