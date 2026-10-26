---
title: Restreindre aux domaines autorisés
description: Décider quelles adresses obtiennent un compte à leur première connexion par Google ou par Microsoft.
sidebar:
  order: 4
---

**Administration → Authentification**, carte **Domaines autorisés**.

## Comment ça marche

Une personne qui se connecte **pour la première fois** par **Google** ou par **Microsoft** obtient un
compte si le domaine de son adresse figure dans la liste. Sinon, elle est refusée : « Votre domaine
email n'est pas autorisé sur cette application. Contactez un administrateur. »

- **Le domaine doit correspondre exactement** : autoriser *exemple.fr* n'autorise pas
  *filiale.exemple.fr*. Ajoutez chaque domaine.
- **Par Microsoft, deux adresses comptent** : l'adresse email du profil et l'identifiant avec lequel la
  personne se connecte — le nom d'utilisateur principal de l'annuaire, souvent le même. L'une des deux
  dans un domaine autorisé suffit, et le compte prend celle-là, l'adresse email d'abord. Un profil sans
  adresse email entre par son identifiant.
- **Un compte qui existe déjà entre**, quel que soit son domaine — par Microsoft, sous l'une ou l'autre
  adresse : la liste ne décide que des créations.
- **Un compte désactivé reste fermé**, même si la personne se présente sous son autre adresse Microsoft.
- **Liste vide** : personne ne peut créer de compte par Google ou Microsoft. Les comptes que vous créez à
  la main fonctionnent toujours.

## Étapes

1. Tapez le domaine — *exemple.fr* ; un « @ » ou une adresse web collés sont nettoyés.
2. Cliquez **Ajouter** pour en taper un autre. Le dernier domaine tapé est enregistré même sans ce clic.
3. Cliquez **Enregistrer**, en bas de l'onglet.

**Retirer le domaine** l'enlève de la liste : les comptes déjà créés restent.

## Exemples

**Une seule organisation.** *exemple.fr* : tout salarié entre avec son compte professionnel.

**Un groupe et ses filiales.** *groupe.fr*, *filiale-a.fr*, *filiale-b.fr*.

**Une messagerie de marque.** Adresses email en *marque.fr*, connexion Microsoft en *groupe.fr* :
autoriser *groupe.fr* suffit, les comptes se créent sous l'identifiant de connexion.

**Accès sur invitation.** Liste vide : vous créez chaque compte à la main, même pour ceux qui entreront
ensuite par Google ou Microsoft.

## Vérifier

Avec une adresse d'un domaine autorisé qui n'a pas encore de compte, **Continuer avec Google** ou
**Continuer avec Microsoft** : le compte se crée, avec le rôle **Utilisateur**.
