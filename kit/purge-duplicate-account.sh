#!/usr/bin/env bash
#
# Supprime les DOUBLONS INERTES d'une adresse : les documents `user` qui portent
# cette adresse sans être le compte que sert l'application.
#
# Un doublon inerte a la même adresse qu'un compte servi, mais pas de clé
# `emailLower` utilisable : la connexion, les sessions et l'administration ne le
# lisent jamais (cf. SERVED_ACCOUNT dans services/api/lib/repositories/users.js,
# et documentations/AUTHENTIFICATION.md §3). Les données (réunions, templates…)
# sont rattachées par adresse, pas par document de compte : le supprimer ne
# retire rien à personne. Le démarrage de l'API le signale (`warnDuplicateEmails`)
# sans jamais le supprimer ; ce script le fait, sur décision humaine.
#
# SANS --apply : LECTURE SEULE. Le compte servi et chaque doublon, champ par
# champ (un mot de passe n'apparaît que comme « présent ou non »), puis ce qui
# serait supprimé.
#
# AVEC --apply :
#   1. copie EJSON complète des doublons dans ~/backups/maintenance/ (droits
#      600, hors de la rotation de backup.sh) ;
#   2. suppression par `_id`, seulement si la sélection n'a pas bougé depuis la
#      copie ;
#   3. relecture de ce qui reste à cette adresse.
#
# Ne supprime JAMAIS :
#   - le compte servi (celui dont `emailLower` est l'adresse) ;
#   - un document qui porte la clé `emailLower` d'une AUTRE adresse : c'est le
#     compte de quelqu'un d'autre, quel que soit son `email` ;
#   - quoi que ce soit s'il n'existe pas de compte servi (code 3) : le document
#     trouvé est alors peut-être le seul compte, et le prochain démarrage de
#     l'API lui rendra sa clé.
#
# Remettre une copie en base :
#   docker cp <copie.json> <conteneur mongo>:/tmp/copie.json
#   docker exec <conteneur mongo> mongosh -u root -p <mot de passe> \
#     --authenticationDatabase admin mybrief --quiet --eval \
#     'db.user.insertMany(EJSON.parse(fs.readFileSync("/tmp/copie.json", "utf8")))'
#
# Usage, sur le serveur :
#   bash purge-duplicate-account.sh --email prenom@societe.fr            # voir
#   bash purge-duplicate-account.sh --email prenom@societe.fr --apply    # supprimer
#
# Codes de sortie : 0 fait (ou rien à faire), 1 Docker ou Mongo injoignable,
# 2 usage, 3 aucun compte servi, 4 sélection changée entre copie et
# suppression, 5 copie ou suppression incomplète.
#
# ⚠️ La sortie contient des adresses email : c'est un document interne. Le mot
# de passe Mongo est lu dans l'environnement du conteneur, jamais affiché.
set -uo pipefail   # pas de -e : chaque étape vérifie son résultat et le dit

PROJECT=""
EMAIL=""
APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --email)   EMAIL="${2:-}"; shift 2 ;;
    --apply)   APPLY=1; shift ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,48p' "$0" 2>/dev/null || echo "voir l'en-tête du fichier"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

# Normalisée comme le fait l'API (normalizeEmail : espaces autour retirés,
# minuscules). L'adresse ne passe QUE par l'environnement de mongosh, jamais par
# le texte du script : aucune valeur ne peut y devenir du code.
LOWER=$(printf '%s' "$EMAIL" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]')
if ! printf '%s' "$LOWER" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+$'; then
  echo "usage : $0 --email prenom@societe.fr [--apply] [--project <nom>]" >&2
  exit 2
fi

# Droit d'accès au démon : utilisateur hors groupe docker => préfixer sudo.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    echo "✗ le démon Docker ne répond pas (ou droits insuffisants)" >&2
    exit 1
  fi
fi

# Même repérage que diagnose-account.sh : la stack en cours d'exécution fait foi.
find_service() { # find_service <nom de service compose> -> id du conteneur
  local svc="$1"
  local filter
  filter=(--filter "label=com.docker.compose.service=$svc")
  [ -n "$PROJECT" ] && filter+=(--filter "label=com.docker.compose.project=$PROJECT")
  $DOCKER ps -q "${filter[@]}" 2>/dev/null | head -1
}

MONGO_CID="$(find_service mongo)"
if [ -z "$MONGO_CID" ]; then
  echo "✗ aucun conteneur du service « mongo » en cours d'exécution (--project <nom> ?)" >&2
  exit 1
fi
API_CID="$(find_service api)"

container_env() { # container_env <cid> <NOM>
  $DOCKER inspect -f "{{range .Config.Env}}{{println .}}{{end}}" "$1" 2>/dev/null \
    | grep -E "^$2=" | head -1 | cut -d= -f2-
}

MONGO_PASS="$(container_env "$MONGO_CID" MONGO_INITDB_ROOT_PASSWORD)"
[ -n "$MONGO_PASS" ] || { echo "✗ mot de passe Mongo introuvable dans l'environnement du conteneur" >&2; exit 1; }
MONGO_DB="$( [ -n "$API_CID" ] && container_env "$API_CID" MONGO_DB )"
MONGO_DB="${MONGO_DB:-mybrief}"

