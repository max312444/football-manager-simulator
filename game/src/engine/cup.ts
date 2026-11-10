// 국내 컵 대회: 나라별 1 · 2부 구단이 모두 나오는 단판 녹아웃 (FA컵 · 코파 델 레이 등을 단순화)
//  - 참가: 게임에서 경기하는 그 나라 1부 + 2부 구단 (2부가 없으면 1부만)
//  - 대진: 참가 수가 2의 거듭제곱이 아니면 예비 라운드. 하위 시드(2부 · 명성 낮은 순)부터 예비 라운드, 상위 시드는 부전승
//  - 매 라운드 무작위 추첨. 리그가 다르면 하위 리그 구단이 홈, 결승은 먼저 뽑힌 구단이 홈 (중립 경기장 단순화)
//  - 일정: 주중(수요일), 그 나라 리그 경기 앞뒤 하루는 피한다. 다음 라운드는 앞 라운드가 끝나면 추첨
//  - 비기면 바로 승부차기 (연장전 없음)
//  - 상금: 라운드를 이길 때마다 (결승 우승이 가장 큼, 앞 라운드로 갈수록 절반씩), 나라 · 시대 보정
//  - 컵 경기 기록은 리그 기록(stats)과 따로 (cupStats). 경고 누적은 리그만
import type { Fixture, GameEvent, PlayerState, World } from './types';
import { createRng, hashSeed, type Rng } from './rng';
import { levelOf, PAIRS } from './pyramid';
import { book, ECONOMY } from './finance';
import { addFans, fansOf, type Award } from './awards';
import { money } from '../ui/format';

export interface CupTie { home: string; away: string; fixture: string; winner?: string }
export interface CupRound { name: string; date: string; ties: CupTie[]; /** 이 라운드를 쉬고 다음 라운드로 가는 구단 */ byes: string[] }
export interface Cup {
  id: string;
  nation: string;
  season: string;
  entrants: string[];
  /** 라운드별 예정일 (추첨 전 라운드 포함) */
  dates: string[];
  rounds: CupRound[];
  fixtures: Fixture[];
  winner?: string;
  runnerUp?: string;
}
export interface CupRecord { season: string; cup: string; winner: string; runnerUp: string }

export const cupIdOf = (nation: string) => `${nation.toLowerCase()}-cup`;
export const isCup = (id: string) => id.endsWith('-cup');

/** 결승 우승 상금 (2024년 기준 유로). 앞 라운드는 한 단계마다 절반 */
const FINAL_PRIZE: Record<string, number> = { ENG: 2.3e6, GER: 4.3e6, ESP: 1.5e6, ITA: 1.8e6, FRA: 1.2e6 };
/** 시대 보정: 1년 전마다 약 6% 적게 */
/** 시대 보정 × 게임 경제 규모 (finance.ts ECONOMY) */
const eraFactor = (season: string) => ECONOMY * Math.min(1.3, 1.06 ** (+season.slice(0, 4) - 2024));
export function roundPrize(cup: Cup, roundIdx: number) {
  const fromEnd = cup.dates.length - 1 - roundIdx;
  return Math.round((FINAL_PRIZE[cup.nation] ?? 1e6) * eraFactor(cup.season) * 0.5 ** fromEnd / 1000) * 1000;
}

/** 남은 구단 수로 라운드 이름 */
export function roundName(teams: number, prelim: boolean) {
  if (prelim) return '예비 라운드';
  return teams === 2 ? '결승' : teams === 4 ? '준결승' : `${teams}강`;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000));

/** 라운드 날짜: 9월 중순 ~ 5월 20일의 수요일 중 리그 경기 앞뒤 하루가 아닌 날을 고르게 */
export function cupDates(season: string, rounds: number, leagueDates: Set<string>): string[] {
  const y = +season.slice(0, 4);
  const start = new Date(Date.UTC(y, 8, 15));
  start.setUTCDate(start.getUTCDate() + ((3 - start.getUTCDay() + 7) % 7));   // 첫 수요일
  const end = season === '2019-20' ? `${y + 1}-07-20` : `${y + 1}-05-20`;
  const free: string[] = [];
  for (let d = iso(start); d <= end; d = addDays(d, 7)) {
    if (![-1, 0, 1].some((k) => leagueDates.has(addDays(d, k)))) free.push(d);
  }
  const pool = free.length >= rounds ? free : Array.from({ length: Math.max(rounds, 1) }, (_, i) => addDays(iso(start), 14 * i));
  if (rounds === 1) return [pool.at(-1)!];
  return Array.from({ length: rounds }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (rounds - 1))]);
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 시드 순서: 상위 리그 → 명성 높은 순 */
function seedOrder(w: World, ids: string[]) {
  return [...ids].sort((a, b) => levelOf(w.clubs[a].league) - levelOf(w.clubs[b].league) || w.clubs[b].reputation - w.clubs[a].reputation || a.localeCompare(b));
}

