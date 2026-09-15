#!/bin/bash
# Companion to start_all.sh: stops the LifeShield app stack cleanly.
#
# Defaults to stopping only what start_all.sh's steps 5-8 manage (OpenShell
# gateway, backend, frontend) -- NOT rootless Docker and NOT the NIM/vLLM GPU
# job, since those are expensive to restart (Docker: ~10s; NIM: ~5-6 minutes
# verified live) and the cluster's own start_rootless_docker.sh reminds you
# shared GPU resources are valuable. Pass --docker and/or --nim to also stop
# those explicitly.
#
# Safe to re-run: every step is `pkill -f ... || true`, never errors if the
# thing it's stopping is already gone.
set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
BACKEND_PORT=8010
FRONTEND_DIR="$SCRIPT_DIR/frontend_1"

STOP_DOCKER=false
STOP_NIM=false
for arg in "$@"; do
  case "$arg" in
    --docker) STOP_DOCKER=true ;;
    --nim) STOP_NIM=true ;;
    --all) STOP_DOCKER=true; STOP_NIM=true ;;
    -h|--help)
      echo "Usage: $(basename "$0") [--docker] [--nim] [--all]"
      echo "  (no flags)  stop gateway, backend, frontend only"
      echo "  --docker    also stop the rootless Docker daemon (module-managed)"
      echo "  --nim       also cancel the NIM/vLLM GPU job (frees the GPU, ~5-6 min to restart)"
      echo "  --all       both of the above"
      exit 0
      ;;
  esac
done

echo "=== Stopping frontend ==="
pkill -f "$FRONTEND_DIR.*vite" 2>/dev/null && echo "stopped" || echo "not running"

echo "=== Stopping backend ==="
pkill -f "uvicorn app.main:app.*--port $BACKEND_PORT" 2>/dev/null && echo "stopped" || echo "not running"

echo "=== Stopping OpenShell gateway ==="
pkill -f "openshell-gateway --disable-tls" 2>/dev/null && echo "stopped" || echo "not running"

if [ "$STOP_DOCKER" = true ]; then
  echo "=== Stopping rootless Docker (this also takes the gateway's netns with it) ==="
  if ! type module >/dev/null 2>&1; then
    [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
  fi
  if type stop_rootless_docker >/dev/null 2>&1; then
    stop_rootless_docker
  else
    echo "stop_rootless_docker not on PATH -- module load rootless-docker first, or it's already stopped."
  fi
else
  echo "(leaving rootless Docker running -- pass --docker to stop it too)"
fi

if [ "$STOP_NIM" = true ]; then
  echo "=== Cancelling NIM/vLLM GPU job ==="
  NIM_JOB_ID=$(squeue --me --noheader --format="%i %o" 2>/dev/null | grep "nemotron-3-super" | awk '{print $1}' | head -1)
  if [ -n "$NIM_JOB_ID" ]; then
    scancel "$NIM_JOB_ID"
    echo "cancelled job $NIM_JOB_ID"
  else
    echo "no matching NIM job found in your queue (squeue --me) -- check manually if unsure:"
    squeue --me 2>/dev/null || true
  fi
else
  echo "(leaving the NIM/vLLM GPU job running -- pass --nim to cancel it; takes ~5-6 min to restart)"
fi

echo
echo "Done. Re-run start_all.sh to bring everything back up."
