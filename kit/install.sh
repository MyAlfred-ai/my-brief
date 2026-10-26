#!/usr/bin/env bash
#
# MyBrief — assistant d'installation et d'administration.
#
#   bash install.sh              menu interactif (choix selon l'état du serveur)
#   bash install.sh install      installation sur VPS vierge (cas par défaut, OVH)
#   bash install.sh proxy        installation derrière un Traefik déjà en place
#   bash install.sh update       mise à jour (pull des images + relance + sonde)
#   bash install.sh status       état des services + sondes HTTP
#   bash install.sh backup       sauvegarde MongoDB horodatée dans ./backups/
#   bash install.sh logs [svc]   journaux (par défaut : tous les services)
#
# L'assistant écrit UN fichier : `.env`, à côté des composes. Tout le reste est
# porté par docker-compose.yml (VPS vierge) ou docker-compose.proxy.yml
# (Traefik existant). En mode proxy, `COMPOSE_FILE` est inscrit dans `.env` :
# Docker Compose le lit nativement, donc les commandes manuelles
# (`docker compose ps`, `logs`, …) visent le bon fichier sans option `-f`.
#
# Le script est réentrant : le relancer sur une installation en place propose
# la mise à jour, l'état et la sauvegarde — jamais un écrasement silencieux
# (le `.env` existant est copié en `.env.bak.<horodatage>` avant réécriture).
#
# Secrets : la clé OpenAI est saisie masquée ; le mot de passe MongoDB et la clé
# de chiffrement des secrets en base (comptes reliés, clé myBrain) sont tirés au
# hasard et ne sortent que dans `.env`. Seul le mot de passe du compte
# d'amorçage s'affiche, dans le résumé final : il est provisoire, l'application
# impose de le changer à la première connexion. Réinstaller REPREND les secrets
# du `.env` en place : en tirer de nouveaux rendrait la base injoignable et ses
# secrets chiffrés illisibles.
set -euo pipefail
cd "$(dirname "$0")"

# ── Affichage ───────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_TITLE=$'\033[1m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
else
  C_TITLE=""; C_OK=""; C_WARN=""; C_ERR=""; C_OFF=""
fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠ %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s✗ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
title(){ printf '\n%s── %s ──%s\n' "$C_TITLE" "$*" "$C_OFF"; }

