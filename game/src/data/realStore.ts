// 실명 데이터 넣기 (웹 배포판용): 사용자가 고른 폴더에서 필요한 파일만 골라 이 브라우저(IndexedDB)에 저장한다
//  어디로도 전송하지 않는다. 게임이 켜질 때(main.tsx) boot() 로 먼저 읽어 두고, db.ts 가 이것을 실명 데이터로 쓴다
//  개발 서버에서 저장소의 data/ 폴더가 있으면 그쪽이 먼저다 (db.ts)

const DB = 'pitchboss-realdata';
const FILES = 'files', INFO = 'info';

export interface RealPackInfo { date: string; files: number; seasons: number; leagues: string[]; bytes: number }
export interface RealPack {
  meta: Record<string, unknown>;
  clubs: Record<string, unknown>;
  ko: Record<string, unknown>;
  seasons: Record<string, () => Promise<unknown>>;
  history: Record<string, () => Promise<unknown>>;
}

/** main.tsx 가 게임보다 먼저 채운다 */
export const realBoot: { available: boolean; info: RealPackInfo | null; pack: RealPack | null } = { available: false, info: null, pack: null };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(FILES); req.result.createObjectStore(INFO); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const ask = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const range = (prefix: string) => IDBKeyRange.bound(prefix, prefix + '￿');

/** 게임에 필요한 파일 (폴더 안 상대 경로) */
const WANT = /^(?:(.*)\/)?(meta\/[^/]+\.json|clubs\/[^/]+\.json|locale\/ko\/players[^/]*\.json|seasons\/[^/]+\/[^/]+\/[^/]+\.json|history\/players\.json)$/;

/** 고른 폴더(파일 목록)에서 실명 데이터 찾아 저장. 사진 · 수집 중간 파일 등 나머지는 읽지 않는다 */
export type PickedFile = File | { file: File; path: string };
export async function importRealFolder(list: FileList | PickedFile[], onProgress?: (done: number, total: number) => void): Promise<RealPackInfo> {
  // 폴더 안에 데이터 묶음이 여럿일 수 있다 (저장소 전체를 고르면 data/ 와 data-public/) → 시즌 파일이 가장 많은 실명 쪽
  const groups = new Map<string, { file: File; rel: string }[]>();
  for (const it of Array.from(list) as PickedFile[]) {
    const file = it instanceof File ? it : it.file;
    const path = (it instanceof File ? it.webkitRelativePath || it.name : it.path).replace(/\\/g, '/');
    const m = path.match(WANT);
    if (!m) continue;
    const root = m[1] ?? '';
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push({ file, rel: m[2] });
  }
  const seasonsIn = (g: { rel: string }[]) => g.filter((x) => x.rel.startsWith('seasons/')).length;
  const pick = [...groups.entries()]
    .filter(([root, g]) => !/(^|\/)data-public$/.test(root) && g.some((x) => x.rel === 'meta/leagues.json') && seasonsIn(g))
    .sort((a, b) => seasonsIn(b[1]) - seasonsIn(a[1]))[0];
  if (!pick) throw new Error('이 폴더에서 실명 데이터를 찾지 못했습니다. meta · clubs · seasons 폴더가 들어 있는 폴더를 골라 주세요.');
  const items = pick[1];

  // 읽고 확인 (JSON 이 깨진 파일이 있으면 중단)
  const out: [string, string][] = [];
  let bytes = 0;
  for (let i = 0; i < items.length; i++) {
    const text = await items[i].file.text();
    try { JSON.parse(text); } catch { throw new Error(`파일이 깨져 있습니다: ${items[i].rel}`); }
    out.push([items[i].rel, text]);
    bytes += text.length;
    if (i % 50 === 0) onProgress?.(i, items.length);
  }
  const leagues = [...new Set(items.filter((x) => x.rel.startsWith('seasons/')).map((x) => x.rel.split('/')[2]))].sort();
  const info: RealPackInfo = {
    date: new Date().toISOString().slice(0, 10), files: out.length, bytes, leagues,
    seasons: new Set(items.filter((x) => x.rel.startsWith('seasons/')).map((x) => x.rel.split('/')[1])).size,
  };

  // 이전 것을 지우고 한꺼번에 저장
  const db = await open();
  const t = db.transaction([FILES, INFO], 'readwrite');
  t.objectStore(FILES).clear();
  for (const [k, v] of out) t.objectStore(FILES).put(v, k);
  t.objectStore(INFO).put(info, 'info');
  await done(t);
  db.close();
  onProgress?.(items.length, items.length);
  try { await navigator.storage?.persist?.(); } catch { /* 무시 (브라우저가 거절해도 동작은 같음) */ }
  return info;
}

