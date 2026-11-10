// 이사회 관계 · 예산 분배 · 요청 승인률
//  - 관계 (0~100): 신뢰도 (성적) 와 따로. 요청 결과 · 우승 · (나중에) 갈등 이벤트 · 언론에 따라 오르내린다
//  - 예산 분배: 새 시즌 이적 · 주급 예산을 관계에 따라 ±15%
//  - 승인률: 추가 이적 예산 · 추가 주급 예산 · 시설 증축 요청에 찬성할 확률 (관계 · 성적 · 재정 · 요구 크기 · 최근 거절)
import type { GameEvent, World } from './types';
import type { Rng } from './rng';
import { ensureManager } from './manager';
import { clubRevenue } from './finance';
import { upgradeCost, startUpgrade, FACILITY_KO, type FacilityKind } from './facilities';

export type BoardAsk = { kind: 'transfer'; amount: number } | { kind: 'wage'; amount: number } | { kind: 'facility'; facility: FacilityKind };
export const ASK_KO = { transfer: '추가 이적 예산', wage: '추가 주급 예산', facility: '시설 증축' } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** 이사회 관계 (옛 세이브는 55) */
export const relationOf = (w: World) => ensureManager(w).relation ?? 55;
export const relationLabel = (v: number) => (v >= 80 ? '매우 좋음' : v >= 60 ? '좋음' : v >= 40 ? '보통' : v >= 25 ? '나쁨' : '최악');
export function addRelation(w: World, d: number) { const m = ensureManager(w); m.relation = clamp((m.relation ?? 55) + d, 0, 100); }

/** 새 시즌 예산에 곱할 배율 (관계 0 → 0.85 · 50 → 1 · 100 → 1.15) */
export const budgetFactor = (w: World) => 1 + ((relationOf(w) - 50) / 50) * 0.15;

/** 요구 크기 (구단 연 매출 대비) */
function askSize(w: World, a: BoardAsk): number {
  const rev = clubRevenue(w, w.userClubId);
  if (a.kind === 'transfer') return a.amount / rev;
  if (a.kind === 'wage') return (a.amount * 52) / rev;
  return (upgradeCost(w, w.userClubId, a.facility)?.cost ?? 0) / rev;
}

/** 이사회 찬성 확률 (0~1) */
export function approvalChance(w: World, a: BoardAsk): number {
  const m = ensureManager(w);
  const c = w.clubs[w.userClubId];
  const rev = clubRevenue(w, c.id);
  const rel = relationOf(w);
  let p = a.kind === 'facility' ? 0.6 : a.kind === 'transfer' ? 0.5 : 0.45;
  p += ((rel - 50) / 50) * 0.3;                         // 관계
  p += ((m.confidence - 50) / 50) * 0.15;               // 성적
  p += clamp(c.finance.balance / rev, -0.5, 0.6) * 0.3;  // 재정 (잔고가 매출의 60% 이상이면 최대)
  p -= askSize(w, a) * (a.kind === 'facility' ? 1.2 : 2.2);   // 요구가 클수록
  const recent = (m.denials ?? []).filter((d) => daysBetween(d, w.date) < 90).length;
  p -= recent * 0.12;                                   // 최근 거절이 잦으면
  if (c.finance.balance < 0) p -= 0.25;
  return clamp(Math.round(p * 100) / 100, 0.03, 0.97);
}

/** 같은 종류 요청은 30일에 한 번 */
export function askCooldown(w: World, kind: BoardAsk['kind']): string | null {
  const last = ensureManager(w).lastAsk?.[kind];
  if (!last) return null;
  const left = 30 - Math.floor(daysBetween(last, w.date));
  return left > 0 ? `${left}일 뒤에 다시 요청할 수 있습니다` : null;
}

/** 이사회에 요청 → 확률로 찬성 · 반대. 찬성하면 바로 반영, 반대하면 관계가 조금 떨어진다 */
export function askBoard(w: World, a: BoardAsk, rng: Rng): { ok: boolean; chance: number; text: string; events: GameEvent[] } {
  const m = ensureManager(w);
  const cd = askCooldown(w, a.kind);
  if (cd) return { ok: false, chance: 0, text: cd, events: [] };
  if (a.kind === 'facility') {
    const u = upgradeCost(w, w.userClubId, a.facility);
    if (!u) return { ok: false, chance: 0, text: '이미 최고 단계입니다', events: [] };
    if (w.clubs[w.userClubId].finance.balance < u.cost) return { ok: false, chance: 0, text: '구단 잔고가 모자랍니다', events: [] };
  }
  const chance = approvalChance(w, a);
  m.lastAsk = { ...(m.lastAsk ?? {}), [a.kind]: w.date };
  const yes = rng.chance(chance);
  const c = w.clubs[w.userClubId];
  const what = a.kind === 'facility' ? `${FACILITY_KO[a.facility]} 증축` : ASK_KO[a.kind];
  if (!yes) {
    m.denials = [...(m.denials ?? []).filter((d) => daysBetween(d, w.date) < 180), w.date];
    addRelation(w, -4);
    const text = `이사회가 ${what} 요청에 반대했습니다 (찬성 ${Math.round(chance * 100)}%)`;
    return { ok: false, chance, text, events: [{ type: 'info', date: w.date, text }] };
  }
  if (a.kind === 'transfer') c.finance.transferBudget += a.amount;
  else if (a.kind === 'wage') c.finance.wageBudget += a.amount;
  else startUpgrade(w, c.id, a.facility);
  addRelation(w, -1);   // 들어줬지만 부담
  const text = `이사회가 ${what} 요청을 승인했습니다 (찬성 ${Math.round(chance * 100)}%)`;
  return { ok: true, chance, text, events: [{ type: 'info', date: w.date, text }] };
}

/** 매달 1일: 성적 신뢰도가 높으면 관계가 조금 좋아지고, 낮으면 나빠진다 */
export function boardMonth(w: World) {
  if (w.date.slice(8) !== '01') return;
  const m = ensureManager(w);
  if (m.confidence >= 70) addRelation(w, 1);
  else if (m.confidence < 30) addRelation(w, -1);
}

/** 새 시즌: 관계에 따라 이적 · 주급 예산 조정 (내 구단) */
export function applyBudgetFactor(w: World): GameEvent[] {
  const f = budgetFactor(w);
  if (Math.abs(f - 1) < 0.01) return [];
  const c = w.clubs[w.userClubId];
  c.finance.transferBudget = Math.round(c.finance.transferBudget * f);
  c.finance.wageBudget = Math.round(c.finance.wageBudget * f);
  const pct = Math.round((f - 1) * 100);
  return [{ type: 'info', date: w.date, text: `이사회 관계 ${relationLabel(relationOf(w))} · 새 시즌 예산 ${pct > 0 ? '+' : ''}${pct}%` }];
}
