// 기자회견 (언론 플레이): 큰 경기 전 · 눈에 띄는 경기 후 · 이사회 갈등 · 이적설
//  질문 1~2개, 답변 3개 (+ 불참). 답변에 따라 선수 사기 · 팬 여론 · 이사회 관계 · 신뢰도가 바뀐다
//  경기 전 도발: 사기 · 여론이 오르지만 그 경기를 지면 여론이 크게 깎인다 (이기면 더 오름)
//  35일에 한 번까지 (시즌 3~4번 정도)
import { freqOf } from './gameSettings';
import type { Fixture, GameEvent, World } from './types';
import type { Rng } from './rng';
import { ensureManager } from './manager';
import { addRelation, relationOf } from './board';
import { addFanMood } from './boardEvents';
import { overall } from './ratings';
import { recentScandal, SCANDAL_TITLE } from './scandal';

export interface PressEffect { morale?: number; player?: string; playerMorale?: number; fan?: number; relation?: number; confidence?: number; boast?: boolean }
export interface PressAnswer { key: string; label: string; hint: string; fx: PressEffect }
export interface PressQuestion { topic: 'pre' | 'big' | 'loss' | 'upset' | 'board' | 'rumour'; text: string; player?: string; answers: PressAnswer[] }
export interface PressConference { date: string; kind: 'pre' | 'post' | 'free'; fixture?: string; opp?: string; questions: PressQuestion[] }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** 효과 설명 (선택지 아래 작은 글씨) */
export function hintOf(fx: PressEffect): string {
  const s: string[] = [];
  const sign = (v: number) => (v > 0 ? '+' : '−');
  if (fx.morale) s.push(`선수단 사기 ${sign(fx.morale)}`);
  if (fx.playerMorale) s.push(`선수 사기 ${sign(fx.playerMorale)}`);
  if (fx.fan) s.push(`팬 여론 ${sign(fx.fan)}`);
  if (fx.relation) s.push(`이사회 관계 ${sign(fx.relation)}`);
  if (fx.confidence) s.push(`신뢰도 ${sign(fx.confidence)}`);
  if (fx.boast) s.push('지면 여론 크게 −');
  return s.join(' · ') || '변화 없음';
}
const A = (key: string, label: string, fx: PressEffect): PressAnswer => ({ key, label, fx, hint: hintOf(fx) });

