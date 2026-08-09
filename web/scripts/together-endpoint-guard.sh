#!/usr/bin/env bash
# Together endpoint cost guard.
#
# Dedicated endpoints bill per GPU-hour whether or not anything is calling them,
# so a forgotten one is expensive. This polls for RUNNING/STARTING endpoints and
# stops any that has been up longer than MAX_MINUTES. Run it in the background
# whenever an endpoint is created; it is insurance, not the primary teardown.
#
# Usage: MAX_MINUTES=30 ./scripts/together-endpoint-guard.sh
set -uo pipefail

MAX_MINUTES="${MAX_MINUTES:-30}"
POLL_SECONDS="${POLL_SECONDS:-60}"

cd "$(dirname "$0")/.." || exit 1
set -a
# shellcheck disable=SC1091
[ -f .env.local ] && source .env.local
set +a
export PATH="$HOME/.local/bin:$PATH"
# Strip stray quotes: a quoted key silently 401s the CLI.
TOGETHER_API_KEY="${TOGETHER_API_KEY%\"}"
TOGETHER_API_KEY="${TOGETHER_API_KEY#\"}"
export TOGETHER_API_KEY

# v2 ("beta") endpoints need an explicit project; read-only calls infer it from
# the key but mutating ones do not, and the guard's whole job is the mutating one.
if [ -z "${TOGETHER_PROJECT_ID:-}" ]; then
  TOGETHER_PROJECT_ID=$(tg whoami --json 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('project_id',''))" 2>/dev/null)
  export TOGETHER_PROJECT_ID
fi

START=$(date +%s)
echo "guard: watching for running endpoints, hard stop after ${MAX_MINUTES}m"

# v1 endpoints (the legacy dedicated system) report a flat state per endpoint.
list_v1_running() {
  tg endpoints list --json 2>/dev/null | python3 -c "
import json,sys
try:
    eps = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for e in eps:
    if str(e.get('state','')).upper() in ('RUNNING','STARTING','PENDING'):
        print(e.get('id'))
" 2>/dev/null
}

# v2 endpoints are invisible to `tg endpoints list`, and v2 has NO automatic idle
# shutdown, so leaving them out of the guard would leave the expensive case
# unguarded. Billing follows the DEPLOYMENT's replicas, so that is what we watch
# and what we scale to zero.
list_v2_live_deployments() {
  tg beta endpoints ls --json 2>/dev/null | python3 -c "
import json,subprocess,sys
try:
    eps = json.load(sys.stdin).get('data', [])
except Exception:
    sys.exit(0)
for e in eps:
    eid = e.get('id')
    if not eid:
        continue
    try:
        out = subprocess.run(['tg','beta','endpoints','get',eid,'--json'],
                             capture_output=True, text=True, timeout=60).stdout
        detail = json.loads(out)
    except Exception:
        continue
    for d in (detail.get('deployments') or []):
        state = str(d.get('state') or d.get('status') or '').upper()
        bounds = d.get('autoscaling') or {}
        maxr = bounds.get('maxReplicas', bounds.get('max_replicas'))
        stopped = 'STOPPED' in state or 'DELET' in state
        if not stopped and str(maxr) != '0':
            print(d.get('id'))
" 2>/dev/null
}

while true; do
  NOW=$(date +%s)
  ELAPSED_MIN=$(( (NOW - START) / 60 ))

  RUNNING=$(list_v1_running)
  RUNNING_V2=$(list_v2_live_deployments)

  if [ -n "$RUNNING" ] || [ -n "$RUNNING_V2" ]; then
    echo "guard: live at ${ELAPSED_MIN}m: v1=[${RUNNING}] v2=[${RUNNING_V2}]"
    if [ "$ELAPSED_MIN" -ge "$MAX_MINUTES" ]; then
      for id in $RUNNING; do
        echo "guard: STOPPING v1 $id (exceeded ${MAX_MINUTES}m)"
        tg endpoints stop "$id" 2>&1 | tail -1
      done
      for id in $RUNNING_V2; do
        echo "guard: SCALING TO ZERO v2 $id (exceeded ${MAX_MINUTES}m)"
        tg beta endpoints update "$id" --min-replicas 0 --max-replicas 0 \
          --non-interactive 2>&1 | tail -1
      done
      echo "guard: done"
      exit 0
    fi
  fi

  if [ "$ELAPSED_MIN" -ge $(( MAX_MINUTES + 5 )) ]; then
    echo "guard: window elapsed, exiting"
    exit 0
  fi
  sleep "$POLL_SECONDS"
done
