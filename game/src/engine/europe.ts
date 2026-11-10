// 유럽 대회: 챔피언스리그(ucl) · 유로파리그(uel) — 게임에 있는 5개 나라 구단만으로 만든 16팀 축소판
//  - 출전권: 지난 시즌 1부 최종 순위 (게임 순위. 첫 시즌은 실제 지난 시즌 순위 → 없으면 명성 순)
//    챔피언스리그 ENG 4 · ESP 4 · ITA 3 · GER 3 · FRA 2, 유로파리그는 그다음 순위 ENG 3 · ESP 3 · ITA 4 · GER 3 · FRA 3
//    국내 컵 우승팀이 아직 출전권이 없으면 그 나라 유로파리그 마지막 자리를 가져간다. 빠진 나라가 있으면 명성 순으로 채움
//  - 조별리그: 4개 조 × 4팀 (명성 순 포트 1~4, 같은 나라는 같은 조에 넣지 않음), 홈 · 원정 6경기, 조 1 · 2위 진출
//  - 8강: 조 1위 vs 다른 조 2위, 4강: 자유 추첨 (2경기 합산, 원정 다득점 없음, 동점이면 2차전 뒤 승부차기), 결승 단판
//  - 일정: 챔피언스리그 화요일 · 유로파리그 목요일 (리그 경기 앞뒤 하루는 피함). 결승은 리그가 끝난 뒤
//  - 상금: 참가 · 조별리그 승 · 무 · 라운드 진출 · 우승 (2024년 기준, 시대 보정)
import type { Fixture, GameEvent, TableRow, World } from './types';
import { createRng, hashSeed, type Rng } from './rng';
import { applyResult, emptyRow, sortTable } from './standings';
import { nationOf, PAIRS } from './pyramid';
import { book, ECONOMY } from './finance';
import { addFans, fansOf, type Award } from './awards';
import { shootout } from './cup';
import { money } from '../ui/format';

export type EuroId = 'ucl' | 'uel';
export const EURO_IDS: EuroId[] = ['ucl', 'uel'];
export const isEuro = (id: string): id is EuroId => id === 'ucl' || id === 'uel';

export interface EuroGroup { name: string; teams: string[]; table: Record<string, TableRow> }
export interface EuroTie { a: string; b: string; legs: string[]; winner?: string; agg?: [number, number]; pens?: boolean }
export interface EuroRound { name: string; ties: EuroTie[] }
export interface EuroComp {
  id: EuroId;
  season: string;
  entrants: string[];
  groups: EuroGroup[];
  dates: { group: string[]; qf: string[]; sf: string[]; final: string };
  /** 8강 · 준결승 · 결승 (진행되며 추가) */
  knockout: EuroRound[];
  fixtures: Fixture[];
  paid?: boolean;
  winner?: string;
  runnerUp?: string;
}

const SLOTS: Record<EuroId, Record<string, number>> = {
  ucl: { ENG: 4, ESP: 4, ITA: 3, GER: 3, FRA: 2 },
  uel: { ENG: 3, ESP: 3, ITA: 4, GER: 3, FRA: 3 },
};
const SIZE = 16;

/** 상금 (2024년 기준 유로) */
const PRIZE: Record<EuroId, { entry: number; win: number; draw: number; qf: number; sf: number; final: number; champion: number }> = {
  ucl: { entry: 18.6e6, win: 2.1e6, draw: 0.7e6, qf: 11e6, sf: 12.5e6, final: 15.5e6, champion: 6.5e6 },
  uel: { entry: 4.3e6, win: 0.45e6, draw: 0.15e6, qf: 1.8e6, sf: 2.8e6, final: 4.6e6, champion: 6e6 },
};
const eraFactor = (season: string) => ECONOMY * Math.min(1.3, 1.07 ** (+season.slice(0, 4) - 2024));
export const euroPrize = (c: EuroComp, k: keyof (typeof PRIZE)['ucl']) => Math.round((PRIZE[c.id][k] * eraFactor(c.season)) / 1000) * 1000;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000));
const dow = (s: string) => new Date(s + 'T00:00:00Z').getUTCDay();