/** 넣어 둔 실명 데이터 지우기 */
export async function clearRealPack() {
  const db = await open();
  const t = db.transaction([FILES, INFO], 'readwrite');
  t.objectStore(FILES).clear();
  t.objectStore(INFO).clear();
  await done(t);
  db.close();
}

/** 게임 시작 전에: 넣어 둔 데이터가 있는지, 실명을 쓰기로 했으면 미리 읽기 (시즌 파일은 필요할 때) */
export async function boot(wantReal: boolean) {
  try {
    const db = await open();
    const info = (await ask(db.transaction(INFO).objectStore(INFO).get('info'))) as RealPackInfo | undefined;
    realBoot.info = info ?? null;
    realBoot.available = !!info?.seasons;
    if (!realBoot.available || !wantReal) { db.close(); return; }
    const s = db.transaction(FILES).objectStore(FILES);
    const all = async (prefix: string) => {
      const [keys, vals] = await Promise.all([ask(s.getAllKeys(range(prefix))), ask(s.getAll(range(prefix)))]);
      return Object.fromEntries(keys.map((k, i) => [`pack/${k}`, JSON.parse(vals[i] as string)]));
    };
    const [meta, clubs, ko, seasonKeys, histKeys] = await Promise.all([
      all('meta/'), all('clubs/'), all('locale/ko/'), ask(s.getAllKeys(range('seasons/'))), ask(s.getAllKeys(range('history/'))),
    ]);
    // 시즌 · 이력 파일은 부를 때 읽는다 (db 는 열어 둔다)
    const lazy = (keys: IDBValidKey[]) => Object.fromEntries(keys.map((k) => [`pack/${k}`, async () => JSON.parse((await ask(db.transaction(FILES).objectStore(FILES).get(k))) as string)]));
    realBoot.pack = { meta, clubs, ko, seasons: lazy(seasonKeys), history: lazy(histKeys) };
  } catch {
    // IndexedDB 를 못 쓰는 브라우저 (사생활 보호 모드 등) → 공개 데이터만
    realBoot.available = false;
    realBoot.pack = null;
  }
}

/** 끌어다 놓은 폴더 읽기 (브라우저는 폴더 주소를 알려 주지 않으므로 안의 파일을 직접 훑는다). 사진 · 수집 중간 폴더는 건너뜀 */
const SKIP = new Set(['photos', '_pipeline', '_audit', 'node_modules', '.git', 'canonical', 'game', 'tools']);
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const walk = async (e: FileSystemEntry, path: string): Promise<void> => {
    if (e.isFile) {
      if (!e.name.endsWith('.json')) return;
      const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
      out.push({ file, path });
    } else if (e.isDirectory && !SKIP.has(e.name)) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // readEntries 는 한 번에 100개까지만 준다 → 빈 배열이 나올 때까지
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        await Promise.all(batch.map((c) => walk(c, `${path}/${c.name}`)));
      }
    }
  };
  const roots = Array.from(dt.items).map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  await Promise.all(roots.map((e) => walk(e, e.name)));
  return out;
}
