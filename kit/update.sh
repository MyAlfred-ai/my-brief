#!/usr/bin/env bash
# Met à jour MyBrief vers une version publiée.
#
#   ./update.sh 1.3.0
#
# Codes de sortie : 0 réussi ; 1 rien n'a changé ; 2 intervention requise.
# Logique commune : lib/kit.sh.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/kit.sh
. "$KIT_DIR/lib/kit.sh"
kit_mettre_a_jour "$@"