/** 기간 안의 요일 중 리그 경기 앞뒤 하루가 아닌 날을 n개 고르게 */
function pickDates(from: string, to: string, weekday: number, n: number, busy: Set<string>): string[] {
  let d = from;
  while (dow(d) !== weekday) d = addDays(d, 1);
  const all: string[] = [];
  for (; d <= to; d = addDays(d, 7)) all.push(d);
  const free = all.filter((x) => ![-1, 0, 1].some((k) => busy.has(addDays(x, k))));
  const pool = free.length >= n ? free : all;
  if (n === 1) return [pool[0]];
  return Array.from({ length: n }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (n - 1))]);
}

export function euroDates(id: EuroId, season: string, busy: Set<string>): EuroComp['dates'] {
  const y = +season.slice(0, 4);
  const wd = id === 'ucl' ? 2 : 4;
  const last = [...busy].filter((d) => d < `${y + 1}-08-31`).sort().at(-1) ?? `${y + 1}-05-25`;
  const fin = id === 'ucl' ? addDays(last, 7 + ((6 - dow(addDays(last, 7)) + 7) % 7)) : addDays(last, 4);
  return {
    group: pickDates(`${y}-09-14`, `${y}-12-14`, wd, 6, busy),
    qf: pickDates(`${y + 1}-03-01`, `${y + 1}-04-14`, wd, 2, busy),
    sf: pickDates(`${y + 1}-04-21`, `${y + 1}-05-16`, wd, 2, busy),
    final: fin,
  };
}

/** 나라별 1부 순위: 지난 시즌 게임 순위 → 실제 지난 시즌 순위 → 명성 순. 지금 경기하는 리그에 있는 구단만 */
function nationOrder(w: World, top: string, real?: string[]): string[] {
  const playing = (id: string) => !!w.clubs[id] && !!w.competitions[w.clubs[id].league];
  const prev = w.history.filter((h) => h.league === top).at(-1);
  const base = prev ? prev.table.map((r) => r.club) : real ?? [];
  const order = base.filter(playing);
  const rest = Object.values(w.clubs).filter((c) => c.league === top && !order.includes(c.id)).sort((a, b) => b.reputation - a.reputation).map((c) => c.id);
  return [...order, ...rest];
}

