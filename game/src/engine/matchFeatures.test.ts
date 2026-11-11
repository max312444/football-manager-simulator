// 경기: 세트피스 · 페널티 · 선수별 지시 · 포메이션 숙련도 + 전체 균형
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { playToEnd } from './match';
import { createRng } from './rng';
import { famOf, trainFamiliarity } from './squad';
import type { Fixture, World } from './types';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

/** 같은 경기를 여러 번 (선수 상태는 그대로 두고 결과만) */
function sim(w: World, f: Fixture, n: number, seed = 1) {
  const out = { gf: 0, ga: 0, pen: 0, set: 0, penBy: {} as Record<string, number> };
  for (let i = 0; i < n; i++) {
    const m = prepareMatch(w, f, createRng(seed + i));
    const s = playToEnd(m, { players: w.players, rng: createRng(seed * 31 + i) });
    out.gf += s.homeGoals; out.ga += s.awayGoals;
    for (const g of s.goals) { if (g.side !== 'home') continue; if (g.kind === 'pen') { out.pen++; out.penBy[g.scorer] = (out.penBy[g.scorer] ?? 0) + 1; } if (g.kind === 'set') out.set++; }
    for (const p of Object.values(w.players)) p.injury = null;
  }
  return out;
}

describe('경기 기능', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 4);
  const opp = Object.keys(w.clubs).find((c) => c !== LIV)!;
  const f: Fixture = { id: 'x', league: 'eng1', date: w.date, home: LIV, away: opp, result: null } as unknown as Fixture;

  it('페널티 키커를 지정하면 그 선수가 찬다', () => {
    // 실제 선발로 나오는 수비수 (자동이라면 페널티를 차지 않을 선수)
    const starters = prepareMatch(w, f, createRng(1)).home.onPitch.map((o) => w.players[o.id]);
    const pick = starters.find((p) => p.pos === 'CB') ?? starters[1];
    w.clubs[LIV].lineup = null;
    w.clubs[LIV].tactics.takers = { pen: pick.id };
    const r = sim(w, f, 300, 3);
    const total = Object.values(r.penBy).reduce((a, b) => a + b, 0);
    console.log('PK 골', total, '지정 선수', r.penBy[pick.id] ?? 0);
    expect(total).toBeGreaterThan(10);
    // 지정 선수가 교체돼 나가면 자동 키커가 찬다 → 절반 가까이
    expect((r.penBy[pick.id] ?? 0) / total).toBeGreaterThan(0.35);
    w.clubs[LIV].tactics.takers = undefined;
  }, 60000);

  it('공중볼이 좋으면 세트피스 골이 늘어난다', () => {
    const base = sim(w, f, 300, 5).set;
    const saved = new Map<string, number | undefined>();
    for (const id of w.clubs[LIV].squad) { const p = w.players[id]; saved.set(id, p.growth.aer); p.growth.aer = (p.growth.aer ?? 0) + 15; }
    const boosted = sim(w, f, 300, 5).set;
    for (const id of w.clubs[LIV].squad) w.players[id].growth.aer = saved.get(id);
    console.log('세트피스 골', base, '→ 헤더 +15', boosted);
    expect(boosted).toBeGreaterThan(base * 1.15);
  }, 60000);

  it('선수 지시: 모두 공격 가담이면 득점 · 실점이 늘고, 수비 유지면 줄어든다', () => {
    const t = w.clubs[LIV].tactics;
    const run = (v: 'attack' | 'hold' | null) => {
      w.clubs[LIV].lineup = null;
      t.instr = v ? { formation: t.formation, list: Array(11).fill(v).map((x, i) => (i === 0 ? null : x)) } : undefined;
      // 지시는 구단 포메이션일 때만 → 추천도 그 포메이션으로 고정
      return sim(w, { ...f } as Fixture, 300, 9);
    };
    const keep = t.formation;
    // 추천이 다른 포메이션을 고르지 않도록 내 포메이션 숙련도를 최대로
    w.clubs[LIV].formFam = { [keep]: 100 };
    const none = run(null), atk = run('attack'), hold = run('hold');
    console.log('기본', none.gf, none.ga, '| 공격', atk.gf, atk.ga, '| 수비', hold.gf, hold.ga);
    expect(atk.gf).toBeGreaterThan(none.gf);
    expect(atk.ga).toBeGreaterThan(none.ga);
    expect(hold.ga).toBeLessThan(none.ga);
    t.instr = undefined;
  }, 120000);

  it('포메이션 숙련도: 경기마다 +5, 나머지 −1, 낮으면 경기력이 떨어진다', () => {
    const c = w.clubs[LIV];
    c.formFam = { '4-4-2': 60, '4-3-3': 60 };
    trainFamiliarity(c, '4-3-3');
    expect(famOf(c, '4-3-3')).toBe(65);
    expect(famOf(c, '4-4-2')).toBe(59);
    c.formFam = Object.fromEntries(Object.keys({ ...c.formFam, [c.tactics.formation]: 0, '4-2-3-1': 0, '4-3-3': 0, '4-4-2': 0, '3-5-2': 0, '4-1-4-1': 0, '4-5-1': 0, '4-4-1-1': 0, '3-4-3': 0, '5-3-2': 0, '5-4-1': 0, '4-3-1-2': 0, '4-1-2-1-2': 0, '4-2-2-2': 0, '3-4-2-1': 0, '3-4-1-2': 0 }).map((k) => [k, 100]));
    const hi = sim(w, f, 300, 11);
    for (const k of Object.keys(c.formFam)) c.formFam[k] = 0;
    const lo = sim(w, f, 300, 11);
    console.log('숙련도 100', hi.gf, hi.ga, '| 0', lo.gf, lo.ga);
    expect(lo.gf - lo.ga).toBeLessThan(hi.gf - hi.ga);
    c.formFam = undefined;
  }, 120000);
});

describe('경기 균형 (3개 리그 900경기)', () => {
  it('경기당 2.5~3.1골 · 홈 승률 40~50% · PK 0.15~0.35 · 세트피스 0.3~0.7', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1', 'ger1']), LIV, 9);
    let g = 0, n = 0, hw = 0, pen = 0, set = 0;
    const fx = Object.values(w.competitions).flatMap((c) => c.fixtures).slice(0, 900);
    fx.forEach((f, i) => {
      const s = playToEnd(prepareMatch(w, f, createRng(i + 1)), { players: w.players, rng: createRng(i + 77) });
      g += s.homeGoals + s.awayGoals; n++; if (s.homeGoals > s.awayGoals) hw++;
      for (const x of s.goals) { if (x.kind === 'pen') pen++; else if (x.kind === 'set') set++; }
      for (const p of Object.values(w.players)) p.injury = null;
    });
    console.log('골/경기', (g / n).toFixed(2), '홈승', (hw / n * 100).toFixed(1), 'PK', (pen / n).toFixed(2), '세트피스', (set / n).toFixed(2));
    expect(g / n).toBeGreaterThan(2.5); expect(g / n).toBeLessThan(3.1);
    expect(hw / n).toBeGreaterThan(0.4); expect(hw / n).toBeLessThan(0.5);
    expect(pen / n).toBeGreaterThan(0.15); expect(pen / n).toBeLessThan(0.35);
    expect(set / n).toBeGreaterThan(0.3); expect(set / n).toBeLessThan(0.7);
  }, 120000);
});