# Question avec valeur par défaut. Usage : ask "Question" "défaut" -> $REPLY_VALUE
# Un Ctrl-D (EOF) interrompt l'assistant au lieu de boucler ou de valider en douce.
ask() {
  local q="$1" def="${2:-}" v
  if [ -n "$def" ]; then
    read -r -p "$q [$def] : " v || { printf '\n'; die "saisie interrompue"; }
    REPLY_VALUE="${v:-$def}"
  else
    while :; do
      read -r -p "$q : " v || { printf '\n'; die "saisie interrompue"; }
      [ -n "$v" ] && break; warn "réponse requise"
    done
    REPLY_VALUE="$v"
  fi
}
ask_secret() { # saisie masquée, obligatoire
  local q="$1" v
  while :; do
    read -rs -p "$q : " v || { printf '\n'; die "saisie interrompue"; }
    printf '\n'; [ -n "$v" ] && break; warn "réponse requise"
  done
  REPLY_VALUE="$v"
}
ask_secret_optional() { # saisie masquée, vide autorisé
  local q="$1" v
  read -rs -p "$q : " v || { printf '\n'; die "saisie interrompue"; }
  printf '\n'
  REPLY_VALUE="$v"
}
confirm() { # confirm "Question" -> 0 si oui. Défaut = oui ; EOF = non.
  local v
  read -r -p "$1 [O/n] : " v || { printf '\n'; return 1; }
  case "${v:-o}" in o|O|oui|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

# Seuls les parcours qui posent des questions exigent un terminal : update,
# status, backup et logs restent utilisables en cron/CI.
need_tty() {
  [ -t 0 ] || die "assistant interactif : à lancer depuis un terminal (pas de pipe/CI).
Pour une installation scriptée, écrire .env (cf. env.example) puis : docker compose up -d"
}

# ── Docker ──────────────────────────────────────────────────────────────────
SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null && SUDO="sudo"

ensure_docker() {
  if ! command -v docker >/dev/null; then
    title "Docker absent"
    say "L'installation utilise le script officiel Docker (get.docker.com),"
    say "recommandé pour Ubuntu. Il installe le moteur ET le plugin compose."
    confirm "Installer Docker maintenant ?" || die "Docker est requis — https://docs.docker.com/engine/install/ubuntu/"
    command -v curl >/dev/null || { $SUDO apt-get update -qq && $SUDO apt-get install -y -qq curl; }
    curl -fsSL https://get.docker.com | $SUDO sh
    ok "Docker installé"
  fi
  # Droit d'accès au démon : utilisateur hors groupe docker => préfixer sudo.
  if docker info >/dev/null 2>&1; then DOCKER="docker"
  elif [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then
    DOCKER="$SUDO docker"
    warn "docker demande sudo ici (utilisateur hors groupe docker) — l'assistant préfixe tout seul.
  Pour éviter sudo ensuite : $SUDO usermod -aG docker $USER  puis se reconnecter."
  else die "le démon Docker ne répond pas (service arrêté ?)"; fi
  $DOCKER compose version >/dev/null 2>&1 || die "plugin Docker Compose absent — https://docs.docker.com/compose/install/linux/"
}
compose() { $DOCKER compose "$@"; }

# ── Sondes réseau ───────────────────────────────────────────────────────────
public_ip() { curl -4fsS --max-time 5 https://ifconfig.me 2>/dev/null || curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true; }
domain_ip() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}'; }

check_dns() { # check_dns <domaine> — avertit sans bloquer (DNS parfois en cours de propagation)
  local dom="$1" pub dip
  pub="$(public_ip)"; dip="$(domain_ip "$dom")"
  if [ -z "$dip" ]; then
    warn "« $dom » ne résout pas encore. Let's Encrypt échouera tant que le DNS ne pointe pas ici."
    confirm "Continuer quand même ?" || exit 1
  elif [ -n "$pub" ] && [ "$dip" != "$pub" ]; then
    warn "« $dom » pointe sur $dip, ce serveur est $pub. Certificat impossible tant que le DNS ne pointe pas ici."
    confirm "Continuer quand même ?" || exit 1
  else
    ok "DNS : $dom → ${dip:-?} (ce serveur)"
  fi
}

ports_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(:80|:443)$'; }

traefik_container() { $DOCKER ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($2) ~ /traefik/ {print $1; exit}'; }

# ── .env ────────────────────────────────────────────────────────────────────
backup_env() {
  if [ -f .env ]; then
    local bak
    bak=".env.bak.$(date +%Y%m%d_%H%M%S)"
    cp .env "$bak"
    warn "un .env existe déjà — copié en $bak"
    confirm "Le remplacer par la nouvelle configuration ?" || die "installation annulée (le .env est intact)"
  fi
}

# gen_hex <octets> — secret tiré au hasard, en hexadécimal.
# Hexadécimal et PAS base64 : le mot de passe est interpolé tel quel dans
# MONGO_URL (mongodb://root:${MONGO_PASS}@…) et le driver rejette une URL dont
# l'userinfo contient un « / » non échappé — un base64 en tire un ~1 fois sur 2.
# CONNECTIONS_ENC_KEY l'accepte aussi (services/api/lib/crypto/secretBox.js).
gen_hex() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# env_get <CLÉ> — valeur de la clé dans le .env en place, vide sinon. Reprise
# telle quelle, guillemets compris : Docker Compose la relira à l'identique.
env_get() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -n 1 || true; }

# Secrets de l'instance. Ceux d'un .env en place (réinstallation, ou reprise
# après une installation interrompue) sont REPRIS, jamais tirés de nouveau :
#   - MONGO_PASS : MONGO_INITDB_ROOT_PASSWORD n'agit qu'à la création du
#     volume. Un nouveau mot de passe laisse la base existante injoignable :
#     healthcheck de mongo en échec, API recréée mais jamais démarrée
#     (« dependency failed to start »), site hors service ;
#   - CONNECTIONS_ENC_KEY : une nouvelle clé rend illisible ce qu'elle a déjà
#     chiffré — comptes reliés, clé myBrain. Absente d'un ancien .env, elle est
#     créée : ce qui est encore en clair reste lisible, et se chiffre à sa
#     prochaine écriture ;
#   - ADMIN_SEED_PASSWORD : sans lui, l'API refuse de démarrer sur une base
#     vierge (aucune valeur par défaut dans services/api/lib/config.js) ; on le
#     génère donc ici.
init_secrets() {
  REINSTALL=0
  if [ -f .env ]; then
    # Illisible ici, il passerait pour vide : tout serait tiré de nouveau.
    [ -r .env ] || die ".env illisible par $(id -un) : relancer avec le compte qui l'a écrit (sudo s'il appartient à root)"
    REINSTALL=1
  fi
  MONGO_PASS="$(env_get MONGO_PASS)"
  if [ -n "$MONGO_PASS" ]; then
    ok "mot de passe MongoDB repris du .env en place"
  else
    MONGO_PASS="$(gen_hex 24)"; ok "mot de passe MongoDB généré"
  fi
  CONNECTIONS_ENC_KEY="$(env_get CONNECTIONS_ENC_KEY)"
  if [ -n "$CONNECTIONS_ENC_KEY" ]; then
    ok "clé de chiffrement (CONNECTIONS_ENC_KEY) reprise du .env en place"
  else
    CONNECTIONS_ENC_KEY="$(gen_hex 32)"; ok "clé de chiffrement (CONNECTIONS_ENC_KEY) générée"
  fi
  ADMIN_SEED_PASSWORD="$(env_get ADMIN_SEED_PASSWORD)"
  if [ -n "$ADMIN_SEED_PASSWORD" ]; then
    ok "mot de passe provisoire du premier administrateur repris du .env en place"
  else
    ADMIN_SEED_PASSWORD="$(gen_hex 9)"; ok "mot de passe provisoire du premier administrateur généré (affiché à la fin)"
  fi
}

# write_env <mode> — variables passées via l'environnement de la fonction
write_env() {
  local mode="$1"
  {
    printf '# Généré par install.sh le %s — mode : %s\n' "$(date '+%F %T')" "$mode"
    printf '# Options avancées (SMTP, app mobile, version figée…) : voir env.example\n\n'
    printf 'DOMAIN=%s\n' "$DOMAIN"
    [ "$mode" = "standalone" ] && printf 'ACME_EMAIL=%s\n' "$ACME_EMAIL"
    printf '# Inscrit dans le volume à la création de la base : ne plus le changer.\n'
    printf 'MONGO_PASS=%s\n' "$MONGO_PASS"
    printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY"
    printf 'ADMIN_SEED_EMAIL=%s\n' "$ADMIN_SEED_EMAIL"
    printf "# Provisoire : ne sert qu'à la première connexion, qui impose d'en changer.\n"
    printf 'ADMIN_SEED_PASSWORD=%s\n' "$ADMIN_SEED_PASSWORD"
    printf '# Chiffre en base les comptes reliés et la clé myBrain : la changer les rend illisibles.\n'
    printf 'CONNECTIONS_ENC_KEY=%s\n' "$CONNECTIONS_ENC_KEY"
    printf '# Ne plus changer COMPOSE_PROJECT_NAME : les volumes de données en dépendent.\n'
    printf 'COMPOSE_PROJECT_NAME=%s\n' "${COMPOSE_PROJECT_NAME:-mybrief}"
    printf '# Version en service : ./update.sh X.Y.Z la change.\n'
    printf 'MYBRIEF_VERSION=%s\n' "$(kit_version)"
    if [ "$mode" = "proxy" ]; then
      printf '\n# Lu nativement par Docker Compose : les commandes manuelles visent ce fichier.\n'
      printf 'COMPOSE_FILE=docker-compose.proxy.yml\n'
      printf 'TRAEFIK_NETWORK=%s\n' "$TRAEFIK_NETWORK"
      printf 'TRAEFIK_ENTRYPOINT=%s\n' "$TRAEFIK_ENTRYPOINT"
      printf 'TRAEFIK_CERTRESOLVER=%s\n' "$TRAEFIK_CERTRESOLVER"
    fi
  } > .env
  chmod 600 .env
  ok ".env écrit (permissions 600)"
}

# ── Images (ghcr.io) ────────────────────────────────────────────────────────
pull_images() {
  say "Téléchargement des images…"
  # Images publiques : aucun identifiant n'est demandé ni laissé sur le serveur.
  compose pull || die "téléchargement des images impossible (réseau, ou version $(kit_version) inexistante)"
}

# Version du kit : fichier VERSION joint à chaque version publiée, sinon celle
# du dépôt (package.json) pour une installation depuis les sources.
kit_version() {
  local v=""
  [ -f VERSION ] && v=$(tr -d ' \n\r' < VERSION)
  [ -n "$v" ] || v=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' ../package.json 2>/dev/null | head -n 1)
  [ -n "$v" ] || die "version introuvable (fichier VERSION absent du kit)"
  echo "$v"
}

# ── Attente et sondes ───────────────────────────────────────────────────────
wait_api_healthy() {
  local cid _
  cid="$(compose ps -q api)" || true
  [ -n "$cid" ] || die "le service api n'a pas démarré (docker compose logs api)"
  say "Attente du démarrage de l'API…"
  for _ in $(seq 1 60); do
    case "$($DOCKER inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" in
      healthy) ok "API démarrée"; return 0 ;;
      unhealthy) break ;;
    esac
    sleep 2
  done
  compose logs --tail 30 api || true
  die "l'API ne devient pas saine — presque toujours une variable manquante dans .env (journaux ci-dessus)"
}

