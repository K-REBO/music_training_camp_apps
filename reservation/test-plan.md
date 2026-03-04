# テスト計画書

**対象**: `reservation/` アプリ
**作成日**: 2026-03-03
**テスト種別**: E2E (Playwright/Firefox) および ユニットテスト (Vitest/Bun)

---

## 既存テストのカバレッジ概要

### E2E テスト (`tests/`)
| ファイル | カバー内容 |
|---|---|
| `admin-management.spec.js` | 管理者によるバンド・メンバーCRUD |
| `admin-rooms.spec.js` | 部屋の作成・編集・削除 |
| `selection-cancellation-test.spec.js` | 予約の選択とキャンセル（基本フロー） |
| `verify-server.spec.js` | サーバー起動確認 |
| `debug-grade-options.spec.js` | デバッグ用（学年選択肢の確認） |
| `debug-login.spec.js` | デバッグ用（ログイン画面の確認） |

### ユニットテスト (`src/**/___tests___/`)
| ファイル | カバー内容 |
|---|---|
| `line-utils.test.ts` | LINE通知ユーティリティ関数 |
| `line-template.test.ts` | `GET /api/config/line-template` |
| `pending.test.ts` | `GET /api/line/pending` |
| `webhook-post.test.ts` | `POST /api/line/webhook` |
| `member-put-line.test.ts` | `PUT /api/members/[id]` のLINE連携部分 |

---

## 未テスト項目（優先度順）

---

### 🔴 優先度: 高

#### 1. キャンセル権限ロジック `checkCancelPermission()`

**ファイル**: `src/routes/api/reservations/[id]/+server.ts:13-36`
**種別**: ユニットテスト
**理由**: 複雑な分岐を持つ権限チェック関数が完全に未テスト。誤りがあると不正キャンセルや正当なキャンセルの拒否が発生する。

テストすべきケース:
- [ ] `椎木知仁` は他人の予約も削除できる
- [ ] 予約者本人は常にキャンセル可能
- [ ] 個人枠 (`bandId.startsWith('personal_')`) は予約者本人のみキャンセル可能
- [ ] バンド枠はバンドメンバーならキャンセル可能（本人以外も可）
- [ ] 無関係ユーザーは 403 を返す

---

#### 2. 認証・認可の境界チェック

**ファイル**: `src/lib/server/admin-guard.ts`, 各 `+server.ts`
**種別**: ユニットテスト
**理由**: `requireAdmin()` は多数のエンドポイントで使われているが、関数自体のテストが皆無。未認証・非管理者でのアクセスが正しく拒否されるか担保できていない。

テストすべきケース:
- [ ] `requireAdmin()` — 未ログイン時に 401 を返す
- [ ] `requireAdmin()` — ログイン済み・非管理者で 403 を返す
- [ ] `requireAdmin()` — 管理者（`合宿係` メンバー）で `null` を返す
- [ ] 管理者専用エンドポイント (`/api/bands POST`, `/api/export/bands`, `/api/admin/*`) に一般ユーザーがアクセスして 403

---

#### 3. 予約作成の重複防止・バリデーション

**ファイル**: `src/routes/api/reservations/+server.ts`
**種別**: E2E テスト
**理由**: 同じ時間枠への重複予約を 409 で弾くロジックが存在するが、実際に機能するか確認するテストがない。

テストすべきケース:
- [ ] 同じ日付・部屋・タイムスロットに2回 POST → 2回目は 409
- [ ] `date` パラメータなしの GET → 400
- [ ] 未ログインで POST → 401
- [ ] 存在しない `bandId` で POST → 404
- [ ] 存在しない `roomId` / `timeSlotId` で POST → 404

---

#### 4. 個人予約（`personal_` prefix）の作成

**ファイル**: `src/routes/api/reservations/+server.ts:56-65`
**種別**: E2E テスト
**理由**: 通常バンド予約とは別のコードパス（`bandId.startsWith('personal_')` 分岐）が完全に未テスト。

テストすべきケース:
- [ ] `personal_` prefixのbandIdで予約を作成できる
- [ ] 個人予約の `bandName` が `個人枠: {ユーザー名}` になっている
- [ ] 個人予約を自分でキャンセルできる
- [ ] 個人予約を他人がキャンセルしようとすると 403

---

#### 5. ログイン認証（`椎木知仁` のパスワード認証）

**ファイル**: `src/routes/api/auth/login/+server.ts`
**種別**: ユニットテスト
**理由**: `椎木知仁` に対するパスワード検証ロジックが未テスト。誤りがあると管理者権限の不正取得または正当なログインの拒否が発生する。

テストすべきケース:
- [ ] 正しいパスワードで `椎木知仁` ログイン → 200
- [ ] 誤ったパスワードで `椎木知仁` ログイン → 401
- [ ] パスワードなしで `椎木知仁` ログイン → 400
- [ ] 登録されていないメンバー名でログイン → 401
- [ ] `name` / `grade` なしでログイン → 400

---

#### 6. ログアウト処理

**ファイル**: `src/routes/api/auth/logout/+server.ts`
**種別**: E2E テスト
**理由**: セッションクッキーの破棄が正しく行われるか未確認。ログアウト後に保護エンドポイントへのアクセスが 401 になることを確認する必要がある。

テストすべきケース:
- [ ] ログアウト後に `session_id` クッキーが削除される
- [ ] ログアウト後に認証必須 API へのアクセスが 401 になる
- [ ] 未ログイン状態でのログアウット POST が成功する（エラーにならない）

---

