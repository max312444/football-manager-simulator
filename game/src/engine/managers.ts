// 감독 (모든 구단): 능력 · 성향 · 성장 · 교체
//  - 능력 0~100: 전술(tac, 경기력) · 동기부여(mot, 사기) · 육성(dev, 젊은 선수 성장) · 명성(rep)
//  - 잠재력(potential): 젊은 · 신입 감독은 성과를 내면 여기까지 오른다. 노장은 조금씩 떨어짐
//  - 성향(style): AI 구단 전술 (공격 · 압박 · 포메이션)
//  - 데이터: history/managers.json (실명 · 패러디 같은 형식, 시즌별 구단 감독). 없으면 가상 감독을 만든다
//  - 내 감독(user)은 새 게임 때 이름 · 철학 · 강점을 고른다. 철학과 맞는 전술로 싸우면 조금 더 강함
import type { ClubState, Mentality, Pressing, SeasonRecord, Tactics, World } from './types';
import type { Rng } from './rng';
import { createRng } from './rng';
import { ageOn } from './condition';
import { levelOf } from './pyramid';
import { difficultyOf } from './gameSettings';

export interface ManagerStyle { mentality: Mentality; pressing: Pressing; formation?: string }
export interface ManagerProfile {
  name: string; ko?: string; birth: string | null; nation: string;
  tac: number; mot: number; dev: number; rep: number; potential: number;
  style: ManagerStyle;
  generated?: boolean;
}
export interface Manager extends ManagerProfile {
  id: string;
  clubId: string | null;
  /** 내 감독 */
  user?: boolean;
  /** 지금 구단에 온 날 */
  since?: string;
  /** 우승 횟수 (게임 안) */
  titles?: number;
  /** 가상 감독 한국어 이름 만들기용 (이름 · 성을 가져온 선수) */
  nameFrom?: [string | null, string | null];
}
/** history/managers.json */
export interface ManagerData {
  managers: Record<string, ManagerProfile & { wikidata?: string }>;
  seasons: Record<string, Record<string, string>>;
}

