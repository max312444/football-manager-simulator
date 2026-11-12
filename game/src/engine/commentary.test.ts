// 문자 중계: 경기 결과에 영향 없음 · 골마다 해설 · 이름 토큰 · 강팀 대 약팀 이변 확률
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { createMatch, playToEnd, setTactics, step } from './match';
import { createRng } from './rng';
import { recommend } from './ai';
import { matchRules } from './squad';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';
import type { Fixture } from './types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('문자 중계', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 2);
  const opp = Object.keys(w.clubs).find((c) => c !== LIV)!;
  const build = (commentary: boolean, seed: number) => {
    const rh = recommend(w, LIV, opp, true), ra = recommend(w, opp, LIV, false);
    const m = createMatch({ home: LIV, away: opp, homeLineup: rh.lineup, awayLineup: ra.lineup, homeTactics: rh.tactics, awayTactics: ra.tactics, maxSubs: matchRules(w.season).maxSubs, commentary }, { players: w.players, rng: createRng(seed) });
    return { m, s: playToEnd(m, { players: w.players, rng: createRng(seed + 1) }) };
  };

  it('중계를 켜도 경기 결과는 똑같다', () => {
    for (let i = 0; i < 30; i++) {
      const reset = () => { for (const p of Object.values(w.players)) p.injury = null; };
      reset(); const a = build(false, i * 7 + 1).s;
      reset(); const b = build(true, i * 7 + 1).s;
      expect(JSON.stringify([b.homeGoals, b.awayGoals, b.goals, b.cards, b.stats])).toBe(JSON.stringify([a.homeGoals, a.awayGoals, a.goals, a.cards, a.stats]));
      for (const p of Object.values(w.players)) p.injury = null;
    }
  });

  it('킥오프 · 골마다 해설 · 전반 · 경기 종료 평가, 이름은 토큰', () => {
    let goals = 0, goalLines = 0, pundit = 0;
    for (let i = 0; i < 20; i++) {
      const { m, s } = build(true, 100 + i);
      const feed = m.cm!.feed;
      expect(feed[0].kind).toBe('kickoff');
      expect(feed.some((l) => l.kind === 'half')).toBe(true);
      expect(feed.some((l) => l.kind === 'verdict')).toBe(true);
      goals += s.goals.length; goalLines += feed.filter((l) => l.kind === 'goal').length;
      pundit += feed.filter((l) => l.voice === 'pundit').length;
      for (const l of feed) for (const t of l.text.matchAll(/\{(p|c):([^}]+)\}/g)) expect(t[1] === 'p' ? !!w.players[t[2]] : !!w.clubs[t[2]]).toBe(true);
      if (i === 0) console.log(feed.slice(0, 14).map((l) => `${l.minute}' [${l.voice === 'pundit' ? '해설' : '캐스터'}] ${l.text}`).join('\n'));
      for (const p of Object.values(w.players)) p.injury = null;
    }
    expect(goalLines).toBe(goals);
    console.log('20경기 해설 의견', pundit, '줄');
    expect(pundit).toBeGreaterThan(40);
  });

  it('전술을 바꾸면 해설이 반응한다', () => {
    const { m } = build(true, 9);
    void m;
    const rh = recommend(w, LIV, opp, true), ra = recommend(w, opp, LIV, false);
    const mm = createMatch({ home: LIV, away: opp, homeLineup: rh.lineup, awayLineup: ra.lineup, homeTactics: rh.tactics, awayTactics: ra.tactics, maxSubs: 5, commentary: true }, { players: w.players, rng: createRng(5) });
    const ctx = { players: w.players, rng: createRng(6) };
    for (let i = 0; i < 12; i++) step(mm, ctx);
    setTactics(mm, 'home', { mentality: 2 });
    step(mm, ctx);
    expect(mm.cm!.feed.some((l) => l.kind === 'tactic')).toBe(true);
  });
});

describe('결과만 보기에도 이변이 있다 (강팀 대 약팀)', () => {
  it('리그 최강 대 최약: 강팀이 대부분 이기지만 가끔 진다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
    const strong = (id: string) => w.clubs[id].squad.map((x) => w.players[x]).length;
    void strong;
    const ids = Object.keys(w.clubs);
    const rep = ids.sort((a, b) => w.clubs[b].reputation - w.clubs[a].reputation);
    const top = rep[0], bottom = rep[rep.length - 1];
    let W = 0, D = 0, L = 0;
    for (let i = 0; i < 400; i++) {
      const home = i % 2 === 0;
      const f = { id: 'x', league: 'eng1', date: w.date, home: home ? top : bottom, away: home ? bottom : top, result: null } as unknown as Fixture;
      const s = playToEnd(prepareMatch(w, f, createRng(i + 1)), { players: w.players, rng: createRng(i * 13 + 5) });
      const [g, o] = home ? [s.homeGoals, s.awayGoals] : [s.awayGoals, s.homeGoals];
      if (g > o) W++; else if (g === o) D++; else L++;
      for (const p of Object.values(w.players)) p.injury = null;
    }
    console.log(`강팀 승 ${(W / 4).toFixed(1)}% · 무 ${(D / 4).toFixed(1)}% · 패 ${(L / 4).toFixed(1)}%`);
    expect(W / 400).toBeGreaterThan(0.55);
    expect(L / 400).toBeGreaterThan(0.02);
  }, 60000);
});

describe('경기 중 포메이션 변경', () => {
  it('뛰는 선수를 새 포메이션 자리에 다시 배치하고 해설이 반응한다', async () => {
    const { setFormation } = await import('./match');
    const { FORMATIONS } = await import('./squad');
    const w = createWorld(load('2025-26', ['eng1']), LIV, 8);
    const opp = Object.keys(w.clubs).find((c) => c !== LIV)!;
    const rh = recommend(w, LIV, opp, true), ra = recommend(w, opp, LIV, false);
    const m = createMatch({ home: LIV, away: opp, homeLineup: rh.lineup, awayLineup: ra.lineup, homeTactics: rh.tactics, awayTactics: ra.tactics, maxSubs: 5, commentary: true }, { players: w.players, rng: createRng(1) });
    const ctx = { players: w.players, rng: createRng(2) };
    for (let i = 0; i < 9; i++) step(m, ctx);
    const before = m.home.onPitch.map((o) => o.id).sort();
    const target = rh.tactics.formation === '3-5-2' ? '4-3-3' : '3-5-2';
    expect(setFormation(m, 'home', target, ctx)).toBe(true);
    expect(m.home.onPitch.map((o) => o.id).sort()).toEqual(before);
    expect(m.home.onPitch.map((o) => o.slot).sort()).toEqual([...FORMATIONS[target]].sort());
    step(m, ctx);
    expect(m.cm!.feed.some((l) => l.kind === 'formation')).toBe(true);
    playToEnd(m, ctx);
    expect(m.done).toBe(true);
  });
});
