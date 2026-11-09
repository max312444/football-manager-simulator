// 세이브: 브라우저 IndexedDB에 월드를 통째로 저장한다.
// 슬롯: 'auto'(자동 저장) + 'slot-1' ~ 'slot-3'(직접 저장)
import { WORLD_VERSION, type World } from '../engine/types';

export interface SaveMeta {
  slot: string;
  savedAt: string;      // ISO 시각
  season: string;
  date: string;
  clubId: string;
  version: number;
}
interface SaveRecord extends SaveMeta { world: World }

const DB = 'pitch-boss', STORE = 'saves';
export const SLOTS = ['auto', 'slot-1', 'slot-2', 'slot-3'] as const;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'slot' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { resolve(req.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  }));
}

export async function writeSave(slot: string, world: World): Promise<SaveMeta> {
  const meta: SaveMeta = { slot, savedAt: new Date().toISOString(), season: world.season, date: world.date, clubId: world.userClubId, version: world.version };
  // 구조화 복제로 저장 (월드는 함수 없는 순수 데이터)
  await tx('readwrite', (s) => s.put({ ...meta, world } satisfies SaveRecord));
  return meta;
}

export async function readSave(slot: string): Promise<World | null> {
  const rec = await tx<SaveRecord | undefined>('readonly', (s) => s.get(slot) as IDBRequest<SaveRecord | undefined>);
  if (!rec) return null;
  return migrate(rec.world);
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveRecord[]>('readonly', (s) => s.getAll() as IDBRequest<SaveRecord[]>);
  return all.map(({ world: _w, ...meta }) => meta).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteSave(slot: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

/** 옛 세이브 형식 변환 */
function migrate(w: World): World {
  const v = (w as { version: number }).version;
  if (v === 1) {
    for (const p of Object.values(w.players)) p.career ??= [];
    w.history ??= [];
  }
  // 충성도 도입 전 세이브
  for (const p of Object.values(w.players)) {
    p.loyalty ??= 40 + p.hidden.loyalty * 2;
    p.benchStreak ??= 0;
  }
  (w as { version: number }).version = WORLD_VERSION;
  return w;
}

// 개발 중 변경 시 페이지 전체 새로 고침 (상태 어긋남 방지)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
