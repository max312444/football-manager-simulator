// 데드라인 데이 · 보스만 룰
//
// 데드라인 데이: 이적시장 마감 3일 전 · 마감 당일에 알림 (진행을 멈추고 팝업). 마감 당일에는 AI 구단 영입이 3배 활발
//
// 보스만 룰 (실제 규정): 계약이 이번 시즌 끝(6월 30일)에 끝나는 선수는 마지막 6개월(1월 1일부터)
//  다른 나라 구단과 이적료 없이 사전 계약할 수 있다 → 계약이 끝나면 7월에 그 구단으로 합류.
//  같은 나라 구단은 계약이 끝나 자유계약이 된 뒤에 영입 (사전 계약 불가)
//  - 사용자: 이적시장 화면의 '보스만' 표시 선수와 사전 계약 (이적료 없음, 주급 · 기간 · 바이아웃만)
//  - AI: 재계약하지 않은 내 선수에게 해외 구단이 사전 계약을 제안 (하루 1%, 선수가 원하면 성사 → 재계약 불가)
//  - 사전 계약한 선수는 원소속 구단과 재계약하지 않는다 (AI 구단의 시즌 끝 자동 연장도 없음)
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { canAfford, clubLevel, completeTransfer, playerWillJoin, wageDemand, windowEnd, windowOpen } from './transfer';
import { setBuyout } from './clauses';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// ── 데드라인 데이 ─────────────────────────────────────
export interface DeadlineAlert { window: 'summer' | 'winter'; end: string; left: number }

/** 지금 열린 이적시장 마감까지 남은 날 (닫혀 있으면 null, 마감 당일 0) */
export function deadlineLeft(w: World): { window: 'summer' | 'winter'; end: string; left: number } | null {
  const win = windowOpen(w.season, w.date);
  const end = windowEnd(w.season, w.date);
  return win && end ? { window: win, end, left: daysBetween(w.date, end) } : null;
}

/** 오늘이 마감 당일인가 (AI 막판 영입) */
export const isDeadlineDay = (w: World) => deadlineLeft(w)?.left === 0;

/** 하루를 넘긴 뒤 (새 날짜 기준): 마감 3일 전 · 당일이면 알림을 건다 */
export function deadlineCheck(w: World): GameEvent[] {
  const d = deadlineLeft(w);
  if (!d || (d.left !== 3 && d.left !== 0)) return [];
  w.deadlineAlert = d;
  const name = d.window === 'summer' ? '여름' : '겨울';
  return [{ type: 'info', date: w.date, text: d.left === 0 ? `오늘은 ${name} 이적시장 마감일(데드라인 데이)입니다` : `${name} 이적시장 마감까지 ${d.left}일 남았습니다` }];
}

// ── 보스만 ────────────────────────────────────────────
/** 리그의 나라 (eng1 → eng) */
const nationOf = (league: string) => league.replace(/\d.*$/, '').replace(/-.*$/, '');
const seasonEndOf = (w: World) => `${+w.season.slice(0, 4) + 1}-06-30`;

/** 계약이 이번 시즌 끝에 끝나고, 마지막 6개월(1월 1일 ~ 6월 30일)인가 */
export function inFinalMonths(w: World, p: PlayerState): boolean {
  const end = seasonEndOf(w);
  return !!p.clubId && !p.loan && !p.retired && !!p.contract && p.contract <= end && w.date >= `${+w.season.slice(0, 4) + 1}-01-01`;
}

/** 이 구단이 이 선수와 보스만 사전 계약을 할 수 있는가 (다른 나라 구단만) */
export function bosmanEligible(w: World, p: PlayerState, buyer: string): boolean {
  if (!inFinalMonths(w, p) || p.clubId === buyer || p.precontract) return false;
  const a = w.clubs[p.clubId!]?.league, b = w.clubs[buyer]?.league;
  return !!a && !!b && nationOf(a) !== nationOf(b);
}

/** 사전 계약 (이적료 없음): 계약이 끝나면 합류 */
export function signPrecontract(w: World, p: PlayerState, club: string, wage: number, years: number, extra?: { role?: PlayerState['role']; buyout?: number }) {
  p.precontract = { club, wage, years, date: w.date, ...(extra?.role ? { role: extra.role } : {}), ...(extra?.buyout != null ? { buyout: extra.buyout } : {}) };
  w.transferList = (w.transferList ?? []).filter((id) => id !== p.id);
  w.offers = (w.offers ?? []).filter((o) => o.player !== p.id);
  if (w.pendingRenewals) w.pendingRenewals = w.pendingRenewals.filter((x) => x.player !== p.id);
}

/**
 * 시즌 전환 (계약 만료 처리 때): 사전 계약한 선수를 새 구단으로. 옮겼으면 true
 * 이적료 0, 정한 주급 · 기간 · (사용자) 약속한 역할 · 바이아웃
 */
export function joinPrecontract(w: World, p: PlayerState): GameEvent | null {
  const pc = p.precontract;
  if (!pc) return null;
  p.precontract = undefined;
  if (!w.clubs[pc.club] || p.retired) return null;
  const ev = completeTransfer(w, p, pc.club, 0, pc.wage, pc.years);
  if (pc.role) p.role = pc.role;
  if (pc.buyout != null) setBuyout(p, pc.buyout);
  return ev;
}

/**
 * AI 해외 구단: 재계약하지 않은 내 선수에게 사전 계약 (1월 1일부터 매일, 선수마다 1%)
 *  그 선수가 주전 · 로테이션급인 구단 (수준 −5 이상), 주급을 감당하고 선수가 가고 싶어 하는 곳 중 명성 1위
 */
export function aiBosmanDay(w: World, rng: Rng): GameEvent[] {
  const me = w.clubs[w.userClubId];
  if (!me || w.date.endsWith('-01-01')) return [];   // 1월 1일은 자동 재계약이 먼저
  for (const id of me.squad) {
    const p = w.players[id];
    if (!inFinalMonths(w, p) || p.precontract || !rng.chance(0.01)) continue;
    if (ageOn(p.birth, w.date) >= 34) continue;
    const wage = wageDemand(w, p);
    const ovr = overall(p);
    const club = Object.values(w.clubs)
      .filter((c) => c.id !== w.userClubId && w.competitions[c.league] && bosmanEligible(w, p, c.id) && ovr >= clubLevel(w, c.id) - 5 && canAfford(w, c.id, 0, wage, 3) && playerWillJoin(w, p, c.id, wage, undefined, undefined, true).ok)
      .sort((a, b) => b.reputation - a.reputation)[0];
    if (!club) continue;
    signPrecontract(w, p, club.id, wage, 3);
    const ev: GameEvent = { type: 'bosman', date: w.date, player: p.id, to: club.id, mine: true };
    w.inbox.push(ev);
    return [ev];
  }
  return [];
}
