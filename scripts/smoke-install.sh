#!/usr/bin/env bash
# Installation de bout en bout du kit (kit/), avec les images construites
# depuis ce dépôt et publiées dans un registre local jetable.
#
#   scripts/smoke-install.sh
#
# Rejoue ce que fait un serveur : .env écrit à partir de env.example, refus de
# démarrer sans mot de passe d'amorçage, démarrage complet jusqu'à une API
# saine, puis update.sh vers une seconde version et rollback.sh. C'est le
# chemin que personne n'exécute au quotidien, donc celui qui casse sans qu'on
# le voie.
#
# Prérequis : Docker, ports 80, 443 et 5000 libres (runner GitHub ou poste de
# développement). Tout ce qui est créé est supprimé en sortie. SMOKE_HOTE :
# adresse où joindre les ports publiés (défaut 127.0.0.1 ; depuis un
# conteneur sous Docker Desktop : host.docker.internal).
set -euo pipefail

racine=$(cd "$(dirname "$0")/.." && pwd)
registre=127.0.0.1:5000
v1=0.0.1-smoke
v2=0.0.2-smoke
v3=0.0.3-smoke
projet=mybrief-smoke
hote=${SMOKE_HOTE:-127.0.0.1}
travail=$(mktemp -d)
kit="$travail/kit"
legacy="$travail/legacy"

etape() { printf '\n== %s\n' "$*"; }
echec() { echo "ÉCHEC : $*" >&2; exit 1; }

nettoyer() {
  local code=$?
  if [ -f "$kit/.env" ]; then
    if [ "$code" -ne 0 ]; then
      docker compose --project-directory "$kit" --env-file "$kit/.env" -f "$kit/docker-compose.yml" \
        ps >&2 || true
      docker compose --project-directory "$kit" --env-file "$kit/.env" -f "$kit/docker-compose.yml" \
        logs --tail 100 >&2 || true
    fi
    docker compose --project-directory "$kit" --env-file "$kit/.env" -f "$kit/docker-compose.yml" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  if [ -f "$legacy/.env" ]; then
    docker compose --project-name "$projet" --project-directory "$legacy" \
      --env-file "$legacy/.env" -f "$legacy/docker-compose.yml" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  docker rm -f "$projet-registre" >/dev/null 2>&1 || true
  rm -rf "$travail"
}
trap nettoyer EXIT

etape "Registre local"
docker run -d --name "$projet-registre" -p 127.0.0.1:5000:5000 registry:2.8.3 >/dev/null

etape "Images $v1 et $v2"
for image in web:. api:services/api mobile-auth:services/mobile-auth; do
  nom="$registre/mybrief/${image%%:*}"
  docker build -q -t "$nom:$v1" "$racine/${image#*:}" >/dev/null
  docker tag "$nom:$v1" "$nom:$v2"
  docker push -q "$nom:$v1" >/dev/null
  docker push -q "$nom:$v2" >/dev/null
done
docker tag "$registre/mybrief/web:$v2" "$registre/mybrief/web:$v3"
docker tag "$registre/mybrief/mobile-auth:$v2" "$registre/mybrief/mobile-auth:$v3"
docker build -q -t "$registre/mybrief/api:$v3" - <<EOF >/dev/null
FROM $registre/mybrief/api:$v2
HEALTHCHECK --interval=1s --timeout=2s --start-period=0s --retries=1 CMD exit 1
EOF
for image in web api mobile-auth; do
  docker push -q "$registre/mybrief/$image:$v3" >/dev/null
done

etape "Donnée Mongo dans le volume de l'installation historique"
mkdir -p "$legacy"
cat > "$legacy/docker-compose.yml" <<'EOF'
services:
  mongo:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASS:?MONGO_PASS manquant}
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "-u", "root", "-p", "${MONGO_PASS}", "--authenticationDatabase", "admin", "--eval", "db.adminCommand('ping')"]
      interval: 2s
      timeout: 2s
      retries: 30
volumes:
  mongo_data:
EOF
legacy_pass=$(openssl rand -hex 16)
cat > "$legacy/.env" <<EOF
COMPOSE_PROJECT_NAME=$projet
MONGO_PASS=$legacy_pass
EOF
legacy_compose() {
  docker compose --project-name "$projet" --project-directory "$legacy" \
    --env-file "$legacy/.env" -f "$legacy/docker-compose.yml" "$@"
}

etape "Kit"
cp -R "$racine/kit" "$travail/"
rm -rf "$kit/tests" "$kit/.etat" "$kit/sauvegardes" "$kit/.env"
cp "$kit/env.example" "$kit/.env"
# shellcheck disable=SC2034 # lu par lib/kit.sh
KIT_DIR="$kit"
# shellcheck source=../kit/lib/kit.sh disable=SC1091
. "$kit/lib/kit.sh"
kit_ecrire DOMAIN mybrief.example.test
kit_ecrire REGISTRE "$registre"
kit_ecrire MYBRIEF_VERSION "$v1"
kit_ecrire COMPOSE_PROJECT_NAME "$projet"
kit_ecrire MONGO_PASS "$legacy_pass"
kit_ecrire CONNECTIONS_ENC_KEY "$(openssl rand -hex 32)"
kit_ecrire ADMIN_SEED_PASSWORD ""

