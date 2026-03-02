# 開発者ガイド (Developer Guide)

このドキュメントでは、本プロジェクトのローカル開発環境のセットアップ、技術仕様、および開発ワークフローについて説明します。

---

## 🛠️ ローカル開発環境のセットアップ

本プロジェクトでは、フロントエンドに Node.js (pnpm/Bun)、バックエンドに Deno を使用します。

### 1. Nixを使用した環境構築 (推奨)

Nix を使用している場合、以下のコマンドで必要なツール一式（Node.js 20, pnpm, Deno, Bun）を揃えられます。

```bash
nix-shell -p nodejs_20 pnpm deno bun
```

プロジェクト専用の `shell.nix` を作成する場合は以下の内容を参考にしてください：

```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = with pkgs; [ nodejs_20 pnpm deno bun ];
}
```

### 2. 手動インストール

Nix を使用しない場合は、以下のランタイムを個別にインストールしてください。
- **Node.js**: 18.0以上 (LTS推奨)
- **pnpm**: `npm install -g pnpm`
- **Deno**: [公式ガイド](https://deno.land/#installation)
- **Bun**: [公式ガイド](https://bun.sh/)

---

## ⚙️ セットアップ手順

1. **依存関係のインストール**
   ```bash
   pnpm install
   ```

2. **環境変数の設定**
   `.env.example` を `.env` にコピーして設定します。
   ```bash
   cp .env.example .env
   ```
   - `ADMIN_PASSWORD`: 管理者ログイン用
   - `LINE_CHANNEL_ACCESS_TOKEN`: LINE通知用 (任意)

3. **データベースの初期化**
   ```bash
   deno task seed
   ```

---

## 🚀 開発サーバーの起動

開発時は以下の2つのサーバーを起動する必要があります。

- **バックエンド (KVサーバー)**:
  ```bash
  deno task kv-server
  ```
  `http://localhost:8001` で API と WebSocket が起動します。

- **フロントエンド (SvelteKit)**:
  ```bash
  pnpm run dev
  ```
  `http://localhost:5173` でアプリケーションが起動します。

---

## 🧪 テスト

- **単体テスト**: `pnpm run test`
- **E2Eテスト**: `pnpm run test:e2e` (初回は `pnpm exec playwright install` が必要)

---

## 🏗️ 技術仕様

### アーキテクチャ
- **フロントエンド**: SvelteKit (Svelte 5) + TailwindCSS
- **バックエンド**: Deno KV (HTTP API & WebSocket)
- **リアルタイム性**: WebSocket を介した予約状態・選択状態の全クライアントへのブロードキャスト

### データベーススキーマ (Deno KV)
| キーの形式 | 内容 |
| :--- | :--- |
| `["bands", id]` | バンド情報 |
| `["members", id]` | メンバー情報 |
| `["rooms", id]` | 練習室情報 |
| `["reservations", date, timeSlotId, roomId]` | 予約データ |
| `["selections", date, timeSlotId, roomId]` | 選択中の状態 (5秒で自動消去) |

---

## 🚀 デプロイ

本番環境では `run-reservation-nohup.sh` を使用してバックグラウンドで実行できます。

```bash
./run-reservation-nohup.sh
```

ログは `logs/reservation/` ディレクトリに出力されます。

---

## ⚠️ 本番DBの場所（重要）

**本番DBは `reservation/reservation.db` ではなく `shared/database/reservation.db` にあります。**

`run-reservation-nohup.sh` は kv-server を `shared/database/` をカレントディレクトリとして起動するため、
Deno KV が開くファイルは `shared/database/reservation.db` になります。

```
music_training_camp_apps/
├── reservation/
│   └── reservation.db   ← ダミー（空）。本番データはここではない
└── shared/
    └── database/
        ├── reservation.db      ← 本番データ（ここが正）
        ├── reservation.db-shm
        └── reservation.db-wal
```

### サーバー移行・再セットアップ時の注意

`git clone` 後にサービスを起動すると `shared/database/` が新規作成され、
空のDBでサーバーが立ち上がります。既存データを引き継ぐ場合は必ず以下を実行してください。

```bash
# 旧環境からDBをコピー
cp /path/to/old/shared/database/reservation.db    shared/database/
cp /path/to/old/shared/database/reservation.db-shm shared/database/
cp /path/to/old/shared/database/reservation.db-wal shared/database/
```

> `.db-shm` / `.db-wal` も一緒にコピーしないとデータが壊れる場合があります。
