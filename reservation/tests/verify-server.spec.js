import { test, expect } from '@playwright/test';

test('サーバーが起動して基本的なページが表示される', async ({ page }) => {
  // メインページにアクセス
  await page.goto('http://localhost:5173/reservation');

  // ページタイトルが存在することを確認
  await expect(page).toHaveTitle(/.*/, { timeout: 10000 });

  // ページが読み込まれたことを確認（bodyが存在する）
  const body = await page.locator('body');
  await expect(body).toBeVisible();

  // スクリーンショットを撮影
  await page.screenshot({ path: 'tests/server-verification.png', fullPage: true });

  console.log('✅ サーバーが正常に動作しています');
});
