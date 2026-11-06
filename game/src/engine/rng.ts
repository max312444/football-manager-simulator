// 결정론적 난수 (mulberry32). 엔진의 모든 랜덤은 이것만 쓴다 → 같은 시드면 같은 결과.

export interface Rng {
  /** 0 이상 1 미만 */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  /** 가중치 비례 선택 */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T;
  /** 표준정규분포 */
  normal(): number;
  chance(p: number): boolean;
  /** 현재 상태 (세이브에 저장) */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(items, weight) {
      const ws = items.map(weight);
      let r = next() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
      return items[items.length - 1];
    },
    normal() {
      const u = Math.max(next(), 1e-12), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    state: () => s,
  };
}

/** 문자열 → 32비트 시드 (선수별 숨은 속성 생성 등) */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
