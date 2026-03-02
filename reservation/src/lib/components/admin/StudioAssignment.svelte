<script>
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { StudioScheduler } from '$shared/scheduler.js';

  export let bands = [];
  export let rooms = [];

  let timeSlots = [];
  let selectedDate = '';
  let selectedRooms = 3;
  let selectedTimeSlots = 6;
  let startSlotIndex = 0;

  let schedule = null;
  let unscheduled = [];
  let warnings = [];
  let generating = false;
  let registering = false;
  let registerResult = null;
  let errorMsg = '';

  $: studioRooms = rooms.filter(r => r.type === 'studio');
  $: maxRooms = studioRooms.length;
  $: maxTimeSlots = timeSlots.length;
  $: maxStartSlot = Math.max(0, timeSlots.length - selectedTimeSlots);
  $: usedRooms = studioRooms.slice(0, selectedRooms);
  $: usedSlots = timeSlots.slice(startSlotIndex, startSlotIndex + selectedTimeSlots);
  $: if (startSlotIndex + selectedTimeSlots > timeSlots.length) {
    selectedTimeSlots = timeSlots.length - startSlotIndex;
  }

  // バンドをスケジューラ用フォーマットに変換
  $: schedulerBands = bands
    .filter(b => b.name !== '合宿係')
    .map(b => ({ id: b.id, name: b.name, members: b.members }));

  onMount(async () => {
    // デフォルト日付（今日）
    selectedDate = new Date().toISOString().slice(0, 10);

    // タイムスロット取得
    try {
      const res = await fetch(`${base}/api/timeslots`);
      if (res.ok) {
        const body = await res.json();
        timeSlots = body.data ?? [];
        selectedTimeSlots = Math.min(6, timeSlots.length);
      }
    } catch (e) {
      console.error('タイムスロット取得失敗:', e);
    }
  });

  function generateSchedule() {
    if (schedulerBands.length === 0) {
      errorMsg = 'バンドデータがありません';
      return;
    }
    if (selectedRooms < 1 || selectedTimeSlots < 1) {
      errorMsg = 'スタジオ数とコマ数を設定してください';
      return;
    }

    generating = true;
    errorMsg = '';
    registerResult = null;

    try {
      const scheduler = new StudioScheduler({
        bands: schedulerBands,
        config: { rooms: usedRooms.length, timeSlots: usedSlots.length }
      });

      const result = scheduler.generateSchedule();
      const validation = scheduler.validateSchedule();

      schedule = result.schedule;
      unscheduled = result.unscheduled;
      warnings = validation.warnings;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : '生成エラー';
    } finally {
      generating = false;
    }
  }

  async function registerReservations() {
    if (!schedule || !selectedDate) return;

    registering = true;
    registerResult = null;
    errorMsg = '';

    const assignments = [];
    for (let tsIdx = 0; tsIdx < schedule.length; tsIdx++) {
      for (let rIdx = 0; rIdx < schedule[tsIdx].length; rIdx++) {
        const band = schedule[tsIdx][rIdx];
        if (!band) continue;
        assignments.push({
          timeSlotId: usedSlots[tsIdx].id,
          roomId: usedRooms[rIdx].id,
          bandId: band.id
        });
      }
    }

    try {
      const res = await fetch(`${base}/api/admin/studio-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, assignments })
      });
      registerResult = await res.json();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : '登録エラー';
    } finally {
      registering = false;
    }
  }
</script>

<div class="space-y-6">
  <h2 class="text-lg font-semibold text-gray-900">スタジオ割り当て</h2>

  <!-- 設定フォーム -->
  <div class="bg-gray-50 rounded-lg p-4 space-y-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- 日付 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="sa-date">日付</label>
        <input
          id="sa-date"
          type="date"
          bind:value={selectedDate}
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <!-- 使用スタジオ数 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="sa-rooms">
          使用スタジオ数: {selectedRooms}
        </label>
        <input
          id="sa-rooms"
          type="range"
          min="1"
          max={maxRooms || 5}
          bind:value={selectedRooms}
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>1</span>
          <span>{maxRooms || 5}</span>
        </div>
      </div>

      <!-- 開始コマ -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="sa-start">
          開始コマ: {usedSlots[0]?.displayName ?? `コマ${startSlotIndex + 1}`}
        </label>
        <input
          id="sa-start"
          type="range"
          min="0"
          max={maxStartSlot}
          bind:value={startSlotIndex}
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>{timeSlots[0]?.displayName ?? 'コマ1'}</span>
          <span>{timeSlots[maxStartSlot]?.displayName ?? `コマ${maxStartSlot + 1}`}</span>
        </div>
      </div>

      <!-- 使用コマ数 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="sa-slots">
          使用コマ数: {selectedTimeSlots}
        </label>
        <input
          id="sa-slots"
          type="range"
          min="1"
          max={maxTimeSlots - startSlotIndex || 24}
          bind:value={selectedTimeSlots}
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>1</span>
          <span>{maxTimeSlots - startSlotIndex || 24}</span>
        </div>
      </div>
    </div>

    <button
      on:click={generateSchedule}
      disabled={generating || !selectedDate}
      class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? '生成中...' : '割り当て案を生成'}
    </button>
  </div>

  <!-- エラー -->
  {#if errorMsg}
    <div class="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
      {errorMsg}
    </div>
  {/if}

  <!-- 割り当て結果 -->
  {#if schedule}
    <!-- 警告 -->
    {#if warnings.length > 0}
      <div class="bg-yellow-50 border border-yellow-200 rounded-md p-3">
        <p class="text-sm font-medium text-yellow-800 mb-1">警告</p>
        <ul class="text-sm text-yellow-700 list-disc list-inside space-y-1">
          {#each warnings as w}
            <li>{w}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- グリッド -->
    <div class="overflow-x-auto">
      <table class="min-w-full border border-gray-200 text-sm">
        <thead>
          <tr class="bg-gray-100">
            <th class="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">コマ</th>
            {#each usedRooms as room}
              <th class="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                {room.name}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each schedule as row, tsIdx}
            <tr class="hover:bg-gray-50">
              <td class="border border-gray-200 px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
                {usedSlots[tsIdx]?.displayName ?? `コマ${tsIdx + 1}`}
              </td>
              {#each row as band, rIdx}
                <td class="border border-gray-200 px-3 py-2">
                  {#if band}
                    <div>
                      <p class="font-medium text-gray-900">{band.name}</p>
                      <p class="text-xs text-gray-500 mt-0.5">
                        {Object.entries(band.members).map(([inst, name]) => `${inst}: ${name}`).join(' / ')}
                      </p>
                    </div>
                  {:else}
                    <span class="text-gray-400">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- 配置不可バンド -->
    {#if unscheduled.length > 0}
      <div class="bg-orange-50 border border-orange-200 rounded-md p-3">
        <p class="text-sm font-medium text-orange-800 mb-1">配置不可バンド（コマ不足）</p>
        <ul class="text-sm text-orange-700 list-disc list-inside space-y-1">
          {#each unscheduled as band}
            <li>{band.name}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- 登録ボタン -->
    <div class="flex items-center gap-4">
      <button
        on:click={registerReservations}
        disabled={registering}
        class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {registering ? '登録中...' : '予約として登録'}
      </button>
      <span class="text-xs text-gray-500">
        日付: {selectedDate} / {schedule.flat().filter(Boolean).length} コマを登録します
      </span>
    </div>

    <!-- 登録結果 -->
    {#if registerResult}
      <div class="rounded-md p-3 {registerResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
        {#if registerResult.success}
          <p class="text-sm font-medium text-green-800">
            {registerResult.created.length} 件を登録しました
            {#if registerResult.failed.length > 0}
              （{registerResult.failed.length} 件スキップ）
            {/if}
          </p>
          {#if registerResult.failed.length > 0}
            <ul class="text-sm text-yellow-700 mt-2 list-disc list-inside space-y-1">
              {#each registerResult.failed as f}
                <li>{f.timeSlotId} / {f.roomId}: {f.reason}</li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p class="text-sm text-red-700">{registerResult.error}</p>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- バンド一覧（参考） -->
  <details class="mt-4">
    <summary class="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
      対象バンド一覧 ({schedulerBands.length} バンド)
    </summary>
    <ul class="mt-2 space-y-1">
      {#each schedulerBands as band}
        <li class="text-sm text-gray-700">
          <span class="font-medium">{band.name}</span>
          <span class="text-gray-500 ml-2">
            {Object.entries(band.members).map(([inst, name]) => `${inst}: ${name}`).join(' / ')}
          </span>
        </li>
      {/each}
    </ul>
  </details>
</div>