/** 출전 구단 정하기 */
export function qualify(w: World, realStandings: Record<string, string[]> = {}): Record<EuroId, string[]> {
  const out: Record<EuroId, string[]> = { ucl: [], uel: [] };
  const used = new Set<string>();
  const orders: Record<string, string[]> = {};
  for (const [nation, [top]] of Object.entries(PAIRS)) if (w.competitions[top]) orders[nation] = nationOrder(w, top, realStandings[top]);
  const prevSeason = w.history.at(-1)?.season;
  for (const id of EURO_IDS) {
    for (const [nation, order] of Object.entries(orders)) {
      const picks = order.filter((c) => !used.has(c)).slice(0, SLOTS[id][nation] ?? 0);
      // 국내 컵 우승팀: 출전권이 없으면 유로파리그 마지막 자리
      if (id === 'uel') {
        const cw = (w.cupHistory ?? []).find((h) => h.season === prevSeason && nationOf(w.clubs[h.winner]?.league ?? '') === nation)?.winner;
        if (cw && !used.has(cw) && !picks.includes(cw) && w.clubs[cw] && w.competitions[w.clubs[cw].league]) { picks.pop(); picks.push(cw); }
      }
      for (const c of picks) { used.add(c); out[id].push(c); }
    }
    // 모자라면 남은 구단 중 명성 순
    const extra = Object.values(orders).flat().filter((c) => !used.has(c)).sort((a, b) => w.clubs[b].reputation - w.clubs[a].reputation);
    while (out[id].length < SIZE && extra.length) { const c = extra.shift()!; used.add(c); out[id].push(c); }
  }
  return out;
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 조 추첨: 명성 순 포트 4개, 같은 나라는 같은 조에 넣지 않음 (안 되면 다시, 끝내 안 되면 제한 없이) */
export function drawGroups(w: World, teams: string[], rng: Rng): string[][] {
  const seeded = [...teams].sort((a, b) => w.clubs[b].reputation - w.clubs[a].reputation);
  const pots = [0, 1, 2, 3].map((p) => seeded.slice(p * 4, p * 4 + 4));
  const nat = (c: string) => nationOf(w.clubs[c].league);
  for (let attempt = 0; attempt < 300; attempt++) {
    const groups: string[][] = [[], [], [], []];
    let ok = true;
    for (const pot of pots) {
      const order = shuffle(pot, rng);
      const free = [0, 1, 2, 3];
      // 남은 조 중 같은 나라가 없는 곳에 (선택지가 적은 팀부터)
      const fits = (c: string) => free.filter((g) => !groups[g].some((x) => nat(x) === nat(c)));
      order.sort((a, b) => fits(a).length - fits(b).length);
      for (const c of order) {
        const f = fits(c);
        if (!f.length) { ok = false; break; }
        const g = f[rng.int(0, f.length - 1)];
        groups[g].push(c);
        free.splice(free.indexOf(g), 1);
      }
      if (!ok) break;
    }
    if (ok) return groups;
  }
  return [0, 1, 2, 3].map((g) => pots.map((p) => p[g]));
}

// 4팀 조 6경기 (홈 · 원정 한 번씩)
const MD: [number, number][][] = [[[0, 1], [2, 3]], [[3, 0], [1, 2]], [[0, 2], [3, 1]], [[2, 0], [1, 3]], [[1, 0], [3, 2]], [[0, 3], [2, 1]]];
const GROUP_NAMES = ['A', 'B', 'C', 'D'];

/** 시즌 시작: 유럽 대회 만들기. busy = 리그 경기 날짜 */
export function createEurope(w: World, rng: Rng, realStandings: Record<string, string[]> = {}): Record<string, EuroComp> {
  // 나라가 3개 미만이면 만들지 않는다 (한 나라 구단끼리의 유럽 대회 방지)
  if (Object.values(PAIRS).filter(([top]) => w.competitions[top]).length < 3) return {};
  const q = qualify(w, realStandings);
  const busy = new Set(Object.values(w.competitions).flatMap((c) => c.fixtures.map((f) => f.date)));
  const out: Record<string, EuroComp> = {};
  for (const id of EURO_IDS) {
    if (q[id].length < SIZE) continue;
    const season = Object.values(w.competitions)[0]?.season ?? w.season;
    const comp: EuroComp = { id, season, entrants: q[id], groups: [], dates: euroDates(id, season, busy), knockout: [], fixtures: [] };
    drawGroups(w, q[id], rng).forEach((teams, gi) => {
      const name = GROUP_NAMES[gi];
      comp.groups.push({ name, teams, table: Object.fromEntries(teams.map((t) => [t, emptyRow(t)])) });
      MD.forEach((pairs, md) => pairs.forEach(([h, a], k) => comp.fixtures.push({
        id: `${id}-${season}-${name}-${md + 1}-${k}`, league: id, round: md + 1, date: comp.dates.group[md],
        home: teams[h], away: teams[a], stage: 'euro', group: name, name: `${name}조 ${md + 1}차전`,
      })));
    });
    out[id] = comp;
  }
  return out;
}

/** 유럽 대회 경기 결과 (applyMatch 에서): 조 순위표 · 승무 상금 · 녹아웃 승부차기 */
export function onEuroResult(w: World, f: Fixture) {
  const c = w.europe?.[f.league];
  const s = f.result!;
  if (!c) return;
  if (f.group) {
    const g = c.groups.find((x) => x.name === f.group)!;
    applyResult(g.table, f.home, f.away, s.homeGoals, s.awayGoals);
    if (s.homeGoals === s.awayGoals) { book(w, f.home, 'prize', euroPrize(c, 'draw')); book(w, f.away, 'prize', euroPrize(c, 'draw')); }
    else book(w, s.homeGoals > s.awayGoals ? f.home : f.away, 'prize', euroPrize(c, 'win'));
    return;
  }
  // 녹아웃: 단판(결승)이거나 2차전에서 합산 동점이면 승부차기
  const tie = c.knockout.flatMap((r) => r.ties).find((t) => t.legs.includes(f.id));
  if (!tie || f.id !== tie.legs.at(-1)) return;
  const [a, b] = aggregate(c, tie, f);
  if (a === b) {
    const pens = shootout(w, f.home, f.away, f.id);
    s.pens = pens;
  }
}

function aggregate(c: EuroComp, t: EuroTie, last?: Fixture): [number, number] {
  let a = 0, b = 0;
  for (const id of t.legs) {
    const f = id === last?.id ? last : c.fixtures.find((x) => x.id === id);
    const r = f?.result;
    if (!f || !r) continue;
    if (f.home === t.a) { a += r.homeGoals; b += r.awayGoals; } else { a += r.awayGoals; b += r.homeGoals; }
  }
  return [a, b];
}

/** 대결 만들기: 2경기면 1차전은 b 홈, 2차전은 a 홈 */
function makeTie(c: EuroComp, round: string, a: string, b: string, dates: string[], idx: number): EuroTie {
  const legs = dates.map((date, i) => {
    const two = dates.length === 2;
    const home = two ? (i === 0 ? b : a) : a;
    const away = home === a ? b : a;
    const f: Fixture = {
      id: `${c.id}-${c.season}-ko-${round}-${idx}-${i + 1}`, league: c.id, round: 10 + c.knockout.length, date, home, away,
      stage: 'euro', name: two ? `${round} ${i + 1}차전` : round, ...(two ? { leg: i + 1 } : {}),
    };
    c.fixtures.push(f);
    return f.id;
  });
  return { a, b, legs };
}

/**
 * 매일 (경기 후): 참가 상금 · 조별리그 마감 · 8강 / 4강 / 결승 추첨 · 우승
 */
export function euroDay(w: World): GameEvent[] {
  const ev: GameEvent[] = [];
  if (!w.europe) return ev;
  for (const c of Object.values(w.europe)) {
    if (c.winner) continue;
    const note = (club: string, round: string, result: 'through' | 'out' | 'champion', prize?: number) =>
      ev.push({ type: 'cup', date: w.date, cup: c.id, club, round, result, ...(prize ? { prize } : {}) });
    if (!c.paid && w.date >= c.dates.group[0]) {
      c.paid = true;
      for (const t of c.entrants) book(w, t, 'prize', euroPrize(c, 'entry'));
    }
    const groupFx = c.fixtures.filter((f) => f.group);
    if (groupFx.some((f) => !f.result)) continue;
    const rng = createRng((w.seed ^ hashSeed(`${c.id}-${c.season}-${c.knockout.length}`)) >>> 0);

    if (!c.knockout.length) {
      // 조별리그 마감 → 8강 추첨 (조 1위 vs 다른 조 2위)
      const firsts: string[] = [], seconds: string[] = [];
      for (const g of c.groups) {
        const order = sortTable(g.table).map((r) => r.club);
        firsts.push(order[0]); seconds.push(order[1]);
        for (const x of order.slice(0, 2)) note(x, '조별리그', 'through');
        for (const x of order.slice(2)) note(x, '조별리그', 'out');
      }
      let pairs: [string, string][] = [];
      for (let k = 0; k < 100; k++) {
        const sh = shuffle([0, 1, 2, 3], rng);
        if (sh.every((j, i) => j !== i)) { pairs = firsts.map((f, i) => [f, seconds[sh[i]]]); break; }
      }
      if (!pairs.length) pairs = firsts.map((f, i) => [f, seconds[(i + 1) % 4]]);
      c.knockout.push({ name: '8강', ties: pairs.map(([a, b], i) => makeTie(c, '8강', a, b, c.dates.qf, i)) });
      for (const t of [...firsts, ...seconds]) book(w, t, 'prize', euroPrize(c, 'qf'));
      continue;
    }
    const round = c.knockout.at(-1)!;
    if (round.ties.some((t) => t.legs.some((id) => !c.fixtures.find((f) => f.id === id)?.result))) continue;
    for (const t of round.ties) {
      if (t.winner) continue;
      const [a, b] = aggregate(c, t);
      t.agg = [a, b];
      if (a !== b) t.winner = a > b ? t.a : t.b;
      else {
        const last = c.fixtures.find((f) => f.id === t.legs.at(-1))!;
        t.winner = last.result!.pens === 'away' ? last.away : last.home;
        t.pens = true;
      }
    }
    const winners = round.ties.map((t) => t.winner!);
    if (round.name === '결승') {
      const t = round.ties[0];
      c.winner = t.winner!;
      c.runnerUp = t.winner === t.a ? t.b : t.a;
      book(w, c.winner, 'prize', euroPrize(c, 'champion'));
      (w.cupHistory ??= []).push({ season: c.season, cup: c.id, winner: c.winner, runnerUp: c.runnerUp });
      winnerRewards(w, c);
      note(c.winner, '결승', 'champion', euroPrize(c, 'champion'));
      note(c.runnerUp, '결승', 'out');
      continue;
    }
    for (const t of round.ties) note(t.winner === t.a ? t.b : t.a, round.name, 'out');
    if (round.name === '8강') {
      const sh = shuffle(winners, rng);
      const dates = c.dates.sf.map((d) => (d <= w.date ? addDays(w.date, 3) : d));
      c.knockout.push({ name: '준결승', ties: [makeTie(c, '준결승', sh[0], sh[1], dates, 0), makeTie(c, '준결승', sh[2], sh[3], dates, 1)] });
      for (const x of winners) { book(w, x, 'prize', euroPrize(c, 'sf')); note(x, '8강', 'through', euroPrize(c, 'sf')); }
    } else {
      const sh = shuffle(winners, rng);
      const date = c.dates.final <= w.date ? addDays(w.date, 4) : c.dates.final;
      c.knockout.push({ name: '결승', ties: [makeTie(c, '결승', sh[0], sh[1], [date], 0)] });
      for (const x of winners) { book(w, x, 'prize', euroPrize(c, 'final')); note(x, '준결승', 'through', euroPrize(c, 'final')); }
    }
  }
  return ev;
}

function winnerRewards(w: World, c: EuroComp) {
  const club = c.winner!;
  const final = c.fixtures.find((f) => f.id === c.knockout.at(-1)!.ties[0].legs[0])!;
  const s = final.result!;
  const [g, o] = final.home === club ? [s.homeGoals, s.awayGoals] : [s.awayGoals, s.homeGoals];
  const award: Award = { kind: 'euro', season: c.season, league: c.id, club, value: `결승 ${g}-${o}${s.pens ? ' (승부차기)' : ''}`, rewards: [] };
  const before = fansOf(w, club);
  addFans(w, club, c.id === 'ucl' ? 1.08 : 1.04);
  award.rewards.push(`팬 +${Math.round((fansOf(w, club) - before) / 1000).toLocaleString()}천 명`, `우승 상금 ${money(euroPrize(c, 'champion'))}`);
  for (const id of w.clubs[club].squad) {
    const p = w.players[id];
    if ((p.cupStats?.apps ?? 0) < 1) continue;
    p.morale = Math.min(100, p.morale + 12);
    p.loyalty = Math.min(100, p.loyalty + 5);
    (p.honours ??= []).push({ season: c.season, kind: 'euro', league: c.id });
  }
  award.rewards.push('우승 멤버 사기 · 충성도 상승');
  if (club === w.userClubId) (w.cupAwards ??= []).push(award);
}

/** 이 구단이 유럽 대회에서 어디까지 갔는지 */
export function euroProgress(c: EuroComp, club: string): string | null {
  if (!c.entrants.includes(club)) return null;
  if (c.winner === club) return '우승';
  if (c.runnerUp === club) return '준우승';
  for (const r of c.knockout) {
    const t = r.ties.find((x) => x.a === club || x.b === club);
    if (!t) return '조별리그 탈락';
    if (t.winner && t.winner !== club) return `${r.name} 탈락`;
    if (!t.winner) return `${r.name} 진출`;
  }
  return '조별리그';
}
