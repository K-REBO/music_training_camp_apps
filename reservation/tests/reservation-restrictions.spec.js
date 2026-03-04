/**
 * 予約制限・キャンセル権限 E2E テスト
 *
 * カバー範囲:
 *   - 未認証での予約作成 → 401
 *   - 同じスロットへの重複予約 → 409
 *   - 個人予約 (personal_ prefix) の作成・キャンセル
 *   - バンド予約キャンセル権限（本人・非メンバー・椎木知仁）
 *
 * 前提: サーバーが http://localhost:5173 で起動していること
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/reservation';
const ADMIN_PASSWORD = 'admin123';
// 遠い未来の日付を使用して本番データと衝突しない
const TEST_DATE = '2099-08-01';

// テストデータ（beforeAll で生成・afterAll でクリーンアップ）
let member1; // テストバンドに所属するメンバー
let member2; // テストバンドに所属しないメンバー
let testBand;
let rooms;
let timeSlots;

// テスト間でスロットが衝突しないよう各テストに専用インデックスを割り当てる
// （テストが途中で失敗しても afterAll でクリーンアップされる）
const SLOT = {
  DUPLICATE: 0,
  PERSONAL_CREATE: 1,
  PERSONAL_OWNER_CANCEL: 2,
  PERSONAL_OTHER_CANCEL: 3,
  BAND_OWN_CANCEL: 4,
  BAND_NONMEMBER_CANCEL: 5,
  SHIIKI_CANCEL: 6,
};

// ============================================================
// ヘルパー関数
// ============================================================

async function adminLogin(request) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { name: '椎木知仁', grade: 'その他', password: ADMIN_PASSWORD }
  });
  if (res.status() !== 200) throw new Error(`管理者ログイン失敗: status=${res.status()}`);
}

async function loginAs(request, member) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { name: member.name, grade: member.grade }
  });
  if (res.status() !== 200) {
    const body = await res.json();
    throw new Error(`ログイン失敗 (${member.name}): ${body.error}`);
  }
}

// 使用中でないスロット（roomId + timeSlotId）を slotIndex 番目で返す
async function getFreeSlot(request, slotIndex = 0) {
  const resData = await (await request.get(`${BASE_URL}/api/reservations?date=${TEST_DATE}`)).json();
  const reservedKeys = new Set((resData.data || []).map(r => `${r.roomId}:${r.timeSlotId}`));

  const studioRooms = rooms.filter(r => r.type === 'studio');
  const candidates = [];
  for (const room of studioRooms) {
    for (const ts of timeSlots) {
      if (!reservedKeys.has(`${room.id}:${ts.id}`)) {
        candidates.push({ roomId: room.id, timeSlotId: ts.id });
      }
    }
  }
  if (candidates.length <= slotIndex) {
    throw new Error(`空きスロットが不足しています (必要: index ${slotIndex}, 空き: ${candidates.length})`);
  }
  return candidates[slotIndex];
}

async function createReservation(request, { bandId, roomId, timeSlotId }) {
  const res = await request.post(`${BASE_URL}/api/reservations`, {
    data: { bandId, roomId, timeSlotId, date: TEST_DATE }
  });
  return { status: res.status(), body: await res.json() };
}

async function cancelReservation(request, reservation) {
  const params = new URLSearchParams({
    date: TEST_DATE,
    roomId: reservation.roomId,
    timeSlotId: reservation.timeSlotId,
    version: String(reservation.version)
  });
  const res = await request.delete(`${BASE_URL}/api/reservations/${reservation.id}?${params}`);
  return { status: res.status(), body: await res.json() };
}

// ============================================================
// テストデータのセットアップ / クリーンアップ
// ============================================================

test.beforeAll(async ({ request }) => {
  await adminLogin(request);

  const suffix = Date.now();

  // テスト用メンバー1（バンド所属）
  const m1Res = await request.post(`${BASE_URL}/api/members`, {
    data: { name: `テストM1_${suffix}`, grade: 'その他' }
  });
  expect(m1Res.status()).toBe(201);
  member1 = (await m1Res.json()).data;

  // テスト用メンバー2（バンド非所属）
  const m2Res = await request.post(`${BASE_URL}/api/members`, {
    data: { name: `テストM2_${suffix}`, grade: 'その他' }
  });
  expect(m2Res.status()).toBe(201);
  member2 = (await m2Res.json()).data;

  // テスト用バンド（member1 のみ所属）
  const bandRes = await request.post(`${BASE_URL}/api/bands`, {
    data: {
      name: `テストバンド_${suffix}`,
      members: { 'Gt.': member1.name },
      memberIds: [member1.id]
    }
  });
  expect(bandRes.status()).toBe(201);
  testBand = (await bandRes.json()).data;

  // 部屋一覧（認証不要）
  rooms = (await (await request.get(`${BASE_URL}/api/rooms`)).json()).data;
  // タイムスロット一覧（認証不要）
  timeSlots = (await (await request.get(`${BASE_URL}/api/timeslots`)).json()).data;

  if (!rooms?.length || !timeSlots?.length) {
    throw new Error('部屋またはタイムスロットのデータが取得できません。DBが初期化されているか確認してください。');
  }
});

test.afterAll(async ({ request }) => {
  await adminLogin(request);

  // TEST_DATE の残存予約を全件削除
  const resData = await (await request.get(`${BASE_URL}/api/reservations?date=${TEST_DATE}`)).json();
  for (const r of resData.data || []) {
    const params = new URLSearchParams({
      date: TEST_DATE,
      roomId: r.roomId,
      timeSlotId: r.timeSlotId,
      version: String(r.version)
    });
    await request.delete(`${BASE_URL}/api/reservations/${r.id}?${params}`);
  }

  if (testBand) await request.delete(`${BASE_URL}/api/bands/${testBand.id}`);
  if (member1) await request.delete(`${BASE_URL}/api/members/${member1.id}`);
  if (member2) await request.delete(`${BASE_URL}/api/members/${member2.id}`);
});

// ============================================================
// 認証境界テスト
// ============================================================

test.describe('認証境界: 未認証アクセス', () => {
  test('未ログインで予約を作成しようとすると 401 が返る', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/reservations`, {
      data: {
        bandId: testBand.id,
        roomId: rooms[0].id,
        timeSlotId: timeSlots[0].id,
        date: TEST_DATE
      }
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('未ログインで予約キャンセルを試みると 401 が返る', async ({ request }) => {
    const params = new URLSearchParams({
      date: TEST_DATE,
      roomId: rooms[0].id,
      timeSlotId: timeSlots[0].id,
      version: '1'
    });
    const res = await request.delete(`${BASE_URL}/api/reservations/dummy-id?${params}`);
    expect(res.status()).toBe(401);
  });

  test('未ログインで管理者専用APIにアクセスすると 401 が返る', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/members`);
    expect(res.status()).toBe(401);
  });

  test('一般ユーザーが管理者専用APIにアクセスすると 403 が返る', async ({ request }) => {
    await loginAs(request, member1);
    const res = await request.get(`${BASE_URL}/api/members`);
    expect(res.status()).toBe(403);
  });
});

// ============================================================
// 予約重複防止テスト
// ============================================================

test.describe('予約重複防止', () => {
  test('同じスロットに2回予約すると 409 が返る', async ({ request }) => {
    await loginAs(request, member1);
    const { roomId, timeSlotId } = await getFreeSlot(request, SLOT.DUPLICATE);

    const first = await createReservation(request, { bandId: testBand.id, roomId, timeSlotId });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    // 同じスロットに再度予約 → 409
    const second = await createReservation(request, { bandId: testBand.id, roomId, timeSlotId });
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);

    await cancelReservation(request, first.body.data);
  });

  test('必須パラメータが不足した予約は 400 が返る', async ({ request }) => {
    await loginAs(request, member1);
    // date が欠けている
    const res = await request.post(`${BASE_URL}/api/reservations`, {
      data: { bandId: testBand.id, roomId: rooms[0].id, timeSlotId: timeSlots[0].id }
    });
    expect(res.status()).toBe(400);
  });

  test('存在しない bandId での予約は 404 が返る', async ({ request }) => {
    await loginAs(request, member1);
    const { roomId, timeSlotId } = await getFreeSlot(request, SLOT.DUPLICATE);

    const res = await request.post(`${BASE_URL}/api/reservations`, {
      data: { bandId: 'non-existent-band-id', roomId, timeSlotId, date: TEST_DATE }
    });
    expect(res.status()).toBe(404);
  });
});

// ============================================================
// 個人予約テスト
// ============================================================

test.describe('個人予約 (personal_ prefix)', () => {
  test('個人予約を作成できる', async ({ request }) => {
    await loginAs(request, member1);
    const { roomId, timeSlotId } = await getFreeSlot(request, SLOT.PERSONAL_CREATE);

    const result = await createReservation(request, {
      bandId: `personal_${member1.id}`,
      roomId,
      timeSlotId
    });
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

    const reservation = result.body.data;
    expect(reservation.isPersonal).toBe(true);
    expect(reservation.bandName).toBe(`個人枠: ${member1.name}`);

    await cancelReservation(request, reservation);
  });

  test('個人予約を予約者本人がキャンセルできる', async ({ request }) => {
    await loginAs(request, member1);
    const { roomId, timeSlotId } = await getFreeSlot(request, SLOT.PERSONAL_OWNER_CANCEL);

    const created = await createReservation(request, {
      bandId: `personal_${member1.id}`,
      roomId,
      timeSlotId
    });
    expect(created.status).toBe(200);

    const cancelled = await cancelReservation(request, created.body.data);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
  });

  test('個人予約を他のユーザーはキャンセルできない (403)', async ({ browser }) => {
    // 2つのブラウザコンテキストで独立したセッションを管理する
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const req1 = ctx1.request;
      const req2 = ctx2.request;

      await req1.post(`${BASE_URL}/api/auth/login`, {
        data: { name: member1.name, grade: member1.grade }
      });
      await req2.post(`${BASE_URL}/api/auth/login`, {
        data: { name: member2.name, grade: member2.grade }
      });

      // member1 で個人予約を作成
      const { roomId, timeSlotId } = await getFreeSlot(req1, SLOT.PERSONAL_OTHER_CANCEL);
      const created = await createReservation(req1, {
        bandId: `personal_${member1.id}`,
        roomId,
        timeSlotId
      });
      expect(created.status).toBe(200);
      const reservation = created.body.data;

      // member2 がキャンセルを試みる → 403
      const cancelled = await cancelReservation(req2, reservation);
      expect(cancelled.status).toBe(403);
      expect(cancelled.body.success).toBe(false);

      // member1 で正常にキャンセル（クリーンアップ）
      await cancelReservation(req1, reservation);
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });
});

// ============================================================
// バンド予約キャンセル権限テスト
// ============================================================

test.describe('バンド予約キャンセル権限', () => {
  test('予約者本人がバンド予約をキャンセルできる', async ({ request }) => {
    await loginAs(request, member1);
    const { roomId, timeSlotId } = await getFreeSlot(request, SLOT.BAND_OWN_CANCEL);

    const created = await createReservation(request, { bandId: testBand.id, roomId, timeSlotId });
    expect(created.status).toBe(200);

    const cancelled = await cancelReservation(request, created.body.data);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
  });

  test('バンド非所属メンバーは他人のバンド予約をキャンセルできない (403)', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const req1 = ctx1.request;
      const req2 = ctx2.request;

      await req1.post(`${BASE_URL}/api/auth/login`, {
        data: { name: member1.name, grade: member1.grade }
      });
      await req2.post(`${BASE_URL}/api/auth/login`, {
        data: { name: member2.name, grade: member2.grade }
      });

      // member1 でバンド予約を作成
      const { roomId, timeSlotId } = await getFreeSlot(req1, SLOT.BAND_NONMEMBER_CANCEL);
      const created = await createReservation(req1, { bandId: testBand.id, roomId, timeSlotId });
      expect(created.status).toBe(200);
      const reservation = created.body.data;

      // member2 (バンド非所属) がキャンセルを試みる → 403
      const cancelled = await cancelReservation(req2, reservation);
      expect(cancelled.status).toBe(403);
      expect(cancelled.body.success).toBe(false);

      // クリーンアップ: member1 でキャンセル
      await cancelReservation(req1, reservation);
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('椎木知仁は他人のバンド予約もキャンセルできる', async ({ browser }) => {
    const ctxUser = await browser.newContext();
    const ctxAdmin = await browser.newContext();
    try {
      const reqUser = ctxUser.request;
      const reqAdmin = ctxAdmin.request;

      await reqUser.post(`${BASE_URL}/api/auth/login`, {
        data: { name: member1.name, grade: member1.grade }
      });
      await reqAdmin.post(`${BASE_URL}/api/auth/login`, {
        data: { name: '椎木知仁', grade: 'その他', password: ADMIN_PASSWORD }
      });

      // member1 でバンド予約を作成
      const { roomId, timeSlotId } = await getFreeSlot(reqUser, SLOT.SHIIKI_CANCEL);
      const created = await createReservation(reqUser, { bandId: testBand.id, roomId, timeSlotId });
      expect(created.status).toBe(200);
      const reservation = created.body.data;

      // 椎木知仁 (他人の予約) がキャンセルできる → 200
      const cancelled = await cancelReservation(reqAdmin, reservation);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.success).toBe(true);
    } finally {
      await ctxUser.close();
      await ctxAdmin.close();
    }
  });

  test('存在しない予約 ID のキャンセルは 404 が返る', async ({ request }) => {
    await loginAs(request, member1);
    const params = new URLSearchParams({
      date: TEST_DATE,
      roomId: rooms[0].id,
      timeSlotId: timeSlots[0].id,
      version: '1'
    });
    const res = await request.delete(`${BASE_URL}/api/reservations/non-existent-id?${params}`);
    expect(res.status()).toBe(404);
  });
});
