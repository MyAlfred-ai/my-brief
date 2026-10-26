#!/usr/bin/env bash
# Sauvegarde MongoDB et le .env dans sauvegardes/<date>-<version>/.
#
#   ./backup.sh
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/kit.sh
. "$KIT_DIR/lib/kit.sh"
kit_verifier_variables
dossier="$KIT_DIR/sauvegardes/$(date +%Y%m%d-%H%M%S)-$(kit_lire "$VERSION_VAR")"
mkdir -p "$dossier"
produit_sauvegarder "$dossier" || { kit_erreur "sauvegarde impossible"; rm -rf "$dossier"; exit 1; }
kit_dire "sauvegarde : $dossier"
