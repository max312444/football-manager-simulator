// 뉴스 · 이적 소문
//
// 뉴스: 리그 전체의 큰 소식 (w.news, 최근 250개)
//  - 이적: 내 구단 관련 · 이적료 2천만 유로 이상 · 능력 80 이상 선수
//  - 바이아웃 · 보스만 사전 계약 · 급매물(강제 매각 · 강등 조항) · 감독 교체 · 데드라인 데이 결산
//
// 이적 소문: 이적시장 기간과 그 직전 (6월 · 12월)에 하루 0~2개
//  - 출처 신뢰도 ★1~5. 신뢰도가 높을수록 실제로 추진하는 이적일 가능성이 크다 (★1 10% · ★2 25% · ★3 45% · ★4 65% · ★5 85%)
//  - 실제 추진: 그 구단이 감당할 수 있고 선수도 갈 마음이 있는 이적 → 정한 날(이적시장 안)에 실제로 시도
//      다른 구단 선수: 구단이 부르는 값에 합의되면 이적 (안 되면 무산)
//      내 선수: 그 구단의 영입 제안이 받은편지함으로 (수락 여부는 감독이)
//  - 근거 없는 소문: 큰 구단 · 스타 선수 조합 (대부분 무산)
//  - 그 선수가 실제로 그 구단으로 가면 '사실로 확인', 이적시장이 끝날 때까지 안 되면 '무산'
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { askingPrice, canAfford, clubLevel, completeTransfer, evaluateBid, marketValue, playerWillJoin, wageDemand, windowEnd, windowOpen } from './transfer';

export type NewsKind = 'rumour' | 'transfer' | 'buyout' | 'bosman' | 'firesale' | 'releg' | 'coach' | 'deadline';
export interface NewsItem {
  id: string; date: string; kind: NewsKind;
  player?: string; from?: string | null; to?: string; fee?: number;
  /** 소문: 출처 신뢰도 1~5 · 진행 상태 · 실제로 추진하는지 (화면에 안 보임) · 시도하는 날 · 끝나는 날 */
  stars?: number; status?: 'open' | 'true' | 'false'; real?: boolean; due?: string; until?: string;
  /** 데드라인 데이 결산 · 감독 교체 등 */
  count?: number; club?: string; text?: string;
}

const MAX = 250;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const REAL_P = [0, 0.1, 0.25, 0.45, 0.65, 0.85];

function push(w: World, n: Omit<NewsItem, 'id'>) {
  const list = (w.news ??= []);
  list.push({ ...n, id: `${n.date}-${list.length}-${n.kind}-${n.player ?? n.club ?? ''}` });
  if (list.length > MAX) list.splice(0, list.length - MAX);
}

/** 소문이 도는 기간: 이적시장 + 그 직전 한 달 (6월 · 12월). 끝나는 날 = 그 이적시장 마감 */
function rumourSeason(w: World): { until: string; opens: string } | null {
  const y = +w.season.slice(0, 4), d = w.date;
  const summer = { opens: `${y}-07-01`, until: windowEnd(w.season, `${y}-07-01`)! };
  const winter = { opens: `${y + 1}-01-01`, until: `${y + 1}-01-31` };
  if (d >= `${y}-06-01` && d <= summer.until) return summer;
  if (d >= `${y}-12-01` && d <= winter.until) return winter;
  if (d >= `${y + 1}-06-01`) return { opens: `${y + 1}-07-01`, until: `${y + 1}-09-01` };   // 시즌 끝 6월: 다음 여름
  return null;
}

const pickWeighted = <T,>(rng: Rng, xs: T[], wt: (x: T) => number) => (xs.length ? rng.weighted(xs, wt) : null);

