import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { photosPlugin } from './vite-photos';

export default defineConfig({
  // 선수 사진: 내 PC 의 data/photos (개발 서버 전용, vite-photos.ts)
  plugins: [react(), tailwindcss(), photosPlugin(path.resolve(__dirname, '../data'), path.resolve(__dirname, '../tools'))],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@data': path.resolve(__dirname, '../data'), '@pub': path.resolve(__dirname, '../data-public') } },
  // 게임 데이터는 저장소 루트의 data/ 폴더를 그대로 읽는다
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
});
