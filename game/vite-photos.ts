// 개발 서버 전용: 선수 사진 (내 PC 의 ../data/photos, Git 에 없음)
//  GET  /photos/...          사진 · manifest.json 그대로
//  POST /photos/choose       자동 수집 후보 중 하나로 바꾸기 { player, season, cand }
//  POST /photos/upload       직접 넣기 { player, season, data (data: URL) | url }
//  POST /photos/remove       이 시즌 사진 빼기 { player, season }
//  직접 넣은 · 고른 사진은 picked 로 표시해 다시 수집해도 덮어쓰지 않는다
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const UA = 'football-manager-data-pipeline/0.1 (personal non-commercial project; Node.js fetch)';
const MAX = 15 * 1024 * 1024;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', json: 'application/json' };

/** 그림 파일 종류 (앞 몇 바이트로) */
function imageExt(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (b.slice(0, 3).toString() === 'GIF') return 'gif';
  return null;
}

const readBody = (req: IncomingMessage) => new Promise<string>((ok, bad) => {
  let size = 0; const parts: Buffer[] = [];
  req.on('data', (d: Buffer) => { size += d.length; if (size > MAX * 1.4) { bad(new Error('파일이 너무 큽니다 (15MB 까지)')); req.destroy(); } else parts.push(d); });
  req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
  req.on('error', bad);
});
const send = (res: ServerResponse, code: number, body: unknown) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };

export function photosPlugin(dataDir: string, toolsDir: string): Plugin {
  const root = path.join(dataDir, 'photos');
  const mfFile = path.join(root, 'manifest.json');
  const readMf = () => (fs.existsSync(mfFile) ? JSON.parse(fs.readFileSync(mfFile, 'utf8')) : { players: {}, files: {} });
  const writeMf = (m: unknown) => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(mfFile, JSON.stringify(m)); };
  const valid = (player: unknown, season: unknown) => typeof player === 'string' && /^[a-z0-9-]+$/.test(player) && typeof season === 'string' && /^\d{4}-\d{2}$/.test(season);

  // 얼굴 분석기 (도구가 설치돼 있으면, 처음 쓸 때 크롬을 띄우고 계속 씀)
  let az: Promise<{ analyze(b: Buffer): Promise<{ w: number; h: number; faces: { box: number[]; px: number }[] }> }> | null = null;
  const analyzer = () => {
    if (!az) {
      try {
        const req = createRequire(path.join(toolsDir, 'package.json'));
        az = req('./data_pipeline/lib/faces.js').openAnalyzer();
      } catch { az = Promise.reject(new Error('얼굴 분석 도구 없음')); }
      az!.catch(() => { /* 없으면 얼굴 없이 저장 */ });
    }
    return az!;
  };
  /** 가장 큰 얼굴 위치 (못 찾으면 null) */
  const faceOf = async (b: Buffer) => {
    try {
      const r = await (await analyzer()).analyze(b);
      const f = [...r.faces].sort((x, y) => y.px - x.px)[0];
      return { w: r.w, h: r.h, face: f ? f.box.map((v) => Math.round(v * 1e4) / 1e4) : undefined };
    } catch { return {}; }
  };
  const fetchImage = async (url: string) => {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`내려받기 실패 (${r.status})`);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > MAX) throw new Error('파일이 너무 큽니다 (15MB 까지)');
    return b;
  };
  const saveFile = (b: Buffer, key: string, ext: string) => {
    const file = path.join(root, 'files', `${key}.${ext}`);
    if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, b); }
  };
  const post = (fn: (body: Record<string, unknown>) => Promise<unknown>) => async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return send(res, 405, { ok: false });
    try { send(res, 200, { ok: true, ...(await fn(JSON.parse(await readBody(req))) as object) }); }
    catch (err) { send(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) }); }
  };

  return {
    name: 'local-photos',
    configureServer(server) {
      server.middlewares.use('/photos/choose', post(async ({ player, season, cand }) => {
        const c = cand as { src?: string; title: string; author: string; license: string; date: string | null; url: string; w?: number; h?: number; face?: number[] };
        if (!valid(player, season) || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(c?.src ?? '')) throw new Error('잘못된 요청');
        const key = crypto.createHash('sha1').update(c.title).digest('hex').slice(0, 16);
        if (!fs.existsSync(path.join(root, 'files', `${key}.jpg`))) saveFile(await fetchImage(c.src!), key, 'jpg');
        const m = readMf();
        const e = (m.players[player as string] ??= { seasons: {} });
        e.seasons[season as string] = key;
        (e.picked ??= {})[season as string] = true;
        m.files[key] = { title: c.title, author: c.author, license: c.license, date: c.date, url: c.url, w: c.w, h: c.h, face: c.face };
        writeMf(m);
        return { key };
      }));
      server.middlewares.use('/photos/upload', post(async ({ player, season, data, url }) => {
        if (!valid(player, season)) throw new Error('잘못된 요청');
        let b: Buffer;
        if (typeof data === 'string' && data.startsWith('data:')) b = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
        else if (typeof url === 'string' && /^https?:\/\//.test(url)) b = await fetchImage(url);
        else throw new Error('사진 파일이나 이미지 주소가 없습니다');
        const ext = imageExt(b);
        if (!ext) throw new Error('그림 파일이 아닙니다 (JPG · PNG · WEBP)');
        const key = 'u' + crypto.createHash('sha1').update(b).digest('hex').slice(0, 15);
        saveFile(b, key, ext);
        const meta = await faceOf(b);
        const m = readMf();
        const e = (m.players[player as string] ??= { seasons: {} });
        e.seasons[season as string] = key;
        (e.picked ??= {})[season as string] = true;
        m.files[key] = { title: '직접 넣은 사진', author: '', license: '', date: null, url: typeof url === 'string' ? url : '', user: true, ext, ...meta };
        writeMf(m);
        return { key, face: !!(meta as { face?: unknown }).face };
      }));
      server.middlewares.use('/photos/remove', post(async ({ player, season }) => {
        if (!valid(player, season)) throw new Error('잘못된 요청');
        const m = readMf();
        const e = (m.players[player as string] ??= { seasons: {} });
        delete e.seasons[season as string];
        (e.picked ??= {})[season as string] = true;   // 다시 수집해도 채우지 않음
        writeMf(m);
        return {};
      }));
      server.middlewares.use('/photos', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(root, rel);
        if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          if (rel === 'manifest.json') return send(res, 200, { players: {}, files: {} });   // 사진 폴더가 아직 없어도 직접 넣기는 가능
          return next();
        }
        const ext = path.extname(file).slice(1);
        res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', ext === 'json' ? 'no-store' : 'max-age=86400');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}
