#!/bin/bash
# ScaleReach YouTube Proxy - runs on your Mac
# Starts gost HTTP proxy + reverse SSH tunnel to EC2
# Designed to run via launchd (auto-restart on failure)
# Usage: ./start-proxy.sh

set -e

PROXY_PORT=8118
EC2_HOST="18.215.161.77"
SSH_KEY="$HOME/.ssh/scalereach-worker.pem"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GOST_CONFIG="$SCRIPT_DIR/../proxy-config.yaml"

cleanup() {
    echo "[PROXY] Cleaning up..."
    kill $GOST_PID $SSH_PID 2>/dev/null
    wait 2>/dev/null
    echo "[PROXY] Stopped."
}
trap cleanup EXIT

# Start gost
echo "[PROXY] Starting gost HTTP proxy on port $PROXY_PORT..."
gost -C "$GOST_CONFIG" &
GOST_PID=$!
sleep 2

# Verify gost started
if ! kill -0 $GOST_PID 2>/dev/null; then
    echo "[PROXY] gost failed to start"
    exit 1
fi

# SSH tunnel loop - reconnects on failure
while kill -0 $GOST_PID 2>/dev/null; do
    echo "[PROXY] Starting reverse SSH tunnel to $EC2_HOST..."
    ssh -i "$SSH_KEY" -N -R 0.0.0.0:${PROXY_PORT}:localhost:${PROXY_PORT} ubuntu@${EC2_HOST} \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 &
    SSH_PID=$!

    echo "[PROXY] gost PID: $GOST_PID, SSH tunnel PID: $SSH_PID"
    echo "[PROXY] Proxy running. EC2 can reach your residential IP via localhost:$PROXY_PORT"

    # Wait for SSH to exit (it will on disconnect)
    wait $SSH_PID 2>/dev/null
    SSH_EXIT=$?
    echo "[PROXY] SSH tunnel exited (code $SSH_EXIT), reconnecting in 10s..."
    sleep 10
done

echo "[PROXY] gost died, exiting (launchd will restart)"
exit 1
