#!/usr/bin/env bats
# Cohérence entre produit.sh, les composes du kit et env.example.

setup() {
  I="$BATS_TEST_DIRNAME/.."
  # shellcheck source=../produit.sh
  . "$I/produit.sh"
}

@test "produit : chaque image est versionnée par MYBRIEF_VERSION dans les deux composes" {
  for img in $PRODUIT_IMAGES; do
    for f in docker-compose.yml docker-compose.proxy.yml; do
      grep -q "/$img:\${MYBRIEF_VERSION:?" "$I/$f"
    done
  done
}

@test "produit : aucune image suivant main ou latest, aucune compilation sur le serveur" {
  for f in docker-compose.yml docker-compose.proxy.yml; do
    ! grep -nE 'image: .*[:-](main|latest)\}*$|^[[:space:]]+build:' "$I/$f"
  done
}

@test "produit : chaque variable obligatoire figure dans env.example" {
  for v in $PRODUIT_VARIABLES; do
    grep -q "^$v=" "$I/env.example"
  done
}

@test "produit : les trois scripts d'entrée sont exécutables et chargent lib/kit.sh" {
  for s in update.sh rollback.sh backup.sh; do
    [ -x "$I/$s" ]
    grep -qF '. "$KIT_DIR/lib/kit.sh"' "$I/$s"
  done
}
