---
title: Mettre à jour myBrief
description: Sauvegarder la base, puis installer la dernière version de myBrief sur le serveur, en gardant la configuration et les données.
sidebar:
  order: 4
---

Une nouveauté de myBrief n'arrive chez vos utilisateurs qu'avec la mise à jour de l'installation.
L'installeur la fait sur le serveur : il télécharge la dernière version, redémarre myBrief dessus et
vérifie qu'il répond. La configuration et les données restent en place.

## Avant de commencer

- Un terminal sur le serveur, dans le dossier de l'installation : `install`, dans le dossier de
  myBrief.
- La version installée : le numéro affiché en bas à droite de l'écran de myBrief — sur téléphone, en
  bas du menu —, qui ouvre aussi **Quoi de neuf ?**. La dernière version disponible, et ce que chaque version apporte, sont dans la
  page **Nouveautés** de cette documentation.
- Un moment sans réunion en cours d'enregistrement : myBrief s'interrompt le temps de redémarrer.

## Étapes

1. Sauvegardez la base — la mise à jour ne le fait pas :

   ```bash
   bash install.sh backup
   ```

   Attendez « sauvegarde écrite : backups/… », suivi du nom du fichier et de sa taille.
2. Lancez la mise à jour :

   ```bash
   bash install.sh update
   ```

   Ou relancez `bash install.sh` et choisissez **Mettre à jour** dans son menu.
3. Suivez-la : elle télécharge les images de la dernière version, redémarre les services dont l'image a
   changé, attend « API démarrée », puis vérifie que l'adresse répond en HTTPS.

## Résultat

« mise à jour terminée ». Le numéro en bas à droite de l'écran de myBrief (en bas du menu sur
téléphone) est celui de la dernière version ; rechargez la page s'il n'a pas bougé. L'application Android suit d'elle-même : elle affiche
toujours la version du serveur.

## Cas particuliers

- **Ce qui est gardé** : le fichier `.env`, et toutes les données — comptes, réunions, comptes rendus,
  templates —, rangées dans la base, que la mise à jour ne touche pas.
- **Revenir à la version précédente n'est pas possible aujourd'hui** : seule la dernière version est
  publiée. Si une mise à jour pose problème, prévenez MyAlfred.
- **Restaurer la sauvegarde** de l'étape 1 remet la base dans son état d'avant. **Tout ce qui a été
  créé depuis est perdu** : réunions, comptes rendus, réglages. Dans le dossier de l'installation :

  ```bash
  set -a; . ./.env; set +a
  docker compose exec -T mongo mongorestore --archive --gzip --drop \
    -u root -p "$MONGO_PASS" --authenticationDatabase admin < backups/<fichier>.archive.gz
  ```

- **La version suivie** se règle dans `.env`, par `MYBRIEF_IMAGE_TAG` : `main`, la dernière version,
  est la seule publiée.
- **Sans question** : `bash install.sh backup` puis `bash install.sh update` se lancent aussi depuis
  une tâche planifiée.

La référence complète — sauvegarde, restauration, vérifications — est dans le dépôt :
`install/readme.md`.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « aucun .env ici — installer d'abord : bash install.sh » | Vous n'êtes pas dans le dossier de l'installation. Placez-vous dans `install`, dans le dossier de myBrief, puis relancez. Rien n'a été modifié. |
| Le téléchargement des images est refusé | Le serveur n'atteint pas le registre `ghcr.io` (réseau, proxy, pare-feu). Les images sont publiques : aucune connexion n'est nécessaire. Rétablissez l'accès, puis relancez. myBrief tourne toujours sur l'ancienne version. |
| « l'API ne devient pas saine — presque toujours une variable manquante dans .env (journaux ci-dessus) » | La nouvelle version attend un réglage que `.env` n'a pas : les journaux affichés juste au-dessus le nomment. Complétez `.env` — la liste des réglages est dans le dépôt, `install/env.example` —, puis `docker compose up -d`. |
| « … ne répond pas encore avec un certificat valide » | Les services ont redémarré, l'adresse ne répond pas encore. Quelques instants plus tard : `bash install.sh status`. Toujours rien : `bash install.sh logs traefik`. |
| Le numéro de version n'a pas changé | Rechargez la page. S'il ne bouge toujours pas, la mise à jour ne s'est pas terminée : relisez ce qu'elle a affiché. |
