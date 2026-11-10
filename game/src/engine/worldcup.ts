// 월드컵: 4년마다 (2002 · 2006 · … · 2026 · 2030 …) 시즌이 끝난 6~7월
//
//  - 참가국 · 조: 2002 ~ 2026 은 실제 (위키백과 squads 문서 → meta/worldcups.json), 그 뒤는 대표팀 전력 + 대륙 연맹 쿼터
//    32팀 (~2022): UEFA 13 · CAF 5 · AFC 4 · CONMEBOL 4 · CONCACAF 3 · 대륙 간 PO 2 (전력 순), 48팀 (2026~): 16 · 9 · 8 · 6 · 6 · OFC 1 · PO 2
//  - 일정: 32팀 조별리그 6/12 · 6/16 · 6/20 → 16강 6/24 → 8강 6/28 → 4강 7/2 → 3·4위 7/5 · 결승 7/6
//          48팀 조별리그 6/11 · 6/15 · 6/19 → 32강 6/23 → 16강 6/27 → 8강 7/1 → 4강 7/5 → 3·4위 7/8 · 결승 7/9
//    실제 2022 대회는 11~12월이었지만 게임에서는 모두 여름에 연다 (단순화)
//  - 대표 선발: 대회 1주 전, 나라마다 23명 (2026~ 26명). 유럽 리그 선수가 모자라면 '국내파' 가상 선수 (시즌이 바뀌면 지움)
//  - 대표팀은 경기용 구단 'nt-<나라>' (리그 'intl', 재정 없음). 경기 기록은 선수 intlStats
//  - 녹아웃: 단판, 비기면 승부차기. 32팀: 1A-2B 식 대진, 48팀: 조 순위 · 승점 순 시드로 1 vs 32 …
//  - 우승: 우승국 출전 선수 수상 경력(wc) · 사기 +15, 준우승 사기 +5. 득점왕 소식
import type { Fixture, GameEvent, PlayerState, TableRow, World } from './types';
import { createRng, hashSeed, type Rng } from './rng';
import { applyResult, emptyRow, sortTable } from './standings';
import { shootout } from './cup';
import { ALL_NATIONS, confedOf, fillerLevel, missingSlots, nationPlayers, nationStrength, selectSquad, type Confed } from './national';
import { overall } from './ratings';
import { guessFormation } from './squad';
import { makeAttrs, namePools } from './youth';
import { newPlayer } from './world';

export interface WcGroup { name: string; teams: string[]; table: Record<string, TableRow> }
export interface WcTie { a: string; b: string; fixture: string; winner?: string }
export interface WcRound { name: string; ties: WcTie[] }
export interface WorldCupState {
  year: number;
  size: 32 | 48;
  hosts: string[];
  /** 실제 참가국 · 조를 쓴 대회인지 */
  real: boolean;
  /** 조: teams = 경기용 구단 ID (nt-나라) */
  groups: WcGroup[];
  dates: { squad: string; group: string[]; ko: string[] };
  knockout: WcRound[];
  fixtures: Fixture[];
  /** 대표 선발이 끝났는지 */
  squads?: boolean;
  /** 가상 '국내파' 선수 (시즌이 바뀌면 지움) */
  fillers?: string[];
  winner?: string;
  runnerUp?: string;
  third?: string;
  topScorer?: { player: string; goals: number };
}
export interface WorldCupRecord { year: number; winner: string; runnerUp: string; third?: string; topScorer?: { player: string; name: string; nation: string; goals: number } }
export interface WorldCupMeta { hosts: string[]; groups: Record<string, string[]> }

