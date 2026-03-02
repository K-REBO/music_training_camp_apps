/// <reference lib="deno.unstable" />
/**
 * LINE通知機能
 * スタジオ予約の開始10分前にバンドメンバー全員へLINE Push通知を送る
 */

// スタジオ部屋ID一覧（room-1 はイベント列なので除外）
const STUDIO_ROOM_IDS = ["room-2", "room-3", "room-4", "room-5", "room-6"];

// 部屋名マッピング（config.tsにアクセスできないため定数として定義）
const ROOM_NAMES: Record<string, string> = {
  "room-2": "スタジオA",
  "room-3": "スタジオB",
  "room-4": "スタジオC",
  "room-5": "スタジオD",
  "room-6": "スタジオE",
};

/**
 * 現在時刻からN分後に開始するスロットIDを返す。
 * スケジュールは00:00から24:00まで1時間単位（mm=00のみマッチ）。
 * JST（UTC+9）で計算する。
 *
 * @param now - 現在のUTC時刻
 * @param advanceMinutes - 何分前に通知するか（例: 5）
 * @returns "timeslot-N"形式のID、またはnull（整時の advanceMinutes 分前でない場合）
 */
export function findTargetSlotId(
  now: Date,
  advanceMinutes: number,
): string | null {
  const jstOffset = 9 * 60 * 60 * 1000;
  const target = new Date(
    now.getTime() + jstOffset + advanceMinutes * 60 * 1000,
  );

  const m = target.getUTCMinutes().toString().padStart(2, "0");

  // スロットは整時（mm=00）開始のみマッチ
  if (m !== "00") return null;

  // 00:00 → timeslot-1, 01:00 → timeslot-2, ... 23:00 → timeslot-24
  const slotIndex = target.getUTCHours() + 1;
  return `timeslot-${slotIndex}`;
}

const DEFAULT_TEMPLATE = "{room}の練習時間が10分後に始まります！準備してください🎸";

/**
 * テンプレートにプレースホルダーを適用する。
 * {room} → 部屋名, {band} → バンド名, {hour} → 開始時刻(時)
 */
export function applyTemplate(
  template: string,
  vars: { room: string; band: string; hour: string },
): string {
  return template
    .replace(/\{room\}/g, vars.room)
    .replace(/\{band\}/g, vars.band)
    .replace(/\{hour\}/g, vars.hour);
}

/**
 * KVからテンプレートを取得してメッセージを生成する。
 */
async function buildNotificationMessage(
  kv: Deno.Kv,
  vars: { room: string; band: string; hour: string },
): Promise<string> {
  const result = await kv.get(["config", "line_template"]);
  const template = (result.value as string) || DEFAULT_TEMPLATE;
  return applyTemplate(template, vars);
}

/**
 * LINE Push APIでメッセージを送信する。
 *
 * @param lineUserId - 送信先LINEユーザーID（"U"で始まる文字列）
 * @param message - 送信するテキストメッセージ
 * @param token - LINE Channel Access Token
 */
