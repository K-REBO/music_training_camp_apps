/**
 * サンプルデータシードスクリプト（匿名データ）
 *
 * 使い方:
 *   deno run --allow-read --allow-write --unstable-kv seed-sample.ts
 *
 * Deno KVサーバー (kv-server.ts) が起動していない状態で直接DBに書き込みます。
 * 初回セットアップや動作確認に使用してください。
 */

const kv = await Deno.openKv("./reservation.db");

// メンバーデータ（匿名サンプル）
const members = [
  // grade 1
  { name: "メンバー1", grade: "1年" },
  { name: "メンバー2", grade: "1年" },
  { name: "メンバー3", grade: "1年" },
  { name: "メンバー4", grade: "1年" },
  { name: "メンバー5", grade: "1年" },
  // grade 2
  { name: "メンバー6", grade: "2年" },
  { name: "メンバー7", grade: "2年" },
  { name: "メンバー8", grade: "2年" },
  { name: "メンバー9", grade: "2年" },
  { name: "メンバー10", grade: "2年" },
  // grade 3
  { name: "メンバー11", grade: "3年" },
  { name: "メンバー12", grade: "3年" },
  { name: "メンバー13", grade: "3年" },
  { name: "メンバー14", grade: "3年" },
  { name: "メンバー15", grade: "3年" },
  // 合宿係（管理者グループ）
  { name: "メンバー16", grade: "2年" },
  { name: "メンバー17", grade: "3年" },
  { name: "メンバー18", grade: "1年" },
  { name: "メンバー19", grade: "2年" },
  { name: "メンバー20", grade: "3年" },
];

// バンドデータ（匿名サンプル）
// 合宿係は管理者権限を持つ特殊バンド（config.json の band_restrictions 参照）
const bands = [
  {
    name: "バンドA",
    members: {
      "Vo.": "メンバー1",
      "Gt.1": "メンバー2",
      "Gt.2": "メンバー3",
      "Ba.": "メンバー4",
      "Dr.": "メンバー5",
    },
  },
  {
    name: "バンドB",
    members: {
      "Vo.": "メンバー6",
      "Gt.1": "メンバー7",
      "Ba.": "メンバー8",
      "Dr.": "メンバー9",
      "Key.": "メンバー10",
    },
  },
  {
    name: "バンドC",
    members: {
      "Vo.": "メンバー11",
      "Gt.1": "メンバー12",
      "Gt.2": "メンバー13",
      "Ba.": "メンバー14",
      "Dr.": "メンバー15",
    },
  },
  {
    name: "バンドD",
    members: {
      "Vo.": "メンバー1",
      "Gt.1": "メンバー6",
      "Ba.": "メンバー11",
      "Dr.": "メンバー2",
    },
  },
  {
    name: "バンドE",
    members: {
      "Vo.": "メンバー7",
      "Gt.1": "メンバー12",
      "Ba.": "メンバー3",
      "Dr.": "メンバー8",
      "Key.": "メンバー13",
    },
  },
  // 合宿係: イベント枠の予約権限を持つ管理者バンド
  {
    name: "合宿係",
    members: {
      "係1": "メンバー16",
      "係2": "メンバー17",
      "係3": "メンバー18",
      "係4": "メンバー19",
      "係5": "メンバー20",
    },
  },
];

// 部屋データ
const rooms = [
  { name: "イベント", description: "イベント会場", color: "#8b5cf6", type: "event" },
  { name: "スタジオA", description: "練習室", color: "#3b82f6", type: "studio" },
  { name: "スタジオB", description: "練習室", color: "#3b82f6", type: "studio" },
  { name: "スタジオC", description: "練習室", color: "#3b82f6", type: "studio" },
  { name: "スタジオD", description: "練習室", color: "#3b82f6", type: "studio" },
  { name: "スタジオE", description: "練習室", color: "#3b82f6", type: "studio" },
];

