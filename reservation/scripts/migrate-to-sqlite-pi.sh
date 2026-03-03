#!/bin/bash
set -e

# Pi 上でのデータ移行スクリプト: Deno KV → SQLite
#
# 実行前提:
#   - kv-server.ts が起動していること（Deno KV にデータがあること）
#   - rust-backend バイナリが APP_ROOT/rust-backend/rust-backend に配置済みであること
#   - このスクリプトは Pi 上で直接実行すること
#
# 使い方:
#   cd /home/rpi/music_training_camp_apps
#   bash reservation/scripts/migrate-to-sqlite-pi.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHARED_DB="$APP_ROOT/shared/database"
DUMP_FILE="$APP_ROOT/dump.json"
SQLITE_DB="$SHARED_DB/reservation_sqlite.db"
RUST_BINARY="$APP_ROOT/rust-backend/rust-backend"
IMPORT_BINARY="$APP_ROOT/rust-backend/import"

echo "=== Deno KV → SQLite データ移行 ==="
echo "  App root:  $APP_ROOT"
echo "  SQLite DB: $SQLITE_DB"
echo ""

# ── 確認 ───────────────────────────────────────────────────────
if [ -f "$SQLITE_DB" ]; then
    echo "警告: SQLite DB が既に存在します: $SQLITE_DB"
    read -p "上書きしますか？ (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "中断しました。"
        exit 0
    fi
    mv "$SQLITE_DB" "${SQLITE_DB}.bak.$(date +%Y%m%d%H%M%S)"
    echo "  既存 DB をバックアップしました。"
fi

# ── Step 1: Deno KV → dump.json ────────────────────────────────
echo "[1/2] Deno KV からデータをエクスポート..."

if ! pgrep -f "kv-server.ts" > /dev/null; then
    echo "ERROR: kv-server.ts が起動していません。"
    echo "  cd $SHARED_DB && deno run --allow-all $SCRIPT_DIR/kv-server.ts &"
    echo "  を実行してから再試行してください。"
    exit 1
fi

cd "$SHARED_DB"
deno run \
    --allow-read \
    --allow-write \
    --allow-net \
    --allow-env \
    --no-lock \
    "$SCRIPT_DIR/dump_kv.ts" > "$DUMP_FILE"

echo "  ✓ エクスポート完了: $DUMP_FILE"
echo "  $(wc -l < "$DUMP_FILE") 行"

# ── Step 2: dump.json → SQLite ─────────────────────────────────
echo "[2/2] SQLite にインポート..."

mkdir -p "$SHARED_DB"

DATABASE_URL="sqlite:$SQLITE_DB" \
    "$IMPORT_BINARY" --dump "$DUMP_FILE"

echo "  ✓ インポート完了: $SQLITE_DB"

echo ""
echo "=== 移行完了 ==="
echo ""
echo "次のステップ:"
echo "  bash $APP_ROOT/reservation/run-reservation-nohup.sh"
