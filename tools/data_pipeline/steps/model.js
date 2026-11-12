// 자체 평가 모델 (attribute_type: derived, confidence: low)
// 실제 능력치를 복원하는 모델이 아니다. 출처 데이터에서 얻을 수 있는 신호로 대략적인 수준만 추정한다.
//   - 지명도: Wikidata 위키 문서 수(sitelinks) — 많이 알려진 선수일수록 높음 (현재 기준이라 과거 시즌엔 편향 있음)
//   - 국가대표 출전 수
//   - 나이 (전성기 26~30세)
//   - 리그 수준
const crypto = require('crypto');

const MODEL_VERSION = 'pipeline-derived-v1';
const LEAGUE_STRENGTH = { eng1: 1.0, esp1: 1.0, ita1: 0.98, ger1: 0.97, fra1: 0.93, eng2: 0.86, ger2: 0.83, esp2: 0.82, ita2: 0.82, fra2: 0.8 };

const POSITION_WEIGHTS = {
  // 포지션별 능력치 편차 (OVR 대비 +/-)
  GK: { ref: 4, han: 3, one: 2, pas: -8, pos: 3, aer: 0, pac: -15, sta: -10, str: -2, vis: -10, com: 2, ldr: -2 },
  CB: { sho: -25, pas: -6, dri: -12, tac: 5, pos: 5, aer: 5, pac: -4, sta: -2, str: 4, vis: -12, com: 0, ldr: 0 },
  LB: { sho: -18, pas: -2, dri: -2, tac: 2, pos: 0, aer: -8, pac: 4, sta: 4, str: -4, vis: -6, com: -2, ldr: -4 },
  RB: { sho: -18, pas: -2, dri: -2, tac: 2, pos: 0, aer: -8, pac: 4, sta: 4, str: -4, vis: -6, com: -2, ldr: -4 },
  DM: { sho: -10, pas: 3, dri: -4, tac: 4, pos: 4, aer: -2, pac: -6, sta: 4, str: 2, vis: 0, com: 2, ldr: 0 },
  CM: { sho: -4, pas: 4, dri: 0, tac: -2, pos: 0, aer: -8, pac: -3, sta: 4, str: -3, vis: 3, com: 2, ldr: -2 },
  AM: { sho: 2, pas: 4, dri: 4, tac: -20, pos: -15, aer: -14, pac: 0, sta: -2, str: -8, vis: 5, com: 3, ldr: -4 },
  LW: { sho: 0, pas: 0, dri: 5, tac: -22, pos: -18, aer: -14, pac: 6, sta: 0, str: -8, vis: 0, com: 0, ldr: -6 },
  RW: { sho: 0, pas: 0, dri: 5, tac: -22, pos: -18, aer: -14, pac: 6, sta: 0, str: -8, vis: 0, com: 0, ldr: -6 },
  ST: { sho: 5, pas: -6, dri: 0, tac: -28, pos: -20, aer: 0, pac: 2, sta: -2, str: 2, vis: -6, com: 3, ldr: -4 },
};
// 예전 빌드는 LM · RM · LWB · RWB 가 없어서 CM 편차로 만들어졌다 → 옛 능력치에서 OVR 을 되찾을 때는 이 표 (positions.js)
const LEGACY_WEIGHTS = { ...POSITION_WEIGHTS };
// 측면 미드필더 · 윙백 (2026-11 추가)
POSITION_WEIGHTS.LM = POSITION_WEIGHTS.RM = { sho: -6, pas: 2, dri: 3, tac: -10, pos: -8, aer: -12, pac: 5, sta: 5, str: -6, vis: 0, com: 0, ldr: -4 };
POSITION_WEIGHTS.LWB = POSITION_WEIGHTS.RWB = { sho: -15, pas: -1, dri: 0, tac: 0, pos: -2, aer: -8, pac: 6, sta: 6, str: -4, vis: -5, com: -2, ldr: -4 };
/** 예전 빌드의 포지션 편차 (없는 포지션은 CM) */
const deltaOf = (pos, k) => (LEGACY_WEIGHTS[pos] || LEGACY_WEIGHTS.CM)[k] ?? 0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 같은 선수·시즌이면 항상 같은 값이 나오는 작은 흔들림 (-3 ~ +3)
const jitter = (key) => (crypto.createHash('md5').update(key).digest()[0] % 7) - 3;

function overall({ sitelinks, caps, age, league }) {
  const fame = clamp(4 * Math.log2(Math.max(1, sitelinks) / 12), -10, 20);
  const intl = Math.min(8, 1.5 * Math.log2(1 + caps));
  const ageAdj = age < 26 ? -(26 - age) * 1.5 : age > 31 ? -(age - 31) * 1.2 : 0;
  const raw = 62 + fame + intl + ageAdj;
  return Math.round(clamp((raw - 40) * (LEAGUE_STRENGTH[league] ?? 0.9) + 40, 40, 92));
}

function attributes(ovr, pos, key) {
  const w = POSITION_WEIGHTS[pos] || POSITION_WEIGHTS.CM;
  return Object.fromEntries(Object.entries(w).map(([k, d]) => [k, clamp(Math.round(ovr + d + jitter(`${key}:${k}`)), 1, 99)]));
}

// 주급 추정 (EUR/주): 능력 지수 + 시대 보정 (2000년 ≈ 현재의 45%)
function weeklyWage(ovr, seasonYear) {
  const era = 0.45 + 0.55 * clamp((seasonYear - 2000) / 25, 0, 1);
  return Math.max(1000, Math.round(1000 * 1.17 ** (ovr - 55) * era / 500) * 500);
}

module.exports = { MODEL_VERSION, overall, attributes, weeklyWage, jitter, deltaOf };
