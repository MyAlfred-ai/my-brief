#!/usr/bin/env bats
# Tests du moteur commun du kit d'installation (outils/public/kit.sh), copié
# tel quel dans kit/lib/kit.sh de mia et mybrief. Docker, cosign et git
# sont remplacés par des faux qui enregistrent leurs appels.

setup() {
  # Dépôt public : kit/tests → kit/lib/kit.sh ; exploitation : outils/public.
  KIT_SRC="$BATS_TEST_DIRNAME/../lib/kit.sh"
  [ -f "$KIT_SRC" ] || KIT_SRC="$BATS_TEST_DIRNAME/../outils/public/kit.sh"
  K="$BATS_TEST_TMPDIR/kit"
  FAUX="$BATS_TEST_TMPDIR/faux"
  JOURNAL="$BATS_TEST_TMPDIR/appels.log"
  mkdir -p "$K/lib" "$FAUX"
  cp "$KIT_SRC" "$K/lib/kit.sh"
  : > "$JOURNAL"
  export JOURNAL

  # Faux docker : journalise, échoue sur demande.
  cat > "$FAUX/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$JOURNAL"
case "$*" in
  *" pull"*)   [ -z "${FAUX_PULL_ECHEC:-}" ] || exit 1 ;;
  *cosign*verify*) [ -z "${FAUX_COSIGN_ECHEC:-}" ] || exit 1 ;;
esac
exit 0
EOF
  printf '#!/bin/sh\necho "git $*" >> "$JOURNAL"\n' > "$FAUX/git"
  chmod +x "$FAUX/docker" "$FAUX/git"
  export PATH="$FAUX:$PATH"

  # Produit factice : une image, sauvegarde et santé pilotées par fichiers.
  cat > "$K/produit.sh" <<'EOF'
PRODUIT=demo
PRODUIT_DEPOT=MyAlfred-ai/demo
VERSION_VAR=DEMO_VERSION
PRODUIT_IMAGES="demo-app"
PRODUIT_VARIABLES="COMPOSE_PROJECT_NAME DEMO_VERSION APP_SECRET"
PRODUIT_TAILLE_MO=1000
produit_sauvegarder() { echo "sauvegarde $1" >> "$JOURNAL"; [ -z "${FAUX_SAUVEGARDE_ECHEC:-}" ] && : > "$1/base.dump"; }
produit_restaurer()   { echo "restauration $1" >> "$JOURNAL"; [ -z "${FAUX_RESTAURATION_ECHEC:-}" ]; }
produit_sante() {
  local v; v=$(grep '^DEMO_VERSION=' "$KIT_DIR/.env" | cut -d= -f2)
  case " ${FAUX_SANTE_KO:-} " in *" $v "*) return 1 ;; esac
  return 0
}
EOF
  printf 'COMPOSE_PROJECT_NAME=demo\nDEMO_VERSION=1.2.0\nAPP_SECRET=x\n' > "$K/.env"
  printf '#!/usr/bin/env bash\nset -euo pipefail\nKIT_DIR="$(cd "$(dirname "$0")" && pwd)"\n. "$KIT_DIR/lib/kit.sh"\nkit_mettre_a_jour "$@"\n' > "$K/update.sh"
  printf '#!/usr/bin/env bash\nset -euo pipefail\nKIT_DIR="$(cd "$(dirname "$0")" && pwd)"\n. "$KIT_DIR/lib/kit.sh"\nkit_revenir "$@"\n' > "$K/rollback.sh"
  chmod +x "$K/update.sh" "$K/rollback.sh"

  export KIT_ESPACE_LIBRE_MO=100000 SANTE_DELAI=0 SANTE_PAS=0
}

version() { grep "^DEMO_VERSION=" "$K/.env" | cut -d= -f2; }

@test "kit : mise à jour réussie → 0, version écrite, version précédente notée" {
  run "$K/update.sh" 1.3.0
  [ "$status" -eq 0 ]
  [ "$(version)" = 1.3.0 ]
  [ "$(cat "$K/.etat/version-precedente")" = 1.2.0 ]
  grep -q "docker compose .* pull" "$JOURNAL"
  grep -q "docker compose .* up -d" "$JOURNAL"
}

@test "kit : aucun appel à git" {
  run "$K/update.sh" 1.3.0
  [ "$status" -eq 0 ]
  ! grep -q '^git ' "$JOURNAL"
}

@test "kit : variable obligatoire absente → 1 avant tout appel à docker" {
  sed -i '/^APP_SECRET=/d' "$K/.env"
  run "$K/update.sh" 1.3.0
  [ "$status" -eq 1 ]
  [[ "$output" == *APP_SECRET* ]]
  ! grep -q '^docker' "$JOURNAL"
}

