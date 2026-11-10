// 재정: 모든 구단(AI 포함)의 수입 · 지출 흐름, 내 구단 시즌 장부, 시즌마다 예산 배정
//
// 원칙: 모든 구단은 적게라도 수입이 있고, 그 수입 안에서 선수를 영입한다 — AI든 사용자든 같은 규칙
//  - 연 매출 기준값(revenue): 데이터의 finance.revenue (실제 매출 공개 자료가 있으면 그 기준, 없으면 자체 추정 모델).
//    없으면(옛 데이터) 주급 예산 × 52 ÷ 0.62 로 추정
//  - 수입: 중계권 40% (8월~5월 10회) · 스폰서 25% (매월) · 입장 20% (홈 경기마다) · 상금 (리그 순위 · 컵 · 유럽)
//  - 지출: 주급 (매주 월요일) · 운영비 14% (매월) · 훈련비 (훈련할 때마다, 강도에 따라 연 4~16%)
//  - 내 구단만 항목별 장부를 남긴다 (AI 구단은 잔고만 바뀜)
import type { ClubState, World } from './types';
import { fanFactor } from './awards';

export type IncomeKind = 'tv' | 'gate' | 'commercial' | 'prize' | 'sales';
export type ExpenseKind = 'wages' | 'operations' | 'training' | 'purchases';
export const INCOME_LABEL: Record<IncomeKind, string> = { tv: '중계권', gate: '경기장 수입', commercial: '스폰서 · 상품', prize: '상금 (리그 · 컵 · 유럽)', sales: '선수 판매' };
export const EXPENSE_LABEL: Record<ExpenseKind, string> = { wages: '선수 주급', operations: '운영비', training: '훈련비', purchases: '선수 영입' };

/** 매출 대비 비율 */
export const SHARE = { tv: 0.4, commercial: 0.25, gate: 0.2, prize: 0.15, operations: 0.14 } as const;
/** 훈련비: 훈련할 때마다 (매달 1일, 8~5월 10회) 매출 대비 — 강도 낮음 · 보통 · 높음 (연 4% · 8% · 16%) */
export const TRAINING_COST = [0.004, 0.008, 0.016] as const;
/** 주급이 매출에서 차지하는 비율 (주급 예산의 기준) */
export const WAGE_RATIO = 0.62;
/** 상금 규모 배율: 구단 매출 · 주급이 실제 규모(데이터 economy 단계, Money League 기준)라 컵 · 유럽 상금도 실제 금액 그대로 (1) */
export const ECONOMY = 1;

export interface SeasonLedger {
  season: string;
  income: Record<IncomeKind, number>;
  expense: Record<ExpenseKind, number>;
  /** 연 매출 기준값 (시즌 시작 때 고정) */
  base: number;
  /** 주마다 잔고 기록 (추이 그래프용) */
  balances: { date: string; balance: number }[];
}
export interface Ledger { current: SeasonLedger; past: (Omit<SeasonLedger, 'balances'> & { endBalance: number })[] }

const emptyLedger = (season: string, balance: number, date: string, base: number): SeasonLedger => ({
  season, base,
  income: { tv: 0, gate: 0, commercial: 0, prize: 0, sales: 0 },
  expense: { wages: 0, operations: 0, training: 0, purchases: 0 },
  balances: [{ date, balance }],
});

export function ledgerOf(w: World): Ledger {
  const c = w.clubs[w.userClubId];
  c.ledger ??= { current: emptyLedger(w.season, c.finance.balance, w.date, clubRevenue(w, c.id)), past: [] };
  return c.ledger;
}
export const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** 돈의 움직임. 모든 구단 잔고에 반영하고, 내 구단은 장부에도 기록 */
export function book(w: World, clubId: string, kind: IncomeKind | ExpenseKind, amount: number) {
  const c = w.clubs[clubId];
  if (!c || !amount) return;
  const isIncome = kind in INCOME_LABEL;
  c.finance.balance += isIncome ? amount : -amount;
  if (clubId !== w.userClubId) return;
  const l = ledgerOf(w).current;
  // 옛 세이브 장부에 없는 항목(훈련비 등)은 0부터
  if (isIncome) l.income[kind as IncomeKind] = (l.income[kind as IncomeKind] ?? 0) + amount; else l.expense[kind as ExpenseKind] = (l.expense[kind as ExpenseKind] ?? 0) + amount;
}

/** 구단 연 매출 기준값 */
export function clubRevenue(w: World, clubId: string): number {
  const c = w.clubs[clubId];
  if (clubId === w.userClubId && c.ledger) return c.ledger.current.base;
  return c.finance.revenue ?? Math.round((c.finance.wageBudget * 52) / WAGE_RATIO);
}
/** 내 구단 연 매출 기준값 (화면 · 수상 보너스용) */
export const revenueBase = (w: World) => ledgerOf(w).current.base;
export const wageBillOf = (w: World, clubId: string) => w.clubs[clubId].squad.reduce((s, id) => s + w.players[id].wage, 0);

