// 승부차기 순서: 정해진 승자와 맞고, 5명 · 서든데스 규칙대로 끝난다
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { createRng } from './rng';
import { shootoutSeq } from './shootoutSeq';
import type { Fixture } from './types';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });

describe('승부차기 순서', () => {
  it('승자 일치 · 차기 수 규칙', () => {
    const w = createWorld(load('2025-26', ['eng1']), 'c83d96l', 5);
    const [h, a] = Object.keys(w.clubs);
    const f = { id: 'x', league: 'eng1', date: w.date, home: h, away: a, result: null } as unknown as Fixture;
    const m = prepareMatch(w, f, createRng(1));
    let sudden = 0;
    for (let i = 0; i < 60; i++) {
      const win = i % 2 ? 'home' : 'away';
      const s = shootoutSeq(m, w.players, win, `k${i}`);
      const hs = s.home.filter((k) => k.scored).length, as = s.away.filter((k) => k.scored).length;
      expect([hs, as]).toEqual(s.score);
      expect(win === 'home' ? hs > as : as > hs).toBe(true);
      expect(Math.abs(s.home.length - s.away.length)).toBeLessThanOrEqual(1);
      if (s.home.length > 5) { sudden++; expect(s.home.length).toBe(s.away.length); expect(Math.abs(hs - as)).toBe(1); }
      else expect(s.home.length).toBeGreaterThanOrEqual(3);
    }
    console.log('서든데스까지 간 경우', sudden, '/ 60');
  });
});
