// 재정 규정 (샐러리 캡) 테스트: 리그 · 시대별 규정 선택, UEFA 중 엄격한 쪽, 상각 · DNCG, AI · 사용자 같은 판정
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { costLimit, leagueRule, squadCost, uefaRule, withinRules, DEFAULT_CAP } from './rules';
import { canAfford, completeTransfer, wageRoom } from './transfer';
import { clubRevenue } from './finance';
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

describe('재정 규정 (샐러리 캡)', () => {
  it('리그 · 시대별 규정', () => {
    expect(leagueRule('eng1', '2005-06').ratio).toBe(DEFAULT_CAP);               // 규정 없던 시대 → 기본 캡
    expect(leagueRule('eng1', '2015-16').kind).toBe('loss');                     // PSR
    expect(leagueRule('eng1', '2026-27').ratio).toBe(0.85);                      // 선수단 비용 비율 85%
    expect(leagueRule('esp1', '2012-13').ratio).toBe(DEFAULT_CAP);
    expect(leagueRule('esp1', '2013-14').debt).toBe(true);                       // LCPD
    expect(leagueRule('ita1', '2025-26').ratio).toBe(0.7);
    expect(leagueRule('ger1', '2026-27').name).toContain('기본');
    expect(leagueRule('ger1', '2027-28').ratio).toBe(0.7);
    expect(leagueRule('fra1', '2020-21').dncg).toBe(true);
    expect(leagueRule('eng2', '2016-17').kind).toBe('loss');
    expect(uefaRule('2010-11')).toBeNull();
    expect(uefaRule('2015-16')?.kind).toBe('loss');
    expect([uefaRule('2023-24')?.ratio, uefaRule('2024-25')?.ratio, uefaRule('2025-26')?.ratio]).toEqual([0.9, 0.8, 0.7]);
  });

  it('유럽 대회 출전 구단은 리그 · UEFA 중 엄격한 쪽, 이적료 상각이 선수단 비용에 들어간다', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1', 'ita1', 'ger1', 'fra1']), LIV, 5);
    const ucl = w.europe!.ucl.entrants;
    const inE = ucl.find((c) => w.clubs[c].league === 'eng1')!;
    const out = Object.keys(w.competitions.eng1.table).find((c) => !ucl.includes(c) && !w.europe!.uel.entrants.includes(c))!;
    expect(costLimit(w, inE).rule.name).toContain('UEFA');        // PSR보다 UEFA 70%가 엄격
    expect(costLimit(w, out).rule.name).toContain('PSR');
    const before = squadCost(w, inE);
    const seller = Object.keys(w.clubs).find((c) => c !== inE)!;
    const p = w.players[w.clubs[seller].squad[0]];
    completeTransfer(w, p, inE, 40e6, 100e3, 4);
    expect(squadCost(w, inE)).toBe(before - 0 + 100e3 * 52 + 10e6);   // 주급 × 52 + 이적료 4천만 ÷ 4년
    expect(w.clubs[seller].sales).toBe(40e6);
  });

  it('한도를 넘는 영입은 AI · 사용자 모두 막힌다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 9);
    const { limit } = costLimit(w, LIV);
    const room = limit - squadCost(w, LIV);
    const tooMuch = Math.ceil(room / 52) + 1000;
    expect(withinRules(w, LIV, tooMuch).ok).toBe(false);
    expect(wageRoom(w, LIV)).toBeLessThan(tooMuch);
    const ai = Object.keys(w.clubs).find((c) => c !== LIV)!;
    const aiRoom = costLimit(w, ai).limit - squadCost(w, ai);
    expect(canAfford(w, ai, 0, Math.ceil(aiRoom / 52) + 1000)).toBe(false);
    expect(clubRevenue(w, ai)).toBeGreaterThan(0);
  });

  it('프랑스 DNCG: 잔고가 마이너스면 주급 총액을 늘릴 수 없다', () => {
    const w = createWorld(load('2025-26', ['fra1']), 'x', 2);
    const c = Object.keys(w.clubs)[0];
    expect(withinRules(w, c, 1000).ok).toBe(true);
    w.clubs[c].finance.balance = -1;
    const r = withinRules(w, c, 1000);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('DNCG');
    expect(withinRules(w, c, 0).ok).toBe(true);
  });
});

describe('완전 랜덤 시작 보정', () => {
  it('재정 규정 한도: 랜덤으로 시작한 그 시즌 · 내 구단만 +5%, 다음 시즌엔 없음', async () => {
    const { createWorld } = await import('./world');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const D = path.resolve(__dirname, '../../../data-public/seasons/2025-26/eng1');
    const meta = JSON.parse(fs.readFileSync(path.join(D, '_league.json'), 'utf8'));
    const w = createWorld({ season: '2025-26', leagues: [{ id: 'eng1', clubs: meta.clubs.map((c: string) => JSON.parse(fs.readFileSync(path.join(D, c + '.json'), 'utf8'))) }] }, 'c83d96l', 1);
    const base = costLimit(w, 'c83d96l').limit;
    const other = Object.keys(w.clubs).find((c) => c !== 'c83d96l')!;
    const otherBase = costLimit(w, other).limit;
    w.randomBonus = { season: '2025-26' };
    expect(costLimit(w, 'c83d96l').limit).toBeCloseTo(base * 1.05);
    expect(costLimit(w, other).limit).toBeCloseTo(otherBase);
    w.season = '2026-27';
    expect(costLimit(w, 'c83d96l').limit).not.toBeCloseTo(base * 1.05);
  });
});
