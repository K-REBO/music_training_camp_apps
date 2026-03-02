<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let form = {
    name: '',
    email: '',
    phone: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    duration: '1',
    roomType: 'studio',
    participants: '1',
    notes: ''
  };
  
  let errors = {};
  
  const validateForm = () => {
    errors = {};
    
    if (!form.name.trim()) {
      errors.name = '名前は必須です';
    }
    
    if (!form.email.trim()) {
      errors.email = 'メールアドレスは必須です';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = '正しいメールアドレスを入力してください';
    }
    
    if (!form.date) {
      errors.date = '日付は必須です';
    }
    
    if (!form.time) {
      errors.time = '時間は必須です';
    }
    
    return Object.keys(errors).length === 0;
  };
  
  const handleSubmit = () => {
    if (validateForm()) {
      dispatch('submit', form);
      // フォームをリセット
      form = {
        name: '',
        email: '',
        phone: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        duration: '1',
        roomType: 'studio',
        participants: '1',
        notes: ''
      };
    }
  };
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-6">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- 基本情報 -->
    <div class="space-y-4">
      <h3 class="text-lg font-medium text-gray-900">基本情報</h3>
      
      <div>
        <label for="name" class="block text-sm font-medium text-gray-700">
          代表者名 <span class="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          bind:value={form.name}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {errors.name ? 'border-red-300' : ''}"
          required
        />
        {#if errors.name}
          <p class="mt-1 text-sm text-red-600">{errors.name}</p>
        {/if}
      </div>
      
      <div>
        <label for="email" class="block text-sm font-medium text-gray-700">
          メールアドレス <span class="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          bind:value={form.email}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {errors.email ? 'border-red-300' : ''}"
          required
        />
        {#if errors.email}
          <p class="mt-1 text-sm text-red-600">{errors.email}</p>
        {/if}
      </div>
      
      <div>
        <label for="phone" class="block text-sm font-medium text-gray-700">
          電話番号
        </label>
        <input
          type="tel"
          id="phone"
          bind:value={form.phone}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
    </div>
    
    <!-- 予約情報 -->
    <div class="space-y-4">
      <h3 class="text-lg font-medium text-gray-900">予約情報</h3>
      
      <div>
        <label for="date" class="block text-sm font-medium text-gray-700">
          利用日 <span class="text-red-500">*</span>
        </label>
        <input
          type="date"
          id="date"
          bind:value={form.date}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {errors.date ? 'border-red-300' : ''}"
          required
        />
        {#if errors.date}
          <p class="mt-1 text-sm text-red-600">{errors.date}</p>
        {/if}
      </div>
      
      <div>
        <label for="time" class="block text-sm font-medium text-gray-700">
          開始時間 <span class="text-red-500">*</span>
        </label>
        <input
          type="time"
          id="time"
          bind:value={form.time}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 {errors.time ? 'border-red-300' : ''}"
          required
        />
        {#if errors.time}
          <p class="mt-1 text-sm text-red-600">{errors.time}</p>
        {/if}
      </div>
      
      <div>
        <label for="duration" class="block text-sm font-medium text-gray-700">
          利用時間
        </label>
        <select
          id="duration"
          bind:value={form.duration}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="1">1時間</option>
          <option value="2">2時間</option>
          <option value="3">3時間</option>
          <option value="4">4時間</option>
        </select>
      </div>
      
      <div>
        <label for="roomType" class="block text-sm font-medium text-gray-700">
          部屋タイプ
        </label>
        <select
          id="roomType"
          bind:value={form.roomType}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="studio">スタジオ</option>
          <option value="practice">練習室</option>
          <option value="meeting">会議室</option>
        </select>
      </div>
      
      <div>
        <label for="participants" class="block text-sm font-medium text-gray-700">
          参加人数
        </label>
        <input
          type="number"
          id="participants"
          bind:value={form.participants}
          min="1"
          max="20"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
    </div>
  </div>
  
  <!-- 備考 -->
  <div>
    <label for="notes" class="block text-sm font-medium text-gray-700">
      備考・特記事項
    </label>
    <textarea
      id="notes"
      bind:value={form.notes}
      rows="3"
      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
      placeholder="機材の希望、アレルギー等がございましたらご記入ください"
    ></textarea>
  </div>
  
  <!-- 送信ボタン -->
  <div class="flex justify-end">
    <button
      type="submit"
      class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
    >
      予約を登録
    </button>
  </div>
</form>