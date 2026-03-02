import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/reservation';
const ADMIN_PASSWORD = 'admin123';

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#name').fill('椎木知仁');
  await page.locator('#grade').selectOption('その他');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('text=管理者パスワード')).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button:has-text("ログイン"):not([type="submit"])').click();
  await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });
}

// ============================================================
// テスト1: 部屋管理タブが表示される
// ============================================================
test('管理者が部屋管理タブを表示できる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);

  await expect(page.locator('button:has-text("部屋管理")')).toBeVisible();
  await page.locator('button:has-text("部屋管理")').click();
  await expect(page.locator('h2:has-text("部屋管理")')).toBeVisible({ timeout: 3000 });

  // デフォルト部屋が表示されていることを確認
  await expect(page.locator('td:has-text("スタジオA")')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'イベント', exact: true })).toBeVisible();
});

// ============================================================
// テスト2: スタジオ追加・削除
// ============================================================
test('管理者がスタジオを追加・削除できる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);
  await page.locator('button:has-text("部屋管理")').click();

  // スタジオ追加
  await page.locator('button:has-text("+ スタジオ追加")').click();
  await expect(page.locator('h3:has-text("スタジオ追加")')).toBeVisible({ timeout: 3000 });
  await page.locator('#room-name-input').fill('テストスタジオ');
  await page.getByRole('button', { name: '追加', exact: true }).click();

  // 追加されたことを確認
  await expect(page.locator('td:has-text("テストスタジオ")')).toBeVisible({ timeout: 5000 });

  // 削除（末尾の削除ボタン）
  page.on('dialog', dialog => dialog.accept());
  const row = page.locator('tr').filter({ hasText: 'テストスタジオ' });
  await row.locator('button:has-text("削除")').click();

  // 削除後に消えていることを確認
  await expect(page.locator('td:has-text("テストスタジオ")')).not.toBeVisible({ timeout: 5000 });
});

// ============================================================
// テスト3: スタジオ名前変更
// ============================================================
test('管理者がスタジオの名前を変更できる', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);
  await page.locator('button:has-text("部屋管理")').click();

  // スタジオAの名前変更
  const firstStudioRow = page.locator('tr').filter({ hasText: 'スタジオA' });
  await firstStudioRow.locator('button:has-text("名前変更")').click();

  await expect(page.locator('h3:has-text("名前変更")')).toBeVisible({ timeout: 3000 });
  await page.locator('#room-name-input').clear();
  await page.locator('#room-name-input').fill('スタジオX');
  await page.locator('button:has-text("保存")').click();

  // 名前が変更されたことを確認
  await expect(page.locator('td:has-text("スタジオX")')).toBeVisible({ timeout: 5000 });

  // 元の名前に戻す
  const changedRow = page.locator('tr').filter({ hasText: 'スタジオX' });
  await changedRow.locator('button:has-text("名前変更")').click();
  await page.locator('#room-name-input').clear();
  await page.locator('#room-name-input').fill('スタジオA');
  await page.locator('button:has-text("保存")').click();

  await expect(page.locator('td:has-text("スタジオA")')).toBeVisible({ timeout: 5000 });
});

// ============================================================
// テスト4: イベント列には編集・削除ボタンが表示されない
// ============================================================
test('イベント列には名前変更ボタンが表示されない', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin`);
  await page.locator('button:has-text("部屋管理")').click();

  // イベント行（🔒マーク付き）には名前変更ボタンが表示されないことを確認
  const eventRow = page.locator('tr').filter({ hasText: '🔒 イベント' });
  await expect(eventRow).toBeVisible({ timeout: 3000 });
  await expect(eventRow.locator('button:has-text("名前変更")')).not.toBeVisible();
  await expect(eventRow.locator('button:has-text("削除")')).not.toBeVisible();
});
