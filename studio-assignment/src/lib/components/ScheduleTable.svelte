<script>
	import { createEventDispatcher } from 'svelte';
	
	export let schedule = [];
	export let config = { rooms: 4, timeSlots: 6 };
	export let validation = { errors: [], warnings: [] };
	
	const dispatch = createEventDispatcher();
	
	// 部屋と時間の並び順
	let roomOrder = [];
	let timeOrder = [];
	
	// 配列サイズが変わった時のみリセット（並び順は保持）
	$: {
		if (roomOrder.length !== config.rooms) {
			roomOrder = Array.from({ length: config.rooms }, (_, i) => i);
		}
		if (timeOrder.length !== config.timeSlots) {
			timeOrder = Array.from({ length: config.timeSlots }, (_, i) => i);
		}
	}
	
	// 部屋の並び替え
	function moveRoom(fromIndex, toIndex) {
		const newOrder = [...roomOrder];
		const [movedItem] = newOrder.splice(fromIndex, 1);
		newOrder.splice(toIndex, 0, movedItem);
		roomOrder = newOrder;
		
		dispatch('roomOrderChanged', roomOrder);
	}
	
	// 時間の並び替え
	function moveTime(fromIndex, toIndex) {
		const newOrder = [...timeOrder];
		const [movedItem] = newOrder.splice(fromIndex, 1);
		newOrder.splice(toIndex, 0, movedItem);
		timeOrder = newOrder;
		
		dispatch('timeOrderChanged', timeOrder);
	}
	
	// 元の順序にリセット
	function resetOrder() {
		roomOrder = Array.from({ length: config.rooms }, (_, i) => i);
		timeOrder = Array.from({ length: config.timeSlots }, (_, i) => i);
		dispatch('orderReset');
	}
	
	// ドラッグ＆ドロップ用の状態
	let draggedRoom = null;
	let draggedTime = null;
</script>

<div class="card">
	<div class="flex justify-between items-center mb-4">
		<h3 class="text-lg font-semibold">スタジオ配置スケジュール</h3>
		
		<div class="flex items-center space-x-4">
			{#if validation.errors.length > 0 || validation.warnings.length > 0}
				<div class="flex space-x-2">
					{#if validation.errors.length > 0}
						<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
							エラー: {validation.errors.length}
						</span>
					{/if}
					{#if validation.warnings.length > 0}
						<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
							警告: {validation.warnings.length}
						</span>
					{/if}
				</div>
			{/if}
			
			{#if schedule.length > 0}
				<button 
					on:click={resetOrder}
					class="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-700"
				>
					並び順リセット
				</button>
			{/if}
		</div>
	</div>

	{#if schedule.length === 0}
		<div class="text-center py-12 text-gray-500">
			<svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3a1 1 0 011-1h6a1 1 0 011 1v4h-8zM8 7h8M8 7l-2 12h12L16 7"></path>
			</svg>
			<p>スケジュールを生成してください</p>
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full border-collapse">
				<thead>
					<tr class="bg-gray-50">
						<th class="table-cell font-semibold text-gray-900 bg-gray-100">時間</th>
						{#each roomOrder as roomIndex, displayIndex}
							<th 
								class="table-cell font-semibold text-gray-900 bg-gray-100 relative cursor-move select-none"
								draggable="true"
								on:dragstart={() => draggedRoom = displayIndex}
								on:dragover|preventDefault
								on:drop|preventDefault={() => {
									if (draggedRoom !== null && draggedRoom !== displayIndex) {
										moveRoom(draggedRoom, displayIndex);
									}
									draggedRoom = null;
								}}
							>
								<div class="flex items-center justify-center space-x-1">
									<span>Room {roomIndex + 1}</span>
									<svg class="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
										<path d="M7 13L3 9l4-4V13z"/>
										<path d="M13 13L17 9l-4-4V13z"/>
									</svg>
								</div>
								{#if displayIndex > 0}
									<button
										class="absolute left-1 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
										on:click={() => moveRoom(displayIndex, displayIndex - 1)}
										title="左に移動"
									>
										◀
									</button>
								{/if}
								{#if displayIndex < roomOrder.length - 1}
									<button
										class="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
										on:click={() => moveRoom(displayIndex, displayIndex + 1)}
										title="右に移動"
									>
										▶
									</button>
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each timeOrder as timeIndex, displayTimeIndex}
						<tr>
							<td 
								class="table-cell font-medium bg-gray-50 relative cursor-move select-none"
								draggable="true"
								on:dragstart={() => draggedTime = displayTimeIndex}
								on:dragover|preventDefault
								on:drop|preventDefault={() => {
									if (draggedTime !== null && draggedTime !== displayTimeIndex) {
										moveTime(draggedTime, displayTimeIndex);
									}
									draggedTime = null;
								}}
							>
								<div class="flex items-center justify-center space-x-1">
									<span>{timeIndex + 1}時間目</span>
									<svg class="w-3 h-3 text-gray-400 rotate-90" fill="currentColor" viewBox="0 0 20 20">
										<path d="M7 13L3 9l4-4V13z"/>
										<path d="M13 13L17 9l-4-4V13z"/>
									</svg>
								</div>
								{#if displayTimeIndex > 0}
									<button
										class="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-blue-600 hover:text-blue-800"
										on:click={() => moveTime(displayTimeIndex, displayTimeIndex - 1)}
										title="上に移動"
									>
										▲
									</button>
								{/if}
								{#if displayTimeIndex < timeOrder.length - 1}
									<button
										class="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-xs text-blue-600 hover:text-blue-800"
										on:click={() => moveTime(displayTimeIndex, displayTimeIndex + 1)}
										title="下に移動"
									>
										▼
									</button>
								{/if}
							</td>
							{#each roomOrder as roomIndex}
								{@const band = schedule[timeIndex] && schedule[timeIndex][roomIndex]}
								<td class="schedule-cell {band ? 'occupied' : ''}">
									{#if band}
										<div class="p-2">
											<div class="font-semibold text-sm text-gray-900 mb-1">
												{band.name}
											</div>
											<div class="text-xs text-gray-600 space-y-1">
												{#each Object.entries(band.members) as [instrument, memberName]}
													<div class="flex justify-between">
														<span class="font-medium">{instrument}:</span>
														<span>{memberName}</span>
													</div>
												{/each}
											</div>
										</div>
									{:else}
										<div class="p-4 text-gray-400 text-center text-sm">
											空き
										</div>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if validation.errors.length > 0 || validation.warnings.length > 0}
		<div class="mt-4 space-y-2">
			{#if validation.errors.length > 0}
				<div class="p-3 bg-red-50 border-l-4 border-red-400">
					<div class="flex">
						<svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<div>
							<h4 class="text-red-800 font-medium">エラー</h4>
							<ul class="mt-1 text-red-700 text-sm list-disc list-inside">
								{#each validation.errors as error}
									<li>{error}</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/if}

			{#if validation.warnings.length > 0}
				<div class="p-3 bg-yellow-50 border-l-4 border-yellow-400">
					<div class="flex">
						<svg class="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<div>
							<h4 class="text-yellow-800 font-medium">警告</h4>
							<ul class="mt-1 text-yellow-700 text-sm list-disc list-inside">
								{#each validation.warnings as warning}
									<li>{warning}</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	@media (max-width: 768px) {
		.schedule-cell {
			min-width: 120px;
		}
	}
</style>