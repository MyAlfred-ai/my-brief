#!/usr/bin/env bash
#
# Retrouver — et récupérer — des données restées dans un ANCIEN volume Mongo.
#
# Symptôme : l'application démarre normalement mais l'historique est vide, alors
# que les données existaient. Cause habituelle : le nom de projet compose a
# changé (dossier renommé, `-p` différent, passage de `docker/` à `install/`),
# et Docker a créé un volume NEUF. Rien n'est perdu — tout est resté dans
# l'ancien volume, que plus personne ne monte.
#
#   ssh ubuntu@<serveur> 'bash -s' < kit/recover-mongo-volume.sh
#   ssh ubuntu@<serveur> 'bash -s' -- --restore ubuntu_mongo_data < kit/recover-mongo-volume.sh
#
# ── Sans option : INSPECTION, strictement en lecture seule ──────────────────
# Chaque volume candidat est COPIÉ dans un volume temporaire, et c'est la copie
# qu'un mongod jetable ouvre. Le volume d'origine est monté `:ro` et n'est
# jamais ouvert par un serveur : ouvrir directement une base d'une version
# antérieure la ferait migrer sur place, de façon irréversible. La copie et le
# conteneur jetable sont supprimés à la fin, y compris en cas d'interruption.
#
# ── Avec --restore : ÉCRITURE, sur confirmation explicite ───────────────────
# Un `mongodump` est pris depuis la copie et versé dans la base en service
# SANS `--drop` : rien de ce qui existe n'est écrasé, les documents manquants
# sont ajoutés. L'archive est conservée sur le disque — c'est la sauvegarde.
# L'API est redémarrée ensuite pour rejouer index et normalisations.
set -uo pipefail

RESTORE_FROM=""
PROJECT=""
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --restore) RESTORE_FROM="${2:-}"; shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --yes)     ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,28p' "$0" 2>/dev/null || echo "voir l'en-tête du fichier"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    echo "✗ le démon Docker ne répond pas (ou droits insuffisants)" >&2; exit 1
  fi
fi

# Image déjà présente sur l'hôte (celle de la stack) : aucun téléchargement, et
# `sh`/`cp` y sont disponibles pour la copie de volume.
MONGO_IMAGE="${MONGO_IMAGE:-mongo:7.0}"
TMP_VOL=""
TMP_CID=""

cleanup() {
  [ -n "$TMP_CID" ] && $DOCKER rm -f "$TMP_CID" >/dev/null 2>&1
  [ -n "$TMP_VOL" ] && $DOCKER volume rm "$TMP_VOL" >/dev/null 2>&1
  TMP_CID=""; TMP_VOL=""
}
# Interruption comprise : ne jamais laisser derrière soi une copie de la base,
# qui contient les mêmes données que l'originale.
trap cleanup EXIT INT TERM

find_service() {
  local svc="$1"
  local filter
  filter=(--filter "label=com.docker.compose.service=$svc")
  [ -n "$PROJECT" ] && filter+=(--filter "label=com.docker.compose.project=$PROJECT")
  $DOCKER ps -q "${filter[@]}" 2>/dev/null | head -1
}

container_env() {
  $DOCKER inspect -f "{{range .Config.Env}}{{println .}}{{end}}" "$1" 2>/dev/null \
    | grep -E "^$2=" | head -1 | cut -d= -f2-
}

# Volume actuellement monté par la stack : c'est la CIBLE, jamais un candidat.
LIVE_CID="$(find_service mongo)"
LIVE_VOL=""
if [ -n "$LIVE_CID" ]; then
  LIVE_VOL=$($DOCKER inspect "$LIVE_CID" \
    --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}' 2>/dev/null)
fi

