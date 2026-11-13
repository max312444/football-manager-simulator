// 경기 엔진 (1단계): 90분을 5분 × 18구간으로 나눠 진행.
// 구간마다 양 팀 공격·중원·수비 전력으로 득점 기대값(xG)을 계산하고 결과를 뽑는다.
// 경기 도중 전술 변경·교체를 하면 다음 구간부터 바로 반영된다.
import type { AttrKey, Position } from '../data/types';
import type { Instr, MatchSummary, PlayerState, Side, Tactics } from './types';
import type { Rng } from './rng';
import { attr, playerFamiliarity, fitnessFactor, preMatchFactor, slotRating } from './ratings';
import { FILL_ORDER, FORMATIONS, type Lineup } from './squad';
import { commentSegment, initCommentary, type CommentaryState, type MatchNote } from './commentary';
import { traitForm, traitMul } from './traits';

export const SEGMENTS = 18;
const SEG_MIN = 5;

// ── 튜닝 상수 (시뮬레이션으로 맞춤: 경기당 2.6~2.8골, 홈 승률 약 45%) ──
export const TUNING = {
  baseXg: 0.068,        // 구간당 팀 평균 xG
  homeAdv: 1.1,          // 홈 xG 배율 (원정은 2 - homeAdv)
  ratioExp: 2.3,         // 공격/수비 비율 민감도
  possExp: 4,            // 중원 비율 → 점유율 민감도
  dayFormSpread: 0.08,   // 경기 당일 컨디션 최대 ±8%
  yellowPerSeg: 0.088,
  redPerSeg: 0.0016,
  injuryPerSeg: 0.0072,
  tire: 1.95,            // 구간당 체력 소모 기준 (보통 선수 90분에 약 32 · 높은 압박 더)
  openShare: 0.8,        // 일반 공격 xG 비율 (나머지는 세트피스 · 페널티)
  setXg: 0.0115,         // 구간당 세트피스(코너 · 프리킥) 기본 xG
  penPerSeg: 0.0095,     // 구간당 페널티 얻을 확률
};

// 선수별 지시: 유닛별 기여 배율 · 체력 소모 · 득점 · 카드
const INSTR: Record<Instr, { u: Partial<Record<'att' | 'mid' | 'def', number>>; tire: number; score: number; card: number }> = {
  attack: { u: { att: 1.1, def: 0.88 }, tire: 1.1, score: 1.3, card: 1 },
  hold: { u: { att: 0.85, def: 1.1 }, tire: 0.95, score: 0.6, card: 1 },
  press: { u: { mid: 1.06, def: 1.03 }, tire: 1.3, score: 1, card: 1.3 },
};

type Unit = 'att' | 'mid' | 'def' | 'gk';
const CONTRIB: Record<Position, Partial<Record<Unit, number>>> = {
  GK: { gk: 1 },
  CB: { def: 1, mid: 0.1 },
  RB: { def: 0.75, mid: 0.2, att: 0.15 }, LB: { def: 0.75, mid: 0.2, att: 0.15 },
  RWB: { def: 0.55, mid: 0.3, att: 0.3 }, LWB: { def: 0.55, mid: 0.3, att: 0.3 },
  DM: { def: 0.5, mid: 0.6 },
  CM: { def: 0.2, mid: 0.8, att: 0.25 },
  AM: { mid: 0.5, att: 0.65 },
  RM: { def: 0.15, mid: 0.45, att: 0.55 }, LM: { def: 0.15, mid: 0.45, att: 0.55 },
  RW: { def: 0.05, mid: 0.25, att: 0.8 }, LW: { def: 0.05, mid: 0.25, att: 0.8 },
  ST: { mid: 0.1, att: 1 },
};
// 4-4-2 기준 각 유닛 기여 합 (선수 수가 줄면 전력도 줄도록)
const REF: Record<Unit, number> = { att: 2.9, mid: 3.4, def: 4.2, gk: 1 };
const UNIT_ATTR: Record<Unit, Partial<Record<AttrKey, number>>> = {
  att: { sho: 3, dri: 2, pac: 2, com: 1.5, pas: 1.5, vis: 1, str: 0.5 },
  mid: { pas: 3, vis: 2, sta: 1.5, com: 1.2, dri: 1, tac: 1 },
  def: { tac: 3, pos: 3, aer: 1.5, pac: 1.2, str: 1.2, com: 0.8 },
  gk: { ref: 3, one: 2, han: 2, pos: 1, aer: 1 },
};

