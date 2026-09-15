#!/bin/bash
# PHASE 2 of LifeShield's OpenShell + rootless Docker startup on this node.
# Run AFTER start_docker_stack.sh (phase 1) has dockerd/containerd/the fuse-overlayfs
# snapshotter up and healthy.
#
# This is exactly the "PHASE 2 (run manually / adapt as needed...)" block
# start_docker_stack.sh prints at the end of phase 1, turned into a real script —
# same paths, same ports, same order. See that script's own header comment for the
# full rootless-Docker namespace story; the short version: the OpenShell gateway
# binds to the docker bridge gateway IP, which only resolves INSIDE the
# rootlesskit-created user+net namespace dockerd is running in, so the gateway must
# be nsentered into that same namespace — it cannot start standalone in the outer
# shell (same reason the fuse-overlayfs-grpc snapshotter in phase 1 can't either).
set -e

# Resolve relative to THIS script's own location, not a hardcoded team/path
# name — same reasoning as start_docker_stack.sh's SCRIPT_DIR: a hardcoded
# absolute path silently points at whatever stale checkout happens to sit
# there instead of the repo this script actually lives in.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

export PATH=/cm/shared/apps/rootless-docker/bin:$HOME/.local/bin:$PATH
export XDG_RUNTIME_DIR=/raid/docker/tmp/xdg_runtime_dir_1436
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock

GATEWAY_NAME="lifeshield-local"
GATEWAY_PORT=17670
GATEWAY_CONFIG="$HOME/.local/share/openshell/gateway.toml"
SANDBOX_IMG_DIR=/tmp/sandbox-img
SANDBOX_IMG_TAG=lifeshield-sandbox-py:latest
BACKEND_DIR="$SCRIPT_DIR/backend"
BACKEND_PORT=8010

echo "--- rediscovering the rootlesskit child (namespace-owning) pid dockerd is running in ---"
ROOTLESSKIT_PID=$(pgrep -f "rootlesskit --state-dir=$XDG_RUNTIME_DIR/dockerd-rootless" | head -1)
if [ -z "$ROOTLESSKIT_PID" ]; then
  echo "ERROR: no rootlesskit process found for dockerd-rootless -- run start_docker_stack.sh (phase 1) first." >&2
  exit 1
fi
CHILD_PID=$(ps --ppid "$ROOTLESSKIT_PID" -o pid= | tr -d ' ' | head -1)
if [ -z "$CHILD_PID" ]; then
  echo "ERROR: rootlesskit parent $ROOTLESSKIT_PID found but its child pid is missing -- is dockerd actually up? (try: docker info)" >&2
  exit 1
fi
echo "--- rootlesskit parent pid: $ROOTLESSKIT_PID   child (namespace-owning) pid: $CHILD_PID ---"

echo "--- stopping any stale gateway ---"
pkill -f openshell-gateway 2>/dev/null || true
sleep 1

echo "--- syncing gateway.toml's bridge IP (goes stale across dockerd restarts) ---"
BRIDGE_IP=$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
if [ -z "$BRIDGE_IP" ]; then
  echo "ERROR: could not read the docker bridge gateway IP (docker network inspect bridge) -- is dockerd up?" >&2
  exit 1
fi
echo "bridge gateway IP: $BRIDGE_IP"
sed -i "s/172\.[0-9]*\.[0-9]*\.[0-9]*/$BRIDGE_IP/" "$GATEWAY_CONFIG"

echo "--- starting openshell-gateway NSENTERED into the child's user+net namespace ---"
nohup nsenter -t "$CHILD_PID" -U --preserve-credentials -n -- \
  env HOME="$HOME" "$HOME/.local/bin/openshell-gateway" --config "$GATEWAY_CONFIG" \
  > /raid/docker/tmp/gateway.log 2>&1 &
disown
sleep 3

echo "--- registering the rootlesskit port-forward (outer 127.0.0.1:$GATEWAY_PORT -> inner 127.0.0.1:$GATEWAY_PORT) ---"
curl -sS --unix-socket "$XDG_RUNTIME_DIR/dockerd-rootless/api.sock" -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"proto\":\"tcp\",\"parentIP\":\"127.0.0.1\",\"parentPort\":$GATEWAY_PORT,\"childIP\":\"127.0.0.1\",\"childPort\":$GATEWAY_PORT}" \
  http://localhost/v1/ports
echo

echo "--- gateway log (tail) ---"
tail -n 20 /raid/docker/tmp/gateway.log 2>&1 || true

echo "--- verifying gateway health (expect Status: healthy) ---"
openshell gateway info -g "$GATEWAY_NAME" || echo "WARNING: gateway info failed -- check /raid/docker/tmp/gateway.log above"

echo "--- sandbox image ---"
if docker image inspect "$SANDBOX_IMG_TAG" > /dev/null 2>&1 && [ "$1" != "--rebuild-image" ]; then
  echo "$SANDBOX_IMG_TAG already present; pass --rebuild-image to force a rebuild."
else
  echo "building $SANDBOX_IMG_TAG from $SANDBOX_IMG_DIR ..."
  (cd "$SANDBOX_IMG_DIR" && DOCKER_BUILDKIT=0 docker build -t "$SANDBOX_IMG_TAG" .)
fi

cat << EOF

Phase 2 done. OpenShell gateway '$GATEWAY_NAME' should be reachable at 127.0.0.1:$GATEWAY_PORT.

Next: start (or restart) the backend in the OUTER namespace, normally:
  cd $BACKEND_DIR && .venv_run/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT

Then in backend/.env, point the app at this gateway:
  OPENSHELL_ENABLED=true
  OPENSHELL_ENDPOINT=http://127.0.0.1:$GATEWAY_PORT
  OPENSHELL_CLUSTER=$GATEWAY_NAME
  OPENSHELL_BEARER_TOKEN=...   # only if gateway.toml requires one -- check that file

EOF