### 🟡 優先度: 中

#### 7. 全予約削除（`clear-reservations`）の認可

**ファイル**: `src/routes/api/admin/clear-reservations/+server.ts`
**種別**: ユニットテスト
**理由**: `requireAdmin()` を使わず独自の「合宿係」チェックを実装しており、他の管理者エンドポイントと認可ロジックが不統一。かつ未テスト。

テストすべきケース:
- [ ] 未ログインで DELETE → 401
- [ ] `合宿係` 非メンバーの管理者で DELETE → 403
- [ ] `合宿係` メンバーで DELETE → 200 かつ全予約が削除される

---

#### 8. スタジオ割り当て一括登録

**ファイル**: `src/routes/api/admin/studio-assignment/+server.ts`
**種別**: E2E テスト
**理由**: 複数予約を一括作成するバッチ処理で、部分成功・部分失敗のレスポンス形式が独自。動作確認がない。

テストすべきケース:
- [ ] 正常なアサインメント配列 → `created` に全件、`failed` は空
- [ ] 存在しない `bandId` を含む → そのエントリが `failed` に入る
- [ ] 重複スロットを含む → 重複分が `failed` に入り成功分は `created`
- [ ] 非管理者でアクセス → 403

---

#### 9. バンドの作成・重複チェック

**ファイル**: `src/routes/api/bands/+server.ts`
**種別**: ユニットテスト
**理由**: バンド名の重複チェック（409）と必須バリデーション（400）が未テスト。

テストすべきケース:
- [ ] 新規バンド作成 → 201
- [ ] 同名バンドを再度作成 → 409
- [ ] バンド名なしで POST → 400
- [ ] 非管理者で POST → 403

---

#### 10. フィードバックの送信・取得

**ファイル**: `src/routes/api/feedback/+server.ts`
**種別**: ユニットテスト
**理由**: フィードバック機能が完全に未テスト。

テストすべきケース:
- [ ] ログイン済みで POST → 201 かつ保存される
- [ ] 未ログインで POST → 401
- [ ] `type` / `title` / `description` が欠けた POST → 400
- [ ] ログイン済みで GET → フィードバック一覧が返る
- [ ] 未ログインで GET → 401

---

#### 11. バンドエクスポート

**ファイル**: `src/routes/api/export/bands/+server.ts`
**種別**: ユニットテスト
**理由**: ファイルダウンロード形式のレスポンスが正しいか確認が必要。

テストすべきケース:
- [ ] 管理者で GET → `Content-Type: application/json` かつ `Content-Disposition` ヘッダーが付く
- [ ] 非管理者で GET → 403
- [ ] レスポンスボディに `members` と `bands` と `exportedAt` が含まれる

---

#### 12. 設定取得 (`/api/config`)

**ファイル**: `src/routes/api/config/+server.ts`
**種別**: ユニットテスト
**理由**: 設定オブジェクトの構造（`app`, `features`, `reservation`, `schedule`, `rooms`, `restrictions`）が返されることが未検証。

テストすべきケース:
- [ ] GET → `success: true` かつ必須フィールドが揃っている
- [ ] `features.band_member_filtering` が boolean で返る

---

### 🟢 優先度: 低

#### 13. SSE イベント配信 (`/api/events`)

**ファイル**: `src/routes/api/events/+server.ts`, `src/lib/server/sse-manager.ts`
**種別**: E2E テスト
**理由**: 予約作成・キャンセル後に他クライアントへリアルタイム通知が届くかの確認。Playwright で複数ページを使うテストが必要。

テストすべきケース:
- [ ] 予約作成後に SSE で `reservation_created` イベントを受信する
- [ ] 予約キャンセル後に SSE で `reservation_cancelled` イベントを受信する

---

#### 14. タイムスロット取得 (`/api/timeslots`)

**ファイル**: `src/routes/api/timeslots/+server.ts`
**種別**: ユニットテスト
**理由**: シンプルな GET だが、レスポンス形式の確認が皆無。

テストすべきケース:
- [ ] GET → `success: true` かつ `data` が配列で返る

---

#### 15. メンバー削除後のバンド整合性

**ファイル**: `src/routes/api/members/[id]/+server.ts`
**種別**: E2E テスト
**理由**: メモリ上の注意事項に「メンバー削除時はバンドの `memberIds` を手動更新する必要がある（カスケード削除なし）」とある。この仕様が期待通りかの確認。

テストすべきケース:
- [ ] メンバー削除後、そのメンバーを含むバンドの `memberIds` に古い ID が残ることを確認（仕様として文書化）
- [ ] または管理者UIが削除後に不整合を起こさないことを E2E で確認

---

## テスト実装の推奨順序

1. **`checkCancelPermission()`** — 複雑な権限ロジックのユニットテスト（影響大）
2. **`requireAdmin()`** — 認可基盤のユニットテスト
3. **ログイン認証** — `椎木知仁` パスワード検証のユニットテスト
4. **予約重複防止** — E2E で 409 レスポンスを確認
5. **個人予約** — E2E で `personal_` prefix フローを確認
6. **ログアウト** — E2E でクッキー削除と 401 を確認
7. 以降は中・低優先度を順に

---

## テスト実行コマンド（参考）

```bash
# E2E テスト（Playwright/Firefox）
cd reservation && PLAYWRIGHT_BROWSERS_PATH=$HOME/.local/share/playwright \
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
  pnpm test:e2e --project=firefox tests/<spec-file>.spec.js

# ユニットテスト（Vitest）
cd reservation && pnpm test
```