const SCORE_W: Record<Position, number> = { ST: 0.8, LW: 0.55, RW: 0.55, AM: 0.5, LM: 0.35, RM: 0.35, CM: 0.18, DM: 0.07, LWB: 0.07, RWB: 0.07, LB: 0.05, RB: 0.05, CB: 0.09, GK: 0 };
const ASSIST_W: Record<Position, number> = { AM: 1, LW: 0.9, RW: 0.9, LM: 0.85, RM: 0.85, CM: 0.6, ST: 0.5, LWB: 0.5, RWB: 0.5, LB: 0.35, RB: 0.35, DM: 0.3, CB: 0.08, GK: 0.02 };
const CARD_W: Record<Position, number> = { DM: 1.4, CB: 1.2, CM: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, AM: 0.6, LM: 0.8, RM: 0.8, LW: 0.6, RW: 0.6, ST: 0.7, GK: 0.15 };

export interface OnPitch {
  id: string;
  slot: Position;
  fitness: number;
  /** 경기 전 보정 × 당일 컨디션 */
  factor: number;
  dayZ: number;      // 당일 컨디션 (-1~1), 평점에 반영
  yellow: boolean;
  fromMinute: number;
  /** 이 자리 선수 지시 (교체돼도 자리에 남음) */
  instr?: Instr | null;
}

export interface TeamInMatch {
  clubId: string;
  tactics: Tactics;
  onPitch: OnPitch[];
  bench: string[];
  subsUsed: number;
  maxSubs: number;
  sentOff: string[];
  played: Record<string, { from: number; to: number | null }>;
  /** 경기 중 나간 선수의 나갈 때 체력 */
  exitFitness: Record<string, number>;
  goals: number; shots: number; onTarget: number; xg: number; possSum: number;
  /** 사용자가 직접 교체하는 팀이면 true → 자동 교체는 부상 때만 */
  manual: boolean;
  /** 포메이션 숙련도 배율 */
  famMult: number;
}

export interface MatchState {
  segment: number;
  home: TeamInMatch;
  away: TeamInMatch;
  summary: MatchSummary;
  bigMatch: boolean;
  done: boolean;
  /** 문자 중계 (사용자 경기만) */
  cm?: CommentaryState;
  /** 중계용 메모: 전술 변경 · 페널티 실축 (경기 결과와 무관) */
  notes?: MatchNote[];
}

export interface MatchCtx {
  players: Record<string, PlayerState>;
  rng: Rng;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function unitValue(p: PlayerState, u: Unit): number {
  const w = UNIT_ATTR[u];
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(w)) { s += attr(p, k as AttrKey) * v!; t += v!; }
  return s / t;
}

/** 경기 당일 컨디션 뽑기: 평소 컨디션 + 랜덤, 꾸준함이 낮을수록 폭이 큼 */
function rollDayForm(p: PlayerState, rng: Rng, bigMatch: boolean): { factor: number; z: number } {
  const spread = 0.5 * (1.45 - p.hidden.consistency / 20) * traitMul(p, 'spread');
  const z = clamp(0.6 * p.condition + rng.normal() * spread, -1, 1);
  let f = preMatchFactor(p) * (1 + TUNING.dayFormSpread * z);
  if (bigMatch) f *= 1 + (p.hidden.bigMatch - 10) * 0.003;
  if (p.traits.length) f *= 1 + traitForm(p, bigMatch);
  return { factor: f, z };
}

