// 훈련 · 선수 육성 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { monthlyDev, GROWTH_MAX } from './training';
import { ageOn } from './condition';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({
  season, leagues: ids.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});
const LIV = 'c83d96l';
const youngAvg = (w: ReturnType<typeof createWorld>, club: string, k?: string) => {
  const ps = w.clubs[club].squad.map((id) => w.players[id]).filter((p) => ageOn(p.birth, w.date) <= 21 && p.pos !== 'GK');
  const vals = ps.map((p) => (k ? p.growth[k as 'sho'] ?? 0 : Object.values(p.growth).reduce((a, b) => a + (b ?? 0), 0) / Math.max(1, Object.keys(p.growth).length)));
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
};

describe('훈련 · 선수 육성', () => {
  it('보통 선수는 거의 변화 없음, 성실한 유망주는 성장, 노장은 변화 없음', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 1);
    const p = w.players[w.clubs[LIV].squad[0]];
    p.birth = '2007-01-01';
    p.hidden = { ...p.hidden, professionalism: 10.5, ambition: 10.5 };
    w.clubs[LIV].facilities = { training: 3, youth: 3 };   // 훈련 시설 3단계 = 평균
    expect(Math.abs(monthlyDev(w, p))).toBeLessThan(0.02);                      // 평균 조건 ≈ 0
    p.hidden = { ...p.hidden, professionalism: 20, ambition: 18 };
    w.clubs[LIV].training = { focus: 'balanced', intensity: 2 };
    expect(monthlyDev(w, p)).toBeGreaterThan(0.3);
    p.birth = '1990-01-01';
    expect(monthlyDev(w, p)).toBe(0);                                          // 31세 이상은 훈련 성장 없음
  });

  it('한 시즌: 높은 강도는 낮은 강도보다 유망주가 더 자라고, 공격 초점은 슈팅이 더 오른다', () => {
    const run = (intensity: 0 | 2, focus: 'attack' | 'balanced') => {
      const w = createWorld(load('2025-26', ['eng1']), LIV, 21);
      w.clubs[LIV].training = { focus, intensity };
      let inj = 0;
      while (!seasonOver(w)) { const ev = advanceDay(w); inj += ev.filter((e) => e.type === 'injury' && e.label === '훈련 중 부상' && e.club === LIV).length; }
      return { all: youngAvg(w, LIV), sho: youngAvg(w, LIV, 'sho'), tac: youngAvg(w, LIV, 'tac'), inj, max: Math.max(...Object.values(w.players).flatMap((p) => Object.values(p.growth).map((v) => v ?? 0))) };
    };
    const low = run(0, 'balanced'), high = run(2, 'attack');
    console.log('낮음 · 균형', low, '\n높음 · 공격', high);
    expect(high.all).toBeGreaterThan(low.all);
    expect(high.sho).toBeGreaterThan(high.tac);
    expect(high.inj).toBeGreaterThanOrEqual(low.inj);
    expect(low.inj).toBe(0);
    expect(high.max).toBeLessThanOrEqual(GROWTH_MAX);
  }, 120000);
});

describe('훈련비', () => {
  it('훈련할 때마다 구단 돈을 쓰고, 높은 강도는 낮은 강도의 4배 · 잔고가 마이너스면 강도 낮음', async () => {
    const { ledgerOf, clubRevenue } = await import('./finance');
    const { effectiveTraining, trainingCost } = await import('./training');
    const cost = (intensity: 0 | 2) => {
      const w = createWorld(load('2025-26', ['eng1']), LIV, 5);
      w.clubs[LIV].training = { focus: 'balanced', intensity };
      for (let i = 0; i < 70; i++) advanceDay(w);   // 7월 1일 → 9월 초 (8월 · 9월 1일 두 번)
      return { spent: ledgerOf(w).current.expense.training, R: clubRevenue(w, LIV) };
    };
    const low = cost(0), high = cost(2);
    console.log('두 번 훈련 · 낮음', low.spent, '· 높음', high.spent);
    expect(low.spent).toBe(Math.round(low.R * 0.004) * 2);
    expect(high.spent).toBe(low.spent * 4);
    const w = createWorld(load('2025-26', ['eng1']), LIV, 5);
    w.clubs[LIV].training = { focus: 'attack', intensity: 2 };
    w.clubs[LIV].finance.balance = -1;
    expect(effectiveTraining(w.clubs[LIV]).intensity).toBe(0);
    expect(trainingCost(w, w.clubs[LIV])).toBe(Math.round(clubRevenue(w, LIV) * 0.004));
  });
});
