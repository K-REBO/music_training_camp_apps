#!/usr/bin/env deno run --allow-read --allow-write

// @reservation.dbの中身を確認するスクリプト

console.log('🔍 Checking @reservation.db contents...');

try {
  const kv = await Deno.openKv();

  // 全データの概要を取得
  console.log('\n📊 Database Overview:');
  
  // 部屋データを確認
  console.log('\n🏠 ROOMS:');
  const roomEntries = kv.list({ prefix: ["rooms"] });
  let roomCount = 0;
  for await (const entry of roomEntries) {
    roomCount++;
    const room = entry.value;
    console.log(`  ID ${room.id}: ${room.name} (${room.type}) - ${room.description}`);
  }
  console.log(`  Total rooms: ${roomCount}`);

  // メンバーデータを確認
  console.log('\n👥 MEMBERS:');
  const memberEntries = kv.list({ prefix: ["members"] });
  let memberCount = 0;
  for await (const entry of memberEntries) {
    memberCount++;
    if (memberCount <= 5) { // 最初の5人だけ表示
      const member = entry.value;
      console.log(`  ${member.name} (${member.grade})`);
    }
  }
  console.log(`  Total members: ${memberCount}`);

  // バンドデータを確認
  console.log('\n🎸 BANDS:');
  const bandEntries = kv.list({ prefix: ["bands"] });
  let bandCount = 0;
  for await (const entry of bandEntries) {
    bandCount++;
    if (bandCount <= 5) { // 最初の5バンドだけ表示
      const band = entry.value;
      console.log(`  ${band.name}: ${Object.keys(band.members || {}).length} members`);
    }
  }
  console.log(`  Total bands: ${bandCount}`);

  // 予約データを確認
  console.log('\n📅 RESERVATIONS:');
  const reservationEntries = kv.list({ prefix: ["reservations"] });
  let reservationCount = 0;
  const reservationsByDate = new Map();
  
  for await (const entry of reservationEntries) {
    reservationCount++;
    const reservation = entry.value;
    
    if (!reservationsByDate.has(reservation.date)) {
      reservationsByDate.set(reservation.date, []);
    }
    reservationsByDate.get(reservation.date).push(reservation);
  }
  
  console.log(`  Total reservations: ${reservationCount}`);
  
  // 日付別予約数を表示
  if (reservationsByDate.size > 0) {
    console.log('\n📅 Reservations by date:');
    Array.from(reservationsByDate.keys())
      .sort()
      .forEach(date => {
        const dateReservations = reservationsByDate.get(date);
        console.log(`  ${date}: ${dateReservations.length} reservations`);
        
        // 各日の最初の3つの予約を表示
        dateReservations.slice(0, 3).forEach(res => {
          console.log(`    - ${res.bandName || 'Unknown'} @ ${res.roomName || 'Unknown'}`);
        });
        if (dateReservations.length > 3) {
          console.log(`    ... and ${dateReservations.length - 3} more`);
        }
      });
  }

  // タイムスロットデータを確認
  console.log('\n⏰ TIME SLOTS:');
  const timeSlotEntries = kv.list({ prefix: ["timeSlots"] });
  let timeSlotCount = 0;
  for await (const entry of timeSlotEntries) {
    timeSlotCount++;
  }
  console.log(`  Total time slots: ${timeSlotCount}`);

  kv.close();
  
} catch (error) {
  console.error('❌ Error reading database:', error);
}

console.log('\n✅ Database check completed!');