export async function sendLinePushMessage(
  lineUserId: string,
  message: string,
  token: string,
): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} ${errorText}`);
  }
}

/** UTC時刻からJST日付文字列とJST Dateを返す */
function getJstDate(now: Date): { jstNow: Date; date: string } {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { jstNow, date: jstNow.toISOString().slice(0, 10) };
}

/** 翌日JST 0時までのミリ秒（KV TTL用） */
function calcTtlToNextJstMidnight(jstNow: Date): number {
  const tomorrow = new Date(jstNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime() - jstNow.getTime();
}

/**
 * 10分後に開始するスタジオ予約を検索し、バンドメンバー全員にLINE通知を送る。
 * 通知済みフラグで重複送信を防ぐ。
 *
 * @param kv - Deno KVインスタンス
 * @param now - 現在のUTC時刻
 * @param token - LINE Channel Access Token（空文字の場合は送信スキップ）
 */
export async function checkAndSendNotifications(
  kv: Deno.Kv,
  now: Date,
  token: string,
): Promise<void> {
  const slotId = findTargetSlotId(now, 10);
  if (!slotId) return; // 整時の10分前でなければスキップ

  const { jstNow, date } = getJstDate(now);
  // slotId = "timeslot-N" → N-1 が開始時刻（JST）
  const slotIndex = parseInt(slotId.replace("timeslot-", ""), 10);
  const hour = String(slotIndex - 1);

  for (const roomId of STUDIO_ROOM_IDS) {
    // 通知済みチェック
    const notifiedKey = ["notified", date, roomId, slotId];
    const notified = await kv.get(notifiedKey);
    if (notified.value) {
      continue; // 既に通知済み
    }

    // 予約データを取得
    const reservationEntry = await kv.get([
      "reservations",
      date,
      roomId,
      slotId,
    ]);
    const reservation = reservationEntry.value as {
      status: string;
      bandId: string;
      bandName: string;
    } | null;

    if (!reservation || reservation.status !== "active") {
      continue; // 予約なしまたはキャンセル済み
    }

    const roomName = ROOM_NAMES[roomId] || roomId;

    // バンド情報を取得
    const bandEntry = await kv.get(["bands", reservation.bandId]);
    const band = bandEntry.value as { memberIds: string[] } | null;

    if (!band || !Array.isArray(band.memberIds)) {
      console.warn(`⚠️ Band not found or invalid: ${reservation.bandId}`);
      continue;
    }

    // メッセージはメンバーループ外で1回だけ生成
    const message = await buildNotificationMessage(kv, {
      room: roomName,
      band: reservation.bandName || "",
      hour,
    });

    // 各メンバーへ通知
    if (!token) {
      console.log(`ℹ️ LINE_CHANNEL_ACCESS_TOKEN未設定のためスキップ`);
    } else {
      // Step 1: 全メンバーのKVを並列取得
      const memberEntries = await Promise.all(
        band.memberIds.map((memberId) => kv.get(["members", memberId])),
      );

      // Step 2: LINE登録済みメンバーのみ抽出
      const sendTargets = memberEntries
        .map((entry, i) => ({
          memberId: band.memberIds[i],
          member: entry.value as { name: string; lineUserId?: string } | null,
        }))
        .filter(({ member, memberId }) => {
          if (!member) {
            console.warn(`⚠️ Member not found: ${memberId}`);
            return false;
          }
          if (!member.lineUserId) {
            console.log(`ℹ️ LINE未登録のためスキップ: ${member.name}`);
            return false;
          }
          return true;
        });

      // Step 3: LINE送信を並列実行
      await Promise.all(
        sendTargets.map(async ({ member }) => {
          try {
            await sendLinePushMessage(member!.lineUserId!, message, token);
            console.log(
              `✅ LINE通知送信: ${member!.name} → ${roomName} ${slotId} (${date})`,
            );
          } catch (error) {
            console.error(`❌ LINE通知失敗: ${member!.name}:`, error);
          }
        }),
      );
    }

    // 通知済みフラグを設定（翌日JST 0時まで有効）
    const ttl = calcTtlToNextJstMidnight(jstNow);
    await kv.set(notifiedKey, { notifiedAt: now.toISOString() }, {
      expireIn: ttl,
    });

    console.log(
      `🔔 通知完了: ${roomName} ${slotId} on ${date}（TTL: ${Math.round(ttl / 3600000)}h）`,
    );
  }
}

/**
 * 開始10分前のイベント予約を検索し、全メンバーにLINE通知を送る。
 * 連続スロットの場合は最初のスロットのみ通知する。
 * 通知済みフラグで重複送信を防ぐ。
 *
 * @param kv - Deno KVインスタンス
 * @param now - 現在のUTC時刻
 * @param token - LINE Channel Access Token（空文字の場合は送信スキップ）
 */
export async function checkAndSendEventNotifications(
  kv: Deno.Kv,
  now: Date,
  token: string,
): Promise<void> {
  const slotId = findTargetSlotId(now, 10);
  if (!slotId) return; // 整時の10分前でなければスキップ

  const { jstNow, date } = getJstDate(now);
  const slotIndex = parseInt(slotId.replace("timeslot-", ""), 10);

  // イベント部屋IDを動的取得
  const roomsEntry = await kv.get(["config", "rooms"]);
  const roomsConfig = roomsEntry.value as {
    ids: string[];
    types: string[];
    names: string[];
  } | null;

  if (!roomsConfig || !Array.isArray(roomsConfig.ids)) {
    return;
  }

  const eventRoomIds = roomsConfig.ids.filter(
    (_, i) => roomsConfig.types[i] === "event",
  );
  const roomNameMap: Record<string, string> = Object.fromEntries(
    roomsConfig.ids.map((id, i) => [id, roomsConfig.names[i] || id]),
  );

  // 全メンバーをループ外で一度だけ取得（N+1防止）
  const allMembers: { name: string; lineUserId?: string }[] = [];
  for await (
    const entry of kv.list<{ name: string; lineUserId?: string }>(
      { prefix: ["members"] },
    )
  ) {
    if (entry.value) allMembers.push(entry.value);
  }

  for (const roomId of eventRoomIds) {
    // 通知済みチェック
    const notifiedKey = ["notified", date, roomId, slotId];
    const notified = await kv.get(notifiedKey);
    if (notified.value) {
      continue; // 既に通知済み
    }

    // 予約データを取得
    const reservationEntry = await kv.get([
      "reservations",
      date,
      roomId,
      slotId,
    ]);
    const reservation = reservationEntry.value as {
      status: string;
      eventName?: string;
      description?: string;
    } | null;

    if (!reservation || reservation.status !== "active") {
      continue; // 予約なしまたはキャンセル済み
    }

    // 連続スロット判定: 前のスロットが active なら skip（最初のスロットのみ通知）
    if (slotIndex > 1) {
      const prevEntry = await kv.get([
        "reservations",
        date,
        roomId,
        `timeslot-${slotIndex - 1}`,
      ]);
      const prevReservation = prevEntry.value as { status: string } | null;
      if (prevReservation && prevReservation.status === "active") {
        continue; // 連続スロットの2番目以降はスキップ
      }
    }

    // 通知メッセージを決定
    const roomName = roomNameMap[roomId] || roomId;
    const eventLabel = reservation.eventName || roomName;
    const message = reservation.description
      ? `「${eventLabel}」が始まります！🎶\n${reservation.description}`
      : `「${eventLabel}」が始まります！🎶`;

    // 全メンバーへ通知
    if (!token) {
      console.log(`ℹ️ LINE_CHANNEL_ACCESS_TOKEN未設定のためスキップ`);
    } else {
      const lineRegisteredMembers = allMembers.filter((m) => {
        if (!m.lineUserId) {
          console.log(`ℹ️ LINE未登録のためスキップ: ${m.name}`);
          return false;
        }
        return true;
      });

      await Promise.all(
        lineRegisteredMembers.map(async (member) => {
          try {
            await sendLinePushMessage(member.lineUserId!, message, token);
            console.log(
              `✅ イベント通知送信: ${member.name} → ${roomName} ${slotId} (${date})`,
            );
          } catch (error) {
            console.error(`❌ イベント通知失敗: ${member.name}:`, error);
          }
        }),
      );
    }

    // 通知済みフラグを設定（翌日JST 0時まで有効）
    const ttl = calcTtlToNextJstMidnight(jstNow);
    await kv.set(notifiedKey, { notifiedAt: now.toISOString() }, {
      expireIn: ttl,
    });

    console.log(
      `🔔 イベント通知完了: ${roomName} ${slotId} on ${date}（TTL: ${Math.round(ttl / 3600000)}h）`,
    );
  }
}
