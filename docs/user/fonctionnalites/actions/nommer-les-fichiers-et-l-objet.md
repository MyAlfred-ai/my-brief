---
title: Nommer les fichiers et l'objet du mail
description: Donner à vos mails un objet et à vos fichiers un nom qui disent de quelle réunion il s'agit, grâce à des variables.
sidebar:
  order: 4
---

L'objet des mails et le nom des fichiers se composent une fois pour toutes, avec du texte et des
variables que myBrief remplace à chaque envoi.

## Étapes

1. Ouvrez **Ma configuration → Envoi d'email** pour l'**Objet du mail**, ou **Entreposer** : la carte
   **Nom des fichiers** est la même sur les deux pages.
2. Tapez le texte ; cliquez une variable pour l'insérer à l'endroit du curseur.
3. Vérifiez l'**Aperçu**, calculé avec des valeurs d'exemple.
4. Cliquez **Enregistrer**.

## Les variables

| Variable | Remplacée par |
|---|---|
| `{{titre}}` | Le titre de la réunion |
| `{{date}}` | Le jour de l'envoi ou du dépôt, sous la forme 2026-09-10 |
| `{{type}}` | « Résumé » ou « Transcription » |
| `{{compte}}` | Votre adresse de connexion à myBrief |

Une variable inconnue est refusée à l'enregistrement : « Variables inconnues : … ».

## Exemples

| Réglage | Donne |
|---|---|
| Objet `CR {{titre}} — {{date}}` | CR Point client Dupont — 2026-09-10 |
| Objet `[{{type}}] {{titre}}` | [Résumé] Point client Dupont |
| Nom de fichier `{{date}}-{{titre}}` | `2026-09-10-point-client-dupont.pdf` |
| Nom de fichier `cr-{{titre}}` | `cr-point-client-dupont.txt` pour une transcription |

## Ce qu'il faut savoir

- **Le nom de fichier est simplifié** : minuscules, sans accents, espaces et signes remplacés par des
  tirets, 80 caractères au plus. L'extension — `.pdf` ou `.txt` — s'ajoute seule.
- **L'objet** fait 200 caractères au plus.
- **Laissés vides**, l'objet et le nom suivent le format de votre organisation, sinon celui de myBrief :
  « Résumé — titre de la réunion » et `2026-09-10-titre-de-la-reunion.pdf`.
- **Où l'objet s'applique** : aux mails envoyés par myBrief et, sur téléphone, au mail préparé par
  **Rédiger dans ma messagerie**.
- **Où le nom s'applique** : aux fichiers envoyés et déposés, et à la transcription téléchargée. Le
  **PDF téléchargé** garde son nom `mybrief_resume_…`.
- **Le titre de la réunion** est rédigé dans les secondes qui suivent la génération du résumé : un
  envoi fait plus tôt garde un objet et un nom génériques.
