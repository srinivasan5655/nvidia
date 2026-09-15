#!/bin/bash
# Reliable full-stack startup for LifeShield's OpenShell + rootless Docker setup on this node.
#
# WHY THIS IS COMPLICATED (read before touching):
# - Native kernel overlayfs mounts are blocked here for unprivileged users, and rootless
#   dockerd's containerd-embedded "overlayfs" snapshotter does real lchown() syscalls during
#   layer extraction that fail on files with special UID/GID (e.g. /etc/shadow, uid 0 gid 42).
#   Fix: use the containerd-fuse-overlayfs-grpc proxy snapshotter instead (FUSE-based, doesn't
#   need real lchown).
# - dockerd's embedded containerd regenerates containerd.toml FRESH on every startup, with no
#   supported way to pre-seed the [proxy_plugins] stanza that registers our snapshotter. Fix:
#   a tight bash busy-loop watcher races to patch the file the instant it appears (~37ms
#   window before containerd finishes loading plugins). This MUST be a bash loop, not Python
#   (interpreter startup is too slow to win the race).
# - The fuse-overlayfs-grpc snapshotter process itself must run INSIDE the same user+mount
#   namespace that rootlesskit created for dockerd. If it runs from the outer/plain shell,
#   its own permission-check logic denies access to simulated root-owned restrictive-mode
#   files (e.g. Debian's /var/cache/apt/archives/partial, mode 0700 root) -- this breaks
#   `apt-get` and therefore any Debian-based image build/run, not just images with /etc/shadow.
#   Fix: nsenter into the SAME namespace as dockerd before starting it.
# - The rootlesskit-created network namespace only exists as a CHILD process
#   (/proc/self/exe --state-dir=... re-exec of the rootlesskit parent), found via
#   `ps --ppid <rootlesskit_parent_pid>`. Always nsenter -t into the CHILD pid, not the parent
#   (entering the parent's userns fails with "Invalid argument").
# - The OpenShell gateway must ALSO run nsentered into that same namespace, because it binds
#   to the docker bridge gateway IP (e.g. 172.17.0.1), which only resolves inside that netns.
# - The backend must stay in the OUTER namespace (it needs to be reachable from outside), so
#   we bridge outer 127.0.0.1:17670 -> inner 127.0.0.1:17670 using rootlesskit's own
#   port-forwarding REST API over its Unix socket ($STATE_DIR/api.sock, endpoint /v1/ports,
#   camelCase JSON fields: proto/parentIP/parentPort/childIP/childPort).
# - gateway.toml's host_gateway_ip can go stale across dockerd restarts (the bridge gateway IP
#   can change) -- always re-sync it from `docker network inspect bridge` before starting the
#   gateway.
#
# This script handles PHASE 1 (dockerd + snapshotter). See the printed instructions at the end
# for PHASE 2 (gateway + port-forward + backend), which needs the child PID phase 1 discovers.
set -e

# Resolve relative to THIS script's own location, not a hardcoded team/path
# name -- verified live on dgx08 2026-09-14 that a stale hardcoded absolute
# path (an old .../nvidia_hackathon/ checkout, not the real .../nvidia/ one)
# was silently running a different, out-of-date watcher.sh than the one
# sitting right next to this script. That's a correctness trap: fixes made
# to the real checkout's watcher.sh would never take effect. This resolves
# through symlinks too (readlink -f), so it's correct regardless of which
# directory name or checkout path this repo lives under on a given account.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

export PATH=/cm/shared/apps/rootless-docker/bin:$HOME/.local/bin:$PATH
export XDG_RUNTIME_DIR=/raid/docker/tmp/xdg_runtime_dir_1436
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock

echo "--- stopping any stale processes ---"
pkill -f dockerd 2>/dev/null || true
pkill -f rootlesskit 2>/dev/null || true
pkill -f containerd-fuse-overlayfs-grpc 2>/dev/null || true
pkill -f openshell-gateway 2>/dev/null || true
pkill -f watcher.sh 2>/dev/null || true
sleep 2

echo "--- clean state (required -- partial wipes leave stale containerd metadata conflicts) ---"
rm -rf ~/.local/share/docker /raid/docker/tmp/fuse-ovl-root
mkdir -p /raid/docker/tmp/fuse-ovl-root
# dockerd-rootless.sh hard-requires XDG_RUNTIME_DIR to already exist and be
# writable (its own startup check: `[ -w "$XDG_RUNTIME_DIR" ] || exit 1`) --
# verified live on dgx08 2026-09-14: without this, dockerd-rootless.sh exits
# 1 immediately, before rootlesskit ever launches, which cascades into every
# later step failing (pgrep finds nothing, CHILD_PID ends up empty, the
# watcher never sees a containerd.toml to patch). 0700 matches the XDG Base
# Directory spec for a runtime dir holding sockets.
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

