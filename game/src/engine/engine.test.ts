import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtures, roundRobin } from './fixtures';
import { createRng } from './rng';
import { advanceDay, createWorld, prepareMatch, seasonOver, type SeasonInput } from './world';
import { playToEnd, setTactics, step, substitute } from './match';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

// 공개용(패러디) 데이터로 테스트 — 저장소만 받아도 돌아가도록
const DATA = path.resolve(__dirname, '../../../data-public');
// 테스트용 사용자 구단: 쓰는 세 시즌에 모두 있는 구단 중 명성이 가장 높은 곳 (공개 데이터 이름이 바뀌어도 동작)
const USER = (() => {
  const read = (s: string) => JSON.parse(fs.readFileSync(path.join(DATA, 'seasons', s, 'eng1', '_league.json'), 'utf8')).clubs as string[];
  const common = read('2012-13').filter((c) => read('2013-14').includes(c) && read('2025-26').includes(c));
  const rep = (c: string) => JSON.parse(fs.readFileSync(path.join(DATA, 'seasons', '2013-14', 'eng1', c + '.json'), 'utf8')).reputation as number;
  return common.sort((a, b) => rep(b) - rep(a))[0];
})();
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
      const w = createWorld(input, USER, 77);
      for (let i = 0; i < 120; i++) advanceDay(w);
      return JSON.stringify(w.competitions.eng1.table);
    };
    expect(run()).toBe(run());
  });

  it('시즌 끝까지 진행하면 380경기 모두 결과', () => {
    const w = createWorld(input, USER, 5);
    let d = 0;
    while (!seasonOver(w) && d++ < 400) advanceDay(w);
    const fx = w.competitions.eng1.fixtures;
    expect(fx.every((f) => f.result)).toBe(true);
    expect(Object.values(w.competitions.eng1.table).every((r) => r.p === 38)).toBe(true);
  });

  it('경기 중 전술 변경·교체가 반영됨', () => {
    const w = createWorld(input, USER, 9);
    const f = w.competitions.eng1.fixtures.find((x) => x.home === USER)!;
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

import { closeSeason, nextSeasonOf, startNextSeason } from './season';

describe('시즌 전환', () => {
  function playOut(w: ReturnType<typeof createWorld>) {
    let d = 0;
    while (!seasonOver(w) && d++ < 400) advanceDay(w);
  }
  function checkIntegrity(w: ReturnType<typeof createWorld>) {
    const seen = new Map<string, string>();
    for (const c of Object.values(w.clubs)) for (const id of c.squad) {
      expect(seen.has(id), `${id} 두 구단 소속`).toBe(false);
      seen.set(id, c.id);
      expect(w.players[id].clubId).toBe(c.id);
    }
  }

  it('2012/13 → 2013/14: 실제 승격 구단 수만큼 강등, 능력치 갱신, 미래 선수 등장', () => {
    const w = createWorld(loadSeason('2012-13', 'eng1'), USER, 3);
    playOut(w);
    closeSeason(w);
    const before = new Set(Object.keys(w.competitions.eng1.table));
    const r = startNextSeason(w, loadSeason('2013-14', 'eng1'));
    const after = Object.keys(w.competitions.eng1.table);
    expect(after).toHaveLength(20);
    expect(after).toContain(USER);
    expect(r.promoted.eng1.length).toBe(r.relegated.eng1.length);
    expect(r.promoted.eng1.every((c) => !before.has(c))).toBe(true);
    expect(r.updated).toBeGreaterThan(300);
    expect(r.debuts.length).toBeGreaterThan(20);
    expect(w.season).toBe('2013-14');
    expect(w.date).toBe('2013-07-01');
    expect(w.competitions.eng1.fixtures).toHaveLength(380);
    expect(w.history.some((h) => h.season === '2012-13' && h.league === 'eng1')).toBe(true);
    expect(Object.values(w.players).every((p) => p.stats.apps === 0)).toBe(true);
    checkIntegrity(w);
    // 새 시즌도 끝까지 돌아감
    playOut(w);
    expect(seasonOver(w)).toBe(true);
  });

  it('데이터가 끝난 뒤(2026/27~): 같은 구단으로 계속, 성장 엔진 적용', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), USER, 4);
    playOut(w);
    closeSeason(w);
    const clubs = Object.keys(w.competitions.eng1.table).sort();
    const r = startNextSeason(w, { season: nextSeasonOf('2025-26'), leagues: [] });
    expect(w.season).toBe('2026-27');
    expect(Object.keys(w.competitions.eng1.table).sort()).toEqual(clubs);
    expect(r.aged).toBeGreaterThan(300);
    checkIntegrity(w);
  });

  it('직접 지정한 선발이 경기에 반영됨', () => {
    const w = createWorld(loadSeason('2013-14', 'eng1'), USER, 9);
    const club = w.clubs[USER];
    const gk2 = club.squad.filter((id) => w.players[id].pos === 'GK')[1];
    club.lineup = { starters: [gk2, ...Array(10).fill(null)], bench: [] };
    const f = w.competitions.eng1.fixtures.find((x) => x.home === USER)!;
    const m = prepareMatch(w, f, createRng(1));
    expect(m.home.onPitch[0].id).toBe(gk2);
  });
});

import { benchPenalty, updatePlaytime } from './loyalty';

describe('출전 시간과 충성도', () => {
  it('출전하면 오르고, 연속 벤치가 길수록 크게 떨어지며, 부상 · 징계 결장은 제외', () => {
    const w = createWorld(loadSeason('2013-14', 'eng1'), USER, 11);
    const [a, b, c, d] = w.clubs[USER].squad.map((id) => w.players[id]);
    for (const p of [a, b, c, d]) { p.loyalty = 50; p.benchStreak = 0; p.hidden.ambition = 10; }
    c.injury = { days: 20, label: '부상' };
    d.suspension = 1;
    for (let i = 0; i < 8; i++) updatePlaytime(w, [USER], { [a.id]: 90 }, new Set([a.id]));
    expect(a.loyalty).toBeGreaterThan(50);
    expect(a.benchStreak).toBe(0);
    expect(b.benchStreak).toBe(8);
    expect(b.loyalty).toBeLessThan(50);
    expect(c.loyalty).toBe(50);       // 부상 결장 제외
    expect(d.loyalty).toBe(50);       // 징계 결장 제외
    expect(benchPenalty(2)).toBe(0);
    expect(benchPenalty(10)).toBeGreaterThan(benchPenalty(4));
  });
});
