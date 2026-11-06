import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtures, roundRobin } from './fixtures';
import { createRng } from './rng';
import { advanceDay, createWorld, prepareMatch, seasonOver, type SeasonInput } from './world';
import { playToEnd, setTactics, step, substitute } from './match';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data');
function loadSeason(season: string, league: string): SeasonInput {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return { season, leagues: [{ id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }] };
}

describe('일정', () => {
  const clubs = Array.from({ length: 20 }, (_, i) => `c${i}`);
  it('20팀: 38라운드, 팀마다 홈 19 · 원정 19, 모든 상대와 2번', () => {
    const rounds = roundRobin(clubs, createRng(3));
    expect(rounds).toHaveLength(38);
    for (const c of clubs) {
      const games = rounds.flat().filter(([h, a]) => h === c || a === c);
      expect(games).toHaveLength(38);
      expect(games.filter(([h]) => h === c)).toHaveLength(19);
      for (const o of clubs) if (o !== c) expect(games.filter(([h, a]) => h === o || a === o)).toHaveLength(2);
    }
    for (const rd of rounds) expect(new Set(rd.flat()).size).toBe(20);   // 한 라운드에 한 번만
  });
  it('경기일이 시즌 안에 있고 라운드 순서대로', () => {
    const fx = buildFixtures('eng1', '2013-14', clubs, createRng(1));
    const dates = [...new Set(fx.map((f) => f.date))];
    expect(dates).toHaveLength(38);
    expect(dates[0] >= '2013-08-01').toBe(true);
    expect(dates[37] <= '2014-05-31').toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('월드 진행', () => {
  const input = loadSeason('2013-14', 'eng1');

  it('같은 시드면 같은 시즌 결과 (결정론)', () => {
    const run = () => {
      const w = createWorld(input, 'arsenal', 77);
      for (let i = 0; i < 120; i++) advanceDay(w);
      return JSON.stringify(w.competitions.eng1.table);
    };
    expect(run()).toBe(run());
  });

  it('시즌 끝까지 진행하면 380경기 모두 결과', () => {
    const w = createWorld(input, 'arsenal', 5);
    let d = 0;
    while (!seasonOver(w) && d++ < 400) advanceDay(w);
    const fx = w.competitions.eng1.fixtures;
    expect(fx.every((f) => f.result)).toBe(true);
    expect(Object.values(w.competitions.eng1.table).every((r) => r.p === 38)).toBe(true);
  });

  it('경기 중 전술 변경·교체가 반영됨', () => {
    const w = createWorld(input, 'arsenal', 9);
    const f = w.competitions.eng1.fixtures.find((x) => x.home === 'arsenal')!;
    const rng = createRng(1);
    const m = prepareMatch(w, f, rng, { manualSide: 'home' });
    const ctx = { players: w.players, rng };
    for (let i = 0; i < 9; i++) step(m, ctx);
    setTactics(m, 'home', { mentality: 2, pressing: 2 });
    expect(m.home.tactics.mentality).toBe(2);
    const out = m.home.onPitch.find((o) => o.slot !== 'GK')!.id;
    const inn = m.home.bench.find((id) => w.players[id].pos !== 'GK')!;
    expect(substitute(m, 'home', out, inn, ctx)).toBe(true);
    expect(m.home.onPitch.some((o) => o.id === inn)).toBe(true);
    const s = playToEnd(m, ctx);
    expect(s.ratings[inn]).toBeGreaterThan(0);
    expect(m.done).toBe(true);
  });
});
