<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import ReservationGrid from '$lib/components/ReservationGrid.svelte';
  import BandSelector from '$lib/components/BandSelector.svelte';
  import FeedbackForm from '$lib/components/FeedbackForm.svelte';
  import { wsManager, wsStatus, selectionStates } from '$lib/stores/websocket.js';
  
  export let data; // ページデータ
  
  let rooms = [];
  let timeSlots = [];
  let bands = [];
  let reservations = [];
  let config = {};
  let selectedDate = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD format in local time
  let selectedBand = null;
  let loading = true;
  let error = '';
  let showFeedbackForm = false;
  
  const currentUser = data?.user || null;
  const isAdmin = data?.isAdmin || false;
  
  // WebSocket connection status
  let connectionStatus = 'disconnected';
  
  onMount(async () => {
    await loadData();
    setupWebSocket();
    setupReservationEventListeners();
  });
  
  onDestroy(() => {
    wsManager.disconnect();
    removeReservationEventListeners();
  });
  
  // WebSocket status store subscription
  $: connectionStatus = $wsStatus;
  
  const loadData = async () => {
    try {
      loading = true;
      
      // 設定を読み込み
      const configResponse = await fetch(`${base}/api/config`);
      const configResult = await configResponse.json();
      if (configResult.success) {
        config = configResult.data;
      }
      
      // マスターデータを読み込み
      const [roomsRes, timeSlotsRes, bandsRes] = await Promise.all([
        fetch(`${base}/api/rooms`),
        fetch(`${base}/api/timeslots`),
        fetch(`${base}/api/bands`)
      ]);
      
      const [roomsResult, timeSlotsResult, bandsResult] = await Promise.all([
        roomsRes.json(),
        timeSlotsRes.json(),
        bandsRes.json()
      ]);
      
      if (roomsResult.success) rooms = roomsResult.data;
      if (timeSlotsResult.success) timeSlots = timeSlotsResult.data;
      if (bandsResult.success) bands = bandsResult.data;
      
      // 予約データを読み込み
      await loadReservations();
      
    } catch (err) {
      error = 'データの読み込みに失敗しました: ' + err.message;
      console.error('Data loading error:', err);
    } finally {
      loading = false;
    }
  };
  
  const loadReservations = async () => {
    try {
      const response = await fetch(`${base}/api/reservations?date=${selectedDate}`);
      const result = await response.json();
      
      if (result.success) {
        // 強制的にリアクティブ更新をトリガーするため新しい配列を作成
        reservations = [...result.data];
        console.log('Reservations updated:', reservations.length, 'items');
      }
    } catch (err) {
      console.error('Failed to load reservations:', err);
    }
  };
  
  // 日付変更時に予約データを再読み込み (クライアント側のみ)
  $: if (selectedDate && typeof window !== 'undefined') {
    loadReservations();
  }
  
  // WebSocket setup
  const setupWebSocket = () => {
    if (currentUser) {
      wsManager.connect(currentUser.id, currentUser.name);
      
      // 現在の日付の部屋に参加
      wsManager.joinRoom(selectedDate);
    }
  };
  
  // Custom event listeners for reservation updates
  let reservationCreatedHandler;
  let reservationCancelledHandler;
  
  const setupReservationEventListeners = () => {
    reservationCreatedHandler = (event) => {
      const reservationData = event.detail;
      console.log('📅 Received reservation-created event:', reservationData);
      
      if (reservationData.date === selectedDate) {
        console.log(`📅 ${reservationData.user.name} created a reservation (current date: ${selectedDate})`);
        
        // 自分の予約の場合はスキップ（HTTPレスポンスで既に追加済み）
        if (reservationData.user.id === currentUser?.id) {
          console.log('Skipping own reservation from WebSocket (already added via HTTP)');
          return;
        }
        
        // 他のユーザーの予約のみ追加
        const reservation = reservationData.reservation || reservationData;
        const existingReservation = reservations.find(r => r.id === reservation.id);
        
        if (!existingReservation) {
          reservations = [...reservations, reservation];
          console.log(`Updated reservations: ${reservations.length} total`);
        } else {
          console.log('Reservation with same ID already exists, skipping duplicate');
        }
      }
    };
    
    reservationCancelledHandler = (event) => {
      const cancelData = event.detail;
      console.log('🗑️ Received reservation-cancelled event:', cancelData);
      
      if (cancelData.date === selectedDate) {
        console.log(`🗑️ ${cancelData.user.name} cancelled a reservation`);
        
        // 自分のキャンセルの場合はスキップ（HTTPレスポンスで既に削除済み）
        if (cancelData.user.id === currentUser?.id) {
          console.log('Skipping own cancellation from WebSocket (already removed via HTTP)');
          return;
        }
        
        // 他のユーザーのキャンセルのみ処理
        const reservationId = cancelData.reservationId || cancelData.id;
        reservations = reservations.filter(r => r.id !== reservationId);
        console.log(`Updated reservations after cancellation: ${reservations.length} total`);
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('reservation-created', reservationCreatedHandler);
      window.addEventListener('reservation-cancelled', reservationCancelledHandler);
    }
  };
  
  const removeReservationEventListeners = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('reservation-created', reservationCreatedHandler);
      window.removeEventListener('reservation-cancelled', reservationCancelledHandler);
    }
  };
  
  // 日付変更時にWebSocket部屋を変更
  $: if (selectedDate && currentUser && connectionStatus === 'connected') {
    wsManager.leaveRoom(wsManager.currentRoom);
    wsManager.joinRoom(selectedDate);
  }
  
  // バンド選択
  const handleBandSelected = (event) => {
    selectedBand = event.detail;
  };
  
  const handleBandDeselected = () => {
    selectedBand = null;
  };
  
  // 予約作成
  const handleCreateReservation = async (event) => {
    try {
      const { timeSlotId, roomId, bandId, date, eventName, description } = event.detail;

      const response = await fetch(`${base}/api/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeSlotId,
          roomId,
          bandId,
          date,
          eventName,
          description
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('🎉 RESERVATION SUCCESS - Starting immediate UI update');
        console.log('📦 New reservation data:', result.data);
        
        // 即座にローカル配列に新しい予約を追加（リアクティブ更新のため）
        const oldCount = reservations.length;
        console.log(`🔄 BEFORE UPDATE: reservations array has ${oldCount} items`);
        
        reservations = [...reservations, result.data];
        
        console.log(`🔄 AFTER UPDATE: reservations array has ${reservations.length} items`);
        console.log(`🔄 UI should now show the new reservation without reload!`);
        
        // 強制的にリアクティブ更新をトリガー
        reservations = reservations;
        
        // さらに強制的に更新（次のティックで）
        setTimeout(() => {
          reservations = [...reservations];
          console.log('🔄 CREATION: Second UI update triggered');
        }, 10);
        
        alert('予約が完了しました');
      } else {
        alert('予約に失敗しました: ' + result.error);
      }
    } catch (err) {
      alert('予約中にエラーが発生しました');
      console.error('Reservation error:', err);
    }
  };
  
  // 予約キャンセル
  const handleCancelReservation = async (event) => {
    try {
      const { reservationId, date, timeSlotId, roomId } = event.detail;
      
      // 予約の詳細を取得してバージョンを確認
      const reservation = reservations.find(r => r.id === reservationId);
      const version = reservation?.version || 1;
      
      const response = await fetch(`${base}/api/reservations/${reservationId}?date=${date}&roomId=${roomId}&timeSlotId=${timeSlotId}&version=${version}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('Reservation cancelled successfully:', reservationId);
        
        // 即座にローカル配列から予約を削除（リアクティブ更新のため）
        const oldCount = reservations.length;
        reservations = reservations.filter(r => r.id !== reservationId);
        console.log(`Reservations count: ${oldCount} -> ${reservations.length}`);
        console.log('🔄 CANCELLATION: Forcing UI update...');
        
        // 強制的にリアクティブ更新をトリガー
        reservations = reservations;
        
        // さらに強制的に更新（次のティックで）
        setTimeout(() => {
          reservations = [...reservations];
          console.log('🔄 CANCELLATION: Second UI update triggered');
        }, 10);
        
        alert('予約がキャンセルされました');
      } else {
        alert('キャンセルに失敗しました: ' + result.error);
      }
    } catch (err) {
      alert('キャンセル中にエラーが発生しました');
      console.error('Cancel error:', err);
    }
  };
  
  // 日付操作関数
  const changeDate = (days) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    selectedDate = currentDate.toISOString().split('T')[0];
  };
  
  const goToToday = () => {
    selectedDate = new Date().toLocaleDateString('sv-SE');
  };
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date().toLocaleDateString('sv-SE');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toLocaleDateString('sv-SE');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toLocaleDateString('sv-SE');
    
    if (dateString === today) return '本日';
    if (dateString === tomorrowString) return '明日';
    if (dateString === yesterdayString) return '昨日';
    
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = dayNames[date.getDay()];
    
    return `${month}/${day}(${dayName})`;
  };

  // ログアウト
  const handleLogout = async () => {
    try {
      await fetch(`${base}/api/auth/logout`, { method: 'POST' });
      window.location.href = `${base}/login`;
    } catch (err) {
      console.error('Logout error:', err);
    }
  };
