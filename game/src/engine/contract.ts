// 내 선수 계약: 자동 재계약 · 재계약 요청 · 직접 협상
//  - 1월 1일 · 4월 1일: 이번 시즌 끝에 계약이 끝나는 선수 중 불만 없는 선수는 자동 재계약,
//    불만 있는 선수는 재계약 요청 팝업 → 감독이 직접 협상 (안 하면 6월 30일 이후 FA로 떠남)
//  - 직접 협상: 주급이 낮으면 기회 1번 소모 (3번), 구단에 남을 마음이 없으면 바로 거절
import type { PlayerState, World } from './types';
import { overall } from './ratings';
import { ageOn } from './condition';
import { wageDemand, wageRoom, yearsLeft } from './transfer';
import { buyoutOf, buyoutWageFactor, setBuyout } from './clauses';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 이번 시즌이 끝나는 날 (6월 30일) */
export const seasonEnd = (w: World) => `${+w.season.slice(0, 4) + 1}-06-30`;
/** 이번 시즌 끝에 계약이 끝나는 선수 */
export const expiring = (w: World, p: PlayerState) => !!p.contract && p.contract <= seasonEnd(w);

/** 재계약 때 원하는 주급: 이적 때 요구액 기준, 충성도가 높으면 덜 요구 (최대 −10%), 지금 주급보다는 낮추지 않음 */
export function renewDemand(w: World, p: PlayerState): number {
  const d = wageDemand(w, p) * (1 - clamp((p.loyalty - 50) / 500, -0.05, 0.1));
  return Math.max(p.wage, Math.round(d / 500) * 500);
}

/** 재계약 후 계약 종료일: 이번 시즌 끝에서 years 년 */
export const renewEnd = (w: World, years: number) => `${+w.season.slice(0, 4) + years}-06-30`;

/** 구단에 남을 마음이 있는지 (주급과 무관) */
export function willStay(w: World, p: PlayerState): { ok: boolean; reason: string } {
  if (p.precontract) return { ok: false, reason: '이미 다른 구단과 사전 계약(보스만)을 맺어 재계약할 수 없습니다' };
  const club = w.clubs[w.userClubId];
  const lvl = [...club.squad].map((id) => overall(w.players[id])).sort((a, b) => b - a).slice(0, 11);
  const level = lvl.reduce((a, b) => a + b, 0) / Math.max(1, lvl.length);
  let score = (p.loyalty - 50) / 25 + (p.morale - 60) / 40;
  if (p.unhappy) score -= 1.5;
  if (p.benchStreak >= 5) score -= 0.8;
  const tooGood = overall(p) > level + 3 && p.hidden.ambition >= 14;
  if (tooGood) score -= 1;
  if (score > -1.2) return { ok: true, reason: '' };
  return { ok: false, reason: p.unhappy || p.benchStreak >= 5 ? '출전 시간에 불만이 있어 재계약할 생각이 없다고 합니다' : tooGood ? '더 큰 무대에서 뛰고 싶어 재계약을 거절했습니다' : '구단에 남을 생각이 없다고 합니다' };
}

/** 재계약 판단 (기회 소모 · 결렬은 store에서) */
export function evaluateRenewal(w: World, p: PlayerState, wage: number, years: number, clause?: number): { ok: boolean; reason: string; low?: boolean } {
  const stay = willStay(w, p);
  if (!stay.ok) return stay;
  const age = ageOn(p.birth, w.date);
  if (age >= 33 && years > 2) return { ok: false, low: true, reason: '나이가 있어 1~2년 계약을 원합니다' };
  const demand = renewDemand(w, p) * (clause == null ? 1 : buyoutWageFactor(w, p, clause));
  // 길게 묶을수록 조금 더 원한다 (4년 이상 +5%)
  const need = demand * (years >= 4 ? 1.05 : 1) * 0.95;
  if (wage < need) return { ok: false, low: true, reason: `원하는 주급보다 낮습니다. 주급 ${Math.round((demand * (years >= 4 ? 1.05 : 1)) / 1000)}K 유로 정도를 원합니다` };
  return { ok: true, reason: '재계약에 합의했습니다' };
}

export function applyRenewal(w: World, p: PlayerState, wage: number, years: number, clause?: number) {
  setBuyout(p, clause ?? buyoutOf(w, p));   // 바이아웃: 정하지 않으면 지금 조건 그대로
  p.wage = wage;
  p.contract = renewEnd(w, years);
  p.contractGen = false;
  p.morale = Math.min(100, p.morale + 5);
  p.loyalty = Math.min(100, p.loyalty + 3);
}

/** 자동 재계약 기간: 29세 이하 3년, 32세 이하 2년, 그 위 1년 */
export const autoYears = (w: World, p: PlayerState) => { const a = ageOn(p.birth, w.date); return a <= 29 ? 3 : a <= 32 ? 2 : 1; };

/**
 * 1월 1일 · 4월 1일: 이번 시즌 끝에 계약이 끝나는 내 선수 처리
 *  - 불만 없는 선수: 원하는 주급으로 자동 재계약 (주급 예산 안에서)
 *  - 불만 있거나 주급 예산이 모자라면: 재계약 요청 팝업 (w.pendingRenewals) → 감독이 직접 협상
 */
export function contractCheck(w: World) {
  const y = +w.season.slice(0, 4) + 1;
  if (w.date !== `${y}-01-01` && w.date !== `${y}-04-01`) return;
  const ps = w.clubs[w.userClubId].squad.map((id) => w.players[id]).filter((p) => expiring(w, p) && !p.precontract);   // 보스만 사전 계약한 선수는 재계약 없음
  const auto: string[] = [], ask: { player: string; reason: string }[] = [];
  for (const p of ps) {
    const stay = willStay(w, p);
    const wage = renewDemand(w, p);
    if (!stay.ok) { ask.push({ player: p.id, reason: stay.reason }); continue; }
    if (wage - p.wage > wageRoom(w, w.userClubId)) { ask.push({ player: p.id, reason: '주급 인상을 원하지만 주급 예산이 모자라 자동 재계약이 안 됐습니다' }); continue; }
    applyRenewal(w, p, wage, autoYears(w, p));
    auto.push(p.id);
  }
  if (auto.length) w.inbox.push({ type: 'renewed', date: w.date, players: auto });
  if (ask.length) {
    w.inbox.push({ type: 'contract', date: w.date, players: ask.map((x) => x.player), until: seasonEnd(w) });
    w.pendingRenewals = ask;
  }
}

export { yearsLeft };
