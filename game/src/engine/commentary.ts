// 문자 중계: 캐스터(장면) · 해설(감독 칭찬 · 비판 · 걱정, 흐름 분석)
//  경기 엔진이 5분마다 한 구간을 끝낼 때 그 구간에 생긴 일(골 · 슈팅 · 선방 · 카드 · 부상 · 교체 · 전술 변경)을 문장으로 만든다
//  - 경기 결과에 영향을 주지 않도록 따로 만든 난수만 쓴다 (경기 난수 ctx.rng 는 건드리지 않음)
//  - 이름은 화면에서 바꿔 넣도록 토큰으로 남긴다: {p:선수ID} · {c:구단ID}
//  - 사용자 경기에만 만든다 (createMatch commentary)
import type { Side } from './types';
import { createRng, type Rng } from './rng';
import type { MatchCtx, MatchState, OnPitch, TeamInMatch } from './match';

export type Voice = 'caster' | 'pundit';
export interface FeedLine { minute: number; side?: Side; voice: Voice; kind: string; text: string; big?: boolean }
export interface MatchNote { minute: number; side: Side; kind: 'tactic' | 'penMiss' | 'penSave' | 'formation'; player?: string; mentality?: number; pressing?: number; formation?: string }
/** 중계 상태 (경기 상태 m.cm 에 붙음) */
export interface CommentaryState {
  feed: FeedLine[];
  seed: number;
  /** 지난 구간까지 본 개수 */
  seen: { goals: number; cards: number; injuries: number; notes: number; shots: Record<Side, number>; onTarget: Record<Side, number> };
  /** 해설이 마지막으로 의견을 낸 구간 */
  lastPundit: number;
  /** 경기 전 전력 차 (홈 - 원정, 대략 능력 점수) */
  edge: number;
  /** 이미 한 말 (같은 말 반복 막기) */
  said: string[];
}

const P = (id: string) => `{p:${id}}`;
const C = (id: string) => `{c:${id}}`;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const SCORER_W: Record<string, number> = { ST: 0.8, LW: 0.55, RW: 0.55, AM: 0.5, LM: 0.35, RM: 0.35, CM: 0.18, DM: 0.07, LWB: 0.07, RWB: 0.07, LB: 0.05, RB: 0.05, CB: 0.09, GK: 0 };

function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function initCommentary(m: MatchState, edge: number): CommentaryState {
  const cm: CommentaryState = {
    feed: [], seed: hash(`${m.home.clubId}|${m.away.clubId}|${m.home.onPitch.map((o) => o.id).join(',')}`), lastPundit: -9, edge, said: [],
    seen: { goals: 0, cards: 0, injuries: 0, notes: 0, shots: { home: 0, away: 0 }, onTarget: { home: 0, away: 0 } },
  };
  const r = rngOf(cm, 0);
  const h = C(m.home.clubId), a = C(m.away.clubId);
  cm.feed.push({ minute: 0, voice: 'caster', kind: 'kickoff', text: r.pick([`${h}와 ${a}의 경기, 주심의 휘슬과 함께 시작합니다!`, `${h} 홈에서 ${a}를 맞이합니다. 킥오프!`, `자, ${h} 대 ${a}. 경기 시작합니다!`]), big: true });
  if (m.bigMatch) cm.feed.push({ minute: 0, voice: 'pundit', kind: 'intro', text: r.pick(['오늘은 빅매치입니다. 큰 경기에 강한 선수가 누구인지 보이는 날이죠.', '양 팀 모두 물러설 수 없는 경기입니다. 초반 기싸움이 중요합니다.']) });
  else if (Math.abs(edge) >= 4) {
    const fav = edge > 0 ? h : a, dog = edge > 0 ? a : h;
    cm.feed.push({ minute: 0, voice: 'pundit', kind: 'intro', text: r.pick([`전력상으로는 ${fav}가 앞섭니다. ${dog}는 버티면서 한 방을 노려야겠죠.`, `${fav}가 우세하다는 평가지만, 축구는 모릅니다. ${dog}의 역습이 관건입니다.`]) });
  } else cm.feed.push({ minute: 0, voice: 'pundit', kind: 'intro', text: r.pick(['전력이 비슷한 두 팀입니다. 작은 실수 하나가 승부를 가를 수 있어요.', '팽팽한 경기가 예상됩니다. 감독들의 수 싸움도 볼만하겠습니다.']) });
  return cm;
}

