import { test, expect } from '@playwright/test';

test('debug grade dropdown options', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // 全てのoption要素を取得
  const options = page.locator('select option');
  const optionCount = await options.count();
  console.log('🔢 Found', optionCount, 'option elements in grade select');
  
  for (let i = 0; i < optionCount; i++) {
    const option = options.nth(i);
    const text = await option.textContent();
    const value = await option.getAttribute('value');
    console.log(`  Option ${i}: text="${text}", value="${value}"`);
  }
  
  // selectタグのattributeも確認
  const selectElement = page.locator('select');
  const selectId = await selectElement.getAttribute('id');
  const selectClass = await selectElement.getAttribute('class');
  console.log(`📝 Select element: id="${selectId}", class="${selectClass}"`);
  
  // スクリーンショットを撮る
  await page.screenshot({ path: 'grade-dropdown-debug.png' });
  console.log('📷 Screenshot saved: grade-dropdown-debug.png');
});