/// <reference lib="deno.unstable" />
/**
 * LINE通知機能のユニットテスト（TDD Red フェーズ）
 */
import { assertEquals, assertExists } from "@std/assert/mod.ts";
import {
  findTargetSlotId,
  applyTemplate,
  checkAndSendNotifications,
  checkAndSendEventNotifications,
} from "./notification.ts";

// ============================================================
// findTargetSlotId のテスト
// ============================================================

Deno.test("08:55に実行すると09:00開始のスロットを返す", () => {
  // UTC 2024-01-15T23:55:00Z → JST 2024-01-16T08:55:00+09:00
  // 5分後 → JST 09:00 → timeslot-10
  const now = new Date("2024-01-15T23:55:00Z");
  const result = findTargetSlotId(now, 5);
  assertEquals(result, "timeslot-10");
});

Deno.test("分が00でなければnullを返す（08:50の5分後は08:55なのでnull）", () => {
  // UTC 2024-01-15T23:50:00Z → JST 08:50, 5分後は08:55（mm=55）
  const now = new Date("2024-01-15T23:50:00Z");
  const result = findTargetSlotId(now, 5);
  assertEquals(result, null);
});

Deno.test("JST 23:55に実行するとJST 00:00開始のスロット（timeslot-1）を返す", () => {
  // UTC 2024-01-15T14:55:00Z → JST 2024-01-15T23:55:00+09:00
  // 5分後 → JST 00:00（翌日） → timeslot-1
  const now = new Date("2024-01-15T14:55:00Z");
  const result = findTargetSlotId(now, 5);
  assertEquals(result, "timeslot-1");
});

Deno.test("JST 22:55に実行するとJST 23:00開始のスロット（timeslot-24）を返す", () => {
  // UTC 2024-01-15T13:55:00Z → JST 22:55, 5分後は23:00
  const now = new Date("2024-01-15T13:55:00Z");
  const result = findTargetSlotId(now, 5);
  assertEquals(result, "timeslot-24");
});

Deno.test("ちょうど整時（mm=00）で実行してもnullを返す（5分後が整時でないため）", () => {
  // UTC 2024-01-15T23:00:00Z → JST 08:00, 5分後は08:05（mm=05）
  const now = new Date("2024-01-15T23:00:00Z");
  const result = findTargetSlotId(now, 5);
  assertEquals(result, null);
});

// ============================================================
// buildNotificationMessage のテスト
// ============================================================

Deno.test("スタジオAの通知メッセージを正しく生成する", () => {
  const template = "{room}の練習時間が10分後に始まります！準備してください🎸";
  const message = applyTemplate(template, { room: "スタジオA", band: "バンド", hour: "9" });
  assertEquals(
    message,
    "スタジオAの練習時間が10分後に始まります！準備してください🎸",
  );
});

Deno.test("異なる部屋名でも正しく生成する", () => {
  const template = "{room}の練習時間が10分後に始まります！準備してください🎸";
  const message = applyTemplate(template, { room: "スタジオE", band: "バンド", hour: "10" });
  assertEquals(
    message,
    "スタジオEの練習時間が10分後に始まります！準備してください🎸",
  );
});

// ============================================================
// checkAndSendNotifications のテスト（インメモリKV使用）
// ============================================================

