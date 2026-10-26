---
title: Faire les réglages de base
description: Prendre la main sur une instance neuve — votre mot de passe, la clé OpenAI, la connexion, les comptes et le vocabulaire, dans l'ordre.
sidebar:
  order: 3
---

Juste installé, myBrief répond, mais personne ne peut encore s'en servir : il n'a qu'un compte, au mot
de passe provisoire, et pas forcément de clé d'IA. Ces réglages se font dans l'administration, sans
toucher au serveur. Chaque étape renvoie à sa page pour le détail.

## Avant de commencer

- myBrief installé : [Installer myBrief sur le serveur](installer-mybrief-sur-le-serveur.md).
- L'adresse du premier administrateur et le mot de passe provisoire, tiré au hasard par l'installeur
  et donné par son résumé de fin d'installation.
- La clé OpenAI de l'organisation, si elle n'a pas été donnée à l'installation.

## Étapes

1. **Connectez-vous tout de suite.** Ouvrez l'adresse de myBrief, saisissez l'adresse du premier
   administrateur et le mot de passe provisoire du résumé, puis **Se connecter**. Ce mot de passe est
   resté affiché dans le terminal et écrit dans `.env` : tant qu'il n'est pas remplacé, qui l'a vu
   peut prendre le compte.
2. **Choisissez votre mot de passe.** La fenêtre « Choisissez votre mot de passe » s'ouvre d'office et
   ne se ferme pas avant : **Mot de passe actuel** — le provisoire, celui du résumé —, **Nouveau mot
   de passe**, au moins 10 caractères, sans votre adresse, **Confirmer le nouveau mot de passe**, puis
   **Enregistrer**.
3. **Enregistrez la clé OpenAI** : votre nom, en bas de la colonne de gauche — votre avatar, en haut
   à droite, sur téléphone —, puis **Administration** et l'onglet **IA**. Sans elle, ni transcription, ni résumé, ni détection d'actions.
   → [Enregistrer la clé OpenAI](../ia/enregistrer-la-cle-openai.md)
4. **Ouvrez la connexion** : l'onglet **Authentification** — mot de passe, Google, Microsoft — et les
   domaines de l'organisation. Gardez au moins un compte administrateur qui entre par mot de passe.
   → [La connexion](../connexion/index.md)
5. **Créez les premiers comptes**, ou laissez les domaines autorisés les créer à la première connexion,
   dans l'onglet **Utilisateurs**. Donnez le rôle **Administrateur** à une deuxième personne : avec un
   seul compte administrateur, sa perte ferme l'administration à tous, et seul le serveur la rouvre.
   → [Gérer les comptes](../utilisateurs/gerer-les-comptes.md)
6. **Renseignez le vocabulaire de l'organisation** — clients, produits, sigles — dans l'onglet
   **Configuration**. L'IA s'en sert pour les comptes rendus et la détection d'actions.
   → [Renseigner le vocabulaire de l'organisation](../configuration/renseigner-le-vocabulaire-de-l-organisation.md)
7. **Donnez à myBrief les couleurs de l'organisation** : logo, phrase d'accueil, couleurs, dans le
   même onglet. → [Personnaliser l'apparence](../configuration/personnaliser-l-apparence.md)
8. **Vérifiez avec un compte de test** : une courte réunion, son résumé, un envoi par mail.

## Résultat

La page de connexion propose les modes choisis, les comptes existent, et la réunion de test a sa
transcription et son résumé. L'instance est en service.

Votre nom ne porte plus de pastille rouge ni orange : il ne reste rien de cassé ni de proposé en vain.
Les pastilles bleues sont des conseils — voir [Administration](../index.md), « Les pastilles ».

## Ensuite

- **Les actions après réunion** : le compte relié qui envoie les mails et dépose les fichiers, et les
  boutons proposés. → [Les actions après réunion](../actions/index.md)
- **Les templates** : adapter ceux qui sont fournis à vos usages, et créer ceux de l'organisation.
  → [Les templates](../templates/index.md)
- **Les appareils** : dire aux utilisateurs comment mettre myBrief sur leur téléphone et dans Chrome.
  → [Installer myBrief sur ses appareils](../../fonctionnalites/installer-mybrief-sur-ses-appareils.md)

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Adresse email ou mot de passe incorrect. » avec le mot de passe provisoire | Vérifiez-le d'abord dans `.env`, sur le serveur, à la ligne `ADMIN_SEED_PASSWORD`. S'il est juste, le compte d'amorçage n'a pas été créé — la base contenait déjà des comptes —, ou son mot de passe a déjà été changé. Désignez l'administrateur sur le serveur : `ADMIN_EMAILS`, voir [Installer myBrief sur le serveur](installer-mybrief-sur-le-serveur.md), « Les réglages du serveur ». |
| **Administration** n'apparaît pas dans le menu de compte | Le compte n'a pas le rôle **Administrateur**. Même remède : `ADMIN_EMAILS` sur le serveur. |
| « Le mot de passe doit faire au moins 10 caractères. » | Choisissez-en un plus long. Il ne doit pas non plus contenir votre adresse, ni être trop courant. |
| Transcription et résumé refusés, avec un message qui dit où régler la clé | Aucune clé OpenAI n'est enregistrée : étape 3. |
| Le lien **Mot de passe oublié ?** est absent de la page de connexion | Aucun serveur d'envoi de mails n'est renseigné : c'est un réglage du serveur. En attendant, un administrateur réinitialise le mot de passe — voir [Réinitialiser un mot de passe](../utilisateurs/reinitialiser-un-mot-de-passe.md). |
