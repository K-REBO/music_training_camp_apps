<script>
  import { createEventDispatcher } from 'svelte';
  import { writable } from 'svelte/store';
  import { wsManager, selectionStates } from '$lib/stores/websocket.js';
  
  export let rooms = [];
  export let timeSlots = [];
  export let reservations = [];
  export let bands = [];
  
  // reservationsプロパティの変更を監視
  $: {
    console.log(`🔄 Reservations updated: ${reservations.length} items`);
  }
  export let selectedDate = '';
  export let currentUser = null;
  export let selectedBand = null;
  export let config = {};
  
  const dispatch = createEventDispatcher();
  
  // 隣接予約チェック関数（日をまたいでチェック）
  const checkAdjacentReservations = async (timeSlot, room, band, targetDate) => {
    console.log('⏰ Starting adjacent reservations check for band:', band.name);
    
    const currentSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlot.id);
    
    // 前日・翌日の予約データを取得
    const targetDateObj = new Date(targetDate);
    const previousDate = new Date(targetDateObj);
    previousDate.setDate(previousDate.getDate() - 1);
    const nextDate = new Date(targetDateObj);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const prevDateStr = previousDate.toISOString().split('T')[0];
    const nextDateStr = nextDate.toISOString().split('T')[0];
    
    const [prevDayRes, nextDayRes] = await Promise.all([
      fetch(`/reservation/api/reservations?date=${prevDateStr}`).catch(() => ({ ok: false })),
      fetch(`/reservation/api/reservations?date=${nextDateStr}`).catch(() => ({ ok: false }))
    ]);
    
    const prevDayReservations = prevDayRes.ok ? (await prevDayRes.json()).data || [] : [];
    const nextDayReservations = nextDayRes.ok ? (await nextDayRes.json()).data || [] : [];
    
    // 直前のコマをチェック
    if (currentSlotIndex > 0) {
      const prevSlot = timeSlots[currentSlotIndex - 1];
      const prevReservation = reservations.find(r => 
        r.timeSlotId === prevSlot.id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (prevReservation) {
        console.log('⏰ Found adjacent reservation (previous slot same day)');
        return true;
      }
    } else {
      // 当日の最初のコマの場合、前日の最後のコマをチェック
      const lastSlot = timeSlots[timeSlots.length - 1];
      const prevDayLastReservation = prevDayReservations.find(r => 
        r.timeSlotId === lastSlot.id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (prevDayLastReservation) {
        console.log('⏰ Found adjacent reservation (previous day last slot)');
        return true;
      }
    }
    
    // 直後のコマをチェック
    if (currentSlotIndex < timeSlots.length - 1) {
      const nextSlot = timeSlots[currentSlotIndex + 1];
      const nextReservation = reservations.find(r => 
        r.timeSlotId === nextSlot.id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (nextReservation) {
        console.log('⏰ Found adjacent reservation (next slot same day)');
        return true;
      }
    } else {
      // 当日の最後のコマの場合、翌日の最初のコマをチェック
      const firstSlot = timeSlots[0];
      const nextDayFirstReservation = nextDayReservations.find(r => 
        r.timeSlotId === firstSlot.id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (nextDayFirstReservation) {
        console.log('⏰ Found adjacent reservation (next day first slot)');
        return true;
      }
    }
    
    return false;
  };

  // 日をまたぐ連続コマチェック関数
  const checkConsecutiveSlots = async (timeSlot, room, band, targetDate) => {
    console.log('⏰ Starting cross-date consecutive slots check');
    
    const currentSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlot.id);
    let consecutiveCount = 1;
    
    // 前日・翌日の予約データを取得
    const targetDateObj = new Date(targetDate);
    const previousDate = new Date(targetDateObj);
    previousDate.setDate(previousDate.getDate() - 1);
    const nextDate = new Date(targetDateObj);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const prevDateStr = previousDate.toISOString().split('T')[0];
    const nextDateStr = nextDate.toISOString().split('T')[0];
    
    // 前後日のデータを並行取得
    const [prevDayRes, nextDayRes] = await Promise.all([
      fetch(`/reservation/api/reservations?date=${prevDateStr}`).catch(() => ({ ok: false })),
      fetch(`/reservation/api/reservations?date=${nextDateStr}`).catch(() => ({ ok: false }))
    ]);
    
    const prevDayReservations = prevDayRes.ok ? (await prevDayRes.json()).data || [] : [];
    const nextDayReservations = nextDayRes.ok ? (await nextDayRes.json()).data || [] : [];
    
    console.log('⏰ Cross-date data:', {
      prevDate: prevDateStr,
      nextDate: nextDateStr,
      prevDayCount: prevDayReservations.length,
      nextDayCount: nextDayReservations.length
    });
    
    // 当日の前のコマをチェック
    let prevConnected = true;
    for (let i = currentSlotIndex - 1; i >= 0; i--) {
      const prevReservation = reservations.find(r => 
        r.timeSlotId === timeSlots[i].id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (prevReservation) {
        consecutiveCount++;
      } else {
        prevConnected = false;
        break;
      }
    }
    
    // 前日の最後のコマから遡ってチェック（当日の最初のコマまで連続している場合のみ）
    if (currentSlotIndex === 0 || (prevConnected && currentSlotIndex === consecutiveCount - 1)) {
      for (let i = timeSlots.length - 1; i >= 0; i--) {
        const prevDayReservation = prevDayReservations.find(r => 
          r.timeSlotId === timeSlots[i].id && 
          r.roomId === room.id && 
          r.status === 'active' && 
          r.bandId === band.id
        );
        if (prevDayReservation) consecutiveCount++;
        else break;
      }
    }
    
    // 当日の後のコマをチェック
    let nextConnected = true;
    let afterSlotsCount = 0;
    for (let i = currentSlotIndex + 1; i < timeSlots.length; i++) {
      const nextReservation = reservations.find(r => 
        r.timeSlotId === timeSlots[i].id && 
        r.roomId === room.id && 
        r.status === 'active' && 
        r.bandId === band.id
      );
      if (nextReservation) {
        consecutiveCount++;
        afterSlotsCount++;
      } else {
        nextConnected = false;
        break;
      }
    }
    
    // 翌日の最初のコマから先をチェック（当日の最後のコマまで連続している場合のみ）
    if (currentSlotIndex === timeSlots.length - 1 || (nextConnected && afterSlotsCount === timeSlots.length - currentSlotIndex - 1)) {
      for (let i = 0; i < timeSlots.length; i++) {
        const nextDayReservation = nextDayReservations.find(r => 
          r.timeSlotId === timeSlots[i].id && 
          r.roomId === room.id && 
          r.status === 'active' && 
          r.bandId === band.id
        );
        if (nextDayReservation) consecutiveCount++;
        else break;
      }
    }
    
    console.log(`⏰ Total consecutive count: ${consecutiveCount}`);
    return consecutiveCount;
  };
  
  // グリッドの状態管理
  const gridState = writable(new Map());
  let selectingCell = null;
  let selectingTimeSlotId = null;
  let selectingRoomId = null;
  let confirmTimeout = null;
  
  // 制限ルールチェック関数
  const checkRestrictions = async (timeSlot, room, band) => {
    console.log('🔍 checkRestrictions called:', { 
      roomType: room.type, 
      roomName: room.name, 
      bandName: band.name, 
      config: config?.restrictions,
      currentUser: currentUser?.name
    });
    
    // 管理者は全制限を無視
    if (currentUser?.name === '椎木知仁') {
      console.log('👑 Admin user detected, bypassing all restrictions');
      return { allowed: true };
    }
    
    // 合宿係バンド（イベント枠）での予約時は制限を無視
    if (band?.name === '合宿係') {
      console.log('🎪 Camp organizer band detected, bypassing all restrictions');
      return { allowed: true };
    }
    
    const restrictions = config?.restrictions;
    if (!restrictions) {
      console.log('⚠️ No restrictions config found');
      return { allowed: true };
    }
    
    // 部屋タイプ別権限チェック
    const roomTypePermissions = restrictions.room_type_permissions || {};
    console.log('🏠 roomTypePermissions:', roomTypePermissions);
    
    if (roomTypePermissions[room.type]) {
      const allowedBands = roomTypePermissions[room.type];
      console.log(`🎸 Checking ${room.type} permissions: allowedBands =`, allowedBands, 'current band =', band.name);
      
      if (!allowedBands.includes(band.name)) {
        console.log('🚫 ACCESS DENIED: Band not in allowed list');
        return { 
          allowed: false, 
          message: `この${room.type === 'event' ? 'イベント列' : 'スタジオ'}は予約できません！ ちょっと入れ過ぎじゃない！\nbyたつみ`
        };
      } else {
        console.log('✅ ACCESS GRANTED: Band is in allowed list');
      }
    } else {
      console.log('📝 No restrictions for room type:', room.type);
    }
    
    // バンド別部屋制限チェック
    const bandRestrictions = restrictions.band_restrictions || {};
    if (bandRestrictions[band.name]) {
      const allowedRoomTypes = bandRestrictions[band.name];
      if (!allowedRoomTypes.includes(room.type)) {
        return { 
          allowed: false, 
          message: `${band.name}は${room.type === 'event' ? 'イベント列' : 'イベント'}のみ予約可能です！\nbyたつみ`
        };
      }
    }
    
    // 同じバンドの連続予約チェック（バンド練習のみ、個人練習は除外）
    if (!band.isPersonal) {
      const hasAdjacentReservation = await checkAdjacentReservations(timeSlot, room, band, selectedDate);
      if (hasAdjacentReservation) {
        return {
          allowed: false,
          message: `同じバンドの連続予約は不可！ ちょっと入れ過ぎじゃない！\nbyたつみ`
        };
      }
    }
    
    // 同じバンドの一日上限チェック（バンド練習のみ、個人練習は除外）
    if (!band.isPersonal && restrictions.daily_band_limit && restrictions.daily_band_limit > 0) {
      const bandReservationsToday = reservations.filter(r => 
        r.date === selectedDate && 
        r.bandId === band.id && 
        r.status === 'active'
      );
      
      console.log(`🎸 Band reservations today: ${bandReservationsToday.length}/${restrictions.daily_band_limit} for ${band.name}`);
      
      if (bandReservationsToday.length >= restrictions.daily_band_limit) {
        return {
          allowed: false,
          message: `${band.name}は一日${restrictions.daily_band_limit}コマまで！ ちょっと入れ過ぎじゃない！\nbyたつみ`
        };
      }
    }
    
    // 個人練習の日別上限チェック
    console.log('👤 Checking personal practice limit:', {
      isPersonal: band.isPersonal,
      limit: restrictions.daily_personal_limit,
      currentUser: currentUser?.name
    });
    
    if (band.isPersonal && restrictions.daily_personal_limit && restrictions.daily_personal_limit > 0) {
      const personalReservationsToday = reservations.filter(r => 
        r.date === selectedDate && 
        r.userId === currentUser.id && 
        r.bandId.startsWith('personal_') && 
        r.status === 'active'
      );
      
      console.log(`👤 Personal reservations today: ${personalReservationsToday.length}/${restrictions.daily_personal_limit}`, personalReservationsToday);
      
      if (personalReservationsToday.length >= restrictions.daily_personal_limit) {
        console.log('🚫 Personal practice limit exceeded');
        return { 
          allowed: false, 
          message: `一日の中で個人練は${restrictions.daily_personal_limit}コマまで！ ちょっと入れ過ぎじゃない！\nbyたつみ`
        };
      }
    }
    
    // バンドメンバー重複チェック（スタジオ予約時、スタジオ同士のみ）
    if (room.type === 'studio') {
      console.log('👥 Starting band member overlap check (studio-to-studio only)');
      console.log('👥 Debug - All reservations for this time slot:', reservations.filter(r => 
        r.date === selectedDate && r.timeSlotId === timeSlot.id && r.status === 'active'
      ));
      
      const conflictingReservations = reservations.filter(r => {
        const matchesDate = r.date === selectedDate;
        const matchesTime = r.timeSlotId === timeSlot.id;
        const isActive = r.status === 'active';
        const isStudio = r.roomName?.includes('スタジオ');
        // For overlap detection, we want to include all reservations in different rooms
        // regardless of who made them (including the current user's own reservations)
        const isDifferentRoom = r.roomId !== room.id;
        
        console.log(`👥 Checking reservation ${r.bandName}:`, {
          matchesDate, matchesTime, isActive, isStudio, isDifferentRoom,
          rRoomId: r.roomId, currentRoomId: room.id,
          rUserId: r.userId, currentUserId: currentUser?.id
        });
        
        return matchesDate && matchesTime && isActive && isStudio && isDifferentRoom;
      });
    
    console.log(`👥 Found ${conflictingReservations.length} conflicting reservations for ${timeSlot.displayName}:`, conflictingReservations.map(r => r.bandName));
    
    for (const conflictRes of conflictingReservations) {
      const conflictRoom = rooms.find(r => r.id === conflictRes.roomId);
      const roomName = conflictRoom ? conflictRoom.name : 'Unknown';
      
      // 個人練習同士の場合
      const isCurrentPersonal = band.isPersonal;
      const isConflictPersonal = conflictRes.bandId?.startsWith('personal_');
      
      if (isCurrentPersonal && isConflictPersonal) {
        // 個人練習同士：同一人物かチェック
        if (conflictRes.userId === currentUser?.id) {
          console.log('👤 Personal practice conflict detected for same user');
          return {
            allowed: false,
            message: `個人練習の重複は不可です！ ${roomName}で既に${conflictRes.bandName}の予約があります。\nbyたつみ`
          };
        }
        // 異なる人の個人練習同士は重複チェックしない
        continue;
      }
      
      // 個人練習とバンド、またはバンド同士の場合：メンバー重複チェック
      const conflictingBand = bands.find(b => b.id === conflictRes.bandId);
      console.log(`👥 Checking conflict with band:`, conflictingBand?.name, 'ID:', conflictRes.bandId);
      
      if (isCurrentPersonal || isConflictPersonal) {
        // 個人練習が関わる場合：ユーザーIDで直接チェック
        const personalUserId = isCurrentPersonal ? currentUser?.id : conflictRes.userId;
        const bandToCheck = isCurrentPersonal ? conflictingBand : band;
        
        if (bandToCheck && bandToCheck.memberIds && bandToCheck.memberIds.includes(personalUserId)) {
          const userName = isCurrentPersonal ? currentUser?.name : 
                          (conflictRes.userName || conflictRes.bandName?.split(': ')[1]);
          
          return {
            allowed: false,
            message: `個人練習の重複は不可です！ ${roomName}の${conflictRes.bandName}で、${userName}さんが被っています。\nbyたつみ`
          };
        }
      } else if (conflictingBand && conflictingBand.memberIds && band.memberIds) {
        // バンド同士の場合：メンバーID重複チェック
        console.log(`👥 Current band members:`, Object.values(band.members || {}));
        console.log(`👥 Conflicting band members:`, Object.values(conflictingBand.members || {}));
        
        const overlappingMembers = band.memberIds.filter(memberId => 
          conflictingBand.memberIds.includes(memberId)
        );
        
        console.log(`👥 Overlapping member IDs:`, overlappingMembers);
        
        if (overlappingMembers.length > 0) {
          const memberNames = [];
          if (band.members && conflictingBand.members) {
            const currentBandMembers = Object.values(band.members);
            const conflictBandMembers = Object.values(conflictingBand.members);
            
            for (const memberName of currentBandMembers) {
              if (conflictBandMembers.includes(memberName)) {
                memberNames.push(memberName);
              }
            }
          }
          
          if (memberNames.length > 0) {
            // バンド同士の場合は警告
            return {
              allowed: 'confirm',
              message: `${roomName}の${conflictRes.bandName}で、${memberNames.join('、')}さんが被っています。続行しますか？`
            };
          }
        }
      }
    }
    } // バンドメンバー重複チェック（イベント列は除外）の終了
    
    return { allowed: true };
  };
  
  // バンドメンバーかどうかをチェック
  const isInBand = (reservation) => {
    if (!reservation || !currentUser) return false;
    
    // 個人枠の場合は予約者本人のみ
    if (reservation.bandId?.startsWith('personal_')) {
      return reservation.userId === currentUser.id;
    }
    
    // バンド枠の場合：そのバンドのメンバーかチェック
    const band = bands.find(b => b.id === reservation.bandId);
    return band && band.memberIds.includes(currentUser.id);
  };

  // selectionStatesの変更を監視
  $: {
    if ($selectionStates.size > 0) {
      console.log(`🗂️ selectionStates changed:`, Array.from($selectionStates.entries()));
    }
  }
  
  // セルの状態を取得（リアクティブ）
  $: getCellStatus = (timeSlotId, roomId) => {
    const reservation = reservations.find(r => 
      r.timeSlotId === timeSlotId && 
      r.roomId === roomId && 
      r.status === 'active'
    );
    
    if (reservation) {
      // キャンセル権限チェック
      let canCancel = reservation.userId === currentUser?.id || isInBand(reservation);
      
      // イベント列の場合、合宿係メンバーなら誰でもキャンセル可能
      if (reservation.roomName === 'イベント') {
        const campOrganizerBand = bands.find(b => b.name === '合宿係');
        if (campOrganizerBand && campOrganizerBand.memberIds.includes(currentUser?.id)) {
          canCancel = true;
        }
      }
      
      return canCancel ? 'my_reservation' : 'reserved';
    }
    
    // 他のユーザーの選択状態をチェック
    const selectionKey = `${selectedDate}-${timeSlotId}-${roomId}`;
    const otherSelection = $selectionStates.get(selectionKey);
    if (otherSelection && otherSelection.user.id !== currentUser?.id) {
      console.log(`🔴 Found other user selection: ${otherSelection.user.name} selecting ${selectionKey}`);
      return 'other_selecting';
    }
    
    const cellKey = `${timeSlotId}-${roomId}`;
    if (selectingCell === cellKey) {
      return 'my_selecting';
    }
    
    return 'available';
  };
  
  // セルの表示スタイルを取得（リアクティブ）
  $: getCellClass = (timeSlotId, roomId) => {
    const status = getCellStatus(timeSlotId, roomId);
    const baseClass = "border border-gray-300 p-2 min-h-[80px] transition-all duration-200 cursor-pointer text-sm";
    
    if (status === 'other_selecting') {
      console.log(`🔴 Applying red style for ${timeSlotId}-${roomId}`);
    }
    
    switch (status) {
      case 'available':
        return `${baseClass} bg-white hover:bg-blue-50 hover:border-blue-300`;
      case 'reserved':
        return `${baseClass} bg-gray-100 text-gray-600 cursor-not-allowed`;
      case 'my_reservation':
        return `${baseClass} bg-green-100 border-green-300`;
      case 'my_selecting':
        return `${baseClass} bg-yellow-400 border-yellow-600 text-black`;
      case 'other_selecting':
        return `${baseClass} bg-red-400 border-red-600 text-white cursor-not-allowed`;
      default:
        return baseClass;
    }
  };
  
  // セルクリック処理
  const handleCellClick = async (timeSlot, room) => {
    console.log(`🖱️ Cell clicked: ${timeSlot.displayName} - ${room.name}`);
    const status = getCellStatus(timeSlot.id, room.id);
    const cellKey = `${timeSlot.id}-${room.id}`;
    console.log(`🖱️ Cell status: ${status}, cellKey: ${cellKey}`);
    
    if (status === 'my_reservation') {
      // 自分の予約をキャンセル（バンド選択不要）
      console.log(`🖱️ Cancelling my reservation`);
      handleCancelReservation(timeSlot, room);
      return;
    }
    
    if (status === 'reserved') {
      console.log(`🖱️ Cell is reserved by someone else`);
      alert('この時間枠は既に予約されています');
      return;
    }
    
    if (status === 'other_selecting') {
      const selectionKey = `${selectedDate}-${timeSlot.id}-${room.id}`;
      const otherSelection = $selectionStates.get(selectionKey);
      if (otherSelection) {
        console.log(`🖱️ Cell is being selected by another user: ${otherSelection.user.name}`);
        alert(`${otherSelection.user.name}さんが選択中です`);
      }
      return;
    }
    
    // 新規予約作成時のみバンド選択が必要
    if (!selectedBand) {
      console.log(`🖱️ No band selected`);
      alert('まずバンドを選択してください');
      return;
    }
    
    // 制限ルールチェック
    const restrictionCheck = await checkRestrictions(timeSlot, room, selectedBand);
    if (restrictionCheck.allowed === false) {
      alert(restrictionCheck.message);
      return;
    }
    if (restrictionCheck.allowed === 'confirm') {
      if (!confirm(restrictionCheck.message)) {
        return;
      }
    }
    
    if (status === 'my_selecting') {
      // 選択解除
      console.log(`🖱️ Clearing my selection`);
      clearSelection();
      return;
    }
    
    // 新規選択
    console.log(`🖱️ New selection: ${cellKey} with band ${selectedBand.name}`);
    selectingCell = cellKey;
    selectingTimeSlotId = timeSlot.id;
    selectingRoomId = room.id;
    
    // WebSocketで他のユーザーに選択状態を通知
    console.log(`🖱️ Sending cell selection via WebSocket...`);
    wsManager.selectCell(
      selectedDate,
      timeSlot.id,
      room.id,
      selectedBand.id,
      selectedBand.name
    );
    
    // 3秒後に確認ダイアログを表示
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
    }
    
    confirmTimeout = setTimeout(() => {
      if (selectingCell === cellKey) {
        confirmReservation(timeSlot, room);
      }
    }, 3000);
    
    // リアルタイムで他のユーザーに選択状態を通知
    dispatch('cell_selecting', {
      timeSlotId: timeSlot.id,
      roomId: room.id,
      user: currentUser
    });
  };
  
  // 選択解除
  const clearSelection = () => {
    console.log(`🚫 clearSelection called, selectingCell: ${selectingCell}`);
    
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = null;
      console.log(`🚫 Cleared timeout`);
    }
    
    if (selectingCell) {
      console.log(`🚫 Clearing selection: ${selectingTimeSlotId}-${selectingRoomId} on date ${selectedDate}`);
      
      // WebSocketで他のユーザーに選択解除を通知
      console.log(`🚫 Sending deselect message via WebSocket...`);
      wsManager.deselectCell(selectedDate, selectingTimeSlotId, selectingRoomId);
      
      dispatch('cell_deselected', { timeSlotId: selectingTimeSlotId, roomId: selectingRoomId });
      selectingCell = null;
      selectingTimeSlotId = null;
      selectingRoomId = null;
      console.log(`🚫 Local selectingCell cleared`);
    } else {
      console.log(`🚫 No selectingCell to clear`);
    }
  };
  
  // 予約確認
  const confirmReservation = async (timeSlot, room) => {
    // 制限ルール再チェック（確認時）
    const restrictionCheck = await checkRestrictions(timeSlot, room, selectedBand);
    if (restrictionCheck.allowed === false) {
      alert(restrictionCheck.message);
      clearSelection();
      return;
    }
    if (restrictionCheck.allowed === 'confirm') {
      if (!confirm(restrictionCheck.message)) {
        clearSelection();
        return;
      }
    }
    
    let eventName = '';
    let description;

    // イベント列の場合はイベント名を入力
    if (room.type === 'event') {
      eventName = prompt(`イベント名を入力してください（必須）:`);
      if (eventName === null) {
        // キャンセルされた場合
        clearSelection();
        return;
      }
      if (eventName.trim() === '') {
        alert('イベント名は必須です');
        clearSelection();
        return;
      }
      eventName = eventName.trim();
      description = prompt('通知メッセージを入力してください（任意）:') || undefined;
    }

    const message = room.type === 'event'
      ? `${timeSlot.displayName} の ${room.name} で「${eventName}」イベントを ${selectedBand.name} で予約しますか？`
      : `${timeSlot.displayName} の ${room.name} を ${selectedBand.name} で予約しますか？`;

    if (confirm(message)) {
      handleCreateReservation(timeSlot, room, eventName, description);
    }
    
    clearSelection();
  };
  
  // 予約作成
  const handleCreateReservation = (timeSlot, room, eventName = '', description = undefined) => {
    dispatch('create_reservation', {
      timeSlotId: timeSlot.id,
      roomId: room.id,
      bandId: selectedBand.id,
      date: selectedDate,
      eventName: eventName || undefined,
      description
    });
  };
  
  // 予約キャンセル
  const handleCancelReservation = (timeSlot, room) => {
    const reservation = reservations.find(r => 
      r.timeSlotId === timeSlot.id && 
      r.roomId === room.id && 
      r.status === 'active'
    );
    
    if (!reservation) return;
    
    // キャンセル権限チェック：予約者本人またはバンドメンバー
    const canCancel = reservation.userId === currentUser?.id || isInBand(reservation);
    
    if (!canCancel) {
      alert('この予約をキャンセルする権限がありません');
      return;
    }
    
    if (confirm(`${timeSlot.displayName} の ${room.name} の予約をキャンセルしますか？`)) {
      dispatch('cancel_reservation', {
        reservationId: reservation.id,
        timeSlotId: timeSlot.id,
        roomId: room.id,
        date: selectedDate
      });
    }
  };
  
  // 予約情報の取得（リアクティブ）
  $: getReservationInfo = (timeSlotId, roomId) => {
    return reservations.find(r => 
      r.timeSlotId === timeSlotId && 
      r.roomId === roomId && 
      r.status === 'active'
    );
  };
</script>

<div class="bg-white rounded-lg shadow overflow-hidden">
  <div class="p-4 border-b border-gray-200">
    <h2 class="text-lg font-semibold text-gray-900">
      {selectedDate} の予約状況
    </h2>
    {#if selectedBand}
      <p class="text-sm text-gray-600 mt-1">
        選択中のバンド: <span class="font-medium text-blue-600">{selectedBand.name}</span>
      </p>
    {:else}
      <p class="text-sm text-orange-600 mt-1">
        ⚠️ バンドを選択してください
      </p>
    {/if}
  </div>
  
  <div class="overflow-x-auto">
    <div class="inline-block min-w-full">
      <table class="min-w-full border-collapse">
        <thead>
          <tr class="bg-gray-50">
            <th class="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              時間
            </th>
            {#each rooms as room (room.id)}
              <th class="border border-gray-300 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                <div class="font-medium text-gray-900">{room.name}</div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each timeSlots as timeSlot (timeSlot.id)}
            <tr>
              <td class="border border-gray-300 px-4 py-3 bg-gray-50 font-medium text-gray-900">
                <div class="text-sm">{timeSlot.displayName}</div>
                <div class="text-xs text-gray-500">
                  {timeSlot.duration}分
                </div>
              </td>
              {#each rooms as room (room.id)}
                <td 
                  class={getCellClass(timeSlot.id, room.id)}
                  on:click={() => handleCellClick(timeSlot, room)}
                  role="button"
                  tabindex="0"
                  data-testid="reservation-cell-{timeSlot.displayName}-{room.name}"
                >
                  {#each [getReservationInfo(timeSlot.id, room.id)] as reservation}
                    {#if reservation}
                      <div class="space-y-1">
                        <div class="font-medium">
                          {#if room.type === 'event' && reservation.eventName}
                            {reservation.eventName}
                          {:else}
                            {reservation.bandName}
                          {/if}
                        </div>
                        {#if room.type !== 'event'}
                          {#if reservation.userName !== '椎木知仁'}
                            <div class="text-xs">{reservation.userName}</div>
                          {/if}
                          {#if reservation.userId === currentUser?.id}
                            <div class="text-xs text-green-600">自分の予約</div>
                          {:else if isInBand(reservation)}
                            <div class="text-xs text-blue-600">バンドメンバーの予約</div>
                          {/if}
                        {/if}
                      </div>
                    {:else}
                      {#if selectingCell === `${timeSlot.id}-${room.id}`}
                        <div class="space-y-1">
                          <div class="font-medium text-yellow-700">{selectedBand?.name || 'バンド未選択'}</div>
                          <div class="text-xs text-yellow-600">選択中... (3秒後に確認)</div>
                        </div>
                      {:else}
                        {#each [$selectionStates.get(`${selectedDate}-${timeSlot.id}-${room.id}`)] as otherSelection}
                          {#if otherSelection && otherSelection.user.id !== currentUser?.id}
                            <div class="space-y-1">
                              <div class="font-medium text-red-700">{otherSelection.band.name}</div>
                              <div class="text-xs text-red-600">{otherSelection.user.name}さんが選択中</div>
                            </div>
                          {:else}
                            <div class="text-gray-400 text-xs">クリックして予約</div>
                          {/if}
                        {/each}
                      {/if}
                    {/if}
                  {/each}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="p-4 border-t border-gray-200 bg-gray-50">
    <div class="flex flex-wrap gap-4 text-xs">
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 bg-white border border-gray-300"></div>
        <span>利用可能</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 bg-gray-100 border border-gray-300"></div>
        <span>予約済み</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 bg-green-100 border border-green-300"></div>
        <span>自分の予約</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 bg-yellow-100 border border-yellow-400"></div>
        <span>選択中</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 bg-red-100 border border-red-300"></div>
        <span>他のユーザーが選択中</span>
      </div>
    </div>
  </div>
</div>

<style>
  table {
    border-spacing: 0;
  }
  
  td:hover {
    transform: scale(1.02);
  }
  
  @media (max-width: 768px) {
    td:hover {
      transform: none;
    }
  }
</style>