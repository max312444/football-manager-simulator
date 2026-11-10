// 사진 얼굴 분석 (선수 사진 고르기용): 설치된 크롬에서 face-api (MIT) 를 돌린다
//  - 얼굴 위치 · 얼굴 특징값 (같은 사람인지 비교) · 얼굴 부분 선명도 (흔들림 · 초점)
//  필요한 것: tools/ 에서 npm i (playwright-core · @vladmandic/face-api), 크롬 (CHROME_PATH 로 바꿀 수 있음)
const fs = require('fs');
const path = require('path');

const TOOLS = path.resolve(__dirname, '..', '..');
const FACE = path.join(TOOLS, 'node_modules', '@vladmandic', 'face-api');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ORIGIN = 'http://faces.local';

async function openAnalyzer() {
  const { chromium } = require(path.join(TOOLS, 'node_modules', 'playwright-core'));
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  const images = new Map();
  await page.route(`${ORIGIN}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script src="/face-api.js"></script>' });
    if (p === '/face-api.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(FACE, 'dist', 'face-api.js')) });
    if (p.startsWith('/model/')) return route.fulfill({ body: fs.readFileSync(path.join(FACE, 'model', path.basename(p))) });
    if (p.startsWith('/img/')) { const b = images.get(path.basename(p)); return b ? route.fulfill({ contentType: 'image/jpeg', body: b }) : route.fulfill({ status: 404 }); }
    return route.fulfill({ status: 404 });
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(async () => {
    const f = window.faceapi;
    await f.tf.ready();
    await f.nets.ssdMobilenetv1.loadFromUri('/model');
    await f.nets.faceLandmark68Net.loadFromUri('/model');
    await f.nets.faceRecognitionNet.loadFromUri('/model');
  });
  let n = 0;
  /** 사진 한 장 분석 → { w, h, faces: [{ box: [x, y, w, h] (0~1), score, sharp, desc }] } */
  async function analyze(buffer) {
    const name = `${++n}.jpg`;
    images.set(name, buffer);
    try {
      return await page.evaluate(async (src) => {
        const f = window.faceapi;
        const img = new Image();
        img.src = src;
        await img.decode();
        const W = img.naturalWidth, H = img.naturalHeight;
        const found = await f.detectAllFaces(img, new f.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 12 })).withFaceLandmarks().withFaceDescriptors();
        const cv = document.createElement('canvas');
        cv.width = cv.height = 112;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        return {
          w: W, h: H,
          faces: found.map((d) => {
            const b = d.detection.box;
            // 얼굴 부분 선명도: 112px 로 줄인 회색조에서 라플라시안 분산 (클수록 선명)
            ctx.drawImage(img, b.x, b.y, b.width, b.height, 0, 0, 112, 112);
            const px = ctx.getImageData(0, 0, 112, 112).data;
            const g = new Float32Array(112 * 112);
            for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
            let sum = 0, sq = 0, cnt = 0;
            for (let y = 1; y < 111; y++) for (let x = 1; x < 111; x++) {
              const i = y * 112 + x;
              const l = g[i - 1] + g[i + 1] + g[i - 112] + g[i + 112] - 4 * g[i];
              sum += l; sq += l * l; cnt++;
            }
            const sharp = sq / cnt - (sum / cnt) ** 2;
            return { box: [b.x / W, b.y / H, b.width / W, b.height / H], px: Math.round(b.width), score: d.detection.score, sharp: Math.round(sharp), desc: Array.from(d.descriptor, (v) => Math.round(v * 1e4) / 1e4) };
          }),
        };
      }, `/img/${name}`);
    } finally { images.delete(name); }
  }
  return { analyze, close: () => browser.close() };
}

/** 두 얼굴 특징값 거리 (0.5 이하면 같은 사람일 가능성 높음) */
const faceDist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

/** 여러 얼굴에서 같은 사람 무리 (서로 가까운 얼굴이 가장 많은 무리) 의 평균 특징값 */
function referenceFace(descs) {
  if (!descs.length) return null;
  let best = [];
  for (const d of descs) { const g = descs.filter((x) => faceDist(d, x) < 0.5); if (g.length > best.length) best = g; }
  return best[0].map((_, i) => best.reduce((s, x) => s + x[i], 0) / best.length);
}

module.exports = { openAnalyzer, faceDist, referenceFace };