const rngOf = (cm: CommentaryState, seg: number): Rng => createRng((cm.seed ^ Math.imul(seg + 1, 0x9e3779b1)) >>> 0);

function pickPlayer(r: Rng, t: TeamInMatch, w: (o: OnPitch) => number, exclude?: string): OnPitch | null {
  const c = t.onPitch.filter((o) => o.id !== exclude && w(o) > 0);
  return c.length ? r.weighted(c, w) : null;
}
const gkOf = (t: TeamInMatch) => t.onPitch.find((o) => o.slot === 'GK');
const scoreOf = (m: MatchState, upTo?: number) => {
  const g = upTo == null ? m.summary.goals : m.summary.goals.slice(0, upTo);
  return { home: g.filter((x) => x.side === 'home').length, away: g.filter((x) => x.side === 'away').length };
};

/** 한 구간이 끝난 뒤: 그 구간 장면 해설 + 가끔 해설 의견 */
export function commentSegment(m: MatchState, _ctx: MatchCtx, notes: MatchNote[]) {
  const cm = m.cm;
  if (!cm) return;
  const seg = m.segment;            // 방금 끝난 구간 다음 번호
  const r = rngOf(cm, seg);
  const lines: FeedLine[] = [];
  const s = m.summary;
  const startMin = (seg - 1) * 5;

  // ── 슈팅 · 선방 (골이 아닌 것만, 팀마다 많아야 2줄) ──
  const goalsThis = s.goals.slice(cm.seen.goals);
  for (const side of ['home', 'away'] as Side[]) {
    const t = m[side], opp = m[other(side)];
    const g = goalsThis.filter((x) => x.side === side).length;
    const shots = t.shots - cm.seen.shots[side] - g;
    const onT = Math.max(0, t.onTarget - cm.seen.onTarget[side] - g);
    cm.seen.shots[side] = t.shots; cm.seen.onTarget[side] = t.onTarget;
    for (let i = 0; i < Math.min(2, shots); i++) {
      const sh = pickPlayer(r, t, (o) => SCORER_W[o.slot] ?? 0.1);
      if (!sh) break;
      const gk = gkOf(opp);
      const minute = startMin + r.int(1, 5);
      if (i < onT && gk) lines.push({ minute, side, voice: 'caster', kind: 'save', text: r.pick([`${P(sh.id)}의 슈팅! ${P(gk.id)}가 막아 냅니다.`, `${P(sh.id)}, 골문 구석을 노렸지만 ${P(gk.id)}의 선방!`, `${P(sh.id)}의 강한 슈팅, ${P(gk.id)}가 쳐 냅니다. 코너킥.`, `${P(sh.id)}가 일대일 기회를 잡았지만… ${P(gk.id)}가 각을 좁혀 막습니다!`]) });
      else lines.push({ minute, side, voice: 'caster', kind: 'miss', text: r.pick([`${P(sh.id)}의 슈팅이 골대를 벗어납니다.`, `${P(sh.id)}, 아쉽게 크로스바 위로 넘어갑니다.`, `${P(sh.id)}의 중거리 슛, 수비 몸에 맞고 굴절됩니다.`, `${P(sh.id)}가 때렸지만 힘이 너무 들어갔어요. 골문 옆으로.`, `골대를 맞습니다! ${P(sh.id)}의 슈팅이 골포스트를 때립니다!`]) });
    }
  }

  // ── 골 ──
  goalsThis.forEach((gl, k) => {
    const idx = cm.seen.goals + k;
    const before = scoreOf(m, idx), after = scoreOf(m, idx + 1);
    const side = gl.side, sc = P(gl.scorer), as = gl.assist ? P(gl.assist) : '';
    let text: string;
    if (gl.kind === 'pen') text = r.pick([`페널티킥, ${sc}가 키커로 나섭니다… 골! 골키퍼는 반대로 몸을 날렸습니다.`, `${sc}, 침착하게 페널티킥을 성공시킵니다!`]);
    else if (gl.kind === 'set') text = as ? r.pick([`코너킥! ${as}의 킥을 ${sc}가 머리로 받아 넣습니다!`, `프리킥 상황, ${as}가 올린 공을 ${sc}가 헤더로 연결! 골!`, `세트피스에서 터졌습니다! ${as}의 정확한 킥, ${sc}의 마무리!`]) : r.pick([`${sc}의 프리킥! 벽을 넘어 골문 구석으로 빨려 들어갑니다!`, `세트피스 혼전 속에서 ${sc}가 밀어 넣습니다!`]);
    else text = as ? r.pick([`${as}의 침투 패스를 받은 ${sc}, 침착하게 마무리합니다!`, `${as}가 측면에서 올린 크로스, ${sc}의 헤더! 골!`, `${as}와 주고받은 ${sc}, 낮게 깔아 차서 골망을 흔듭니다!`, `${as}의 컷백을 ${sc}가 그대로 때립니다. 골!`]) : r.pick([`${sc}가 수비수를 제치고 왼발 슈팅! 골!`, `${sc}의 중거리 슛이 그대로 꽂힙니다!`, `혼전 상황, ${sc}가 끝까지 집중해서 밀어 넣습니다!`]);
    lines.push({ minute: gl.minute, side, voice: 'caster', kind: 'goal', text, big: true });
    // 점수 상황 반응
    const me = after[side], op = after[other(side)];
    const mine = s.goals.slice(0, idx + 1).filter((x) => x.scorer === gl.scorer).length;
    const extra: string[] = [];
    if (mine === 3) extra.push(`해트트릭! ${sc}가 오늘 경기를 지배합니다!`);
    else if (mine === 2) extra.push(`${sc}의 멀티골입니다!`);
    if (me === op) extra.push(gl.minute >= 80 ? `막판 동점골! ${C(m[side].clubId)}가 극적으로 따라붙습니다!` : `동점! ${C(m[side].clubId)}가 균형을 맞춥니다.`);
    else if (me === op + 1 && before[side] <= before[other(side)]) extra.push(gl.minute >= 85 ? `경기 막판 역전 결승골이 될 수 있습니다!` : `${C(m[side].clubId)}가 앞서 나갑니다!`);
    else if (me - op >= 3) extra.push(`점수 차가 벌어집니다. 사실상 승부가 기울었어요.`);
    for (const e of extra.slice(0, 1)) lines.push({ minute: gl.minute, side, voice: 'pundit', kind: 'goalReact', text: e });
    // 교체로 들어온 선수가 골 · 도움 → 감독 칭찬
    const subIn = (id?: string) => !!id && (m[side].played[id]?.from ?? 0) > 0;
    if (subIn(gl.scorer) || subIn(gl.assist)) lines.push({ minute: gl.minute, side, voice: 'pundit', kind: 'praiseSub', text: r.pick([`교체 카드가 그대로 적중했습니다! ${C(m[side].clubId)} 감독의 판단이 빛나네요.`, `벤치에서 나온 선수가 해냈습니다. 감독의 용병술, 칭찬할 만합니다.`]) });
    // 세트피스 실점 → 수비 조직 비판
    if (gl.kind === 'set') lines.push({ minute: gl.minute, side: other(side), voice: 'pundit', kind: 'critSet', text: r.pick([`${C(m[other(side)].clubId)}는 세트피스 수비가 아쉽습니다. 마킹이 완전히 풀렸어요.`, `세트피스 실점은 감독이 가장 싫어하는 실점이죠. 훈련장에서 다시 다듬어야겠습니다.`]) });
  });
  cm.seen.goals = s.goals.length;

  // ── 페널티 실축 · 선방 · 전술 변경 ──
  for (const n of notes) {
    if (n.kind === 'penMiss' && n.player) lines.push({ minute: n.minute, side: n.side, voice: 'caster', kind: 'penMiss', text: r.pick([`페널티킥… ${P(n.player)}가 놓칩니다! 골대를 벗어납니다!`, `${P(n.player)}의 페널티킥, 골키퍼가 막아 냅니다! 엄청난 선방!`]), big: true });
    if (n.kind === 'formation' && n.formation) lines.push({ minute: n.minute, side: n.side, voice: 'pundit', kind: 'formation', text: r.pick([`${C(m[n.side].clubId)} 감독이 포메이션을 ${n.formation.replace('★ ', '')}(으)로 바꿉니다. 판을 다시 짜겠다는 거죠.`, `${C(m[n.side].clubId)}가 ${n.formation.replace('★ ', '')}(으)로 전환합니다. 선수들 위치가 크게 달라집니다.`]) });
    if (n.kind === 'tactic') {
      const club = C(m[n.side].clubId);
      if (n.mentality != null) lines.push({ minute: n.minute, side: n.side, voice: 'pundit', kind: 'tactic', text: n.mentality >= 1 ? r.pick([`${club} 감독이 승부수를 띄웁니다. 라인을 끌어올리고 공격적으로 나서네요.`, `${club} 벤치에서 공격 지시가 나옵니다. 위험 부담을 안고 가겠다는 거죠.`]) : n.mentality <= -1 ? r.pick([`${club}가 내려섭니다. 지금 점수를 지키겠다는 계산이죠.`, `${club} 감독이 수비를 두텁게 합니다. 실리를 택했어요.`]) : `${club}가 균형을 맞추는 쪽으로 전술을 조정합니다.` });
      if (n.pressing != null) lines.push({ minute: n.minute, side: n.side, voice: 'pundit', kind: 'press', text: n.pressing >= 2 ? `${club}가 압박 강도를 높입니다. 체력 소모가 커지겠지만 상대 실수를 노리겠다는 거죠.` : n.pressing <= 0 ? `${club}가 압박을 풀고 체력을 아낍니다.` : `${club}가 압박을 보통으로 되돌립니다.` });
    }
  }

  // ── 카드 · 부상 ──
  for (const c of s.cards.slice(cm.seen.cards)) {
    const second = c.red && s.cards.some((x) => x.player === c.player && !x.red && x.minute <= c.minute);
    lines.push(c.red
      ? { minute: c.minute, side: c.side, voice: 'caster', kind: 'red', text: second ? `두 번째 경고! ${P(c.player)}가 퇴장당합니다!` : r.pick([`다이렉트 레드카드! ${P(c.player)}의 위험한 태클, 퇴장입니다!`, `주심이 바로 레드카드를 꺼냅니다. ${P(c.player)} 퇴장!`]), big: true }
      : { minute: c.minute, side: c.side, voice: 'caster', kind: 'yellow', text: r.pick([`${P(c.player)}, 거친 태클로 옐로카드를 받습니다.`, `${P(c.player)}에게 경고. 역습을 끊는 반칙이었어요.`, `${P(c.player)}의 옐로카드. 남은 시간 조심해야겠네요.`]) });
    if (c.red) lines.push({ minute: c.minute, side: c.side, voice: 'pundit', kind: 'redReact', text: r.pick([`수적 열세입니다. ${C(m[c.side].clubId)} 감독의 대응이 중요해졌어요.`, `이 퇴장이 경기의 흐름을 바꿀 수 있습니다.`]) });
  }
  cm.seen.cards = s.cards.length;
  for (const inj of s.injuries.slice(cm.seen.injuries)) lines.push({ minute: inj.minute, side: inj.side, voice: 'caster', kind: 'injury', text: r.pick([`${P(inj.player)}가 쓰러졌습니다. 의료진이 들어갑니다…`, `${P(inj.player)}가 다리를 붙잡고 고통스러워합니다. 더 뛰기 어려워 보입니다.`]) });
  cm.seen.injuries = s.injuries.length;

  // ── 교체 (이번 구간에 들어온 선수) ──
  for (const side of ['home', 'away'] as Side[]) {
    const t = m[side];
    const ins = Object.entries(t.played).filter(([, p]) => p.from > startMin && p.from <= seg * 5);
    const outs = Object.entries(t.played).filter(([id, p]) => p.to != null && p.to > startMin && p.to <= seg * 5 && !t.sentOff.includes(id) && !s.injuries.some((x) => x.player === id && x.minute > startMin));
    ins.forEach(([id, p], k) => lines.push({ minute: p.from, side, voice: 'caster', kind: 'sub', text: outs[k] ? `${C(t.clubId)} 교체: ${P(outs[k][0])} 나가고 ${P(id)} 들어갑니다.` : `${C(t.clubId)} 교체: ${P(id)}가 투입됩니다.` }));
  }

  // ── 해설 의견 (세 구간에 한 번까지) ──
  const minute = seg * 5;
  if (seg - cm.lastPundit >= 3 && minute < 90) {
    const sc = scoreOf(m);
    const opinion = punditOpinion(m, sc, minute, r);
    if (opinion && !cm.said.includes(opinion.key)) {
      lines.push({ minute, side: opinion.side, voice: 'pundit', kind: opinion.key.split(':')[0], text: opinion.text });
      cm.said.push(opinion.key);
      cm.lastPundit = seg;
    }
  }

  // ── 전반 종료 · 경기 종료 ──
  if (seg === 9) lines.push(halfTime(m, r));
  if (seg >= 18) lines.push(...fullTime(m, r));

  lines.sort((a, b) => a.minute - b.minute);
  cm.feed.push(...lines);
}

