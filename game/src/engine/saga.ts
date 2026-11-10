// 선수 언론 플레이 (사가): 연봉 인상 요구 · 이적 요청 (특정 구단 지목) → 태업으로 커짐 → 이적 · 재계약 · 약속으로 끝남
//  단계: 0 에이전트 발언 · 1 공개 인터뷰 · 2 훈련 불참 · 3 출전 거부
//  - 시작: 매달 5일 · 20일, 성격 (야망 · 프로의식 · 충성도) 과 상황 (시세보다 낮은 주급 · 빅클럽 관심 · 출전 불만) 으로 확률
//  - 커짐: 약 2주마다. 0→1 (공개 인터뷰) 은 프로의식이 낮을수록 잘 커지고,
//    태업 (2 · 3단계) 은 극히 드물게 — 성격이 아주 나쁜 선수 (canStrike) 만, 이적시장 기간에, 25% 확률
//  - 이적 요청: 지목한 구단이 실제로 제안 (단계가 오를수록 이적료를 깎음, 우리 협상력 ↓)
//  - 영향: 1단계+ 팀 사기 −, 2단계 훈련 성장 − · 사기 바닥, 3단계 선발 불가
//  - 대응 (사용자): 대화 · 약속, 징계 (벌금), 공개 비판, 판매 허락 (이적 명단)
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { clubLevel, marketValue, wageForAbility, windowOpen } from './transfer';
import { addFanMood } from './boardEvents';

export type SagaKind = 'wage' | 'move';
export interface Saga { kind: SagaKind; stage: 0 | 1 | 2 | 3; since: string; next: string; target?: string; wantWage?: number; promise?: string; /** 사가를 일으킨 소속 구단 (옮기면 끝) */ club?: string }
export const SAGA_STAGE_KO = ['에이전트 발언', '공개 인터뷰', '훈련 불참', '출전 거부'] as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const h = (p: PlayerState) => p.hidden;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** 이적시장 기간 또는 열리기 2주 전 */
const marketTime = (w: World) => !!windowOpen(w.season, w.date) || !!windowOpen(w.season, addDays(w.date, 14));

/** 태업 (훈련 불참 · 출전 거부) 까지 갈 수 있는 선수: 성격이 아주 나쁜 경우만 (프로의식 6 이하 · 야망 14 이상 · 충성 성향 8 이하) */
export const canStrike = (p: PlayerState) => p.hidden.professionalism <= 6 && p.hidden.ambition >= 14 && p.hidden.loyalty <= 8;
/** 공개 인터뷰 → 태업으로 커질 확률 (그런 선수도 25%) */
const STRIKE_CHANCE = 0.25;

/** 출전 거부 중 (선발 불가) */
export const onStrike = (p: PlayerState) => (p.saga?.stage ?? 0) >= 3;

/** 갈 만한 빅클럽: 명성이 우리보다 6+ 높고, 이 선수가 그 팀에서도 뛸 수준 */
function dreamClub(w: World, p: PlayerState, rng: Rng): string | null {
  const me = w.clubs[p.clubId!];
  const ovr = overall(p);
  const cands = Object.values(w.clubs).filter((c) => c.id !== me.id && w.competitions[c.league] && !c.id.startsWith('nt-') && c.reputation >= me.reputation + 6
    && ovr >= clubLevel(w, c.id) - 4 && c.finance.transferBudget >= marketValue(w, p) * 0.6);
  return cands.length ? rng.weighted(cands, (c) => c.reputation ** 3).id : null;
}

/** 지목한 구단의 제안 (단계가 오를수록 낮게 시작) */
function targetOffer(w: World, p: PlayerState, rng: Rng) {
  const s = p.saga!;
  if (!s.target || !w.clubs[s.target]) return;
  const offers = (w.offers ??= []);
  if (offers.some((o) => o.player === p.id && o.from === s.target)) return;
  const v = Math.max(marketValue(w, p), 250000);
  const cut = 1 - 0.07 * s.stage;   // 태업할수록 상대는 깎으려 한다
  const r50 = (x: number) => Math.round(x / 50000) * 50000;
  const budget = w.clubs[s.target].finance.transferBudget;
  const fee = r50(Math.min(v * (0.8 + rng.next() * 0.1) * cut, budget));
  const max = Math.max(fee, r50(Math.min(v * (0.95 + rng.next() * 0.1) * cut, budget)));
  offers.push({ id: `${w.date}-${s.target}-${p.id}`, player: p.id, from: s.target, fee, max, tries: 0, date: w.date, expires: addDays(w.date, 10) });
  w.inbox.push({ type: 'offer', date: w.date, player: p.id, from: s.target, fee });
}

