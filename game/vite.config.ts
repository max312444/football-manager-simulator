import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@data': path.resolve(__dirname, '../data'), '@pub': path.resolve(__dirname, '../data-public') } },
  // 게임 데이터는 저장소 루트의 data/ 폴더를 그대로 읽는다
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
});
