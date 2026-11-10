// 유스 · 신규 선수 생성: 실제 데이터가 끝난 뒤(다음 시즌 데이터가 없는 리그) 매 시즌 구단마다 유스 선수가 입단한다
//
//  - 인원: 구단마다 2~4명 (명성이 높을수록 조금 더). 선수단 최대 인원 · 재정 규정(샐러리 캡) 안에서만
//  - 나이 16~18세, 계약 3년, 주급은 능력에 맞는 작은 금액
//  - 잠재력(숨은 값): 구단 명성 기준 평균, 대부분 60~75. 일정 확률로 에이스급
//      약 3% → 잠재력 86~94 (월드클래스 유망주), 약 10% → 78~86 (주전급 유망주)
//    지금 능력은 잠재력보다 15~30 낮게 시작해서 25세 무렵 잠재력에 닿도록 성장 (season.ts ageAttributes)
//  - 이름: 같은 국적 선수들의 이름과 성을 섞어서 만든 가상 이름 (한국어 이름도 같은 방식, 화면에서 등록)
//  - 국적: 같은 리그 선수 국적 분포에서 뽑음 (외국인 비율이 자연스럽게 따라감)
import { facilityLevel } from './facilities';
import type { AttrKey, Position } from '../data/types';
import type { ClubState, PlayerState, World } from './types';
import { createRng, hashSeed, type Rng } from './rng';
import { newPlayer } from './world';
import { overall } from './ratings';
import { withinRules } from './rules';
import { wageForAbility } from './transfer';

