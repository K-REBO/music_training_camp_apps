<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let fileInput;
	let isProcessing = false;
	let errors = [];
	let warnings = [];
	let preview = null;
	let currentFileData = null;

	// データ検証関数
	function validateBandData(data) {
		const validationErrors = [];
		const validationWarnings = [];

		// 基本構造チェック
		if (!data || typeof data !== 'object') {
			validationErrors.push('JSONファイルの形式が正しくありません');
			return { errors: validationErrors, warnings: validationWarnings };
		}

		// bandsプロパティの存在確認
		if (!data.bands || !Array.isArray(data.bands)) {
			validationErrors.push('bandsプロパティが存在しないか、配列ではありません');
			return { errors: validationErrors, warnings: validationWarnings };
		}

		// 各バンドの検証
		data.bands.forEach((band, index) => {
			if (!band || typeof band !== 'object') {
				validationErrors.push(`バンド${index + 1}: バンドデータが正しくありません`);
				return;
			}

			// バンド名チェック
			if (!band.name || typeof band.name !== 'string' || !band.name.trim()) {
				validationErrors.push(`バンド${index + 1}: バンド名が存在しないか空です`);
			}

			// メンバーデータチェック
			if (!band.members || typeof band.members !== 'object') {
				validationErrors.push(`バンド${index + 1}: メンバーデータが存在しないか正しくありません`);
				return;
			}

			// メンバーが存在するかチェック
			const memberCount = Object.keys(band.members).length;
			if (memberCount === 0) {
				validationWarnings.push(`バンド${index + 1} "${band.name}": メンバーが登録されていません`);
			}

			// 楽器名を正規化（_数字を削除）
			const normalizeInstrumentName = (instrument) => instrument.replace(/_\d+$/, '');
			
			// 楽器名の妥当性チェック（警告レベル）
			const validInstruments = ['Key', 'Gt', 'Gt_1', 'Gt_2', 'Ba', 'Dr', 'Vo', 'DJ', 'UNKNOWN'];
			const validInstrumentsLower = validInstruments.map(inst => inst.toLowerCase());
			
			Object.keys(band.members).forEach(instrument => {
				const normalizedInstrument = normalizeInstrumentName(instrument);
				const isValidCase = validInstruments.includes(normalizedInstrument);
				const isValidLower = validInstrumentsLower.includes(normalizedInstrument.toLowerCase());
				
				if (!isValidCase && !isValidLower) {
					validationWarnings.push(`バンド${index + 1} "${band.name}": 楽器名 "${instrument}" は一般的ではありません`);
				} else if (!isValidCase && isValidLower) {
					validationWarnings.push(`バンド${index + 1} "${band.name}": 楽器名 "${instrument}" は大文字小文字が異なります（推奨: ${validInstruments.find(vi => vi.toLowerCase() === normalizedInstrument.toLowerCase())}）`);
				}
			});

			// 楽器名重複チェック（正規化後の名前で）
			const instruments = Object.keys(band.members);
			const normalizedInstruments = instruments.map(normalizeInstrumentName);
			const duplicateNormalizedInstruments = normalizedInstruments.filter((inst, index) => normalizedInstruments.indexOf(inst) !== index);
			
			// 複数ギターとUNKNOWNは一般的なので、それ以外の重複のみ警告
			const problematicDuplicates = [...new Set(duplicateNormalizedInstruments)].filter(inst => inst !== 'Gt' && inst !== 'UNKNOWN');
			if (problematicDuplicates.length > 0) {
				validationWarnings.push(`バンド${index + 1} "${band.name}": 正規化後に同じ楽器名が重複しています (${problematicDuplicates.join(', ')}) - 優先順位計算に影響します`);
			}

			// メンバー名チェック
			Object.entries(band.members).forEach(([instrument, memberName]) => {
				if (!memberName || typeof memberName !== 'string' || !memberName.trim()) {
					validationWarnings.push(`バンド${index + 1} "${band.name}": ${instrument}のメンバー名が空です`);
				}
			});
		});

		// 重複バンド名チェック
		const bandNames = data.bands.map(band => band.name?.trim()).filter(Boolean);
		const duplicateNames = bandNames.filter((name, index) => bandNames.indexOf(name) !== index);
		if (duplicateNames.length > 0) {
			validationWarnings.push(`重複するバンド名があります: ${[...new Set(duplicateNames)].join(', ')}`);
		}

		return { errors: validationErrors, warnings: validationWarnings };
	}

	async function handleFileSelect(event) {
		const file = event.target.files[0];
		if (!file) return;

		// ファイルタイプチェック
		if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
			errors = ['JSONファイルを選択してください'];
			return;
		}

		isProcessing = true;
		errors = [];
		warnings = [];
		preview = null;

		try {
			const text = await file.text();
			let data;

			// JSON パース
			try {
				data = JSON.parse(text);
			} catch (parseError) {
				throw new Error(`JSONファイルの解析に失敗しました: ${parseError.message}`);
			}

			// データ検証
			const validation = validateBandData(data);
			errors = validation.errors;
			warnings = validation.warnings;

			if (errors.length === 0) {
				// データを保存
				currentFileData = data;
				
				// プレビュー作成
				preview = {
					bandCount: data.bands?.length || 0,
					bands: data.bands?.slice(0, 5) || [], // 最初の5つを表示
					hasMore: (data.bands?.length || 0) > 5
				};
			}
		} catch (error) {
			errors = [error.message || 'ファイルの読み込み中にエラーが発生しました'];
		} finally {
			isProcessing = false;
		}
	}

	function loadData() {
		if (!currentFileData || errors.length > 0) return;

		dispatch('load', currentFileData);
		clearState();
	}

	function clearState() {
		errors = [];
		warnings = [];
		preview = null;
		currentFileData = null;
		if (fileInput) fileInput.value = '';
	}

	function cancelUpload() {
		clearState();
	}
