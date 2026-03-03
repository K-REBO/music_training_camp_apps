<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import BandManagement from '$lib/components/admin/BandManagement.svelte';
  import MemberManagement from '$lib/components/admin/MemberManagement.svelte';
  import RoomManagement from '$lib/components/admin/RoomManagement.svelte';
  import StudioAssignment from '$lib/components/admin/StudioAssignment.svelte';

  let activeTab = 'bands';
  let currentUser = null;
  let bands = [];
  let members = [];
  let rooms = [];
  let loading = true;

  async function loadData() {
    try {
      const [bandsRes, membersRes, roomsRes] = await Promise.all([
        fetch(`${base}/api/bands`),
        fetch(`${base}/api/members`),
        fetch(`${base}/api/rooms`)
      ]);
      const [bandsData, membersData, roomsData] = await Promise.all([
        bandsRes.json(),
        membersRes.json(),
        roomsRes.json()
      ]);
      if (bandsData.success) bands = bandsData.data;
      if (membersData.success) members = membersData.data;
      if (roomsData.success) rooms = roomsData.data;
    } catch (e) {
      console.error('Data loading error:', e);
    }
  }

  onMount(async () => {
    // 認証 + 管理者チェック
    try {
      const meRes = await fetch(`${base}/api/auth/me`);
      const meData = await meRes.json();
      if (!meData.success || !meData.data) {
        goto(`${base}/login`);
        return;
      }
      if (!meData.data.isAdmin) {
        goto(`${base}/`);
        return;
      }
      currentUser = meData.data;
    } catch (e) {
      goto(`${base}/login`);
      return;
    }
    await loadData();
    loading = false;
  });

  async function handleChange() {
    await loadData();
  }

  // LINE通知テンプレート
  let lineTemplate = '';
  let templateSaving = false;
  let templateMsg = '';

  async function loadTemplate() {
    const res = await fetch(`${base}/api/config/line-template`);
    if (res.ok) {
      const d = await res.json();
      lineTemplate = d.template;
    }
  }

  async function saveTemplate() {
    templateSaving = true;
    templateMsg = '';
    try {
      const res = await fetch(`${base}/api/config/line-template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: lineTemplate })
      });
      const d = await res.json();
      templateMsg = d.success ? '保存しました' : (d.error || '保存に失敗しました');
    } catch {
      templateMsg = '通信エラーが発生しました';
    } finally {
      templateSaving = false;
    }
  }

  $: if (activeTab === 'settings' && !lineTemplate) loadTemplate();

  async function handleLogout() {
    try {
      await fetch(`${base}/api/auth/logout`, { method: 'POST' });
      window.location.href = `${base}/login`;
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
</script>

<svelte:head>
  <title>管理者画面 - 合宿予約システム</title>
</svelte:head>

{#if loading}
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-gray-500">読み込み中...</p>
  </div>
{:else}
<div class="min-h-screen bg-gray-50">
  <!-- ヘッダー -->
  <header class="bg-white border-b border-gray-200 shadow-sm">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <a
          href="{base}/"
          class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          ← 予約画面へ戻る
        </a>
        <h1 class="text-lg font-bold text-gray-900">管理者画面</h1>
      </div>
      <div class="flex items-center space-x-3">
        <span class="text-sm text-gray-500">{currentUser?.name ?? ''}</span>
        <button
          on:click={handleLogout}
          class="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          ログアウト
        </button>
      </div>
    </div>
  </header>

  <!-- メインコンテンツ -->
  <main class="max-w-5xl mx-auto px-4 py-6">
    <!-- タブ -->
    <div class="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
      <button
        on:click={() => activeTab = 'bands'}
        class="px-5 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'bands'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        バンド管理
      </button>
      <button
        on:click={() => activeTab = 'members'}
        class="px-5 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'members'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        メンバー管理
      </button>
      <button
        on:click={() => activeTab = 'rooms'}
        class="px-5 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'rooms'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        部屋管理
      </button>
      <button
        on:click={() => activeTab = 'studio-assignment'}
        class="px-5 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'studio-assignment'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        スタジオ割り当て
      </button>
      <button
        on:click={() => activeTab = 'settings'}
        class="px-5 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'settings'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        設定
      </button>
    </div>

    <!-- コンテンツ -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {#if activeTab === 'bands'}
        <BandManagement {bands} {members} on:change={handleChange} />
      {:else if activeTab === 'members'}
        <MemberManagement {members} on:change={handleChange} />
      {:else if activeTab === 'rooms'}
        <RoomManagement {rooms} on:change={handleChange} />
      {:else if activeTab === 'studio-assignment'}
        <StudioAssignment {bands} {rooms} />
      {:else}
        <!-- 設定タブ -->
        <div class="space-y-6 max-w-xl">
          <h2 class="text-lg font-semibold text-gray-800">LINE通知設定</h2>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1" for="line-template">
              通知メッセージテンプレート
            </label>
            <p class="text-xs text-gray-500 mb-2">
              使えるプレースホルダー:
              <code class="bg-gray-100 px-1 rounded">{'{room}'}</code> 部屋名
              <code class="bg-gray-100 px-1 rounded">{'{band}'}</code> バンド名
              <code class="bg-gray-100 px-1 rounded">{'{hour}'}</code> 開始時刻（例: 14）
            </p>
            <textarea
              id="line-template"
              bind:value={lineTemplate}
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            ></textarea>
            {#if lineTemplate}
              <p class="text-xs text-gray-400 mt-1">
                プレビュー: {lineTemplate.replace('{room}', 'スタジオA').replace('{band}', 'ロックバンド').replace('{hour}', '14')}
              </p>
            {/if}
          </div>

          <div class="flex items-center gap-3">
            <button
              on:click={saveTemplate}
              disabled={templateSaving}
              class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {templateSaving ? '保存中...' : '保存'}
            </button>
            {#if templateMsg}
              <span class="text-sm {templateMsg === '保存しました' ? 'text-green-600' : 'text-red-600'}">
                {templateMsg}
              </span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </main>
</div>
{/if}