/** 상황에 따른 해설 의견: 칭찬 · 비판 · 걱정 */
function punditOpinion(m: MatchState, sc: Record<Side, number>, minute: number, r: Rng): { key: string; side?: Side; text: string } | null {
  const cands: { key: string; side?: Side; text: string; w: number }[] = [];
  for (const side of ['home', 'away'] as Side[]) {
    const t = m[side], o = m[other(side)], club = C(t.clubId);
    const diff = sc[side] - sc[other(side)];
    const poss = Math.round((t.possSum / Math.max(1, m.segment)) * 100);
    // 지고 있는데 수비적 → 비판
    if (diff < 0 && minute >= 60 && t.tactics.mentality <= 0) cands.push({ key: `critPassive:${side}`, side, w: 3, text: r.pick([`${club}가 지고 있는데도 아직 조심스럽습니다. 이제는 승부를 걸어야 할 시간이에요.`, `솔직히 이해가 안 됩니다. 뒤지고 있는 팀이 왜 이렇게 수비적으로 서 있나요?`]) });
    // 한 골 앞섰는데 공격적 → 걱정
    if (diff === 1 && minute >= 75 && t.tactics.mentality >= 1) cands.push({ key: `worryOpen:${side}`, side, w: 2, text: `${club}는 한 골 차인데도 계속 올라갑니다. 역습 한 방이면 동점이 될 수 있어요. 걱정되네요.` });
    // 체력이 떨어졌는데 교체가 없음 → 걱정
    const tired = t.onPitch.filter((x) => x.slot !== 'GK' && x.fitness < 45).length;
    if (tired >= 2 && t.subsUsed < t.maxSubs && minute >= 60) cands.push({ key: `worryTired:${side}`, side, w: 2, text: `${club} 선수들 다리가 무거워 보입니다. 교체 타이밍이 늦어지고 있어요.` });
    // 점유 · 슈팅 압도하는데 못 넣음 → 결정력 아쉬움
    if (poss >= 62 && t.shots >= o.shots + 5 && diff <= 0) cands.push({ key: `finish:${side}`, side, w: 2, text: r.pick([`${club}가 경기를 지배하고 있는데 마무리가 아쉽습니다.`, `점유율, 슈팅 모두 ${club}가 앞서는데 골이 안 나옵니다. 결정력의 문제죠.`]) });
    // 앞서면서 안정적 → 칭찬
    if (diff >= 1 && poss >= 50 && minute >= 30) cands.push({ key: `praiseControl:${side}`, side, w: 1, text: r.pick([`${club} 감독이 준비한 대로 경기가 흘러가는 것 같습니다. 아주 안정적이에요.`, `${club}의 경기 운영, 칭찬하고 싶습니다. 서두르지 않아요.`]) });
    // 압박 높음 + 체력 소모
    if (t.tactics.pressing >= 2 && minute >= 55) cands.push({ key: `worryPress:${side}`, side, w: 1, text: `${club}의 강한 압박, 효과는 있지만 후반 막판 체력이 버텨 줄지 지켜봐야 합니다.` });
  }
  if (!cands.length) {
    if (minute === 20 || minute === 70) return { key: `flow:${minute}`, text: r.pick(['아직 결정적인 장면은 많지 않습니다. 서로 탐색전을 이어 가네요.', '중원 싸움이 치열합니다. 누가 먼저 틈을 찾을지.']) };
    return null;
  }
  const c = r.weighted(cands, (x) => x.w);
  return { key: c.key, side: c.side, text: c.text };
}