/** 하루: 사가 시작 · 커짐 · 끝 (내 구단 선수) */
export function sagaDay(w: World, rng: Rng): GameEvent[] {
  const out: GameEvent[] = [];
  const club = w.clubs[w.userClubId];
  const squad = club.squad.map((id) => w.players[id]);
  const day = w.date.slice(8);

  // 끝난 사가 정리 (떠남 · 요구 주급 충족)
  for (const p of Object.values(w.players)) {
    if (!p.saga) continue;
    if (p.clubId !== (p.saga.club ?? w.userClubId)) { p.saga = undefined; continue; }   // 다른 구단으로 옮겼으면 끝
    if (p.clubId !== w.userClubId) continue;   // AI 구단 선수는 aiSagaDay
    if (p.saga.kind === 'wage' && p.wage >= (p.saga.wantWage ?? Infinity)) {
      p.saga = undefined; p.morale = clamp(p.morale + 10, 0, 100);
      out.push({ type: 'saga', date: w.date, player: p.id, kind: 'wage', stage: 0, step: 'resolved' });
    }
  }

  // 시작 (매달 5일 · 20일, 한 번에 많아야 2명)
  if ((day === '05' || day === '20') && squad.filter((p) => p.saga).length < 2) {
    const ranked = [...squad].sort((a, b) => overall(b) - overall(a));
    const core = new Set(ranked.slice(0, 14).map((p) => p.id));
    for (const p of squad) {
      if (p.saga || !core.has(p.id) || ageOn(p.birth, w.date) >= 33 || p.injury) continue;
      const amb = h(p).ambition / 20, pro = h(p).professionalism / 20, loy = h(p).loyalty / 20;
      const temper = 0.5 + amb - 0.5 * pro - 0.5 * loy + (p.scandals ?? 0) * 0.1;   // 0 ~ 1.5 (+ 논란 전력)
      if (temper <= 0) continue;
      const fair = wageForAbility(w, overall(p));
      // 연봉 인상 요구: 시세의 70% 미만
      if (p.wage < fair * 0.7 && rng.chance(0.05 * temper)) {
        const want = Math.round((fair * 0.95) / 500) * 500;
        p.saga = { kind: 'wage', stage: 0, since: w.date, next: addDays(w.date, 14), wantWage: want, club: club.id };
        out.push({ type: 'saga', date: w.date, player: p.id, kind: 'wage', stage: 0, step: 'start' });
        break;
      }
      // 이적 요청: 빅클럽 관심 · 출전 불만 · 사기 낮음일수록
      const push = (p.unhappy ? 0.04 : 0) + (p.morale < 40 ? 0.02 : 0) + 0.012 * amb;
      if (rng.chance(push * temper)) {
        const target = dreamClub(w, p, rng);
        if (!target) continue;
        p.saga = { kind: 'move', stage: 0, since: w.date, next: addDays(w.date, 14), target, club: club.id };
        out.push({ type: 'saga', date: w.date, player: p.id, kind: 'move', stage: 0, step: 'start', target });
        if (marketTime(w)) targetOffer(w, p, rng);
        break;
      }
    }
  }

  // 커짐 (약 2주마다)
  for (const p of squad) {
    const s = p.saga;
    if (!s || w.date < s.next) continue;
    s.next = addDays(w.date, 14);
    if (s.promise) {
      if (w.date < s.promise) continue;
      // 약속을 지키지 않았다
      s.promise = undefined;
      p.morale = clamp(p.morale - 15, 0, 100);
      p.loyalty = clamp(p.loyalty - 15, 0, 100);
    }
    // 태업 (2단계+) 은 극히 드물게: 이적시장 기간 · 성격이 아주 나쁜 선수 · 25%
    const cap = marketTime(w) && canStrike(p) ? 3 : 1;
    const pro = h(p).professionalism / 20;
    const up = s.stage === 0 ? 0.65 - 0.45 * pro : STRIKE_CHANCE;
    if (s.stage < cap && rng.chance(up)) {
      s.stage = (s.stage + 1) as Saga['stage'];
      if (s.stage >= 1) for (const q of squad) if (q.id !== p.id) q.morale = clamp(q.morale - 2, 0, 100);
      if (s.stage >= 2) p.morale = Math.min(p.morale, 25);
      out.push({ type: 'saga', date: w.date, player: p.id, kind: s.kind, stage: s.stage, step: 'escalate', target: s.target });
    }
    if (s.kind === 'move' && marketTime(w)) targetOffer(w, p, rng);
  }

  // 훈련 불참: 경기 감각이 떨어진다
  for (const p of squad) if ((p.saga?.stage ?? 0) >= 2) p.sharpness = Math.max(20, p.sharpness - 1.5);
  return out;
}

