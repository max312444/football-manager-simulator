// 내 감독 커리어 기록 · 랭킹 (명예의 전당, 이 PC 에만)
//  커리어마다: 맡은 구단 · 지휘한 시즌 · 우승 (대회별) · 감독 명성 → 점수로 순위
//  점수: 챔피언스리그 12 · 1부 리그 10 · 유로파리그 6 · 2부 리그 4 · 국내 컵 4 · 지휘한 시즌마다 0.5
//  시즌이 끝날 때 · 저장할 때 갱신 (세이브의 w.careerId 기준)
import type { World } from '../engine/types';
import { levelOf } from '../engine/pyramid';
import { clubKo, dataset } from '../data/db';

export type TitleKind = 'ucl' | 'league1' | 'uel' | 'league2' | 'cup';
export const TITLE_KO: Record<TitleKind, string> = { ucl: '챔피언스리그', league1: '1부 리그', uel: '유로파리그', league2: '2부 리그', cup: '국내 컵' };
export const TITLE_POINTS: Record<TitleKind, number> = { ucl: 12, league1: 10, uel: 6, league2: 4, cup: 4 };
export const SEASON_POINTS = 0.5;

export interface CareerRecord {
  id: string;
  started: string;          // 게임 시작 시즌
  updated: string;          // 마지막 갱신 (실제 시각)
  date: string;             // 게임 속 날짜
  dataset: 'public' | 'real';
  clubs: { club: string; name: string; from: string; to: string | null }[];
  seasons: number;          // 지휘한 시즌 (끝난 시즌)
  titles: Record<TitleKind, number>;
  reputation: number;
  points: number;
}

const KEY = 'pitchboss.careers';
export function listCareers(): CareerRecord[] {
  try { return Object.values(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, CareerRecord>).sort((a, b) => b.points - a.points); } catch { return []; }
}
export function deleteCareer(id: string) {
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? '{}'); delete all[id]; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
}

const kindOf = (id: string): TitleKind => (id === 'ucl' ? 'ucl' : id === 'uel' ? 'uel' : id.endsWith('-cup') ? 'cup' : levelOf(id) === 1 ? 'league1' : 'league2');

export function careerOf(w: World): CareerRecord | null {
  const m = w.manager;
  if (!m || !w.careerId) return null;
  const titles: Record<TitleKind, number> = { ucl: 0, league1: 0, uel: 0, league2: 0, cup: 0 };
  for (const h of m.history) for (const t of h.titles ?? []) titles[kindOf(t.split(' ')[1] ?? '')]++;
  const seasons = new Set(w.history.map((h) => h.season)).size;   // 끝난 시즌
  const points = (Object.keys(titles) as TitleKind[]).reduce((s, k) => s + titles[k] * TITLE_POINTS[k], 0) + seasons * SEASON_POINTS;
  return {
    id: w.careerId, started: [...w.history.map((h) => h.season), w.season].sort()[0], updated: new Date().toISOString(), date: w.date,
    dataset: w.dataset ?? dataset, clubs: m.history.map((h) => ({ club: h.club, name: clubKo(h.club), from: h.from, to: h.to })),
    seasons, titles, reputation: m.reputation, points: Math.round(points * 10) / 10,
  };
}

/** 이 게임의 커리어 기록 갱신 */
export function recordCareer(w: World) {
  const c = careerOf(w);
  if (!c) return;
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? '{}'); all[c.id] = c; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
}

export const newCareerId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
