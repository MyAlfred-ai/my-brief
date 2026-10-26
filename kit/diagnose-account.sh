#!/usr/bin/env bash
#
# Pourquoi ce compte ne voit-il pas ses réunions / n'est-il pas administrateur ?
# LECTURE SEULE — ce script ne modifie rien.
#
# Il répond aux trois questions qui ne se devinent pas depuis le code :
#   1. la base contient-elle encore les données  (ou le déploiement parle-t-il
#      à un volume Mongo vierge — panne connue quand le nom de projet compose
#      change, cf. update.sh) ;
#   2. sous QUELLE adresse les réunions sont-elles enregistrées ;
#   3. quel est le rôle réel du compte.
#
# Usage, depuis un poste, sans rien déposer sur le serveur :
#   ssh ubuntu@<serveur> 'bash -s' -- --email prenom@societe.fr < kit/diagnose-account.sh
#
# Ou sur le serveur :
#   bash diagnose-account.sh --email prenom@societe.fr
#
# Le script ne suppose NI répertoire courant, NI fichier .env : lu depuis
# l'entrée standard, il n'a pas de chemin à lui. Il interroge donc directement
# les conteneurs — la stack en cours d'exécution fait foi, et c'est justement
# elle qu'on veut observer. `--project` ne sert que si plusieurs stacks
# cohabitent sur l'hôte.
#
# ⚠️ La sortie contient des adresses email : c'est un document interne. Aucun
# secret n'est affiché — le mot de passe Mongo est lu dans l'environnement du
# conteneur et passé à mongosh, jamais imprimé.
set -uo pipefail   # pas de -e : un diagnostic doit continuer même si une sonde échoue

PROJECT=""
EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --email)   EMAIL="${2:-}"; shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,27p' "$0" 2>/dev/null || echo "voir l'en-tête du fichier"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

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

# ── Localiser la stack ──────────────────────────────────────────────────────
find_service() { # find_service <nom de service compose> -> id du conteneur
  # Déclarations séparées : `local a=… b=(…)` sur une seule ligne n'est PAS une
  # affectation de tableau pour bash, et échoue sous `set -u`.
  local svc="$1"
  local filter
  filter=(--filter "label=com.docker.compose.service=$svc")
  [ -n "$PROJECT" ] && filter+=(--filter "label=com.docker.compose.project=$PROJECT")
  $DOCKER ps -q "${filter[@]}" 2>/dev/null | head -1
}

MONGO_CID="$(find_service mongo)"
if [ -z "$MONGO_CID" ]; then
  echo "✗ aucun conteneur du service « mongo » en cours d'exécution." >&2
  echo "  Stacks compose visibles sur cet hôte :" >&2
  $DOCKER ps --format '  {{.Label "com.docker.compose.project"}}\t{{.Names}}' 2>/dev/null | sort -u >&2
  echo "  Relancer avec : --project <nom>" >&2
  exit 1
fi

PROJECT="${PROJECT:-$($DOCKER inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$MONGO_CID" 2>/dev/null)}"
API_CID="$(find_service api)"

# Valeur d'une variable d'environnement d'un conteneur. Sert à récupérer le mot
# de passe Mongo sans lire le moindre fichier — et sans jamais l'afficher.
container_env() { # container_env <cid> <NOM>
  $DOCKER inspect -f "{{range .Config.Env}}{{println .}}{{end}}" "$1" 2>/dev/null \
    | grep -E "^$2=" | head -1 | cut -d= -f2-
}

MONGO_PASS="$(container_env "$MONGO_CID" MONGO_INITDB_ROOT_PASSWORD)"
[ -n "$MONGO_PASS" ] || { echo "✗ mot de passe Mongo introuvable dans l'environnement du conteneur" >&2; exit 1; }
MONGO_DB="$( [ -n "$API_CID" ] && container_env "$API_CID" MONGO_DB )"
MONGO_DB="${MONGO_DB:-mybrief}"

# PAS de `docker exec -i`, et stdin explicitement fermé : lu par
# `ssh 'bash -s' < script`, le script EST sur l'entrée standard — un conteneur
# interactif en consommerait le reste et l'exécution s'arrêterait net, sans
# erreur. Vérifié : le diagnostic s'interrompait après la section 2.
mongo_eval() {
  $DOCKER exec "$MONGO_CID" mongosh -u root -p "$MONGO_PASS" \
    --authenticationDatabase admin "$MONGO_DB" --quiet --eval "$1" 2>/dev/null </dev/null
}

echo "=============================================================="
echo " Diagnostic MyBrief — $(date '+%F %T')"
echo " projet compose : ${PROJECT:-?}   base : $MONGO_DB"
echo "=============================================================="

