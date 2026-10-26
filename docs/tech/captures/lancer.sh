#!/usr/bin/env bash
# myBrief en local, sur une base jetable remplie de données fictives : l'état dont partent les
# captures de la documentation utilisateur (voir README.md, à côté). Ctrl+C arrête tout ; la base,
# en mémoire, disparaît avec son conteneur.
set -euo pipefail
cd "$(dirname "$0")/../../.."

API_PORT="${CAPTURE_API_PORT:-3100}"
WEB_PORT="${CAPTURE_WEB_PORT:-5174}"
MONGO_PORT="${CAPTURE_MONGO_PORT:-27018}"
MONGO_NOM="mybrief-captures-mongo"
export MONGO_URL="mongodb://root:captures@127.0.0.1:${MONGO_PORT}/mybrief?authSource=admin"

# Un lanceur tué sans Ctrl+C laisse sa base derrière lui : on l'arrête avant d'en créer une
# autre (--rm : arrêtée, elle s'efface).
docker stop "$MONGO_NOM" >/dev/null 2>&1 || true
# Ports à part de la pile de dev (3000, 27017) : les deux tournent côte à côte sans se mélanger.
docker run -d --rm --name "$MONGO_NOM" -p "127.0.0.1:${MONGO_PORT}:27017" \
  -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=captures \
  --tmpfs /data/db mongo:7.0 >/dev/null
API=""
VITE=""
arreter() {
  trap - EXIT INT TERM
  [ -n "$VITE" ] && kill "$VITE" 2>/dev/null
  [ -n "$API" ] && kill "$API" 2>/dev/null
  docker stop "$MONGO_NOM" >/dev/null 2>&1 || true
}
trap arreter EXIT INT TERM

until docker exec "$MONGO_NOM" mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do sleep 1; done

# OPENAI_API_KEY VIDE, pas factice : sans clé, tout appel d'IA répond 503 avant de sortir sur le
# réseau (services/api/lib/openai.js) ; une clé factice, elle, partirait chez OpenAI.
# LEGACY_ADMIN_DOMAIN vide : l'identité simulée de vite.config.local.js est en @myalfred.ai.
(cd services/api && exec env MONGO_DB=mybrief PORT="$API_PORT" LOG_LEVEL=warn COOKIE_SECURE=false \
  OPENAI_API_KEY= SMTP_HOST= ADMIN_SEED_ENABLED=false ADMIN_EMAILS= ADMIN_EMAIL_DOMAINS= \
  LEGACY_ADMIN_DOMAIN= APP_PUBLIC_URL="http://localhost:${WEB_PORT}" node server.js) &
API=$!

# L'API n'écoute qu'une fois ses index créés : les données peuvent entrer dès qu'elle répond.
until (echo > "/dev/tcp/127.0.0.1/${API_PORT}") 2>/dev/null; do sleep 1; done
node docs/tech/captures/donnees-fictives.mjs

# Vite en arrière-plan et `wait` : un signal d'arrêt est traité tout de suite, et la base
# s'arrête avec le reste.
CAPTURE_API_PORT="$API_PORT" node_modules/.bin/vite --config docs/tech/captures/vite.config.mjs \
  --port "$WEB_PORT" --strictPort --host 127.0.0.1 &
VITE=$!
wait "$VITE"
