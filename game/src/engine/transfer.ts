// 이적 엔진: 몸값 · 이적시장 기간 · 영입 제안 판단 · 계약 · AI 구단 이적
import { ROLE_JOIN, type Role } from './roles';
import { transferFactor } from './gameSettings';
import type { GameEvent, PlayerState, TransferOffer, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { posGroup } from '../data/rating';
import { book } from './finance';
import { WAGE_SLACK, ruleWageRoom, withinRules } from './rules';
import { youthIntake } from './youth';
import { aiBuyoutRaids, buyoutOf, buyoutWageFactor } from './clauses';
import { bargainOf } from './firesale';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ── 이적시장 기간 ───────────────────────────────────
/** 여름: 7/1~9/1 (2020/21은 10/5까지), 겨울: 1/1~1/31 */
export function windowOpen(season: string, date: string): 'summer' | 'winter' | null {
  const y = +season.slice(0, 4);
  const summerEnd = season === '2020-21' ? '2020-10-05' : `${y}-09-01`;
  if (date >= `${y}-07-01` && date <= summerEnd) return 'summer';
  if (date >= `${y + 1}-01-01` && date <= `${y + 1}-01-31`) return 'winter';
  return null;
}
/** 지금 열린 이적시장이 끝나는 날 (닫혀 있으면 null) */
export function windowEnd(season: string, date: string): string | null {
  const win = windowOpen(season, date);
  if (!win) return null;
  const y = +season.slice(0, 4);
  return win === 'summer' ? (season === '2020-21' ? '2020-10-05' : `${y}-09-01`) : `${y + 1}-01-31`;
}
export function nextWindow(season: string, date: string): string {
  const y = +season.slice(0, 4);
  return date < `${y + 1}-01-01` ? `${y + 1}-01-01` : `${y + 1}-07-01`;
}

// ── 몸값 · 주급 ─────────────────────────────────────
const era = (season: string) => 0.35 + 0.65 * clamp((+season.slice(0, 4) - 2000) / 25, 0, 1);
const LEAGUE_MULT: Record<string, number> = { eng1: 1.15, esp1: 1.0, ita1: 0.95, ger1: 0.95, fra1: 0.85 };

export function yearsLeft(p: PlayerState, date: string): number {
  if (!p.contract) return 0;
  return Math.max(0, (Date.parse(p.contract) - Date.parse(date)) / (365.25 * 86400000));
}

/** 시장 가치 (유로) */
export function marketValue(w: World, p: PlayerState): number {
  const ovr = overall(p);
  const age = ageOn(p.birth, w.date);
  const ageF = age <= 21 ? 1.4 : age <= 24 ? 1.25 : age <= 27 ? 1 : age <= 29 ? 0.8 : age <= 31 ? 0.55 : age <= 33 ? 0.35 : 0.2;
  const yl = yearsLeft(p, w.date);
  const contractF = !p.clubId ? 0 : !p.contract ? 0.6 : yl >= 3 ? 1 : yl >= 2 ? 0.85 : yl >= 1 ? 0.65 : 0.4;
  const league = p.clubId ? w.clubs[p.clubId]?.league ?? '' : '';
  // 기준: 능력 70 · 전성기 · 계약 3년 이상 · 2025년 ≈ 300만 유로, 능력 1당 약 23%씩 오름 (능력 87 전성기 ≈ 1억 유로)
  const v = 3.0e6 * 1.23 ** (ovr - 70) * ageF * contractF * era(w.season) * (LEAGUE_MULT[league] ?? 0.8) * performanceFactor(w, p);
  return Math.round(v / 50000) * 50000;
}

/**
 * 게임 속 활약에 따른 몸값 배율 (0.6 ~ 1.9)
 *  - 평균 평점: 이번 시즌 6경기 이상이면 이번 시즌, 아니면 지난 시즌 기록
 *  - 골 · 도움 (경기당)
 *  - 출전 기회: 시즌이 진행됐는데 거의 못 뛰면 하락
 *  - 소속 구단 성적: 지난 시즌 리그 우승 상승 · 강등 하락
 */
export function performanceFactor(w: World, p: PlayerState): number {
  let f = 1;
  const curApps = p.stats.apps + p.stats.subApps;
  const last = p.career.at(-1);
  const src = curApps >= 6
    ? { apps: curApps, rating: p.stats.ratingSum / curApps, goals: p.stats.goals, assists: p.stats.assists }
    : last && last.apps >= 6 ? { apps: last.apps, rating: last.rating ?? 6.7, goals: last.goals, assists: last.assists } : null;
  if (src) {
    f *= clamp(1 + (src.rating - 6.7) * 0.35, 0.7, 1.5);
    const g = posGroup(p.pos);
    if (g === 'FW' || g === 'MF') f *= 1 + clamp(((src.goals + src.assists * 0.6) / src.apps) * 0.5, 0, 0.4);
  }
  if (p.clubId) {
    const club = w.clubs[p.clubId];
    const played = w.competitions[club.league] ? w.competitions[club.league].table[club.id]?.p ?? 0 : 0;
    if (played >= 10 && curApps / played < 0.2) f *= 0.85;
    const prev = w.history.filter((h) => h.league === club.league || h.league === club.league.replace(/-lower$/, '')).at(-1);
    if (prev?.champion === club.id) f *= 1.15;
    if (club.league.endsWith('-lower')) f *= 0.85;
  }
  return clamp(f, 0.6, 1.9);
}

/** 공식 주급 (시장 표본이 모자랄 때만): 능력 70 ≈ 2024년 주 €120K, 능력 1당 약 13%, 1년 전마다 약 7% 적게 */
const formulaWage = (w: World, ovr: number) => 120000 * 1.128 ** (ovr - 70) * Math.min(1.3, 1.07 ** (+w.season.slice(0, 4) - 2024));

/** 주급 시세표 (일주일에 한 번): 지금 세계의 1부 · 2부 구단 선수 중 능력이 비슷한 선수들의 주급 중간값.
 *  데이터 주급(시대 · 리그 규모가 반영된 값)을 따라가므로 시대마다 따로 맞출 필요가 없다 */
const marketCache = new WeakMap<World, { date: string; table: Map<number, number> }>();
function marketTable(w: World): Map<number, number> {
  const hit = marketCache.get(w);
  if (hit && Math.abs(Date.parse(w.date) - Date.parse(hit.date)) < 7 * 864e5) return hit.table;   // 일주일에 한 번만 다시 계산 (시세는 천천히 변함)
  const byOvr = new Map<number, number[]>();
  for (const p of Object.values(w.players)) {
    if (p.retired || !p.clubId || p.generated || p.clubId.startsWith('nt-') || p.wage < 1000) continue;
    const o = overall(p);
    (byOvr.get(o) ?? byOvr.set(o, []).get(o)!).push(p.wage);
  }
  const table = new Map<number, number>();
  for (let o = 40; o <= 99; o++) {
    let pool: number[] = [];
    for (let r = 1; r <= 3 && pool.length < 8; r++) { pool = []; for (let k = o - r; k <= o + r; k++) pool.push(...(byOvr.get(k) ?? [])); }
    if (pool.length >= 8) { pool.sort((a, b) => a - b); table.set(o, pool[pool.length >> 1]); }
  }
  // 위로 갈수록 줄지 않게 (표본이 적은 최상위 구간 보정)
  let prev = 0;
  for (let o = 40; o <= 99; o++) { const v = table.get(o); if (v != null) { prev = Math.max(prev, v); table.set(o, prev); } }
  marketCache.set(w, { date: w.date, table });
  return table;
}

/** 능력에 맞는 주급 (유로/주): 같은 시대 · 비슷한 능력 선수들의 주급 중간값. 표본이 없는 능력은 가장 가까운 시세에서 (위로 6% · 아래로 13%씩) */
export function wageForAbility(w: World, ovr: number): number {
  const t = marketTable(w);
  const o = Math.round(ovr);
  if (t.has(o)) return t.get(o)!;
  for (let d = 1; d <= 30; d++) {
    if (t.has(o - d)) return t.get(o - d)! * 1.06 ** d;   // 시세표 위쪽 (최상위 몇 명): 능력 1당 6%만
    if (t.has(o + d)) return t.get(o + d)! / 1.128 ** d;
  }
  return formulaWage(w, ovr);
}
/** 선수가 바라는 주급 (유로/주). 소속 선수는 지금 주급보다 10% 이상, 자유계약 선수는 능력 기준 (예전 주급은 따지지 않음) */
export function wageDemand(w: World, p: PlayerState): number {
  const byAbility = wageForAbility(w, overall(p));
  const base = p.clubId ? Math.max(byAbility, p.wage * 1.1) : byAbility;
  return Math.max(500, Math.round(base / 500) * 500);
}

export const wageBill = (w: World, clubId: string) => { const c = w.clubs[clubId]; let s = 0; for (const id of c.squad) { const p = w.players[id]; s += p.loan ? p.wage * p.loan.share : p.wage; } for (const id of c.loanedOut ?? []) { const p = w.players[id]; if (p?.loan) s += p.wage * (1 - p.loan.share); } return Math.round(s); };
/** 주급 예산에서 남은 여유 (음수면 이미 초과) */
/** 주급 여유 (주): 주급 예산과 재정 규정(샐러리 캡) 중 더 좁은 쪽 */
export const wageRoom = (w: World, clubId: string) => Math.min(w.clubs[clubId].finance.wageBudget * WAGE_SLACK - wageBill(w, clubId), ruleWageRoom(w, clubId));
/** 영입 가능한지: 이적료는 이적 예산 안, 주급은 주급 여유 안, 주급 + 이적료 상각은 재정 규정 안 — AI · 사용자 같은 규칙 */
export const canAfford = (w: World, clubId: string, fee: number, wage: number, years = 3) =>
  fee <= w.clubs[clubId].finance.transferBudget && wage <= wageRoom(w, clubId) && withinRules(w, clubId, wage, fee, years).ok;

/** 구단 안에서 능력 순위 (1부터) */
function rankInClub(w: World, p: PlayerState): number {
  if (!p.clubId) return 99;
  const ovr = overall(p);
  return w.clubs[p.clubId].squad.filter((id) => overall(w.players[id]) > ovr).length + 1;
}

// ── 제안 판단 ────────────────────────────────────────
export interface BidResult { decision: 'accept' | 'counter' | 'reject'; ask: number; reason: string }

/** 파는 구단이 부르는 가격 */
export function askingPrice(w: World, p: PlayerState): number {
  const bg = bargainOf(w, p);
  if (bg) return bg.price;   // 급매물: 내놓은 가격
  const rank = rankInClub(w, p);
  const mult = rank <= 3 ? 1.6 : rank <= 8 ? 1.3 : rank <= 15 ? 1.1 : 0.9;
  const listed = (w.transferList ?? []).includes(p.id) ? 0.85 : 1;
  return Math.round((marketValue(w, p) * mult * listed) / 50000) * 50000;
}

/** 파는 구단의 판단 */
export function evaluateBid(w: World, p: PlayerState, buyer: string, fee: number): BidResult {
  if (!p.clubId) return { decision: 'accept', ask: 0, reason: '자유계약 선수' };
  if (p.loan) return { decision: 'reject', ask: 0, reason: '임대 중인 선수라 지금은 이적할 수 없습니다' };
  if (p.precontract) return { decision: 'reject', ask: 0, reason: '이미 다른 구단과 사전 계약(보스만)한 선수입니다' };
  const clause = buyoutOf(w, p);
  if (clause > 0 && fee >= clause) return { decision: 'accept', ask: clause, reason: '바이아웃 금액을 냈습니다. 구단은 거절할 수 없습니다' };
  // 급매물 (강제 매각 · 강등 조항 발동): 핵심 선수 · 선수단 인원 규칙 없이 그 가격이면 판다
  const bg = bargainOf(w, p);
  if (bg) {
    const why = bg.kind === 'fire' ? '재정 위기로 내놓은 선수입니다' : '강등 조항이 발동한 선수입니다';
    if (fee >= bg.price) return { decision: 'accept', ask: bg.price, reason: `${why}. 받아들이겠습니다` };
    return { decision: fee >= bg.price * 0.85 ? 'counter' : 'reject', ask: bg.price, reason: `${why}. ${Math.round(bg.price / 1e5) / 10}M 유로면 보내겠다고 합니다` };
  }
  const seller = w.clubs[p.clubId];
  // 태업하며 이 구단을 지목한 선수: 단계마다 10% 싸게, 핵심 선수 규칙 없이
  const forcing = p.saga?.kind === 'move' && p.saga.target === buyer && p.saga.club === p.clubId ? p.saga.stage : 0;
  const ask = askingPrice(w, p) * (1 - 0.1 * forcing) * (buyer === w.userClubId ? transferFactor(w).ask : 1);   // 설정: 이적 협상 난이도
  const rank = forcing ? 99 : rankInClub(w, p);
  if (seller.squad.length <= 18) return { decision: 'reject', ask, reason: '선수단 인원이 부족해 팔 수 없다고 합니다' };
  // 핵심 선수는 비슷한 급 이상 구단이 크게 쓸 때만
  if (rank <= 2 && w.clubs[buyer].reputation + 5 < seller.reputation && fee < ask * 1.5) return { decision: 'reject', ask, reason: '팀의 핵심 선수라 팔 생각이 없다고 합니다' };
  if (fee >= ask) return { decision: 'accept', ask, reason: '제안을 받아들였습니다' };
  if (fee >= ask * 0.75) return { decision: 'counter', ask, reason: `원하는 가격보다 낮습니다. ${Math.round(ask / 1e5) / 10}M 유로면 보내겠다고 합니다` };
  return { decision: 'reject', ask, reason: '원하는 가격보다 한참 낮습니다. 금액을 크게 올려야 합니다' };
}

/** 선수가 이 구단으로 오겠는지 */
export function playerWillJoin(w: World, p: PlayerState, buyer: string, wage: number, role?: Role, clause?: number, bosman?: boolean): { ok: boolean; reason: string; low?: boolean } {
  const demand = wageDemand(w, p) * (clause == null ? 1 : buyoutWageFactor(w, p, clause));   // 계약에 거는 바이아웃 (낮을수록 덜 요구)
  if (wage < demand * 0.9) return { ok: false, low: true, reason: `원하는 주급보다 낮습니다. 주급 ${Math.round(demand / 1000)}K 유로 정도를 원합니다` };
  const buyerRep = w.clubs[buyer].reputation;
  const curRep = p.clubId ? w.clubs[p.clubId].reputation : 30;
  const diff = buyerRep - curRep;
  let score = diff / 10 + (wage / Math.max(1, p.wage) - 1) * 2 + ((p.hidden.ambition - 10) / 10) * (diff > 0 ? 1 : -0.6) - (p.loyalty - 50) / 40;
  if (p.unhappy) score += 1;
  if (p.saga?.kind === 'move' && p.saga.target === buyer) score += 3;   // 가고 싶다고 지목한 구단
  if (buyer === w.userClubId) score += transferFactor(w).will;   // 설정: 이적 협상 난이도
  if (role) score += ROLE_JOIN[role];   // 약속한 역할: 높을수록 오려고 한다
  // 구단이 이적 명단에 올린 선수는 "팀에서 원하지 않는다"고 느껴 작은 구단 이적도 받아들이기 쉽다
  if ((w.transferList ?? []).includes(p.id)) score += 1.5;
  if (!p.clubId || bosman) score += 1.5;   // 자유계약 · 보스만 사전 계약 (이적료가 없어 몸값 · 계약금 여유)
  return score > -0.6 ? { ok: true, reason: '이적에 동의했습니다' } : { ok: false, reason: diff < 0 ? '더 큰 구단으로 가고 싶어 합니다' : '지금 구단에 남고 싶어 합니다' };
}

// ── 협상 횟수 · 결렬 ──────────────────────────────
/** 이적료 · 주급 각각 이 횟수 안에 합의 못 하면 협상 결렬 */
export const MAX_TRIES = 3;
/** 결렬되면 이 날짜까지 다시 협상 불가: 이적시장 중이면 그 이적시장 끝까지, 닫혀 있으면(자유계약) 30일 */
export const banUntil = (w: World) => windowEnd(w.season, w.date) ?? addDays(w.date, 30);
export function talkBanned(w: World, playerId: string): string | null {
  const until = w.talkBan?.[playerId];
  return until && until >= w.date ? until : null;
}
/** 진행 중인 협상 (없거나 기한이 지났으면 새로) */
export function talkOf(w: World, playerId: string) {
  const t = w.talks?.[playerId];
  if (t && t.until >= w.date) return t;
  return ((w.talks ??= {})[playerId] = { fee: 0, wage: 0, until: banUntil(w) });
}
export function breakTalks(w: World, playerId: string) {
  (w.talkBan ??= {})[playerId] = banUntil(w);
  if (w.talks) delete w.talks[playerId];
}

// ── 이적 실행 ────────────────────────────────────────
export function completeTransfer(w: World, p: PlayerState, to: string, fee: number, wage: number, years: number): GameEvent {
  const from = p.clubId;
  p.role = undefined;   // 새 구단에서 역할은 새로 (사용자는 계약 때 약속)
  if (from) {
    const s = w.clubs[from];
    s.squad = s.squad.filter((id) => id !== p.id);
    book(w, from, 'sales', fee);
    s.sales = (s.sales ?? 0) + fee;               // 재정 규정 한도에 더해지는 판매 수입
    s.finance.transferBudget += Math.round(fee * 0.5);
    if (s.lineup) s.lineup = { starters: s.lineup.starters.map((x) => (x === p.id ? null : x)), bench: s.lineup.bench.filter((x) => x !== p.id) };
  }
  const b = w.clubs[to];
  b.squad.push(p.id);
  book(w, to, 'purchases', fee);
  b.finance.transferBudget = Math.max(0, b.finance.transferBudget - fee);
  p.clubId = to;
  p.wage = wage;
  p.lastFee = fee;
  p.contract = `${+w.date.slice(0, 4) + years + (w.date.slice(5) >= '07-01' ? 1 : 0)}-06-30`;
  // 이적료 상각: 계약 기간 동안 해마다 이적료 ÷ 연수 (재정 규정의 선수단 비용)
  p.amort = fee > 0 ? Math.round(fee / Math.max(1, years)) : undefined;
  p.amortEnd = fee > 0 ? p.contract : undefined;
  p.loyalty = 50 + p.hidden.loyalty;          // 새 구단에서 다시 시작
  p.buyout = undefined; p.buyoutClub = undefined;   // 바이아웃은 새 계약에서 새로 (내 구단은 계약 때 정함)
  p.benchStreak = 0;
  p.unhappy = false;
  p.morale = Math.min(100, p.morale + 10);
  w.transferList = (w.transferList ?? []).filter((id) => id !== p.id);
  w.offers = (w.offers ?? []).filter((o) => o.player !== p.id);
  if (w.talks) delete w.talks[p.id];
  return { type: 'transfer', date: w.date, player: p.id, from, to, fee, user: from === w.userClubId || to === w.userClubId };
}

export function releasePlayer(w: World, p: PlayerState): void {
  if (!p.clubId) return;
  w.offers = (w.offers ?? []).filter((o) => o.player !== p.id);
  const c = w.clubs[p.clubId];
  c.squad = c.squad.filter((id) => id !== p.id);
  p.clubId = null;
  p.contract = null;
  p.amort = undefined;   // 방출하면 남은 상각은 없어진 것으로 (단순화)
  p.amortEnd = undefined;
  w.transferList = (w.transferList ?? []).filter((id) => id !== p.id);
}

// ── AI 구단 이적 (이적시장 동안 매일) ─────────────────
const MIN_GROUP: Record<string, number> = { GK: 2, DF: 7, MF: 7, FW: 4 };

function needs(w: World, clubId: string): string[] {
  const ps = w.clubs[clubId].squad.map((id) => w.players[id]);
  const out: string[] = [];
  for (const [g, n] of Object.entries(MIN_GROUP)) if (ps.filter((p) => posGroup(p.pos) === g).length < n) out.push(g);
  return out;
}

/** 구단 주전 11명 평균 능력 */
export function clubLevel(w: World, clubId: string): number {
  const mine = w.clubs[clubId].squad.map((id) => overall(w.players[id])).sort((a, b) => b - a);
  return mine.slice(0, 11).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(11, mine.length));
}

