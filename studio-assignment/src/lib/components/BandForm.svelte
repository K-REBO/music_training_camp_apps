<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let bandName = '';
	let members = { Key: '', Gt: '', Ba: '', Dr: '', Vo: '' };

	function addBand() {
		if (!bandName.trim()) return;

		// 空でないメンバーのみを取得
		const filteredMembers = {};
		Object.entries(members).forEach(([instrument, name]) => {
			if (name.trim()) {
				filteredMembers[instrument] = name.trim();
			}
		});

		if (Object.keys(filteredMembers).length === 0) return;

		const newBand = {
			name: bandName.trim(),
			members: filteredMembers
		};

		dispatch('add', newBand);
		
		// フォームをリセット
		bandName = '';
		members = { Key: '', Gt: '', Ba: '', Dr: '', Vo: '' };
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			addBand();
		}
	}
</script>

<div class="card">
	<h3 class="text-lg font-semibold mb-4">バンド追加</h3>
	
	<div class="space-y-4">
		<div>
			<label for="bandName" class="block text-sm font-medium text-gray-700 mb-1">
				バンド名 <span class="text-red-500">*</span>
			</label>
			<input
				id="bandName"
				type="text"
				class="input"
				bind:value={bandName}
				on:keypress={handleKeyPress}
				placeholder="バンド名を入力"
			/>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each Object.entries(members) as [instrument, name]}
				<div>
					<label for={instrument} class="block text-sm font-medium text-gray-700 mb-1">
						{instrument}
					</label>
					<input
						id={instrument}
						type="text"
						class="input"
						bind:value={members[instrument]}
						on:keypress={handleKeyPress}
						placeholder="メンバー名"
					/>
				</div>
			{/each}
		</div>

		<div class="flex justify-end">
			<button
				type="button"
				class="btn btn-primary"
				on:click={addBand}
				disabled={!bandName.trim()}
			>
				バンドを追加
			</button>
		</div>
	</div>
</div>