function team(clubId: string, lineup: Lineup, tactics: Tactics, maxSubs: number, ctx: MatchCtx, bigMatch: boolean, manual: boolean, fam = 75, chem = 1): TeamInMatch {
  const ins = tactics.instr?.formation === lineup.formation ? tactics.instr.list : [];
  const onPitch = lineup.starters.map(({ id, slot }, i) => {
    const p = ctx.players[id];
    const { factor, z } = rollDayForm(p, ctx.rng, bigMatch);
    return { id, slot, fitness: p.fitness, factor, dayZ: z, yellow: false, fromMinute: 0, instr: ins[i] ?? null };
  });
  const played: TeamInMatch['played'] = {};
  for (const o of onPitch) played[o.id] = { from: 0, to: null };
  return {
    clubId, tactics: { ...tactics, formation: lineup.formation }, onPitch, bench: [...lineup.bench], subsUsed: 0, maxSubs, sentOff: [],
    played, exitFitness: {}, goals: 0, shots: 0, onTarget: 0, xg: 0, possSum: 0, manual,
    famMult: (0.94 + 0.06 * (Math.max(0, Math.min(100, fam)) / 100)) * chem,   // 포메이션 숙련도 × 팀 케미 (chemistry.ts)
  };
}

export function createMatch(
  args: { home: string; away: string; homeLineup: Lineup; awayLineup: Lineup; homeTactics: Tactics; awayTactics: Tactics; maxSubs: number; bigMatch?: boolean; manualSide?: Side; homeFam?: number; awayFam?: number; homeChem?: number; awayChem?: number; commentary?: boolean },
  ctx: MatchCtx,
): MatchState {
  const bigMatch = !!args.bigMatch;
  const home = team(args.home, args.homeLineup, args.homeTactics, args.maxSubs, ctx, bigMatch, args.manualSide === 'home', args.homeFam, args.homeChem);
  const away = team(args.away, args.awayLineup, args.awayTactics, args.maxSubs, ctx, bigMatch, args.manualSide === 'away', args.awayFam, args.awayChem);
  const m: MatchState = {
    segment: 0, home, away, bigMatch, done: false,
    summary: {
      homeGoals: 0, awayGoals: 0, goals: [], cards: [], injuries: [], ratings: {},
      stats: { home: { shots: 0, onTarget: 0, xg: 0, possession: 50 }, away: { shots: 0, onTarget: 0, xg: 0, possession: 50 } },
    },
  };
  if (args.commentary) {
    // 경기 전 전력 차 (해설 판단용): 공격 · 중원 · 수비 평균 차이
    const sh = strengths(home, ctx), sa = strengths(away, ctx);
    const avg = (x: Record<string, number>) => (x.att + x.mid + x.def) / 3;
    m.notes = [];
    m.cm = initCommentary(m, avg(sh) - avg(sa));
  }
  return m;
}

function strengths(t: TeamInMatch, ctx: MatchCtx) {
  const acc: Record<Unit, { s: number; w: number }> = { att: { s: 0, w: 0 }, mid: { s: 0, w: 0 }, def: { s: 0, w: 0 }, gk: { s: 0, w: 0 } };
  for (const o of t.onPitch) {
    const p = ctx.players[o.id];
    const mult = o.factor * fitnessFactor(o.fitness) * (0.7 + 0.3 * playerFamiliarity(p, o.slot)) * t.famMult;
    const ins = o.instr ? INSTR[o.instr].u : null;
    for (const [u, c] of Object.entries(CONTRIB[o.slot]) as [Unit, number][]) {
      const v = u === 'gk' && p.pos !== 'GK' ? 25 : unitValue(p, u) * mult * (ins?.[u as 'att'] ?? 1);
      acc[u].s += v * c; acc[u].w += c;
    }
  }
  const out = {} as Record<Unit, number>;
  for (const u of Object.keys(acc) as Unit[]) {
    const { s, w } = acc[u];
    const quality = w ? s / w : 30;
    out[u] = quality * Math.min(1.12, (w / REF[u]) ** 0.3);
  }
  return out;
}

function poisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

