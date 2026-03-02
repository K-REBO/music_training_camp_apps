<script>
	import { onMount } from 'svelte';
	import BandList from '$lib/components/BandList.svelte';
	import ConfigForm from '$lib/components/ConfigForm.svelte';
	import ScheduleTable from '$lib/components/ScheduleTable.svelte';
	import TabContainer from '$lib/components/TabContainer.svelte';
	import FileUpload from '$lib/components/FileUpload.svelte';
	import MemberConsolidation from '$lib/components/MemberConsolidation.svelte';
	import { StudioScheduler } from '$lib/utils/scheduler.js';

	let bands = [];
	let config = { rooms: 4, timeSlots: 6 };
	let schedule = [];
	let validation = { errors: [], warnings: [] };
	let unscheduledBands = [];
	let isGenerating = false;
	let activeTab = 0;
	
	// タブ設定
	$: tabs = [
		{ label: 'スケジュール', count: null },
		{ label: 'バンド一覧', count: bands.length },
		{ label: 'ファイル読み込み', count: null },
		{ label: 'メンバー結合', count: null }
	];

	// サンプルデータを読み込み
	onMount(() => {
		loadSampleData();
	});

	function loadSampleData() {
		bands = [
			{
				name: "Nirvana",
				members: { "Gt": "Andy", "Ba": "Bob", "Vo": "Andy", "Dr": "Cathy" }
			},
			{
				name: "東京事変",
				members: { "Key": "Simons", "Gt_1": "Andy", "Gt_2": "Kate", "Ba": "Philip", "Vo": "たなけん", "Dr": "William" }
			},
			{
				name: "Radiohead",
				members: { "Gt": "Thom", "Ba": "Colin", "Dr": "Phil", "Key": "Jonny" }
			},
			{
				name: "The Beatles",
				members: { "Gt_1": "John", "Gt_2": "George", "Ba": "Paul", "Dr": "Ringo", "Vo": "John" }
			},
			{
				name: "Led Zeppelin",
				members: { "Gt": "Jimmy", "Ba": "John Paul", "Dr": "John Bonham", "Vo": "Robert" }
			}
		];
	}

	function removeBand(event) {
		bands = bands.filter((_, index) => index !== event.detail);
		// スケジュールをクリア
		schedule = [];
		validation = { errors: [], warnings: [] };
		unscheduledBands = [];
	}

	function editBand(event) {
		// 簡単な編集機能（アラートで名前変更）
		const index = event.detail;
		const newName = prompt('新しいバンド名を入力してください:', bands[index].name);
		if (newName && newName.trim()) {
			bands[index].name = newName.trim();
			bands = [...bands];
		}
	}

	function updateConfig(event) {
		config = event.detail;
		// 設定変更時にスケジュールをクリア
		schedule = [];
		validation = { errors: [], warnings: [] };
		unscheduledBands = [];
	}

	async function generateSchedule() {
		if (bands.length === 0) {
			alert('バンドを追加してください');
			return;
		}

		isGenerating = true;
		
		try {
			// 少し遅延を入れてローディング感を出す
			await new Promise(resolve => setTimeout(resolve, 500));

			const bandsData = { bands, config };
			const scheduler = new StudioScheduler(bandsData);
			
			const result = scheduler.generateSchedule();
			schedule = result.schedule;
			unscheduledBands = result.unscheduled;
			
			validation = scheduler.validateSchedule();
		} catch (error) {
			alert('スケジュール生成中にエラーが発生しました: ' + error.message);
		} finally {
			isGenerating = false;
		}
	}

	function clearSchedule() {
		schedule = [];
		validation = { errors: [], warnings: [] };
		unscheduledBands = [];
	}

	function exportJson() {
		if (schedule.length === 0) {
			alert('まずスケジュールを生成してください');
			return;
		}

		const bandsData = { bands, config };
		const scheduler = new StudioScheduler(bandsData);
		scheduler.schedule = schedule;
		
		const result = scheduler.exportToJson();
		
		const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `studio-schedule-${new Date().toISOString().split('T')[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function clearAllData() {
		if (confirm('すべてのデータを削除しますか？')) {
			bands = [];
			schedule = [];
			validation = { errors: [], warnings: [] };
			unscheduledBands = [];
		}
	}

	function handleFileUpload(event) {
		const data = event.detail;
		
		// バンドデータを更新（configは無視してUIの設定を維持）
		if (data.bands) {
			bands = [...data.bands];
			
			// スケジュールをクリア
			schedule = [];
			validation = { errors: [], warnings: [] };
			unscheduledBands = [];
		}
		
		// JSONにconfig情報がある場合は情報表示のみ
		if (data.config && (data.config.rooms !== config.rooms || data.config.timeSlots !== config.timeSlots)) {
			console.log(`JSONファイルの設定: 部屋${data.config.rooms}、時間枠${data.config.timeSlots}`);
			console.log(`現在のUI設定: 部屋${config.rooms}、時間枠${config.timeSlots}`);
			console.log('UI設定を優先しています');
		}
	}

	function handleConsolidatedData(event) {
		const data = event.detail;
		
		// バンドデータを更新（configは無視してUIの設定を維持）
		if (data.bands) {
			bands = [...data.bands];
			
			// スケジュールをクリア
			schedule = [];
			validation = { errors: [], warnings: [] };
			unscheduledBands = [];
		}
	}
</script>

<svelte:head>
	<title>合宿スタジオ配置システム</title>
</svelte:head>

<div class="space-y-8">
	<!-- 設定セクション -->
	<ConfigForm {config} on:update={updateConfig} />

	<!-- 制御ボタン -->
	<div class="card">
		<div class="flex flex-wrap gap-4 justify-center">
			<button
				type="button"
				class="btn btn-primary"
				on:click={generateSchedule}
				disabled={isGenerating || bands.length === 0}
			>
				{#if isGenerating}
					<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					生成中...
				{:else}
					スケジュール生成
				{/if}
			</button>

			<button
				type="button"
				class="btn btn-secondary"
				on:click={clearSchedule}
				disabled={schedule.length === 0}
			>
				スケジュールクリア
			</button>

			<button
				type="button"
				class="btn btn-secondary"
				on:click={exportJson}
				disabled={schedule.length === 0}
			>
				JSON出力
			</button>

			<button
				type="button"
				class="btn btn-secondary"
				on:click={loadSampleData}
			>
				サンプルデータ読み込み
			</button>

			<button
				type="button"
				class="text-red-600 hover:text-red-800 px-4 py-2 text-sm"
				on:click={clearAllData}
			>
				全データクリア
			</button>
		</div>

		{#if unscheduledBands.length > 0}
			<div class="mt-4 p-3 bg-orange-50 border-l-4 border-orange-400">
				<div class="flex">
					<svg class="w-5 h-5 text-orange-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
					<div>
						<h4 class="text-orange-800 font-medium">配置できなかったバンド</h4>
						<ul class="mt-1 text-orange-700 text-sm list-disc list-inside">
							{#each unscheduledBands as band}
								<li>{band.name}</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- タブ付きコンテンツ -->
	<TabContainer {tabs} bind:activeTab>
		<!-- スケジュール表示タブ -->
		<div slot="tab-0">
			<ScheduleTable {schedule} {config} {validation} />
		</div>
		
		<!-- バンド一覧タブ -->
		<div slot="tab-1">
			<BandList {bands} on:remove={removeBand} on:edit={editBand} />
		</div>
		
		<!-- ファイル読み込みタブ -->
		<div slot="tab-2">
			<FileUpload on:load={handleFileUpload} />
		</div>
		
		<!-- メンバー結合タブ -->
		<div slot="tab-3">
			<MemberConsolidation bandsData={{ bands, config }} on:dataUpdated={handleConsolidatedData} />
		</div>
	</TabContainer>

	<!-- フッター情報 -->
	<div class="text-center text-sm text-gray-500 py-4">
		<p>バンド数: {bands.length} | 最大配置可能: {config.rooms * config.timeSlots}</p>
		<p class="mt-1">
			推奨範囲: {config.rooms + 1}〜{Math.floor(config.rooms * config.timeSlots * 0.8)}バンド
			{#if bands.length > config.rooms * config.timeSlots}
				<span class="text-red-600">(範囲外: 配置不可バンドが発生します)</span>
			{:else if bands.length <= config.rooms}
				<span class="text-blue-600">(余裕あり: 全バンド同時配置可能)</span>
			{:else}
				<span class="text-green-600">(適正範囲)</span>
			{/if}
		</p>
	</div>
</div>