<script>
	import { createEventDispatcher } from 'svelte';

	export let bands = [];

	const dispatch = createEventDispatcher();

	function removeBand(index) {
		dispatch('remove', index);
	}

	function editBand(index) {
		dispatch('edit', index);
	}
</script>

<div class="card">
	<div class="flex justify-between items-center mb-4">
		<h3 class="text-lg font-semibold">登録バンド一覧</h3>
		<span class="text-sm text-gray-500">{bands.length}バンド</span>
	</div>

	{#if bands.length === 0}
		<p class="text-gray-500 text-center py-8">まだバンドが登録されていません。</p>
	{:else}
		<div class="space-y-3">
			{#each bands as band, index}
				<div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
					<div class="flex justify-between items-start">
						<div class="flex-1">
							<h4 class="font-semibold text-gray-900 mb-2">{band.name}</h4>
							<div class="flex flex-wrap gap-2">
								{#each Object.entries(band.members) as [instrument, memberName]}
									<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
										{instrument}: {memberName}
									</span>
								{/each}
							</div>
						</div>
						<div class="flex space-x-2 ml-4">
							<button
								type="button"
								class="text-gray-500 hover:text-blue-600 transition-colors"
								on:click={() => editBand(index)}
								title="編集"
								aria-label="バンドを編集"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
								</svg>
							</button>
							<button
								type="button"
								class="text-gray-500 hover:text-red-600 transition-colors"
								on:click={() => removeBand(index)}
								title="削除"
								aria-label="バンドを削除"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
								</svg>
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>