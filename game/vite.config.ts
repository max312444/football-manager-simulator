import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { photosPlugin } from './vite-photos';

// 배포용 빌드 (PUBLIC_ONLY=1): 실명 데이터(data/) 대신 빈 폴더를 끼워 절대 묶이지 않게 한다
//  BASE: 배포 주소 경로 (GitHub Pages 는 /pitch-boss/)
const publicOnly = process.env.PUBLIC_ONLY === '1';

export default defineConfig({
  base: process.env.BASE ?? '/',
  // 선수 사진: 내 PC 의 data/photos (개발 서버 전용, vite-photos.ts)
  plugins: [react(), tailwindcss(), ...(publicOnly ? [] : [photosPlugin(path.resolve(__dirname, '../data'), path.resolve(__dirname, '../tools'))])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@data': path.resolve(__dirname, publicOnly ? 'empty-data' : '../data'), '@pub': path.resolve(__dirname, '../data-public') } },
  // 게임 데이터는 저장소 루트의 data/ 폴더를 그대로 읽는다
  server: { fs: { allow: ['..'] } },
  // 시즌을 통째로 돌리는 테스트가 많아 기본 제한 시간을 넉넉히
  test: { include: ['src/**/*.test.ts'], testTimeout: 20000 },
});
