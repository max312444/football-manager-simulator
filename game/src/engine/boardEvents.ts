// 팬 여론 · 이사회 갈등 이벤트
//  팬 여론 (0~100, 감독에 대한 여론): 경기 결과 · 큰 영입 · 스타 판매 · 시즌 결과로 오르내린다
//    - 높으면 (70+) 이사회가 쉽게 경질하지 못한다 · 낮으면 (30-) 이사회 관계가 매달 떨어진다 · 내 구단 상업 수입 ±5%
//  이사회 이벤트 (선택지가 있는 갈등 · 요구): 스타 판매 요구 · 유스 기용 요구 · 이사회가 원하는 선수 · 감독 교체 소문 · 팬 시위
//    + 자동: 우승 보너스 예산 · 구단주 교체 (드물게, 새 시즌)
import { freqOf } from './gameSettings';
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { ensureManager } from './manager';
import { addRelation } from './board';
import { overall } from './ratings';
import { ageOn } from './condition';
import { clubRevenue } from './finance';
import { marketValue, windowEnd, windowOpen } from './transfer';
import { clubRevenue as revenueOf } from './finance';

export type BoardEventKind = 'sellStar' | 'youth' | 'wanted' | 'rumour' | 'protest';
export interface BoardEvent { kind: BoardEventKind; date: string; player?: string; options: { key: string; label: string; hint: string }[] }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

export const fanMoodOf = (w: World) => ensureManager(w).fanMood ?? 60;
export const fanMoodLabel = (v: number) => (v >= 80 ? '열광' : v >= 60 ? '지지' : v >= 40 ? '보통' : v >= 20 ? '불만' : '분노');
export function addFanMood(w: World, d: number) { const m = ensureManager(w); m.fanMood = clamp((m.fanMood ?? 60) + d, 0, 100); }


const u21Apps = (w: World) => w.clubs[w.userClubId].squad.map((id) => w.players[id]).filter((p) => ageOn(p.birth, w.date) <= 21).reduce((s, p) => s + p.stats.apps + p.stats.subApps + (p.cupStats?.apps ?? 0), 0);

/** 하루: 오늘 일어난 일로 팬 여론 · 약속 확인 · 새 이사회 이벤트 */
export function boardEventDay(w: World, todays: GameEvent[], rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  if (m.pendingJob) return [];
  const out: GameEvent[] = [];
  const me = w.userClubId;
  const rev = clubRevenue(w, me);

  // 팬 여론: 경기 결과 · 큰 영입 · 스타 판매
  for (const e of todays) {
    if (e.type === 'match' && (e.home === me || e.away === me)) {
      // 기대 대비 결과: 기대 승점 (명성 차이로 0.3~2.7) 보다 많이 따면 +, 적으면 − · 3골 차 이상이면 조금 더
      const [g, o] = e.home === me ? e.score : [e.score[1], e.score[0]];
      const opp = e.home === me ? e.away : e.home;
      const exp = clamp(1.4 + ((w.clubs[me].reputation - (w.clubs[opp]?.reputation ?? w.clubs[me].reputation)) / 10) + (e.home === me ? 0.2 : -0.2), 0.3, 2.7);
      const pts = g > o ? 3 : g === o ? 1 : 0;
      addFanMood(w, (pts - exp) * 1.1 + (Math.abs(g - o) >= 3 ? Math.sign(g - o) : 0));
    }
    if (e.type === 'transfer' && e.to === me && e.fee >= rev * 0.12) addFanMood(w, 4);
    if (e.type === 'transfer' && e.from === me && e.to !== me) {
      const p = w.players[e.player];
      // 팀 핵심 (남은 선수 중 3번째보다 잘하면 = 원래 상위 3명) 을 팔면 팬 여론 −
      const third = [...w.clubs[me].squad.map((id) => overall(w.players[id]))].sort((a, b) => b - a)[2] ?? 99;
      if (p && overall(p) >= third) addFanMood(w, -6);
    }
  }

  // 매달 1일: 여론은 조금씩 보통 (60) 으로 · 낮으면 이사회 관계 하락 · 너무 낮으면 시위
  if (w.date.slice(8) === '01') {
    const f = fanMoodOf(w);
    addFanMood(w, f > 60 ? -1 : f < 60 ? 0.5 : 0);
    if (f < 30) addRelation(w, -1);
  }

  // 약속 확인: 유스 기용 · 이사회가 원하는 선수
  if (m.youthPledge && w.date >= m.youthPledge.until) {
    const ok = u21Apps(w) - m.youthPledge.base >= 3;
    addRelation(w, ok ? 6 : -6);
    out.push({ type: 'info', date: w.date, text: ok ? '이사회: 유스 기용 약속을 지켰습니다 (관계 +)' : '이사회: 유스 기용 약속을 지키지 않았습니다 (관계 −)' });
    m.youthPledge = undefined;
  }
  if (m.wanted) {
    const p = w.players[m.wanted.player];
    if (p?.clubId === me) { addRelation(w, 10); out.push({ type: 'info', date: w.date, text: "이사회: 원하던 선수를 데려와 만족합니다 (관계 +)" }); m.wanted = undefined; }
    else if (w.date >= m.wanted.until) { addRelation(w, -4); out.push({ type: 'info', date: w.date, text: '이사회: 원하던 선수를 데려오지 못했습니다 (관계 −)' }); m.wanted = undefined; }
  }

  // 새 이벤트: 매달 10일 (9월 ~ 4월), 이전 이벤트 뒤 45일 넘게, 하나씩
  const mon = +w.date.slice(5, 7);
  if (!m.boardEvent && w.date.slice(8) === '10' && (mon >= 8 || mon <= 4) && (!m.lastBoardEvent || days(m.lastBoardEvent, w.date) > 45)) {
    const ev = pickEvent(w, rng);
    if (ev) {
      m.boardEvent = ev; m.lastBoardEvent = w.date;
      out.push({ type: 'board', date: w.date, kind: ev.kind, player: ev.player });
    }
  }
  return out;
}

