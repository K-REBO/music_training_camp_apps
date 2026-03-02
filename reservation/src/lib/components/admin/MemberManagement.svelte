<script>
  import { base } from '$app/paths';
  import { createEventDispatcher, onMount } from 'svelte';

  export let members = [];

  const dispatch = createEventDispatcher();

  const GRADES = ['中大1年', '中大2年', '中大3年', '実践1年', '実践2年', '実践3年', 'その他'];

  let showModal = false;
  let editTarget = null; // null = 新規追加
  let formName = '';
  let formGrade = GRADES[0];
  let formLineUserId = '';
  let saving = false;
  let errorMsg = '';

  // LINE登録待ち
  let pendingUsers = [];
  let pendingOpen = false;
  let pendingLoading = false;
  let linkingUserId = null; // リンク中のUser ID
  let linkSelectMemberId = ''; // 選択中のメンバーID

  onMount(() => {
    loadPending();
  });

  async function loadPending() {
    pendingLoading = true;
    try {
      const res = await fetch(`${base}/api/line/pending`);
      if (res.ok) {
        const result = await res.json();
        pendingUsers = result.data ?? [];
      }
    } catch (e) {
      // pending取得失敗は無視（管理者でない場合も含む）
    } finally {
      pendingLoading = false;
    }
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function startLink(userId) {
    linkingUserId = userId;
    linkSelectMemberId = '';
  }

  function cancelLink() {
    linkingUserId = null;
    linkSelectMemberId = '';
  }

  async function confirmLink(pendingUser) {
    if (!linkSelectMemberId) return;
    try {
      const res = await fetch(`${base}/api/members/${linkSelectMemberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: pendingUser.lineUserId })
      });
      const result = await res.json();
      if (result.success) {
        linkingUserId = null;
        linkSelectMemberId = '';
        dispatch('change');
        await loadPending();
      } else {
        alert(result.error || 'リンクに失敗しました');
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  }

  async function dismissPending(userId) {
    try {
      const res = await fetch(`${base}/api/line/pending?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        pendingUsers = pendingUsers.filter(p => p.lineUserId !== userId);
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  }

  // メンバーを学年順→名前順でソート
  $: sortedMembers = [...members].sort((a, b) => {
    const gradeOrder = GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
    if (gradeOrder !== 0) return gradeOrder;
    return a.name.localeCompare(b.name, 'ja');
  });

  function openAdd() {
    editTarget = null;
    formName = '';
    formGrade = GRADES[0];
    formLineUserId = '';
    errorMsg = '';
    showModal = true;
  }

  function openEdit(member) {
    editTarget = member;
    formName = member.name;
    formGrade = member.grade;
    formLineUserId = member.lineUserId || '';
    errorMsg = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    errorMsg = '';
  }

  async function handleSave() {
    if (!formName.trim()) {
      errorMsg = '名前を入力してください';
      return;
    }
    saving = true;
    errorMsg = '';
    try {
      let res;
      if (editTarget) {
        res = await fetch(`${base}/api/members/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), grade: formGrade, lineUserId: formLineUserId.trim() })
        });
      } else {
        res = await fetch(`${base}/api/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), grade: formGrade })
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

  async function handleDelete(member) {
    const confirmed = confirm(
      `「${member.name}」を削除しますか？\n※ 所属バンドの memberIds は自動更新されません。バンド管理で手動修正してください。`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${base}/api/members/${member.id}`, { method: 'DELETE' });
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
</script>

<div class="space-y-4">
  <!-- LINE登録待ちセクション -->
  {#if pendingUsers.length > 0 || pendingLoading}
    <div class="border border-green-200 rounded-lg overflow-hidden">
      <button
        on:click={() => pendingOpen = !pendingOpen}
        class="w-full flex items-center justify-between px-4 py-3 bg-green-50 hover:bg-green-100 transition-colors text-sm font-medium text-green-800"
      >
        <span>LINE登録待ち ({pendingLoading ? '...' : pendingUsers.length}件)</span>
        <span class="text-green-600">{pendingOpen ? '▲' : '▼'}</span>
      </button>

      {#if pendingOpen}
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-2 font-medium text-gray-700">表示名</th>
                <th class="text-left px-4 py-2 font-medium text-gray-700">受信日時</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {#each pendingUsers as p (p.lineUserId)}
                <tr class="border-b border-gray-100">
                  <td class="px-4 py-2 font-medium text-gray-900">{p.displayName || '(不明)'}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs">{formatDate(p.receivedAt)}</td>
                  <td class="px-4 py-2 text-right space-x-2">
                    {#if linkingUserId === p.lineUserId}
                      <select
                        bind:value={linkSelectMemberId}
                        class="text-xs px-2 py-1 border border-gray-300 rounded"
                      >
                        <option value="">-- メンバー選択 --</option>
                        {#each [...members].sort((a, b) => a.name.localeCompare(b.name, 'ja')) as m}
                          <option value={m.id}>{m.name} ({m.grade})</option>
                        {/each}
                      </select>
                      <button
                        on:click={() => confirmLink(p)}
                        disabled={!linkSelectMemberId}
                        class="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded border border-green-200 hover:border-green-400 disabled:opacity-40 transition-colors"
                      >
                        確定
                      </button>
                      <button
                        on:click={cancelLink}
                        class="text-gray-500 hover:text-gray-700 text-xs px-2 py-1 rounded border border-gray-200 transition-colors"
                      >
                        取消
                      </button>
                    {:else}
                      <button
                        on:click={() => startLink(p.lineUserId)}
                        class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
                      >
                        リンク
                      </button>
                      <button
                        on:click={() => dismissPending(p.lineUserId)}
                        class="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors"
                      >
                        無視
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}

  <div class="flex justify-between items-center">
    <h2 class="text-lg font-semibold text-gray-800">メンバー管理</h2>
    <button
      on:click={openAdd}
      class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
    >
      + メンバー追加
    </button>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200">
          <th class="text-left px-4 py-3 font-medium text-gray-700">名前</th>
          <th class="text-left px-4 py-3 font-medium text-gray-700">学年</th>
          <th class="text-left px-4 py-3 font-medium text-gray-700">LINE</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedMembers as member (member.id)}
          <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-900">{member.name}</td>
            <td class="px-4 py-3 text-gray-600">{member.grade}</td>
            <td class="px-4 py-3">
              {#if member.lineUserId}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">登録済</span>
              {:else}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">未登録</span>
              {/if}
            </td>
            <td class="px-4 py-3 text-right space-x-2">
              <button
                on:click={() => openEdit(member)}
                class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded border border-blue-200 hover:border-blue-400 transition-colors"
              >
                編集
              </button>
              <button
                on:click={() => handleDelete(member)}
                class="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded border border-red-200 hover:border-red-400 transition-colors"
              >
                削除
              </button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" class="px-4 py-8 text-center text-gray-400">メンバーが登録されていません</td>
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
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">
        {editTarget ? 'メンバー編集' : 'メンバー追加'}
      </h3>

      {#if errorMsg}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {errorMsg}
        </div>
      {/if}

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="member-name">名前</label>
          <input
            id="member-name"
            type="text"
            bind:value={formName}
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例: 山田太郎"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="member-grade">学年</label>
          <select
            id="member-grade"
            bind:value={formGrade}
            class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {#each GRADES as g}
              <option value={g}>{g}</option>
            {/each}
          </select>
        </div>
        {#if editTarget && editTarget.lineUserId}
          {#if formLineUserId === ''}
            <div class="flex items-center justify-between p-3 bg-red-50 border border-red-300 rounded-md">
              <span class="text-sm text-red-700 font-medium">LINE ID を削除します</span>
              <button
                type="button"
                on:click={() => formLineUserId = editTarget.lineUserId}
                class="text-xs text-gray-600 hover:text-gray-800 border border-gray-300 hover:border-gray-400 px-2 py-1 rounded transition-colors"
              >
                取消
              </button>
            </div>
          {:else}
            <div class="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
              <span class="text-sm text-green-800 font-medium">LINE 登録済み</span>
              <button
                type="button"
                on:click={() => formLineUserId = ''}
                class="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2 py-1 rounded transition-colors"
              >
                削除
              </button>
            </div>
          {/if}
        {/if}
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
