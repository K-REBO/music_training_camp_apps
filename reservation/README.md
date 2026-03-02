# 合宿予約システム (Camp Reservation System)

音楽合宿の練習室予約をリアルタイムに管理するシステムです。

## 🌟 主な機能

- **リアルタイム更新**: 複数のユーザーが同時に操作しても、即座に画面に反映されます。
- **柔軟な管理**: バンドごと、個人ごとの予約を管理し、制限設定も可能です。
- **管理者ダッシュボード**: 部屋の管理、メンバーやバンドの登録を簡単に行えます。
- **LINE連携**: 予約通知をLINEで受け取ることが可能です。

## 📖 ドキュメント一覧

- **[開発者ガイド](docs/DEVELOPMENT.md)**:
  - **ローカル開発環境の構築**: Nix、Deno、Bun、pnpmを使用したセットアップ手順。
  - **技術仕様**: システム設計、データベーススキーマ（KV）、WebSocketプロトコル。
  - **デプロイ**: 本番環境へのデプロイ方法。

## 🚀 最小構成での起動手順

1. **環境変数の準備**: `cp .env.example .env`
2. **依存関係のインストール**: `pnpm install`
3. **データベースの初期化**: `deno task seed`
4. **サーバーの起動**:
   - バックエンド: `deno task kv-server`
   - フロントエンド: `pnpm run dev`

詳細な手順については [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) をご覧ください。

---

## 🏗️ 技術スタック

- **Frontend**: SvelteKit (Svelte 5), TailwindCSS
- **Backend**: Deno KV, WebSocket
- **Testing**: Vitest (Unit), Playwright (E2E)
- **Runtimes**: Node.js, Deno, Bun

---

## ライセンス

MIT License