probe_https() { # probe_https <domaine> [tentatives] — cert + routage de bout en bout
  local dom="$1" tries="${2:-45}" _
  say "Sonde HTTPS sur https://$dom (émission du certificat : ~1 min)…"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS --max-time 5 "https://$dom/api/auth/config" >/dev/null 2>&1; then
      ok "https://$dom répond (certificat valide)"
      return 0
    fi
    sleep 4
  done
  warn "https://$dom ne répond pas encore avec un certificat valide.
  Causes habituelles : DNS pas encore propagé, ports 80/443 filtrés.
  Suivre :  $DOCKER compose logs -f traefik   puis relancer :  bash install.sh status"
  return 1
}

# ── Résumé final ────────────────────────────────────────────────────────────
final_summary() {
  title "Installation terminée"
  say "Application  : https://$DOMAIN"
  say "Identifiant  : $ADMIN_SEED_EMAIL"
  printf 'Mot de passe : %s%s%s  (provisoire : changement IMPOSÉ à la 1re connexion)\n' \
    "$C_TITLE" "$ADMIN_SEED_PASSWORD" "$C_OFF"
  # Le compte d'amorçage n'est créé que sur une base VIDE (bootstrap.js,
  # seedAdmin) : une réinstallation trouve d'ordinaire des comptes en base, et
  # ce mot de passe n'y ouvre alors rien.
  if [ "${REINSTALL:-0}" = 1 ]; then
    warn "réinstallation : ce compte n'est créé que sur une base vide. Une base qui a déjà
  des comptes les garde, avec leurs mots de passe."
  fi
  say ""
  say "Sauvegardez .env HORS de ce serveur. Sans lui, le volume de la base ne s'ouvre"
  say "plus, et comptes Gmail ou Outlook reliés et clé myBrain sont à refaire."
  say ""
  say "Ensuite, tout se fait depuis l'application :"
  say "  • Administration → Utilisateurs     : créer les comptes"
  say "  • Administration → Authentification : brancher Google ou Entra ID, domaines autorisés"
  say "  • Administration → IA               : clé OpenAI (vérifiée avant enregistrement)"
  # `if` et non `[ … ] && warn` : sous `set -e`, un test faux en dernière
  # instruction ferait sortir le script en erreur après une installation réussie.
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    warn "aucune clé OpenAI saisie — à renseigner dans Administration → IA avant d'enregistrer une réunion"
  fi
  say ""
  say "Administration du serveur (depuis ce dossier) :"
  say "  bash install.sh status | update | backup | logs"
}

