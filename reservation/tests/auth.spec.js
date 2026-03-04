import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/reservation';
const ADMIN_PASSWORD = 'admin123';

// 椎木知仁としてUIでログインするヘルパー（パスワードモーダルあり）
async function loginAsAdminViaUI(page, password = ADMIN_PASSWORD) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#name').fill('椎木知仁');
  await page.locator('#grade').selectOption('その他');
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('h3:has-text("管理者パスワード")')).toBeVisible({ timeout: 5000 });
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="button"]:has-text("ログイン")').click();
}

// ============================================================
// ログイン認証: 椎木知仁のパスワード認証
// ============================================================

test.describe('ログイン認証: 椎木知仁のパスワードモーダル', () => {
  test('正しいパスワードでログインできる', async ({ page }) => {
    await loginAsAdminViaUI(page, ADMIN_PASSWORD);

    await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });
  });

  test('誤ったパスワードではエラーが表示されてログインページに留まる', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#name').fill('椎木知仁');
    await page.locator('#grade').selectOption('その他');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('h3:has-text("管理者パスワード")')).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.locator('button[type="button"]:has-text("ログイン")').click();

    // APIエラー: 'パスワードが正しくありません'
    await expect(page.getByText('パスワードが正しくありません')).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/login/);
  });

  test('パスワード未入力のままログインボタンを押すとエラーが表示される', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#name').fill('椎木知仁');
    await page.locator('#grade').selectOption('その他');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('h3:has-text("管理者パスワード")')).toBeVisible({ timeout: 5000 });
    // パスワード未入力でログインボタンをクリック
    await page.locator('button[type="button"]:has-text("ログイン")').click();

    // UIバリデーション: 'パスワードを入力してください'
    await expect(page.getByText('パスワードを入力してください')).toBeVisible({ timeout: 3000 });
    // モーダルはまだ開いているか、ログインページに留まること
    await expect(page).toHaveURL(/login/);
  });
});

// ============================================================
// ログイン認証: 一般ユーザー
// ============================================================

test.describe('ログイン認証: 一般ユーザーのバリデーション', () => {
  test('未登録メンバー名でのログインはエラーになる', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#name').fill('存在しないユーザー_99999');
    await page.locator('#grade').selectOption('その他');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText('登録されていないメンバーです')).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/login/);
  });

  test('名前が空の場合はUIバリデーションでエラーになる', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    // 名前を入力せず学年だけ選択
    await page.locator('#grade').selectOption('その他');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText('名前と学年を入力してください')).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveURL(/login/);
  });

  test('学年が未選択の場合はUIバリデーションでエラーになる', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#name').fill('テストユーザー');
    // 学年を選択しない
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText('名前と学年を入力してください')).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveURL(/login/);
  });

  test('APIに空の名前・学年を送ると 400 が返る', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { name: '', grade: '' }
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ============================================================
// ログアウト
// ============================================================

test.describe('ログアウト', () => {
  test('ログアウト後に保護ページへアクセスするとログインへリダイレクトされる', async ({ page }) => {
    // 管理者としてUIログイン
    await loginAsAdminViaUI(page);
    await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });

    // ログアウトAPIを呼び出す（page.request はページのCookieを共有する）
    const logoutRes = await page.request.post(`${BASE_URL}/api/auth/logout`);
    expect(logoutRes.status()).toBe(200);

    // ログアウト後に保護ページ（/reservation/admin）へアクセス
    await page.goto(`${BASE_URL}/admin`);
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });

  test('ログアウト後にAPIエンドポイントが 401 を返す', async ({ request }) => {
    // 管理者ログイン
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { name: '椎木知仁', grade: 'その他', password: ADMIN_PASSWORD }
    });
    expect(loginRes.status()).toBe(200);

    // ログイン状態で管理者APIが 200 を返すことを確認
    const beforeRes = await request.get(`${BASE_URL}/api/members`);
    expect(beforeRes.status()).toBe(200);

    // ログアウト
    const logoutRes = await request.post(`${BASE_URL}/api/auth/logout`);
    expect(logoutRes.status()).toBe(200);
    const logoutBody = await logoutRes.json();
    expect(logoutBody.success).toBe(true);

    // ログアウト後は認証必須APIが 401 を返す
    const afterRes = await request.get(`${BASE_URL}/api/members`);
    expect(afterRes.status()).toBe(401);
  });

  test('未ログイン状態でのログアウトはエラーにならない', async ({ request }) => {
    // Cookieなしで直接ログアウト
    const res = await request.post(`${BASE_URL}/api/auth/logout`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('ログアウト後に再ログインできる', async ({ page }) => {
    // ログイン
    await loginAsAdminViaUI(page);
    await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });

    // ログアウト
    await page.request.post(`${BASE_URL}/api/auth/logout`);

    // 再ログイン
    await loginAsAdminViaUI(page);
    await expect(page).toHaveURL(/\/reservation\/?$/, { timeout: 10000 });
  });
});