// 時間枠データ（24時間）
const timeSlots = [
  { startTime: "00:00", endTime: "01:00", duration: 60, displayName: "00:00-01:00" },
  { startTime: "01:00", endTime: "02:00", duration: 60, displayName: "01:00-02:00" },
  { startTime: "02:00", endTime: "03:00", duration: 60, displayName: "02:00-03:00" },
  { startTime: "03:00", endTime: "04:00", duration: 60, displayName: "03:00-04:00" },
  { startTime: "04:00", endTime: "05:00", duration: 60, displayName: "04:00-05:00" },
  { startTime: "05:00", endTime: "06:00", duration: 60, displayName: "05:00-06:00" },
  { startTime: "06:00", endTime: "07:00", duration: 60, displayName: "06:00-07:00" },
  { startTime: "07:00", endTime: "08:00", duration: 60, displayName: "07:00-08:00" },
  { startTime: "08:00", endTime: "09:00", duration: 60, displayName: "08:00-09:00" },
  { startTime: "09:00", endTime: "10:00", duration: 60, displayName: "09:00-10:00" },
  { startTime: "10:00", endTime: "11:00", duration: 60, displayName: "10:00-11:00" },
  { startTime: "11:00", endTime: "12:00", duration: 60, displayName: "11:00-12:00" },
  { startTime: "12:00", endTime: "13:00", duration: 60, displayName: "12:00-13:00" },
  { startTime: "13:00", endTime: "14:00", duration: 60, displayName: "13:00-14:00" },
  { startTime: "14:00", endTime: "15:00", duration: 60, displayName: "14:00-15:00" },
  { startTime: "15:00", endTime: "16:00", duration: 60, displayName: "15:00-16:00" },
  { startTime: "16:00", endTime: "17:00", duration: 60, displayName: "16:00-17:00" },
  { startTime: "17:00", endTime: "18:00", duration: 60, displayName: "17:00-18:00" },
  { startTime: "18:00", endTime: "19:00", duration: 60, displayName: "18:00-19:00" },
  { startTime: "19:00", endTime: "20:00", duration: 60, displayName: "19:00-20:00" },
  { startTime: "20:00", endTime: "21:00", duration: 60, displayName: "20:00-21:00" },
  { startTime: "21:00", endTime: "22:00", duration: 60, displayName: "21:00-22:00" },
  { startTime: "22:00", endTime: "23:00", duration: 60, displayName: "22:00-23:00" },
  { startTime: "23:00", endTime: "00:00", duration: 60, displayName: "23:00-24:00" },
];

async function seedData() {
  console.log("🌱 Starting database seeding...");

  // 既存データをクリア
  console.log("Clearing existing data...");
  const keys = ["members", "bands", "rooms", "timeslots", "reservations", "sessions"];
  for (const keyPrefix of keys) {
    const entries = kv.list({ prefix: [keyPrefix] });
    for await (const entry of entries) {
      await kv.delete(entry.key);
    }
  }

  // メンバー投入
  console.log("Seeding members...");
  for (const member of members) {
    const id = crypto.randomUUID();
    await kv.set(["members", id], {
      id,
      ...member,
      createdAt: new Date().toISOString(),
    });
  }

  // メンバー名 → ID マップを構築
  const memberMap = new Map<string, string>();
  for await (const entry of kv.list({ prefix: ["members"] })) {
    const m = entry.value as { id: string; name: string };
    memberMap.set(m.name, m.id);
  }

  // バンド投入
  console.log("Seeding bands...");
  for (const band of bands) {
    const id = crypto.randomUUID();
    const memberIds = [
      ...new Set(
        Object.values(band.members)
          .map((name) => memberMap.get(name))
          .filter(Boolean) as string[]
      ),
    ];
    await kv.set(["bands", id], {
      id,
      name: band.name,
      members: band.members,
      memberIds,
      createdAt: new Date().toISOString(),
    });
  }

  // 部屋投入
  console.log("Seeding rooms...");
  for (const room of rooms) {
    const id = crypto.randomUUID();
    await kv.set(["rooms", id], { id, ...room });
  }

  // 時間枠投入
  console.log("Seeding time slots...");
  for (const timeSlot of timeSlots) {
    const id = crypto.randomUUID();
    await kv.set(["timeslots", id], { id, ...timeSlot });
  }

  console.log("\n✅ Database seeding completed!");
  console.log("\n📊 Summary:");
  console.log(`  Members   : ${members.length}`);
  console.log(`  Bands     : ${bands.length} (including 合宿係 admin band)`);
  console.log(`  Rooms     : ${rooms.length}`);
  console.log(`  Time Slots: ${timeSlots.length}`);
}

if (import.meta.main) {
  await seedData();
  Deno.exit(0);
}
