- pnpmを利用すること（パッケージインストールのみ。実行は bun run）
- ユーザにブラウザを開いてコンソールログを確認させることはボトルネックになりかねないので、検証にはPlaywright(firefox)を利用する
- 開発環境はNix Flakesで管理しているため、`nix develop`または`direnv`を使用して環境を有効化すること

## アーキテクチャ（Phase 4 完了後）

- `reservation/` — SvelteKit (adapter-static) フロントエンド
- `rust-backend/` — Axum + SQLite バックエンド（REST API + WebSocket + LINE通知）
- Docker マルチステージビルドで1コンテナに統合
- GitHub Actions で ARM64 イメージを自動ビルドして GHCR にプッシュ

## 開発サーバー起動

```bash
# フロントエンド
cd reservation && bun run dev

# バックエンド
cd rust-backend && DATABASE_URL=sqlite:./test.db cargo run
```

## ビルド確認

```bash
# SvelteKit ビルド
cd reservation && bun run build

# Rust ビルド + テスト
cd rust-backend && SQLX_OFFLINE=true cargo build && cargo test
```

## E2E テスト実行

```bash
cd reservation
PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/playwright \
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
  pnpm test:e2e --project=firefox tests/<spec-file>.js
```
