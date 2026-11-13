// 감독 능력 · 난이도: 경기 결과에 주는 영향 · 교체 · 내 감독
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { playToEnd } from './match';
import { createRng } from './rng';
import { hireManager, managerOf, moraleTarget, devBonus, managerSeasonGrowth } from './managers';
import { teamStrength } from './ai';
import type { Fixture, World } from './types';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

/** 같은 경기 n번: 홈 승점 평균 */
function ppg(w: World, home: string, away: string, n: number) {
  const f = { id: 'x', league: w.clubs[home].league, date: w.date, home, away, result: null } as unknown as Fixture;
  let pts = 0, gd = 0;
  for (let i = 0; i < n; i++) {
    for (const p of Object.values(w.players)) { p.injury = null; p.fitness = 100; }
    const s = playToEnd(prepareMatch(w, f, createRng(i + 1)), { players: w.players, rng: createRng(i * 7 + 3) });
    pts += s.homeGoals > s.awayGoals ? 3 : s.homeGoals === s.awayGoals ? 1 : 0;
    gd += s.homeGoals - s.awayGoals;
  }
  return { ppg: pts / n, gd: gd / n };
}

describe('감독', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 11);
  const clubs = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => teamStrength(w, b.id) - teamStrength(w, a.id));
  const [a, b] = [clubs[2], clubs[3]];

  it('모든 구단에 감독 · 내 감독은 user', () => {
    expect(Object.values(w.clubs).filter((c) => c.id !== LIV).every((c) => managerOf(w, c.id))).toBe(true);
    expect(managerOf(w, LIV)?.user).toBe(true);
  });

  it('전술 능력: 명장(90)과 평범(50)은 같은 선수단에서 결과가 확실히 다르다', () => {
    const ma = managerOf(w, a.id)!, mb = managerOf(w, b.id)!;
    const save = [ma.tac, mb.tac];
    ma.tac = 90; mb.tac = 50;
    const good = ppg(w, a.id, b.id, 160);
    ma.tac = 50; mb.tac = 90;
    const bad = ppg(w, a.id, b.id, 160);
    [ma.tac, mb.tac] = save;
    console.log('명장 홈 승점', good.ppg.toFixed(2), '득실', good.gd.toFixed(2), '/ 평범 홈', bad.ppg.toFixed(2), bad.gd.toFixed(2));
    expect(good.ppg - bad.ppg).toBeGreaterThan(0.25);
  });

  it('난이도: AI가 나와 싸울 때만 강해진다 (쉬움 < 보통 < 어려움)', () => {
    const opp = clubs[0].id;
    const out: Record<string, number> = {};
    for (const d of ['easy', 'normal', 'hard'] as const) {
      w.settings = { difficulty: d };
      out[d] = ppg(w, LIV, opp, 160).ppg;
    }
    w.settings = {};
    console.log('리버풀 홈 승점 (상대', opp, ')', out);
    expect(out.easy).toBeGreaterThan(out.hard + 0.2);
    expect(out.normal).toBeLessThan(out.easy);
  });

  it('동기부여 · 육성 능력이 사기 기준 · 성장에 반영', () => {
    const m = managerOf(w, a.id)!;
    const s = [m.mot, m.dev];
    m.mot = 90; m.dev = 90;
    const hi = [moraleTarget(w, a.id), devBonus(w, a.id)];
    m.mot = 45; m.dev = 45;
    const lo = [moraleTarget(w, a.id), devBonus(w, a.id)];
    [m.mot, m.dev] = s;
    expect(hi[0] - lo[0]).toBeGreaterThan(5);
    expect(hi[1]).toBeGreaterThan(0.05);
    expect(lo[1]).toBeLessThan(0);
  });

  it('경질 → 실업 감독이나 가상 감독 부임, 성향이 전술로', () => {
    const before = w.clubs[b.id].managerId;
    const m = hireManager(w, b.id, createRng(5));
    expect(m.id).not.toBe(before);
    expect(w.clubs[b.id].managerId).toBe(m.id);
    expect(w.managers![before!].clubId).toBeNull();
    expect(w.clubs[b.id].tactics.mentality).toBe(m.style.mentality);
  });

  it('젊은 감독은 기대 이상 성적이면 성장 (잠재력까지)', () => {
    const m = managerOf(w, a.id)!;
    m.tac = 60; m.mot = 60; m.dev = 60; m.potential = 85; m.birth = '1985-01-01';
    // 기대보다 크게 잘한 시즌: 우승
    const table = [a.id, ...Object.keys(w.clubs).filter((id) => id !== a.id)].map((club) => ({ club }));
    managerSeasonGrowth(w, [{ season: w.season, league: 'eng1', champion: a.id, table } as never], (id) => teamStrength(w, id));
    expect(m.tac).toBeGreaterThan(60);
    expect(m.titles).toBe(1);
  });
});

describe('감독 데이터 (data-public/history/managers.json)', () => {
  const md = JSON.parse(fs.readFileSync(path.join(DATA, 'history', 'managers.json'), 'utf8'));
  it('시즌 감독 배정 · 명장과 평범한 감독 차이 · 실업 감독 명단', () => {
    const input = { ...load('2015-16', ['eng1', 'esp1']), managers: md };
    const w = createWorld(input, LIV, 3);
    const ai = Object.values(w.clubs).filter((c) => c.id !== LIV).map((c) => managerOf(w, c.id)!);
    const real = ai.filter((m) => !m.generated);
    const tacs = ai.map((m) => m.tac).sort((a, b) => b - a);
    console.log('2015-16 감독', ai.length, '실제', real.length, '전술 상위', tacs.slice(0, 5), '중간', tacs[Math.floor(tacs.length / 2)], '하위', tacs.slice(-3));
    expect(real.length / ai.length).toBeGreaterThan(0.9);
    expect(tacs[0] - tacs[Math.floor(tacs.length / 2)]).toBeGreaterThan(15);
    // 그 시즌 데이터의 감독이 모두 그 구단에 (내 구단 빼고)
    const sea = md.seasons['2015-16'];
    const placed = Object.values(w.clubs).filter((c) => c.id !== LIV && sea[c.id]);
    expect(placed.filter((c) => c.managerId === sea[c.id]).length).toBeGreaterThanOrEqual(placed.length - 1);
    // 내 구단 감독은 다른 구단으로 (명성에 맞는 곳)
    const mine = w.managers![sea[LIV]];
    console.log('내 구단 원래 감독', mine.name, '→', mine.clubId, w.clubs[mine.clubId!]?.reputation);
    expect(mine.clubId).toBeTruthy();
    expect(mine.clubId).not.toBe(LIV);
    expect(w.clubs[mine.clubId!].managerId).toBe(mine.id);
    const free = Object.values(w.managers!).filter((m) => !m.clubId && !m.user);
    expect(free.length).toBeGreaterThan(20);
  });
});