# ── Cas 1 : VPS vierge ──────────────────────────────────────────────────────
do_install() {
  need_tty
  title "Installation sur VPS vierge (stack complète, Traefik + TLS inclus)"
  ensure_docker

  # Un Traefik déjà en route sur ce serveur → ce n'est pas le bon mode.
  local tc; tc="$(traefik_container)"
  if [ -n "$tc" ]; then
    warn "un Traefik tourne déjà ici (conteneur « $tc »). Deux Traefik ne peuvent pas partager les ports 80/443."
    confirm "Basculer vers l'installation « derrière un Traefik existant » ?" && { do_proxy; return; }
    die "arrêter l'autre Traefik d'abord, ou relancer avec : bash install.sh proxy"
  fi
  if ports_busy; then
    warn "les ports 80/443 sont déjà occupés sur ce serveur (ss -ltn). Traefik ne pourra pas démarrer."
    confirm "Continuer quand même ?" || exit 1
  fi

  ask "Nom de domaine (doit déjà pointer sur ce serveur)" ""; DOMAIN="$REPLY_VALUE"
  check_dns "$DOMAIN"
  ask "Email pour Let's Encrypt (avis d'expiration)" "admin@$DOMAIN"; ACME_EMAIL="$REPLY_VALUE"
  # Vide autorisé : la clé se règle aussi depuis Administration → IA, où elle est
  # vérifiée avant d'être enregistrée. Bloquer l'installation ici pour une clé
  # qu'on n'a pas encore sous la main n'a pas de sens.
  ask_secret_optional "Clé API OpenAI (saisie masquée, vide = à régler dans l'application)"
  OPENAI_API_KEY="$REPLY_VALUE"
  ask "Email du premier administrateur" "admin@$DOMAIN"; ADMIN_SEED_EMAIL="$REPLY_VALUE"
  init_secrets

  backup_env
  write_env standalone
  pull_images
  say "Démarrage…"
  compose up -d
  wait_api_healthy
  probe_https "$DOMAIN" || true
  final_summary
}

