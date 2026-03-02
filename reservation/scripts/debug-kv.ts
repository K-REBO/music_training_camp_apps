/**
 * Debug script to check KV database contents
 */

const kv = await Deno.openKv("./reservation.db");

console.log("🔍 Debugging KV database...");

// Test individual key access
console.log("\n1. Testing individual key access:");
const member1 = await kv.get(["members", "1"]);
console.log("Member 1:", member1);

// Test listing with prefix
console.log("\n2. Testing list with prefix ['members']:");
const memberEntries = [];
for await (const entry of kv.list({ prefix: ["members"] })) {
  console.log(`Found: ${JSON.stringify(entry.key)} = ${JSON.stringify(entry.value)}`);
  memberEntries.push(entry);
}
console.log(`Total member entries: ${memberEntries.length}`);

// Test listing all entries
console.log("\n3. Testing list with no prefix:");
const allEntries = [];
for await (const entry of kv.list({ prefix: [] })) {
  console.log(`Found: ${JSON.stringify(entry.key)} = ${JSON.stringify(entry.value)}`);
  allEntries.push(entry);
}
console.log(`Total entries: ${allEntries.length}`);

await kv.close();