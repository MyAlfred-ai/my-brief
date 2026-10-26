---
title: Régler l'envoi par mail
description: Fixer le nombre de destinataires, décider si le relais du serveur peut écrire à des tiers, et donner l'objet des mails par défaut.
sidebar:
  order: 3
---

**Administration → Actions**, carte **Envoyer par mail**.

## Les réglages

| Réglage | Effet | Par défaut |
|---|---|---|
| **Destinataires maximum** | Le nombre d'adresses qu'un utilisateur peut ajouter à la sienne, pour sa liste par défaut comme pour chaque liste de tag. Jamais plus de 20 | 10 |
| **Autoriser le relais du serveur à écrire à des tiers** | Sans compte relié, les mails partent du relais du serveur. Désactivé, ils ne partent qu'à leur auteur ; activé, à toute la liste, avec l'auteur en « répondre à » | Désactivé |
| **Objet du mail** | L'objet quand l'utilisateur n'a rien réglé, avec les variables `{{titre}}`, `{{date}}`, `{{type}}`, `{{compte}}`. Vide, myBrief garde son format habituel | Vide |

Cliquez **Enregistrer**, en bas de la page.

## Le relais vers des tiers

Un mail envoyé par le relais part d'une adresse de votre domaine d'envoi, pas de la boîte de
l'utilisateur. Écrire à des destinataires externes engage alors la réputation de ce domaine. N'activez
ce réglage que si le relais de votre installation sort vers Internet et que votre domaine l'autorise.

Désactivé, l'envoi n'échoue pas : il part à son seul auteur, et l'utilisateur en est prévenu. Le mieux
reste que chacun relie son compte : ses mails partent alors de sa propre boîte, à toute sa liste.

## Ce qu'il faut savoir

- **Baisser le plafond** raccourcit les listes existantes : les premières adresses sont gardées.
- **Les destinataires par tag** remplacent la liste par défaut de l'utilisateur pour les réunions
  taguées ; le plafond s'applique à chaque liste.
- **L'adresse de l'utilisateur est toujours en copie**, et ne compte pas dans le plafond.
- Une valeur de 0 est ramenée à 10.
