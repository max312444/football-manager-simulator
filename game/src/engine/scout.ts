// 스카우트: 다른 구단 선수의 능력치는 '아는 만큼'만 보인다 (내 구단만, AI 구단은 상관없음)
//  - 앎(0~100): 내 선수 100 · 같은 리그 · 스타(능력 84+) 40 · 나머지 20. 맞붙은 상대 선수는 경기마다 +6 (70까지)
//  - 앎이 낮을수록 능력치가 넓은 범위로 보인다 (범위 안에 진짜 값이 있음). 70 이상이면 숨은 성향(프로의식 · 야망 등) 공개
//  - 스카우트 보내기: 구단 전체 (7일 · 다른 리그 14일, 그 구단 선수 모두 앎 95. 비용은 아직 정확히 모르는 선수 한 명 비용의 합)
//    · 리그 전체 관찰 (28일, 그 리그 선수 모두 앎 65 이상). 자유계약 선수는 스카우트 없이 능력치 공개
//    스카우트는 구단 창(검색 · 구단 이름)에서 보내고 진행률을 본다. 선수 정보는 얼마나 아는지 · 진행률만
//  - 비용은 구단 매출에 비례 (작은 구단도 쓸 수 있게), 재정 장부 '스카우트'
//  - 설정에서 끄면 (scoutFog: false) 모든 선수 능력치가 정확히 보인다
import type { GameEvent, PlayerState, World } from './types';
import { overall } from './ratings';
import { book, clubRevenue } from './finance';

export type ScoutKind = 'player' | 'club' | 'league';
export interface ScoutJob { kind: ScoutKind; target: string; start: string; done: string; cost: number }
export interface ScoutState { k: Record<string, number>; jobs: ScoutJob[] }

export const MAX_PLAYER_JOBS = 3;
export const REPORT_K = 95;
export const LEAGUE_K = 65;
export const HIDDEN_K = 70;
const MATCH_K = 6, MATCH_CAP = 70;
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export const scoutOf = (w: World): ScoutState => (w.scout ??= { k: {}, jobs: [] });
export const fogOn = (w: World) => w.settings?.scoutFog !== false;

const leagueOfClub = (w: World, clubId: string | null) => (clubId ? w.clubs[clubId]?.league : undefined);
const userLeague = (w: World) => w.clubs[w.userClubId].league;

/** 이 선수를 얼마나 아는가 (0~100) */
export function knowledge(w: World, p: PlayerState): number {
  if (!fogOn(w) || p.clubId === w.userClubId || !p.clubId) return 100;   // 자유계약 선수는 능력치 공개 (테스트 · 입단 테스트로 볼 수 있음)
  const base = leagueOfClub(w, p.clubId) === userLeague(w) || overall(p) >= 84 ? 40 : 20;
  return Math.max(base, w.scout?.k[p.id] ?? 0);
}

