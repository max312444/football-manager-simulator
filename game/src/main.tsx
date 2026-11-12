import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { boot } from './data/realStore';

// 배포판: 홈 화면 앱 · 오프라인 실행 (public/sw.js)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => { /* 무시 */ }); });
}

// 브라우저에 넣어 둔 실명 데이터를 먼저 읽고 나서 게임을 불러온다 (db.ts 가 불러올 때 바로 쓰도록)
const wantReal = (() => { try { return localStorage.getItem('pitchboss.dataset') === 'real'; } catch { return false; } })();
boot(wantReal)
  .then(() => import('./App'))
  .then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