function questions(w: World, kind: 'pre' | 'post' | 'free', ctx: { opp?: string; big?: boolean; result?: 'bigwin' | 'bigloss' | 'upsetwin' | 'upsetloss' }, rng: Rng): PressQuestion[] {
  const qs: PressQuestion[] = [];
  const me = w.clubs[w.userClubId];
  if (kind === 'pre') {
    qs.push({ topic: 'pre', text: '다음 상대가 만만치 않습니다. 이길 자신이 있습니까?', answers: [
      A('confident', '"우리가 이긴다. 준비는 끝났다"', { morale: 3, fan: 2 }),
      A('humble', '"좋은 팀이다. 존중하며 최선을 다하겠다"', { relation: 1 }),
      A('boast', '"상대는 우리를 두려워해야 한다" (도발)', { morale: 5, fan: 3, relation: -2, boast: true }),
    ] });
  } else if (ctx.result === 'bigwin' || ctx.result === 'upsetwin') {
    qs.push({ topic: 'big', text: ctx.result === 'upsetwin' ? '모두의 예상을 깬 승리입니다. 소감은?' : '대승을 거뒀습니다. 소감은?', answers: [
      A('players', '"선수들이 다 했다. 정말 자랑스럽다"', { morale: 4 }),
      A('humble', '"한 경기일 뿐이다. 다음을 준비하겠다"', { relation: 1, confidence: 1 }),
      A('board', '"지원해 준 구단과 이사회 덕분이다"', { relation: 3, fan: -1 }),
    ] });
  } else if (ctx.result === 'bigloss' || ctx.result === 'upsetloss') {
    qs.push({ topic: 'loss', text: ctx.result === 'upsetloss' ? '약체에게 졌습니다. 무엇이 문제였습니까?' : '큰 점수 차로 졌습니다. 무엇이 문제였습니까?', answers: [
      A('blameplayers', '"선수들이 기대에 못 미쳤다"', { morale: -5, fan: 1, relation: 1 }),
      A('blameself', '"모든 책임은 감독인 나에게 있다"', { morale: 3, fan: 2, confidence: -2 }),
      A('referee', '"오늘 판정은 납득하기 어렵다"', { fan: 2, relation: -2, morale: 1 }),
    ] });
  }
  // 이사회와 사이가 나쁠 때
  if (qs.length < 2 && relationOf(w) < 40 && rng.chance(0.5)) {
    qs.push({ topic: 'board', text: '이사회가 감독을 충분히 지원하지 않는다는 말이 있습니다.', answers: [
      A('criticize', '"솔직히 더 많은 지원이 필요하다" (이사회 비판)', { fan: 4, relation: -8 }),
      A('support', '"이사회와 같은 방향을 보고 있다"', { relation: 4, fan: -1 }),
      A('nocomment', '"노코멘트"', {}),
    ] });
  }
  // 최근 논란이 있었던 선수
  const sc = recentScandal(w);
  if (qs.length < 2 && sc?.lastScandal) {
    qs.push({ topic: 'rumour', player: sc.id, text: `{player}의 '${SCANDAL_TITLE[sc.lastScandal.kind]}' 논란에 대해 한마디 해 주십시오.`, answers: [
      A('defend', '"선수도 사람이다. 우리가 감싸겠다"', { player: sc.id, playerMorale: 6, fan: -2 }),
      A('criticize', '"프로답지 못한 행동이다. 용납하지 않겠다"', { player: sc.id, playerMorale: -12, fan: 3, relation: 1 }),
      A('nocomment', '"내부에서 처리할 문제다"', {}),
    ] });
  }
  // 선수 언론 플레이 (공개 인터뷰 이상) 중인 선수가 있으면 그 선수부터
  const saga = me.squad.map((id) => w.players[id]).find((p) => (p.saga?.stage ?? 0) >= 1);
  if (qs.length < 2 && saga?.saga) {
    qs.push({ topic: 'rumour', player: saga.id, text: saga.saga.kind === 'wage' ? '{player}가 공개적으로 연봉 인상을 요구했습니다.' : '{player}가 공개적으로 이적을 원한다고 말했습니다.', answers: [
      A('criticize', '"구단보다 큰 선수는 없다" (공개 비판)', { player: saga.id, playerMorale: -20, fan: 4 }),
      A('support', '"선수의 마음을 이해한다. 대화로 풀겠다"', { player: saga.id, playerMorale: 6, fan: -2 }),
      A('nocomment', '"내부 문제는 내부에서 해결한다"', {}),
    ] });
  }
  // 이적설: 이적 명단에 오른 선수 또는 팀 핵심 선수
  if (qs.length < 2 && rng.chance(0.4)) {
    const listed = (w.transferList ?? []).map((id) => w.players[id]).filter((p) => p?.clubId === me.id);
    const star = listed[0] ?? me.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[rng.int(0, 2)];
    if (star) qs.push({ topic: 'rumour', player: star.id, text: '{player}의 이적설이 돌고 있습니다.', answers: [
      A('keep', '"절대 팔지 않는다. 우리 팀의 핵심이다"', { player: star.id, playerMorale: 8, fan: 2 }),
      A('open', '"좋은 제안이 오면 검토하겠다"', { player: star.id, playerMorale: -6, relation: 2 }),
      A('nocomment', '"선수 이적에 대해서는 말하지 않겠다"', {}),
    ] });
  }
  return qs.slice(0, 2);
}