export type Philosophy = 'attack' | 'balance' | 'defend';
export type Strength = 'tac' | 'mot' | 'dev';
export interface UserManagerInput { name: string; philosophy: Philosophy; pressing: Pressing; strength: Strength }
export const PHILOSOPHY_KO: Record<Philosophy, string> = { attack: '공격 축구', balance: '균형', defend: '실리 축구' };
export const STRENGTH_KO: Record<Strength, string> = { tac: '전술가', mot: '동기부여가', dev: '육성가' };
export const ABILITY_KO: Record<'tac' | 'mot' | 'dev' | 'rep', string> = { tac: '전술', mot: '동기부여', dev: '육성', rep: '명성' };
const PHIL_MENT: Record<Philosophy, Mentality> = { attack: 1, balance: 0, defend: -1 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(clamp(v, 1, 99));
export const USER_MANAGER = 'user';

/** 감독 나이 (생일을 모르면 50) */
export const managerAge = (w: World, m: Manager) => (m.birth ? ageOn(m.birth, w.date) : 50);
/** 종합 능력 (전술 중심) */
export const managerOverall = (m: Pick<Manager, 'tac' | 'mot' | 'dev' | 'rep'>) => Math.round(m.tac * 0.45 + m.mot * 0.25 + m.dev * 0.15 + m.rep * 0.15);

/** 구단 감독 (내 구단 = 내 감독) */
export function managerOf(w: World, clubId: string): Manager | null {
  if (!w.managers) return null;
  if (clubId === w.userClubId) return w.managers[USER_MANAGER] ?? null;
  const id = w.clubs[clubId]?.managerId;
  return id ? w.managers[id] ?? null : null;
}

/** 내 감독 만들기: 신입 감독 (능력 평범, 잠재력 높음) — 강점 하나가 조금 높다 */
export function createUserManager(w: World, input: UserManagerInput): Manager {
  const base = 55;
  const m: Manager = {
    id: USER_MANAGER, user: true, clubId: w.userClubId, since: w.date,
    name: input.name.trim() || '감독', ko: input.name.trim() || '감독', birth: null, nation: 'KOR',
    tac: base, mot: base, dev: base, rep: 50, potential: 92,
    style: { mentality: PHIL_MENT[input.philosophy], pressing: input.pressing },
  };
  m[input.strength] = base + 10;
  (w.managers ??= {})[USER_MANAGER] = m;
  return m;
}
/** 내 감독 철학 (style.mentality 로부터) */
export const philosophyOf = (m: Manager): Philosophy => (m.style.mentality > 0 ? 'attack' : m.style.mentality < 0 ? 'defend' : 'balance');

/** 가상 감독: 구단 명성에 맞는 평범한 능력 · 이름은 같은 나라 선수 이름에서 */
export function generateManager(w: World, clubId: string, rng: Rng, young = rng.chance(0.4)): Manager {
  const club = w.clubs[clubId];
  const nation = nationOfClub(w, club);
  const pool = Object.values(w.players).filter((p) => p.nation === nation && !p.generated);
  const f = pool.length ? rng.pick(pool) : null, l = pool.length ? rng.pick(pool) : null;
  const split = (s: string) => s.trim().split(/\s+/);
  const name = [f && split(f.name).length > 1 ? split(f.name)[0] : null, l ? split(l.name).at(-1) : 'Coach'].filter(Boolean).join(' ');
  const lvl = club.reputation;
  const core = clamp(40 + (lvl - 50) * 0.35 + rng.normal() * 5, 38, 70);
  const age = young ? rng.int(36, 45) : rng.int(46, 64);
  const y = +w.date.slice(0, 4) - age;
  let id = `mg-${clubId}-${w.date}`;
  for (let k = 2; w.managers?.[id]; k++) id = `mg-${clubId}-${w.date}-${k}`;
  const m: Manager = {
    id, clubId, since: w.date, generated: true, name, birth: `${y}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`, nation,
    tac: r1(core + rng.normal() * 4), mot: r1(core + rng.normal() * 5), dev: r1(core + rng.normal() * 5), rep: r1(core - 5),
    potential: r1(core + (young ? rng.int(8, 22) : rng.int(0, 5))),
    style: { mentality: rng.pick([-1, 0, 0, 1, 1] as Mentality[]), pressing: rng.pick([0, 1, 1, 2] as Pressing[]) },
    nameFrom: [f && split(f.name).length > 1 ? f.id : null, l?.id ?? null],
  };
  (w.managers ??= {})[id] = m;
  return m;
}

function nationOfClub(w: World, club: ClubState): string {
  const cnt: Record<string, number> = {};
  for (const id of club.squad) { const n = w.players[id]?.nation; if (n) cnt[n] = (cnt[n] ?? 0) + 1; }
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ENG';
}

/** 감독 성향을 구단 전술에 (AI 구단) */
function applyStyle(_w: World, club: ClubState, m: Manager) {
  club.tactics = { ...club.tactics, mentality: m.style.mentality, pressing: m.style.pressing };
  club.lineup = null;
}

/** 감독 배정: 데이터의 그 시즌 구단 감독, 없으면 가상 감독. 지난 3시즌 안에 일했던 다른 감독은 실업자 명단으로 */
export function assignManagers(w: World, data: ManagerData | undefined, season: string, rng: Rng) {
  const ms = (w.managers ??= {});
  const bySeason = data?.seasons[season] ?? {};
  const taken = new Set<string>();
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId) { club.managerId = undefined; continue; }
    const id = bySeason[club.id];
    const prof = id ? data!.managers[id] : null;
    if (id && prof && !taken.has(id)) {
      const prev = ms[id];
      // 게임 안에서 쌓은 성장은 그대로 (능력은 데이터보다 낮아지지 않게 큰 쪽)
      const m: Manager = prev ? { ...prev } : { ...stripData(prof), id, clubId: null };
      if (m.clubId !== club.id) m.since = w.date;
      m.clubId = club.id;
      ms[id] = m;
      // 이 감독이 맡던 다른 구단은 비움
      for (const c of Object.values(w.clubs)) if (c.managerId === id && c.id !== club.id) c.managerId = undefined;
      club.managerId = id;
      taken.add(id);
      applyStyle(w, club, m);
    } else if (!club.managerId || !ms[club.managerId] || ms[club.managerId].clubId !== club.id) {
      const m = generateManager(w, club.id, rng);
      club.managerId = m.id;
      applyStyle(w, club, m);
    }
  }
  // 내가 맡은 구단의 실제 감독: 다른 구단으로 (명성에 맞는 구단 중 감독이 더 약한 곳)
  const mineId = bySeason[w.userClubId];
  if (mineId && data?.managers[mineId] && !taken.has(mineId)) {
    const m = (ms[mineId] ??= { ...stripData(data.managers[mineId]), id: mineId, clubId: null });
    if (!m.clubId || m.clubId === w.userClubId) placeDisplaced(w, m);
  }
  // 실업 감독: 데이터에서 지난 3시즌 안에 일했던 감독 (자리가 나면 데려감)
  if (data) {
    const y = +season.slice(0, 4);
    for (let k = 1; k <= 3; k++) {
      const s = `${y - k}-${String((y - k + 1) % 100).padStart(2, '0')}`;
      for (const id of Object.values(data.seasons[s] ?? {})) {
        if (ms[id] || taken.has(id) || !data.managers[id]) continue;
        ms[id] = { ...stripData(data.managers[id]), id, clubId: null };
      }
    }
  }
  // 어디에도 없는 감독의 clubId 정리
  for (const m of Object.values(ms)) if (m.clubId && !m.user && w.clubs[m.clubId]?.managerId !== m.id) m.clubId = null;
}
const stripData = (p: ManagerProfile & { wikidata?: string }): ManagerProfile => { const { wikidata: _w, ...rest } = p; return { ...rest, style: { ...rest.style } }; };

