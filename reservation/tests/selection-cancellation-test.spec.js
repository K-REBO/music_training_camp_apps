import { test, expect } from '@playwright/test';

test.describe('Selection Cancellation Test', () => {
  test('should clear selection state when user cancels selection', async ({ browser }) => {
    console.log('🧪 Testing selection cancellation with two users...');
    
    // 2つのページを作成
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // コンソールログをキャプチャ
    const page1Logs = [];
    const page2Logs = [];
    
    page1.on('console', msg => {
      const text = msg.text();
      if (text.includes('🚫') || text.includes('📨 cell_deselected') || text.includes('🖱️') || text.includes('🗂️')) {
        page1Logs.push(`[User1] ${text}`);
        console.log(`[User1] ${text}`);
      }
    });
    
    page2.on('console', msg => {
      const text = msg.text();
      if (text.includes('🚫') || text.includes('📨 cell_deselected') || text.includes('🖱️') || text.includes('🗂️')) {
        page2Logs.push(`[User2] ${text}`);
        console.log(`[User2] ${text}`);
      }
    });
    
    // User1 (田中太郎) でログイン
    console.log('📝 Logging in User1 (田中太郎)...');
    await page1.goto('http://localhost:5173');
    
    // 名前を入力
    await page1.fill('input[type="text"]', '田中太郎');
    
    // 学年を選択
    await page1.selectOption('select', '中大1年');
    
    await page1.click('button:has-text("ログイン")');
    await page1.waitForTimeout(3000);
    
    // User2 (佐藤花子) でログイン  
    console.log('📝 Logging in User2 (佐藤花子)...');
    await page2.goto('http://localhost:5173');
    
    // 名前を入力
    await page2.fill('input[type="text"]', '佐藤花子');
    
    // 学年を選択
    await page2.selectOption('select', '中大1年');
    
    await page2.click('button:has-text("ログイン")');
    await page2.waitForTimeout(3000);
    
    // ログイン成功を確認
    console.log('✅ Checking login success...');
    const page1Title = await page1.title();
    console.log('📄 User1 Page title:', page1Title);
    
    if (page1Title.includes('ログイン')) {
      console.log('❌ Login failed - still on login page');
      await page1.screenshot({ path: 'login-failed-user1.png' });
      await page2.screenshot({ path: 'login-failed-user2.png' });
      throw new Error('Login failed - users are still on login page');
    }

    // User1: バンド選択
    console.log('🎵 User1 selecting band...');
    const thunderStrikeBand = page1.locator('text=Thunder Strike').first();
    if (await thunderStrikeBand.count() > 0) {
      await thunderStrikeBand.click();
    } else {
      console.log('❌ Thunder Strike not found, trying first available band...');
      const bandButtons = page1.locator('button').filter({ hasText: /バンド|Band/ });
      if (await bandButtons.count() > 0) {
        await bandButtons.first().click();
      }
    }
    await page1.waitForTimeout(500);
    
    // User2: バンド選択  
    console.log('🎵 User2 selecting band...');
    const midnightBlueBand = page2.locator('text=Midnight Blue').first();
    if (await midnightBlueBand.count() > 0) {
      await midnightBlueBand.click();
    } else {
      console.log('❌ Midnight Blue not found, trying second available band...');
      const bandButtons = page2.locator('button').filter({ hasText: /バンド|Band/ });
      if (await bandButtons.count() > 1) {
        await bandButtons.nth(1).click();
      } else if (await bandButtons.count() > 0) {
        await bandButtons.first().click();
      }
    }
    await page2.waitForTimeout(500);

    // User1: 特定のセルをdata-testidで確実に選択
    console.log('👆 User1 selecting cell...');
    
    // data-testidを使用して最初の利用可能なセルを見つける
    const allCells = page1.locator('td[data-testid^="reservation-cell-"]');
    const cellCount = await allCells.count();
    console.log(`🔍 Found ${cellCount} total cells`);
    
    let targetCell = null;
    let targetTestId = null;
    
    // 利用可能なセルを見つける
    for (let i = 0; i < cellCount; i++) {
      const cell = allCells.nth(i);
      const text = await cell.textContent();
      if (text && text.includes('クリックして予約')) {
        targetCell = cell;
        targetTestId = await cell.getAttribute('data-testid');
        console.log(`🎯 Found target cell: ${targetTestId}`);
        break;
      }
    }
    
    if (!targetCell) {
      await page1.screenshot({ path: 'no-available-cells.png' });
      throw new Error('No available cells found');
    }
    
    await targetCell.click();
    await page1.waitForTimeout(2000);
    
    // User1で黄色いハイライト（自分の選択中）を確認
    console.log('🟡 Checking User1 has yellow highlight...');
    const yellowCells1 = page1.locator('td.bg-yellow-400');
    await expect(yellowCells1).toHaveCount(1);
    
    // User2で赤いハイライト（他人の選択中）を確認
    console.log('🔴 Checking User2 has red highlight...');
    const redCells2 = page2.locator('td.bg-red-400');
    await expect(redCells2).toHaveCount(1);
    
    console.log('✅ Initial selection working correctly');
    
    // User1: 同じセルをクリックして選択をキャンセル
    console.log(`🚫 User1 cancelling selection by clicking same cell (${targetTestId})...`);
    const sameCell = page1.locator(`td[data-testid="${targetTestId}"]`);
    await sameCell.click();
    await page1.waitForTimeout(2000);
    
    // User1で黄色いハイライトが消えることを確認
    console.log('🟡 Checking User1 yellow highlight cleared...');
    const yellowCellsAfter1 = page1.locator('td.bg-yellow-400');
    await expect(yellowCellsAfter1).toHaveCount(0);
    
    // User2で赤いハイライトが消えることを確認
    console.log('🔴 Checking User2 red highlight cleared...');
    const redCellsAfter2 = page2.locator('td.bg-red-400');
    await expect(redCellsAfter2).toHaveCount(0);
    
    console.log('✅ Selection cancellation successful!');
    
    // ログを出力
    console.log('\n📊 Captured Console Messages:');
    console.log('User1 messages:', page1Logs.length);
    console.log('User2 messages:', page2Logs.length);
    
    // クリーンアップ
    await context1.close();
    await context2.close();
  });
});