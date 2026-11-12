// 오프라인 실행용 서비스 워커 (배포판에서만 등록, main.tsx)
//  - 화면(HTML): 네트워크 먼저, 안 되면 저장해 둔 것 → 업데이트가 바로 보이고 오프라인에서도 열림
//  - 빌드 파일(assets/, 이름에 해시가 있어 바뀌지 않음): 저장해 둔 것 먼저 → 한 번 연 시즌 데이터는 오프라인에서도 됨
//  - 그 밖(아이콘 · 앱 정보): 저장해 둔 것을 쓰고 뒤에서 새로 받음
const CACHE = 'pitchboss-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const put = (res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))));
    return;
  }
  if (new URL(req.url).pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then(put)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => { const net = fetch(req).then(put).catch(() => r); return r || net; }));
});
