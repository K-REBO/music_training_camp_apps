#!/bin/bash

# 合宿予約システム - nohup起動スクリプト (tc.bido.dev/reservation 用)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$SCRIPT_DIR/logs/reservation"
SHARED_DB="$SCRIPT_DIR/../shared/database"
mkdir -p $LOGDIR
mkdir -p $SHARED_DB

echo "Starting Reservation System for tc.bido.dev/reservation..."

# .envファイルから環境変数を読み込み
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    echo "Loaded environment variables from .env"
fi

# 既存のプロセスを停止（メンテナンスサーバーはビルド完了まで残す）
pkill -f "kv-server.ts" 2>/dev/null || true
pkill -f "vite.*preview" 2>/dev/null || true

sleep 2

# KVサーバーを shared/database/ から起動（reservation.db がここにある）
if ! pgrep -f "kv-server.ts" > /dev/null; then
    echo "Starting KV server..."
    cd $SHARED_DB
    nohup deno run --allow-read --allow-write --allow-net --allow-env --no-lock \
        $SCRIPT_DIR/scripts/kv-server.ts \
        > $LOGDIR/kv-server.log 2>&1 &
    KV_PID=$!
    cd - > /dev/null
    echo $KV_PID > $LOGDIR/kv.pid
    echo "  Started KV server (PID: $KV_PID)"
else
    echo "KV server already running"
fi

sleep 3

# SvelteKitをビルドして起動
echo "Building and starting Reservation SvelteKit server..."
cd $SCRIPT_DIR
pnpm install --frozen-lockfile=false && bun run build || {
    echo "ERROR: build failed. Keeping maintenance server running."
    exit 1
}

# ビルド完了後にメンテナンスサーバーを停止
pkill -f "maintenance-server.ts" 2>/dev/null && echo "  Maintenance server stopped"
rm -f "$LOGDIR/maintenance.pid"

nohup bun run preview --host 0.0.0.0 --port 5173 \
    > $LOGDIR/svelte-server.log 2>&1 &
SVELTE_PID=$!

echo $SVELTE_PID > $LOGDIR/svelte.pid

echo ""
echo "Reservation System started!"
echo "  SvelteKit PID: $SVELTE_PID"
echo "  Local:  http://localhost:5173/reservation"
echo "  Public: https://tc.bido.dev/reservation"
