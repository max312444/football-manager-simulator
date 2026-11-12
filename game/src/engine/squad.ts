// 포메이션과 선발·후보 자동 선택
import type { Position } from '../data/types';
import type { PlayerState } from './types';
import { slotRating } from './ratings';

export const FORMATIONS: Record<string, Position[]> = {
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '4-4-1-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'AM', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'RW', 'AM', 'LW', 'ST'],
  '4-1-4-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'RM', 'CM', 'CM', 'LM', 'ST'],
  '4-5-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'DM', 'CM', 'LM', 'ST'],
  '4-3-1-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'AM', 'ST', 'ST'],
  '4-1-2-1-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'AM', 'ST', 'ST'],
  '4-2-2-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'AM', 'AM', 'ST', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RWB', 'CM', 'DM', 'CM', 'LWB', 'ST', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'LWB', 'RW', 'ST', 'LW'],
  '3-4-2-1': ['GK', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'LWB', 'AM', 'AM', 'ST'],
  '3-4-1-2': ['GK', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'LWB', 'AM', 'ST', 'ST'],
  '5-3-2': ['GK', 'RWB', 'CB', 'CB', 'CB', 'LWB', 'CM', 'CM', 'CM', 'ST', 'ST'],
  '5-4-1': ['GK', 'RWB', 'CB', 'CB', 'CB', 'LWB', 'RM', 'CM', 'CM', 'LM', 'ST'],
};
export const DEFAULT_FORMATION = '4-4-2';

// ── 사용자 포메이션 (내 구단 전용, 세이브에 저장 w.customFormations) ──
//  이름 앞에 ★ 를 붙여 기본 포메이션과 구분. 게임을 불러올 때 FORMATIONS 에 끼워 넣는다 (AI 는 기본 포메이션만 씀)
export const CUSTOM_MARK = '★';
export const MAX_CUSTOM = 6;
export const isCustom = (f: string) => f.startsWith(CUSTOM_MARK);
export function registerFormations(custom?: Record<string, Position[]>) {
  for (const k of Object.keys(FORMATIONS)) if (isCustom(k)) delete FORMATIONS[k];
  for (const [k, v] of Object.entries(custom ?? {})) if (isCustom(k) && !validateFormation(v).length) FORMATIONS[k] = v;
}

/** 필드 선수가 고를 수 있는 자리 */
export const OUTFIELD: Position[] = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST'];

/**
 * 사용자 포메이션 검사: 말이 안 되는 구성이면 이유 목록 (빈 배열이면 통과)
 *  실제 축구에서 쓰는 범위 — 수비 3~5명 · 센터백 2~3명 · 한쪽 측면에 같은 줄 2명 금지 · 중앙 미드 1명 이상 · 공격수 1~3명
 */
export function validateFormation(slots: Position[]): string[] {
  const n = (ps: Position[]) => slots.filter((x) => ps.includes(x)).length;
  const out: string[] = [];
  if (slots.length !== 11) out.push('11명이어야 합니다');
  if (slots[0] !== 'GK' || n(['GK']) !== 1) out.push('골키퍼는 1명');
  const cb = n(['CB']), back = n(['CB', 'LB', 'RB', 'LWB', 'RWB']);
  if (cb < 2 || cb > 3) out.push(`센터백은 2~3명 (지금 ${cb}명)`);
  if (back < 3 || back > 5) out.push(`수비(센터백 · 풀백 · 윙백)는 3~5명 (지금 ${back}명)`);
  if (n(['LB', 'LWB']) > 1) out.push('왼쪽 풀백 · 윙백은 1명까지');
  if (n(['RB', 'RWB']) > 1) out.push('오른쪽 풀백 · 윙백은 1명까지');
  if (cb === 2 && (n(['LB', 'LWB']) < 1 || n(['RB', 'RWB']) < 1)) out.push('센터백 2명이면 양쪽 풀백(또는 윙백)이 필요합니다');
  if (n(['LM', 'LW']) > 1) out.push('왼쪽 미드필더 · 윙어는 1명까지');
  if (n(['RM', 'RW']) > 1) out.push('오른쪽 미드필더 · 윙어는 1명까지');
  if (n(['DM', 'CM']) < 1) out.push('중앙 미드필더(DM · CM)는 1명 이상');
  if (n(['DM']) > 2) out.push('수비형 미드필더는 2명까지');
  if (n(['CM']) > 3) out.push('중앙 미드필더(CM)는 3명까지');
  if (n(['AM']) > 3) out.push('공격형 미드필더는 3명까지');
  if (n(['DM', 'CM', 'AM']) > 5) out.push('중앙 미드필더는 모두 합쳐 5명까지');
  const st = n(['ST']);
  if (st < 1 || st > 3) out.push(`스트라이커는 1~3명 (지금 ${st}명)`);
  if (n(['ST', 'LW', 'RW', 'AM']) > 5) out.push('공격 자원(ST · 윙어 · AM)은 5명까지');
  return out;
}

