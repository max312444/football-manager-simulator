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

/** 뛸 수 있는 선수 (부상 · 징계 · 출전 거부 태업이면 불가) */
export const available = (p: PlayerState) => !p.injury && p.suspension === 0 && (p.saga?.stage ?? 0) < 3;

export interface Lineup {
  formation: string;
  /** 선발: 자리(slot) 순서대로 */
  starters: { id: string; slot: Position }[];
  bench: string[];
}

// 자리 채우는 순서: 대체 선수가 귀한 자리부터
const FILL_ORDER: Position[] = ['GK', 'ST', 'CB', 'DM', 'AM', 'LB', 'RB', 'LWB', 'RWB', 'LW', 'RW', 'LM', 'RM', 'CM'];

/**
 * AI 자동 선발. 자리별로 (자리 적합 능력 × 체력 보정)이 가장 높은 선수를 고른다.
 * 체력이 낮은 선수는 자연스럽게 로테이션된다.
 * fixed: 사용자가 정한 자리별 선수(없거나 못 뛰면 자동으로 채움), fixedBench: 정한 후보
 */
export function pickLineup(players: PlayerState[], formation: string, benchSize: number, fixed?: (string | null)[], fixedBench?: string[]): Lineup {
  const slots = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];
  const pool = players.filter(available);
  const used = new Set<string>();
  const score = (p: PlayerState, slot: Position) => slotRating(p, slot) * (p.fitness >= 85 ? 1 : 0.6 + 0.4 * (p.fitness / 85) ** 2);

  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => FILL_ORDER.indexOf(a.s) - FILL_ORDER.indexOf(b.s));
  const starters: { id: string; slot: Position }[] = new Array(slots.length);
  if (fixed) slots.forEach((s, i) => {
    const id = fixed[i];
    if (id && !used.has(id) && pool.some((p) => p.id === id)) { used.add(id); starters[i] = { id, slot: s }; }
  });
  for (const { s, i } of order) {
    if (starters[i]) continue;
    let best: PlayerState | null = null, bs = -1;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const v = score(p, s);
      if (v > bs) { bs = v; best = p; }
    }
    if (best) { used.add(best.id); starters[i] = { id: best.id, slot: s }; }
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