function halfTime(m: MatchState, r: Rng): FeedLine {
  const sc = scoreOf(m), h = C(m.home.clubId), a = C(m.away.clubId);
  const poss = Math.round((m.home.possSum / Math.max(1, m.segment)) * 100);
  const lead = sc.home === sc.away ? '동점으로' : sc.home > sc.away ? `${h}가 앞선 채` : `${a}가 앞선 채`;
  return { minute: 45, voice: 'pundit', kind: 'half', big: true, text: `전반 종료, ${lead} 마칩니다 (${sc.home}:${sc.away}). 점유율 ${poss}:${100 - poss}, 슈팅 ${m.home.shots}:${m.away.shots}. ${r.pick(['후반 감독들의 선택이 궁금합니다.', '하프타임에 어떤 지시가 나올지 지켜봐야겠습니다.'])}` };
}

function fullTime(m: MatchState, r: Rng): FeedLine[] {
  const sc = scoreOf(m), h = C(m.home.clubId), a = C(m.away.clubId);
  const out: FeedLine[] = [{ minute: 90, voice: 'caster', kind: 'full', big: true, text: `경기 종료! ${h} ${sc.home} : ${sc.away} ${a}` }];
  const edge = m.cm?.edge ?? 0;
  const winner: Side | null = sc.home > sc.away ? 'home' : sc.away > sc.home ? 'away' : null;
  const fav: Side | null = Math.abs(edge) >= 3 ? (edge > 0 ? 'home' : 'away') : null;
  let verdict: string;
  if (winner && fav && winner !== fav) verdict = `이변입니다! ${C(m[winner].clubId)} 감독의 준비가 완벽하게 통했습니다. 반면 ${C(m[fav].clubId)} 감독은 비판을 피하기 어렵겠네요.`;
  else if (!winner && fav) verdict = `${C(m[fav].clubId)} 입장에선 아쉬운 무승부입니다. 이길 경기를 놓쳤다는 평가가 나올 수 있어요.`;
  else if (winner && Math.abs(sc.home - sc.away) >= 3) verdict = `${C(m[winner].clubId)}의 완승입니다. 감독의 전술이 상대를 압도했어요.`;
  else if (winner) verdict = r.pick([`${C(m[winner].clubId)}가 끝까지 집중력을 지켰습니다. 값진 승점 3점이네요.`, `치열한 경기였습니다. ${C(m[winner].clubId)} 감독이 웃었습니다.`]);
  else verdict = '서로 한 발씩 물러서지 않은 경기, 무승부가 공정한 결과로 보입니다.';
  out.push({ minute: 90, voice: 'pundit', kind: 'verdict', text: verdict });
  return out;
}
