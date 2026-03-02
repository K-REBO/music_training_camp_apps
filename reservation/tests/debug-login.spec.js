import { test, expect } from '@playwright/test';

test('debug login form', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // ページ構造を詳しく確認
  console.log('📄 Page title:', await page.title());
  
  // 全ての入力要素を取得
  const inputs = page.locator('input');
  const inputCount = await inputs.count();
  console.log('🔢 Found', inputCount, 'input elements');
  
  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i);
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    const name = await input.getAttribute('name');
    console.log(`  Input ${i}: type=${type}, placeholder="${placeholder}", name="${name}"`);
  }
  
  // スクリーンショットを撮る
  await page.screenshot({ path: 'login-form.png' });
  console.log('📷 Screenshot saved: login-form.png');
  
  // 簡単なログインを試行
  const firstInput = inputs.first();
  await firstInput.fill('田中太郎');
  await page.waitForTimeout(1000);
  
  // ログインボタンをクリック
  const loginButton = page.locator('button:has-text("ログイン")');
  if (await loginButton.count() > 0) {
    await loginButton.click();
    await page.waitForTimeout(3000);
    
    console.log('📄 After login - Page title:', await page.title());
    
    // スクリーンショットを撮る
    await page.screenshot({ path: 'after-login.png' });
    console.log('📷 Screenshot saved: after-login.png');
  }
});