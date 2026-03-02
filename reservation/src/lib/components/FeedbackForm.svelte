<script>
  import { createEventDispatcher } from 'svelte';
  import { base } from '$app/paths';
  
  export let currentUser = null;
  export let visible = false;
  
  const dispatch = createEventDispatcher();
  
  let type = 'improvement';
  let title = '';
  let description = '';
  let priority = 'medium';
  let submitting = false;
  
  const typeOptions = [
    { value: 'bug', label: 'バグ報告' },
    { value: 'improvement', label: '改善提案' },
    { value: 'feature', label: '新機能要望' },
    { value: 'other', label: 'その他' }
  ];
  
  const priorityOptions = [
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' }
  ];
  
  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      alert('タイトルと説明を入力してください');
      return;
    }
    
    submitting = true;
    
    try {
      const response = await fetch(`${base}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          priority
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('フィードバックを送信しました。ありがとうございます！');
        resetForm();
        handleClose();
        dispatch('feedback_submitted', result.data);
      } else {
        alert('フィードバックの送信に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      alert('フィードバックの送信中にエラーが発生しました');
    } finally {
      submitting = false;
    }
  };
  
  const resetForm = () => {
    type = 'improvement';
    title = '';
    description = '';
    priority = 'medium';
  };
  
  const handleClose = () => {
    visible = false;
    dispatch('close');
  };
  
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };
</script>

{#if visible}
  <div 
    class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="feedback-title"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 id="feedback-title" class="text-xl font-semibold text-gray-900">
            フィードバック送信
          </h2>
          <button 
            on:click={handleClose}
            class="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        
        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <div>
            <label for="type" class="block text-sm font-medium text-gray-700 mb-1">
              種類
            </label>
            <select 
              id="type"
              bind:value={type}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {#each typeOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          
          <div>
            <label for="title" class="block text-sm font-medium text-gray-700 mb-1">
              タイトル *
            </label>
            <input 
              id="title"
              type="text"
              bind:value={title}
              placeholder="簡潔にお聞かせください"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label for="description" class="block text-sm font-medium text-gray-700 mb-1">
              詳細 *
            </label>
            <textarea 
              id="description"
              bind:value={description}
              placeholder="詳しい内容をお聞かせください"
              rows="4"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            ></textarea>
          </div>
          
          <div>
            <label for="priority" class="block text-sm font-medium text-gray-700 mb-1">
              優先度
            </label>
            <select 
              id="priority"
              bind:value={priority}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {#each priorityOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          
          <div class="flex justify-end space-x-3 pt-4">
            <button 
              type="button"
              on:click={handleClose}
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={submitting}
            >
              キャンセル
            </button>
            <button 
              type="submit"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting || !title.trim() || !description.trim()}
            >
              {submitting ? '送信中...' : '送信'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}