function pickEvent(w: World, rng: Rng): BoardEvent | null {
  const m = ensureManager(w);
  const c = w.clubs[w.userClubId];
  const squad = c.squad.map((id) => w.players[id]);
  const d = w.date;
  // 팬 시위 · 감독 교체 소문은 조건이 맞으면 먼저
  if (fanMoodOf(w) < 20) return { kind: 'protest', date: d, options: [
    { key: 'talk', label: '팬들과 직접 대화한다', hint: '팬 여론 + · 신뢰도 조금 −' },
    { key: 'ignore', label: '무시하고 경기에 집중한다', hint: '이사회 관계 − · 신뢰도 −' }] };
  if (m.confidence < 35 && rng.chance(0.6)) return { kind: 'rumour', date: d, options: [
    { key: 'rebut', label: '기자회견에서 공개 반박한다', hint: '팬 여론 + · 이사회 관계 −' },
    { key: 'silent', label: '침묵한다', hint: '신뢰도 조금 −' }] };
  if (!rng.chance(0.3 * freqOf(w, 'board'))) return null;
  const cands: (() => BoardEvent | null)[] = [];
  // 이적이 가능한 때만: 이적시장이 열려 있을 때 (판매 요구 · 원하는 선수)
  const market = !!windowOpen(w.season, w.date);
  // 판매 요구: 재정이 실제로 나쁠 때 (잔고가 매출의 8% 이상 마이너스) · 팀 핵심 (능력 상위 3명) 은 빼고 주급이 가장 큰 선수
  if (market && c.finance.balance < -revenueOf(w, c.id) * 0.08) cands.push(() => {
    const core = new Set([...squad].sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((p) => p.id));
    const star = squad.filter((p) => !core.has(p.id)).sort((a, b) => b.wage - a.wage)[0];
    return star ? { kind: 'sellStar', date: d, player: star.id, options: [
      { key: 'accept', label: '이적 명단에 올린다', hint: '이사회 관계 + · 팬 여론 −' },
      { key: 'refuse', label: '팔지 않겠다고 맞선다', hint: '이사회 관계 크게 − · 다음 시즌 예산 −' }] } : null;
  });
  if (squad.some((p) => ageOn(p.birth, d) <= 21 && overall(p) >= 58)) cands.push(() => ({ kind: 'youth', date: d, options: [
    { key: 'accept', label: '한 달 안에 유스를 더 기용하겠다', hint: '21세 이하 3경기 이상 출전시키면 관계 +, 못 지키면 −' },
    { key: 'refuse', label: '지금은 성적이 우선이다', hint: '이사회 관계 조금 −' }] }));
  const wantPool = Object.values(w.players).filter((p): p is PlayerState => !!p.clubId && p.clubId !== c.id && !p.retired && !p.clubId.startsWith('nt-')
    && ageOn(p.birth, d) >= 22 && ageOn(p.birth, d) <= 29 && marketValue(w, p) <= c.finance.transferBudget * 1.3 && marketValue(w, p) >= c.finance.transferBudget * 0.25)
    .sort((a, b) => overall(b) - overall(a)).slice(0, 12);
  if (market && wantPool.length) cands.push(() => ({ kind: 'wanted', date: d, player: rng.pick(wantPool).id, options: [
    { key: 'accept', label: '영입을 추진하겠다', hint: '이적료 일부를 이사회가 지원 · 이번 이적시장 안에 데려오면 관계 +' },
    { key: 'refuse', label: '전력에 필요 없다', hint: '이사회 관계 조금 −' }] }));
  return cands.length ? rng.pick(cands)() : null;
}