/**
 * 내 선수에게 오는 영입 제안 (이적시장 동안 매일)
 *  - 이적 명단 선수: 자주 (하루 18%). 시장 가치의 75~105%로 시작, 최대 95~120%까지 올릴 수 있음
 *  - 명단에 없는 선수: 가끔 (하루 0.6%). 팔 생각이 없는 선수라 100~125%로 시작, 최대 120~160%
 * 관심 구단 = 이 선수가 주전 · 로테이션급인 구단 (팀 수준 −7 ~ +4), 이적료 · 주급을 감당할 수 있고 선수도 갈 마음이 있는 곳.
 * 최대 금액(max)은 화면에 보이지 않고, 감독이 역제안하면 이 안에서 협상한다.
 */
function userOffers(w: World, rng: Rng, active: World['clubs'][string][]) {
  const offers = (w.offers ??= []);
  const listed = new Set(w.transferList ?? []);
  for (const id of w.clubs[w.userClubId].squad) {
    const p = w.players[id];
    if (p.loan || p.precontract) continue;   // 빌려 온 선수 · 사전 계약한 선수에게는 제안이 오지 않는다
    const onList = listed.has(id);
    if (!rng.chance(onList ? 0.18 : 0.006)) continue;
    if (offers.filter((o) => o.player === id).length >= 3) continue;
    const ovr = overall(p);
    const value = Math.max(marketValue(w, p), 250000);
    const wage = wageDemand(w, p);
    const cands = active.filter((c) => {
      if (offers.some((o) => o.player === id && o.from === c.id) || talkBanned(w, `${id}:${c.id}`)) return false;
      const lv = clubLevel(w, c.id);
      return ovr >= lv - 7 && ovr <= lv + 4 && c.finance.transferBudget >= value * (onList ? 0.6 : 1)
        && wage <= wageRoom(w, c.id) && withinRules(w, c.id, wage, value, 3).ok && playerWillJoin(w, p, c.id, wage).ok;
    });
    if (!cands.length) continue;
    const club = rng.pick(cands);
    const budget = club.finance.transferBudget;
    const r50 = (v: number) => Math.round(v / 50000) * 50000;
    const fee = r50(Math.min(value * (onList ? 0.75 + rng.next() * 0.3 : 1 + rng.next() * 0.25), budget));
    const max = Math.max(fee, r50(Math.min(value * (onList ? 0.95 + rng.next() * 0.25 : 1.2 + rng.next() * 0.4), budget)));
    offers.push({ id: `${w.date}-${club.id}-${id}`, player: id, from: club.id, fee, max, tries: 0, date: w.date, expires: addDays(w.date, 7), ...(onList ? {} : { unsolicited: true }) });
    w.inbox.push({ type: 'offer', date: w.date, player: id, from: club.id, fee });
  }
}

