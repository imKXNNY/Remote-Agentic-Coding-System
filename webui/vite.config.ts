import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    (monacoEditorPlugin as any).default ? (monacoEditorPlugin as any).default({}) : monacoEditorPlugin({})
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
})