function pickPlayer(t: TeamInMatch, ctx: MatchCtx, weight: (o: OnPitch, p: PlayerState) => number, exclude?: string): OnPitch | null {
  const cands = t.onPitch.filter((o) => o.id !== exclude);
  const total = cands.reduce((s, o) => s + weight(o, ctx.players[o.id]), 0);
  if (total <= 0) return null;
  return ctx.rng.weighted(cands, (o) => weight(o, ctx.players[o.id]));
}

function injuryDays(rng: Rng): { days: number; label: string } {
  const r = rng.next();
  if (r < 0.7) return { days: rng.int(3, 14), label: rng.pick(['근육 경련', '타박상', '발목 염좌', '햄스트링 긴장']) };
  if (r < 0.95) return { days: rng.int(15, 45), label: rng.pick(['햄스트링 부상', '종아리 부상', '발목 인대 부상', '사타구니 부상']) };
  return { days: rng.int(60, 220), label: rng.pick(['무릎 인대 파열', '골절', '아킬레스건 부상']) };
}

function bestBenchFor(t: TeamInMatch, slot: Position, ctx: MatchCtx): string | null {
  let best: string | null = null, bs = -1;
  for (const id of t.bench) {
    const v = slotRating(ctx.players[id], slot);
    if (v > bs) { bs = v; best = id; }
  }
  return best;
}

/** 이 자리에 교체로 넣을 수 있는가: 골키퍼 ↔ 필드 불가, 필드는 주 · 보조 · 가까운 포지션(친숙도 0.7 이상)만 */
export const canSubInto = (p: PlayerState, slot: import('../data/types').Position) => (slot === 'GK') === (p.pos === 'GK') && playerFamiliarity(p, slot) >= 0.7;

/** 교체. 성공하면 true (사용자가 직접 하는 교체는 자리에 맞는 선수만) */
export function substitute(m: MatchState, side: Side, outId: string, inId: string, ctx: MatchCtx): boolean {
  const t = m[side];
  const i = t.onPitch.findIndex((o) => o.id === outId);
  if (i < 0 || !t.bench.includes(inId) || t.subsUsed >= t.maxSubs) return false;
  if (t.manual && !canSubInto(ctx.players[inId], t.onPitch[i].slot)) return false;
  const minute = m.segment * SEG_MIN;
  const p = ctx.players[inId];
  const { factor, z } = rollDayForm(p, ctx.rng, m.bigMatch);
  t.played[outId].to = minute;
  t.exitFitness[outId] = t.onPitch[i].fitness;
  t.played[inId] = { from: minute, to: null };
  t.onPitch[i] = { id: inId, slot: t.onPitch[i].slot, fitness: p.fitness, factor, dayZ: z, yellow: false, fromMinute: minute, instr: t.onPitch[i].instr };
  t.bench = t.bench.filter((b) => b !== inId);
  t.subsUsed++;
  return true;
}

/**
 * 경기 중 포메이션 변경: 뛰고 있는 선수들을 새 포메이션 자리에 가장 잘 맞게 다시 배치 (골키퍼는 그대로)
 * 퇴장 등으로 사람이 모자라면 덜 중요한 자리를 비운다. 자리별 선수 지시는 초기화
 */
export function setFormation(m: MatchState, side: Side, formation: string, ctx: MatchCtx): boolean {
  const slots = FORMATIONS[formation];
  const t = m[side];
  if (!slots || t.tactics.formation === formation) return false;
  const gk = t.onPitch.find((o) => o.slot === 'GK');
  const field = t.onPitch.filter((o) => o !== gk);
  const placed: (OnPitch | null)[] = slots.map(() => null);
  if (gk) placed[0] = gk;
  const used = new Set<OnPitch>();
  const order = slots.map((s, i) => ({ s, i })).filter((x) => x.s !== 'GK').sort((a, b) => FILL_ORDER.indexOf(a.s) - FILL_ORDER.indexOf(b.s));
  for (const { s, i } of order) {
    let best: OnPitch | null = null, bv = -1;
    for (const o of field) { if (used.has(o)) continue; const v = slotRating(ctx.players[o.id], s); if (v > bv) { bv = v; best = o; } }
    if (best) { used.add(best); placed[i] = { ...best, slot: s, instr: null }; }
  }
  t.onPitch = placed.filter((o): o is OnPitch => !!o);
  t.tactics = { ...t.tactics, formation };
  m.notes?.push({ minute: m.segment * SEG_MIN, side, kind: 'formation', formation });
  return true;
}

