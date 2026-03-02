<script>
  import { createEventDispatcher } from 'svelte';
  
  export let bands = [];
  export let selectedBand = null;
  export let currentUser = null;
  export let bandMemberFiltering = false; // config.tomlから渡される設定値
  
  const dispatch = createEventDispatcher();
  
  // バンドフィルタリング設定に応じて表示バンドを決定
  // 管理者（椎木知仁）は全バンド選択可能
  $: availableBands = (bandMemberFiltering && currentUser?.name !== '椎木知仁')
    ? bands.filter(band => band.memberIds.includes(currentUser?.id))
    : bands;
  
  // 個人枠を作成（常に先頭に表示）
  $: personalBand = currentUser ? {
    id: `personal_${currentUser.id}`,
    name: `個人枠: ${currentUser.name}`,
    isPersonal: true,
    members: { '個人': currentUser.name },
    memberIds: [currentUser.id]
  } : null;
  
  // 個人枠 + バンドリストを結合
  $: allOptions = personalBand ? [personalBand, ...availableBands] : availableBands;
  
  const handleBandSelect = (band) => {
    selectedBand = band;
    dispatch('band_selected', band);
  };
  
  const clearSelection = () => {
    selectedBand = null;
    dispatch('band_deselected');
  };
</script>

<div class="bg-white rounded-lg shadow p-4">
  <h3 class="text-lg font-semibold text-gray-900 mb-4">バンドを選択</h3>
  
  {#if allOptions.length === 0}
    <div class="text-center py-8">
      <div class="text-gray-400 mb-2">
        <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
        </svg>
      </div>
      <p class="text-gray-500">
        {bandMemberFiltering ? "参加可能なバンドがありません" : "登録されたバンドがありません"}
      </p>
      <p class="text-sm text-gray-400 mt-1">
        {bandMemberFiltering 
          ? "管理者にバンド登録をお問い合わせください" 
          : "管理者がバンドを登録するまでお待ちください"}
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each allOptions as band (band.id)}
        <div 
          class="border rounded-lg p-4 cursor-pointer transition-all duration-200 {
            selectedBand?.id === band.id 
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
              : band.isPersonal 
                ? 'border-green-200 hover:border-green-300 hover:bg-green-50 bg-green-25' 
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }"
          on:click={() => handleBandSelect(band)}
          role="button"
          tabindex="0"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                {#if band.isPersonal}
                  <svg class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                {/if}
                <h4 class="font-medium text-gray-900">{band.name}</h4>
              </div>
              <div class="flex flex-wrap gap-2">
                {#if band.members}
                  {#each Object.entries(band.members) as [instrument, memberName]}
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {
                      memberName === currentUser?.name 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-gray-100 text-gray-800'
                    }">
                      {instrument}: {memberName}
                    </span>
                  {/each}
                {:else}
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {band.memberIds.length}名のメンバー
                  </span>
                {/if}
              </div>
            </div>
            
            {#if selectedBand?.id === band.id}
              <div class="ml-4">
                <svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    {#if selectedBand}
      <div class="mt-4 pt-4 border-t border-gray-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-900">選択中のバンド</p>
            <p class="text-lg text-blue-600">{selectedBand.name}</p>
          </div>
          <button
            on:click={clearSelection}
            class="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            選択解除
          </button>
        </div>
      </div>
    {/if}
  {/if}
  
  <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
    <div class="flex">
      <svg class="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
      </svg>
      <div class="text-sm text-yellow-700">
        <p class="font-medium">ご注意</p>
        <p>
          {bandMemberFiltering 
            ? "バンドメンバーの中から予約可能なバンドのみ表示されます。予約はバンド単位で行われます。"
            : "全てのバンドが表示されます。予約はバンド単位で行われます。"}
        </p>
        {#if bandMemberFiltering}
          <p class="text-xs text-yellow-600 mt-1">※ バンドメンバーフィルタリングが有効です</p>
        {/if}
      </div>
    </div>
  </div>
</div>