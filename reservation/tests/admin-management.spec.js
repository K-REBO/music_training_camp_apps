import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/reservation';
const ADMIN_PASSWORD = 'admin123';

/**
 * 管理者（椎木知仁）としてログイン
 */
async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login`);

  // 名前入力 (id="name", placeholder="山田太郎")
  await page.locator('#name').fill('椎木知仁');

  // 学年選択 (id="grade")
  await page.locator('#grade').selectOption('その他');

  // ログインボタンをクリック → パスワードモーダルが表示される
  await page.locator('button[type="submit"]').click();

  // パスワードモーダルが開くのを待つ
  await expect(page.locator('text=管理者パスワード')).toBeVisible({ timeout: 5000 });

  // パスワード入力
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);

  // モーダルのログインボタンをクリック
  await page.locator('button:has-text("ログイン"):not([type="submit"])').click();

  // メインページへリダイレクトされるのを待つ
  await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });
}

// ============================================================
// テスト1: 管理者ログインで管理者リンクが表示されること
// ============================================================
test('管理者ログイン後にメインページで「管理者画面」リンクが表示される', async ({ page }) => {
  await loginAsAdmin(page);

  const adminLink = page.locator('a:has-text("管理者画面")');
  await expect(adminLink).toBeVisible({ timeout: 5000 });
});

// ============================================================
// テスト2: /reservation/admin にアクセスできること
// ============================================================
test('管理者が /reservation/admin にアクセスできる', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto(`${BASE_URL}/admin`);
  await expect(page).toHaveURL(/\/reservation\/admin/);

  // タブが表示されていること
  await expect(page.locator('button:has-text("バンド管理")')).toBeVisible();
  await expect(page.locator('button:has-text("メンバー管理")')).toBeVisible();
});

// ============================================================
// テスト3: 非ログインで /reservation/admin にアクセスするとリダイレクト
// ============================================================
test('未ログインで /reservation/admin にアクセスするとログインページにリダイレクト', async ({ page }) => {
  await page.goto(`${BASE_URL}/admin`);
  await expect(page).toHaveURL(/login/, { timeout: 5000 });
});

// ============================================================
// テスト4: メンバー追加・確認・削除
// ============================================================
test('管理者がメンバーを追加・削除できる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);

  // メンバー管理タブに切り替え
  await page.locator('button:has-text("メンバー管理")').click();

  // メンバー追加ボタンをクリック
  await page.locator('button:has-text("+ メンバー追加")').click();

  // モーダルが開いていることを確認
  await expect(page.locator('h3:has-text("メンバー追加")')).toBeVisible({ timeout: 3000 });

  // フォームに入力
  const testMemberName = `テスト太郎_${Date.now()}`;
  await page.locator('#member-name').fill(testMemberName);
  await page.locator('#member-grade').selectOption('その他');

  // 保存
  await page.locator('button:has-text("保存")').click();

  // モーダルが閉じ、テーブルに追加されたことを確認
  await expect(page.locator(`td:has-text("${testMemberName}")`)).toBeVisible({ timeout: 5000 });

  // 削除（ダイアログを事前に設定してからボタンをクリック）
  page.on('dialog', dialog => dialog.accept());
  const row = page.locator('tr').filter({ hasText: testMemberName });
  await row.locator('button:has-text("削除")').click();

  // 削除後にテーブルから消えていることを確認
  await expect(page.locator(`td:has-text("${testMemberName}")`)).not.toBeVisible({ timeout: 5000 });
});

// ============================================================
// テスト5: バンド追加・確認・削除
// ============================================================
test('管理者がバンドを追加・削除できる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);

  // バンド管理タブが最初から表示されている
  await expect(page.locator('button:has-text("バンド管理")')).toBeVisible();

  // バンド追加ボタンをクリック
  await page.locator('button:has-text("+ バンド追加")').click();

  // モーダルが開いていることを確認
  await expect(page.locator('h3:has-text("バンド追加")')).toBeVisible({ timeout: 3000 });

  // バンド名入力
  const testBandName = `テストバンド_${Date.now()}`;
  await page.locator('#band-name').fill(testBandName);

  // 保存
  await page.locator('button:has-text("保存")').click();

  // テーブルに追加されたことを確認
  await expect(page.locator(`td:has-text("${testBandName}")`)).toBeVisible({ timeout: 5000 });

  // 削除（ダイアログを事前に設定してからボタンをクリック）
  page.on('dialog', dialog => dialog.accept());
  const row = page.locator('tr').filter({ hasText: testBandName });
  await row.locator('button:has-text("削除")').click();

  // 削除後にテーブルから消えていることを確認
  await expect(page.locator(`td:has-text("${testBandName}")`)).not.toBeVisible({ timeout: 5000 });
});

// ============================================================
// テスト6: 「予約画面へ戻る」リンクが機能する
// ============================================================
test('管理者画面から予約画面へ戻れる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);

  await page.locator('a:has-text("予約画面へ戻る")').click();
  await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 5000 });
});
