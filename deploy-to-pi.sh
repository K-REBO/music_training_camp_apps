#!/bin/bash
set -e

# Phase 4: Rust バックエンド Pi デプロイスクリプト
#
# 使い方:
#   ./deploy-to-pi.sh            # ARM64 ビルド + Pi へ転送
#   ./deploy-to-pi.sh --no-build # ビルドをスキップして転送のみ
#
# 前提:
#   - ~/.ssh/config に nixpi の設定があること
#   - Pi は NixOS (aarch64)
#
# 仕組み:
#   nix build でクロスコンパイル → nix copy で Pi の Nix ストアへ転送
#   → glibc 含む全依存が Pi に揃うため、ライブラリのバージョン不一致なし

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVELTE_DIR="$SCRIPT_DIR/reservation"

PI_HOST="nixpi"
PI_APP_ROOT="/home/rpi/projects/music_training_camp_apps"

NO_BUILD=false
for arg in "$@"; do
    case $arg in
        --no-build) NO_BUILD=true ;;
    esac
done

echo "=== Phase 4: Rust バックエンド デプロイ ==="
echo "  Pi host:   $PI_HOST"
echo "  Pi path:   $PI_APP_ROOT"
echo ""

# ── 1. Nix クロスビルド（ARM64）──────────────────────────────────
if [ "$NO_BUILD" = false ]; then
    echo "[1/4] nix build: rust-backend-pi (ARM64 クロスコンパイル)..."
    nix build "$SCRIPT_DIR#rust-backend-pi" --out-link "$SCRIPT_DIR/result-server"
    echo "  ✓ $(readlink "$SCRIPT_DIR/result-server")"

    echo "[1/4] nix build: rust-backend-pi-import (データ移行用)..."
    nix build "$SCRIPT_DIR#rust-backend-pi-import" --out-link "$SCRIPT_DIR/result-import"
    echo "  ✓ $(readlink "$SCRIPT_DIR/result-import")"
else
    echo "[1/4] ビルドスキップ（--no-build）"
    if [ ! -L "$SCRIPT_DIR/result-server" ]; then
        echo "ERROR: result-server symlink が見つかりません。先に nix build を実行してください。"
        exit 1
    fi
fi

# ── 2. SvelteKit ビルド ────────────────────────────────────────
if [ "$NO_BUILD" = false ]; then
    echo "[2/4] SvelteKit 静的ビルド..."
    cd "$SVELTE_DIR"
    pnpm install --frozen-lockfile=false
    bun run build
    echo "  ✓ ビルド完了: $SVELTE_DIR/build/"
else
    echo "[2/4] SvelteKit ビルドスキップ（--no-build）"
fi

# ── 3. Nix ストアごと Pi へ転送 ────────────────────────────────
echo "[3/4] nix copy: Pi の Nix ストアへ転送中..."
nix copy --to "ssh://$PI_HOST" "$SCRIPT_DIR#rust-backend-pi"
nix copy --to "ssh://$PI_HOST" "$SCRIPT_DIR#rust-backend-pi-import"
echo "  ✓ Nix ストアのコピー完了"

# ── 4. Pi 上のセットアップ ─────────────────────────────────────
echo "[4/4] Pi 上のセットアップ..."

# バイナリへのシンボリックリンクを作成（Nix ストアパスを使用）
SERVER_STORE_PATH=$(nix path-info "$SCRIPT_DIR#rust-backend-pi")
IMPORT_STORE_PATH=$(nix path-info "$SCRIPT_DIR#rust-backend-pi-import")

ssh "$PI_HOST" "
    mkdir -p '$PI_APP_ROOT/rust-backend'
    ln -sf '$SERVER_STORE_PATH/bin/rust-backend' '$PI_APP_ROOT/rust-backend/rust-backend'
    ln -sf '$IMPORT_STORE_PATH/bin/import' '$PI_APP_ROOT/rust-backend/import'
    echo '  ✓ symlink: $PI_APP_ROOT/rust-backend/rust-backend -> $SERVER_STORE_PATH/bin/rust-backend'
"

# SvelteKit ビルド成果物を転送
echo "  → SvelteKit build/ 転送..."
ssh "$PI_HOST" "mkdir -p '$PI_APP_ROOT/reservation/build'"
rsync -az --delete \
    "$SVELTE_DIR/build/" \
    "$PI_HOST:$PI_APP_ROOT/reservation/build/"
echo "  ✓ $PI_APP_ROOT/reservation/build/"

echo ""
echo "=== デプロイ完了 ==="
echo ""
echo "次のステップ（初回のみ: データ移行）:"
echo "  ssh $PI_HOST 'cd $PI_APP_ROOT && bash reservation/scripts/migrate-to-sqlite-pi.sh'"
echo ""
echo "サービス再起動:"
echo "  ssh $PI_HOST 'cd $PI_APP_ROOT && bash reservation/run-reservation-nohup.sh'"