# ── Cas 2 : Traefik existant ────────────────────────────────────────────────
do_proxy() {
  need_tty
  title "Installation derrière un Traefik existant (v3.x requis)"
  ensure_docker
  say "La stack n'embarque ni proxy ni certificat : le Traefik en place route"
  say "https://<domaine> vers ces conteneurs via un réseau docker partagé."

  local tc guess=""
  tc="$(traefik_container)"
  if [ -n "$tc" ]; then
    guess="$($DOCKER inspect "$tc" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | grep -v '^bridge$' | head -1 || true)"
    ok "Traefik détecté : conteneur « $tc »"
  else
    warn "aucun conteneur Traefik détecté ici — vérifier qu'il tourne bien sur ce serveur."
  fi

  ask "Nom de domaine servi par le Traefik existant" ""; DOMAIN="$REPLY_VALUE"
  ask "Réseau docker du Traefik (docker network ls)" "${guess:-webproxy}"; TRAEFIK_NETWORK="$REPLY_VALUE"
  $DOCKER network inspect "$TRAEFIK_NETWORK" >/dev/null 2>&1 || {
    warn "le réseau « $TRAEFIK_NETWORK » n'existe pas. Mauvais réseau = 504 Gateway Timeout sans erreur au démarrage."
    confirm "Continuer quand même ?" || exit 1
  }
  ask "Entrypoint TLS du Traefik" "websecure"; TRAEFIK_ENTRYPOINT="$REPLY_VALUE"
  ask "Certresolver du Traefik" "myresolver"; TRAEFIK_CERTRESOLVER="$REPLY_VALUE"
  # Vide autorisé : la clé se règle aussi depuis Administration → IA, où elle est
  # vérifiée avant d'être enregistrée. Bloquer l'installation ici pour une clé
  # qu'on n'a pas encore sous la main n'a pas de sens.
  ask_secret_optional "Clé API OpenAI (saisie masquée, vide = à régler dans l'application)"
  OPENAI_API_KEY="$REPLY_VALUE"
  ask "Email du premier administrateur" "admin@$DOMAIN"; ADMIN_SEED_EMAIL="$REPLY_VALUE"
  init_secrets
  ACME_EMAIL=""

  backup_env
  write_env proxy
  pull_images
  say "Démarrage…"
  compose up -d
  wait_api_healthy
  probe_https "$DOMAIN" 15 || true
  final_summary
}