/** 한 라운드 추첨 → 일정에 넣기 */
function drawRound(w: World, cup: Cup, teams: string[], byes: string[], rng: Rng) {
  const r = cup.rounds.length;
  const final = cup.dates.length - 1 === r;
  const pool = shuffle(teams, rng);
  const name = roundName(teams.length + byes.length, byes.length > 0);
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) {
    let [home, away] = [pool[i], pool[i + 1]];
    if (!final && levelOf(w.clubs[away].league) > levelOf(w.clubs[home].league)) [home, away] = [away, home];
    const f: Fixture = { id: `${cup.id}-${cup.season}-${r + 1}-${i / 2}`, league: cup.id, round: r + 1, date: cup.dates[r], home, away, stage: 'cup', name };
    cup.fixtures.push(f);
    ties.push({ home, away, fixture: f.id });
  }
  cup.rounds.push({ name, date: cup.dates[r], ties, byes });
}

/** 시즌 시작: 나라별 컵 대회 만들기 (그 나라 1부가 게임에 있을 때) */
export function createCups(w: World, rng: Rng): Record<string, Cup> {
  const cups: Record<string, Cup> = {};
  for (const [nation, [top, second]] of Object.entries(PAIRS)) {
    const T = w.competitions[top];
    if (!T) continue;
    const S = w.competitions[second];
    const entrants = seedOrder(w, [...Object.keys(T.table), ...(S ? Object.keys(S.table) : [])].filter((id) => w.clubs[id]));
    if (entrants.length < 4) continue;
    const n = entrants.length;
    const p = 2 ** Math.floor(Math.log2(n));
    const prelim = n > p;
    const rounds = Math.log2(p) + (prelim ? 1 : 0);
    // 리그 경기 · 유럽 대회 예정일 (앞뒤 하루를 피한다)
    const euroDays = Object.values(w.europe ?? {}).flatMap((e) => [...e.dates.group, ...e.dates.qf, ...e.dates.sf, e.dates.final]);
    const leagueDates = new Set([...[T, S].flatMap((c) => c?.fixtures.map((f) => f.date) ?? []), ...euroDays]);
    const cup: Cup = { id: cupIdOf(nation), nation, season: T.season, entrants, dates: cupDates(T.season, rounds, leagueDates), rounds: [], fixtures: [] };
    if (prelim) {
      const k = 2 * (n - p);   // 예비 라운드에 나오는 하위 시드 수
      drawRound(w, cup, entrants.slice(n - k), entrants.slice(0, n - k), rng);
    } else drawRound(w, cup, entrants, [], rng);
    cups[cup.id] = cup;
  }
  return cups;
}

/** 승부차기: 명성 차이로 조금 기운 동전 (같은 경기면 항상 같은 결과) */
export function shootout(w: World, home: string, away: string, key: string): 'home' | 'away' {
  const r = createRng((w.seed ^ hashSeed(key)) >>> 0);
  const rh = w.clubs[home]?.reputation ?? 50, ra = w.clubs[away]?.reputation ?? 50;
  return r.chance(Math.max(0.35, Math.min(0.65, 0.5 + (rh - ra) / 100))) ? 'home' : 'away';
}

/**
 * 매일 (경기 후): 끝난 라운드의 승자를 정하고 상금을 준 뒤 다음 라운드를 추첨한다. 결승이 끝나면 우승 처리.
 * 돌려주는 값: 컵 소식 (라운드 통과 · 탈락 · 우승)
 */