@test "kit : version mal formée (main, latest) → 1 avant docker" {
  for v in main latest 1.3 v1.3.0; do
    run "$K/update.sh" "$v"
    [ "$status" -eq 1 ]
  done
  ! grep -q '^docker' "$JOURNAL"
}

@test "kit : disque insuffisant → 1 avant pull, .env intact" {
  KIT_ESPACE_LIBRE_MO=500 run "$K/update.sh" 1.3.0
  [ "$status" -eq 1 ]
  [[ "$output" == *disque* ]]
  ! grep -q ' pull' "$JOURNAL"
  [ "$(version)" = 1.2.0 ]
}

@test "kit : sauvegarde en échec → 1 avant pull" {
  FAUX_SAUVEGARDE_ECHEC=1 run "$K/update.sh" 1.3.0
  [ "$status" -eq 1 ]
  ! grep -q ' pull' "$JOURNAL"
  [ "$(version)" = 1.2.0 ]
}

@test "kit : signature refusée → 1 avant up, .env intact" {
  FAUX_COSIGN_ECHEC=1 run "$K/update.sh" 1.3.0
  [ "$status" -eq 1 ]
  [[ "$output" == *signature* ]]
  ! grep -q ' up -d' "$JOURNAL"
  [ "$(version)" = 1.2.0 ]
}

@test "kit : la signature vérifie l'identité du workflow de version du dépôt" {
  run "$K/update.sh" 1.3.0
  grep -q 'cosign.* verify .*github.com/MyAlfred-ai/demo/.github/workflows/release.yml@refs/tags/v.*ghcr.io/myalfred-ai/demo-app:1.3.0' "$JOURNAL"
}

@test "kit : edge est vérifiée contre le workflow edge de develop" {
  run "$K/update.sh" edge
  [ "$status" -eq 0 ]
  grep -q 'cosign.* verify .*workflows/edge.yml@refs/heads/develop.*demo-app:edge' "$JOURNAL"
}

@test "kit : santé en échec → retour à la version précédente, restauration, code 1" {
  FAUX_SANTE_KO=1.3.0 run "$K/update.sh" 1.3.0
  [ "$status" -eq 1 ]
  [ "$(version)" = 1.2.0 ]
  grep -q '^restauration ' "$JOURNAL"
}

@test "kit : retour arrière lui-même en échec → code 2" {
  FAUX_SANTE_KO="1.3.0 1.2.0" run "$K/update.sh" 1.3.0
  [ "$status" -eq 2 ]
}

@test "kit : STATUS_FILE reçoit le code de sortie" {
  STATUS_FILE="$BATS_TEST_TMPDIR/statut" run "$K/update.sh" 1.3.0
  [ "$(cat "$BATS_TEST_TMPDIR/statut")" = 0 ]
  FAUX_SANTE_KO=1.4.0 STATUS_FILE="$BATS_TEST_TMPDIR/statut" run "$K/update.sh" 1.4.0
  [ "$(cat "$BATS_TEST_TMPDIR/statut")" = 1 ]
}

@test "kit : VERIFIER_SIGNATURE=0 saute la vérification avec un avertissement" {
  VERIFIER_SIGNATURE=0 run "$K/update.sh" 1.3.0-rc1
  [ "$status" -eq 0 ]
  ! grep -q cosign "$JOURNAL"
  [[ "$output" == *ATTENTION* ]]
}

@test "kit : rollback revient à la version précédente et restaure la dernière sauvegarde" {
  run "$K/update.sh" 1.3.0
  : > "$JOURNAL"
  run "$K/rollback.sh"
  [ "$status" -eq 0 ]
  [ "$(version)" = 1.2.0 ]
  grep -q '^restauration ' "$JOURNAL"
}

@test "kit : rollback sans version précédente connue → 1" {
  run "$K/rollback.sh"
  [ "$status" -eq 1 ]
}

@test "kit : COMPOSE_FILE du .env est respecté (mode proxy, surcouche d'instance)" {
  echo "COMPOSE_FILE=docker-compose.proxy.yml:instance.override.yml" >> "$K/.env"
  run "$K/update.sh" 1.3.0
  [ "$status" -eq 0 ]
  grep -q "docker compose .*-f $K/docker-compose.proxy.yml -f $K/instance.override.yml up -d" "$JOURNAL"
  ! grep -q "$K/docker-compose.yml" "$JOURNAL"
}
