// 시설 효과 · 투자 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { facilityDay, facilityLevel, startUpgrade, upgradeCost } from './facilities';
import { monthlyDev } from './training';
import { rollPotential } from './youth';
import { createRng } from './rng';
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

describe('시설', () => {
  it('유스 시설이 높을수록 잠재력 평균 · 에이스(86+) 비율이 높다', () => {
    const roll = (lv: number) => { const rng = createRng(7); const xs = Array.from({ length: 20000 }, () => rollPotential(75, rng, lv)); return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, ace: xs.filter((v) => v >= 86).length / xs.length }; };
    const lo = roll(1), mid = roll(3), hi = roll(5);
    console.log('유스 1단계', lo, '· 3단계', mid, '· 5단계', hi);
    expect(hi.avg).toBeGreaterThan(mid.avg);
    expect(mid.avg).toBeGreaterThan(lo.avg);
    expect(hi.ace).toBeGreaterThan(mid.ace * 1.3);
    expect(lo.ace).toBeLessThan(mid.ace * 0.7);
  });

  it('훈련 시설이 높을수록 매달 성장이 크다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
    const c = w.clubs[LIV];
    w.date = '2025-10-01';
    const p = c.squad.map((id) => w.players[id]).find((x) => +x.birth.slice(0, 4) >= 2004)!;
    c.facilities = { training: 1, youth: 3 };
    const low = monthlyDev(w, p);
    c.facilities = { training: 5, youth: 3 };
    const high = monthlyDev(w, p);
    console.log('훈련 시설 1단계', low.toFixed(3), '· 5단계', high.toFixed(3));
    expect(high).toBeGreaterThan(low);
    // 성장은 훈련 부하 (체력 소모) 에서만: 강도 낮음이면 시설이 좋아도 차이 없음
    c.training = { focus: 'balanced', intensity: 0 };
    const restHi = monthlyDev(w, p);
    c.facilities = { training: 1, youth: 3 };
    expect(monthlyDev(w, p)).toBeCloseTo(restHi, 6);
    // 강도 높음에서는 시설 차이가 더 크다
    c.training = { focus: 'balanced', intensity: 2 };
    const hardLo = monthlyDev(w, p);
    c.facilities = { training: 5, youth: 3 };
    expect(monthlyDev(w, p) - hardLo).toBeGreaterThan(high - low);
  });

  it('투자: 잔고에서 비용이 나가고, 공사 기간이 지나면 한 단계 오른다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
    const c = w.clubs[LIV];
    c.facilities = { training: 3, youth: 3 };
    const u = upgradeCost(w, LIV, 'training')!;
    const before = c.finance.balance;
    expect(startUpgrade(w, LIV, 'training').ok).toBe(true);
    expect(c.finance.balance).toBe(before - u.cost);
    expect(startUpgrade(w, LIV, 'training').ok).toBe(false);   // 이미 공사 중
    w.date = c.building![0].done;
    facilityDay(w);
    expect(facilityLevel(c, 'training')).toBe(4);
    expect(c.built?.training).toBe(4);
    expect(c.building).toEqual([]);
    // 잔고가 모자라면 못 한다
    c.finance.balance = 0;
    expect(startUpgrade(w, LIV, 'youth')).toMatchObject({ ok: false });
  });
});