/** 소문 하나 만들기 */
function makeRumour(w: World, rng: Rng, win: { until: string; opens: string }): NewsItem | null {
  const clubs = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && w.competitions[c.league] && !c.id.startsWith('nt-'));
  const stars = 1 + Math.min(4, Math.floor(rng.next() * 5));
  const real = rng.chance(REAL_P[stars]);
  const aboutMine = rng.chance(0.2);
  const busy = new Set((w.news ?? []).filter((n) => n.kind === 'rumour' && n.status === 'open').map((n) => `${n.player}:${n.to}`));
  const ok = (p: PlayerState) => !p.retired && !p.loan && !p.precontract && !!p.clubId && !p.clubId.startsWith('nt-') && ageOn(p.birth, w.date) <= 33;
  if (real) {
    // 실제로 추진할 만한 이적: 그 구단 주전급 (수준 +1 ~ +7), 이적료 · 주급 감당, 선수도 갈 마음
    const buyer = pickWeighted(rng, clubs, (c) => c.reputation ** 2);
    if (!buyer) return null;
    const lv = clubLevel(w, buyer.id);
    const pool = (aboutMine ? w.clubs[w.userClubId].squad.map((id) => w.players[id]) : Object.values(w.players))
      .filter((p) => ok(p) && p.clubId !== buyer.id && (aboutMine || p.clubId !== w.userClubId)
        && overall(p) >= lv + 1 && overall(p) <= lv + 7 && !busy.has(`${p.id}:${buyer.id}`));
    const cands: PlayerState[] = [];
    const sample = new Set<PlayerState>();
    for (let i = 0; i < 60 && sample.size < 40 && pool.length; i++) sample.add(rng.pick(pool));
    for (const p of sample) {
      if (canAfford(w, buyer.id, askingPrice(w, p), wageDemand(w, p), 4) && playerWillJoin(w, p, buyer.id, wageDemand(w, p)).ok) cands.push(p);
      if (cands.length >= 5) break;
    }
    const p = cands.length ? rng.pick(cands) : null;
    if (!p) return null;
    const due = addDays(w.date > win.opens ? w.date : win.opens, rng.int(2, 20));
    return { id: '', date: w.date, kind: 'rumour', player: p.id, from: p.clubId, to: buyer.id, stars, status: 'open', real: true, due: due > win.until ? win.until : due, until: win.until };
  }
  // 근거 없는 소문: 큰 구단 × 스타 (내 선수 또는 다른 구단)
  const big = clubs.filter((c) => c.reputation >= 80);
  const buyer = big.length ? rng.pick(big) : null;
  if (!buyer) return null;
  const pool = (aboutMine ? w.clubs[w.userClubId].squad.map((id) => w.players[id]) : Object.values(w.players))
    .filter((p) => ok(p) && p.clubId !== buyer.id && (aboutMine || p.clubId !== w.userClubId) && overall(p) >= (aboutMine ? 0 : 80));
  const sorted = pool.sort((a, b) => overall(b) - overall(a)).slice(0, aboutMine ? 6 : 60);
  const p = sorted.length ? rng.pick(sorted) : null;
  if (!p || busy.has(`${p.id}:${buyer.id}`)) return null;
  return { id: '', date: w.date, kind: 'rumour', player: p.id, from: p.clubId, to: buyer.id, stars, status: 'open', real: false, until: win.until };
}

/** 정한 날: 실제로 추진하는 소문의 이적 시도 */
function pursue(w: World, n: NewsItem, rng: Rng): GameEvent[] {
  const p = w.players[n.player!];
  const buyer = n.to!;
  n.due = undefined;
  if (!p || p.clubId !== n.from || p.loan || p.precontract || !w.clubs[buyer]) return [];
  if (p.clubId === w.userClubId) {
    // 내 선수: 영입 제안으로 (수락 · 거절 · 역제안은 감독이)
    const value = Math.max(marketValue(w, p), 250000);
    const fee = Math.round(Math.min(value * (1 + rng.next() * 0.25), w.clubs[buyer].finance.transferBudget) / 50000) * 50000;
    if (fee < value * 0.8) return [];
    const offers = (w.offers ??= []);
    if (offers.some((o) => o.player === p.id && o.from === buyer)) return [];
    offers.push({ id: `${w.date}-${buyer}-${p.id}`, player: p.id, from: buyer, fee, max: Math.round(fee * (1.15 + rng.next() * 0.2) / 50000) * 50000, tries: 0, date: w.date, expires: addDays(w.date, 7), unsolicited: true });
    w.inbox.push({ type: 'offer', date: w.date, player: p.id, from: buyer, fee });
    return [];
  }
  const fee = askingPrice(w, p);
  const wage = wageDemand(w, p);
  if (evaluateBid(w, p, buyer, fee).decision !== 'accept' || !canAfford(w, buyer, fee, wage, 4) || !playerWillJoin(w, p, buyer, wage).ok) return [];
  return [completeTransfer(w, p, buyer, fee, wage, 4)];
}