export function setTactics(m: MatchState, side: Side, change: Partial<Tactics>) {
  const before = m[side].tactics;
  m[side].tactics = { ...m[side].tactics, ...change };
  // 중계: 성향 · 압박이 바뀌면 해설이 반응
  if (m.notes && m.segment > 0 && (change.mentality != null && change.mentality !== before.mentality || change.pressing != null && change.pressing !== before.pressing)) {
    m.notes.push({ minute: m.segment * SEG_MIN, side, kind: 'tactic', ...(change.mentality != null && change.mentality !== before.mentality ? { mentality: change.mentality } : {}), ...(change.pressing != null && change.pressing !== before.pressing ? { pressing: change.pressing } : {}) });
  }
}

function autoSubs(m: MatchState, side: Side, ctx: MatchCtx) {
  const t = m[side];
  if (t.manual || t.subsUsed >= t.maxSubs || m.segment < 11 || m.segment > 16) return;
  // 지고 있으면 공격수 투입 성향, 아니면 지친 선수 교체
  const tired = [...t.onPitch].filter((o) => o.slot !== 'GK').sort((a, b) => a.fitness - b.fitness)[0];
  // 55~80분 사이 지친 선수부터 교체 (실제처럼 경기당 2~3명)
  if (!tired || tired.fitness > 88 - (m.segment - 11) * 1.5) return;
  const inId = bestBenchFor(t, tired.slot, ctx);
  if (inId) substitute(m, side, tired.id, inId, ctx);
}

