# rust-backend

音楽合宿予約システムのバックエンドサーバー（Deno `kv-server.ts` の Rust 置き換え）

## 機能

- **HTTP API**: `GET/POST/DELETE /api/kv/*`, `PUT /api/kv/atomic`（kv-client.ts と互換）
- **WebSocket**: `/ws` エンドポイント（セル選択・予約のリアルタイム通知）
- **LINE 通知スケジューラー**: 1分ごとに10分前通知チェック
- **SQLite データストア**: `sqlx` + マイグレーション管理

## 開発

```bash
# 開発サーバー起動（ポート 8001）
DATABASE_URL=sqlite:./reservation_sqlite.db cargo run

# ファイル変更監視 + 自動リビルド
DATABASE_URL=sqlite:./reservation_sqlite.db cargo watch -x run

# マイグレーション実行
DATABASE_URL=sqlite:./reservation_sqlite.db sqlx migrate run

# sqlx オフラインキャッシュ再生成
DATABASE_URL=sqlite:./reservation_sqlite.db cargo sqlx prepare
```

## Deno KV からデータ移行

```bash
# Step 1: Deno KV をエクスポート（Deno サーバーが起動している必要はない）
cd ../reservation
deno run --allow-read --allow-write --allow-env --unstable-kv \
  scripts/dump_kv.ts --db ./reservation.db --out ./dump.json

# Step 2: SQLite にインポート
cd ../rust-backend
DATABASE_URL=sqlite:./reservation_sqlite.db \
  cargo run --bin import -- --dump ../reservation/dump.json

# Step 3: ドライランで確認
DATABASE_URL=sqlite:./reservation_sqlite.db \
  cargo run --bin import -- --dump ../reservation/dump.json --dry-run
```

## Raspberry Pi (ARM64) 向けクロスコンパイル

```bash
# nix develop 環境内で実行（ARM64 クロスコンパイラが自動設定される）
cargo build --release --target aarch64-unknown-linux-gnu

# Pi にデプロイ
scp target/aarch64-unknown-linux-gnu/release/rust-backend pi@raspberrypi:~/
```

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `8001` | サーバーポート |
| `DATABASE_URL` | `./reservation_sqlite.db` | SQLite データベースパス |
| `LINE_CHANNEL_ACCESS_TOKEN` | - | LINE Push API トークン（未設定で通知無効） |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` | CORS 許可オリジン |

## 並行稼働テスト（Phase 2 → Phase 3 移行時）

```bash
# Rust サーバーを別ポートで起動
PORT=8002 DATABASE_URL=sqlite:./reservation_sqlite.db cargo run --release

# SvelteKit から接続先を変更してテスト
KV_SERVER_URL=http://localhost:8002 bun run dev

# 動作確認後、本番の Deno サーバーを停止して 8001 に切り替え
PORT=8001 DATABASE_URL=sqlite:./reservation_sqlite.db ./rust-backend
```

## アーキテクチャ

```
SvelteKit (bun run dev/preview)
    ↓ HTTP /api/kv/* + WebSocket /ws
rust-backend (Axum + SQLite)
    ↓ LINE Push API
LINE サーバー
```

## メモリ使用量比較

| 項目 | Deno/Bun（旧） | Rust（新） |
|------|--------------|-----------|
| 常駐メモリ | 50〜100MB | 5〜10MB |
| 起動時間 | 2〜5秒 | <0.5秒 |
| GCスパイク | あり | なし |
