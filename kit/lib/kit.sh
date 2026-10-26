# shellcheck shell=bash
# Moteur commun du kit d'installation de MIA et MyBrief.
#
# Copie de référence : exploitation/outils/public/kit.sh (testée par
# tests/kit.bats). Copiée À L'IDENTIQUE dans kit/lib/kit.sh des dépôts
# publics : ne pas la modifier là-bas.
#
# Le script appelant définit KIT_DIR (dossier du kit) puis source ce fichier.
# Le produit décrit ses particularités dans $KIT_DIR/produit.sh :
#   PRODUIT, PRODUIT_DEPOT (owner/dépôt GitHub), VERSION_VAR (variable du .env
#   qui porte la version), PRODUIT_IMAGES (noms d'images, séparés par des
#   espaces), PRODUIT_VARIABLES (variables obligatoires du .env),
#   PRODUIT_TAILLE_MO (place nécessaire pour images + sauvegarde) ;
#   produit_sauvegarder <dossier>, produit_restaurer <dossier>, produit_sante.
#
# Codes de sortie : 0 à jour ; 1 non déployé, l'installation est dans son état
# d'origine ; 2 retour arrière incomplet, intervention requise.
#
# Variables utiles : STATUS_FILE (reçoit le code de sortie, pour une exécution
# détachée), VERIFIER_SIGNATURE=0 (tests locaux seulement), SANTE_DELAI et
# SANTE_PAS (secondes), KIT_ESPACE_LIBRE_MO (tests).

: "${KIT_DIR:?KIT_DIR doit être défini avant de sourcer kit.sh}"
# shellcheck source=/dev/null
. "$KIT_DIR/produit.sh"

KIT_ENV="$KIT_DIR/.env"
KIT_ETAT="$KIT_DIR/.etat"
COSIGN_IMAGE="gcr.io/projectsigstore/cosign:v2.4.1"
OIDC_GITHUB="https://token.actions.githubusercontent.com"

kit_dire()   { echo "[$PRODUIT] $*"; }
kit_erreur() { echo "[$PRODUIT] ÉCHEC : $*" >&2; }

