#!/usr/bin/env bash
set -euo pipefail

# 37 vérifications contractuelles contre un Worker local. Aucune donnée réelle
# ni aucun endpoint /scrape déployé n'est utilisé.
BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:8787}"
TMP="$(mktemp -d)"
SERVER_PID=""
PASS=0
FAIL=0
RATE_KEY="smoke-rate-$$"
DEFAULT_KEY="smoke-default-$$"

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if [ -z "${SMOKE_BASE_URL:-}" ]; then
  npx wrangler dev --local --ip 127.0.0.1 --port 8787 \
    --var RUNNER_TOKEN:smoke-runner-token --var SYNC_WAIT_MS:1000 \
    >"$TMP/wrangler.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -fsS "$BASE_URL/api/v1/health" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

check() {
  local name="$1"
  shift
  if "$@"; then
    PASS=$((PASS + 1))
    printf '[ok] %02d — %s\n' "$PASS" "$name"
  else
    FAIL=$((FAIL + 1))
    printf '[ECHEC] — %s\n' "$name" >&2
  fi
}

request() {
  local name="$1" method="$2" path="$3" body="${4:-}" auth="${5:-}" ip="${6:-$DEFAULT_KEY}"
  local -a args=(-sS -o "$TMP/$name.body" -D "$TMP/$name.headers" -w '%{http_code}' -X "$method"
    -H 'Content-Type: application/json' -H "cf-connecting-ip: $ip")
  [ -n "$auth" ] && args+=(-H "Authorization: Bearer $auth" -H 'X-Runner-Protocol: 6')
  [ -n "$body" ] && args+=(--data "$body")
  curl "${args[@]}" "$BASE_URL$path" >"$TMP/$name.status"
}

is_status() { [ "$(cat "$TMP/$1.status")" = "$2" ]; }
jq_ok() { jq -e "$2" "$TMP/$1.body" >/dev/null; }

request health GET /api/v1/health
check 'health répond 200' is_status health 200
check 'health annonce status ok' jq_ok health '.status == "ok"'
check 'health annonce la version 4.0.0' jq_ok health '.version == "4.0.0"'
check 'health prouve Durable Object SQLite' jq_ok health '.storage == "Durable Object SQLite (KV supprimé)"'
check 'health expose requetesDO' jq_ok health '(.requetesDO | type) == "number"'

request docs GET /docs
check 'docs répond 200' is_status docs 200
check 'docs renvoie du HTML' grep -qi '<!doctype html' "$TMP/docs.body"

request schema GET /api/v1/schema
check 'schema répond 200' is_status schema 200
check 'schema est versionné 4.0.0' jq_ok schema '.version == "4.0.0"'
check 'schema expose les champs' jq_ok schema '.fields | type == "array" and length > 10'

curl -sS -o "$TMP/index.body" -D "$TMP/index.headers" -w '%{http_code}' \
  -H 'Accept: application/json' "$BASE_URL/" >"$TMP/index.status"
check 'index JSON répond 200' is_status index 200
check 'index JSON annonce v4' jq_ok index '.version == "4.0.0"'

request malformed POST /api/v1/scrape-pronote '{'
check 'JSON malformé refusé en 400' is_status malformed 400
check 'JSON malformé retourne INVALID_REQUEST' jq_ok malformed '.errorCode == "INVALID_REQUEST"'

