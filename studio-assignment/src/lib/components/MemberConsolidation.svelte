<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let bandsData = { bands: [] };
  
  let allMembers = [];
  let mergeGroups = [];
  let showExportModal = false;
  let consolidatedData = null;
  let selectedMembers = new Set();
  
  // 全メンバーを収集
  function collectAllMembers() {
    const members = [];
    
    bandsData.bands.forEach(band => {
      Object.entries(band.members).forEach(([instrument, member]) => {
        if (member && member !== 'UNKNOWN') {
          members.push({
            name: member,
            bandName: band.name,
            instrument: instrument,
            id: `${band.name}-${instrument}-${member}`
          });
        }
      });
    });
    
    allMembers = members;
  }
  
  // バンドデータが変更されたらメンバーを収集
  $: if (bandsData.bands.length > 0) {
    collectAllMembers();
  }
  
  // メンバー選択のトグル
  function toggleMemberSelection(member) {
    if (selectedMembers.has(member.id)) {
      selectedMembers.delete(member.id);
    } else {
      selectedMembers.add(member.id);
    }
    selectedMembers = new Set(selectedMembers);
  }
  
  // 選択されたメンバーを新しい結合グループに追加
  function createMergeGroup() {
    if (selectedMembers.size < 2) {
      alert('結合するには少なくとも2人のメンバーを選択してください。');
      return;
    }
    
    const selectedMembersList = allMembers.filter(m => selectedMembers.has(m.id));
    const newGroup = {
      id: mergeGroups.length,
      members: selectedMembersList,
      targetName: selectedMembersList[0].name
    };
    
    mergeGroups = [...mergeGroups, newGroup];
    selectedMembers = new Set();
  }
  
  // 結合グループを削除
  function removeMergeGroup(groupId) {
    mergeGroups = mergeGroups.filter(g => g.id !== groupId);
  }
  
  // 選択をクリア
  function clearSelection() {
    selectedMembers = new Set();
  }
  
  // データを統合して新しいband.jsonを生成
  function consolidateData() {
    const newBands = JSON.parse(JSON.stringify(bandsData.bands));
    
    // 各結合グループに対して処理
    mergeGroups.forEach(group => {
      const targetName = group.targetName;
      
      // グループ内の全ての名前を統一
      group.members.forEach(member => {
        const band = newBands.find(b => b.name === member.bandName);
        if (band && band.members[member.instrument] === member.name) {
          band.members[member.instrument] = targetName;
        }
      });
    });
    
    consolidatedData = {
      config: bandsData.config,
      bands: newBands
    };
    
    return consolidatedData;
  }
  
  // JSONをダウンロード
  function downloadJson() {
    const data = consolidateData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'consolidated-band.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // 結合後データをアプリに適用
  function applyConsolidation() {
    const data = consolidateData();
    dispatch('dataUpdated', data);
    showExportModal = false;
  }
</script>

<div class="p-6">
  <h2 class="text-2xl font-bold mb-6">メンバー結合管理</h2>
  
  {#if bandsData.bands.length === 0}
    <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-600">
      <p>バンドデータが読み込まれていません。</p>
      <p>File Uploadタブからデータを読み込んでください。</p>
    </div>
  {:else}
    <!-- メンバー一覧セクション -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">全メンバー一覧</h3>
        <div class="flex gap-2">
          <button 
            on:click={createMergeGroup}
            disabled={selectedMembers.size < 2}
            class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            選択したメンバーを結合 ({selectedMembers.size})
          </button>
          <button 
            on:click={clearSelection}
            disabled={selectedMembers.size === 0}
            class="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            選択クリア
          </button>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto border rounded p-3 bg-gray-50">
        {#each allMembers as member (member.id)}
          <label class="flex items-center p-2 hover:bg-white rounded cursor-pointer">
            <input 
              type="checkbox"
              checked={selectedMembers.has(member.id)}
              on:change={() => toggleMemberSelection(member)}
              class="mr-2"
            />
            <div class="text-sm">
              <span class="font-medium">{member.name}</span>
              <div class="text-gray-500 text-xs">{member.bandName} - {member.instrument}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- 結合グループセクション -->
    {#if mergeGroups.length > 0}
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-4">結合グループ ({mergeGroups.length})</h3>
        
        <div class="space-y-4">
          {#each mergeGroups as group (group.id)}
            <div class="bg-white border rounded-lg p-4 shadow-sm">
              <div class="flex items-center justify-between mb-3">
                <h4 class="font-medium text-gray-900">グループ {group.id + 1}</h4>
                <button 
                  on:click={() => removeMergeGroup(group.id)}
                  class="text-red-600 hover:text-red-800 text-sm"
                >
                  削除
                </button>
              </div>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h5 class="text-sm font-medium text-gray-700 mb-2">結合対象メンバー</h5>
                  <div class="space-y-1">
                    {#each group.members as member}
                      <div class="text-sm bg-gray-50 rounded px-2 py-1">
                        <span class="font-medium">{member.name}</span>
                        <span class="text-gray-500">({member.bandName} - {member.instrument})</span>
                      </div>
                    {/each}
                  </div>
                </div>
                
                <div>
                  <h5 class="text-sm font-medium text-gray-700 mb-2">統一後の名前</h5>
                  <select 
                    bind:value={group.targetName}
                    class="w-full p-2 border rounded text-sm"
                  >
                    {#each [...new Set(group.members.map(m => m.name))] as uniqueName}
                      <option value={uniqueName}>{uniqueName}</option>
                    {/each}
                  </select>
                  <input 
                    type="text"
                    bind:value={group.targetName}
                    placeholder="または新しい名前を入力"
                    class="w-full p-2 border rounded text-sm mt-2"
                  />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- エクスポートボタン -->
    <div class="flex gap-4">
      <button 
        on:click={() => showExportModal = true}
        disabled={mergeGroups.length === 0}
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        結合を実行してエクスポート
      </button>
    </div>
  {/if}
</div>

<!-- エクスポートモーダル -->
{#if showExportModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full m-4">
      <h3 class="text-lg font-semibold mb-4">結合データのエクスポート</h3>
      
      <div class="mb-4">
        <p class="text-gray-600 mb-2">結合処理の結果:</p>
        <div class="bg-gray-50 rounded p-3 text-sm">
          {#each mergeGroups as group}
            <div class="mb-2">
              <strong>グループ {group.id + 1}:</strong> 
              {group.members.map(m => m.name).join(', ')} → {group.targetName}
            </div>
          {/each}
        </div>
      </div>
      
      <div class="flex gap-3">
        <button 
          on:click={downloadJson}
          class="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          JSONファイルをダウンロード
        </button>
        
        <button 
          on:click={applyConsolidation}
          class="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          アプリに適用
        </button>
        
        <button 
          on:click={() => showExportModal = false}
          class="px-4 py-2 border rounded hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
{/if}