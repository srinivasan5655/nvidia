#!/bin/bash
# DEPRECATED: companion to start_docker_stack.sh, which is itself superseded
# by start_all.sh (repo root). Kept only for reference.
target=/raid/docker/tmp/xdg_runtime_dir_1436/docker/containerd/containerd.toml
echo "watcher started $(date +%s.%N)"
end=$((SECONDS+60))
while [ $SECONDS -lt $end ]; do
  if [ -s "$target" ] && ! grep -q proxy_plugins "$target" 2>/dev/null; then
    cat >> "$target" << 'EOF2'

[proxy_plugins]
  [proxy_plugins.fuse-overlayfs]
    type = "snapshot"
    address = "/raid/docker/tmp/xdg_runtime_dir_1436/fuse-overlayfs.sock"
EOF2
    echo "PATCHED $(date +%s.%N)"
    break
  fi
done
echo "watcher exiting $(date +%s.%N)"