request missing POST /api/v1/scrape-pronote '{}'
check 'champs manquants refusés' is_status missing 400
request onlyuser POST /api/v1/scrape-pronote '{"username":"test"}'
check 'mot de passe obligatoire' is_status onlyuser 400
request onlypass POST /api/v1/scrape-pronote '{"password":"test"}'
check 'identifiant obligatoire' is_status onlypass 400
request httpurl POST /api/v1/scrape-pronote '{"username":"test","password":"test","pronoteUrl":"http://a.index-education.net/"}'
check 'URL HTTP refusée' is_status httpurl 400
request metadata POST /api/v1/scrape-pronote '{"username":"test","password":"test","pronoteUrl":"https://169.254.169.254/"}'
check 'métadonnées cloud refusées' is_status metadata 400
request localhost POST /api/v1/scrape-pronote '{"username":"test","password":"test","entUrl":"https://localhost/"}'
check 'localhost refusé' is_status localhost 400
request badhost POST /api/v1/scrape-pronote '{"username":"test","password":"test","entUrl":"https://example.com/"}'
check 'domaine hors liste refusé' is_status badhost 400
request urlcreds POST /api/v1/scrape-pronote '{"username":"test","password":"test","entUrl":"https://u:p@ent.seine-et-marne.fr/"}'
check 'identifiants dans URL refusés' is_status urlcreds 400
request wrongmethod GET /api/v1/scrape-pronote
check 'GET scrape refusé en 405' is_status wrongmethod 405

request hbunauth POST /api/v1/runner/heartbeat '{}'
check 'heartbeat runner exige une authentification' is_status hbunauth 401
request nextunauth POST /api/v1/runner/next-job '{}'
check 'next-job exige une authentification' is_status nextunauth 401
request resultunauth POST /api/v1/runner/job-result '{}'
check 'job-result exige une authentification' is_status resultunauth 401
request relayunauth POST /api/v1/runner/relay '{}'
check 'relay exige une authentification' is_status relayunauth 401
request wrongauth POST /api/v1/runner/heartbeat '{}' mauvais-token
check 'mauvais token runner refusé' is_status wrongauth 401
request hbauth POST /api/v1/runner/heartbeat '{"runnerId":"smoke"}' smoke-runner-token
check 'heartbeat authentifié accepté' is_status hbauth 200
request nextauth POST /api/v1/runner/next-job '{"runnerId":"smoke"}' smoke-runner-token
check 'next-job authentifié accepté' is_status nextauth 200

VALID='{"username":"utilisateur-test","password":"mot-de-passe-test","pronoteUrl":"https://0771068t.index-education.net/pronote/eleve.html","entUrl":"https://ent.seine-et-marne.fr/"}'
request scrape POST /api/v1/scrape-pronote "$VALID" '' "$RATE_KEY"
check 'scrape valide bascule en 202 après le budget' is_status scrape 202
check '202 contient un UUID non devinable' jq_ok scrape '.jobId | test("^[0-9a-f]{8}-[0-9a-f-]{27}$")'
check '202 contient statusUrl exploitable' jq_ok scrape '.statusUrl | type == "string" and contains("/api/v1/job/")'
check '202 annonce Retry-After: 3' grep -qi '^Retry-After: 3' "$TMP/scrape.headers"

JOB_ID="$(jq -r '.jobId' "$TMP/scrape.body")"
request job GET "/api/v1/job/$JOB_ID"
check 'job différé est consultable en 202' is_status job 202
request badjob GET /api/v1/job/bad
check 'jobId invalide refusé' is_status badjob 400

# Neuf appels supplémentaires complètent la fenêtre de dix. Ils s'exécutent en
# parallèle pour garder le smoke test rapide ; aucun identifiant réel n'est utilisé.
for i in $(seq 1 9); do
  request "rate$i" POST /api/v1/scrape-pronote "$VALID" '' "$RATE_KEY" &
done
wait
request ratelimited POST /api/v1/scrape-pronote "$VALID" '' "$RATE_KEY"
check 'onzième extraction refusée avec Retry-After réel' bash -c \
  '[ "$(cat "$1/ratelimited.status")" = 429 ] && grep -qi "^Retry-After:" "$1/ratelimited.headers"' _ "$TMP"

printf '\nRésultat : %d/37 réussies.\n' "$PASS"
if [ "$FAIL" -ne 0 ] || [ "$PASS" -ne 37 ]; then
  exit 1
fi
