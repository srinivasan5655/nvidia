#!/bin/bash
# One-shot, idempotent startup for the whole LifeShield stack on Curiosity v2:
# rootless Docker -> OpenShell gateway -> backend. Safe to re-run; each step
# skips (or cleanly restarts) what's already up rather than erroring.
#
# Supersedes start_docker_stack.sh + start_openshell_gateway.sh + watcher.sh.
# Those were built around a custom containerd-fuse-overlayfs-grpc snapshotter
# to work around a suspected /etc/shadow lchown bug in rootless Docker's
# default overlay2 driver -- verified live on dgx08 2026-09-14 that binary
# was never actually installed anywhere on this cluster, and that the
# cluster's own officially-supported path (`module load rootless-docker`,
# plain overlay2, no custom snapshotter) works cleanly with real image pulls.
# This script uses that simpler, official path instead.
#
# WHAT STILL NEEDS nsenter, AND WHY (verified live, not the old assumption):
# rootless Docker's bridge network only exists inside the network namespace
# rootlesskit creates for dockerd. openshell-gateway binds a second listener
# there (for sandbox containers to call back), which fails from the outer
# shell with "Cannot assign requested address" -- so the gateway (only the
# gateway, not dockerd itself, not any snapshotter) must run nsentered into
# that namespace's NETWORK namespace specifically (`-n`, not `-m`/`-U` for
# mounts). Its 127.0.0.1 listener is then only reachable from inside that
# namespace too, which is what the rootlesskit port-forward registration
# step bridges back out to the outer shell's 127.0.0.1.
set -e

# Default: plain `localhost:5173`, no path prefix -- normal usage from inside
# Curiosity v2 itself (JupyterLab terminal, SSH session, or a port-forwarded
# tunnel). Pass --external only when you actually need to reach the frontend
# through JupyterHub's public per-user proxy URL from outside the platform;
# that mode needs PROXY_BASE set so Vite's asset/HMR URLs carry the right
# prefix, but forcing it on unconditionally broke plain localhost access
# (verified live 2026-09-14).
EXTERNAL_ACCESS=false
for arg in "$@"; do
  case "$arg" in
    --external) EXTERNAL_ACCESS=true ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
GATEWAY_NAME="openshell"
GATEWAY_PORT=17670
GATEWAY_CONFIG="$HOME/.config/openshell/gateway.toml"
JWT_DIR="$HOME/.local/share/openshell/jwt"
BACKEND_DIR="$SCRIPT_DIR/backend"
BACKEND_PORT=8010
FRONTEND_DIR="$SCRIPT_DIR/frontend_1"
FRONTEND_PORT=5173
if [ "$EXTERNAL_ACCESS" = true ]; then
  # JupyterHub serves this dev server through a per-user proxy path prefix
  # when reached from outside the platform -- derived from `whoami`, not
  # hardcoded, so this stays correct for any teammate running this script.
  JUPYTERHUB_BASE="/user/$(whoami)/proxy/$FRONTEND_PORT/"
else
  JUPYTERHUB_BASE=""
fi
NIM_IMAGE="nvcr.io/nim/nvidia/nemotron-3-super-120b-a12b:latest"
NIM_PORT=8000
LOG_DIR="/raid/docker/tmp"
mkdir -p "$LOG_DIR"

echo "=== 1/8: self-hosted NIM/vLLM container (nemotron-3-super, backgrounded) ==="
# Uses Slurm's own --container-image (Enroot/Pyxis), NOT the rootless Docker
# daemon set up below -- fully independent of it, so launched first since
# it's by far the slowest step (image pull + model load took ~6 minutes
# verified live on 2026-09-13). Non-blocking below: launch it, confirm the
# srun step didn't fail immediately, then move on rather than waiting the
# full warm-up -- nim_client.py's failover already degrades to
# build.nvidia.com until this is actually ready.
if [ -z "${NGC_API_KEY:-}" ]; then
  echo "WARNING: NGC_API_KEY is not set in this shell -- the container may fail to pull/authenticate." >&2