/** 하루: 기자회견 열기 (경기 이틀 전 · 경기 후) · 도발한 경기 결과 반영 */
export function pressDay(w: World, todays: GameEvent[], rng: Rng, next: Fixture | null): GameEvent[] {
  const m = ensureManager(w);
  const out: GameEvent[] = [];
  const me = w.userClubId;
  // 도발한 경기 결과
  if (m.boast) {
    const e = todays.find((x) => x.type === 'match' && x.fixtureId === m.boast);
    if (e && e.type === 'match') {
      const [g, o] = e.home === me ? e.score : [e.score[1], e.score[0]];
      addFanMood(w, g > o ? 3 : g === o ? -2 : -6);
      out.push({ type: 'info', date: w.date, text: g > o ? '도발한 경기에서 이겼습니다 · 팬들이 열광합니다' : g === o ? '도발한 경기에서 비겼습니다 · 언론이 비꼽니다' : '도발한 경기에서 졌습니다 · 언론과 팬의 비판이 쏟아집니다' });
      m.boast = undefined;
    }
  }
  if (m.press || m.boardEvent || m.pendingJob) return out;
  const f = freqOf(w, 'press');
  if (m.lastPress && days(m.lastPress, w.date) < 35 / f) return out;   // 35일에 한 번까지 (시즌 3~4번)

  let conf: PressConference | null = null;
  // 경기 후: 대승 · 대패 · 이변
  const mine = todays.find((e) => e.type === 'match' && (e.home === me || e.away === me));
  if (mine && mine.type === 'match') {
    const [g, o] = mine.home === me ? mine.score : [mine.score[1], mine.score[0]];
    const opp = mine.home === me ? mine.away : mine.home;
    const diff = (w.clubs[opp]?.reputation ?? 0) - w.clubs[me].reputation;
    const result = g - o >= 3 ? 'bigwin' : o - g >= 3 ? 'bigloss' : g > o && diff >= 6 ? 'upsetwin' : o > g && diff <= -6 ? 'upsetloss' : null;
    if (result && rng.chance(0.25 * f)) {
      const qs = questions(w, 'post', { opp, result }, rng);
      if (qs.length) conf = { date: w.date, kind: 'post', fixture: mine.fixtureId, opp, questions: qs };
    }
  }
  // 경기 이틀 전: 강팀 · 결승 · 유럽 대회
  if (!conf && next && next.date === addDays(w.date, 2)) {
    const opp = next.home === me ? next.away : next.home;
    const strong = (w.clubs[opp]?.reputation ?? 0) >= w.clubs[me].reputation - 3;
    const big = next.stage === 'euro' || next.name?.includes('결승') || strong;
    if (big && rng.chance(0.15 * f)) {
      const qs = questions(w, 'pre', { opp, big }, rng);
      if (qs.length) conf = { date: w.date, kind: 'pre', fixture: next.id, opp, questions: qs };
    }
  }
  if (conf) {
    m.press = conf; m.lastPress = w.date;
    out.push({ type: 'press', date: w.date, kind: conf.kind, opp: conf.opp });
  }
  return out;
}

/** 답변 적용 (질문 하나씩). 마지막 질문까지 답하면 기자회견 끝 */
export function answerPress(w: World, key: string): GameEvent[] {
  const m = ensureManager(w);
  const conf = m.press;
  if (!conf) return [];
  const q = conf.questions[0];
  const club = w.clubs[w.userClubId];
  if (key === 'skip') {
    // 불참: 남은 질문 전부 건너뜀
    addFanMood(w, -1); addRelation(w, -1);
    m.press = undefined;
    return [{ type: 'info', date: w.date, text: '기자회견에 불참했습니다 · 언론이 불만을 드러냅니다' }];
  }
  const a = q.answers.find((x) => x.key === key);
  if (a) {
    const fx = a.fx;
    if (fx.morale) for (const id of club.squad) { const p = w.players[id]; p.morale = clamp(p.morale + fx.morale, 0, 100); }
    if (fx.player && fx.playerMorale && w.players[fx.player]) { const p = w.players[fx.player]; p.morale = clamp(p.morale + fx.playerMorale, 0, 100); }
    if (fx.fan) addFanMood(w, fx.fan);
    if (fx.relation) addRelation(w, fx.relation);
    if (fx.confidence) m.confidence = clamp(m.confidence + fx.confidence, 0, 100);
    if (fx.boast && conf.fixture) m.boast = conf.fixture;
  }
  conf.questions.shift();
  if (!conf.questions.length) { m.press = undefined; return [{ type: 'info', date: w.date, text: `기자회견을 마쳤습니다${a ? ` · ${a.hint}` : ''}` }]; }
  return [];
}