/** 포지션별 능력치 편차 (데이터 파이프라인 모델과 같은 값) */
const OFFSET: Record<string, Partial<Record<AttrKey, number>>> = {
  GK: { ref: 4, han: 3, one: 2, pas: -8, pos: 3, aer: 0, pac: -15, sta: -10, str: -2, vis: -10, com: 2, ldr: -2 },
  CB: { sho: -25, pas: -6, dri: -12, tac: 5, pos: 5, aer: 5, pac: -4, sta: -2, str: 4, vis: -12, com: 0, ldr: 0 },
  LB: { sho: -18, pas: -2, dri: -2, tac: 2, pos: 0, aer: -8, pac: 4, sta: 4, str: -4, vis: -6, com: -2, ldr: -4 },
  DM: { sho: -10, pas: 3, dri: -4, tac: 4, pos: 4, aer: -2, pac: -6, sta: 4, str: 2, vis: 0, com: 2, ldr: 0 },
  CM: { sho: -4, pas: 4, dri: 0, tac: -2, pos: 0, aer: -8, pac: -3, sta: 4, str: -3, vis: 3, com: 2, ldr: -2 },
  AM: { sho: 2, pas: 4, dri: 4, tac: -20, pos: -15, aer: -14, pac: 0, sta: -2, str: -8, vis: 5, com: 3, ldr: -4 },
  LW: { sho: 0, pas: 0, dri: 5, tac: -22, pos: -18, aer: -14, pac: 6, sta: 0, str: -8, vis: 0, com: 0, ldr: -6 },
  ST: { sho: 5, pas: -6, dri: 0, tac: -28, pos: -20, aer: 0, pac: 2, sta: -2, str: 2, vis: -6, com: 3, ldr: -4 },
};
const OFFSET_OF: Record<Position, string> = {
  GK: 'GK', CB: 'CB', LB: 'LB', RB: 'LB', LWB: 'LB', RWB: 'LB', DM: 'DM', CM: 'CM', AM: 'AM', LM: 'LW', RM: 'LW', LW: 'LW', RW: 'LW', ST: 'ST',
};
const POSITIONS: [Position, number][] = [
  ['GK', 10], ['CB', 18], ['LB', 7], ['RB', 7], ['DM', 8], ['CM', 14], ['AM', 7], ['LW', 7], ['RW', 7], ['ST', 15],
];
const GROUP: Record<Position, string> = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };
const MIN_GROUP: Record<string, number> = { GK: 3, DF: 8, MF: 8, FW: 5 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 잠재력: 명성 기준 평균에서 흔들림 + 에이스 확률 */
export function rollPotential(reputation: number, rng: Rng, youth = 3): number {
  const r = rng.next();
  const f = 1 + (youth - 3) * 0.3;                     // 유스 시설 1단계 ×0.4 · 3단계 ×1 · 5단계 ×1.6
  if (r < 0.03 * f) return rng.int(86, 94);            // 월드클래스 유망주
  if (r < 0.13 * f) return rng.int(78, 86);            // 주전급 유망주
  const mean = 60 + (reputation - 60) * 0.35 + (youth - 3) * 2;   // 명성 90 구단 ≈ 70, 명성 60 ≈ 60 · 유스 시설 단계마다 ±2
  return clamp(Math.round(mean + rng.normal() * 5), 48, 80);
}

/** 능력치 만들기: 목표 종합 능력 + 포지션 편차 + 흔들림 */
export function makeAttrs(ovr: number, pos: Position, rng: Rng): Partial<Record<AttrKey, number>> {
  const off = OFFSET[OFFSET_OF[pos]];
  return Object.fromEntries(Object.entries(off).map(([k, d]) => [k, clamp(Math.round(ovr + d! + rng.int(-4, 4)), 15, 95)]));
}

/** 같은 국적 선수 이름에서 이름 · 성을 섞는다 (이름이 한 단어면 성으로 씀) */
function nameParts(name: string): { first: string | null; last: string } {
  const t = name.trim().split(/\s+/);
  return t.length === 1 ? { first: null, last: t[0] } : { first: t.slice(0, -1).join(' '), last: t.at(-1)! };
}

export interface NamePool { first: { id: string; v: string }[]; last: { id: string; v: string }[] }
export function namePools(w: World): Map<string, NamePool> {
  const pools = new Map<string, NamePool>();
  for (const p of Object.values(w.players)) {
    if (p.generated) continue;   // 만든 이름으로 다시 만들지 않는다
    const pool = pools.get(p.nation) ?? (pools.set(p.nation, { first: [], last: [] }).get(p.nation)!);
    const { first, last } = nameParts(p.name);
    if (first) pool.first.push({ id: p.id, v: first });
    pool.last.push({ id: p.id, v: last });
  }
  return pools;
}

/** 유스 입단 결과 (화면 · 보고용) */
export interface YouthIntake { club: string; players: string[] }

/**
 * 시즌 시작 때 유스 입단. clubs = 이번에 유스를 받을 구단 (다음 시즌 데이터가 없는 리그의 구단)
 */
export function youthIntake(w: World, clubs: ClubState[], season: string, maxSquad: number, opts: { count?: number; academy?: boolean } = {}): YouthIntake[] {
  const out: YouthIntake[] = [];
  const pools = namePools(w);
  const y = +season.slice(0, 4);
  // 리그별 국적 분포
  const nationsOf = new Map<string, string[]>();
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.retired) continue;
    const lg = w.clubs[p.clubId]?.league;
    if (lg) (nationsOf.get(lg) ?? nationsOf.set(lg, []).get(lg)!).push(p.nation);
  }
  for (const club of clubs) {
    const rng = createRng((w.seed ^ hashSeed(`youth:${season}:${club.id}:${w.date}`)) >>> 0);
    const n = opts.count ?? clamp(2 + (club.reputation >= 80 ? 1 : 0) + (rng.chance(0.4) ? 1 : 0), 2, 4);
    const made: string[] = [];
    for (let i = 0; i < n && club.squad.length < maxSquad; i++) {
      // 포지션: 모자란 포지션 묶음을 먼저
      const counts: Record<string, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
      for (const id of club.squad) counts[GROUP[w.players[id].pos]]++;
      const short = Object.keys(MIN_GROUP).filter((g) => counts[g] < MIN_GROUP[g]);
      const cands = POSITIONS.filter(([pos]) => !short.length || short.includes(GROUP[pos]));
      const pos: Position = opts.academy && counts.GK === 0 ? 'GK' : rng.weighted(cands, ([, wt]) => wt)[0];
      const potential = rollPotential(club.reputation, rng, facilityLevel(club, 'youth'));
      const age = rng.int(16, 18);
      const ovr = clamp(potential - rng.int(15, 30) + (age - 16) * 2, 38, 64);
      // 국적 · 이름
      const nats = nationsOf.get(club.league) ?? [];
      let nation = nats.length ? rng.pick(nats) : 'ENG';
      let pool = pools.get(nation);
      if (!pool || pool.last.length < 5) { nation = nats.find((x) => (pools.get(x)?.last.length ?? 0) >= 5) ?? nation; pool = pools.get(nation); }
      const f = pool?.first.length ? rng.pick(pool.first) : null;
      const l = pool?.last.length ? rng.pick(pool.last) : null;
      const name = [f?.v, l?.v ?? 'Youth'].filter(Boolean).join(' ');
      let id = `gen-${season}-${club.id}-${i}`;
      for (let k = 2; w.players[id]; k++) id = `gen-${season}-${club.id}-${i}-${k}`;
      // 유스 계약은 능력 기준 주급의 60%. 아카데미 긴급 승격은 최저 주급(€500)
      const wage = opts.academy ? 500 : Math.max(500, Math.round((wageForAbility(w, ovr) * 0.6) / 500) * 500);
      if (!opts.academy && !withinRules(w, club.id, wage).ok) break;   // 재정 규정 안에서만
      const month = String(rng.int(1, 12)).padStart(2, '0'), day = String(rng.int(1, 28)).padStart(2, '0');
      const p = newPlayer({
        id, name, birth: `${y - age}-${month}-${day}`, nation, height: null, foot: null, number: null, pos,
        attrs: makeAttrs(ovr, pos, rng), wage, contract: `${y + 3}-06-30`,
      }, club.id, w.seed, season);
      p.contract = `${y + 3}-06-30`;
      p.contractGen = undefined;
      p.generated = true;
      p.potential = potential;
      p.nameFrom = [f?.id ?? null, l?.id ?? null];
      p.sharpness = 50;
      w.players[id] = p;
      club.squad.push(id);
      made.push(id);
    }
    if (made.length) out.push({ club: club.id, players: made });
  }
  return out;
}

/** 잠재력이 있는 선수의 시즌 성장 (25세 무렵 잠재력에 닿게). 출전이 적으면 70%만 */
export function growTowardPotential(p: PlayerState, age: number, minutesShare: number, rng: Rng): boolean {
  if (p.potential == null || age > 27) return false;
  const gap = p.potential - overall(p);
  if (gap <= 0) return false;
  const years = Math.max(1, 25 - age);
  const step = (gap / years) * (minutesShare > 0.3 ? 1 : 0.7);
  for (const k of Object.keys(p.base) as AttrKey[]) p.base[k] = clamp(Math.round((p.base[k] ?? 50) + step + rng.normal() * 1.2), 15, 97);
  return true;
}
