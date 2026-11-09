// 리그 피라미드: 1부 · 2부 승강 규칙과 승격 플레이오프 · 승강 플레이오프
//  - 규칙은 나라와 시대별 (시즌 시작 연도 기준). 실제 다음 시즌 데이터가 있으면 리그 크기는 데이터에 맞춘다 (season.ts)
//  - 플레이오프 경기는 정규 시즌이 끝나면 자동으로 일정이 잡힌다 (경기 결과는 순위표에 넣지 않음)
//    · semis: 3~6위 준결승 2경기 합산 → 결승 1경기 (잉글랜드 · 스페인 · 이탈리아)
//    · ladder: 5위 vs 4위 → 승자 vs 3위 (프랑스)
//    · barrage: 1부 강등권 바로 위 팀 vs 2부 도전 팀, 2경기 합산 (독일 · 프랑스)
//  - 비기면 (단판 · 합산 동점) 승부차기: 명성이 높은 쪽이 조금 유리
import type { Fixture, World } from './types';
import { sortTable } from './standings';
import { createRng } from './rng';

export interface PairRule {
  top: string;
  second: string;
  /** 1부에서 바로 강등 */
  topDown: number;
  /** 2부에서 바로 승격 */
  up: number;
  /** 승격 플레이오프 (2부 순위) */
  playoff: null | { kind: 'semis' | 'ladder'; seeds: number[] };
  /** 승강 플레이오프: 1부 (바로 강등 바로 위) vs 2부 (플레이오프 승자, 없으면 up+1 위) */
  barrage: boolean;
  /** 2부에서 아래(게임에 없는 3부)로 강등 */
  secondDown: number;
}

export const PAIRS: Record<string, [string, string]> = { ENG: ['eng1', 'eng2'], ESP: ['esp1', 'esp2'], ITA: ['ita1', 'ita2'], GER: ['ger1', 'ger2'], FRA: ['fra1', 'fra2'] };
export const nationOf = (league: string) => Object.keys(PAIRS).find((n) => PAIRS[n].includes(league)) ?? null;
export const pairOf = (league: string) => { const n = nationOf(league); return n ? PAIRS[n] : null; };
export const levelOf = (league: string) => (/2$/.test(league) ? 2 : /-lower$/.test(league) ? 3 : 1);
/** 2부에서 떨어진 구단이 머무는 곳 (게임에서 경기는 하지 않음) */
export const poolOf = (second: string) => `${second}-lower`;

/** 시즌(시작 연도)별 승강 규칙 */
export function pairRule(nation: string, season: string): PairRule {
  const y = +season.slice(0, 4);
  const [top, second] = PAIRS[nation];
  const semis = { kind: 'semis' as const, seeds: [3, 4, 5, 6] };
  switch (nation) {
    case 'ENG': return { top, second, topDown: 3, up: 2, playoff: semis, barrage: false, secondDown: 3 };
    case 'ESP': return y >= 2010 ? { top, second, topDown: 3, up: 2, playoff: semis, barrage: false, secondDown: 4 }
      : { top, second, topDown: 3, up: 3, playoff: null, barrage: false, secondDown: 4 };
    case 'ITA': return y >= 2006 ? { top, second, topDown: 3, up: 2, playoff: semis, barrage: false, secondDown: 3 }
      : { top, second, topDown: 3, up: 3, playoff: null, barrage: false, secondDown: 4 };
    case 'GER': return y >= 2008 ? { top, second, topDown: 2, up: 2, playoff: null, barrage: true, secondDown: 2 }
      : { top, second, topDown: 3, up: 3, playoff: null, barrage: false, secondDown: 4 };
    default: return y >= 2017 ? { top, second, topDown: 2, up: 2, playoff: { kind: 'ladder', seeds: [5, 4, 3] }, barrage: true, secondDown: 2 }
      : { top, second, topDown: 3, up: 3, playoff: null, barrage: false, secondDown: 3 };
  }
}