/** 받은 제안에 내가 부른 값: 받아들이거나, 금액을 올리거나, 거절. 3번 안에 합의 못 하면 그 구단은 이번 이적시장 동안 손을 뗀다 */
export function counterOffer(w: World, o: TransferOffer, ask: number): { result: 'accept' | 'raise' | 'reject' | 'withdraw'; fee: number; reason: string } {
  const max = o.max ?? Math.round(o.fee * 1.15 / 50000) * 50000;
  o.tries = (o.tries ?? 0) + 1;
  const M = (v: number) => `${Math.round(v / 1e5) / 10}M 유로`;
  // 지금 제안보다 낮게 부르면 지금 제안 금액 그대로
  if (ask <= max) { o.fee = Math.max(ask, o.fee); return { result: 'accept', fee: o.fee, reason: `${M(o.fee)}에 동의했습니다` }; }
  const left = MAX_TRIES - o.tries;
  if (left <= 0) {
    w.offers = (w.offers ?? []).filter((x) => x.id !== o.id);
    (w.talkBan ??= {})[`${o.player}:${o.from}`] = banUntil(w);
    return { result: 'withdraw', fee: o.fee, reason: '원하는 가격이 너무 높다며 영입을 포기했습니다. 이번 이적시장 동안 다시 제안하지 않습니다' };
  }
  if (ask <= max * 1.3) {
    // 부른 값과 한도 사이에서 조금씩 올린다 (마지막 기회면 한도까지)
    const step = left === 1 ? max : Math.round((o.fee + (max - o.fee) * 0.6) / 50000) * 50000;
    o.fee = Math.max(o.fee, Math.min(max, step));
    return { result: 'raise', fee: o.fee, reason: `원하는 가격보다 높습니다. ${M(o.fee)}까지 올리겠습니다` };
  }
  return { result: 'reject', fee: o.fee, reason: `너무 비쌉니다. ${M(o.fee)} 제안은 그대로 유효합니다` };
}