</script>

<svelte:head>
  <title>{config?.app?.name || '合宿予約システム'}</title>
</svelte:head>

{#if loading}
  <div class="flex justify-center items-center min-h-[400px]">
    <div class="text-center">
      <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="text-gray-600">データを読み込んでいます...</p>
    </div>
  </div>
{:else if error}
  <div class="bg-red-50 border border-red-200 rounded-md p-4">
    <div class="flex">
      <svg class="h-5 w-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div class="flex-1">
        <h3 class="text-sm font-medium text-red-800">エラーが発生しました</h3>
        <p class="text-sm text-red-700 mt-1">{error}</p>
        <button 
          on:click={loadData}
          class="mt-2 text-sm text-red-800 underline hover:text-red-900"
        >
          再試行
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="space-y-6">
    <!-- ヘッダー -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">予約システム</h1>
        {#if currentUser}
          <p class="text-sm text-gray-600 mt-1">
            ログイン中: <span class="font-medium">{currentUser.name}</span> ({currentUser.grade})
          </p>
        {/if}
      </div>
      
      <div class="mt-4 sm:mt-0 flex items-center space-x-4">
        <!-- 日付ナビゲーション -->
        <div class="flex items-center space-x-2">
          <span class="text-sm font-medium text-gray-700">予約日</span>
          <div class="flex items-center space-x-1 bg-white rounded-lg border border-gray-300 shadow-sm">
            <!-- 前の日ボタン -->
            <button
              on:click={() => changeDate(-1)}
              class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-l-lg transition-colors"
              title="前の日"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            
            <!-- 現在の日付表示 -->
            <div class="px-4 py-2 min-w-[120px] text-center">
              <div class="text-sm font-medium text-gray-900">
                {formatDate(selectedDate)}
              </div>
              <div class="text-xs text-gray-500">
                {selectedDate}
              </div>
            </div>
            
            <!-- 次の日ボタン -->
            <button
              on:click={() => changeDate(1)}
              class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-r-lg transition-colors"
              title="次の日"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
          
          <!-- 本日ボタン -->
          <button
            on:click={goToToday}
            class="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md border border-blue-200 hover:border-blue-300 transition-colors"
          >
            本日
          </button>
        </div>
        
        <!-- フィードバック -->
        <button
          on:click={() => showFeedbackForm = true}
          class="text-sm text-blue-600 hover:text-blue-700 underline"
          title="フィードバック送信"
        >
          💬 フィードバック
        </button>

        <!-- 管理者画面リンク -->
        {#if isAdmin}
          <a
            href="{base}/admin"
            class="text-sm text-purple-600 hover:text-purple-800 underline"
          >
            管理者画面
          </a>
        {/if}

        <!-- ログアウト -->
        <button
          on:click={handleLogout}
          class="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          ログアウト
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- バンド選択 -->
      <div class="lg:col-span-1">
        <BandSelector 
          {bands}
          {selectedBand}
          {currentUser}
          bandMemberFiltering={config?.features?.band_member_filtering || false}
          on:band_selected={handleBandSelected}
          on:band_deselected={handleBandDeselected}
        />
      </div>

      <!-- 予約グリッド -->
      <div class="lg:col-span-2">
        <ReservationGrid
          {rooms}
          {timeSlots}
          {reservations}
          {bands}
          {config}
          {selectedDate}
          {currentUser}
          {selectedBand}
          on:create_reservation={handleCreateReservation}
          on:cancel_reservation={handleCancelReservation}
        />
      </div>
    </div>
  </div>
{/if}

<!-- フィードバックフォーム -->
<FeedbackForm 
  {currentUser}
  bind:visible={showFeedbackForm}
  on:close={() => showFeedbackForm = false}
  on:feedback_submitted={() => {
    console.log('Feedback submitted successfully');
    showFeedbackForm = false;
  }}
/>