fi
if curl -sf "http://localhost:$NIM_PORT/v1/models" > /dev/null 2>&1; then
  echo "NIM already reachable at :$NIM_PORT, not launching a second GPU job."
else
  NIM_LOG="$LOG_DIR/nim-container.log"
  : > "$NIM_LOG"
  nohup srun --gres=gpu:1 --container-writable \
    --container-image="$NIM_IMAGE" \
    --container-env=NGC_API_KEY,NIM_PASSTHROUGH_ARGS \
    --container-mounts="$HOME/.cache/nim:/opt/nim/.cache" \
    -e NIM_SERVER_PORT="$NIM_PORT" -e NIM_HEALTH_PORT="$NIM_PORT" \
    /opt/nim/start_server.sh --no-enable-flashinfer-autotune \
    > "$NIM_LOG" 2>&1 &
  disown
  sleep 15
  if grep -qiE 'error|not in the sudoers|Permission denied' "$NIM_LOG"; then
    echo "WARNING: NIM container log shows a possible error in its first 15s -- check $NIM_LOG" >&2
  fi
  echo "NIM container launched in the background (log: $NIM_LOG)."
  echo "Typically ~5-6 minutes to become ready at :$NIM_PORT/v1/models -- not blocking on it further."
fi

echo "=== 2/8: rootless Docker (module load rootless-docker) ==="
# `module` is normally wired up by ~/.bashrc, which only loads for interactive
# shells -- a plain `bash script.sh` run is non-interactive and won't have it
# unless we source .bashrc ourselves first. Verified this is a real risk, not
# a hypothetical: don't assume `module` is already a function here.
if ! type module >/dev/null 2>&1; then
  # shellcheck disable=SC1090
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
fi
if ! type module >/dev/null 2>&1; then
  echo "ERROR: 'module' command not available even after sourcing ~/.bashrc." >&2
  echo "Run 'module load rootless-docker' by hand once in an interactive shell first," >&2
  echo "or tell me what shows up in ~/.bashrc so this can be fixed properly." >&2
  exit 1
fi

module load rootless-docker

if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ -z "${DOCKER_DATAROOT:-}" ]; then
  echo "ERROR: module load rootless-docker did not set XDG_RUNTIME_DIR/DOCKER_DATAROOT." >&2
  echo "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-<unset>}  DOCKER_DATAROOT=${DOCKER_DATAROOT:-<unset>}" >&2
  exit 1
fi
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock

if ! docker ps > /dev/null 2>&1; then
  echo "ERROR: rootless Docker daemon still not reachable after module load." >&2
  echo "Check: cat \$XDG_RUNTIME_DIR/dockerd.log" >&2
  exit 1
fi
echo "Docker OK (XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR)"

echo "=== 3/8: OpenShell gateway JWT signing keys + config (idempotent) ==="
if [ ! -f "$JWT_DIR/signing.pem" ]; then
  mkdir -p "$JWT_DIR"
  openssl genpkey -algorithm ed25519 -out "$JWT_DIR/signing.pem"
  openssl pkey -in "$JWT_DIR/signing.pem" -pubout -out "$JWT_DIR/public.pem"
  printf '%s' "openshell-local-1" > "$JWT_DIR/kid"
  echo "Generated new JWT signing keys at $JWT_DIR"
else
  echo "JWT signing keys already present at $JWT_DIR, reusing."
fi

mkdir -p "$(dirname "$GATEWAY_CONFIG")"
cat > "$GATEWAY_CONFIG" <<EOF
[openshell.gateway.gateway_jwt]
signing_key_path = "$JWT_DIR/signing.pem"
public_key_path  = "$JWT_DIR/public.pem"
kid_path         = "$JWT_DIR/kid"
gateway_id       = "$GATEWAY_NAME"
ttl_secs         = 0

# Unsafe outside local/trusted-proxy dev -- accepts user-facing CLI/API calls
# without OIDC or mTLS while sandbox supervisors still authenticate with
# gateway-minted sandbox JWTs (the section above). Verified needed: without
# this, sandbox creation fails with "missing authorization header" even
# though --disable-tls and no OIDC/mTLS are configured.
[openshell.gateway.auth]
allow_unauthenticated_users = true
EOF
echo "Wrote $GATEWAY_CONFIG"

