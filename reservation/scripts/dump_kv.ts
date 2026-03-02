/// <reference lib="deno.unstable" />
/**
 * Deno KV エクスポートスクリプト
 * 全 KV エントリを dump.json に書き出す（Rust SQLite 移行用）
 *
 * 使用方法:
 *   deno run --allow-read --allow-write --allow-env --unstable-kv \
 *     scripts/dump_kv.ts [--db ./reservation.db] [--out ./dump.json]
 */

const args = Deno.args;

function getArg(flag: string, defaultValue: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const dbPath = getArg("--db", "./reservation.db");
const outPath = getArg("--out", "./dump.json");

console.log(`📂 Opening KV database: ${dbPath}`);
const kv = await Deno.openKv(dbPath);

interface DumpEntry {
  key: Deno.KvKey;
  value: unknown;
  versionstamp: string | null;
}

const entries: DumpEntry[] = [];
let count = 0;

// 全エントリをリスト
for await (const entry of kv.list({ prefix: [] })) {
  entries.push({
    key: Array.from(entry.key),
    value: entry.value,
    versionstamp: entry.versionstamp ?? null,
  });
  count++;

  if (count % 100 === 0) {
    console.log(`  ${count} entries read...`);
  }
}

console.log(`✅ Total entries: ${count}`);

// 統計情報を表示
const prefixCounts: Record<string, number> = {};
for (const entry of entries) {
  const prefix = String(entry.key[0] ?? "unknown");
  prefixCounts[prefix] = (prefixCounts[prefix] ?? 0) + 1;
}
console.log("\n📊 Prefix breakdown:");
for (const [prefix, cnt] of Object.entries(prefixCounts).sort()) {
  console.log(`  ${prefix}: ${cnt}`);
}

// JSON に書き出し
const dump = {
  exportedAt: new Date().toISOString(),
  dbPath,
  totalEntries: count,
  entries,
};

await Deno.writeTextFile(outPath, JSON.stringify(dump, null, 2));
console.log(`\n💾 Exported to: ${outPath}`);

kv.close();
