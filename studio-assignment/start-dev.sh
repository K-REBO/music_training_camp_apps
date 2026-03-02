#!/bin/bash

# 合宿スタジオ配置システム 検証用起動スクリプト

echo "🎸 合宿スタジオ配置システム 検証環境を起動します..."

# プロジェクトディレクトリに移動
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📂 プロジェクトディレクトリ: $SCRIPT_DIR"

# 依存関係をチェック・インストール
echo "📦 依存関係をチェックしています..."
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpmが見つかりません。npmを使用します..."
    PACKAGE_MANAGER="npm"
    INSTALL_CMD="npm install"
    RUN_CMD="npm run"
else
    PACKAGE_MANAGER="pnpm"
    INSTALL_CMD="pnpm install"
    RUN_CMD="pnpm"
fi

# 依存関係インストール
if [ ! -d "node_modules" ]; then
    echo "📥 依存関係をインストールしています..."
    $INSTALL_CMD
fi

# 既存のポート3000を使用中のプロセスを確認
echo "🔍 ポート3000の使用状況を確認しています..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  ポート3000が使用中です。プロセスを終了しています..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# 開発サーバー起動
echo "🚀 開発サーバーを起動しています..."
echo "   URL: http://localhost:3000"
echo "   終了するには Ctrl+C を押してください"
echo ""
echo "🎯 検証項目:"
echo "   1. 部屋数・時間枠数の変更"
echo "   2. バンドデータのファイル読み込み"
echo "   3. スケジュール生成"
echo "   4. スケジュール並び替え（ドラッグ&ドロップ、矢印ボタン）"
echo "   5. メンバー結合機能"
echo ""

# 開発サーバー起動（フォアグラウンドで実行）
exec $RUN_CMD dev --port 3000 --host