<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  
  let name = '';
  let selectedGrade = '';
  let loading = false;
  let error = '';
  let showPasswordModal = false;
  let password = '';
  let isSpecialUser = false;
  
  // パスワード保存のためのキー
  const ADMIN_PASSWORD_KEY = 'admin_password_shiiki';
  
  const grades = [
    '中大1年',
    '中大2年', 
    '中大3年',
    '実践1年',
    '実践2年',
    '実践3年',
    'その他'
  ];
  
  const handleSubmit = async () => {
    if (!name.trim() || !selectedGrade) {
      error = '名前と学年を入力してください';
      return;
    }
    
    // 椎木知仁の場合はパスワード認証が必要
    if (name.trim() === '椎木知仁') {
      isSpecialUser = true;
      
      // 保存されたパスワードがあるかチェック
      if (browser) {
        const savedPassword = localStorage.getItem(ADMIN_PASSWORD_KEY);
        if (savedPassword) {
          // 保存されたパスワードで直接ログイン試行
          loading = true;
          error = '';
          await performLogin(savedPassword);
          return;
        }
      }
      
      // 保存されたパスワードがない場合はモーダル表示
      showPasswordModal = true;
      return;
    }
    
    loading = true;
    error = '';
    
    await performLogin();
  };

  const performLogin = async (providedPassword = null) => {
    try {
      const loginData = {
        name: name.trim(),
        grade: selectedGrade
      };

      if (isSpecialUser && providedPassword) {
        loginData.password = providedPassword;
      }

      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      
      const result = await response.json();
      
      if (!result.success) {
        error = result.error || 'ログインに失敗しました';
        // パスワードが間違っていた場合、保存されたパスワードを削除
        if (isSpecialUser && browser && providedPassword) {
          localStorage.removeItem(ADMIN_PASSWORD_KEY);
        }
        return;
      }
      
      // ログイン成功時にパスワードを保存（椎木知仁のみ）
      if (isSpecialUser && browser && providedPassword) {
        localStorage.setItem(ADMIN_PASSWORD_KEY, providedPassword);
      }
      
      // ログイン成功 - メインページにリダイレクト
      const redirectTo = $page.url.searchParams.get('redirect') || `${base}/`;
      await goto(redirectTo);
      
    } catch (err) {
      error = 'サーバーエラーが発生しました';
      console.error('Login error:', err);
    } finally {
      loading = false;
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      error = 'パスワードを入力してください';
      return;
    }

    loading = true;
    error = '';
    showPasswordModal = false;

    await performLogin(password.trim());
  };

  const handlePasswordCancel = () => {
    showPasswordModal = false;
    password = '';
    isSpecialUser = false;
    error = '';
  };
  
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  };
</script>

<svelte:head>
  <title>ログイン - 合宿予約システム</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <div class="text-center">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        合宿予約システム
      </h1>
      <p class="text-gray-600 mb-8">
        ログインして予約を開始してください
      </p>
    </div>
  </div>

  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-white py-8 px-4 shadow-lg rounded-lg sm:px-10">
      <form on:submit|preventDefault={handleSubmit} class="space-y-6">
        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
            お名前 <span class="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            bind:value={name}
            on:keypress={handleKeyPress}
            placeholder="山田太郎"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label for="grade" class="block text-sm font-medium text-gray-700 mb-2">
            学年 <span class="text-red-500">*</span>
          </label>
          <select
            id="grade"
            bind:value={selectedGrade}
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          >
            <option value="">学年を選択してください</option>
            {#each grades as grade}
              <option value={grade}>{grade}</option>
            {/each}
          </select>
        </div>

        {#if error}
          <div class="bg-red-50 border border-red-200 rounded-md p-3">
            <div class="flex">
              <svg class="h-5 w-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
              <p class="text-sm text-red-600">{error}</p>
            </div>
          </div>
        {/if}

        <div>
          <button
            type="submit"
            disabled={loading}
            class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {#if loading}
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              ログイン中...
            {:else}
              ログイン
            {/if}
          </button>
        </div>

        <div class="text-center">
          <p class="text-xs text-gray-500">
            事前に登録されたメンバーのみログインできます<br>
            {#if !isSpecialUser}パスワードは不要です{/if}
          </p>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- パスワード入力モーダル -->
{#if showPasswordModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 w-80 max-w-md mx-4">
      <h3 class="text-lg font-medium text-gray-900 mb-4">管理者パスワード</h3>
      
      <div class="mb-4">
        <input
          type="password"
          bind:value={password}
          placeholder="パスワードを入力してください"
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          on:keypress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
          autofocus
        />
      </div>
      
      <div class="flex space-x-3">
        <button
          type="button"
          on:click={handlePasswordCancel}
          class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          キャンセル
        </button>
        <button
          type="button"
          on:click={handlePasswordSubmit}
          disabled={loading}
          class="flex-1 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {#if loading}
            <svg class="animate-spin h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {:else}
            ログイン
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}