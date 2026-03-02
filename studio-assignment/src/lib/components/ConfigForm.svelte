<script>
	import { createEventDispatcher } from 'svelte';

	export let config = { rooms: 4, timeSlots: 6 };

	const dispatch = createEventDispatcher();

	function updateConfig() {
		// 数値型に変換して送信
		const numericConfig = {
			rooms: Number(config.rooms),
			timeSlots: Number(config.timeSlots)
		};
		dispatch('update', numericConfig);
	}

	$: {
		updateConfig();
	}
	
	// configの各プロパティを明示的に監視
	$: config.rooms, config.timeSlots, updateConfig();
</script>

<div class="card">
	<h3 class="text-lg font-semibold mb-4">スタジオ設定</h3>
	
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<div>
			<label for="rooms" class="block text-sm font-medium text-gray-700 mb-1">
				部屋数
			</label>
			<input
				id="rooms"
				type="number"
				min="1"
				max="20"
				class="input"
				bind:value={config.rooms}
			/>
			<p class="text-xs text-gray-500 mt-1">同時に使用できる練習部屋の数</p>
		</div>

		<div>
			<label for="timeSlots" class="block text-sm font-medium text-gray-700 mb-1">
				時間枠数
			</label>
			<input
				id="timeSlots"
				type="number"
				min="1"
				max="24"
				class="input"
				bind:value={config.timeSlots}
			/>
			<p class="text-xs text-gray-500 mt-1">1日の時間割コマ数</p>
		</div>
	</div>

	<div class="mt-4 p-3 bg-blue-50 rounded-md">
		<div class="flex">
			<svg class="w-5 h-5 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div class="text-sm text-blue-700">
				<p class="font-medium">最大配置可能バンド数: {config.rooms * config.timeSlots}</p>
				<p>推奨バンド数: {config.rooms + 1}〜{Math.floor(config.rooms * config.timeSlots * 0.8)}バンド</p>
			</div>
		</div>
	</div>
</div>