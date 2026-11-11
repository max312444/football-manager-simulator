// 임대: 선수는 빌린 구단에서 뛰고, 소유 · 계약은 원소속 구단
//  - 기간: 이번 시즌 끝 (6월 30일, 계약이 먼저 끝나면 그때) 까지 → 자동 복귀
//  - 주급 분담: 빌린 구단이 share (0.5 · 0.75 · 1), 나머지는 원소속 구단 (finance wageBillOf)
//  - 임대료 (선택) · 완전 영입 옵션 (선택): 빌린 구단이 시즌 중 언제든 (사용자) · 시즌 끝에 (AI) 행사
//  - 이적시장 기간에만. 임대 중인 선수는 사고팔 수 없다
//  - AI 구단: 이적시장 동안 출전 기회가 없는 유망주를 하위 구단에 임대
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { book } from './finance';
import { canAfford, clubLevel, completeTransfer, marketValue, wageRoom, windowOpen } from './transfer';

export interface Loan { from: string; until: string; share: number; fee: number; buy?: number; start: string }
export type LoanTerms = { share: number; fee: number; buy?: number };

const r5 = (v: number) => Math.round(v / 50000) * 50000;
/** 이 선수가 그 구단에서 몇 번째로 잘하는지 (임대로 가면) */
const rankAt = (w: World, p: PlayerState, clubId: string) => w.clubs[clubId].squad.filter((id) => id !== p.id && overall(w.players[id]) > overall(p)).length + 1;
const seasonEnd = (w: World) => `${+w.season.slice(0, 4) + 1}-06-30`;

/** 임대 주급 (빌린 구단이 내는 몫) */
export const loanWage = (p: PlayerState) => Math.round(p.wage * (p.loan?.share ?? 1));

/** 원소속 구단의 판단 */
export function evaluateLoan(w: World, p: PlayerState, to: string, t: LoanTerms): { ok: boolean; reason: string } {
  if (!p.clubId) return { ok: false, reason: '자유계약 선수는 임대할 수 없습니다 (그냥 영입하세요)' };
  if (p.loan) return { ok: false, reason: '이미 임대 중인 선수입니다' };
  if (p.clubId === to) return { ok: false, reason: '같은 구단입니다' };
  if (!windowOpen(w.season, w.date)) return { ok: false, reason: '이적시장이 닫혀 있습니다' };
  const parent = w.clubs[p.clubId];
  if (parent.squad.length <= 20) return { ok: false, reason: '선수단 인원이 부족해 보낼 수 없다고 합니다' };
  const rank = rankAt(w, p, parent.id);
  const age = ageOn(p.birth, w.date);
  if (rank <= 3) return { ok: false, reason: '팀의 핵심 선수라 임대는 생각하지 않는다고 합니다' };
  if (rank <= 8 && age >= 23 && (t.share < 1 || t.fee < marketValue(w, p) * 0.05)) return { ok: false, reason: `주전급 선수라 주급 100%와 임대료 ${Math.round(r5(marketValue(w, p) * 0.05) / 1e5) / 10}M 유로 이상이면 생각해 보겠다고 합니다` };
  if (t.share < 0.5) return { ok: false, reason: '주급을 절반 이상은 내야 한다고 합니다' };
  if (t.buy && t.buy < marketValue(w, p) * 0.9) return { ok: false, reason: `완전 영입 옵션은 ${Math.round(r5(marketValue(w, p) * 0.9) / 1e5) / 10}M 유로 이상이어야 한다고 합니다` };
  return { ok: true, reason: '임대를 받아들였습니다' };
}

/** 선수의 판단: 가서 뛸 수 있으면 간다 */
export function playerWillLoan(w: World, p: PlayerState, to: string): { ok: boolean; reason: string } {
  const there = rankAt(w, p, to);
  if (there > 14) return { ok: false, reason: '출전 기회가 적어 보여 가지 않겠다고 합니다' };
  const here = p.clubId ? rankAt(w, p, p.clubId) : 99;
  if (here <= 11 && w.clubs[to].reputation < w.clubs[p.clubId!].reputation - 8) return { ok: false, reason: '지금 팀에서 주전이라 굳이 갈 이유가 없다고 합니다' };
  return { ok: true, reason: '임대 이적에 동의했습니다' };
}

/** 임대 이동 */
export function loanMove(w: World, p: PlayerState, to: string, t: LoanTerms): GameEvent {
  const from = p.clubId!;
  const until = p.contract && p.contract < seasonEnd(w) ? p.contract : seasonEnd(w);
  w.clubs[from].squad = w.clubs[from].squad.filter((id) => id !== p.id);
  w.clubs[to].squad.push(p.id);
  w.clubs[from].loanedOut = [...(w.clubs[from].loanedOut ?? []), p.id];
  if (t.fee) { book(w, to, 'purchases', t.fee); book(w, from, 'sales', t.fee); }
  p.clubId = to;
  p.loan = { from, until, share: t.share, fee: t.fee, buy: t.buy, start: w.date };
  p.benchStreak = 0;
  p.role = undefined;
  w.offers = (w.offers ?? []).filter((o) => o.player !== p.id);
  w.transferList = (w.transferList ?? []).filter((id) => id !== p.id);
  w.clubs[from].lineup = null; w.clubs[to].lineup = null;
  return { type: 'loan', date: w.date, player: p.id, from, to, kind: 'start', share: t.share, fee: t.fee, user: from === w.userClubId || to === w.userClubId };
}