export const NT = (nation: string) => `nt-${nation}`;
export const isNT = (id: string) => id.startsWith('nt-');
export const nationOfNT = (id: string) => id.slice(3);
/** 이 시즌이 끝나는 해에 월드컵이 열리는지 (2002부터 4년마다) */
export const worldCupYear = (season: string) => { const y = +season.slice(0, 4) + 1; return y >= 2002 && (y - 2002) % 4 === 0 ? y : null; };
const FUTURE_HOSTS: Record<number, string[]> = { 2030: ['ESP', 'POR', 'MAR'], 2034: ['KSA'] };
const QUOTA: Record<32 | 48, Record<Confed, number>> = {
  32: { UEFA: 13, CAF: 5, AFC: 4, CONMEBOL: 4, CONCACAF: 3, OFC: 0 },
  48: { UEFA: 16, CAF: 9, AFC: 8, CONMEBOL: 6, CONCACAF: 6, OFC: 1 },
};
const GROUP_NAMES = 'ABCDEFGHIJKL';
const md = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 전력 + 쿼터로 참가국 정하기 (실제 자료가 없는 대회) */
export function qualifyNations(w: World, size: 32 | 48, hosts: string[]): string[] {
  const strength = new Map(ALL_NATIONS.map((n) => [n, nationStrength(w, n)]));
  const picked = new Set(hosts);
  for (const [conf, n] of Object.entries(QUOTA[size]) as [Confed, number][]) {
    const already = [...picked].filter((x) => confedOf(x) === conf).length;
    ALL_NATIONS.filter((x) => confedOf(x) === conf && !picked.has(x)).sort((a, b) => strength.get(b)! - strength.get(a)!)
      .slice(0, Math.max(0, n - already)).forEach((x) => picked.add(x));
  }
  // 대륙 간 플레이오프 · 남은 자리: 전력 순
  for (const x of ALL_NATIONS.filter((x) => !picked.has(x)).sort((a, b) => strength.get(b)! - strength.get(a)!)) {
    if (picked.size >= size) break;
    picked.add(x);
  }
  return [...picked].slice(0, size);
}

/** 조 추첨: 전력 순 포트, 개최국은 포트 1 (A조부터), 한 조에 같은 연맹은 UEFA 2팀까지 · 나머지 1팀 */
export function drawWorldCup(w: World, nations: string[], hosts: string[], rng: Rng): string[][] {
  const groupsN = nations.length / 4;
  const ordered = [...hosts.filter((h) => nations.includes(h)), ...nations.filter((n) => !hosts.includes(n)).sort((a, b) => nationStrength(w, b) - nationStrength(w, a))];
  const pots = [0, 1, 2, 3].map((i) => ordered.slice(i * groupsN, (i + 1) * groupsN));
  const ok = (g: string[], n: string) => { const c = confedOf(n); const same = g.filter((x) => confedOf(x) === c).length; return c === 'UEFA' ? same < 2 : same < 1; };
  for (let attempt = 0; attempt < 400; attempt++) {
    const groups: string[][] = Array.from({ length: groupsN }, () => []);
    let fail = false;
    pots.forEach((pot, pi) => {
      if (fail) return;
      const order = pi === 0 ? pot : shuffle(pot, rng);   // 포트 1 (개최국 포함)은 순서대로 A조부터
      for (const n of order) {
        const free = groups.map((_, i) => i).filter((i) => groups[i].length === pi && ok(groups[i], n));
        if (!free.length) { fail = true; return; }
        groups[pi === 0 ? free[0] : free[rng.int(0, free.length - 1)]].push(n);
      }
    });
    if (!fail) return groups;
  }
  return Array.from({ length: groupsN }, (_, i) => pots.map((p) => p[i]));
}