etape "Sans mot de passe d'amorçage, l'API refuse de démarrer"
kit_compose up -d --pull missing >/dev/null 2>&1
refus=0
for _ in $(seq 1 30); do
  if kit_compose logs api 2>&1 | grep -q 'ADMIN_SEED_PASSWORD'; then refus=1; break; fi
  sleep 2
done
[ "$refus" = 1 ] || echec "l'API n'a pas signalé l'absence de ADMIN_SEED_PASSWORD"
echo "refus constaté"

etape "Ancienne stack : semer une donnée Mongo"
kit_compose down -v --remove-orphans >/dev/null 2>&1
legacy_compose up -d mongo >/dev/null
legacy_cid=$(legacy_compose ps -q mongo)
for _ in $(seq 1 60); do
  legacy_health=$(docker inspect -f '{{.State.Health.Status}}' "$legacy_cid" 2>/dev/null || true)
  [ "$legacy_health" = healthy ] && break
  sleep 1
done
[ "$legacy_health" = healthy ] || echec "Mongo de l'installation historique n'est pas sain"
# shellcheck disable=SC2016
legacy_compose exec -T mongo mongosh --quiet -u root -p "$legacy_pass" \
  --authenticationDatabase admin mybrief \
  --eval 'db.migration_probe.updateOne({_id: 1}, {$set: {value: 42}}, {upsert: true})' >/dev/null

kit_ecrire ADMIN_SEED_PASSWORD "$(openssl rand -hex 12)"
etape "Conversion directe via update.sh $v1 (version en service)"
VERIFIER_SIGNATURE=0 SANTE_DELAI=180 bash "$kit/update.sh" "$v1" || echec "conversion via update.sh a échoué ($?)"

mongo_eval() {
  # La commande est développée par le shell dans le conteneur Mongo.
  # shellcheck disable=SC2016
  kit_compose exec -T mongo sh -c \
    'exec mongosh --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin mybrief --eval "$1"' \
    sh "$1"
}

mongo_verifier() {
  local valeur
  valeur=$(mongo_eval 'print(db.smoke_validation.findOne({_id: "smoke"}).value)')
  [ "$valeur" = "$1" ] || echec "donnée Mongo inattendue : attendu « $1 », obtenu « $valeur »"
}

legacy_mongo_verifier() {
  local valeur
  valeur=$(mongo_eval 'print(db.migration_probe.findOne({_id: 1}).value)')
  [ "$valeur" = 42 ] || echec "donnée historique Mongo inattendue : attendu 42, obtenu « $valeur »"
}

legacy_mongo_verifier
echo "API saine ; donnée historique présente après la conversion du volume"

etape "Création d'une donnée témoin"
# shellcheck disable=SC2016
mongo_eval 'db.smoke_validation.updateOne({_id: "smoke"}, {$set: {value: "initial"}}, {upsert: true})' >/dev/null

etape "Vérification de l'API après conversion"
code=$(curl -ks -o /dev/null -w '%{http_code}' --connect-to "mybrief.example.test:443:$hote:443" \
  https://mybrief.example.test/api/auth/config)
[ "$code" = 200 ] || echec "https://mybrief.example.test/api/auth/config → $code"
echo "API saine, servie par Traefik"

etape "update.sh $v2"
VERIFIER_SIGNATURE=0 SANTE_DELAI=180 bash "$kit/update.sh" "$v2" || echec "update.sh a échoué ($?)"
[ "$(kit_lire MYBRIEF_VERSION)" = "$v2" ] || echec "MYBRIEF_VERSION n'est pas passée à $v2"
mongo_verifier initial
echo "Donnée Mongo conservée après update"

etape "rollback.sh"
SANTE_DELAI=180 bash "$kit/rollback.sh" || echec "rollback.sh a échoué ($?)"
[ "$(kit_lire MYBRIEF_VERSION)" = "$v1" ] || echec "MYBRIEF_VERSION n'est pas revenue à $v1"
mongo_verifier initial
echo "Donnée Mongo conservée après rollback"

etape "Échec volontaire de $v3 et retour automatique"
VERIFIER_SIGNATURE=0 SANTE_DELAI=180 bash "$kit/update.sh" "$v2" || echec "second update.sh a échoué ($?)"
# shellcheck disable=SC2016
mongo_eval 'db.smoke_validation.updateOne({_id: "smoke"}, {$set: {value: "avant-echec"} })' >/dev/null
set +e
VERIFIER_SIGNATURE=0 SANTE_DELAI=45 SANTE_PAS=1 bash "$kit/update.sh" "$v3"
code=$?
set -e
[ "$code" -eq 1 ] || echec "update cassé devait sortir avec 1, obtenu $code"
[ "$(kit_lire MYBRIEF_VERSION)" = "$v2" ] || echec "la version $v2 n'a pas été restaurée"
SANTE_DELAI=60 kit_attendre_sante || echec "$v2 n'est pas saine après le retour automatique"
mongo_verifier avant-echec
echo "Code 1, version $v2 saine et donnée Mongo restaurée"

etape "Réussi"
