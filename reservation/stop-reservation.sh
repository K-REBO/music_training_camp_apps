#!/bin/bash

# 予約システム停止スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$SCRIPT_DIR/logs/reservation"

echo "Stopping Reservation System..."

# SvelteKit停止
if [ -f "$LOGDIR/svelte.pid" ]; then
    SVELTE_PID=$(cat $LOGDIR/svelte.pid)
    kill $SVELTE_PID 2>/dev/null && echo "  SvelteKit stopped (PID: $SVELTE_PID)"
    rm -f $LOGDIR/svelte.pid
fi
pkill -f "vite.*preview" 2>/dev/null && echo "  Cleaned up remaining SvelteKit processes"

# KVサーバー停止
if [ -f "$LOGDIR/kv.pid" ]; then
    KV_PID=$(cat $LOGDIR/kv.pid)
    kill $KV_PID 2>/dev/null && echo "  KV server stopped (PID: $KV_PID)"
    rm -f $LOGDIR/kv.pid
fi
pkill -f "kv-server.ts" 2>/dev/null && echo "  Cleaned up remaining KV processes"

# メンテナンスサーバー起動（既に起動中なら何もしない）
if ! pgrep -f "maintenance-server.ts" > /dev/null; then
    nohup bun "$SCRIPT_DIR/scripts/maintenance-server.ts" \
        > "$LOGDIR/maintenance.log" 2>&1 &
    MAINTENANCE_PID=$!
    echo $MAINTENANCE_PID > "$LOGDIR/maintenance.pid"
    echo "  Maintenance server started (PID: $MAINTENANCE_PID)"
fi

echo ""
echo "Reservation System stopped!"
