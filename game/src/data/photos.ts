// 선수 사진 (내 PC 의 data/photos 폴더, Git 에 없음 · 개인이 추가)
//  개발 서버가 /photos/ 주소로 data/photos 를 그대로 보여 준다 (vite-photos.ts). 수집 중에 늘어난 사진도 바로 보인다
//  그 시즌에 찍힌 사진만 쓴다 (없으면 사진 없음)
//  확대 창에서: 자동 수집 후보 중 고르기 · 직접 넣기 (파일 · 붙여넣기 · 이미지 주소) · 빼기
import { useEffect, useState } from 'react';

export interface PhotoCredit {
  title: string; author: string; license: string; date: string | null; url: string;
  /** 사진 크기 · 선수 얼굴 위치 [x, y, w, h] (0~1) */
  w?: number; h?: number; face?: number[];
  /** 직접 넣은 사진 · 파일 확장자 (없으면 jpg) */
  user?: boolean; ext?: string;
}
export interface PhotoCand extends PhotoCredit { src: string }
interface Manifest {
  players: Record<string, { default?: string; seasons: Record<string, string>; cands?: Record<string, PhotoCand[]>; picked?: Record<string, boolean> }>;
  files: Record<string, PhotoCredit>;
}

/** 게임에서 사진 표시 (첫 화면 데이터베이스에서 켜고 끔, 기본 켬) */
const PHOTO_KEY = 'pitchboss.photos';
export const photosEnabled = () => { try { return localStorage.getItem(PHOTO_KEY) !== 'off'; } catch { return true; } };
export function setPhotosEnabled(on: boolean) { try { localStorage.setItem(PHOTO_KEY, on ? 'on' : 'off'); } catch { /* 무시 */ } listeners.forEach((l) => l(manifest)); }
/** 사진 수 (데이터베이스 화면용) */
export const photoStats = (m: Manifest | null) => ({ players: Object.values(m?.players ?? {}).filter((e) => Object.keys(e.seasons).length).length, files: Object.keys(m?.files ?? {}).length, user: Object.values(m?.files ?? {}).filter((x) => x.user).length });

let manifest: Manifest | null = null;
let loading: Promise<Manifest | null> | null = null;
let loadedAt = 0;
const listeners = new Set<(m: Manifest | null) => void>();

/** 사진 목록 불러오기 (5분마다 · force 면 바로 새로). 개발 서버가 없으면 null (사진 기능 없음) */
export function loadPhotos(force = false): Promise<Manifest | null> {
  if (!force && manifest && Date.now() - loadedAt < 5 * 60e3) return Promise.resolve(manifest);
  if (import.meta.env.PROD) return Promise.resolve(null);   // 배포판에는 사진 기능 없음 (개발 서버 전용)
  loading ??= fetch('/photos/manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
    .then((m: Manifest | null) => { manifest = m ?? manifest; loadedAt = Date.now(); listeners.forEach((l) => l(manifest)); return manifest; })
    .catch(() => manifest)
    .finally(() => { loading = null; });
  return loading;
}

export interface PlayerPhotoInfo { src: string; credit: PhotoCredit; season: string; cands: PhotoCand[]; picked: boolean }

/** 이 선수 · 시즌에 쓸 사진 (없으면 null) */
export function photoOf(m: Manifest | null, playerId: string, season: string): PlayerPhotoInfo | null {
  const e = m?.players[playerId];
  const key = e?.seasons[season];
  if (!key || !m!.files[key]) return null;
  const f = m!.files[key];
  return { src: `/photos/files/${key}.${f.ext ?? 'jpg'}`, credit: f, season, cands: e!.cands?.[season] ?? [], picked: !!e!.picked?.[season] };
}
/** 사진은 없어도 이 시즌 자동 수집 후보 */
export const candsOf = (m: Manifest | null, playerId: string, season: string) => m?.players[playerId]?.cands?.[season] ?? [];

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; face?: boolean }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, error: '개발 서버에 연결할 수 없습니다' };
  const j = await r.json().catch(() => ({ ok: false, error: `서버 오류 (${r.status})` }));
  if (j.ok) await loadPhotos(true);
  return j;
}
/** 자동 수집 후보로 바꾸기 */
export const choosePhoto = (player: string, season: string, cand: PhotoCand) => post('/photos/choose', { player, season, cand });
/** 직접 넣기: data = 'data:image/...;base64,...' 또는 url = 이미지 주소 */
export const uploadPhoto = (player: string, season: string, src: { data?: string; url?: string }) => post('/photos/upload', { player, season, ...src });
/** 이 시즌 사진 빼기 */
export const removePhoto = (player: string, season: string) => post('/photos/remove', { player, season });

/** 사진 · 후보 · 사진 기능 사용 가능 여부 */
export function usePhotos(playerId: string, season: string) {
  const [m, setM] = useState<Manifest | null>(manifest);
  useEffect(() => {
    let alive = true;
    const l = (x: Manifest | null) => alive && setM(x);
    listeners.add(l);
    loadPhotos().then(l);
    return () => { alive = false; listeners.delete(l); };
  }, []);
  const on = photosEnabled();
  return { ph: on ? photoOf(m, playerId, season) : null, cands: on ? candsOf(m, playerId, season) : [], ready: !!m && on };
}
export const usePhoto = (playerId: string, season: string) => usePhotos(playerId, season).ph;