/** 한 구간(5분) 진행 */
export function step(m: MatchState, ctx: MatchCtx): void {
  if (m.done) return;
  const { rng } = ctx;
  const sides: Side[] = ['home', 'away'];
  const str = { home: strengths(m.home, ctx), away: strengths(m.away, ctx) };
  const air = { home: aerial(m.home, ctx), away: aerial(m.away, ctx) };   // 세트피스용 (구간마다 한 번)

  const midH = str.home.mid ** TUNING.possExp, midA = str.away.mid ** TUNING.possExp;
  const possHome = clamp(midH / (midH + midA) + 0.03, 0.25, 0.75);
  m.home.possSum += possHome; m.away.possSum += 1 - possHome;

  for (const side of sides) {
    const me = m[side], opp = m[side === 'home' ? 'away' : 'home'];
    const s = str[side], o = str[side === 'home' ? 'away' : 'home'];
    const poss = side === 'home' ? possHome : 1 - possHome;
    const ratio = s.att / (0.78 * o.def + 0.22 * o.gk);
    const xg = TUNING.baseXg
      * (2 * poss) ** 0.6
      * ratio ** TUNING.ratioExp
      * (side === 'home' ? TUNING.homeAdv : 2 - TUNING.homeAdv)
      * (1 + 0.1 * me.tactics.mentality)      // 내가 공격적이면 기회 ↑
      * (1 + 0.08 * opp.tactics.mentality)    // 상대가 공격적이면 뒷공간 ↑
      * (1 - 0.04 * (opp.tactics.pressing - 1));
    const openXg = xg * TUNING.openShare;
    me.xg += openXg;
    const shots = poisson(openXg * 9.5, rng);
    const scored = rng.chance(Math.min(0.85, openXg));
    const totalShots = Math.max(shots, scored ? 1 : 0);
    me.shots += totalShots;
    me.onTarget += (scored ? 1 : 0) + Array.from({ length: Math.max(0, totalShots - (scored ? 1 : 0)) }).filter(() => rng.chance(0.3)).length;

    if (scored) {
      const minute = m.segment * SEG_MIN + rng.int(1, SEG_MIN);
      const scorer = pickPlayer(me, ctx, (op, p) => (SCORE_W[op.slot] * (attr(p, 'sho') / 70) ** 2 + (op.slot === 'CB' ? (attr(p, 'aer') / 70) ** 3 * 0.05 : 0)) * (op.instr ? INSTR[op.instr].score : 1));
      if (scorer) {
        const assist = rng.chance(0.72)
          ? pickPlayer(me, ctx, (op, p) => ASSIST_W[op.slot] * ((attr(p, 'pas') * attr(p, 'vis')) / 4900) ** 2, scorer.id)
          : null;
        me.goals++;
        m.summary.goals.push({ minute, side, scorer: scorer.id, ...(assist ? { assist: assist.id } : {}) });
      }
    }

    setPieces(m, side, ctx, air[side], air[side === 'home' ? 'away' : 'home']);

    // 카드
    const aggression = 1 + 0.1 * (me.tactics.pressing - 1);
    if (rng.chance(TUNING.yellowPerSeg * aggression)) {
      const c = pickPlayer(me, ctx, (op, p) => CARD_W[op.slot] * (21 - p.hidden.temperament) / 10 * traitMul(p, 'card') * (op.instr ? INSTR[op.instr].card : 1));
      if (c) {
        const minute = m.segment * SEG_MIN + rng.int(1, SEG_MIN);
        if (c.yellow) { if (rng.chance(0.45)) sendOff(m, side, c, minute); }
        else { c.yellow = true; m.summary.cards.push({ minute, side, player: c.id, red: false }); }
      }
    }
    if (rng.chance(TUNING.redPerSeg)) {
      const c = pickPlayer(me, ctx, (op, p) => CARD_W[op.slot] * (21 - p.hidden.temperament) / 10 * traitMul(p, 'card'));
      if (c) sendOff(m, side, c, m.segment * SEG_MIN + rng.int(1, SEG_MIN));
    }

    // 부상
    if (rng.chance(TUNING.injuryPerSeg)) {
      const v = pickPlayer(me, ctx, (op, p) => (p.hidden.injuryProne / 10) * (op.fitness < 50 ? 2 : 1) * traitMul(p, 'injury'));
      if (v) {
        const minute = m.segment * SEG_MIN + rng.int(1, SEG_MIN);
        const inj = injuryDays(rng);
        ctx.players[v.id].injury = inj;
        m.summary.injuries.push({ minute, side, player: v.id });
        const inId = bestBenchFor(me, v.slot, ctx);
        if (!(inId && substitute(m, side, v.id, inId, ctx))) {
          me.onPitch = me.onPitch.filter((x) => x.id !== v.id);   // 교체 불가 → 10명
          me.played[v.id].to = minute;
          me.exitFitness[v.id] = v.fitness;
        }
      }
    }

    // 체력 소모
    const pressMult = 1 + 0.25 * (me.tactics.pressing - 1);
    for (const op of me.onPitch) {
      const p = ctx.players[op.id];
      op.fitness = Math.max(0, op.fitness - TUNING.tire * pressMult * (1.25 - attr(p, 'sta') / 200) * (op.slot === 'GK' ? 0.3 : 1) * (op.instr ? INSTR[op.instr].tire : 1));
    }
  }

  m.segment++;
  for (const side of sides) autoSubs(m, side, ctx);
  if (m.segment >= SEGMENTS) finish(m, ctx);
  if (m.cm) { const n = m.notes ?? []; commentSegment(m, ctx, n.slice(m.cm.seen.notes)); m.cm.seen.notes = n.length; }
}

