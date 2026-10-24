import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 面板构建为单文件 HTML（内联全部 JS/CSS），由 scripts/embed-webui.mjs 内嵌进 CLI
export default defineConfig({
  plugins: [vue(), tailwindcss(), viteSingleFile()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8741' },
  },
  build: { target: 'es2020', assetsInlineLimit: 100000000 },
});