echo "=== 4/8: locate rootlesskit's network-namespace-owning child pid ==="
ROOTLESSKIT_PID=$(pgrep -f "rootlesskit --state-dir=$XDG_RUNTIME_DIR/dockerd-rootless" | head -1)
if [ -z "$ROOTLESSKIT_PID" ]; then
  echo "ERROR: no rootlesskit process found under $XDG_RUNTIME_DIR -- Docker isn't actually up." >&2
  exit 1
fi
CHILD_PID=$(ps --ppid "$ROOTLESSKIT_PID" -o pid= | tr -d ' ' | head -1)
if [ -z "$CHILD_PID" ]; then
  echo "ERROR: rootlesskit parent $ROOTLESSKIT_PID found but has no child pid." >&2
  exit 1
fi
echo "rootlesskit parent: $ROOTLESSKIT_PID   child (netns owner): $CHILD_PID"

echo "=== 5/8: start OpenShell gateway (nsentered into the netns, backgrounded) ==="
pkill -f "openshell-gateway --disable-tls" 2>/dev/null || true
sleep 1
GATEWAY_LOG="$LOG_DIR/openshell-gateway.log"
: > "$GATEWAY_LOG"
OPENSHELL_UP=false

# Preflight: `nsenter -U -n` requires CAP_SYS_ADMIN to join rootlesskit's
# user+net namespace. On shared JupyterHub/K8s-hosted nodes the outer shell
# is itself often already running inside a pod with a trimmed capability set
# (CAP_SYS_ADMIN dropped by default), which makes plain nsenter fail with
# "reassociate to namespace 'ns/net' failed: Operation not permitted" no
# matter what flags are passed -- verified this is the actual failure mode
# live on dgx04 2026-09-15, no sudo available either. Rather than hard-fail
# the whole stack over it: openshell_specialist.py's sandbox_session() already
# catches a dead/unreachable gateway and falls back to running the vision
# specialist un-sandboxed, directly against NIM -- a real, documented
# degraded mode (see that file's module docstring), not a stub. So treat the
# gateway as best-effort here: warn and skip to the backend/frontend instead
# of exiting, and leave the real fix (cluster admin granting CAP_SYS_ADMIN to
# this JupyterHub pod, or narrow sudo for nsenter) as a follow-up.
NSENTER_CMD=(nsenter -t "$CHILD_PID" -U --preserve-credentials -n --)
NSENTER_OK=true
if ! "${NSENTER_CMD[@]}" true 2>/tmp/nsenter_probe.$$; then
  if sudo -n true 2>/dev/null; then
    echo "Plain nsenter lacks permission to join the netns; passwordless sudo is available -- using it." >&2
    NSENTER_CMD=(sudo -n nsenter -t "$CHILD_PID" -U --preserve-credentials -n --)
  else
    NSENTER_OK=false
    echo "WARNING: nsenter cannot join rootlesskit's namespace (setns EPERM):" >&2
    cat /tmp/nsenter_probe.$$ >&2
    echo "This means the outer shell lacks CAP_SYS_ADMIN (e.g. this JupyterHub" >&2
    echo "pod's capability set) -- no nsenter flag fixes that from in here." >&2
    echo "  Real fix: ask the cluster admin for CAP_SYS_ADMIN on this pod, or a" >&2
    echo "  narrow sudoers rule for nsenter. Confirm with:" >&2
    echo "    cat /proc/self/status | grep CapEff" >&2
    echo "SKIPPING the OpenShell gateway -- specialists will run un-sandboxed" >&2
    echo "directly against NIM (a supported degraded mode, see" >&2
    echo "backend/app/nvidia_runtime/openshell_specialist.py)." >&2
  fi
fi
rm -f /tmp/nsenter_probe.$$

