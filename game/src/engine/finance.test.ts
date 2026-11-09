import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason } from './season';
import { boardReview, ledgerOf, sum } from './finance';
import { completeTransfer } from './transfer';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIVERPOOL = 'c83d96l';
function loadSeason(season: string, league: string): SeasonInput {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return { season, leagues: [{ id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }] };
}

describe('재정 (리버풀 2025/26)', () => {
  it('한 시즌 동안 수입 · 지출이 쌓이고 이사회가 다음 시즌 예산을 정한다', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 11);
    const start = w.clubs[LIVERPOOL].finance.balance;
    while (!seasonOver(w)) advanceDay(w);
    closeSeason(w);
    const l = ledgerOf(w).current;
    const inc = sum(l.income), exp = sum(l.expense);
    console.log('수입', l.income, '\n지출', l.expense, '\n순이익', Math.round((inc - exp) / 1e6), 'M · 잔고', Math.round(start / 1e6), '→', Math.round(w.clubs[LIVERPOOL].finance.balance / 1e6), 'M');
    expect(l.income.tv).toBeGreaterThan(0);
    expect(l.income.gate).toBeGreaterThan(0);
    expect(l.income.prize).toBeGreaterThan(0);
    expect(l.expense.wages).toBeGreaterThan(0);
    expect(w.clubs[LIVERPOOL].finance.balance).toBe(start + inc - exp);
    expect(l.balances.length).toBeGreaterThan(40);
    const b = boardReview(w, { ...w.clubs[LIVERPOOL].finance }, '2026-27');
    console.log('이사회', b);
    expect(b.transferBudget).toBeGreaterThan(0);
    expect(ledgerOf(w).past).toHaveLength(1);
    expect(ledgerOf(w).current.season).toBe('2026-27');
  });

  it('이적료는 판매 수입 · 영입 지출로 기록된다', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 3);
    const other = Object.keys(w.clubs).find((c) => c !== LIVERPOOL)!;
    const before = w.clubs[LIVERPOOL].finance.balance;
    completeTransfer(w, w.players[w.clubs[other].squad[0]], LIVERPOOL, 20e6, 50e3, 3);
    completeTransfer(w, w.players[w.clubs[LIVERPOOL].squad[0]], other, 8e6, 50e3, 3);
    const l = ledgerOf(w).current;
    expect(l.expense.purchases).toBe(20e6);
    expect(l.income.sales).toBe(8e6);
    expect(w.clubs[LIVERPOOL].finance.balance).toBe(before - 12e6);
  });
});