/**
 * 하루치 AI 이적. 실제 이적시장처럼 너무 많지 않게: 하루 최대 몇 건.
 * 사용자 선수는 이적 명단에 올린 경우에만 제안이 들어온다 (제안은 받은편지함으로).
 */
/** 유효한 제안만 남긴다: 기한 안 · 아직 내 선수 · 이적시장이 열려 있음 · 은퇴하지 않음 */
export const offerValid = (w: World, o: TransferOffer) => o.expires >= w.date && !!windowOpen(w.season, w.date)
  && w.players[o.player]?.clubId === w.userClubId && !w.players[o.player]?.retired;
export function cleanOffers(w: World) {
  if (w.offers?.length) w.offers = w.offers.filter((o) => offerValid(w, o));
}

/**
 * 선수단 긴급 보강 (매일, 이적시장과 관계없이 · 자유계약 선수만): 인원(25명)이 모자라거나 포지션 최소 인원이 안 되는 AI 구단.
 * 구단마다 하루 1명. 자유계약 선수 중 그 포지션에서 능력이 가장 높은 선수 (구단 수준보다 너무 높지 않게), 35세 이하.
 * 이적료가 없는 자유계약 선수만, 주급은 주급 예산의 남은 여유 안에서 (AI · 사용자 같은 규칙).
 * 일자리가 없는 선수라 요구 주급의 60%까지는 받아들인다. 여유 안에서 데려올 수 있는 선수가 없으면 보강하지 않는다
 */
