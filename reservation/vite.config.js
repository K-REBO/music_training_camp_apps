import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'$shared': resolve(import.meta.dirname, '../shared')
		}
	},
	server: {
		fs: {
			allow: ['..']
		}
	},
	preview: {
		port: 5173,
		host: '0.0.0.0',
		allowedHosts: ['tc.bido.dev', 'localhost']
	}
});
