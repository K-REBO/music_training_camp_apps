<script>
  import { base } from '$app/paths';
  import { createEventDispatcher } from 'svelte';

  export let rooms = [];

  const dispatch = createEventDispatcher();

  /** 'closed' | 'add' | 'edit' */
  let modalMode = 'closed';
  let editTarget = null;
  let formName = '';
  let saving = false;
  let errorMsg = '';

  $: lastStudioRoomId = (() => {
    const last = rooms[rooms.length - 1];
    return last?.type === 'studio' ? last.id : null;
  })();

  function openAdd() {
    modalMode = 'add';
    formName = '';
    errorMsg = '';
  }

  function openEdit(room) {
    modalMode = 'edit';
    editTarget = room;
    formName = room.name;
    errorMsg = '';
  }

  function closeModal() {
    modalMode = 'closed';
    editTarget = null;
    errorMsg = '';
  }

  async function handleSave() {
    if (!formName.trim()) {
      errorMsg = '部屋名を入力してください';
      return;
    }
    saving = true;
    errorMsg = '';
    try {
      const url = modalMode === 'add' ? `${base}/api/rooms` : `${base}/api/rooms/${editTarget.id}`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() })
      });
      const result = await res.json();
      if (result.success) {
        dispatch('change');
        closeModal();
      } else {
        errorMsg = result.error || '操作に失敗しました';
      }
    } catch {
      errorMsg = '通信エラーが発生しました';
    } finally {
      saving = false;
    }
  }

  async function handleDelete(room) {
    if (!confirm(`「${room.name}」を削除しますか？\n末尾のスタジオのみ削除できます。`)) return;
    try {
      const res = await fetch(`${base}/api/rooms/${room.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        dispatch('change');
      } else {
        alert(result.error || '削除に失敗しました');
      }
    } catch {
      alert('通信エラーが発生しました');
    }
  }
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    <h2 class="text-lg font-semibold text-gray-800">部屋管理</h2>
    <button
      on:click={openAdd}
      class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
    >
      + スタジオ追加
    </button>
  </div>

  <p class="text-xs text-gray-500">
    ※ イベント列は編集・削除できません。スタジオは末尾のみ削除可能です。
  </p>

  <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200">
          <th class="text-left px-4 py-3 font-medium text-gray-700">ID</th>
          <th class="text-left px-4 py-3 font-medium text-gray-700">名前</th>
          <th class="text-left px-4 py-3 font-medium text-gray-700">種別</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each rooms as room (room.id)}
          <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">{room.id}</td>
            <td class="px-4 py-3 font-medium text-gray-900">{room.name}</td>
            <td class="px-4 py-3">
              {#if room.type === 'event'}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                  🔒 イベント
                </span>
              {:else}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  スタジオ
                </span>
              {/if}
            </td>
            <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
              {#if room.type !== 'event'}
                <button
                  on:click={() => openEdit(room)}
                  class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
                >
                  名前変更
                </button>
              {/if}
              {#if room.id === lastStudioRoomId}
                <button
                  on:click={() => handleDelete(room)}
                  class="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded border border-red-200 hover:border-red-400 transition-colors"
                >
                  削除
                </button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" class="px-4 py-8 text-center text-gray-400">部屋が登録されていません</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

{#if modalMode !== 'closed'}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    on:click|self={closeModal}
  >
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">
        {modalMode === 'add' ? 'スタジオ追加' : '名前変更'}
      </h3>

      {#if errorMsg}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {errorMsg}
        </div>
      {/if}

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1" for="room-name-input">
          {modalMode === 'add' ? '部屋名' : '新しい部屋名'}
        </label>
        <input
          id="room-name-input"
          type="text"
          bind:value={formName}
          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: スタジオF"
        />
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
          {#if saving}
            {modalMode === 'add' ? '追加中...' : '保存中...'}
          {:else}
            {modalMode === 'add' ? '追加' : '保存'}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
