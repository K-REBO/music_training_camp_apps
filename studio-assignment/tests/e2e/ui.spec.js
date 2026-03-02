import { test, expect } from '@playwright/test';

test.describe('合宿スタジオ配置システム UI テスト', () => {
  test('ページが正常に読み込まれる', async ({ page }) => {
    await page.goto('/');
    
    // ページタイトルを確認
    await expect(page).toHaveTitle('合宿スタジオ配置システム');
    
    // メインヘッダーを確認
    await expect(page.locator('h1')).toContainText('合宿スタジオ配置システム');
  });

  test('設定セクションが表示される', async ({ page }) => {
    await page.goto('/');
    
    // 設定セクションの要素を確認
    await expect(page.locator('text=スタジオ設定')).toBeVisible();
    await expect(page.locator('input[id="rooms"]')).toBeVisible();
    await expect(page.locator('input[id="timeSlots"]')).toBeVisible();
    
    // デフォルト値を確認
    await expect(page.locator('input[id="rooms"]')).toHaveValue('4');
    await expect(page.locator('input[id="timeSlots"]')).toHaveValue('6');
  });

  test('タブ機能が動作する', async ({ page }) => {
    await page.goto('/');
    
    // タブが表示されていることを確認
    await expect(page.locator('button:has-text("スケジュール")')).toBeVisible();
    await expect(page.locator('button:has-text("バンド一覧")')).toBeVisible();
    
    // デフォルトでスケジュールタブがアクティブ
    await expect(page.locator('button:has-text("スケジュール")')).toHaveClass(/border-blue-500/);
    
    // バンド一覧タブをクリック
    await page.click('button:has-text("バンド一覧")');
    await expect(page.locator('button:has-text("バンド一覧")')).toHaveClass(/border-blue-500/);
  });

  test('制御ボタンが表示される', async ({ page }) => {
    await page.goto('/');
    
    // 各ボタンが存在することを確認
    await expect(page.locator('button:has-text("スケジュール生成")')).toBeVisible();
    await expect(page.locator('button:has-text("スケジュールクリア")')).toBeVisible();
    await expect(page.locator('button:has-text("JSON出力")')).toBeVisible();
    await expect(page.locator('button:has-text("サンプルデータ読み込み")')).toBeVisible();
    await expect(page.locator('button:has-text("全データクリア")')).toBeVisible();
  });

  test('サンプルデータ読み込み機能', async ({ page }) => {
    await page.goto('/');
    
    // 初期状態でバンド数が0
    await expect(page.locator('text=バンド数: 0')).toBeVisible();
    
    // サンプルデータを読み込み
    await page.click('button:has-text("サンプルデータ読み込み")');
    
    // バンド数が増加していることを確認
    await expect(page.locator('text=バンド数: 5')).toBeVisible();
    
    // バンド一覧タブに切り替えてバンドが表示されることを確認
    await page.click('button:has-text("バンド一覧")');
    await expect(page.locator('text=Nirvana')).toBeVisible();
    await expect(page.locator('text=東京事変')).toBeVisible();
  });

  test('スケジュール生成機能', async ({ page }) => {
    await page.goto('/');
    
    // サンプルデータを読み込み
    await page.click('button:has-text("サンプルデータ読み込み")');
    
    // スケジュール生成ボタンがアクティブになることを確認
    await expect(page.locator('button:has-text("スケジュール生成")')).not.toBeDisabled();
    
    // スケジュール生成を実行
    await page.click('button:has-text("スケジュール生成")');
    
    // スケジュール表示タブに切り替え
    await page.click('button:has-text("スケジュール")');
    
    // スケジュール表が表示されることを確認
    await expect(page.locator('text=スタジオ配置スケジュール')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Room 1")')).toBeVisible();
  });

  test('設定変更が機能する', async ({ page }) => {
    await page.goto('/');
    
    // 部屋数を変更
    await page.fill('input[id="rooms"]', '3');
    await expect(page.locator('text=最大配置可能バンド数: 18')).toBeVisible();
    
    // 時間枠数を変更
    await page.fill('input[id="timeSlots"]', '5');
    await expect(page.locator('text=最大配置可能バンド数: 15')).toBeVisible();
  });

  test('レスポンシブデザインが機能する', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // 要素が正常に表示されることを確認
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text=スタジオ設定')).toBeVisible();
    await expect(page.locator('button:has-text("スケジュール")')).toBeVisible();
  });
});