export const MIN_SQUAD = 25;
export function aiFillSquads(w: World, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const fa = Object.values(w.players).filter((p) => !p.clubId && !p.retired && ageOn(p.birth, w.date) <= 35);
  if (!fa.length) return events;
  const taken = new Set<string>();
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId || !w.competitions[club.league]) continue;
    const need = needs(w, club.id);
    if (!need.length && club.squad.length >= MIN_SQUAD) continue;
    // 골키퍼가 가장 급하다
    const group = need.includes('GK') ? 'GK' : need.length ? rng.pick(need) : rng.pick(['DF', 'MF', 'FW']);
    const level = clubLevel(w, club.id);
    // 급할 때(20명 미만 · 골키퍼 없음)는 이사회 주급 예산 대신 재정 규정 한도(매출 기준 상한)까지 쓸 수 있다
    const urgent = club.squad.length < 20 || need.includes('GK');
    const room = urgent ? Math.max(wageRoom(w, club.id), ruleWageRoom(w, club.id)) : wageRoom(w, club.id);
    // 한 명에게 쓸 수 있는 주급 = 남은 여유 ÷ 채울 자리 수 (한 명에게 여유를 다 쓰지 않게)
    const perSlot = room / Math.max(1, MIN_SQUAD - club.squad.length);
    const pool = fa.filter((p) => !taken.has(p.id) && posGroup(p.pos) === group && wageDemand(w, p) * 0.6 <= perSlot)
      .sort((a, b) => overall(b) - overall(a));
    const target = pool.find((p) => overall(p) <= level + 3) ?? pool.at(-1);
    if (!target) {
      // 데려올 수 있는 선수가 없는데 골키퍼가 없거나 16명이 안 되면: 아카데미 선수를 최저 주급으로 승격 (경기를 치를 수 있게)
      if (need.includes('GK') || club.squad.length < 16) {
        const made = youthIntake(w, [club], w.season, 40, { count: 1, academy: true });
        for (const y of made) for (const id of y.players) events.push({ type: 'transfer', date: w.date, player: id, from: null, to: club.id, fee: 0, user: club.id === w.userClubId });
      }
      continue;
    }
    taken.add(target.id);
    events.push(completeTransfer(w, target, club.id, 0, Math.max(500, Math.min(wageDemand(w, target), Math.floor(perSlot / 500) * 500)), rng.int(1, 3)));
  }
  return events;
}