/** 모양 이름 (수비-미드-공격형-공격, 예: 4-2-3-1) */
export function formationShape(slots: Position[]): string {
  const n = (ps: Position[]) => slots.filter((x) => ps.includes(x)).length;
  // 3백(풀백 없음)에서 윙백은: 같은 쪽에 측면 미드가 없고, 중앙 미드가 2명 이하거나 윙어가 있으면 미드필더 줄 (3-4-3 · 3-4-2-1), 아니면 수비 줄 (5-3-2 · 5-4-1)
  const wbMid = n(['CB']) === 3 && n(['LB', 'RB']) === 0 && n(['LM', 'RM']) === 0 && (n(['DM', 'CM']) <= 2 || n(['LW', 'RW']) > 0);
  const d = n(['CB', 'LB', 'RB']) + (wbMid ? 0 : n(['LWB', 'RWB']));
  const m = n(['DM', 'CM', 'LM', 'RM']) + (wbMid ? n(['LWB', 'RWB']) : 0);
  // 공격형 미드가 있으면 윙어는 그 줄로 센다 (4-2-3-1)
  const am = n(['AM']) ? n(['AM', 'LW', 'RW']) : 0, f = n(['AM']) ? n(['ST']) : n(['ST', 'LW', 'RW']);
  return [d, m, am, f].filter((x, i) => x > 0 || i === 0).join('-');
}

// ── 포메이션 숙련도 ──
//  경기를 치른 포메이션 +5 (100까지), 나머지는 경기마다 −1 (30까지). 처음엔 원래 포메이션 75 · 다른 포메이션 50 · 내가 만든 포메이션 30
//  경기에서 전력 배율 0.94 + 0.06 × 숙련도/100 (모든 구단 같은 규칙)
export function famOf(c: { tactics: { formation: string }; formFam?: Record<string, number> }, f: string): number {
  return c.formFam?.[f] ?? (isCustom(f) ? 30 : f === c.tactics.formation ? 75 : 50);
}
export function trainFamiliarity(c: { tactics: { formation: string }; formFam?: Record<string, number> }, used: string) {
  const fam = (c.formFam ??= {});
  const now = famOf(c, used);
  for (const k of Object.keys(fam)) if (k !== used) fam[k] = Math.max(30, fam[k] - 1);
  fam[used] = Math.min(100, now + 5);
}
export const famMult = (fam: number) => 0.94 + 0.06 * (fam / 100);

/** 뛸 수 있는 선수 (부상 · 징계 · 출전 거부 태업이면 불가) */
export const available = (p: PlayerState) => !p.injury && p.suspension === 0 && (p.saga?.stage ?? 0) < 3;

export interface Lineup {
  formation: string;
  /** 선발: 자리(slot) 순서대로 */
  starters: { id: string; slot: Position }[];
  bench: string[];
}

// 자리 채우는 순서: 대체 선수가 귀한 자리부터
export const FILL_ORDER: Position[] = ['GK', 'ST', 'CB', 'DM', 'AM', 'LB', 'RB', 'LWB', 'RWB', 'LW', 'RW', 'LM', 'RM', 'CM'];

/**
 * AI 자동 선발. 자리별로 (자리 적합 능력 × 체력 보정)이 가장 높은 선수를 고른다.
 * 체력이 낮은 선수는 자연스럽게 로테이션된다.
 * fixed: 사용자가 정한 자리별 선수(없거나 못 뛰면 자동으로 채움), fixedBench: 정한 후보
 */
