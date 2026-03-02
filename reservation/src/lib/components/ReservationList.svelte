<script>
  import { createEventDispatcher } from 'svelte';
  
  export let reservations = [];
  
  const dispatch = createEventDispatcher();
  
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const formatDateTime = (dateTime) => {
    return new Date(dateTime).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getRoomTypeLabel = (roomType) => {
    const types = {
      studio: 'スタジオ',
      practice: '練習室',
      meeting: '会議室'
    };
    return types[roomType] || roomType;
  };
  
  const handleDelete = (id) => {
    if (confirm('この予約を削除してよろしいですか？')) {
      dispatch('delete', id);
    }
  };
  
  // 日付順でソート
  $: sortedReservations = reservations.sort((a, b) => {
    const dateA = new Date(a.date + 'T' + a.time);
    const dateB = new Date(b.date + 'T' + b.time);
    return dateA - dateB;
  });
</script>

{#if sortedReservations.length === 0}
  <div class="text-center py-8">
    <div class="text-gray-400 mb-2">
      <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10h8V11H8z"></path>
      </svg>
    </div>
    <p class="text-gray-500">予約がありません</p>
  </div>
{:else}
  <div class="space-y-4">
    {#each sortedReservations as reservation (reservation.id)}
      <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div class="flex-1">
            <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
              <h3 class="text-lg font-medium text-gray-900">
                {reservation.name}
              </h3>
              <div class="flex flex-wrap gap-2 mt-2 sm:mt-0">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {getRoomTypeLabel(reservation.roomType)}
                </span>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {reservation.participants}名
                </span>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {reservation.duration}時間
                </span>
              </div>
            </div>
            
            <div class="mt-2 text-sm text-gray-600 space-y-1">
              <div class="flex items-center">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10h8V11H8z"></path>
                </svg>
                {formatDate(reservation.date)} {reservation.time}〜
              </div>
              
              {#if reservation.email}
                <div class="flex items-center">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                  {reservation.email}
                </div>
              {/if}
              
              {#if reservation.phone}
                <div class="flex items-center">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                  </svg>
                  {reservation.phone}
                </div>
              {/if}
              
              {#if reservation.notes}
                <div class="mt-2">
                  <p class="text-gray-700 text-sm bg-gray-50 rounded p-2">
                    {reservation.notes}
                  </p>
                </div>
              {/if}
            </div>
          </div>
          
          <div class="mt-4 sm:mt-0 sm:ml-4 flex flex-col sm:items-end">
            <div class="text-xs text-gray-400 mb-2">
              登録日時: {formatDateTime(reservation.createdAt)}
            </div>
            <button
              on:click={() => handleDelete(reservation.id)}
              class="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}