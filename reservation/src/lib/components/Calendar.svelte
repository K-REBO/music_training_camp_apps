<script>
  import { createEventDispatcher } from 'svelte';
  
  export let reservations = [];
  export let selectedDate = '';
  
  const dispatch = createEventDispatcher();
  
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  
  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];
  
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  
  // 月の日数を取得
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  // 月の最初の日の曜日を取得
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };
  
  // カレンダーの日付配列を生成
  const generateCalendar = (year, month) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    
    // 前月の日付で埋める
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // 今月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };
  
  // 指定日の予約数を取得
  const getReservationCount = (year, month, day) => {
    if (!day) return 0;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return reservations.filter(r => r.date === dateStr).length;
  };
  
  // 日付クリック処理
  const handleDateClick = (year, month, day) => {
    if (!day) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    selectedDate = dateStr;
    dispatch('dateSelect', dateStr);
  };
  
  // 前月に移動
  const prevMonth = () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
  };
  
  // 次月に移動
  const nextMonth = () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
  };
  
  // 今日かどうかを判定
  const isToday = (year, month, day) => {
    const today = new Date();
    return year === today.getFullYear() && 
           month === today.getMonth() && 
           day === today.getDate();
  };
  
  // 選択された日かどうかを判定
  const isSelected = (year, month, day) => {
    if (!day) return false;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === selectedDate;
  };
  
  $: calendarDays = generateCalendar(currentYear, currentMonth);
</script>

<div class="bg-white">
  <!-- ヘッダー -->
  <div class="flex items-center justify-between px-6 py-4 border-b">
    <button
      on:click={prevMonth}
      class="p-2 hover:bg-gray-100 rounded-full transition-colors"
      aria-label="前の月"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
      </svg>
    </button>
    
    <h2 class="text-xl font-semibold text-gray-900">
      {currentYear}年 {monthNames[currentMonth]}
    </h2>
    
    <button
      on:click={nextMonth}
      class="p-2 hover:bg-gray-100 rounded-full transition-colors"
      aria-label="次の月"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    </button>
  </div>
  
  <!-- カレンダー -->
  <div class="p-6">
    <!-- 曜日ヘッダー -->
    <div class="grid grid-cols-7 gap-1 mb-2">
      {#each weekDays as weekDay}
        <div class="h-10 flex items-center justify-center text-sm font-medium text-gray-700">
          {weekDay}
        </div>
      {/each}
    </div>
    
    <!-- 日付グリッド -->
    <div class="grid grid-cols-7 gap-1">
      {#each calendarDays as day}
        <button
          class="h-12 relative flex items-center justify-center text-sm rounded-lg transition-colors
                 {day ? 'hover:bg-gray-100' : ''}
                 {isToday(currentYear, currentMonth, day) ? 'bg-blue-100 text-blue-700 font-semibold' : ''}
                 {isSelected(currentYear, currentMonth, day) ? 'bg-blue-500 text-white' : ''}
                 {!day ? 'invisible' : ''}"
          on:click={() => handleDateClick(currentYear, currentMonth, day)}
          disabled={!day}
        >
          {day || ''}
          {#if day && getReservationCount(currentYear, currentMonth, day) > 0}
            <div class="absolute bottom-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
            <div class="absolute top-1 right-1 text-xs text-red-600 font-bold">
              {getReservationCount(currentYear, currentMonth, day)}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </div>
  
  <!-- 凡例 -->
  <div class="px-6 pb-4 text-xs text-gray-600 space-y-1">
    <div class="flex items-center space-x-4">
      <div class="flex items-center space-x-2">
        <div class="w-3 h-3 bg-blue-100 rounded"></div>
        <span>今日</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-3 h-3 bg-blue-500 rounded"></div>
        <span>選択中</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-red-500 rounded-full"></div>
        <span>予約あり</span>
      </div>
    </div>
  </div>
</div>