if [ "$NSENTER_OK" = true ]; then
  nohup "${NSENTER_CMD[@]}" \
    env HOME="$HOME" DOCKER_HOST="$DOCKER_HOST" "$HOME/.local/bin/openshell-gateway" \
    --disable-tls --drivers docker --port "$GATEWAY_PORT" --config "$GATEWAY_CONFIG" \
    > "$GATEWAY_LOG" 2>&1 &
  disown

  # Health-checked, not just launched-and-assumed: poll the log for the actual
  # "bound" line rather than a fixed sleep, since a background launch's own
  # failure never propagates to this script otherwise (the exact class of bug
  # that made start_docker_stack.sh silently "succeed" for days on this
  # cluster while nothing downstream of it actually worked).
  #
  # Plain phrase, no adjacent quote/= characters, and -a to force text mode:
  # verified live the gateway's log line WAS present (visible when the log was
  # cat'd on timeout) yet an exact grep for 'listener_purpose="primary"' still
  # didn't match -- likely the tracing logger emitting ANSI color codes around
  # quoted values even when writing to a redirected file, invisible when the
  # file is read/displayed normally but breaking a literal byte match right at
  # the quote boundaries. A plain-text substring with no punctuation next to it
  # survives that either way, and the CLI-based openshell status check right
  # after this loop is the real end-to-end proof regardless.
  GATEWAY_BOUND=false
  for i in $(seq 1 20); do
    if grep -aq 'Gateway listener bound' "$GATEWAY_LOG" 2>/dev/null; then
      GATEWAY_BOUND=true
      break
    fi
    sleep 1
  done
  if [ "$GATEWAY_BOUND" = true ]; then
    echo "Gateway listening (log: $GATEWAY_LOG)"

    echo "=== 6/8: register rootlesskit port-forward (outer 127.0.0.1:$GATEWAY_PORT -> inner) ==="
    curl -sS --unix-socket "$XDG_RUNTIME_DIR/dockerd-rootless/api.sock" -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"proto\":\"tcp\",\"parentIP\":\"127.0.0.1\",\"parentPort\":$GATEWAY_PORT,\"childIP\":\"127.0.0.1\",\"childPort\":$GATEWAY_PORT}" \
      http://localhost/v1/ports || echo "(non-fatal if it says 'conflict with ID' -- already registered)"
    echo

    export PATH="$HOME/.local/bin:$PATH"
    if openshell --gateway-endpoint "http://127.0.0.1:$GATEWAY_PORT" status > /dev/null 2>&1; then
      echo "Gateway reachable from outer namespace: OK"
      OPENSHELL_UP=true
    else
      echo "WARNING: gateway not reachable at 127.0.0.1:$GATEWAY_PORT even after port-forward registration -- continuing without it." >&2
    fi
  else
    echo "WARNING: gateway did not report a bound primary listener within 20s. Log:" >&2
    cat "$GATEWAY_LOG" >&2
    echo "Continuing without the OpenShell gateway (degraded/un-sandboxed specialist mode)." >&2
  fi
else
  echo "=== 6/8: skipped (no gateway to port-forward) ==="
fi

if [ "$OPENSHELL_UP" != true ]; then
  echo "NOTE: OpenShell gateway is NOT running. Make sure backend/.env has" >&2
  echo "OPENSHELL_ENABLED=false (or leave OPENSHELL_ENDPOINT unset) so the app" >&2
  echo "doesn't waste time retrying a dead gateway -- specialists still run for" >&2
  echo "real against NIM, just un-sandboxed." >&2
fi

echo "=== 7/8: start backend (restarts if already running on this port) ==="
if [ ! -x "$BACKEND_DIR/.venv_run/bin/python" ]; then
  echo "ERROR: $BACKEND_DIR/.venv_run not found. Run once:" >&2
  echo "  cd $BACKEND_DIR && uv venv .venv_run && uv pip install --python .venv_run/bin/python -r requirements.txt" >&2
  exit 1
fi

EXISTING_BACKEND_PID=$(pgrep -f "uvicorn app.main:app.*--port $BACKEND_PORT" || true)
if [ -n "$EXISTING_BACKEND_PID" ]; then
  echo "Stopping existing backend (pid $EXISTING_BACKEND_PID)"
  kill "$EXISTING_BACKEND_PID" 2>/dev/null || true
  sleep 2