/**
 * AI 구단 선수 (이적시장 동안): 팀 상위 3명 중 성격이 나쁜 스타가 빅클럽 이적을 요청 → 1주마다 커짐
 *  2단계부터 지목한 구단이 깎은 값 (시장가 × (0.95 − 0.08 × 단계)) 으로 데려간다 (돈이 없으면 무산)
 *  지목한 구단이 우리 구단이면 소식만 (원래 구단이 싸게 판다: evaluateBid). 시장이 닫히면 잠잠해짐
 *  뉴스: 큰 이적 (3천만 유로 이상) · 우리 구단 관련만
 */
export function aiSagaDay(w: World, rng: Rng, act: (p: PlayerState, to: string, fee: number) => boolean): GameEvent[] {
  const out: GameEvent[] = [];
  const open = !!windowOpen(w.season, w.date);
  if (!open) {
    // 이적시장 밖: 남은 AI 사가만 정리 (선수단 정렬 없이, 매일 가볍게)
    for (const p of Object.values(w.players)) if (p.saga && p.clubId !== w.userClubId && p.saga.club !== w.userClubId) { p.saga = undefined; p.morale = clamp(p.morale - 10, 0, 100); }
    return out;
  }
  for (const c of Object.values(w.clubs)) {
    if (c.id === w.userClubId || !w.competitions[c.league] || c.id.startsWith('nt-')) continue;
    const top = c.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a)).slice(0, 3);
    for (const p of top) {
      const s = p.saga;
      if (!open) { if (s) { p.saga = undefined; p.morale = clamp(p.morale - 10, 0, 100); } continue; }
      if (!s) {
        if (ageOn(p.birth, w.date) >= 31 || p.injury) continue;
        const temper = 0.5 + h(p).ambition / 20 - 0.5 * h(p).professionalism / 20 - 0.5 * h(p).loyalty / 20;
        if (temper <= 0.3 || !rng.chance(0.0012 * temper)) continue;
        const target = dreamClub(w, p, rng);
        if (!target) continue;
        p.saga = { kind: 'move', stage: 1, since: w.date, next: addDays(w.date, 7), target, club: c.id };
        if (target === w.userClubId) out.push({ type: 'saga', date: w.date, player: p.id, kind: 'move', stage: 1, step: 'wantsUs', target, from: c.id });
        continue;
      }
      if (w.date >= s.next) {
        s.next = addDays(w.date, 7);
        if (s.stage < 3 && canStrike(p) && rng.chance(STRIKE_CHANCE)) s.stage = (s.stage + 1) as Saga['stage'];   // 태업은 극히 드물게
      }
      if (s.stage >= 2 && s.target && s.target !== w.userClubId) {
        const fee = Math.round((Math.max(marketValue(w, p), 250000) * (0.95 - 0.08 * s.stage)) / 1e5) * 1e5;
        if (act(p, s.target, fee)) {
          if (fee >= 30e6) out.push({ type: 'saga', date: w.date, player: p.id, kind: 'move', stage: s.stage, step: 'forced', target: s.target, from: c.id, fee });
        } else if (s.stage === 3 && days(s.since, w.date) > 35) p.saga = undefined;   // 끝내 무산
      }
    }
  }
  return out;
}