Deno.test("通知済みフラグがある場合はLINE送信をスキップする", async () => {
  const kv = await Deno.openKv(":memory:");

  // now = UTC 2024-01-15T23:55:00Z → JST 2024-01-16T08:55, 5分後=09:00
  const now = new Date("2024-01-15T23:55:00Z");
  const date = "2024-01-16";

  // 通知済みフラグを事前にセット
  await kv.set(
    ["notified", date, "room-2", "timeslot-10"],
    { notifiedAt: now.toISOString() },
  );

  // 予約も存在する（が通知済みフラグがあるのでスキップ）
  await kv.set(["reservations", date, "room-2", "timeslot-10"], {
    status: "active",
    bandId: "band-1",
    bandName: "テストバンド",
    roomId: "room-2",
    version: 1,
  });

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendNotifications(kv, now, "test-token");
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("lineUserId登録済みのメンバーにLINE通知を送る", async () => {
  const kv = await Deno.openKv(":memory:");

  // UTC 2024-01-15T23:50:00Z → JST 2024-01-16T08:50, 10分後=09:00 → timeslot-10
  const now = new Date("2024-01-15T23:50:00Z");
  const date = "2024-01-16";

  // 予約をセット（room-2 = スタジオA）
  await kv.set(["reservations", date, "room-2", "timeslot-10"], {
    status: "active",
    bandId: "band-1",
    bandName: "テストバンド",
    roomId: "room-2",
    version: 1,
  });

  // バンドをセット
  await kv.set(["bands", "band-1"], {
    id: "band-1",
    name: "テストバンド",
    memberIds: ["member-1", "member-2"],
  });

  // member-1: LINE登録済み、member-2: 未登録
  await kv.set(["members", "member-1"], {
    id: "member-1",
    name: "テスト太郎",
    grade: "中大1年",
    lineUserId: "Uabcdef1234567890",
  });
  await kv.set(["members", "member-2"], {
    id: "member-2",
    name: "テスト花子",
    grade: "中大2年",
    // lineUserId なし
  });

  const sentMessages: { lineUserId: string; message: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    sentMessages.push({
      lineUserId: body.to,
      message: body.messages[0].text,
    });
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendNotifications(kv, now, "test-token");

    // member-1のみ通知される（member-2はlineUserId未登録）
    assertEquals(sentMessages.length, 1);
    assertEquals(sentMessages[0].lineUserId, "Uabcdef1234567890");
    assertEquals(
      sentMessages[0].message,
      "スタジオAの練習時間が10分後に始まります！準備してください🎸",
    );

    // 通知済みフラグがセットされている
    const notifiedEntry = await kv.get([
      "notified",
      date,
      "room-2",
      "timeslot-10",
    ]);
    assertExists(notifiedEntry.value);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("キャンセル済み予約には通知しない", async () => {
  const kv = await Deno.openKv(":memory:");

  const now = new Date("2024-01-15T23:55:00Z");
  const date = "2024-01-16";

  // キャンセル済みの予約
  await kv.set(["reservations", date, "room-2", "timeslot-10"], {
    status: "cancelled",
    bandId: "band-1",
    roomId: "room-2",
    version: 1,
  });

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendNotifications(kv, now, "test-token");
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("LINEトークンが空の場合はfetchを呼ばない", async () => {
  const kv = await Deno.openKv(":memory:");

  const now = new Date("2024-01-15T23:55:00Z");
  const date = "2024-01-16";

  await kv.set(["reservations", date, "room-2", "timeslot-10"], {
    status: "active",
    bandId: "band-1",
    roomId: "room-2",
    version: 1,
  });
  await kv.set(["bands", "band-1"], {
    id: "band-1",
    name: "テストバンド",
    memberIds: ["member-1"],
  });
  await kv.set(["members", "member-1"], {
    id: "member-1",
    name: "テスト太郎",
    lineUserId: "Uabcdef1234567890",
  });

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    // トークン未設定（空文字列）
    await checkAndSendNotifications(kv, now, "");
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

// ============================================================
// checkAndSendEventNotifications のテスト
// ============================================================

/** イベント部屋設定を KV にセットするヘルパー */
async function setupEventRoomsConfig(kv: Deno.Kv) {
  await kv.set(["config", "rooms"], {
    ids: ["room-1", "room-2"],
    types: ["event", "studio"],
    names: ["メインホール", "スタジオA"],
  });
}

Deno.test("イベント部屋の予約開始10分前に全メンバーへ通知する", async () => {
  const kv = await Deno.openKv(":memory:");

  // UTC 2024-01-15T13:50:00Z → JST 2024-01-15T22:50, 10分後=23:00 → timeslot-24
  const now = new Date("2024-01-15T13:50:00Z");
  const date = "2024-01-15";

  await setupEventRoomsConfig(kv);

  await kv.set(["reservations", date, "room-1", "timeslot-24"], {
    status: "active",
    eventName: "全体ミーティング",
    description: "今夜23時から全体集合してください",
  });

  // 全メンバー2名（1名はLINE登録済み）
  await kv.set(["members", "m1"], { name: "田中", lineUserId: "Uaaa111" });
  await kv.set(["members", "m2"], { name: "山田" }); // LINE未登録

  const sentMessages: { to: string; text: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    sentMessages.push({ to: body.to, text: body.messages[0].text });
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendEventNotifications(kv, now, "test-token");

    // LINE登録済みの田中のみ通知
    assertEquals(sentMessages.length, 1);
    assertEquals(sentMessages[0].to, "Uaaa111");
    assertEquals(sentMessages[0].text, "「全体ミーティング」が始まります！🎶\n今夜23時から全体集合してください");

    // 通知済みフラグが立っている
    const notified = await kv.get(["notified", date, "room-1", "timeslot-24"]);
    assertExists(notified.value);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("descriptionがない場合はeventNameのみのメッセージを使用する", async () => {
  const kv = await Deno.openKv(":memory:");

  // UTC 2024-01-15T13:50:00Z → JST 22:50, 10分後=23:00 → timeslot-24
  const now = new Date("2024-01-15T13:50:00Z");
  const date = "2024-01-15";

  await setupEventRoomsConfig(kv);

  await kv.set(["reservations", date, "room-1", "timeslot-24"], {
    status: "active",
    eventName: "全体集合",
    // description なし
  });

  await kv.set(["members", "m1"], { name: "田中", lineUserId: "Uaaa111" });

  const sentMessages: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    sentMessages.push(body.messages[0].text);
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendEventNotifications(kv, now, "test-token");
    assertEquals(sentMessages.length, 1);
    assertEquals(sentMessages[0], "「全体集合」が始まります！🎶");
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("連続スロットの2番目以降は通知しない", async () => {
  const kv = await Deno.openKv(":memory:");

  // now = UTC 2024-01-15T15:00:00Z → JST 2024-01-16T00:00（timeslot-1）
  const now = new Date("2024-01-15T15:00:00Z");
  const date = "2024-01-16";

  await setupEventRoomsConfig(kv);

  // timeslot-1 に予約あり（今まさに開始）、かつ前のスロット timeslot-24 にも active 予約（連続）
  await kv.set(["reservations", date, "room-1", "timeslot-1"], {
    status: "active",
    eventName: "長時間イベント",
  });
  // 代わりに timeslot-2 が連続の場合をテスト（timeslot-1 も active なので2番目はスキップ）
  // UTC 2024-01-15T15:50:00Z → JST 2024-01-16T00:50, 10分後=01:00 → timeslot-2
  const now2 = new Date("2024-01-15T15:50:00Z");
  const date2 = "2024-01-16";
  await kv.set(["reservations", date2, "room-1", "timeslot-2"], {
    status: "active",
    eventName: "長時間イベント",
  });
  // timeslot-1 も active → timeslot-2 は連続スロットの2番目
  await kv.set(["reservations", date2, "room-1", "timeslot-1"], {
    status: "active",
    eventName: "長時間イベント",
  });

  await kv.set(["members", "m1"], { name: "田中", lineUserId: "Uaaa111" });

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendEventNotifications(kv, now2, "test-token");
    // timeslot-2 は timeslot-1 が active のため通知しない
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("イベント通知済みフラグがある場合はスキップする", async () => {
  const kv = await Deno.openKv(":memory:");

  // UTC 2024-01-15T13:50:00Z → JST 22:50, 10分後=23:00 → timeslot-24
  const now = new Date("2024-01-15T13:50:00Z");
  const date = "2024-01-15";

  await setupEventRoomsConfig(kv);

  await kv.set(["notified", date, "room-1", "timeslot-24"], {
    notifiedAt: now.toISOString(),
  });
  await kv.set(["reservations", date, "room-1", "timeslot-24"], {
    status: "active",
    eventName: "テストイベント",
  });
  await kv.set(["members", "m1"], { name: "田中", lineUserId: "Uaaa111" });

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendEventNotifications(kv, now, "test-token");
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});

Deno.test("イベント通知: 整時でない場合はスキップする", async () => {
  const kv = await Deno.openKv(":memory:");

  // mm=30 → findTargetSlotId(now, 0) = null
  const now = new Date("2024-01-15T14:30:00Z");

  await setupEventRoomsConfig(kv);

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    await checkAndSendEventNotifications(kv, now, "test-token");
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    kv.close();
  }
});