/** 복귀 */
export function loanReturn(w: World, p: PlayerState): GameEvent | null {
  const l = p.loan;
  if (!l) return null;
  const to = p.clubId!;
  if (w.clubs[to]) { w.clubs[to].squad = w.clubs[to].squad.filter((id) => id !== p.id); w.clubs[to].lineup = null; }
  const parent = w.clubs[l.from];
  p.loan = undefined;
  if (!parent) { p.clubId = null; return null; }
  parent.loanedOut = (parent.loanedOut ?? []).filter((id) => id !== p.id);
  parent.squad.push(p.id);
  parent.lineup = null;
  p.clubId = parent.id;
  return { type: 'loan', date: w.date, player: p.id, from: to, to: parent.id, kind: 'return', user: to === w.userClubId || parent.id === w.userClubId };
}

/** 완전 영입 옵션 행사 (빌린 구단) */
export function exerciseBuy(w: World, p: PlayerState): GameEvent[] {
  const l = p.loan;
  if (!l?.buy) return [];
  const borrower = p.clubId!;
  const fee = l.buy;
  // 원소속 구단 소속으로 되돌린 뒤 정식 이적 (이적료 · 상각 · 장부 처리는 completeTransfer)
  loanReturn(w, p);
  const years = Math.max(1, p.contract ? +p.contract.slice(0, 4) - +w.season.slice(0, 4) : 3);
  return [completeTransfer(w, p, borrower, fee, p.wage, years), { type: 'loan', date: w.date, player: p.id, from: l.from, to: borrower, kind: 'bought', fee, user: borrower === w.userClubId || l.from === w.userClubId }];
}

/** 이 선수를 받아 줄 구단 후보 (임대 보내기): 가서 주전급으로 뛸 수 있고 주급을 낼 수 있는 구단, 명성 높은 순 3곳 */
export function loanCandidates(w: World, p: PlayerState, exclude: string[] = []): { club: string; terms: LoanTerms }[] {
  if (!p.clubId) return [];
  const parent = w.clubs[p.clubId];
  return Object.values(w.clubs)
    .filter((c) => c.id !== parent.id && !exclude.includes(c.id) && w.competitions[c.league] && !c.id.startsWith('nt-') && c.squad.length < 28
      && rankAt(w, p, c.id) <= 11 && clubLevel(w, c.id) <= overall(p) + 3)
    .map((c) => {
      const share = c.reputation >= parent.reputation - 6 ? 1 : c.reputation >= parent.reputation - 15 ? 0.75 : 0.5;
      return { c, share };
    })
    .filter(({ c, share }) => wageRoom(w, c.id) >= p.wage * share && canAfford(w, c.id, 0, p.wage * share, 1))
    .sort((a, b) => b.c.reputation - a.c.reputation)
    .slice(0, 3)
    .map(({ c, share }) => ({ club: c.id, terms: { share, fee: 0 } }));
}

/** AI 구단: 이적시장 동안 출전 기회가 없는 유망주 (21세 이하 · 구단 16위 아래) 를 하위 구단에 임대 */
export function aiLoanDay(w: World, rng: Rng): GameEvent[] {
  if (!windowOpen(w.season, w.date)) return [];
  const out: GameEvent[] = [];
  for (const c of Object.values(w.clubs)) {
    if (c.id === w.userClubId || !w.competitions[c.league] || c.id.startsWith('nt-') || c.squad.length <= 24 || !rng.chance(0.02)) continue;
    const kids = c.squad.map((id) => w.players[id]).filter((p) => !p.loan && ageOn(p.birth, w.date) <= 21 && overall(p) >= 55 && rankAt(w, p, c.id) >= 16);
    if (!kids.length) continue;
    const p = rng.pick(kids);
    const cand = loanCandidates(w, p, [w.userClubId]);
    if (!cand.length) continue;
    const pick = rng.pick(cand);
    out.push(loanMove(w, p, pick.club, pick.terms));
  }
  return out;
}

/** 시즌 끝: AI 빌린 구단은 완전 영입 옵션을 (주전급이고 돈이 되면) 행사, 나머지는 모두 복귀 */
export function endLoans(w: World): GameEvent[] {
  const out: GameEvent[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.loan || !p.clubId) continue;
    const borrower = p.clubId;
    if (borrower !== w.userClubId && p.loan.buy && rankAt(w, p, borrower) <= 14 && canAfford(w, borrower, p.loan.buy, p.wage, 3)) { out.push(...exerciseBuy(w, p)); continue; }
    const e = loanReturn(w, p);
    if (e) out.push(e);
  }
  return out;
}
