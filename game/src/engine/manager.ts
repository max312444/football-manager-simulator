// 감독 (사용자): 계약 · 이사회 신뢰도 · 재계약 · 다른 구단 제안 (러브콜) · 경질 · 구단 이동 · 따라오는 선수
//  - 감독 연봉은 다루지 않는다
//  - 실업 상태는 없다: 경질 · 계약 만료 · 재계약 거절이면 갈 수 있는 구단 몇 곳 중 하나를 고른다 (pendingJob)
import { patienceOf } from './gameSettings';
import type { GameEvent, PlayerState, SeasonRecord, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { sortTable } from './standings';
import { levelOf } from './pyramid';
import { ageOn } from './condition';
import { hireManager, placeDisplaced } from './managers';
import { canAfford, completeTransfer, marketValue, wageDemand, windowOpen } from './transfer';

export interface ManagerOffer { club: string; date: string; until: string; kind: 'offer' | 'renew'; years: number }
export interface ManagerStint { club: string; from: string; to: string | null; why?: 'offer' | 'sacked' | 'expired' | 'declined'; titles?: string[] }
export interface ManagerState {
  /** 감독 명성 0~100 (제안 오는 구단 수준) */
  reputation: number;
  /** 계약 만료일 */
  contract: string;
  /** 이사회 신뢰도 0~100 (성적: 경질 · 재계약) */
  confidence: number;
  /** 이사회 관계 0~100 (예산 분배 · 요청 승인, board.ts) */
  relation?: number;
  /** 최근 거절된 요청 날짜 · 종류별 마지막 요청 날짜 */
  denials?: string[];
  lastAsk?: Partial<Record<'transfer' | 'wage' | 'facility', string>>;
  /** 팬 여론 0~100 (감독에 대한 여론, boardEvents.ts) */
  fanMood?: number;
  /** 답을 기다리는 이사회 이벤트 · 마지막 이벤트 날짜 · 약속 (유스 기용 · 이사회가 원하는 선수) · 다음 시즌 예산 감점 · 우승 보너스 */
  boardEvent?: import('./boardEvents').BoardEvent;
  lastBoardEvent?: string;
  youthPledge?: { until: string; base: number };
  wanted?: { player: string; until: string };
  budgetPenalty?: number;
  titleBonus?: number;
  /** 기자회견 (답을 기다리는) · 마지막 기자회견 날짜 · 도발한 경기 (press.ts) */
  press?: import('./press').PressConference;
  lastPress?: string;
  boast?: string;
  /** 지금 구단에 온 날 */
  since: string;
  history: ManagerStint[];
  offers: ManagerOffer[];
  /** 다른 구단 제안 받기 (이적 희망) */
  open?: boolean;
  /** 이번 계약 재계약 결정 (renew: 제안함 · none: 안 함 · declined: 감독이 거절) */
  renewal?: { contract: string; result: 'renew' | 'none' | 'declined' };
  /** 시즌 끝에 경질 */
  sackAtEnd?: boolean;
  /** 새 구단을 골라야 함 (계속 진행 막음) */
  pendingJob?: { reason: 'sacked' | 'expired' | 'declined'; clubs: string[] };
  /** 감독을 따라 이적하고 싶어 하는 선수 (다음 이적시장에 처리) */
  followers?: { player: string; from: string; to: string; until: string }[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const shuffle = <T,>(rng: Rng, arr: T[]) => arr.map((x) => [rng.next(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** 시즌이 끝나는 해 (2025-26 → 2026) */
const endYear = (season: string) => +season.slice(0, 4) + 1;
const strength = (w: World, club: string) => {
  const top = w.clubs[club].squad.map((id) => overall(w.players[id])).sort((a, b) => b - a).slice(0, 11);
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
};

/** 이사회 목표 순위 (주전 전력 순위로, 화면 '이사회 기대' 와 같은 규칙) */
export function boardTarget(w: World, club = w.userClubId): number {
  const lg = w.clubs[club].league;
  const ids = Object.keys(w.competitions[lg]?.table ?? {});
  if (!ids.length) return 1;
  const n = ids.length;
  const rank = [...ids].sort((a, b) => strength(w, b) - strength(w, a)).indexOf(club) + 1;
  if (levelOf(lg) >= 2) return rank <= 2 ? 2 : rank <= 6 ? 6 : rank <= n - 6 ? Math.ceil(n / 2) : n - 3;
  return rank === 1 ? 1 : rank <= 4 ? 4 : rank <= 7 ? 7 : rank <= n - 6 ? Math.ceil(n / 2) : n - 3;
}

/** 감독 정보 (옛 세이브면 지금 만든다) */
export function ensureManager(w: World): ManagerState {
  if (!w.manager) {
    const c = w.clubs[w.userClubId];
    w.manager = {
      reputation: clamp(Math.round(c.reputation - 5), 30, 95),
      contract: `${endYear(w.season) + 2}-06-30`,
      confidence: 60, since: w.date,
      history: [{ club: c.id, from: w.date, to: null }], offers: [],
    };
  }
  return w.manager;
}

export const confidenceLabel = (v: number) => (v >= 80 ? '매우 높음' : v >= 60 ? '높음' : v >= 40 ? '보통' : v >= 25 ? '낮음' : '위험');

/** 제안할 만한 구단 (감독 명성 근처, 1 · 2부) */
function candidates(w: World, lo: number, hi: number, exclude: string[]): string[] {
  return Object.values(w.clubs)
    .filter((c) => w.competitions[c.league] && !exclude.includes(c.id) && c.reputation >= lo && c.reputation <= hi && !c.id.startsWith('nt-'))
    .map((c) => c.id);
}

/** 갈 수 있는 구단 (경질 · 계약 만료 때): 명성보다 조금 낮은 구단 위주로 3곳 */
export function jobOffers(w: World, rng: Rng, n = 3): string[] {
  const m = ensureManager(w);
  const ex = [w.userClubId];
  for (let span = 0; span <= 40; span += 8) {
    const pool = candidates(w, m.reputation - 18 - span, m.reputation + 2, ex);
    if (pool.length >= n) return shuffle(rng, pool).slice(0, n);
  }
  return shuffle(rng, candidates(w, 0, 100, ex)).slice(0, n);
}

/** 감독 이동: 사용자 구단을 바꾼다 (선발 · 협상 · 제안 정리) + 따라오고 싶은 선수 */
export function moveTo(w: World, club: string, why: ManagerStint['why'], rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  const old = w.userClubId;
  const events: GameEvent[] = [];
  const tenure = (Date.parse(w.date) - Date.parse(m.since)) / 864e5;
  const cur = m.history.find((h) => h.to === null);
  if (cur) { cur.to = w.date; cur.why = why; }
  m.history.push({ club, from: w.date, to: null });
  // 따라오고 싶은 선수: 1시즌 넘게 함께한 · 충성도 높은 · 32세 이하 · 새 구단 수준에 맞는 선수 (최대 2명, 반반 확률)
  if (tenure >= 300) {
    const bar = strength(w, club) - 4;
    const fans = w.clubs[old].squad.map((id) => w.players[id])
      .filter((p) => p.loyalty >= 70 && ageOn(p.birth, w.date) <= 32 && overall(p) >= bar && p.stats.apps + p.stats.subApps + p.career.filter((c) => c.club === old).reduce((s, c) => s + c.apps, 0) >= 20)
      .sort((a, b) => overall(b) - overall(a)).slice(0, 4).filter(() => rng.chance(0.5)).slice(0, 2);
    if (fans.length) {
      m.followers = [...(m.followers ?? []), ...fans.map((p) => ({ player: p.id, from: old, to: club, until: addDays(w.date, 240) }))];
      events.push({ type: 'manager', date: w.date, kind: 'follow', club: old, players: fans.map((p) => p.id) });
    }
  }
  w.clubs[old].lineup = null;
  w.userClubId = club;
  // 감독 자리: 새 구단 감독은 실업자로, 떠난 구단은 새 감독
  if (w.managers) {
    const was = w.clubs[club].managerId;
    w.clubs[club].managerId = undefined;
    if (was && w.managers[was]) {
      const moved = placeDisplaced(w, w.managers[was]);
      if (moved) events.push({ type: 'coach', date: w.date, club: moved.club, when: 'end', news: true, manager: was, old: moved.old });
    }
    if (w.managers.user) { w.managers.user.clubId = club; w.managers.user.since = w.date; }
    hireManager(w, old, rng);
  }
  m.since = w.date;
  m.confidence = 60;
  m.relation = 55; m.denials = []; m.lastAsk = {};
  m.press = undefined; m.boast = undefined;
  m.fanMood = 55; m.boardEvent = undefined; m.youthPledge = undefined; m.wanted = undefined; m.budgetPenalty = undefined; m.titleBonus = 0;
  m.offers = [];
  m.renewal = undefined;
  m.sackAtEnd = false;
  m.pendingJob = undefined;
  m.contract = `${endYear(w.season) + 2}-06-30`;   // 이번 시즌 포함 3시즌 (시즌 중이면 2시즌 반)
  // 내 구단에만 있던 상태 정리
  w.transferList = []; w.offers = []; w.talks = {}; w.pendingRenewals = []; w.sponsorOffers = [];
  events.push({ type: 'manager', date: w.date, kind: 'moved', club, from: old });
  return events;
}

/** 따라오고 싶은 선수 이적 (이적시장이 열려 있을 때, 시장가 · 새 구단이 감당할 수 있으면) */
function followerDay(w: World): GameEvent[] {
  const m = w.manager;
  if (!m?.followers?.length || !windowOpen(w.season, w.date)) return [];
  const events: GameEvent[] = [];
  const left: NonNullable<ManagerState['followers']> = [];
  for (const f of m.followers) {
    const p = w.players[f.player];
    if (!p || p.retired || p.clubId !== f.from || f.to !== w.userClubId || f.until < w.date) continue;   // 이미 떠났거나 · 감독이 또 옮겼거나 · 기한 지남
    const fee = Math.round(marketValue(w, p) / 1e5) * 1e5;
    const wage = Math.max(p.wage, Math.round(wageDemand(w, p) * 0.9 / 500) * 500);
    if (!canAfford(w, f.to, fee, wage, 3)) { events.push({ type: 'manager', date: w.date, kind: 'followFail', club: f.from, players: [p.id], fee }); continue; }
    events.push(completeTransfer(w, p, f.to, fee, wage, 3));
    events.push({ type: 'manager', date: w.date, kind: 'followDone', club: f.from, players: [p.id], fee });
  }
  m.followers = left;
  return events;
}

/** 하루: 신뢰도 (매달 1일) · 경질 · 재계약 결정 (3월 1일) · 다른 구단 제안 (1일 · 15일) · 제안 만료 · 따라오는 선수 */
export function managerDay(w: World, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  if (m.pendingJob) return [];
  const events: GameEvent[] = [];
  const d = w.date, day = d.slice(8), mon = +d.slice(5, 7);
  const club = w.clubs[w.userClubId];
  const comp = w.competitions[club.league];
  const table = comp ? sortTable(comp.table) : [];
  const started = table.some((r) => r.p >= 6);
  const pos = table.findIndex((r) => r.club === club.id) + 1;

  // 신뢰도: 목표 순위와 비교 (매달 1일, 시즌 중)
  if (day === '01' && started && pos > 0 && (mon >= 9 || mon <= 5)) {
    const target = boardTarget(w);
    const pat = patienceOf(w);   // 설정: 이사회 인내심
    const dlt = clamp((target - pos) * 1.5, -8, 6) + (club.finance.balance < 0 ? -3 : 0);
    m.confidence = clamp(m.confidence + (dlt < 0 ? dlt * pat.drop : dlt), 0, 100);
    // 시즌 중 경질 (10월 ~ 4월, 신뢰도 15 미만)
    // 팬 여론이 높으면 (70+) 이사회가 쉽게 경질하지 못한다
    if (m.confidence < pat.mid - ((m.fanMood ?? 60) >= 70 ? 5 : 0) && (mon >= 10 || mon <= 4)) {
      m.pendingJob = { reason: 'sacked', clubs: jobOffers(w, rng) };
      m.reputation = clamp(m.reputation - 4, 20, 99);
      events.push({ type: 'manager', date: d, kind: 'sacked', club: club.id });
      return events;
    }
  }

  // 재계약 결정: 계약 마지막 시즌 3월 1일
  if (d.slice(5) === '03-01' && m.contract <= `${endYear(w.season)}-06-30` && m.renewal?.contract !== m.contract) {
    if (m.confidence >= 45) {
      const years = m.confidence >= 75 ? 3 : 2;
      m.offers.push({ club: club.id, date: d, until: m.contract, kind: 'renew', years });   // 계약 만료일까지 유효 (놓치지 않게)
      m.renewal = { contract: m.contract, result: 'renew' };
      events.push({ type: 'manager', date: d, kind: 'renew', club: club.id, years });
    } else {
      m.renewal = { contract: m.contract, result: 'none' };
      events.push({ type: 'manager', date: d, kind: 'norenew', club: club.id });
    }
  }

  // 다른 구단 제안 (1일 · 15일): 계약 마지막 해 · 성적 좋음 · 이적 희망이면 더 자주
  if ((day === '01' || day === '15') && m.offers.filter((o) => o.kind === 'offer').length < 2) {
    const lastYear = m.contract <= `${endYear(w.season)}-06-30`;
    const good = started && pos > 0 && pos < boardTarget(w);
    const p = 0.03 + (lastYear ? 0.1 : 0) + (m.open ? 0.15 : 0) + (good ? 0.05 : 0) + (m.reputation > club.reputation + 3 ? 0.05 : 0);
    if (rng.chance(p)) {
      const pool = candidates(w, m.reputation - 10, m.reputation + 6, [club.id, ...m.offers.map((o) => o.club)]);
      if (pool.length) {
        const pick = rng.pick(pool);
        m.offers.push({ club: pick, date: d, until: addDays(d, 21), kind: 'offer', years: 3 });
        events.push({ type: 'manager', date: d, kind: 'offer', club: pick });
      }
    }
  }
  // 만료된 제안
  for (const o of m.offers.filter((o) => o.until < d)) {
    if (o.kind === 'renew') m.renewal = { contract: m.contract, result: 'declined' };
  }
  m.offers = m.offers.filter((o) => o.until >= d);

  events.push(...followerDay(w));
  return events;
}

/** 제안 수락: 재계약이면 계약 연장, 다른 구단이면 그 자리에서 이동 */
export function acceptOffer(w: World, idx: number, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  const o = m.offers[idx];
  if (!o) return [];
  if (o.kind === 'renew') {
    m.contract = `${+m.contract.slice(0, 4) + o.years}-06-30`;
    m.confidence = clamp(m.confidence + 5, 0, 100);
    m.offers.splice(idx, 1);
    return [{ type: 'manager', date: w.date, kind: 'renewed', club: w.userClubId, years: o.years }];
  }
  return moveTo(w, o.club, 'offer', rng);
}

export function declineOffer(w: World, idx: number) {
  const m = ensureManager(w);
  const o = m.offers[idx];
  if (!o) return;
  if (o.kind === 'renew') m.renewal = { contract: m.contract, result: 'declined' };
  m.offers.splice(idx, 1);
}

/** 시즌 끝 (순위 확정 뒤): 목표 · 우승 · 강등으로 신뢰도 · 명성. 너무 낮으면 시즌 끝에 경질 */
export function managerSeasonEnd(w: World, recs: SeasonRecord[]): { titles: number; relegated: boolean; met: boolean } | null {
  const m = ensureManager(w);
  const club = w.clubs[w.userClubId];
  const rec = recs.find((r) => r.league === club.league);
  if (!rec) return null;
  const pos = rec.table.findIndex((r) => r.club === club.id) + 1;
  const n = rec.table.length;
  const target = boardTarget(w);
  const titles = (w.cupHistory ?? []).filter((h) => h.season === w.season && h.winner === club.id).length + (pos === 1 ? 1 : 0);
  const relegated = levelOf(club.league) === 1 && pos > n - 3;
  let dc = pos <= target ? 12 + (target - pos) * 2 : -12 - (pos - target) * 2;
  dc += titles * 10;
  if (relegated) dc -= 30;
  if (club.finance.balance < 0) dc -= 5;
  m.confidence = clamp(m.confidence + dc, 0, 100);
  m.reputation = clamp(m.reputation + (pos <= target ? 2 : -2) + titles * 3 + (relegated ? -5 : 0), 20, 99);
  m.relation = clamp((m.relation ?? 55) + titles * 4 + (pos <= target ? 2 : -3), 0, 100);   // 이사회 관계: 우승 · 목표
  const cur = m.history.find((h) => h.to === null);
  if (cur && titles) {
    const won = [...(pos === 1 ? [`${w.season} ${club.league}`] : []), ...(w.cupHistory ?? []).filter((h) => h.season === w.season && h.winner === club.id).map((h) => `${w.season} ${h.cup}`)];
    cur.titles = [...(cur.titles ?? []), ...won];
  }
  if (m.confidence < patienceOf(w).end) m.sackAtEnd = true;
  return { titles, relegated, met: pos <= target };
}

/** 새 시즌 시작 (구단 · 일정이 정해진 뒤): 경질 · 계약 만료 · 재계약 거절이면 새 구단 고르기 */
export function managerNewSeason(w: World, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  m.offers = m.offers.filter((o) => o.kind === 'offer');
  const expired = m.contract < w.date;
  if (!m.sackAtEnd && !expired) return [];
  const reason = m.sackAtEnd ? 'sacked' : m.renewal?.result === 'declined' ? 'declined' : 'expired';
  m.pendingJob = { reason, clubs: jobOffers(w, rng) };
  return [{ type: 'manager', date: w.date, kind: reason === 'sacked' ? 'sacked' : 'expired', club: w.userClubId }];
}

/** 새 구단 고르기 (pendingJob 에서) */
export function chooseJob(w: World, club: string, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  if (!m.pendingJob?.clubs.includes(club)) return [];
  const why = m.pendingJob.reason;
  return moveTo(w, club, why, rng);
}

/** 따라오는 선수 판정용 */
export const followerOf = (w: World, p: PlayerState) => w.manager?.followers?.find((f) => f.player === p.id);
