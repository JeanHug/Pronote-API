#!/usr/bin/env bash
# =============================================================================
# Test live — environnement d'exécution
# =============================================================================
#
# Ce script s'exécute DANS un runner GitHub Actions, où `ENT_ID` et `ENT_PASS`
# existent en variables d'environnement. Il ne les affiche jamais, ne les
# journalise jamais et ne les transmet jamais : le seul secret qu'il contrôle,
# c'est leur présence.
#
# Il est séparé du workflow à dessein. Le fichier de workflow doit être modifié
# depuis l'interface GitHub (l'app qui automatise ce dépôt n'a pas la permission
# d'écrire dans .github/workflows/). Garder toute la logique ici permet de faire
# évoluer le test sans jamais retoucher au workflow.
#
# Sortie :
#   rapports/rapport-public.json     — assaini, publiable
#   rapports/reponse-complete.json   — réponse intégrale, dépôt privé uniquement
# =============================================================================

set -euo pipefail

if [ -z "${ENT_ID:-}" ]; then
  echo "::error::Le secret ENT_ID est absent du dépôt (Settings → Secrets and variables → Actions)."
  exit 1
fi
if [ -z "${ENT_PASS:-}" ]; then
  echo "::error::Le secret ENT_PASS est absent du dépôt (Settings → Secrets and variables → Actions)."
  exit 1
fi
echo "Identifiants ENT présents (valeurs masquées)."
echo ""

echo "── Installation ───────────────────────────────────"
export PUPPETEER_SKIP_DOWNLOAD=true
npm ci

echo ""
echo "── Chromium ───────────────────────────────────────"
npx puppeteer browsers install chrome

echo ""
echo "── Dépendances système ────────────────────────────"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2
sudo apt-get install -y libasound2t64 || sudo apt-get install -y libasound2 || true

echo ""
echo "── Vérifications statiques ────────────────────────"
npx tsc --noEmit
npx tsx --test tests/*.test.ts

echo ""
echo "── Extraction réelle ──────────────────────────────"
# live-test.ts sort en 1 si l'extraction échoue. On veut malgré tout publier le
# rapport : on capture le code de sortie au lieu de laisser `set -e` tout couper.
code=0
npx tsx scripts/live-test.ts || code=$?

echo ""
if [ -f rapports/rapport-public.json ]; then
  echo "Rapport assaini produit."
else
  echo "::warning::Aucun rapport n'a été produit."
fi

exit "$code"
