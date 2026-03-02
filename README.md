# Music Training Camp Apps

合宿向け統合システム — 予約管理とスタジオ割り当て

## システム概要

| アプリ | URL | 状態 |
|---|---|---|
| 予約システム | https://your-domain.com/reservation | 稼働中 |
| スタジオ割り当て | https://your-domain.com/studio-assignment | 将来実装 |

## 開発環境セットアップ

開発環境は Nix Flakes で管理しています。

```bash
# Nix環境に入る
nix develop

# または direnv を使用（.envrc が自動的に環境を有効化）
direnv allow
```

## ローカル開発

```bash
cd reservation

# 依存関係のインストール（pnpm を使用）
pnpm install

# 開発サーバー起動（Bun で実行）
bun run dev
```

アクセス: http://localhost:5173/reservation

> **注意**: `pnpm dev` は使用不可。起動は必ず `bun run dev` で行う。

## アーキテクチャ

```
[ブラウザ]
    │ HTTP / WebSocket (/ws)
    ▼
[SvelteKit (Bun)]           ← bun run dev / bun ./build/index.js
    │ DataService
    ▼
[kv-server.ts (Deno)]       ← reservation/scripts/kv-server.ts
    │
    ▼
[reservation.db]            ← Deno KV / SQLite（本番DBは削除しないこと）
```

- WebSocket は同ホスト・同ポートの `/ws` エンドポイントを使用（旧ポート8001は廃止）
- 開発環境の WebSocket は Vite プラグイン (`vite-ws-plugin.ts`) が担当

## 本番ビルド・起動

```bash
cd reservation
pnpm install
bun run build
bun ./build/index.js
```

## E2E テスト

```bash
cd reservation
PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/playwright \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
pnpm test:e2e --project=firefox tests/<spec-file>.js
```

## データ管理

```bash
# 初回 or リセット: シードデータ投入（Deno KVサーバー起動中に実行）
cd reservation
bun scripts/migrate-deno-to-sqlite.ts   # 旧Deno KVからSQLiteへ移行
# または
bun scripts/seed-sqlite.ts              # 新規にシードを投入

# バックアップ
cp reservation.db backups/reservation-$(date +%Y%m%d).db
```

> **注意**: `reservation.db` は本番データが入っている。本番環境では絶対に削除しないこと。

## デプロイ（Raspberry Pi）

```bash
# Cloudflare Tunnel の設定反映
cloudflared tunnel ingress validate
sudo systemctl reload cloudflared
sudo systemctl status cloudflared

# ログ確認
sudo journalctl -u cloudflared -f
```

Cloudflare Tunnel の詳細設定は、ご自身の環境に合わせて `config.yml` の `ingress` ルールを設定してください。

## 主要ファイル

| パス | 役割 |
|---|---|
| `reservation/src/lib/server/data.ts` | DataService（全DB操作） |
| `reservation/src/lib/server/ws-manager.ts` | WebSocket接続管理 |
| `reservation/src/lib/server/vite-ws-plugin.ts` | Vite dev用WSプラグイン |
| `reservation/src/hooks.server.ts` | 認証ミドルウェア + handleWebsocket |
| `reservation/scripts/kv-server.ts` | Deno KVサーバー（本番DB管理） |
| `reservation/scripts/notification.ts` | LINE通知ロジック |

## トラブルシューティング

```bash
# ポート確認
sudo netstat -tlnp | grep :5173

# プロセス確認
ps aux | grep -E "(deno|bun|vite)"

# Cloudflare Tunnel確認
sudo systemctl status cloudflared
```