/**
 * 하루치 뉴스 (advanceDay 끝, 날짜를 넘기기 전): 오늘 일어난 일 → 뉴스, 소문 진행 · 확인 · 무산, 새 소문
 * 돌려주는 이벤트: 소문이 실제로 성사된 이적
 */
export function newsDay(w: World, events: GameEvent[], rng: Rng): GameEvent[] {
  const out: GameEvent[] = [];
  const today = w.date;
  const open = (w.news ?? []).filter((n) => n.kind === 'rumour' && n.status === 'open');
  // 실제로 추진하는 소문: 정한 날 · 이적시장 안이면 시도
  if (windowOpen(w.season, today)) for (const n of open) if (n.real && n.due && n.due <= today) out.push(...pursue(w, n, rng));
  const all = [...events, ...out];

  // 오늘 일어난 일 → 뉴스
  let deadlineCount = 0, deadlineFee = 0;
  const deadline = windowEnd(w.season, today) === today;
  for (const e of all) {
    if (e.type === 'transfer') {
      if (deadline && e.from) { deadlineCount++; deadlineFee += e.fee; }
      const p = w.players[e.player];
      if (e.user || e.fee >= 20e6 || (p && overall(p) >= 80)) push(w, { date: today, kind: 'transfer', player: e.player, from: e.from, to: e.to, fee: e.fee });
    } else if (e.type === 'coach' && e.news) push(w, { date: today, kind: 'coach', club: e.club, text: e.when });
  }
  // 받은편지함에만 들어간 오늘 소식 (바이아웃 · 보스만 · 급매물)
  for (const e of w.inbox) {
    if (e.date !== today) continue;
    if (e.type === 'buyout') push(w, { date: today, kind: 'buyout', player: e.player, from: w.userClubId, to: e.to, fee: e.fee });
    else if (e.type === 'bosman') push(w, { date: today, kind: 'bosman', player: e.player, from: w.players[e.player]?.clubId ?? null, to: e.to });
    else if (e.type === 'bargain') for (const id of e.players) {
      const b = (w.bargains ?? []).find((x) => x.player === id);
      if (b && !(w.news ?? []).some((n) => (n.kind === 'firesale' || n.kind === 'releg') && n.player === id && n.date === today)) push(w, { date: today, kind: b.kind === 'fire' ? 'firesale' : 'releg', player: id, from: b.club, fee: b.price });
    }
  }
  if (deadline && deadlineCount) push(w, { date: today, kind: 'deadline', count: deadlineCount, fee: deadlineFee });

  // 소문 확인: 그 선수가 그 구단으로 갔으면 사실, 이적시장이 끝났으면 무산
  for (const n of open) {
    const p = w.players[n.player!];
    if (p?.clubId === n.to) n.status = 'true';
    else if (!p || p.clubId !== n.from || (n.until && today >= n.until && !windowOpen(w.season, addDays(today, 1)))) n.status = 'false';
  }

  // 새 소문 (하루 0~2개)
  const win = rumourSeason(w);
  if (win) for (let i = 0; i < 2; i++) {
    if (!rng.chance(i === 0 ? 0.6 : 0.25)) break;
    const r = makeRumour(w, rng, win);
    if (r) push(w, r);
  }
  return out;
}
