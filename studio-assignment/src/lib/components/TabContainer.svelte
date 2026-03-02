<script>
	export let tabs = [];
	export let activeTab = 0;

	function switchTab(index) {
		activeTab = index;
	}
</script>

<div class="card">
	<!-- タブヘッダー -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-8">
			{#each tabs as tab, index}
				<button
					type="button"
					class="py-2 px-1 border-b-2 font-medium text-sm transition-colors {
						activeTab === index 
							? 'border-blue-500 text-blue-600' 
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
					}"
					on:click={() => switchTab(index)}
				>
					{tab.label}
					{#if tab.count !== undefined}
						<span class="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
							{tab.count}
						</span>
					{/if}
				</button>
			{/each}
		</nav>
	</div>

	<!-- タブコンテンツ -->
	<div class="mt-4">
		{#if activeTab === 0}
			<div class="tab-content">
				<slot name="tab-0" />
			</div>
		{:else if activeTab === 1}
			<div class="tab-content">
				<slot name="tab-1" />
			</div>
		{:else if activeTab === 2}
			<div class="tab-content">
				<slot name="tab-2" />
			</div>
		{:else if activeTab === 3}
			<div class="tab-content">
				<slot name="tab-3" />
			</div>
		{/if}
	</div>
</div>