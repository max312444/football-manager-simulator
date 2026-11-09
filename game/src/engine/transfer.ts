// 이적 엔진: 몸값 · 이적시장 기간 · 영입 제안 판단 · 계약 · AI 구단 이적
import type { GameEvent, PlayerState, TransferOffer, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { posGroup } from '../data/rating';

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

/** 선수가 바라는 주급 (유로/주) */
export function wageDemand(w: World, p: PlayerState): number {
  const ovr = overall(p);
  const byAbility = 1000 * 1.17 ** (ovr - 55) * era(w.season);
  const base = Math.max(byAbility, p.wage * (p.clubId ? 1.1 : 0.9));
  return Math.round(base / 500) * 500;
}

export const wageBill = (w: World, clubId: string) => w.clubs[clubId].squad.reduce((s, id) => s + w.players[id].wage, 0);
/** 주급 예산에서 남은 여유 (음수면 이미 초과) */
export const wageRoom = (w: World, clubId: string) => w.clubs[clubId].finance.wageBudget - wageBill(w, clubId);

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
  const rank = rankInClub(w, p);
  const mult = rank <= 3 ? 1.6 : rank <= 8 ? 1.3 : rank <= 15 ? 1.1 : 0.9;
  const listed = (w.transferList ?? []).includes(p.id) ? 0.85 : 1;
  return Math.round((marketValue(w, p) * mult * listed) / 50000) * 50000;
}

/** 파는 구단의 판단 */
export function evaluateBid(w: World, p: PlayerState, buyer: string, fee: number): BidResult {
  if (!p.clubId) return { decision: 'accept', ask: 0, reason: '자유계약 선수' };
  const seller = w.clubs[p.clubId];
  const ask = askingPrice(w, p);
  const rank = rankInClub(w, p);
  if (seller.squad.length <= 18) return { decision: 'reject', ask, reason: '선수단 인원이 부족해 팔 수 없다고 합니다' };
  // 핵심 선수는 비슷한 급 이상 구단이 크게 쓸 때만
  if (rank <= 2 && w.clubs[buyer].reputation + 5 < seller.reputation && fee < ask * 1.5) return { decision: 'reject', ask, reason: '팀의 핵심 선수라 팔 생각이 없다고 합니다' };
  if (fee >= ask) return { decision: 'accept', ask, reason: '제안을 받아들였습니다' };
  if (fee >= ask * 0.75) return { decision: 'counter', ask, reason: `${Math.round(ask / 1e5) / 10}M 유로면 보내겠다고 합니다` };
  return { decision: 'reject', ask, reason: '제안 금액이 너무 낮다고 합니다' };
}

/** 선수가 이 구단으로 오겠는지 */
export function playerWillJoin(w: World, p: PlayerState, buyer: string, wage: number): { ok: boolean; reason: string } {
  const demand = wageDemand(w, p);
  if (wage < demand * 0.9) return { ok: false, reason: `주급 ${Math.round(demand / 1000)}K 유로 이상을 원합니다` };
  const buyerRep = w.clubs[buyer].reputation;
  const curRep = p.clubId ? w.clubs[p.clubId].reputation : 30;
  const diff = buyerRep - curRep;
  let score = diff / 10 + (wage / Math.max(1, p.wage) - 1) * 2 + ((p.hidden.ambition - 10) / 10) * (diff > 0 ? 1 : -0.6) - (p.loyalty - 50) / 40;
  if (p.unhappy) score += 1;
  // 구단이 이적 명단에 올린 선수는 "팀에서 원하지 않는다"고 느껴 작은 구단 이적도 받아들이기 쉽다
  if ((w.transferList ?? []).includes(p.id)) score += 1.5;
  if (!p.clubId) score += 1.5;
  return score > -0.6 ? { ok: true, reason: '이적에 동의했습니다' } : { ok: false, reason: diff < 0 ? '더 큰 구단으로 가고 싶어 합니다' : '지금 구단에 남고 싶어 합니다' };
}