// ── 세트피스 · 페널티 ──
const outfield = (t: TeamInMatch) => t.onPitch.filter((o) => o.slot !== 'GK');
/** 공중 경합 힘: 필드 선수 중 상위 4명의 (헤더 + 힘 0.4) 평균 */
function aerial(t: TeamInMatch, ctx: MatchCtx): number {
  const v = outfield(t).map((o) => { const p = ctx.players[o.id]; return ((attr(p, 'aer') + 0.4 * attr(p, 'str')) / 1.4) * o.factor * fitnessFactor(o.fitness); }).sort((a, b) => b - a).slice(0, 4);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 40;
}
/** 키커: 지정한 선수가 뛰고 있으면 그 선수, 아니면 가장 잘 차는 선수 */
export function taker(t: TeamInMatch, ctx: MatchCtx, kind: 'set' | 'pen'): OnPitch | null {
  const want = t.tactics.takers?.[kind];
  const on = outfield(t);
  const chosen = want ? on.find((o) => o.id === want) : undefined;
  if (chosen) return chosen;
  const score = (o: OnPitch) => { const p = ctx.players[o.id]; return kind === 'pen' ? attr(p, 'sho') * 2 + attr(p, 'com') : attr(p, 'pas') + 0.5 * attr(p, 'vis') + 0.3 * attr(p, 'sho'); };
  return on.length ? on.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
}
function goalAt(m: MatchState, side: Side, scorer: string, assist: string | undefined, kind: 'pen' | 'set', rng: Rng) {
  const me = m[side];
  me.goals++; me.shots++; me.onTarget++;
  m.summary.goals.push({ minute: m.segment * SEG_MIN + rng.int(1, SEG_MIN), side, scorer, ...(assist ? { assist } : {}), kind });
}
function setPieces(m: MatchState, side: Side, ctx: MatchCtx, myAir: number, theirAir: number) {
  const { rng } = ctx;
  const me = m[side], opp = m[side === 'home' ? 'away' : 'home'];
  if (!outfield(me).length) return;
  const home = side === 'home' ? TUNING.homeAdv : 2 - TUNING.homeAdv;
  // 코너 · 프리킥: 우리 공중 경합 / 상대 공중 경합 (골키퍼 공중볼 조금) · 키커 정확도
  const k = taker(me, ctx, 'set');
  const kq = k ? (attr(ctx.players[k.id], 'pas') + 0.5 * attr(ctx.players[k.id], 'vis')) / 1.5 / 70 : 0.8;
  const gk = opp.onPitch.find((o) => o.slot === 'GK');
  const oppAir = theirAir * 0.85 + (gk ? attr(ctx.players[gk.id], 'aer') : 40) * 0.15;
  const setXg = TUNING.setXg * clamp((myAir / oppAir) ** 2, 0.4, 2.2) * clamp(kq, 0.6, 1.4) * home;
  me.xg += setXg;
  if (rng.chance(setXg)) {
    const direct = !!k && rng.chance(0.15 * clamp(attr(ctx.players[k.id], 'sho') / 75, 0.5, 1.3));   // 직접 프리킥
    const scorer = direct ? k : pickPlayer(me, ctx, (o, p) => (o.slot === 'GK' ? 0 : ((attr(p, 'aer') + 0.4 * attr(p, 'str')) / 100) ** 4 * (o.slot === 'CB' || o.slot === 'ST' ? 1 : 0.5)), k?.id);
    if (scorer) goalAt(m, side, scorer.id, !direct && k && rng.chance(0.75) ? k.id : undefined, 'set', rng);
  }
  // 페널티: 공격적일수록 조금 더 얻음 · 키커 슈팅 · 침착함 vs 골키퍼
  if (rng.chance(TUNING.penPerSeg * (1 + 0.1 * me.tactics.mentality) * home)) {
    const pk = taker(me, ctx, 'pen');
    if (!pk) return;
    const p = ctx.players[pk.id];
    const conv = clamp(0.58 + (attr(p, 'sho') + attr(p, 'com') - 140) / 220 - (gk ? (attr(ctx.players[gk.id], 'ref') - 70) / 400 : -0.1), 0.55, 0.92);
    me.xg += 0.76;
    if (rng.chance(conv)) goalAt(m, side, pk.id, undefined, 'pen', rng);
    else { me.shots++; if (rng.chance(0.6)) me.onTarget++; m.notes?.push({ minute: m.segment * SEG_MIN + 3, side, kind: 'penMiss', player: pk.id }); }
  }
}

