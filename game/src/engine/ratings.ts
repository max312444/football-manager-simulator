// 능력치 계산: 경기에 쓰는 능력치 = 실제 기준선 + 육성 보정 + (호칭) + 컨디션 보정
import type { AttrKey, Position } from '../data/types';
import type { PlayerState } from './types';
import { traitAttr } from './traits';

export const attr = (p: PlayerState, k: AttrKey): number => (p.base[k] ?? 50) + (p.growth[k] ?? 0) + traitAttr(p, k) + (p.boost ? p.boost.amount : 0);

// 포지션별 종합 능력 가중치
const OVR_W: Record<string, Partial<Record<AttrKey, number>>> = {
  GK: { ref: 3, one: 2, han: 2, pos: 1.5, aer: 1, com: 1, pas: 0.5 },
  CB: { tac: 3, pos: 3, aer: 2, str: 1.5, pac: 1, com: 1, pas: 0.7 },
  FB: { tac: 2, pac: 2, sta: 1.5, pos: 1.5, pas: 1.2, dri: 1, str: 0.5 },
  DM: { tac: 2.5, pos: 2, pas: 2, sta: 1.2, str: 1, com: 1, vis: 0.8 },
  CM: { pas: 2.5, vis: 2, sta: 1.2, com: 1.2, dri: 1, tac: 1, sho: 0.6 },
  AM: { pas: 2, vis: 2, dri: 2, sho: 1.5, com: 1.2, pac: 0.6 },
  WM: { pas: 2, sta: 2, pac: 1.8, dri: 1.5, vis: 1.2, tac: 1, sho: 0.8 },
  W: { dri: 2.5, pac: 2.5, sho: 1.3, pas: 1.3, vis: 1, com: 0.6 },
  ST: { sho: 3, com: 2, pos: 1.2, dri: 1.2, pac: 1.2, str: 1, aer: 1 },
};
const ROLE: Record<Position, keyof typeof OVR_W> = {
  GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB',
  DM: 'DM', CM: 'CM', AM: 'AM', LM: 'WM', RM: 'WM', LW: 'W', RW: 'W', ST: 'ST',
};

/** 특정 포지션에서의 종합 능력 (선수 본래 포지션과 무관하게 계산) */
export function ratingAt(p: PlayerState, slot: Position): number {
  const w = OVR_W[ROLE[slot]];
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(w)) { s += attr(p, k as AttrKey) * v!; t += v!; }
  // 필드 플레이어가 GK 자리에 서거나 그 반대면 사실상 못 뛴다
  if ((slot === 'GK') !== (p.pos === 'GK')) return (s / t) * 0.35;
  return s / t;
}

// 포지션 친숙도 (0~1)
const NEAR: [Position, Position, number][] = [
  ['RB', 'RWB', 0.95], ['LB', 'LWB', 0.95], ['RB', 'LB', 0.85], ['RWB', 'LWB', 0.85],
  ['RB', 'CB', 0.8], ['LB', 'CB', 0.8], ['CB', 'DM', 0.8], ['DM', 'CM', 0.92], ['CM', 'AM', 0.9],
  ['AM', 'LW', 0.82], ['AM', 'RW', 0.82], ['LW', 'RW', 0.9], ['LW', 'ST', 0.8], ['RW', 'ST', 0.8],
  ['AM', 'ST', 0.8], ['RWB', 'RW', 0.8], ['LWB', 'LW', 0.8], ['RB', 'RW', 0.7], ['LB', 'LW', 0.7],
  ['CM', 'RW', 0.72], ['CM', 'LW', 0.72],
  ['RM', 'RW', 0.9], ['LM', 'LW', 0.9], ['RM', 'LM', 0.85], ['RM', 'CM', 0.8], ['LM', 'CM', 0.8],
  ['RM', 'RB', 0.7], ['LM', 'LB', 0.7], ['RM', 'RWB', 0.82], ['LM', 'LWB', 0.82], ['RM', 'AM', 0.75], ['LM', 'AM', 0.75],
];
const FAM = new Map<string, number>();
for (const [a, b, v] of NEAR) { FAM.set(a + b, v); FAM.set(b + a, v); }
export function familiarity(natural: Position, slot: Position): number {
  if (natural === slot) return 1;
  if (natural === 'GK' || slot === 'GK') return 0.1;
  return FAM.get(natural + slot) ?? 0.6;
}

/** 자리 적합 능력 = 그 자리 능력 × (0.7 + 0.3 × 친숙도) */
export function slotRating(p: PlayerState, slot: Position): number {
  return ratingAt(p, slot) * (0.7 + 0.3 * familiarity(p.pos, slot));
}

/** 본래 포지션 종합 능력 */
export const overall = (p: PlayerState) => Math.round(ratingAt(p, p.pos));

// ── 컨디션 보정 ─────────────────────────────
export const formAvg = (p: PlayerState) =>
  p.recentRatings.length ? p.recentRatings.reduce((a, b) => a + b, 0) / p.recentRatings.length : 6.6;

/** 경기 시작 전 보정 배율 (당일 컨디션은 match.ts에서 따로 뽑는다) */
export function preMatchFactor(p: PlayerState): number {
  const form = Math.max(-0.05, Math.min(0.05, (formAvg(p) - 6.6) * 0.04));
  const morale = ((p.morale - 50) / 50) * 0.05;
  const sharp = -Math.max(0, 70 - p.sharpness) * 0.0015;   // 감각 70 미만부터 최대 -10%
  return 1 + form + morale + sharp;
}

/** 체력에 따른 배율 (경기 중): 60 미만부터 떨어짐 */
export const fitnessFactor = (fitness: number) => (fitness >= 60 ? 1 : 1 - (60 - fitness) * 0.006);