export function aiTransferDay(w: World, rng: Rng): GameEvent[] {
  const events: GameEvent[] = aiFillSquads(w, rng);
  if (!windowOpen(w.season, w.date)) { cleanOffers(w); return events; }
  const active = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && w.competitions[c.league]);
  const players = Object.values(w.players).filter((p) => !p.retired);
  const listed = new Set(w.transferList ?? []);
  // 이적시장 동안 구단마다 하루 8% 확률로 영입 시도 (시즌 약 7번). 목적:
  //  - 포지션 최소 인원 · 25명이 안 되면 보강 (구단 수준 −5 ~ +4)
  //  - 인원이 충분하고 이적 예산이 있으면 전력 보강 (주전 평균보다 나은 선수, +1 ~ +7)
  //  - 30명이 넘으면 가장 약한 선수를 내보냄
  // 후보 몇 명을 보고 예산 · 재정 규정 · 상대 구단 · 선수 마음이 맞는 첫 선수와 계약 (AI · 사용자 같은 규칙)
  const frenzy = windowEnd(w.season, w.date) === w.date ? 3 : 1;   // 데드라인 데이: 막판 영입 3배
  for (const club of active) {
    if (!rng.chance(0.08 * frenzy)) continue;
    if (club.squad.length > 30) {
      const weakest = club.squad.map((id) => w.players[id]).sort((a, b) => overall(a) - overall(b))[0];
      releasePlayer(w, weakest);
      continue;
    }
    const need = needs(w, club.id);
    const upgrade = !need.length && club.squad.length >= 25;
    if (upgrade && club.finance.transferBudget < 1e6) continue;
    const group = need.length ? rng.pick(need) : rng.pick(['DF', 'MF', 'MF', 'FW', 'FW']);
    const level = clubLevel(w, club.id);
    const [lo, hi] = upgrade ? [level + 1, level + 7] : [level - 8, level + 4];
    // 인원을 채울 때는 남은 주급 여유를 채울 자리 수로 나눈 만큼 (×1.5) 안의 선수만 — 비싼 선수 한 명에 여유를 다 쓰지 않게
    const perSlot = upgrade ? Infinity : (wageRoom(w, club.id) / Math.max(1, 25 - club.squad.length)) * 1.5;
    const pool = players.filter((p) => posGroup(p.pos) === group && p.clubId !== club.id
      && (p.clubId !== w.userClubId || listed.has(p.id))
      && overall(p) >= lo && overall(p) <= hi && ageOn(p.birth, w.date) <= 32 && wageDemand(w, p) <= perSlot);
    if (!pool.length) continue;
    // 이적 명단에 오른 선수는 관심을 더 받는다 (실제 시장처럼)
    const onList = pool.filter((p) => listed.has(p.id));
    const cands = [...(onList.length && rng.chance(0.45) ? [rng.pick(onList)] : []), ...Array.from({ length: 6 }, () => rng.pick(pool))]
      .sort((a, b) => overall(b) - overall(a));
    for (const target of cands) {
      const fee = target.clubId ? askingPrice(w, target) : 0;
      const wage = wageDemand(w, target);
      const years = rng.int(2, 5);
      if (!canAfford(w, club.id, fee, wage, years)) continue;
      // 전력 보강은 25명까지 채울 주급 여유를 남겨 둘 때만 (값싼 선수 기준)
      if (upgrade && wageRoom(w, club.id) - wage < Math.max(0, 25 - club.squad.length - 1) * wageForAbility(w, level - 8) * 0.6) continue;

      if (target.clubId === w.userClubId) {
        // 사용자 선수: 제안만 넣는다 (선수가 그 구단으로 갈 마음이 있을 때만)
        if (!playerWillJoin(w, target, club.id, wage).ok) continue;
        const offers = (w.offers ??= []);
        if (!offers.some((o) => o.player === target.id && o.from === club.id)) {
          const f0 = Math.round((fee * (0.85 + rng.next() * 0.25)) / 50000) * 50000;
          const offer: TransferOffer = { id: `${w.date}-${club.id}-${target.id}`, player: target.id, from: club.id, fee: f0, max: Math.max(f0, Math.round(Math.min(fee * 1.2, club.finance.transferBudget) / 50000) * 50000), tries: 0, date: w.date, expires: addDays(w.date, 7) };
          offers.push(offer);
          w.inbox.push({ type: 'offer', date: w.date, player: target.id, from: club.id, fee: offer.fee });
        }
        break;
      }
      if (target.clubId && evaluateBid(w, target, club.id, fee).decision !== 'accept') continue;
      if (!playerWillJoin(w, target, club.id, wage).ok) continue;
      events.push(completeTransfer(w, target, club.id, fee, wage, years));
      // 선수단 정리: 26명이 넘으면 같은 포지션 묶음에서 가장 약한 선수를 내보낸다 (주급 부담 줄이기)
      if (club.squad.length > 26) {
        const out = club.squad.map((id) => w.players[id]).filter((p) => p.id !== target.id && posGroup(p.pos) === posGroup(target.pos)).sort((a, b) => overall(a) - overall(b))[0];
        if (out && overall(out) < overall(target)) releasePlayer(w, out);
      }
      break;
    }
  }
  events.push(...aiBuyoutRaids(w, rng));   // 내 선수 바이아웃 (거절 불가)
  userOffers(w, rng, active);
  // 기한 지난 제안 정리
  cleanOffers(w);
  return events;
}