function sendOff(m: MatchState, side: Side, o: OnPitch, minute: number) {
  const t = m[side];
  t.onPitch = t.onPitch.filter((x) => x.id !== o.id);
  t.sentOff.push(o.id);
  t.played[o.id].to = minute;
  t.exitFitness[o.id] = o.fitness;
  m.summary.cards.push({ minute, side, player: o.id, red: true });
}

function finish(m: MatchState, ctx: MatchCtx) {
  m.done = true;
  const s = m.summary;
  s.homeGoals = m.home.goals; s.awayGoals = m.away.goals;
  s.goals.sort((a, b) => a.minute - b.minute);
  s.cards.sort((a, b) => a.minute - b.minute);
  for (const side of ['home', 'away'] as Side[]) {
    const t = m[side];
    s.stats[side] = {
      shots: t.shots, onTarget: Math.min(t.onTarget, t.shots), xg: Math.round(t.xg * 100) / 100,
      possession: Math.round((t.possSum / SEGMENTS) * 100),
    };
  }
  // 평점
  const zOf = new Map<string, number>();
  for (const t of [m.home, m.away]) for (const o of t.onPitch) zOf.set(o.id, o.dayZ);
  for (const side of ['home', 'away'] as Side[]) {
    const t = m[side];
    const diff = side === 'home' ? s.homeGoals - s.awayGoals : s.awayGoals - s.homeGoals;
    const conceded = side === 'home' ? s.awayGoals : s.homeGoals;
    for (const [id, pl] of Object.entries(t.played)) {
      const mins = (pl.to ?? 90) - pl.from;
      if (mins <= 0) continue;
      const p = ctx.players[id];
      const goals = s.goals.filter((g) => g.scorer === id).length;
      const assists = s.goals.filter((g) => g.assist === id).length;
      const defensive = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM'].includes(p.pos);
      let r = 6.4 + clamp(diff, -3, 3) * 0.15 + goals * 0.9 + assists * 0.55
        + (defensive && conceded === 0 && mins >= 60 ? 0.5 : 0) - (defensive ? conceded * 0.12 : 0)
        + (zOf.get(id) ?? 0) * 0.6 + ctx.rng.normal() * 0.3;
      if (s.cards.some((c) => c.player === id && c.red)) r -= 1.5;
      else if (s.cards.some((c) => c.player === id)) r -= 0.2;
      if (mins < 25) r = 6.3 + (r - 6.3) * 0.5;
      s.ratings[id] = Math.round(clamp(r, 3, 10) * 10) / 10;
    }
  }
  // POM · 워스트: 30분 이상 뛴 선수 중 최고 · 최저 평점 (같으면 공격 포인트로)
  const pool = (['home', 'away'] as Side[]).flatMap((side) => Object.entries(m[side].played).filter(([id, pl]) => (pl.to ?? 90) - pl.from >= 30 && s.ratings[id] != null).map(([id]) => id));
  const pts = (id: string) => s.goals.filter((g) => g.scorer === id || g.assist === id).length;
  if (pool.length) {
    s.pom = pool.reduce((a, b) => (s.ratings[b] + pts(b) * 0.01 > s.ratings[a] + pts(a) * 0.01 ? b : a));
    s.worst = pool.reduce((a, b) => (s.ratings[b] < s.ratings[a] ? b : a));
  }
}

/** 끝까지 진행 */
export function playToEnd(m: MatchState, ctx: MatchCtx): MatchSummary {
  while (!m.done) step(m, ctx);
  return m.summary;
}

/** 경기 후 체력 (경기 중 소모분) */
export function finalFitness(m: MatchState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of [m.home, m.away]) {
    Object.assign(out, t.exitFitness);
    for (const o of t.onPitch) out[o.id] = o.fitness;
  }
  return out;
}

/** 출전 시간 */
export function minutesPlayed(m: MatchState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of [m.home, m.away]) for (const [id, pl] of Object.entries(t.played)) out[id] = (pl.to ?? 90) - pl.from;
  return out;
}