kit_lire() { # kit_lire <VARIABLE> → valeur dans .env (vide si absente)
  grep -E "^$1=" "$KIT_ENV" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

kit_ecrire() { # kit_ecrire <VARIABLE> <valeur> : remplace ou ajoute la ligne
  local tmp="$KIT_ENV.tmp"
  awk -v k="$1" -v v="$2" 'BEGIN{f=0} $0 ~ "^"k"=" {print k"="v; f=1; next} {print} END{if(!f) print k"="v}' \
    "$KIT_ENV" > "$tmp" && mv "$tmp" "$KIT_ENV"
}

kit_compose() {
  # COMPOSE_FILE du .env (mode proxy, surcouche d'instance) l'emporte, comme
  # pour un `docker compose` lancé à la main dans le dossier ; sinon le compose
  # du kit, plus docker-compose.override.yml s'il existe.
  local fichiers=() liste f
  liste=$(kit_lire COMPOSE_FILE)
  if [ -n "$liste" ]; then
    IFS=: read -r -a noms <<< "$liste"
    for f in "${noms[@]}"; do fichiers+=(-f "$KIT_DIR/$f"); done
  else
    fichiers=(-f "$KIT_DIR/docker-compose.yml")
    [ -f "$KIT_DIR/docker-compose.override.yml" ] && fichiers+=(-f "$KIT_DIR/docker-compose.override.yml")
  fi
  docker compose --project-directory "$KIT_DIR" --env-file "$KIT_ENV" "${fichiers[@]}" "$@"
}

kit_registre() { local r; r=$(kit_lire REGISTRE); echo "${r:-ghcr.io/myalfred-ai}"; }

kit_version_valide() {
  [ "$1" = edge ] || [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]
}

kit_verifier_variables() {
  local v manquantes=()
  [ -f "$KIT_ENV" ] || { kit_erreur ".env introuvable dans $KIT_DIR"; return 1; }
  for v in $PRODUIT_VARIABLES; do
    [ -n "$(kit_lire "$v")" ] || manquantes+=("$v")
  done
  if [ ${#manquantes[@]} -gt 0 ]; then
    kit_erreur "variables obligatoires absentes du .env : ${manquantes[*]}"
    return 1
  fi
}

kit_verifier_disque() {
  local libre besoin
  libre=${KIT_ESPACE_LIBRE_MO:-$(df -Pm "$KIT_DIR" | awk 'NR==2 {print $4}')}
  besoin=$(( PRODUIT_TAILLE_MO * 12 / 10 ))
  if [ "$libre" -lt "$besoin" ]; then
    kit_erreur "espace disque insuffisant : $libre Mo libres, $besoin Mo nécessaires (images + sauvegarde + 20 %)"
    return 1
  fi
}

kit_verifier_signatures() { # kit_verifier_signatures <version>
  local version=$1 identite img
  if [ "${VERIFIER_SIGNATURE:-1}" = 0 ]; then
    kit_dire "ATTENTION : vérification des signatures désactivée (VERIFIER_SIGNATURE=0)."
    return 0
  fi
  if [ "$version" = edge ]; then
    identite="^https://github.com/$PRODUIT_DEPOT/.github/workflows/edge.yml@refs/heads/develop$"
  else
    identite="^https://github.com/$PRODUIT_DEPOT/.github/workflows/release.yml@refs/tags/v"
  fi
  for img in $PRODUIT_IMAGES; do
    if ! docker run --rm "$COSIGN_IMAGE" verify \
           --certificate-identity-regexp "$identite" \
           --certificate-oidc-issuer "$OIDC_GITHUB" \
           "$(kit_registre)/$img:$version" >/dev/null; then
      kit_erreur "signature invalide ou absente pour $img:$version"
      return 1
    fi
  done
  kit_dire "signatures vérifiées."
}

kit_attendre_sante() {
  local fin=$(( SECONDS + ${SANTE_DELAI:-150} ))
  while :; do
    produit_sante && return 0
    [ "$SECONDS" -ge "$fin" ] && return 1
    sleep "${SANTE_PAS:-5}"
  done
}

kit__statut() { [ -n "${STATUS_FILE:-}" ] && echo "$1" > "$STATUS_FILE"; return 0; }

# Remet <version> en service et restaure <sauvegarde>. 0 si l'application est
# saine ensuite, 2 sinon.
kit__restaurer() {
  local version=$1 sauvegarde=$2
  kit_ecrire "$VERSION_VAR" "$version"
  kit_compose up -d --remove-orphans || return 2
  if [ -n "$sauvegarde" ]; then
    produit_restaurer "$sauvegarde" || { kit_erreur "restauration de $sauvegarde impossible"; return 2; }
  fi
  kit_attendre_sante || { kit_erreur "$PRODUIT $version ne redevient pas sain"; return 2; }
  kit_dire "$PRODUIT revenu en $version."
}

kit_mettre_a_jour() { # kit_mettre_a_jour <version>
  local cible=${1:-} precedente sauvegarde code
  trap 'kit__statut $?' EXIT

  if [ -z "$cible" ] || ! kit_version_valide "$cible"; then
    kit_erreur "version attendue : X.Y.Z (ou edge pour une recette), reçu « $cible »"
    exit 1
  fi
  kit_verifier_variables || exit 1
  precedente=$(kit_lire "$VERSION_VAR")
  kit_dire "mise à jour $precedente → $cible"
  kit_verifier_disque || exit 1

  mkdir -p "$KIT_ETAT" "$KIT_DIR/sauvegardes"
  sauvegarde="$KIT_DIR/sauvegardes/$(date +%Y%m%d-%H%M%S)-$precedente"
  mkdir -p "$sauvegarde"
  if ! produit_sauvegarder "$sauvegarde"; then
    kit_erreur "sauvegarde impossible : rien n'a été modifié"
    exit 1
  fi
  echo "$sauvegarde" > "$KIT_ETAT/derniere-sauvegarde"
  kit_dire "sauvegarde : $sauvegarde"

  # La version cible ne passe que par l'environnement : le .env n'est réécrit
  # qu'une fois les images téléchargées et vérifiées.
  # Compose donne priorité à l'environnement du shell sur le fichier .env.
  if ! ( export "$VERSION_VAR=$cible"; kit_compose pull ); then
    kit_erreur "téléchargement des images $cible impossible : rien n'a été modifié"
    exit 1
  fi
  kit_verifier_signatures "$cible" || exit 1

  echo "$precedente" > "$KIT_ETAT/version-precedente"
  kit_ecrire "$VERSION_VAR" "$cible"
  if kit_compose up -d --remove-orphans && kit_attendre_sante; then
    kit_dire "$PRODUIT $cible en service."
    exit 0
  fi

  kit_erreur "$cible ne démarre pas sainement : retour à $precedente"
  kit_compose logs --tail 50 >&2 || true
  code=0
  kit__restaurer "$precedente" "$sauvegarde" || code=$?
  [ "$code" -eq 0 ] && exit 1
  kit_erreur "RETOUR ARRIÈRE INCOMPLET — intervention requise (sauvegarde : $sauvegarde)"
  exit 2
}

kit_revenir() { # kit_revenir [version]
  local cible=${1:-} sauvegarde code=0
  trap 'kit__statut $?' EXIT
  [ -n "$cible" ] || cible=$(cat "$KIT_ETAT/version-precedente" 2>/dev/null || true)
  if [ -z "$cible" ] || ! kit_version_valide "$cible"; then
    kit_erreur "aucune version précédente connue : indiquer la version (rollback.sh X.Y.Z)"
    exit 1
  fi
  kit_verifier_variables || exit 1
  sauvegarde=$(cat "$KIT_ETAT/derniere-sauvegarde" 2>/dev/null || true)
  kit_dire "retour à $cible (sauvegarde : ${sauvegarde:-aucune})"
  kit__restaurer "$cible" "$sauvegarde" || code=$?
  [ "$code" -eq 0 ] && exit 0
  exit 2
}
