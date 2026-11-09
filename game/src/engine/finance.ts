// 재정: 내 구단의 수입 · 지출 흐름과 시즌 장부, 이사회 예산 배정
// 규모는 구단 주급 예산(데이터)에서 나온 '연 매출 기준값'으로 정한다 → 시대 · 리그 · 구단 크기가 자연스럽게 반영됨
import type { ClubState, World } from './types';
import { fanFactor } from './awards';

export type IncomeKind = 'tv' | 'gate' | 'commercial' | 'prize' | 'sales';
export type ExpenseKind = 'wages' | 'operations' | 'purchases';
export const INCOME_LABEL: Record<IncomeKind, string> = { tv: '중계권', gate: '경기장 수입', commercial: '스폰서 · 상품', prize: '리그 상금', sales: '선수 판매' };
export const EXPENSE_LABEL: Record<ExpenseKind, string> = { wages: '선수 주급', operations: '운영비', purchases: '선수 영입' };

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
  expense: { wages: 0, operations: 0, purchases: 0 },
  balances: [{ date, balance }],
});

export function ledgerOf(w: World): Ledger {
  const c = w.clubs[w.userClubId];
  c.ledger ??= { current: emptyLedger(w.season, c.finance.balance, w.date, baseOf(w)), past: [] };
  return c.ledger;
}
export const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** 내 구단만 장부에 기록 (AI 구단은 잔고만 바뀜) */
export function book(w: World, clubId: string, kind: IncomeKind | ExpenseKind, amount: number) {
  const c = w.clubs[clubId];
  const isIncome = kind in INCOME_LABEL;
  c.finance.balance += isIncome ? amount : -amount;
  if (clubId !== w.userClubId) return;
  const l = ledgerOf(w).current;
  if (isIncome) l.income[kind as IncomeKind] += amount; else l.expense[kind as ExpenseKind] += amount;
}

/** 연 매출 기준값: 시즌 시작 때 주급 총액 × 52주 ÷ 0.60 (주급이 매출의 약 60%). 주급 예산의 50~100% 범위로 제한
 *  (강등되면 이사회 주급 예산이 줄어 매출도 줄어든다. 주급을 예산보다 많이 써도 매출이 늘지 않음) */
function baseOf(w: World) {
  const c = w.clubs[w.userClubId];
  return Math.round((Math.max(Math.min(wageBillOf(w, c.id), c.finance.wageBudget), c.finance.wageBudget * 0.5) * 52) / 0.6);
}
export const revenueBase = (w: World) => ledgerOf(w).current.base;
export const wageBillOf = (w: World, clubId: string) => w.clubs[clubId].squad.reduce((s, id) => s + w.players[id].wage, 0);

/** 하루 처리: 월요일 주급 지급, 매월 1일 중계권 · 스폰서 · 운영비 */
export function financeDay(w: World) {
  const c = w.clubs[w.userClubId];
  const d = new Date(w.date + 'T00:00:00Z');
  const R = revenueBase(w);
  if (d.getUTCDay() === 1) {
    book(w, c.id, 'wages', wageBillOf(w, c.id));
    const l = ledgerOf(w).current;
    l.balances.push({ date: w.date, balance: c.finance.balance });
    if (l.balances.length > 60) l.balances.shift();
  }
  if (d.getUTCDate() === 1) {
    const m = d.getUTCMonth() + 1;
    if (m >= 8 || m <= 5) book(w, c.id, 'tv', Math.round((R * 0.4) / 10));      // 8월~5월 10회
    book(w, c.id, 'commercial', Math.round(((R * 0.25) / 12) * fanFactor(w, c.id)));
    book(w, c.id, 'operations', Math.round((R * 0.25) / 12));
  }
}

/** 홈 경기 입장 수입: 매출의 20%를 홈 19경기로, 상대 명성에 따라 ±20% */
export function gateIncome(w: World, home: string, away: string) {
  if (home !== w.userClubId) return;
  const R = revenueBase(w);
  const opp = w.clubs[away]?.reputation ?? 70;
  book(w, home, 'gate', Math.round((R * 0.2) / 19 * (0.8 + 0.4 * opp / 100) * fanFactor(w, home)));
}

/** 리그 상금: 매출의 15% 기준, 1위 1.6배 ~ 꼴찌 0.4배 */
export function prizeMoney(w: World, position: number, teams: number) {
  const c = w.clubs[w.userClubId];
  const f = 1.6 - (1.2 * (position - 1)) / Math.max(1, teams - 1);
  const amount = Math.round(revenueBase(w) * 0.15 * f);
  book(w, c.id, 'prize', amount);
  return amount;
}

/** 새 시즌 이사회 예산 배정 (data = 실제 다음 시즌 기준 예산). 장부를 넘기고 결과를 돌려준다 */
export function boardReview(w: World, data: ClubState['finance'], nextSeason: string) {
  const c = w.clubs[w.userClubId];
  const l = ledgerOf(w);
  const net = sum(l.current.income) - sum(l.current.expense);
  const bal = c.finance.balance;
  const transferBudget = bal > 0 ? Math.max(Math.round(bal * 0.5), Math.min(bal, data.transferBudget)) : Math.round(data.transferBudget * 0.25);
  const wageBudget = Math.round(data.wageBudget * (bal < 0 ? 0.92 : net < 0 ? 0.97 : 1.03));
  const { balances, ...rest } = l.current;
  l.past = [...l.past, { ...rest, endBalance: bal }].slice(-10);
  void balances;
  c.finance = { balance: bal, transferBudget, wageBudget };
  l.current = emptyLedger(nextSeason, bal, w.date, baseOf(w));
  return { net, transferBudget, wageBudget, balance: bal };
}