/** 사용자 대응 */
export type SagaAction = 'talk' | 'promise' | 'fine' | 'criticize' | 'list';
export function sagaRespond(w: World, playerId: string, action: SagaAction, rng: Rng): { text: string; events: GameEvent[] } {
  const p = w.players[playerId];
  const s = p?.saga;
  if (!p || !s) return { text: '', events: [] };
  const pro = h(p).professionalism / 20, loy = p.loyalty / 100;
  const say = (text: string) => ({ text, events: [{ type: 'info', date: w.date, text } as GameEvent] });
  switch (action) {
    case 'talk': {
      // 대화: 충성도 · 프로의식이 높을수록 한 단계 누그러짐
      if (rng.chance(0.25 + 0.35 * pro + 0.25 * loy)) { s.stage = Math.max(0, s.stage - 1) as Saga['stage']; p.morale = clamp(p.morale + 6, 0, 100); s.next = addDays(w.date, 21); return say('대화가 통했습니다 · 선수가 한발 물러섰습니다'); }
      s.next = w.date; return say('대화가 통하지 않았습니다 · 선수의 태도가 더 굳어졌습니다');
    }
    case 'promise': {
      // 약속: 연봉은 60일 안에 재계약, 이적은 다음 이적시장 (시즌 끝) 에 보내 주겠다
      s.promise = s.kind === 'wage' ? addDays(w.date, 60) : `${+w.season.slice(0, 4) + 1}-08-31`;
      s.stage = Math.min(s.stage, 1) as Saga['stage'];
      p.morale = clamp(p.morale + 8, 0, 100);
      return say(s.kind === 'wage' ? '60일 안에 재계약하겠다고 약속했습니다 (지키지 않으면 더 커집니다)' : '시즌이 끝나면 보내 주겠다고 약속했습니다 (지키지 않으면 더 커집니다)');
    }
    case 'fine': {
      // 징계 (벌금): 프로의식이 높으면 태업을 멈추고, 낮으면 더 반발. 다른 선수들에게는 본보기
      for (const id of w.clubs[w.userClubId].squad) if (id !== p.id) w.players[id].morale = clamp(w.players[id].morale + 2, 0, 100);
      p.morale = clamp(p.morale - 15, 0, 100);
      if (rng.chance(0.3 + 0.5 * pro)) { s.stage = Math.max(0, s.stage - 2) as Saga['stage']; s.next = addDays(w.date, 21); return say('벌금 징계 · 선수가 훈련에 복귀했습니다'); }
      s.stage = Math.min(3, s.stage + 1) as Saga['stage']; return say('벌금 징계 · 선수가 더 강하게 반발합니다');
    }
    case 'criticize': {
      // 공개 비판: 팬은 구단 편, 선수와의 관계는 끝
      addFanMood(w, 5);
      p.morale = clamp(p.morale - 25, 0, 100);
      p.loyalty = clamp(p.loyalty - 30, 0, 100);
      return say('기자회견에서 선수를 공개 비판했습니다 · 팬들은 구단 편에 섰습니다');
    }
    case 'list': {
      // 판매 허락: 이적 명단에 올리고 태업을 멈춤
      if (!(w.transferList ?? []).includes(p.id)) w.transferList = [...(w.transferList ?? []), p.id];
      s.stage = 0; s.promise = undefined;
      p.morale = clamp(p.morale + 10, 0, 100);
      return say('이적을 허락하고 이적 명단에 올렸습니다 · 선수가 훈련에 복귀했습니다');
    }
  }
  return { text: '', events: [] };
}

/** 이 선수 사가 설명 (화면용) */
export function sagaSummary(p: PlayerState): string | null {
  const s = p.saga;
  if (!s) return null;
  return `${s.kind === 'wage' ? '연봉 인상 요구' : '이적 요청'} · ${SAGA_STAGE_KO[s.stage]}${s.promise ? ' · 약속함' : ''}`;
}
