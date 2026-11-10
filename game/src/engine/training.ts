// 훈련 · 선수 육성: 매달 1일(8월~5월, 시즌 10회) 선수 능력이 조금씩 오르거나 내린다 → 육성 보정(growth)에 쌓임
//
//  - 실제 데이터 시대에는 데이터가 선수의 실제 성장을 이미 담고 있으므로, 훈련은 "실제보다 얼마나 더 / 덜 자라는지"만 만든다.
//    평균적인 선수(프로의식 · 야망 보통, 출전 절반, 훈련 시설 3단계, 보통 강도)는 거의 0
//  - 성장 요인: 나이 (어릴수록 크게), 프로의식, 야망, 출전 시간, 훈련 부하 (강도) × 훈련 시설 효율
//  - 훈련으로 크는 몫은 반드시 체력 소모 (훈련 부하) 에서만 나온다: 강도 낮음이면 시설이 좋아도 훈련 보너스 없음
//    시설은 같은 부하에서 얼마나 더 크는지 (1단계 ×0.78 · 3단계 ×1 · 5단계 ×1.23) · 회복도 단계마다 ±2%
//  - 훈련 초점: 고른 영역의 능력치가 1.6배, 나머지는 0.6배 (균형은 모두 1배). 골키퍼는 늘 골키퍼 능력치 위주
//  - 훈련 강도: 높음 = 성장 +, 체력 회복 느림, 훈련 중 부상 위험 / 낮음 = 반대
//  - 훈련비: 훈련할 때마다 구단 돈을 쓴다 (매출의 0.4% · 0.8% · 1.6%, 연 4 · 8 · 16%). 잔고가 마이너스면 강도 낮음으로만
//  - AI 구단은 균형 · 보통
import { facilityLevel } from './facilities';
import type { AttrKey } from '../data/types';
import type { ClubState, PlayerState, World } from './types';
import type { Rng } from './rng';
import { ageOn } from './condition';
import { book, clubRevenue, TRAINING_COST } from './finance';

export type TrainFocus = 'balanced' | 'attack' | 'defense' | 'physical' | 'technical';
export type Intensity = 0 | 1 | 2;
export interface Training { focus: TrainFocus; intensity: Intensity }

export const FOCUS_KO: Record<TrainFocus, string> = { balanced: '균형', attack: '공격', defense: '수비', physical: '체력', technical: '기술' };
export const INTENSITY_KO = ['낮음', '보통', '높음'] as const;
export const FOCUS_ATTRS: Record<TrainFocus, AttrKey[]> = {
  balanced: [],
  attack: ['sho', 'dri', 'com', 'pos'],
  defense: ['tac', 'pos', 'aer', 'str'],
  physical: ['pac', 'sta', 'str'],
  technical: ['pas', 'vis', 'dri', 'com'],
};
const GK_ATTRS: AttrKey[] = ['ref', 'han', 'one'];
const DEFAULT: Training = { focus: 'balanced', intensity: 1 };
export const trainingOf = (c: ClubState): Training => c.training ?? DEFAULT;
/** 실제로 하는 훈련: 잔고가 마이너스면 훈련비를 감당할 수 없어 강도 낮음 */
export const effectiveTraining = (c: ClubState): Training => (c.finance.balance < 0 ? { ...trainingOf(c), intensity: 0 } : trainingOf(c));
/** 한 번 훈련할 때 드는 돈 (매출 × 강도별 비율) */
export const trainingCost = (w: World, c: ClubState, intensity = effectiveTraining(c).intensity) => Math.round(clubRevenue(w, c.id) * TRAINING_COST[intensity]);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** 나이별 성장 크기 */
const ageFactor = (age: number) => (age <= 18 ? 1 : age <= 21 ? 0.9 : age <= 24 ? 0.55 : age <= 27 ? 0.25 : age <= 30 ? 0.1 : 0);
/** 훈련 부하 (체력 소모) 별 성장 몫. 보통 강도 · 시설 3단계에서 0 이 되도록 TRAIN_BASE 를 뺀다 */
const TRAIN_LOAD = [0, 0.12, 0.27];
const TRAIN_BASE = 0.12;
/** 훈련 시설 효율 (같은 부하에서 성장 배율) */
export const facilityEfficiency = (level: number) => 1 + (level - 3) * 0.1125;
/** 육성 보정 한도 (실제 기준선에서 너무 멀어지지 않게) */
export const GROWTH_MIN = -6, GROWTH_MAX = 10;

/** 한 선수의 이번 달 성장 크기 (양수 = 성장). 화면 설명용으로도 쓴다 */
export function monthlyDev(w: World, p: PlayerState, rng?: Rng): number {
  const club = p.clubId ? w.clubs[p.clubId] : null;
  if (!club) return 0;
  // 태업 (훈련 불참) 중이면 성장 대신 떨어진다
  if ((p.saga?.stage ?? 0) >= 2) return -0.15;
  const a = ageFactor(ageOn(p.birth, w.date));
  if (!a) return 0;
  const pro = (p.hidden.professionalism - 10.5) / 10;
  const amb = (p.hidden.ambition - 10.5) / 10;
  const played = w.competitions[club.league]?.table[club.id]?.p ?? 0;
  const share = played >= 3 ? Math.min(1, (p.stats.apps + p.stats.subApps * 0.4) / played) : 0.5;
  // 훈련 몫: 부하 (체력 소모) × 시설 효율 − 기준
  const train = TRAIN_LOAD[effectiveTraining(club).intensity] * facilityEfficiency(facilityLevel(club, 'training')) - TRAIN_BASE;
  const dev = 0.25 * pro + 0.1 * amb + 0.2 * (share - 0.5) + train;
  return a * (dev + (rng ? rng.normal() * 0.05 : 0));
}

/** 매달 1일 (8월 ~ 5월): 모든 구단 선수 성장 */
export function trainingMonth(w: World, rng: Rng) {
  const d = new Date(w.date + 'T00:00:00Z');
  if (d.getUTCDate() !== 1) return;
  const m = d.getUTCMonth() + 1;
  if (m > 5 && m < 8) return;
  for (const club of Object.values(w.clubs)) {
    if (!w.competitions[club.league]) continue;
    // 훈련비: 훈련할 때마다 구단 돈에서 (강도가 높을수록 비쌈)
    book(w, club.id, 'training', trainingCost(w, club));
    const focus = FOCUS_ATTRS[trainingOf(club).focus];
    for (const id of club.squad) {
      const p = w.players[id];
      if (p.injury) { p.dev = 0; continue; }
      const dev = monthlyDev(w, p, rng);
      p.dev = Math.round(dev * 100) / 100;
      if (!dev) continue;
      for (const k of Object.keys(p.base) as AttrKey[]) {
        const inFocus = p.pos === 'GK' ? GK_ATTRS.includes(k) : focus.includes(k);
        const wt = !focus.length && p.pos !== 'GK' ? 1 : inFocus ? 1.6 : 0.6;
        p.growth[k] = clamp(Math.round(((p.growth[k] ?? 0) + dev * wt * 0.6) * 100) / 100, GROWTH_MIN, GROWTH_MAX);
      }
    }
  }
}

/** 훈련 강도가 체력 회복에 주는 배율 */
export const recoveryFactor = (t: Training, facility = 3) => [1.08, 1, 0.9][t.intensity] * (1 + (facility - 3) * 0.02);
/** 하루 훈련 중 부상 확률 (경기 부상과 별도) */
export const trainingInjuryChance = (t: Training, injuryProne: number) => [0, 0.00012, 0.0003][t.intensity] * (0.6 + injuryProne / 20);
