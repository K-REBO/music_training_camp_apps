<script>
  import '../app.css';
</script>

<main class="min-h-screen bg-gray-50">
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-4xl mx-auto px-4 py-4">
      <h1 class="text-2xl font-bold text-gray-900">合宿予約システム</h1>
    </div>
  </header>
  
  <div class="max-w-4xl mx-auto px-4 py-6">
    <slot />
  </div>
</main>