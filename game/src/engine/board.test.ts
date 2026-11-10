// 이사회 관계 · 예산 분배 · 요청 승인률 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { applyBudgetFactor, approvalChance, askBoard, budgetFactor, relationOf } from './board';
import { ensureManager } from './manager';
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
const fresh = () => createWorld(load('2025-26', ['eng1']), LIV, 5);

describe('이사회', () => {
  it('관계가 좋을수록 · 요구가 작을수록 찬성 확률이 높다', () => {
    const w = fresh();
    const m = ensureManager(w);
    const small = { kind: 'transfer' as const, amount: 10e6 }, big = { kind: 'transfer' as const, amount: 150e6 };
    m.relation = 30; const lo = approvalChance(w, small);
    m.relation = 85; const hi = approvalChance(w, small);
    console.log('관계 30 →', lo, '· 85 →', hi, '· 큰 요구', approvalChance(w, big));
    expect(hi).toBeGreaterThan(lo);
    expect(approvalChance(w, big)).toBeLessThan(hi);
    // 잔고가 마이너스면 크게 낮아짐
    w.clubs[LIV].finance.balance = -50e6;
    expect(approvalChance(w, small)).toBeLessThan(hi - 0.2);
  });

  it('반대되면 관계가 떨어지고 30일 동안 같은 요청 불가 · 최근 거절이 잦으면 확률도 떨어진다', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.relation = 10; m.confidence = 10;
    const a = { kind: 'transfer' as const, amount: 200e6 };
    const before = approvalChance(w, a);
    let r = askBoard(w, a, createRng(1));
    for (let s = 2; r.ok && s < 30; s++) { m.lastAsk = {}; r = askBoard(w, a, createRng(s)); }
    expect(r.ok).toBe(false);
    expect(relationOf(w)).toBeLessThan(10);
    expect(askBoard(w, a, createRng(9)).text).toContain('다시 요청');
    m.lastAsk = {};
    expect(approvalChance(w, a)).toBeLessThanOrEqual(before);
  });

  it('찬성되면 바로 반영 (이적 예산 증가 · 시설 공사 시작)', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.relation = 95; m.confidence = 95;
    const c = w.clubs[LIV];
    const tb = c.finance.transferBudget;
    let r = askBoard(w, { kind: 'transfer', amount: 5e6 }, createRng(1));
    for (let s = 2; !r.ok && s < 30; s++) { m.lastAsk = {}; r = askBoard(w, { kind: 'transfer', amount: 5e6 }, createRng(s)); }
    expect(c.finance.transferBudget).toBe(tb + 5e6);
    c.facilities = { training: 3, youth: 3 };
    r = askBoard(w, { kind: 'facility', facility: 'youth' }, createRng(3));
    for (let s = 4; !r.ok && s < 30; s++) { m.lastAsk = {}; r = askBoard(w, { kind: 'facility', facility: 'youth' }, createRng(s)); }
    expect(c.building?.[0]).toMatchObject({ kind: 'youth', level: 4 });
  });

  it('새 시즌 예산: 관계 100 → +15%, 0 → −15%', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.relation = 100; expect(budgetFactor(w)).toBeCloseTo(1.15);
    m.relation = 0; expect(budgetFactor(w)).toBeCloseTo(0.85);
    const tb = w.clubs[LIV].finance.transferBudget;
    applyBudgetFactor(w);
    expect(w.clubs[LIV].finance.transferBudget).toBe(Math.round(tb * 0.85));
  });
});