// 선수 · 항목마다 고정된 0~1 값 (범위 안에서 진짜 값의 위치. 매번 같아야 범위가 줄어들 때 자연스럽다)
function frac(id: string, key: string): number {
  let h = 2166136261;
  for (const ch of id + '|' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
/** 앎에 따른 범위 폭 (0 이면 정확) */
export const spanOf = (k: number) => (k >= REPORT_K ? 0 : Math.round(((100 - k) / 100) * 12));

/** 보이는 값: [낮은 값, 높은 값] (같으면 정확) */
export function seenRange(w: World, p: PlayerState, key: string, value: number, k = knowledge(w, p)): [number, number] {
  const v = Math.round(value), span = spanOf(k);
  if (!span) return [v, v];
  const lo = Math.max(1, v - Math.round(frac(p.id, key) * span));
  return [lo, Math.min(99, lo + span)];
}
/** 능력 (보이는 범위) */
export const seenOverall = (w: World, p: PlayerState) => seenRange(w, p, 'ovr', overall(p));
/** 목록 정렬 · 비교용 추정 능력 (범위 가운데) */
export const estOverall = (w: World, p: PlayerState) => { const [a, b] = seenOverall(w, p); return (a + b) / 2; };
/** 숨은 성향이 보이는가 */
export const hiddenKnown = (w: World, p: PlayerState) => knowledge(w, p) >= HIDDEN_K;

/** 구단 스카우트 대상: 그 구단 선수 중 아직 정확히 모르는 선수 */
export const clubScoutTargets = (w: World, clubId: string) => (w.clubs[clubId]?.squad ?? []).map((id) => w.players[id]).filter((p) => p && knowledge(w, p) < REPORT_K);
/** 비용 (구단 매출 비례). 구단 = 아직 모르는 선수 한 명 비용의 합 */
export function scoutCost(w: World, kind: ScoutKind, target?: string): number {
  const rev = clubRevenue(w, w.userClubId);
  const one = (league: string | undefined) => Math.max(20_000, Math.round((rev * (league !== userLeague(w) ? 0.0008 : 0.0005)) / 10_000) * 10_000);
  if (kind === 'league') return Math.max(150_000, Math.round((rev * 0.003) / 10_000) * 10_000);
  if (kind === 'club') return clubScoutTargets(w, target!).length * one(w.clubs[target!]?.league);
  return one(leagueOfClub(w, w.players[target!]?.clubId ?? null));
}
export const scoutDays = (w: World, kind: ScoutKind, target?: string) =>
  kind === 'league' ? 28 : (kind === 'club' ? w.clubs[target!]?.league : leagueOfClub(w, w.players[target!]?.clubId ?? null)) === userLeague(w) ? 7 : 14;

export function startScout(w: World, kind: ScoutKind, target: string): { ok: boolean; reason?: string } {
  const s = scoutOf(w);
  if (s.jobs.some((j) => j.kind === kind && j.target === target)) return { ok: false, reason: '이미 스카우트를 보냈습니다' };
  if (kind !== 'league' && s.jobs.filter((j) => j.kind !== 'league').length >= MAX_PLAYER_JOBS) return { ok: false, reason: `스카우트는 한 번에 ${MAX_PLAYER_JOBS}곳까지` };
  if (kind === 'club' && !clubScoutTargets(w, target).length) return { ok: false, reason: '이미 모든 선수를 잘 아는 구단입니다' };
  if (kind === 'league' && s.jobs.some((j) => j.kind === 'league')) return { ok: false, reason: '리그 관찰은 한 번에 하나씩' };
  if (kind === 'player' && knowledge(w, w.players[target]) >= REPORT_K) return { ok: false, reason: '이미 잘 아는 선수입니다' };
  const cost = scoutCost(w, kind, target);
  if (w.clubs[w.userClubId].finance.balance < cost) return { ok: false, reason: '잔고가 부족합니다' };
  book(w, w.userClubId, 'scouting', cost);
  s.jobs.push({ kind, target, start: w.date, done: addDays(w.date, scoutDays(w, kind, target)), cost });
  return { ok: true };
}
export function cancelScout(w: World, kind: ScoutKind, target: string) {
  const s = scoutOf(w);
  s.jobs = s.jobs.filter((j) => !(j.kind === kind && j.target === target));   // 이미 쓴 비용은 돌려받지 않음
}

/** 진행 중인 스카우트의 진행률 (0~100) · 남은 날 */
export function scoutProgress(w: World, j: ScoutJob): { pct: number; left: number } {
  const total = Math.max(1, (Date.parse(j.done) - Date.parse(j.start)) / 864e5);
  const left = Math.max(0, Math.round((Date.parse(j.done) - Date.parse(w.date)) / 864e5));
  return { pct: Math.round(Math.min(100, Math.max(0, ((total - left) / total) * 100))), left };
}

/** 매일: 끝난 스카우트 보고서 */
export function scoutDay(w: World): GameEvent[] {
  if (!w.scout?.jobs.length) return [];
  const s = w.scout, out: GameEvent[] = [];
  for (const j of s.jobs.filter((x) => x.done <= w.date)) {
    if (j.kind === 'player') {
      const p = w.players[j.target];
      if (p) { s.k[p.id] = Math.max(s.k[p.id] ?? 0, REPORT_K); out.push({ type: 'scout', date: w.date, player: p.id }); }
    } else if (j.kind === 'club') {
      // 구단 전체: 보고서가 나온 날 그 구단에 있는 선수 모두
      let n = 0;
      for (const id of w.clubs[j.target]?.squad ?? []) if ((s.k[id] ?? 0) < REPORT_K) { s.k[id] = REPORT_K; n++; }
      out.push({ type: 'scout', date: w.date, club: j.target, count: n });
    } else {
      let n = 0;
      for (const c of Object.values(w.clubs)) if (c.league === j.target) for (const id of c.squad) { if ((s.k[id] ?? 0) < LEAGUE_K) { s.k[id] = LEAGUE_K; n++; } }
      out.push({ type: 'scout', date: w.date, league: j.target, count: n });
    }
  }
  s.jobs = s.jobs.filter((x) => x.done > w.date);
  return out;
}

/** 내 경기에서 맞붙은 상대 선수는 조금씩 알게 된다 */
export function scoutMatch(w: World, played: string[]) {
  if (!fogOn(w)) return;
  const s = scoutOf(w);
  for (const id of played) {
    const p = w.players[id];
    if (!p || p.clubId === w.userClubId) continue;
    const k = knowledge(w, p);
    if (k < MATCH_CAP) s.k[id] = Math.min(MATCH_CAP, k + MATCH_K);
  }
}
