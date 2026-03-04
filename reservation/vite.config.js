import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
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