/** 플레이오프 한 대결 (단판 또는 2경기 합산) */
export interface Tie {
  kind: 'semi' | 'final' | 'ladder' | 'barrage';
  /** 상위 시드 (2경기면 2차전 홈, 단판이면 홈) */
  a: string;
  b: string;
  legs: string[];
  winner?: string;
  pens?: boolean;
  agg?: [number, number];
}
export interface PlayoffState {
  ties: Tie[];
  /** 승격 플레이오프 승자 (승강 플레이오프가 있으면 거기로 간다) */
  winner?: string;
  /** 승강 플레이오프 결과 */
  barrage?: { top: string; challenger: string; winner: string };
  done?: boolean;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const regular = (fs: Fixture[]) => fs.filter((f) => !f.stage);
const regularDone = (fs: Fixture[]) => regular(fs).every((f) => f.result);
const lastDate = (fs: Fixture[]) => fs.reduce((m, f) => (f.date > m ? f.date : m), '');

/**
 * 매일 (경기 후): 2부 리그 플레이오프 진행. 정규 시즌이 끝났으면 대진을 만들고, 대결이 끝나면 다음 단계로.
 * 플레이오프 경기는 2부 리그 일정(fixtures)에 stage 를 붙여 넣는다 → 모든 경기가 끝나야 시즌 종료.
 */
export function playoffDay(w: World) {
  for (const [nation, [top, second]] of Object.entries(PAIRS)) {
    const T = w.competitions[top], S = w.competitions[second];
    if (!T || !S) continue;
    const rule = pairRule(nation, S.season);
    if (!rule.playoff && !rule.barrage) continue;
    if (!regularDone(S.fixtures)) continue;
    const st = (S.playoff ??= { ties: [] });
    if (st.done) continue;
    const today = w.date;
    const base = () => { const d = lastDate(S.fixtures); return d > today ? d : today; };
    const order = sortTable(S.table).map((r) => r.club);
    const seed = (pos: number) => order[pos - 1];
    const mk = (kind: Tie['kind'], a: string, b: string, dates: string[]) => {
      // 2경기면 1차전은 하위 시드 홈
      const legs = dates.map((d, i) => {
        const home = dates.length === 2 ? (i === 0 ? b : a) : a;
        const away = home === a ? b : a;
        const f: Fixture = { id: `${second}-${S.season}-po-${kind}-${a}-${b}-${i + 1}`, league: second, round: 100 + st.ties.length, date: d, home, away, stage: kind, leg: dates.length === 2 ? i + 1 : undefined };
        S.fixtures.push(f);
        return f.id;
      });
      st.ties.push({ kind, a, b, legs });
    };
    // 끝난 대결 정리
    for (const t of st.ties) if (!t.winner) resolveTie(w, S.fixtures, t);
    const open = st.ties.filter((t) => !t.winner);
    if (open.length) continue;

    const of = (k: Tie['kind']) => st.ties.filter((t) => t.kind === k);
    // 1) 승격 플레이오프
    if (rule.playoff && st.winner === undefined) {
      const d = base();
      if (rule.playoff.kind === 'semis') {
        if (!of('semi').length) { const [s3, s4, s5, s6] = rule.playoff.seeds.map(seed); mk('semi', s3, s6, [addDays(d, 4), addDays(d, 8)]); mk('semi', s4, s5, [addDays(d, 4), addDays(d, 8)]); continue; }
        if (!of('final').length) { const [x, y] = of('semi').map((t) => t.winner!); const [a, b] = order.indexOf(x) < order.indexOf(y) ? [x, y] : [y, x]; mk('final', a, b, [addDays(d, 7)]); continue; }
        st.winner = of('final')[0].winner;
      } else {
        const seeds = rule.playoff.seeds.map(seed);   // [5위, 4위, 3위]
        const lad = of('ladder');
        if (lad.length < seeds.length - 1) {
          const challenger = lad.length ? lad.at(-1)!.winner! : seeds[0];
          mk('ladder', seeds[lad.length + 1], challenger, [addDays(d, 4)]);
          continue;
        }
        st.winner = lad.at(-1)!.winner;
      }
    }
    // 2) 승강 플레이오프 (1부 정규 시즌도 끝나야)
    if (rule.barrage && !st.barrage) {
      if (!regularDone(T.fixtures)) continue;
      const topOrder = sortTable(T.table).map((r) => r.club);
      const topClub = topOrder[topOrder.length - rule.topDown - 1];
      const challenger = st.winner ?? seed(rule.up + 1);
      const b = of('barrage');
      if (!b.length) { const d = [base(), lastDate(T.fixtures)].sort().at(-1)!; mk('barrage', topClub, challenger, [addDays(d, 4), addDays(d, 8)]); continue; }
      st.barrage = { top: topClub, challenger, winner: b[0].winner! };
    }
    st.done = true;
  }
}

/** 대결 결과: 모든 경기가 끝났으면 승자 결정 (합산 · 승부차기) */
function resolveTie(w: World, fs: Fixture[], t: Tie) {
  const games = t.legs.map((id) => fs.find((f) => f.id === id)!);
  if (games.some((f) => !f.result)) return;
  let a = 0, b = 0;
  for (const f of games) {
    const [hg, ag] = [f.result!.homeGoals, f.result!.awayGoals];
    if (f.home === t.a) { a += hg; b += ag; } else { a += ag; b += hg; }
  }
  t.agg = [a, b];
  if (a !== b) { t.winner = a > b ? t.a : t.b; return; }
  // 승부차기: 명성 차이로 조금 기운 동전 던지기 (같은 대결이면 항상 같은 결과)
  const r = createRng((w.seed ^ [...t.legs.at(-1)!].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) >>> 0);
  const ra = w.clubs[t.a]?.reputation ?? 50, rb = w.clubs[t.b]?.reputation ?? 50;
  const pa = Math.max(0.35, Math.min(0.65, 0.5 + (ra - rb) / 100));
  t.winner = r.chance(pa) ? t.a : t.b;
  t.pens = true;
  const last = games.at(-1)!;
  last.result!.pens = t.winner === last.home ? 'home' : 'away';
}

/** 화면 표시용 순위 구간: 승격 · 플레이오프 · 승강 PO · 강등 */
export type Zone = 'champion' | 'up' | 'playoff' | 'barrage' | 'down' | null;
export function zoneOf(league: string, season: string, pos: number, size: number): Zone {
  const n = nationOf(league);
  if (!n) return pos === 1 ? 'champion' : null;
  const r = pairRule(n, season);
  if (league === r.top) {
    if (pos === 1) return 'champion';
    if (pos > size - r.topDown) return 'down';
    if (r.barrage && pos === size - r.topDown) return 'barrage';
    return null;
  }
  if (pos <= r.up) return 'up';
  if (r.playoff?.seeds.includes(pos)) return 'playoff';
  if (r.barrage && !r.playoff && pos === r.up + 1) return 'barrage';
  if (pos > size - r.secondDown) return 'down';
  return null;
}