fi

BACKEND_LOG="$LOG_DIR/backend.log"
: > "$BACKEND_LOG"
( cd "$BACKEND_DIR" && nohup .venv_run/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" \
  > "$BACKEND_LOG" 2>&1 & disown )

for i in $(seq 1 20); do
  if curl -sf "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: backend did not answer /health within 20s. Log:" >&2
    tail -50 "$BACKEND_LOG" >&2
    exit 1
  fi
  sleep 1
done

echo "=== 8/8: frontend (Vite dev server, backgrounded) ==="
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "ERROR: $FRONTEND_DIR not found." >&2
  exit 1
fi
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "node_modules missing, running npm install (first run only, may take a while) ..."
  ( cd "$FRONTEND_DIR" && npm install )
fi

EXISTING_FRONTEND_PID=$(pgrep -f "$FRONTEND_DIR.*vite" || true)
if [ -n "$EXISTING_FRONTEND_PID" ]; then
  echo "Stopping existing frontend (pid $EXISTING_FRONTEND_PID)"
  kill "$EXISTING_FRONTEND_PID" 2>/dev/null || true
  sleep 2
fi

FRONTEND_LOG="$LOG_DIR/frontend.log"
: > "$FRONTEND_LOG"
# PROXY_BASE and BACKEND_PORT are read directly by vite.config.ts (not CLI
# flags): PROXY_BASE drives both `base` and the custom re-add-proxy-prefix
# middleware that works around JupyterHub's proxy inconsistently stripping
# the path prefix on sub-resource requests; BACKEND_PORT points the /api,
# /health, /static proxy at the cluster's backend port (8010) instead of the
# :8000 default meant for local dev (where :8000 is the backend itself, not
# the NIM container). --host 0.0.0.0 is explicit here even though
# vite.config.ts's server.host=true is equivalent, to match the exact
# invocation verified working by hand.
( cd "$FRONTEND_DIR" && PROXY_BASE="$JUPYTERHUB_BASE" BACKEND_PORT="$BACKEND_PORT" nohup npm run dev -- --host 0.0.0.0 \
  > "$FRONTEND_LOG" 2>&1 & disown )

for i in $(seq 1 20); do
  if curl -sf "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: frontend did not answer on :$FRONTEND_PORT within 20s. Log:" >&2
    tail -50 "$FRONTEND_LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "Frontend up (log: $FRONTEND_LOG)"

echo
echo "========================================================="
echo "Everything up:"
echo "  NIM/vLLM: http://localhost:$NIM_PORT   (log: $LOG_DIR/nim-container.log -- may still be warming up)"
echo "  Docker:   rootless, module-managed (XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR)"
echo "  Gateway:  http://127.0.0.1:$GATEWAY_PORT   (log: $GATEWAY_LOG)"
echo "  Backend:  http://localhost:$BACKEND_PORT   (log: $BACKEND_LOG)"
if [ "$EXTERNAL_ACCESS" = true ]; then
  echo "  Frontend: https://curiosity-hub-raplabhackathon.axisapps.io${JUPYTERHUB_BASE}"
  echo "            (or http://localhost:$FRONTEND_PORT from inside Curiosity v2)   (log: $FRONTEND_LOG)"
else
  echo "  Frontend: http://localhost:$FRONTEND_PORT   (log: $FRONTEND_LOG)"
  echo "            (run with --external instead if you need the public JupyterHub URL)"
fi
echo
echo "Check backend/.env has OPENSHELL_ENABLED=true, OPENSHELL_ENDPOINT=http://127.0.0.1:$GATEWAY_PORT,"
echo "OPENSHELL_CLUSTER=$GATEWAY_NAME, and NIM_PROD_BASE_URL=http://localhost:$NIM_PORT/v1 before trusting"
echo "a replay run to use the sandbox/vLLM paths."
echo
echo "Test: curl -s -X POST http://localhost:$BACKEND_PORT/api/v1/events/replay \\"
echo "        -H 'Content-Type: application/json' -d '{\"label\":\"stack test\",\"city\":\"houston\"}'"
echo "========================================================="