export function cupDay(w: World): GameEvent[] {
  const notes: GameEvent[] = [];
  if (!w.cups) return notes;
  const ev = (cup: Cup, club: string, round: string, result: 'through' | 'out' | 'champion', prize?: number): GameEvent =>
    ({ type: 'cup', date: w.date, cup: cup.id, club, round, result, ...(prize ? { prize } : {}) });
  for (const cup of Object.values(w.cups)) {
    if (cup.winner) continue;
    const r = cup.rounds.length - 1;
    const round = cup.rounds[r];
    const fx = new Map(cup.fixtures.map((f) => [f.id, f]));
    if (round.ties.some((t) => !fx.get(t.fixture)?.result)) continue;
    for (const t of round.ties) {
      const s = fx.get(t.fixture)!.result!;
      t.winner = s.homeGoals > s.awayGoals ? t.home : s.homeGoals < s.awayGoals ? t.away : s.pens === 'away' ? t.away : t.home;
      const prize = roundPrize(cup, r);
      book(w, t.winner, 'prize', prize);
      const loser = t.winner === t.home ? t.away : t.home;
      if (round.ties.length > 1 || round.byes.length) {
        notes.push(ev(cup, t.winner, round.name, 'through', prize));
        notes.push(ev(cup, loser, round.name, 'out'));
      }
    }
    const winners = round.ties.map((t) => t.winner!);
    if (round.ties.length === 1 && !round.byes.length) {
      const t = round.ties[0];
      cup.winner = t.winner!;
      cup.runnerUp = t.winner === t.home ? t.away : t.home;
      (w.cupHistory ??= []).push({ season: cup.season, cup: cup.id, winner: cup.winner, runnerUp: cup.runnerUp });
      cupWinnerRewards(w, cup);
      notes.push(ev(cup, cup.winner, round.name, 'champion', roundPrize(cup, r)));
      notes.push(ev(cup, cup.runnerUp, round.name, 'out'));
      continue;
    }
    const rng = createRng((w.seed ^ hashSeed(`${cup.id}-${cup.season}-${r + 1}`)) >>> 0);
    if (cup.dates[r + 1] <= w.date) cup.dates[r + 1] = addDays(w.date, 3);
    drawRound(w, cup, [...round.byes, ...winners], [], rng);
  }
  return notes;
}

const cupApps = (p: PlayerState) => p.cupStats?.apps ?? 0;

/** 컵 우승: 팬 증가 · 우승 멤버 사기 · 충성도 · 수상 경력. 내 구단이면 시즌 말 수상 연출에 넣는다 */
function cupWinnerRewards(w: World, cup: Cup) {
  const club = cup.winner!;
  const final = cup.fixtures.find((f) => f.id === cup.rounds.at(-1)!.ties[0].fixture)!;
  const s = final.result!;
  const [g, o] = final.home === club ? [s.homeGoals, s.awayGoals] : [s.awayGoals, s.homeGoals];
  const award: Award = { kind: 'cup', season: cup.season, league: cup.id, club, value: `결승 ${g}-${o}${s.pens ? ' (승부차기)' : ''}`, rewards: [] };
  const before = fansOf(w, club);
  addFans(w, club, 1.04);
  award.rewards.push(`팬 +${Math.round((fansOf(w, club) - before) / 1000).toLocaleString()}천 명`, `상금 합계 ${money(cup.rounds.reduce((sum, _, i) => sum + roundPrize(cup, i), 0))}`);
  for (const id of w.clubs[club].squad) {
    const p = w.players[id];
    if (cupApps(p) < 1) continue;
    p.morale = Math.min(100, p.morale + 8);
    p.loyalty = Math.min(100, p.loyalty + 3);
    (p.honours ??= []).push({ season: cup.season, kind: 'cup', league: cup.id });
  }
  award.rewards.push('우승 멤버 사기 · 충성도 상승');
  if (club === w.userClubId) (w.cupAwards ??= []).push(award);
}

/** 이 구단이 컵에서 어디까지 갔는지 (화면용) */
export function cupProgress(cup: Cup, club: string): string | null {
  if (!cup.entrants.includes(club)) return null;
  if (cup.winner === club) return '우승';
  if (cup.runnerUp === club) return '준우승';
  for (const r of cup.rounds) {
    const t = r.ties.find((x) => x.home === club || x.away === club);
    if (!t) continue;
    if (!t.winner) return `${r.name} 진출`;
    if (t.winner !== club) return `${r.name} 탈락`;
  }
  const last = cup.rounds.at(-1);
  return last?.byes.includes(club) ? `${roundName(last.ties.length + last.byes.length, false)} 진출` : '진행 중';
}