/**
 * 자리를 잃은 감독 (내가 그 구단을 맡음) → 다른 구단으로
 *  명성 +5 이하 구단 중 지금 감독이 가상 감독이거나 종합 능력이 3 이상 낮은 곳, 그중 명성 높은 구단 (가상 감독 구단 우선)
 *  밀려난 감독은 실업자. 갈 곳이 없으면 실업자로 (나중에 자리가 나면 데려감)
 * @returns 간 구단 · 밀려난 감독
 */
export function placeDisplaced(w: World, m: Manager): { club: string; old?: string } | null {
  const ov = managerOverall(m);
  const cands = Object.values(w.clubs)
    .filter((c) => c.id !== w.userClubId && w.competitions[c.league] && c.reputation <= m.rep + 5)
    .map((c) => ({ c, cur: c.managerId ? w.managers?.[c.managerId] ?? null : null }))
    .filter((x) => !x.cur || x.cur.generated || managerOverall(x.cur) < ov - 3);
  if (!cands.length) { m.clubId = null; return null; }
  const score = (x: (typeof cands)[number]) => x.c.reputation + (!x.cur || x.cur.generated ? 6 : 0);
  cands.sort((a, b) => score(b) - score(a));
  const { c, cur } = cands[0];
  if (cur) cur.clubId = null;
  m.clubId = c.id; m.since = w.date;
  c.managerId = m.id;
  applyStyle(w, c, m);
  return { club: c.id, old: cur?.id };
}

/** 예전 세이브: 감독이 없으면 가상 감독으로 채움 */
export function ensureManagers(w: World) {
  if (w.managers && Object.values(w.clubs).every((c) => c.id === w.userClubId || (c.managerId && w.managers![c.managerId]))) return;
  assignManagers(w, undefined, w.season, createRng((w.seed ^ 0x3a9e) >>> 0));
  if (!w.managers![USER_MANAGER]) createUserManager(w, { name: '감독', philosophy: 'balance', pressing: 1, strength: 'tac' });
}