# ── Ouvre une COPIE d'un volume et laisse un mongod jetable dessus ──────────
open_copy() { # open_copy <volume source> -> renseigne TMP_CID
  local src="$1"
  TMP_VOL="mybrief-recover-$$-$(date +%s)"
  echo "  copie du volume (l'original reste en lecture seule)…"
  $DOCKER volume create "$TMP_VOL" >/dev/null || return 1
  $DOCKER run --rm -v "$src":/from:ro -v "$TMP_VOL":/to "$MONGO_IMAGE" \
    sh -c 'cp -a /from/. /to/ 2>/dev/null || true' >/dev/null 2>&1

  # `mongod` SANS --auth : les identifiants de l'ancienne base sont inconnus
  # (ils venaient d'un .env révolu). Sans port publié ni réseau, la seule voie
  # d'accès est `docker exec` depuis cet hôte.
  TMP_CID=$($DOCKER run -d --network none -v "$TMP_VOL":/data/db "$MONGO_IMAGE" \
    mongod --dbpath /data/db --bind_ip 127.0.0.1 2>/dev/null)
  [ -n "$TMP_CID" ] || return 1

  local _
  for _ in $(seq 1 30); do
    if $DOCKER exec "$TMP_CID" mongosh --quiet --eval 'db.adminCommand("ping").ok' </dev/null 2>/dev/null | grep -q 1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

tmp_eval() {
  $DOCKER exec "$TMP_CID" mongosh --quiet --eval "$1" </dev/null 2>/dev/null
}

inventory() { # inventaire lisible des bases applicatives d'un mongod jetable
  tmp_eval '
    const interessant = ["resume", "user", "userTemplates", "userConfig"];
    const out = [];
    for (const d of db.adminCommand({listDatabases: 1}).databases) {
      if (["admin", "config", "local"].includes(d.name)) continue;
      const base = db.getSiblingDB(d.name);
      const cols = {};
      for (const c of base.getCollectionNames()) {
        const n = base.getCollection(c).countDocuments({});
        if (n > 0 || interessant.includes(c)) cols[c] = n;
      }
      out.push({ base: d.name, collections: cols });
    }
    JSON.stringify(out, null, 2);'
}

# ── Inspection ──────────────────────────────────────────────────────────────
if [ -z "$RESTORE_FROM" ]; then
  echo "=============================================================="
  echo " Volumes Mongo de cet hôte — inspection en LECTURE SEULE"
  echo "=============================================================="
  echo "monté par la stack en service : ${LIVE_VOL:-aucun}"
  echo

  VOLUMES=$($DOCKER volume ls --format '{{.Name}}' 2>/dev/null | grep -i mongo)
  [ -n "$VOLUMES" ] || { echo "aucun volume contenant « mongo »"; exit 0; }

  for vol in $VOLUMES; do
    echo "── $vol ──────────────────────────────────────────────────"
    if [ "$vol" = "$LIVE_VOL" ]; then
      echo "  (volume actuellement en service)"
    fi
    if open_copy "$vol"; then
      inventory | sed 's/^/  /'
    else
      echo "  ✗ inspection impossible (base illisible ou version incompatible)"
    fi
    cleanup
    echo
  done

  echo "=============================================================="
  echo " Le volume qui porte vos réunions est celui dont la collection"
  echo " « resume » a le plus de documents. Pour rapatrier ses données"
  echo " dans la stack en service :"
  echo
  echo "   bash recover-mongo-volume.sh --restore <nom du volume>"
  echo "=============================================================="
  exit 0
fi

# ── Restauration ────────────────────────────────────────────────────────────
[ -n "$LIVE_CID" ] || { echo "✗ aucun conteneur mongo en service : rien où restaurer" >&2; exit 1; }
[ "$RESTORE_FROM" = "$LIVE_VOL" ] && { echo "✗ « $RESTORE_FROM » est déjà le volume en service" >&2; exit 1; }
$DOCKER volume inspect "$RESTORE_FROM" >/dev/null 2>&1 || { echo "✗ volume « $RESTORE_FROM » introuvable" >&2; exit 1; }

LIVE_PASS="$(container_env "$LIVE_CID" MONGO_INITDB_ROOT_PASSWORD)"
[ -n "$LIVE_PASS" ] || { echo "✗ mot de passe Mongo de la stack introuvable" >&2; exit 1; }
API_CID="$(find_service api)"
LIVE_DB="$( [ -n "$API_CID" ] && container_env "$API_CID" MONGO_DB )"
LIVE_DB="${LIVE_DB:-mybrief}"

echo "Restauration : $RESTORE_FROM  →  base « $LIVE_DB » du volume ${LIVE_VOL:-?}"
echo "Les documents existants ne sont PAS écrasés (aucun --drop) ; seuls les"
echo "documents absents sont ajoutés."

# La source est ouverte AVANT la confirmation : refuser un volume vide ne
# demande l'avis de personne, et c'est l'erreur la plus facile à commettre —
# les noms de volumes ne disent rien de leur contenu.
open_copy "$RESTORE_FROM" || { echo "✗ impossible d'ouvrir « $RESTORE_FROM »" >&2; exit 1; }

echo
echo "Contenu de la source :"
inventory | sed 's/^/  /'

SRC_DOCS=$(tmp_eval '
  let total = 0;
  for (const d of db.adminCommand({listDatabases: 1}).databases) {
    if (["admin", "config", "local"].includes(d.name)) continue;
    const base = db.getSiblingDB(d.name);
    for (const c of base.getCollectionNames()) total += base.getCollection(c).countDocuments({});
  }
  total;' | tr -d '\r\n')
if [ -z "$SRC_DOCS" ] || [ "$SRC_DOCS" -eq 0 ] 2>/dev/null; then
  echo
  echo "✗ « $RESTORE_FROM » ne contient AUCUN document applicatif : il n'y a rien" >&2
  echo "  à restaurer, et le faire écraserait votre temps sans rien apporter." >&2
  echo "  Relancer l'inspection pour identifier le bon volume :" >&2
  echo "    bash recover-mongo-volume.sh" >&2
  exit 1
fi

# Confirmation : impossible quand le script est lu depuis l'entrée standard
# (ssh 'bash -s' < script), car il n'y a alors pas de terminal — même avec
# `ssh -t`, qui refuse d'allouer un pseudo-terminal dans ce cas. On le dit, avec
# la commande exacte à relancer, plutôt que d'abandonner sur un « annulé » sec.
if [ "$ASSUME_YES" -ne 1 ]; then
  # On tente réellement d'OUVRIR /dev/tty : le fichier peut exister tout en
  # étant inutilisable (« Device not configured » quand aucun terminal n'est
  # attaché), auquel cas un simple test de lisibilité passerait à tort.
  if ( : </dev/tty ) 2>/dev/null; then
    printf 'Confirmer ? [oui/NON] : '
    read -r reponse </dev/tty || reponse=""
    [ "$reponse" = "oui" ] || { echo "annulé."; exit 1; }
  else
    echo
    echo "Aucun terminal disponible pour confirmer (script lu sur l'entrée standard)."
    echo "Relancer en confirmant d'avance — la source vient d'être vérifiée ci-dessus :"
    echo
    echo "  ssh utilisateur@serveur 'bash -s' -- --restore $RESTORE_FROM --yes \\"
    echo "    < kit/recover-mongo-volume.sh"
    exit 2
  fi
fi

# Compte des collections applicatives de la base EN SERVICE. Affiché avant et
# après : c'est la seule preuve que la restauration a produit un effet, et de
# quelle ampleur.
live_counts() {
  $DOCKER exec "$LIVE_CID" mongosh -u root -p "$LIVE_PASS" --authenticationDatabase admin \
    "$LIVE_DB" --quiet --eval '
      JSON.stringify({
        reunions: db.resume.countDocuments({}),
        comptes: db.user.countDocuments({}),
        templates_perso: db.userTemplates.countDocuments({}),
        configs: db.userConfig.countDocuments({}),
      });' </dev/null 2>/dev/null
}

echo
echo "Base en service AVANT : $(live_counts)"

# Base à extraire : celle qui porte des réunions, sinon le nom de la base cible.
SRC_DB=$(tmp_eval '
  let best = "", n = -1;
  for (const d of db.adminCommand({listDatabases: 1}).databases) {
    if (["admin", "config", "local"].includes(d.name)) continue;
    const c = db.getSiblingDB(d.name).getCollection("resume").countDocuments({});
    if (c > n) { n = c; best = d.name; }
  }
  best;' | tr -d '\r\n')
SRC_DB="${SRC_DB:-$LIVE_DB}"
echo
echo "Base source retenue : $SRC_DB"

ARCHIVE="$HOME/mybrief-recuperation-$(date +%Y%m%d_%H%M%S)-${RESTORE_FROM}.archive.gz"
echo "Extraction vers $ARCHIVE …"
$DOCKER exec "$TMP_CID" mongodump --db "$SRC_DB" --archive --gzip </dev/null > "$ARCHIVE" 2>/dev/null
[ -s "$ARCHIVE" ] || { echo "✗ extraction vide — rien restauré" >&2; exit 1; }
echo "  archive : $(du -h "$ARCHIVE" | cut -f1)  (à conserver : c'est la sauvegarde)"

echo "Versement dans la base en service…"
$DOCKER exec -i "$LIVE_CID" mongorestore \
  -u root -p "$LIVE_PASS" --authenticationDatabase admin \
  --archive --gzip --nsFrom "$SRC_DB.*" --nsTo "$LIVE_DB.*" < "$ARCHIVE" 2>&1 \
  | grep -Ei 'document|error|duplicate|finished' | tail -15

cleanup

echo
echo "Base en service APRÈS : $(live_counts)"

if [ -n "$API_CID" ]; then
  echo "Redémarrage de l'API (index et normalisation des documents repris)…"
  $DOCKER restart "$API_CID" >/dev/null 2>&1
  sleep 6
  $DOCKER logs --tail 30 "$API_CID" 2>&1 </dev/null | grep -E '\[api\]' | tail -8
fi

echo
echo "=============================================================="
echo " Terminé. Rechargez l'application."
echo " Archive conservée : $ARCHIVE"
echo " Le volume « $RESTORE_FROM » n'a PAS été modifié."
echo "=============================================================="
