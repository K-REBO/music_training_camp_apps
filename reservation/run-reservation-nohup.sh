#!/bin/bash

# 合宿予約システム - nohup起動スクリプト (Phase 4: Rust バックエンド版)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGDIR="$SCRIPT_DIR/logs/reservation"
SHARED_DB="$APP_ROOT/shared/database"
RUST_BINARY="$APP_ROOT/rust-backend/rust-backend"

mkdir -p "$LOGDIR"
mkdir -p "$SHARED_DB"

echo "Starting Reservation System (Rust backend) for tc.bido.dev/reservation..."

# .envファイルから環境変数を読み込み
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    echo "Loaded environment variables from .env"
fi

# 必須: Rust バイナリの存在確認
if [ ! -f "$RUST_BINARY" ]; then
    echo "ERROR: Rust binary not found at $RUST_BINARY"
    echo "  Run deploy-to-pi.sh from your local machine to transfer the binary."
    exit 1
fi

# 既存のプロセスを停止
pkill -f "rust-backend" 2>/dev/null && echo "  Stopped existing rust-backend"
pkill -f "kv-server.ts" 2>/dev/null && echo "  Stopped kv-server.ts (legacy)"
pkill -f "vite.*preview" 2>/dev/null && echo "  Stopped vite preview (legacy)"

sleep 2

# SvelteKit をビルド（静的ファイル生成）
echo "Building SvelteKit static files..."
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile=false && bun run build || {
    echo "ERROR: SvelteKit build failed."
    exit 1
}
echo "  SvelteKit build complete: $SCRIPT_DIR/build/"

# メンテナンスサーバーを停止（ビルド完了後）
pkill -f "maintenance-server.ts" 2>/dev/null && echo "  Maintenance server stopped"
rm -f "$LOGDIR/maintenance.pid"

# 環境変数のデフォルト値設定
export PORT="${PORT:-5173}"
export DATABASE_URL="${DATABASE_URL:-sqlite:$SHARED_DB/reservation_sqlite.db}"
export STATIC_DIR="${STATIC_DIR:-$SCRIPT_DIR/build}"
# ADMIN_PASSWORD と LINE_CHANNEL_ACCESS_TOKEN は .env から読み込む想定

echo "Starting Rust backend..."
echo "  PORT:         $PORT"
echo "  DATABASE_URL: $DATABASE_URL"
echo "  STATIC_DIR:   $STATIC_DIR"

cd "$APP_ROOT"
nohup "$RUST_BINARY" \
    > "$LOGDIR/rust-backend.log" 2>&1 &
RUST_PID=$!

echo $RUST_PID > "$LOGDIR/rust.pid"
echo "  Started Rust backend (PID: $RUST_PID)"

sleep 2

# 起動確認
if kill -0 "$RUST_PID" 2>/dev/null; then
    echo ""
    echo "Reservation System started!"
    echo "  Rust PID: $RUST_PID"
    echo "  Log:      $LOGDIR/rust-backend.log"
    echo "  Local:    http://localhost:$PORT/reservation"
    echo "  Public:   https://tc.bido.dev/reservation"
else
    echo "ERROR: Rust backend failed to start. Check $LOGDIR/rust-backend.log"
    exit 1
fi