/** 감독 교체 (AI 구단): 실업 감독 중 구단 명성에 맞는 사람, 없으면 가상 감독 */
export function hireManager(w: World, clubId: string, rng: Rng): Manager {
  const club = w.clubs[clubId];
  const old = club.managerId ? w.managers?.[club.managerId] : null;
  if (old) old.clubId = null;
  const free = Object.values(w.managers ?? {}).filter((m) => !m.clubId && !m.user && m.id !== old?.id && managerAge(w, m) < 72
    && m.rep <= club.reputation + 8 && m.rep >= club.reputation - 25);
  const m = free.length && rng.chance(0.75)
    ? rng.weighted(free, (x) => Math.max(1, managerOverall(x) - 40) ** 2)
    : generateManager(w, clubId, rng);
  m.clubId = clubId; m.since = w.date;
  club.managerId = m.id;
  applyStyle(w, club, m);
  return m;
}

/** 경기력 배율: 전술 능력 · 내 감독 철학과 전술이 맞으면 보너스 · 난이도 (AI가 나와 싸울 때) */
export function managerEdge(w: World, clubId: string, oppId: string, tactics?: Pick<Tactics, 'mentality' | 'pressing'>): number {
  const m = managerOf(w, clubId);
  let e = m ? 1 + (m.tac - 60) * 0.0012 : 1;   // 전술 90 = +3.6% · 50 = -1.2%
  if (m?.user && tactics) {
    const want = m.style.mentality;
    const fit = (Math.sign(tactics.mentality) === Math.sign(want) ? 1 : 0) + (tactics.pressing === m.style.pressing ? 0.5 : 0);
    e *= 1 + fit * 0.008;   // 철학대로 싸우면 최대 +1.2%
  }
  if (clubId !== w.userClubId && oppId === w.userClubId) e *= difficultyOf(w).aiEdge;
  return e;
}

/** 사기가 돌아가려는 값 (동기부여 능력) */
export function moraleTarget(w: World, clubId: string | null): number {
  const m = clubId ? managerOf(w, clubId) : null;
  return m ? 52 + m.mot * 0.14 : 60;
}

/** 월간 성장 보너스 (육성 능력): 0.25 × (dev − 60) / 100 */
export function devBonus(w: World, clubId: string | null): number {
  const m = clubId ? managerOf(w, clubId) : null;
  return m ? (0.25 * (m.dev - 60)) / 100 : 0;
}

/**
 * 시즌 끝: 감독 성장 · 하락
 *  - 기대(전력 순위)보다 잘하면 잠재력까지 오르고, 우승은 크게. 못하면 명성만 조금
 *  - 60세 넘으면 전술 · 동기부여가 조금씩 떨어짐
 */
export function managerSeasonGrowth(w: World, recs: SeasonRecord[], strength: (clubId: string) => number) {
  if (!w.managers) return;
  for (const r of recs) {
    const n = r.table.length;
    const order = [...r.table].map((x) => x.club).sort((a, b) => strength(b) - strength(a));
    r.table.forEach((row, i) => {
      const m = managerOf(w, row.club);
      if (!m) return;
      const pos = i + 1, exp = order.indexOf(row.club) + 1;
      const perf = (exp - pos) / n;   // +: 기대보다 잘함
      const top = levelOf(r.league) === 1;
      const won = pos === 1;
      if (won) m.titles = (m.titles ?? 0) + 1;
      const room = Math.max(0, m.potential - (m.tac + m.mot + m.dev) / 3);
      const gain = clamp(perf * 12 + (won && top ? 3 : 0), -2, 5) * (room > 0 ? 1 : 0.2);
      const age = managerAge(w, m);
      const decline = age >= 66 ? 2 : age >= 60 ? 1 : 0;
      m.tac = r1(m.tac + Math.min(gain, room) - decline);
      m.mot = r1(m.mot + Math.min(gain * 0.7, room) - decline * 0.5);
      m.dev = r1(m.dev + Math.min(gain * 0.5, room));
      m.rep = r1(m.rep + clamp(perf * 15 + (won ? (top ? 5 : 2) : 0), -4, 8) * (top ? 1 : 0.6));
    });
  }
}
