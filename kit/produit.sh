# shellcheck shell=bash
# Particularités de MyBrief pour le moteur commun du kit (lib/kit.sh).
# Les variables ci-dessous sont lues par lib/kit.sh.
# shellcheck disable=SC2034

PRODUIT=mybrief
PRODUIT_DEPOT=MyAlfred-ai/my-brief
VERSION_VAR=MYBRIEF_VERSION
PRODUIT_IMAGES="mybrief/api mybrief/web mybrief/mobile-auth"
PRODUIT_VARIABLES="COMPOSE_PROJECT_NAME MYBRIEF_VERSION MONGO_PASS CONNECTIONS_ENC_KEY"
# Trois images (~600 Mo) + une sauvegarde Mongo, avec de la marge.
PRODUIT_TAILLE_MO=2000

# Sauvegarde logique de MongoDB, plus le .env : sans lui, CONNECTIONS_ENC_KEY
# est perdue et les comptes reliés deviennent illisibles. Le mot de passe est
# lu DANS le conteneur, il n'apparaît pas dans la liste des processus.
produit_sauvegarder() {
  local dossier=$1
  # shellcheck disable=SC2016 # développé DANS le conteneur, volontairement
  kit_compose exec -T mongo sh -c \
    'exec mongodump --archive --gzip --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
    > "$dossier/mongo.archive.gz" || return 1
  # Une archive vide signale un mongodump qui n'a rien écrit.
  [ -s "$dossier/mongo.archive.gz" ] || return 1
  cp "$KIT_ENV" "$dossier/env.sauvegarde" && chmod 600 "$dossier/env.sauvegarde"
}

produit_restaurer() {
  local dossier=$1
  [ -s "$dossier/mongo.archive.gz" ] || return 1
  kit_compose stop api || return 1
  # shellcheck disable=SC2016 # développé DANS le conteneur, volontairement
  kit_compose exec -T mongo sh -c \
    'exec mongorestore --archive --gzip --drop --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
    < "$dossier/mongo.archive.gz" || return 1
  kit_compose start api
}

# Saine quand le contrôle de santé Docker de l'API (services/api/Dockerfile)
# répond « healthy ».
produit_sante() {
  local cid
  cid=$(kit_compose ps -q api 2>/dev/null) || return 1
  [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = healthy ]
}
