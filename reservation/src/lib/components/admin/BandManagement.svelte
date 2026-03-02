<script>
  import { base } from '$app/paths';
  import { createEventDispatcher } from 'svelte';

  export let bands = [];
  export let members = []; // メンバー選択ドロップダウン用

  const dispatch = createEventDispatcher();

  let showModal = false;
  let editTarget = null; // null = 新規追加
  let formName = '';
  // instrumentRows: [{ instrument: string, memberId: string }]
  let instrumentRows = [{ instrument: '', memberId: '' }];
  let saving = false;
  let errorMsg = '';

  $: sortedBands = [...bands].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  // メンバーをID→名前でマップ
  $: memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  function openAdd() {
    editTarget = null;
    formName = '';
    instrumentRows = [{ instrument: '', memberId: '' }];
    errorMsg = '';
    showModal = true;
  }

  function openEdit(band) {
    editTarget = band;
    formName = band.name;
    // band.members は { instrument: memberName } なので memberId に変換
    const rows = Object.entries(band.members || {}).map(([instrument, memberName]) => {
      const member = members.find(m => m.name === memberName);
      return { instrument, memberId: member?.id || '' };
    });
    instrumentRows = rows.length > 0 ? rows : [{ instrument: '', memberId: '' }];
    errorMsg = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    errorMsg = '';
  }

  function addRow() {
    instrumentRows = [...instrumentRows, { instrument: '', memberId: '' }];
  }

  function removeRow(i) {
    instrumentRows = instrumentRows.filter((_, idx) => idx !== i);
    if (instrumentRows.length === 0) {
      instrumentRows = [{ instrument: '', memberId: '' }];
    }
  }

  async function handleSave() {
    if (!formName.trim()) {
      errorMsg = 'バンド名を入力してください';
      return;
    }

    // members オブジェクトと memberIds 配列を構築
    const membersObj = {};
    const memberIds = [];
    for (const row of instrumentRows) {
      if (!row.instrument.trim() && !row.memberId) continue;
      if (row.instrument.trim() && row.memberId) {
        const m = memberMap[row.memberId];
        if (m) {
          membersObj[row.instrument.trim()] = m.name;
          if (!memberIds.includes(row.memberId)) memberIds.push(row.memberId);
        }
      }
    }

    saving = true;
    errorMsg = '';
    try {
      let res;
      if (editTarget) {
        res = await fetch(`${base}/api/bands/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), members: membersObj, memberIds })
        });
      } else {
        res = await fetch(`${base}/api/bands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), members: membersObj, memberIds })
        });
      }
      const result = await res.json();
      if (result.success) {
        dispatch('change');
        closeModal();
      } else {
        errorMsg = result.error || '保存に失敗しました';
      }
    } catch (e) {
      errorMsg = '通信エラーが発生しました';
    } finally {
      saving = false;
    }
  }

  async function handleExport() {
    const res = await fetch(`${base}/api/export/bands`);
    if (!res.ok) {
      alert('エクスポートに失敗しました');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'バンドメンバー表.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(band) {
    const confirmed = confirm(`「${band.name}」を削除しますか？\nこのバンドに関連する予約データは残ります。`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${base}/api/bands/${band.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        dispatch('change');
      } else {
        alert(result.error || '削除に失敗しました');
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  }

  function getMemberListText(band) {
    const entries = Object.entries(band.members || {});
    if (entries.length === 0) return '（メンバー未登録）';
    return entries.map(([inst, name]) => `${inst}: ${name}`).join(' / ');
  }
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    <h2 class="text-lg font-semibold text-gray-800">バンド管理</h2>
    <div class="flex gap-2">
      <button
        on:click={handleExport}
        class="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
      >
        JSONエクスポート
      </button>
      <button
        on:click={openAdd}
        class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
      >
        + バンド追加
      </button>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200">
          <th class="text-left px-4 py-3 font-medium text-gray-700">バンド名</th>
          <th class="text-left px-4 py-3 font-medium text-gray-700">メンバー構成</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedBands as band (band.id)}
          <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-900">{band.name}</td>
            <td class="px-4 py-3 text-gray-600 text-xs">{getMemberListText(band)}</td>
            <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
              <button
                on:click={() => openEdit(band)}
                class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
              >
                編集
              </button>
              <button
                on:click={() => handleDelete(band)}
                class="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded border border-red-200 hover:border-red-400 transition-colors"
              >
                削除
              </button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="3" class="px-4 py-8 text-center text-gray-400">バンドが登録されていません</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- モーダル -->
{#if showModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    on:click|self={closeModal}
  >
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">
        {editTarget ? 'バンド編集' : 'バンド追加'}
      </h3>

      {#if errorMsg}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {errorMsg}
        </div>
      {/if}

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="band-name">バンド名</label>
          <input
            id="band-name"
            type="text"
            bind:value={formName}
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例: ロックバンドA"
          />
        </div>

        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-gray-700">メンバー構成</span>
            <button
              on:click={addRow}
              class="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-1 rounded transition-colors"
            >
              + 行追加
            </button>
          </div>
          <div class="space-y-2">
            {#each instrumentRows as row, i (i)}
              <div class="flex gap-2 items-center">
                <input
                  type="text"
                  bind:value={row.instrument}
                  placeholder="楽器 (例: ギター)"
                  class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  bind:value={row.memberId}
                  class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- 未選択 --</option>
                  {#each members as m (m.id)}
                    <option value={m.id}>{m.name} ({m.grade})</option>
                  {/each}
                </select>
                <button
                  on:click={() => removeRow(i)}
                  class="text-red-400 hover:text-red-600 px-1"
                  title="この行を削除"
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
          <p class="text-xs text-gray-400 mt-1">楽器とメンバーの両方を入力した行のみ保存されます</p>
        </div>
      </div>

      <div class="mt-6 flex justify-end space-x-3">
        <button
          on:click={closeModal}
          class="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          キャンセル
        </button>
        <button
          on:click={handleSave}
          disabled={saving}
          class="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  </div>
{/if}