// ── 이적 실행 ────────────────────────────────────────
export function completeTransfer(w: World, p: PlayerState, to: string, fee: number, wage: number, years: number): GameEvent {
  const from = p.clubId;
  if (from) {
    const s = w.clubs[from];
    s.squad = s.squad.filter((id) => id !== p.id);
    s.finance.balance += fee;
    s.finance.transferBudget += Math.round(fee * 0.5);
    if (s.lineup) s.lineup = { starters: s.lineup.starters.map((x) => (x === p.id ? null : x)), bench: s.lineup.bench.filter((x) => x !== p.id) };
  }
  const b = w.clubs[to];
  b.squad.push(p.id);
  b.finance.balance -= fee;
  b.finance.transferBudget = Math.max(0, b.finance.transferBudget - fee);
  p.clubId = to;
  p.wage = wage;
  p.contract = `${+w.date.slice(0, 4) + years + (w.date.slice(5) >= '07-01' ? 1 : 0)}-06-30`;
  p.loyalty = 50 + p.hidden.loyalty;          // 새 구단에서 다시 시작
  p.benchStreak = 0;
  p.unhappy = false;
  p.morale = Math.min(100, p.morale + 10);
  w.transferList = (w.transferList ?? []).filter((id) => id !== p.id);
  w.offers = (w.offers ?? []).filter((o) => o.player !== p.id);
  return { type: 'transfer', date: w.date, player: p.id, from, to, fee, user: from === w.userClubId || to === w.userClubId };
}

export function releasePlayer(w: World, p: PlayerState): void {
  if (!p.clubId) return;
  const c = w.clubs[p.clubId];
  c.squad = c.squad.filter((id) => id !== p.id);
  p.clubId = null;
  p.contract = null;
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

/**
 * 하루치 AI 이적. 실제 이적시장처럼 너무 많지 않게: 하루 최대 몇 건.
 * 사용자 선수는 이적 명단에 올린 경우에만 제안이 들어온다 (제안은 받은편지함으로).
 */
export function aiTransferDay(w: World, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  if (!windowOpen(w.season, w.date)) return events;
  const active = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && w.competitions[c.league]);
  const players = Object.values(w.players).filter((p) => !p.retired);
  const tries = 6;
  for (let t = 0; t < tries; t++) {
    const club = active[rng.int(0, active.length - 1)];
    const need = needs(w, club.id);
    if (!need.length && club.squad.length >= 24 && !rng.chance(0.15)) continue;   // 필요할 때 위주로
    const group = need.length ? rng.pick(need) : rng.pick(['DF', 'MF', 'FW']);
    const mine = club.squad.map((id) => overall(w.players[id])).sort((a, b) => b - a);
    const level = mine.slice(0, 11).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(11, mine.length));
    const listed = new Set(w.transferList ?? []);
    const pool = players.filter((p) => posGroup(p.pos) === group && p.clubId !== club.id
      && (p.clubId !== w.userClubId || listed.has(p.id))
      && overall(p) >= level - 4 && overall(p) <= level + 5 && ageOn(p.birth, w.date) <= 32);
    if (!pool.length) continue;
    // 이적 명단에 오른 선수는 관심을 더 받는다 (실제 시장처럼)
    const onList = pool.filter((p) => listed.has(p.id));
    const target = onList.length && rng.chance(0.45) ? rng.pick(onList) : rng.pick(pool.slice(0, 400));
    const fee = target.clubId ? askingPrice(w, target) : 0;
    if (fee > club.finance.transferBudget) continue;
    const wage = wageDemand(w, target);
    if (wageBill(w, club.id) + wage > club.finance.wageBudget * 1.05) continue;

    if (target.clubId === w.userClubId) {
      // 사용자 선수: 제안만 넣는다 (선수가 그 구단으로 갈 마음이 있을 때만)
      if (!playerWillJoin(w, target, club.id, wage).ok) continue;
      const offers = (w.offers ??= []);
      if (!offers.some((o) => o.player === target.id && o.from === club.id)) {
        const offer: TransferOffer = { id: `${w.date}-${club.id}-${target.id}`, player: target.id, from: club.id, fee: Math.round((fee * (0.85 + rng.next() * 0.25)) / 50000) * 50000, date: w.date, expires: addDays(w.date, 7) };
        offers.push(offer);
        w.inbox.push({ type: 'offer', date: w.date, player: target.id, from: club.id, fee: offer.fee });
      }
      continue;
    }
    if (target.clubId && evaluateBid(w, target, club.id, fee).decision !== 'accept') continue;
    if (!playerWillJoin(w, target, club.id, wage).ok) continue;
    events.push(completeTransfer(w, target, club.id, fee, wage, rng.int(2, 5)));
  }
  // 기한 지난 제안 정리
  if (w.offers) w.offers = w.offers.filter((o) => o.expires >= w.date && w.players[o.player]?.clubId === w.userClubId);
  return events;
}
