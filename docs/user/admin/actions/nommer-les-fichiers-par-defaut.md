---
title: Nommer les fichiers par défaut
description: Donner aux documents envoyés et déposés un nom cohérent pour toute l'organisation, quand l'utilisateur n'a rien réglé.
sidebar:
  order: 4
---

**Administration → Actions**, carte **Nom des fichiers par défaut**.

## Étapes

1. Tapez le format ; cliquez une variable pour l'insérer : `{{titre}}`, `{{date}}`, `{{type}}`,
   `{{compte}}`.
2. Cliquez **Enregistrer**.

Exemple : `{{date}}-{{titre}}` donne `2026-09-10-point-client-dupont.pdf`.

## Ce qu'il faut savoir

- **Le nom est simplifié** : minuscules, sans accents, espaces et signes remplacés par des tirets, 80
  caractères au plus. L'extension — `.pdf` ou `.txt` — s'ajoute seule et ne se choisit pas.
- **Il s'applique aux documents envoyés et déposés** quand l'utilisateur n'a pas réglé le sien. Le
  téléchargement ne l'utilise pas : le PDF téléchargé garde son nom `mybrief_resume_…`, la transcription
  téléchargée suit le format de l'utilisateur ou le nom intégré.
- **Vide**, myBrief nomme les fichiers avec la date et le titre de la réunion.
- **Une variable inconnue** est refusée ; le message d'erreur n'est pas explicite : vérifiez
  l'orthographe des variables.

La même logique vaut pour l'**Objet du mail** — voir [Régler l'envoi par mail](regler-l-envoi-par-mail.md).
