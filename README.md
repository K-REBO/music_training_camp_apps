# Music Training Camp Apps

合宿向け予約管理システム

## アーキテクチャ

```
[ブラウザ]
    │ HTTP / WebSocket (/ws)
    ▼
[Rust バックエンド (Axum)]   ← ポート 8001
    │ 静的ファイル配信 (/reservation/*)
    │ REST API (/reservation/api/*)
    │ WebSocket (/ws)
    ▼
[SQLite]                     ← /data/reservation.db
```

- SvelteKit (adapter-static) のビルド成果物を Rust が静的ファイルとして配信
- WebSocket・LINE通知スケジューラーは Rust バックエンドに統合済み

---

## 開発環境セットアップ

開発環境は Nix Flakes で管理しています。

```bash
nix develop
# または
direnv allow
```

### フロントエンド開発 (SvelteKit)

```bash
cd reservation
pnpm install          # 依存インストール（pnpm を使用）
bun run dev           # 開発サーバー起動（bun run dev、pnpm dev は不可）
```

アクセス: http://localhost:5173/reservation

### バックエンド起動 (Rust)

```bash
cd rust-backend
DATABASE_URL=sqlite:./test.db cargo run
```

アクセス: http://localhost:8001

---

## 本番ビルド（ローカル確認）

```bash
# SvelteKit ビルド
cd reservation && pnpm install && bun run build

# Rust ビルド
cd rust-backend && SQLX_OFFLINE=true cargo build --release

# 起動
DATABASE_URL=sqlite:./data/reservation.db \
STATIC_DIR=./reservation/build \
./rust-backend/target/release/rust-backend
```

---

## Docker（推奨）

### ローカル開発

```bash
cp .env.example .env
# .env を編集

docker compose up --build
```

アクセス: http://localhost:8001/reservation

### 本番デプロイ (Raspberry Pi)

GitHub Actions で自動的に ARM64 イメージがビルドされ GHCR にプッシュされます。

```bash
# Raspberry Pi 上で
cd /home/rpi/music_training_camp_apps

cp .env.example .env
# .env に本番の値を設定

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

#### Cloudflare Tunnel セットアップ

```bash
# cloudflared ディレクトリに config.yml を配置
# TUNNEL_TOKEN 方式（推奨）: .env に CLOUDFLARE_TUNNEL_TOKEN を設定するだけでOK

# credentials-file 方式の場合:
# cloudflared/tunnel.json に認証情報を配置
# cloudflared/config.yml の tunnel: と credentials-file: を設定
```

---

## テスト

### Rust Integration Tests

```bash
cd rust-backend
SQLX_OFFLINE=true cargo test
```

### E2E テスト (Playwright)

```bash
cd reservation
PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/playwright \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
pnpm test:e2e --project=firefox tests/auth.spec.js
```

---

## 環境変数

`.env.example` を参照。主要な変数：

| 変数 | 説明 | デフォルト |
|---|---|---|
| `PORT` | Rust バックエンドのポート | `8001` |
| `DATABASE_URL` | SQLite DBパス | `sqlite:/data/reservation.db` |
| `STATIC_DIR` | SvelteKit ビルド成果物のパス | `./static` |
| `ADMIN_PASSWORD` | 椎木知仁のログインパスワード | `admin123` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 通知トークン | （空=無効） |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel トークン | — |

---

## 主要ファイル

| パス | 役割 |
|---|---|
| `rust-backend/src/main.rs` | エントリーポイント |
| `rust-backend/src/lib.rs` | アプリ構築ロジック（テストから参照） |
| `rust-backend/src/routes/` | REST API ルートハンドラー |
| `rust-backend/src/db.rs` | SQLite データアクセス層 |
| `rust-backend/src/scheduler.rs` | LINE 通知スケジューラー |
| `rust-backend/migrations/` | SQLite マイグレーション |
| `rust-backend/tests/` | Integration Tests |
| `reservation/src/routes/` | SvelteKit ページ |
| `reservation/tests/` | Playwright E2E テスト |
| `Dockerfile` | マルチステージビルド |
| `docker-compose.yml` | 開発用（ローカルビルド） |
| `docker-compose.prod.yml` | 本番用（GHCR イメージ） |
| `.github/workflows/build.yml` | ARM64 自動ビルド & GHCR プッシュ |

---

## トラブルシューティング

```bash
# コンテナログ確認
docker compose logs -f app
docker compose logs -f cloudflared

# ヘルスチェック
curl http://localhost:8001/health

# DB 確認
docker exec -it <container> sqlite3 /data/reservation.db ".tables"

# cargo test が sqlx offline エラーになる場合
cd rust-backend && cargo sqlx prepare
```
