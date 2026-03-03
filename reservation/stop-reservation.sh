#!/bin/bash

# 予約システム停止スクリプト (Phase 4: Rust バックエンド版)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$SCRIPT_DIR/logs/reservation"

echo "Stopping Reservation System..."

# Rust バックエンド停止
if [ -f "$LOGDIR/rust.pid" ]; then
    RUST_PID=$(cat "$LOGDIR/rust.pid")
    kill "$RUST_PID" 2>/dev/null && echo "  Rust backend stopped (PID: $RUST_PID)"
    rm -f "$LOGDIR/rust.pid"
fi
pkill -f "rust-backend" 2>/dev/null && echo "  Cleaned up remaining rust-backend processes"

# 旧プロセスも念のため停止
pkill -f "kv-server.ts" 2>/dev/null && echo "  Stopped kv-server.ts (legacy)"
pkill -f "vite.*preview" 2>/dev/null && echo "  Stopped vite preview (legacy)"

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