# Sélection partagée par chaque appel : le compte servi, puis les doublons
# inertes de la même adresse. Relue à chaque appel, jamais mise en cache.
SELECT_JS=$(cat <<'JS'
const lower = String(process.env.PURGE_EMAIL || '');
if (!lower) quit(2);
const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Même adresse, à la casse et aux espaces près : c'est ainsi que naissent les doublons.
const sameAddress = { email: { $regex: '^\\s*' + escaped + '\\s*$', $options: 'i' } };
// Sans clé utilisable : absente, nulle, vide, ou d'un autre type qu'une chaîne.
const withoutKey = { $or: [{ emailLower: { $not: { $type: 'string' } } }, { emailLower: '' }] };
const served = db.user.findOne({ emailLower: lower });
const ghosts = served
  ? db.user.find({ $and: [sameAddress, withoutKey, { _id: { $ne: served._id } }] }).toArray()
  : [];
const idOf = (d) => EJSON.stringify(d._id);
const describe = (d) => ({
  _id: idOf(d),
  email: d.email,
  emailLower: 'emailLower' in d ? d.emailLower : '(absent)',
  role: d.role,
  disabled: d.disabled,
  authProviders: d.authProviders,
  groupIds: d.groupIds,
  createdAt: d.createdAt,
  lastConnecion: d.lastConnecion,
  motDePasse: Boolean(d.passwordHash),
  champs: Object.keys(d).sort(),
});
JS
)

REPORT_JS='print(JSON.stringify({ adresse: lower, compte_servi: served ? describe(served) : null, doublons: ghosts.map(describe) }, null, 2));'

DELETE_JS=$(cat <<'JS'
if (!served) quit(3);
const expected = JSON.parse(process.env.PURGE_IDS || '[]');
const current = ghosts.map(idOf);
const unchanged = expected.length === current.length && expected.every((id) => current.includes(id));
if (!unchanged) {
  print(JSON.stringify({ refus: 'sélection changée depuis la copie', copie: expected, maintenant: current }));
  quit(4);
}
const res = db.user.deleteMany({ $and: [{ _id: { $in: ghosts.map((d) => d._id) } }, sameAddress, withoutKey] });
print(JSON.stringify({ supprimes: res.deletedCount }));
if (res.deletedCount !== current.length) quit(5);
JS
)

# PAS de `docker exec -i`, et stdin fermé : même raison que diagnose-account.sh
# (lu par `ssh 'bash -s' < script`, un conteneur interactif avalerait la suite).
mongo_js() { # mongo_js <js> [liste d'_id attendue, JSON]
  $DOCKER exec -e "PURGE_EMAIL=$LOWER" -e "PURGE_IDS=${2:-[]}" "$MONGO_CID" \
    mongosh -u root -p "$MONGO_PASS" --authenticationDatabase admin "$MONGO_DB" \
    --quiet --eval "$SELECT_JS
$1" </dev/null
}

echo "=============================================================="
echo " Doublons de compte — $(date '+%F %T')"
echo " base : $MONGO_DB   adresse : $LOWER   mode : $([ "$APPLY" -eq 1 ] && echo ÉCRITURE || echo 'lecture seule')"
echo "=============================================================="
echo
echo "── Avant ─────────────────────────────────────────────────────"
mongo_js "$REPORT_JS" || { echo "✗ lecture impossible" >&2; exit 1; }

SERVED=$(mongo_js 'print(served ? "oui" : "non");') || { echo "✗ lecture impossible" >&2; exit 1; }
if [ "$SERVED" != "oui" ]; then
  echo
  echo "✗ aucun compte servi pour $LOWER : aucun document n'est un doublon, rien n'est supprimé."
  echo "  Le prochain démarrage de l'API rendra sa clé au document existant."
  exit 3
fi

IDS=$(mongo_js 'print(JSON.stringify(ghosts.map(idOf)));') || { echo "✗ lecture impossible" >&2; exit 1; }
if [ "$IDS" = "[]" ]; then
  echo
  echo "✓ aucun doublon inerte pour $LOWER : rien à faire."
  exit 0
fi

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "LECTURE SEULE : les doublons listés ci-dessus seraient supprimés, le compte"
  echo "servi resterait tel quel. Pour le faire : relancer avec --apply."
  exit 0
fi

echo
echo "── Copie ─────────────────────────────────────────────────────"
BACKUP_DIR="$HOME/backups/maintenance"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR" || { echo "✗ dossier de copie impossible : rien n'est supprimé" >&2; exit 5; }
COPY="$BACKUP_DIR/$(date +%Y%m%d_%H%M%S)-doublons-$LOWER.json"
( umask 077; mongo_js 'print(EJSON.stringify(ghosts, null, 2, { relaxed: false }));' > "$COPY" )
if [ $? -ne 0 ] || ! head -c 1 "$COPY" 2>/dev/null | grep -q '\['; then
  echo "✗ copie illisible ($COPY) : rien n'est supprimé" >&2
  exit 5
fi
echo "copie : $COPY ($(wc -c < "$COPY") octets)"

echo
echo "── Suppression ───────────────────────────────────────────────"
mongo_js "$DELETE_JS" "$IDS"
code=$?
if [ $code -ne 0 ]; then
  echo "✗ suppression refusée ou incomplète (code $code). La copie reste : $COPY" >&2
  exit $code
fi

echo
echo "── Après ─────────────────────────────────────────────────────"
mongo_js "$REPORT_JS"
echo
echo "✓ doublon(s) supprimé(s). Copie : $COPY"