# ── Administration ──────────────────────────────────────────────────────────
require_install() { [ -f .env ] || die "aucun .env ici — installer d'abord : bash install.sh"; ensure_docker; }

# Mise à jour et sauvegarde : un seul chemin, celui du kit (update.sh,
# backup.sh), avec sauvegarde, signature vérifiée et retour arrière.
do_update() {
  require_install
  title "Mise à jour"
  local version="${1:-}"
  if [ -z "$version" ]; then
    ask "Version à installer (X.Y.Z, voir les versions publiées)" ""; version="$REPLY_VALUE"
  fi
  ./update.sh "$version"
}

do_status() {
  require_install
  title "Services"
  compose ps
  title "Sondes"
  local dom; dom="$(grep -E '^DOMAIN=' .env | cut -d= -f2- || true)"
  if [ -n "$dom" ]; then
    if curl -fsS --max-time 5 "https://$dom/api/auth/config" >/dev/null 2>&1; then
      ok "https://$dom/api → OK (TLS valide)"
    else
      warn "https://$dom/api ne répond pas — voir : bash install.sh logs traefik"
    fi
  fi
  title "Disque"
  df -h / | awk 'NR<=2'
}

do_backup() {
  require_install
  title "Sauvegarde MongoDB"
  ./backup.sh
}

do_logs() { require_install; compose logs --tail 100 -f "${1:-}"; }

# ── Menu ────────────────────────────────────────────────────────────────────
menu() {
  need_tty
  title "MyBrief — installation & administration"
  if [ -f .env ]; then
    say "Installation détectée ($(grep -E '^# Généré' .env 2>/dev/null | head -1 || echo '.env présent'))"
    say ""
    say "  1) État des services"
    say "  2) Mettre à jour"
    say "  3) Sauvegarder MongoDB"
    say "  4) Journaux"
    say "  5) Réinstaller (reconfigurer .env)"
    say "  q) Quitter"
    ask "Choix" "1"
    case "$REPLY_VALUE" in
      1) do_status ;; 2) do_update ;; 3) do_backup ;; 4) do_logs ;;
      5) choose_install ;; q|Q) exit 0 ;; *) die "choix inconnu" ;;
    esac
  else
    choose_install
  fi
}

choose_install() {
  say ""
  say "  1) VPS vierge — la stack embarque Traefik et son certificat (cas par défaut)"
  say "  2) Serveur avec un Traefik déjà en place (v3.x)"
  say "  q) Quitter"
  ask "Choix" "1"
  case "$REPLY_VALUE" in
    1) do_install ;; 2) do_proxy ;; q|Q) exit 0 ;; *) die "choix inconnu" ;;
  esac
}

# Sourcé (tests), ce fichier ne fait que définir les fonctions.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    "")       menu ;;
    install)  do_install ;;
    proxy)    do_proxy ;;
    update)   do_update "${2:-}" ;;
    status)   do_status ;;
    backup)   do_backup ;;
    logs)     shift; do_logs "${1:-}" ;;
    -h|--help|help) sed -n '3,22p' "$0" ;;
    *) die "commande inconnue : $1 (voir : bash install.sh --help)" ;;
  esac
fi