/** 시즌 시작: 그 시즌 끝에 월드컵이 열리면 만든다 */
export function createWorldCup(w: World, season: string, meta?: Record<string, WorldCupMeta>): WorldCupState | undefined {
  const year = worldCupYear(season);
  if (!year) return undefined;
  const size: 32 | 48 = year >= 2026 ? 48 : 32;
  const rng = createRng((w.seed ^ hashSeed(`wc:${year}`)) >>> 0);
  const m = meta?.[String(year)];
  let groups: string[][];
  let hosts: string[];
  if (m) {
    hosts = m.hosts;
    groups = Object.keys(m.groups).sort().map((g) => m.groups[g]);
  } else {
    hosts = FUTURE_HOSTS[year] ?? [rng.pick(ALL_NATIONS.filter((n) => confedOf(n) === 'UEFA' || confedOf(n) === 'CONMEBOL').sort((a, b) => nationStrength(w, b) - nationStrength(w, a)).slice(0, 12))];
    groups = drawWorldCup(w, qualifyNations(w, size, hosts), hosts, rng);
  }
  const dates = size === 32
    ? { squad: md(year, 6, 5), group: [md(year, 6, 12), md(year, 6, 16), md(year, 6, 20)], ko: [md(year, 6, 24), md(year, 6, 28), md(year, 7, 2), md(year, 7, 5), md(year, 7, 6)] }
    : { squad: md(year, 6, 4), group: [md(year, 6, 11), md(year, 6, 15), md(year, 6, 19)], ko: [md(year, 6, 23), md(year, 6, 27), md(year, 7, 1), md(year, 7, 5), md(year, 7, 8), md(year, 7, 9)] };
  const wc: WorldCupState = { year, size, hosts, real: !!m, groups: [], dates, knockout: [], fixtures: [] };
  // 4팀 조 3경기: 1차 0-1 · 2-3, 2차 0-2 · 3-1, 3차 3-0 · 1-2
  const MD: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[3, 0], [1, 2]]];
  groups.forEach((nations, gi) => {
    const name = GROUP_NAMES[gi];
    const teams = nations.map(NT);
    wc.groups.push({ name, teams, table: Object.fromEntries(teams.map((t) => [t, emptyRow(t)])) });
    MD.forEach((pairs, d) => pairs.forEach(([h, a], k) => wc.fixtures.push({
      id: `wc-${year}-${name}-${d + 1}-${k}`, league: 'wc', round: d + 1, date: dates.group[d], home: teams[h], away: teams[a], stage: 'intl', group: name, name: `${name}조 ${d + 1}차전`,
    })));
  });
  return wc;
}

/** 대표 선발 · 경기용 구단 만들기 (대회 1주 전) */
function callUpSquads(w: World, wc: WorldCupState, rng: Rng): GameEvent[] {
  const size = wc.size === 48 ? 26 : 23;
  const pools = namePools(w);
  const fillers: string[] = [];
  const mine: string[] = [];
  for (const g of wc.groups) for (const id of g.teams) {
    const nation = nationOfNT(id);
    const squad = selectSquad(w, nation, size);
    const level = fillerLevel(nationPlayers(w, nation).slice(0, 11).map(overall));
    // 모자란 자리는 '국내파' 가상 선수
    missingSlots(squad, size).forEach((pos, i) => {
      const pool = pools.get(nation) ?? [...pools.values()].find((p) => p.last.length > 20)!;
      const f = pool.first.length ? rng.pick(pool.first) : null, l = rng.pick(pool.last);
      const fid = `wcf-${wc.year}-${nation}-${i}`;
      const p = newPlayer({
        id: fid, name: [f?.v, l.v].filter(Boolean).join(' '), birth: `${wc.year - rng.int(22, 31)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`, nation,
        height: null, foot: null, number: null, pos, attrs: makeAttrs(Math.round(level + rng.int(-4, 3)), pos, rng), wage: 0, contract: null,
      }, null, w.seed);
      p.retired = true;           // 이적 · 자유계약 · 시즌 처리에서 빠지게 (대회용 가상 선수)
      p.generated = true;
      p.nameFrom = [f?.id ?? null, l.id];
      w.players[fid] = p;
      fillers.push(fid);
      squad.push(p);
    });
    const ovr = squad.map(overall).sort((a, b) => b - a).slice(0, 11);
    const str = ovr.reduce((a, b) => a + b, 0) / Math.max(1, ovr.length);
    w.clubs[id] = {
      id, league: 'intl', reputation: Math.round(Math.max(50, Math.min(97, 60 + (str - 65) * 1.6))), squad: squad.map((p) => p.id),
      tactics: { formation: guessFormation(squad), mentality: 0, pressing: 1 }, finance: { balance: 0, transferBudget: 0, wageBudget: 0, revenue: 0 }, lineup: null,
    };
    for (const p of squad) { if (p.clubId === w.userClubId) mine.push(p.id); p.fitness = Math.max(p.fitness, 92); }
  }
  wc.squads = true;
  wc.fillers = fillers;
  return [{ type: 'worldcup', date: w.date, year: wc.year, result: 'start', nation: '', players: mine }];
}