/** 이사회 이벤트 선택 */
export function resolveBoardEvent(w: World, key: string): GameEvent[] {
  const m = ensureManager(w);
  const ev = m.boardEvent;
  if (!ev) return [];
  m.boardEvent = undefined;
  const c = w.clubs[w.userClubId];
  const p = ev.player ? w.players[ev.player] : null;
  const say = (text: string): GameEvent[] => [{ type: 'info', date: w.date, text }];
  switch (ev.kind) {
    case 'sellStar':
      if (key === 'accept') { if (p && !(w.transferList ?? []).includes(p.id)) w.transferList = [...(w.transferList ?? []), p.id]; addRelation(w, 8); addFanMood(w, -4); return say("이사회가 팔라고 한 선수를 이적 명단에 올렸습니다 (이사회 관계 +)"); }
      addRelation(w, -12); m.budgetPenalty = 0.9; return say('이사회 요구를 거절했습니다 · 다음 시즌 예산이 줄어듭니다');
    case 'youth':
      if (key === 'accept') { m.youthPledge = { until: addDays(w.date, 30), base: u21Apps(w) }; return say('유스 기용을 약속했습니다 (30일)'); }
      addRelation(w, -5); return say('이사회의 유스 기용 요구를 거절했습니다');
    case 'wanted':
      if (key === 'accept' && p) {
        const support = Math.round((marketValue(w, p) * 0.2) / 1e5) * 1e5;
        c.finance.transferBudget += support;
        m.wanted = { player: p.id, until: windowEnd(w.season, w.date) ?? addDays(w.date, 21) };   // 이번 이적시장이 닫히는 날까지
        if (!(w.shortlist ?? []).includes(p.id)) w.shortlist = [...(w.shortlist ?? []), p.id];
        return say(`이사회가 원하는 선수 영입을 추진합니다 · 이사회가 이적 예산 ${Math.round(support / 1e5) / 10}M 유로를 지원했습니다 (관심 목록에 추가)`);
      }
      addRelation(w, -4); return say('이사회가 원하는 선수 영입을 거절했습니다');
    case 'rumour':
      if (key === 'rebut') { addFanMood(w, 5); addRelation(w, -6); return say('감독 교체 소문을 공개 반박했습니다 · 팬들은 지지하지만 이사회는 불편해합니다'); }
      m.confidence = clamp(m.confidence - 3, 0, 100); return say('소문에 침묵했습니다');
    case 'protest':
      if (key === 'talk') { addFanMood(w, 8); m.confidence = clamp(m.confidence - 2, 0, 100); return say('팬들과 직접 대화했습니다 · 분위기가 조금 누그러졌습니다'); }
      addRelation(w, -8); m.confidence = clamp(m.confidence - 5, 0, 100); return say('팬 시위를 무시했습니다 · 이사회가 우려를 표했습니다');
  }
  return [];
}

/** 시즌 끝: 팬 여론 (우승 · 강등 · 목표) · 우승 보너스 예산 예약 */
export function fansSeasonEnd(w: World, o: { titles: number; relegated: boolean; met: boolean }) {
  const m = ensureManager(w);
  addFanMood(w, o.titles * 15 + (o.relegated ? -25 : 0) + (o.met ? 5 : -8));
  if (o.titles) m.titleBonus = (m.titleBonus ?? 0) + o.titles;
}

/** 새 시즌 (예산 정해진 뒤): 우승 보너스 · 예산 감점 · 드물게 구단주 교체 */
export function boardNewSeason(w: World, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  const c = w.clubs[w.userClubId];
  const rev = clubRevenue(w, c.id);
  const out: GameEvent[] = [];
  if (m.titleBonus) {
    const bonus = Math.round((rev * 0.04 * m.titleBonus) / 1e6) * 1e6;
    c.finance.transferBudget += bonus;
    out.push({ type: 'info', date: w.date, text: `우승 보너스 · 이사회가 이적 예산 ${Math.round(bonus / 1e6)}M 유로를 더 배정했습니다` });
    m.titleBonus = 0;
  }
  if (m.budgetPenalty) {
    c.finance.transferBudget = Math.round(c.finance.transferBudget * m.budgetPenalty);
    c.finance.wageBudget = Math.round(c.finance.wageBudget * m.budgetPenalty);
    out.push({ type: 'info', date: w.date, text: '지난 시즌 이사회와의 갈등으로 예산이 10% 줄었습니다' });
    m.budgetPenalty = undefined;
  }
  if (rng.chance(0.04)) {
    const rich = rng.chance(0.5);
    m.relation = 50;
    if (rich) { c.finance.balance += Math.round(rev * 0.4); c.finance.transferBudget = Math.round(c.finance.transferBudget * 1.3 + rev * 0.1); c.finance.wageBudget = Math.round(c.finance.wageBudget * 1.15); }
    else { c.finance.transferBudget = Math.round(c.finance.transferBudget * 0.6); c.finance.wageBudget = Math.round(c.finance.wageBudget * 0.92); }
    out.push({ type: 'board', date: w.date, kind: rich ? 'ownerRich' : 'ownerCut' });
  }
  return out;
}