echo "--- starting watcher (races to patch containerd.toml with our proxy snapshotter) ---"
rm -f "$XDG_RUNTIME_DIR/docker/containerd/containerd.toml"
# Invoked via `bash` explicitly, not relying on the file's own +x bit --
# verified live on dgx08 2026-09-14 that watcher.sh's executable bit doesn't
# survive however this repo gets onto the cluster (git itself has it tracked
# as mode 100755; the on-disk copy after transfer didn't), which made a
# direct exec fail with "Permission denied". `bash script.sh` never needs +x.
nohup bash "$SCRIPT_DIR/watcher.sh" > /raid/docker/tmp/watcher.log 2>&1 &
disown

echo "--- starting dockerd (rootless, containerd-snapshotter feature, fuse-overlayfs driver) ---"
nohup dockerd-rootless.sh --feature containerd-snapshotter=true --storage-driver fuse-overlayfs > /raid/docker/tmp/dockerd.log 2>&1 &
disown
sleep 6

ROOTLESSKIT_PID=$(pgrep -f "rootlesskit --state-dir=$XDG_RUNTIME_DIR/dockerd-rootless" | head -1)
CHILD_PID=$(ps --ppid "$ROOTLESSKIT_PID" -o pid= | tr -d ' ' | head -1)
echo "--- rootlesskit parent pid: $ROOTLESSKIT_PID   child (namespace-owning) pid: $CHILD_PID ---"

echo "--- starting containerd-fuse-overlayfs-grpc NSENTERED into the child's user+mount ns ---"
nohup nsenter -t "$CHILD_PID" -U --preserve-credentials -m -- \
  "$HOME/.local/bin/containerd-fuse-overlayfs-grpc" "$XDG_RUNTIME_DIR/fuse-overlayfs.sock" /raid/docker/tmp/fuse-ovl-root \
  > /raid/docker/tmp/fuse-grpc.log 2>&1 &
disown
sleep 2

echo "--- watcher log ---"
cat /raid/docker/tmp/watcher.log 2>&1 || true
echo "--- docker info (storage driver / errors) ---"
docker info 2>&1 | grep -i 'storage driver\|server version\|error' || true

cat << EOF

Phase 1 done. Child PID for namespace-scoped commands: $CHILD_PID

PHASE 2: run $SCRIPT_DIR/start_openshell_gateway.sh — it automates exactly the
steps below (bridge-IP sync, gateway nsenter, port-forward registration,
sandbox image build) against this same child pid, rediscovered the same way
this script found it. Manual equivalent, if you need to adapt a step:

  1) Sync the gateway's bridge IP:
     BRIDGE_IP=\$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
     sed -i "s/172\\.[0-9]*\\.[0-9]*\\.[0-9]*/\$BRIDGE_IP/" ~/.local/share/openshell/gateway.toml

  2) Start the gateway nsentered into the SAME child pid's user+net namespace:
     nohup nsenter -t $CHILD_PID -U --preserve-credentials -n -- \\
       env HOME=\$HOME "\$HOME/.local/bin/openshell-gateway" --config "\$HOME/.local/share/openshell/gateway.toml" \\
       > /raid/docker/tmp/gateway.log 2>&1 &
     disown

  3) Register the rootlesskit port-forward (outer 127.0.0.1:17670 -> inner 127.0.0.1:17670):
     curl -sS --unix-socket $XDG_RUNTIME_DIR/dockerd-rootless/api.sock -X POST \\
       -H 'Content-Type: application/json' \\
       -d '{"proto":"tcp","parentIP":"127.0.0.1","parentPort":17670,"childIP":"127.0.0.1","childPort":17670}' \\
       http://localhost/v1/ports

  4) Verify: openshell gateway info -g lifeshield-local   (expect Status: healthy)

  5) Rebuild the sandbox image if the image cache was wiped:
     cd /tmp/sandbox-img && DOCKER_BUILDKIT=0 docker build -t lifeshield-sandbox-py:latest .

  6) Start/restart the backend (outer namespace, normal) — adjust the path below
     if this checkout doesn't live at $SCRIPT_DIR/backend:
     cd $SCRIPT_DIR/backend && \\
       .venv_run/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8010

EOF