/** 경기 결과 (applyMatch 에서): 조별리그 순위표 · 녹아웃 승부차기 */
export function onWorldCupResult(w: World, f: Fixture) {
  const wc = w.worldCup;
  if (!wc) return;
  const s = f.result!;
  if (f.group) { applyResult(wc.groups.find((g) => g.name === f.group)!.table, f.home, f.away, s.homeGoals, s.awayGoals); return; }
  if (s.homeGoals === s.awayGoals) s.pens = shootout(w, f.home, f.away, f.id);
}

const winnerOf = (f: Fixture) => { const s = f.result!; return s.homeGoals > s.awayGoals ? f.home : s.homeGoals < s.awayGoals ? f.away : s.pens === 'away' ? f.away : f.home; };

function addRound(wc: WorldCupState, name: string, pairs: [string, string][], date: string) {
  const r = wc.knockout.length;
  wc.knockout.push({
    name, ties: pairs.map(([a, b], i) => {
      const f: Fixture = { id: `wc-${wc.year}-ko${r}-${i}`, league: 'wc', round: 10 + r, date, home: a, away: b, stage: 'intl', name };
      wc.fixtures.push(f);
      return { a, b, fixture: f.id };
    }),
  });
}

/** 매일: 대표 선발 → 조별리그 마감 → 녹아웃 대진 → 우승 */
export function worldCupDay(w: World): GameEvent[] {
  const wc = w.worldCup;
  if (!wc || wc.winner) return [];
  const ev: GameEvent[] = [];
  const rng = createRng((w.seed ^ hashSeed(`wc-day:${w.date}`)) >>> 0);
  if (!wc.squads) { if (w.date >= wc.dates.squad) ev.push(...callUpSquads(w, wc, rng)); return ev; }
  const fx = new Map(wc.fixtures.map((f) => [f.id, f]));
  if (wc.fixtures.filter((f) => f.group).some((f) => !f.result)) return ev;
  const ko = wc.dates.ko;
  if (!wc.knockout.length) {
    // 조별리그 마감 → 첫 녹아웃
    const ranked = wc.groups.map((g) => sortTable(g.table).map((r) => r.club));
    if (wc.size === 32) {
      const p: [string, string][] = [];
      for (let i = 0; i < 8; i += 2) { p.push([ranked[i][0], ranked[i + 1][1]]); }
      for (let i = 0; i < 8; i += 2) { p.push([ranked[i + 1][0], ranked[i][1]]); }
      addRound(wc, '16강', [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]], ko[0]);
    } else {
      // 48팀: 조 1 · 2위 24팀 + 3위 중 상위 8팀 → 조 순위 · 승점 · 득실 순 시드 1 vs 32
      const row = (g: number, i: number) => wc.groups[g].table[ranked[g][i]];
      const thirds = ranked.map((r, g) => ({ id: r[2], row: row(g, 2) })).sort((a, b) => b.row.pts - a.row.pts || (b.row.gf - b.row.ga) - (a.row.gf - a.row.ga) || b.row.gf - a.row.gf).slice(0, 8);
      const seeds = [0, 1].flatMap((i) => ranked.map((r, g) => ({ id: r[i], row: row(g, i), rank: i })))
        .sort((a, b) => a.rank - b.rank || b.row.pts - a.row.pts || (b.row.gf - b.row.ga) - (a.row.gf - a.row.ga))
        .concat(thirds.map((t) => ({ ...t, rank: 2 })));
      addRound(wc, '32강', Array.from({ length: 16 }, (_, i) => [seeds[i].id, seeds[31 - i].id] as [string, string]), ko[0]);
    }
    return ev;
  }
  const round = wc.knockout.at(-1)!;
  if (round.ties.some((t) => !fx.get(t.fixture)?.result)) return ev;
  for (const t of round.ties) t.winner = winnerOf(fx.get(t.fixture)!);
  if (round.name === '결승') {
    const t = round.ties[0];
    wc.winner = t.winner!;
    wc.runnerUp = t.winner === t.a ? t.b : t.a;
    finishWorldCup(w, wc, ev);
    return ev;
  }
  if (round.name === '3·4위전') return ev;
  const winners = round.ties.map((t) => t.winner!);
  const losers = round.ties.map((t) => (t.winner === t.a ? t.b : t.a));
  const next = (name: string, at: number) => addRound(wc, name, Array.from({ length: winners.length / 2 }, (_, i) => [winners[2 * i], winners[2 * i + 1]] as [string, string]), ko[at]);
  const at = wc.knockout.length;   // 다음 녹아웃 날짜 순번
  if (round.name === '준결승') {
    addRound(wc, '3·4위전', [[losers[0], losers[1]]], ko[at]);
    // 3·4위전 결과는 결승 처리 때 정리
    addRound(wc, '결승', [[winners[0], winners[1]]], ko[at + 1]);
    return ev;
  }
  next(winners.length === 16 ? '16강' : winners.length === 8 ? '8강' : '준결승', at);
  return ev;
}