echo
echo "── 1. Volume Mongo réellement monté ──────────────────────────"
echo -n "monté sur /data/db : "
$DOCKER inspect "$MONGO_CID" \
  --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{if .Name}}{{.Name}}{{else}}{{.Source}} (bind){{end}}{{end}}{{end}}' 2>/dev/null
echo "volumes contenant « mongo » sur cet hôte :"
$DOCKER volume ls --format '  {{.Name}}' 2>/dev/null | grep -i mongo || echo "  (aucun)"

echo
echo "── 2. Volumétrie ─────────────────────────────────────────────"
mongo_eval 'JSON.stringify({
  comptes: db.user.countDocuments({}),
  administrateurs: db.user.countDocuments({role: "admin"}),
  reunions: db.resume.countDocuments({}),
  templates_perso: db.userTemplates.countDocuments({}),
  configs: db.userConfig.countDocuments({}),
}, null, 2)'

echo
echo "── 2 bis. Autres bases de cette instance Mongo ───────────────"
echo "(une base « mybrief » vide alors qu'une autre contient des documents"
echo " signifie que l'API interroge la mauvaise)"
$DOCKER exec "$MONGO_CID" mongosh -u root -p "$MONGO_PASS" --authenticationDatabase admin \
  --quiet --eval 'JSON.stringify(db.adminCommand({listDatabases:1}).databases.map(d => ({nom: d.name, taille_Mo: Math.round(Number(d.sizeOnDisk) / 10485.76) / 100})), null, 2)' 2>/dev/null </dev/null

echo
echo "── 3. Propriétaires des réunions ─────────────────────────────"
echo "(si votre adresse n'apparaît pas ici, vos réunions sont sous une AUTRE"
echo " adresse — c'est la réponse au « je ne vois pas mon historique »)"
mongo_eval 'JSON.stringify(db.resume.aggregate([
  {$group: {_id: {$toLower: {$ifNull: ["$email", "(sans email)"]}}, reunions: {$sum: 1},
            avec_emailLower: {$sum: {$cond: [{$ifNull: ["$emailLower", false]}, 1, 0]}}}},
  {$sort: {reunions: -1}},
  {$limit: 30},
]).toArray(), null, 2)'

echo
echo "── 3 bis. Collections présentes ──────────────────────────────"
mongo_eval 'JSON.stringify(db.getCollectionNames().map(n => ({collection: n, documents: db.getCollection(n).countDocuments({})})), null, 2)'

if [ -n "$EMAIL" ]; then
  LOWER=$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')
  echo
  echo "── 4. Compte « $EMAIL » ──────────────────────────────────────"
  mongo_eval "JSON.stringify(db.user.find(
    {\$or: [{emailLower: '$LOWER'}, {email: {\$regex: '^$LOWER\$', \$options: 'i'}}]},
    {_id: 0, email: 1, emailLower: 1, role: 1, disabled: 1, authProviders: 1, mustChangePassword: 1}
  ).toArray(), null, 2)"

  echo
  echo "── 5. Ses données ────────────────────────────────────────────"
  mongo_eval "JSON.stringify({
    reunions: db.resume.countDocuments({\$or: [{emailLower: '$LOWER'}, {email: {\$regex: '^$LOWER\$', \$options: 'i'}}]}),
    templates_perso: db.userTemplates.countDocuments({\$or: [{emailLower: '$LOWER'}, {email: {\$regex: '^$LOWER\$', \$options: 'i'}}]}),
  }, null, 2)"
fi

echo
echo "── 6. Ce que l'API a fait au dernier démarrage ───────────────"
if [ -n "$API_CID" ]; then
  API_LOGS=$($DOCKER logs "$API_CID" 2>&1 </dev/null | grep -E '\[api\]' | tail -20)
  if [ -n "$API_LOGS" ]; then
    printf '%s\n' "$API_LOGS"
  else
    # Rien à signaler est une information : ni migration à jouer, ni
    # avertissement. On montre quand même la fin du journal pour prouver que le
    # service a bien démarré.
    echo "(aucune ligne [api] : démarrage sans migration ni avertissement)"
    $DOCKER logs --tail 3 "$API_CID" 2>&1 </dev/null
  fi
else
  echo "(aucun conteneur du service « api » — stack encore sur n8n ?)"
fi

echo
echo "=============================================================="
echo " Lecture :"
echo "  • « reunions: 0 » en 2 alors qu'il y en avait → le déploiement parle à"
echo "    un AUTRE volume Mongo. Comparer les noms listés en 1 : les données"
echo "    sont dans l'ancien volume, rien n'est perdu."
echo "  • votre adresse absente en 3 → vos réunions sont sous une autre adresse"
echo "    (annuaire qui a changé d'identifiant, par exemple)."
echo "  • « role » différent de admin en 4 → renseigner ADMIN_EMAILS (ou"
echo "    ADMIN_EMAIL_DOMAINS) dans le .env du déploiement, puis redémarrer."
echo "=============================================================="