</script>

<div class="space-y-4">
	<!-- ファイル選択 -->
	<div class="border-2 border-dashed border-gray-300 rounded-lg p-6">
		<div class="text-center">
			<svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
			</svg>
			
			<div class="mb-4">
				<label for="file-upload" class="cursor-pointer">
					<span class="btn btn-primary">
						{#if isProcessing}
							<svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							処理中...
						{:else}
							JSONファイルを選択
						{/if}
					</span>
				</label>
				<input
					id="file-upload"
					bind:this={fileInput}
					type="file"
					accept=".json"
					on:change={handleFileSelect}
					class="hidden"
					disabled={isProcessing}
				/>
			</div>
			
			<p class="text-sm text-gray-500">
				バンドデータが含まれたJSONファイルをアップロードしてください
			</p>
		</div>
	</div>

	<!-- エラー表示 -->
	{#if errors.length > 0}
		<div class="bg-red-50 border-l-4 border-red-400 p-4">
			<div class="flex">
				<svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<h4 class="text-red-800 font-medium">エラー</h4>
					<ul class="mt-1 text-red-700 text-sm list-disc list-inside">
						{#each errors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- 警告表示 -->
	{#if warnings.length > 0}
		<div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
			<div class="flex">
				<svg class="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<h4 class="text-yellow-800 font-medium">警告</h4>
					<ul class="mt-1 text-yellow-700 text-sm list-disc list-inside">
						{#each warnings as warning}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- プレビュー表示 -->
	{#if preview}
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
			<h4 class="text-blue-900 font-medium mb-3">データプレビュー</h4>
			<p class="text-blue-800 text-sm mb-3">
				{preview.bandCount}個のバンドが見つかりました
			</p>
			
			<div class="space-y-2 mb-4">
				{#each preview.bands as band, index}
					<div class="bg-white rounded p-3 border border-blue-200">
						<div class="font-medium text-gray-900">{band.name}</div>
						<div class="text-sm text-gray-600 mt-1">
							メンバー: {Object.keys(band.members || {}).length}人
							({Object.entries(band.members || {}).map(([inst, name]) => `${inst}: ${name}`).join(', ')})
						</div>
					</div>
				{/each}
				{#if preview.hasMore}
					<div class="text-center text-sm text-blue-600">
						... 他 {preview.bandCount - 5} バンド
					</div>
				{/if}
			</div>

			<div class="flex space-x-3">
				<button
					type="button"
					class="btn btn-primary"
					on:click={loadData}
					disabled={errors.length > 0}
				>
					データを読み込み
				</button>
				<button
					type="button"
					class="btn btn-secondary"
					on:click={cancelUpload}
				>
					キャンセル
				</button>
			</div>
		</div>
	{/if}
</div>