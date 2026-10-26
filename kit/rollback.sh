#!/usr/bin/env bash
# Revient à la version précédente et restaure la dernière sauvegarde.
#
#   ./rollback.sh [1.2.0]
#
# Codes de sortie : 0 réussi ; 1 rien n'a changé ; 2 intervention requise.
# Logique commune : lib/kit.sh.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/kit.sh
. "$KIT_DIR/lib/kit.sh"
kit_revenir "$@"