/** 경기하는 구단 (리그에 소속돼 일정이 있는 구단) */
const playing = (w: World) => Object.values(w.clubs).filter((c) => w.competitions[c.league]);

/** 하루 처리 (모든 구단): 월요일 주급, 매월 1일 중계권 · 스폰서 · 운영비 */
export function financeDay(w: World) {
  const d = new Date(w.date + 'T00:00:00Z');
  const monday = d.getUTCDay() === 1, first = d.getUTCDate() === 1;
  if (!monday && !first) return;
  const m = d.getUTCMonth() + 1;
  for (const c of playing(w)) {
    const R = clubRevenue(w, c.id);
    if (monday) book(w, c.id, 'wages', wageBillOf(w, c.id));
    if (first) {
      if (m >= 8 || m <= 5) book(w, c.id, 'tv', Math.round((R * SHARE.tv) / 10));
      book(w, c.id, 'commercial', Math.round(((R * SHARE.commercial) / 12) * fanFactor(w, c.id)));
      book(w, c.id, 'operations', Math.round((R * SHARE.operations) / 12));
    }
  }
  if (monday) {
    const l = ledgerOf(w).current;
    l.balances.push({ date: w.date, balance: w.clubs[w.userClubId].finance.balance });
    if (l.balances.length > 60) l.balances.shift();
  }
}

/** 홈 경기 입장 수입 (모든 구단): 매출의 20%를 한 시즌 홈 경기 수(리그 + 컵 · 유럽 평균 3경기)로 나눈 값, 상대 명성에 따라 약 ±10% */
export function gateIncome(w: World, home: string, away: string) {
  const c = w.clubs[home];
  if (!c) return;
  const homeGames = Math.max(1, Object.keys(w.competitions[c.league]?.table ?? {}).length - 1) + 3;
  const opp = w.clubs[away]?.reputation ?? 70;
  const oppF = Math.max(0.85, Math.min(1.15, 1 + (opp - 70) / 150));
  book(w, home, 'gate', Math.round(((clubRevenue(w, home) * SHARE.gate) / homeGames) * oppF * fanFactor(w, home)));
}

/** 리그 상금 (모든 구단): 매출의 15% 기준, 1위 1.6배 ~ 꼴찌 0.4배 */
export function prizeMoney(w: World, clubId: string, position: number, teams: number) {
  const f = 1.6 - (1.2 * (position - 1)) / Math.max(1, teams - 1);
  const amount = Math.round(clubRevenue(w, clubId) * SHARE.prize * f);
  book(w, clubId, 'prize', amount);
  return amount;
}

/**
 * 새 시즌 예산 (모든 구단 같은 규칙). data = 새 시즌 기준 재정 (실제 다음 시즌 데이터, 없으면 지금 값)
 *  - 잔고는 게임 속 실제 돈을 그대로 이어간다
 *  - 매출 기준값 · 주급 예산은 새 시즌 기준을 따르되, 잔고가 마이너스면 주급 예산을 줄인다
 *  - 모아 둔 돈의 8%까지는 해마다 주급에 더 쓸 수 있다 (부자 구단이 더 좋은 선수를 쓰게. 재정 규정 한도는 따로 적용)
 *  - 이적 예산: 잔고가 있으면 잔고의 절반 이상 (데이터 기준 예산과 잔고 중 작은 값까지), 잔고가 마이너스면 기준의 25%
 */
export function seasonBudgets(c: ClubState, data: ClubState['finance']) {
  const bal = c.finance.balance;
  const revenue = data.revenue ?? c.finance.revenue;
  const wageBudget = Math.round(data.wageBudget * (bal < 0 ? 0.92 : 1) + (Math.max(0, bal) * 0.08) / 52);
  const transferBudget = bal > 0 ? Math.max(Math.round(bal * 0.5), Math.min(bal, data.transferBudget)) : Math.round(data.transferBudget * 0.25);
  c.finance = { balance: bal, transferBudget, wageBudget, ...(revenue ? { revenue } : {}) };
  return c.finance;
}

/** 내 구단 새 시즌: 예산 배정 + 장부 넘기기 */
export function boardReview(w: World, data: ClubState['finance'], nextSeason: string) {
  const c = w.clubs[w.userClubId];
  const l = ledgerOf(w);
  const net = sum(l.current.income) - sum(l.current.expense);
  const bal = c.finance.balance;
  // 이사회: 손해를 봤으면 주급 예산을 조금 줄이고, 이익이면 조금 늘린다
  const f = seasonBudgets(c, { ...data, wageBudget: Math.round(data.wageBudget * (bal < 0 ? 1 : net < 0 ? 0.97 : 1.03)) });
  const { balances, ...rest } = l.current;
  l.past = [...l.past, { ...rest, endBalance: bal }].slice(-10);
  void balances;
  l.current = emptyLedger(nextSeason, bal, w.date, f.revenue ?? Math.round((f.wageBudget * 52) / WAGE_RATIO));
  return { net, transferBudget: f.transferBudget, wageBudget: f.wageBudget, balance: bal };
}