function finishWorldCup(w: World, wc: WorldCupState, ev: GameEvent[]) {
  const third = wc.knockout.find((r) => r.name === '3·4위전')?.ties[0];
  if (third) { const f = wc.fixtures.find((x) => x.id === third.fixture)!; if (f.result) wc.third = winnerOf(f); }
  // 출전 기록 · 득점왕
  const apps = new Set<string>(), goals = new Map<string, number>();
  for (const f of wc.fixtures) for (const [id] of Object.entries(f.result?.ratings ?? {})) apps.add(id);
  for (const f of wc.fixtures) for (const g of f.result?.goals ?? []) goals.set(g.scorer, (goals.get(g.scorer) ?? 0) + 1);
  const top = [...goals].sort((a, b) => b[1] - a[1])[0];
  if (top) wc.topScorer = { player: top[0], goals: top[1] };
  const reward = (club: string, morale: number, honour: boolean) => {
    for (const id of w.clubs[club]?.squad ?? []) {
      const p = w.players[id];
      if (!p || !apps.has(id)) continue;
      p.morale = Math.min(100, p.morale + morale);
      if (honour) (p.honours ??= []).push({ season: w.season, kind: 'wc', league: 'wc' });
    }
  };
  reward(wc.winner!, 15, true);
  reward(wc.runnerUp!, 5, false);
  (w.worldCupHistory ??= []).push({
    year: wc.year, winner: nationOfNT(wc.winner!), runnerUp: nationOfNT(wc.runnerUp!), ...(wc.third ? { third: nationOfNT(wc.third) } : {}),
    ...(top ? { topScorer: { player: top[0], name: w.players[top[0]]?.ko ?? w.players[top[0]]?.name ?? top[0], nation: w.players[top[0]]?.nation ?? '', goals: top[1] } } : {}),
  });
  const mine = (w.clubs[wc.winner!]?.squad ?? []).filter((id) => w.players[id]?.clubId === w.userClubId && apps.has(id));
  ev.push({ type: 'worldcup', date: w.date, year: wc.year, result: 'champion', nation: nationOfNT(wc.winner!), players: mine, text: top ? `득점왕 ${w.players[top[0]]?.ko ?? w.players[top[0]]?.name ?? top[0]} ${top[1]}골` : undefined, scorer: top?.[0] });
}

/** 시즌이 바뀔 때: 경기용 대표팀 구단 · 가상 선수 지우기 (대회 기록은 worldCupHistory 에 남음) */
export function clearWorldCup(w: World) {
  for (const id of Object.keys(w.clubs)) if (isNT(id)) delete w.clubs[id];
  for (const id of w.worldCup?.fillers ?? []) delete w.players[id];
  w.worldCup = undefined;
}

/** 이 선수가 이번 월드컵 대표인지 */
export const inWorldCupSquad = (w: World, p: PlayerState) => !!w.worldCup?.squads && w.worldCup.groups.some((g) => g.teams.some((t) => w.clubs[t]?.squad.includes(p.id)));