export function pickLineup(players: PlayerState[], formation: string, benchSize: number, fixed?: (string | null)[], fixedBench?: string[]): Lineup {
  const slots = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];
  const pool = players.filter(available);
  const used = new Set<string>();
  // 주 포지션 선수 우선: 보조 · 다른 자리는 3% 낮게 (비슷하면 자기 자리 선수, 확실히 나으면 그대로 기용)
  const score = (p: PlayerState, slot: Position) => slotRating(p, slot) * (slot === p.pos ? 1 : 0.97) * (p.fitness >= 85 ? 1 : 0.6 + 0.4 * (p.fitness / 85) ** 2);

  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => FILL_ORDER.indexOf(a.s) - FILL_ORDER.indexOf(b.s));
  const starters: { id: string; slot: Position }[] = new Array(slots.length);
  if (fixed) slots.forEach((s, i) => {
    const id = fixed[i];
    if (id && !used.has(id) && pool.some((p) => p.id === id)) { used.add(id); starters[i] = { id, slot: s }; }
  });
  for (const { s, i } of order) {
    if (starters[i]) continue;
    // 가장 나은 선수 · 그 자리가 주 포지션인 선수 중 가장 나은 선수. 주 포지션 선수가 7% 이내면 그 선수
    // (예: 파비뉴(DM)를 CB에, 아놀드(RB)를 DM에 돌려 막지 않고 각자 자리에)
    let best: PlayerState | null = null, bs = -1, own: PlayerState | null = null, os = -1;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const v = score(p, s);
      if (v > bs) { bs = v; best = p; }
      if (p.pos === s && v > os) { os = v; own = p; }
    }
    const pick = own && os >= bs * 0.93 ? own : best;
    if (pick) { used.add(pick.id); starters[i] = { id: pick.id, slot: s }; }
  }

  // 후보: 골키퍼 1명 + 나머지는 능력순 (포지션이 겹치지 않게 조금 분산)
  const rest = pool.filter((p) => !used.has(p.id));
  const bench: string[] = [];
  for (const id of fixedBench ?? []) if (bench.length < benchSize && rest.some((p) => p.id === id)) bench.push(id);
  const gk = rest.filter((p) => p.pos === 'GK').sort((a, b) => slotRating(b, 'GK') - slotRating(a, 'GK'))[0];
  if (gk && !bench.some((id) => players.find((p) => p.id === id)?.pos === 'GK') && bench.length < benchSize) bench.push(gk.id);
  const outfield = rest.filter((p) => p.pos !== 'GK').sort((a, b) => slotRating(b, b.pos) - slotRating(a, a.pos));
  const groupCount: Record<string, number> = {};
  const group = (p: PlayerState) => (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.pos) ? 'D' : ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.pos) ? 'M' : 'F');
  for (const p of outfield) {
    if (bench.length >= benchSize) break;
    if (bench.includes(p.id)) continue;
    const g = group(p);
    if ((groupCount[g] ?? 0) >= Math.ceil(benchSize / 3) + 1) continue;
    groupCount[g] = (groupCount[g] ?? 0) + 1;
    bench.push(p.id);
  }
  for (const p of outfield) { if (bench.length >= benchSize) break; if (!bench.includes(p.id)) bench.push(p.id); }

  return { formation: FORMATIONS[formation] ? formation : DEFAULT_FORMATION, starters: starters.filter(Boolean), bench };
}

/** 시즌별 규정: 후보 인원·교체 가능 수 (대략적인 시대 반영) */
export function matchRules(season: string) {
  const y = +season.slice(0, 4);
  return { benchSize: y >= 2022 ? 9 : y >= 2008 ? 7 : 5, maxSubs: y >= 2020 ? 5 : 3 };
}

/** 선수단에 맞는 포메이션 추정 (데이터에 포메이션이 없을 때) */
export function guessFormation(players: PlayerState[]): string {
  const c = (ps: Position[]) => players.filter((p) => ps.includes(p.pos)).length;
  if (c(['LWB', 'RWB']) >= 3) return '3-5-2';
  if (c(['LW', 'RW']) >= 3 && c(['DM']) >= 1) return '4-3-3';
  if (c(['AM']) >= 2) return '4-2-3-1';
  return '4-4-2';
}
