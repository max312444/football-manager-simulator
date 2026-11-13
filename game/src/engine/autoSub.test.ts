// 직접 지휘하는 팀의 자동 교체: 55~80분 지친 선수 → 그 자리에 맞는 후보 (끄면 안 함)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { canSubInto, playToEnd } from './match';
import { createRng } from './rng';
import type { Fixture } from './types';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('자동 교체 (내 팀)', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 21);
  const opp = Object.keys(w.clubs).find((id) => id !== LIV)!;
  const f = { id: 'x', league: 'eng1', date: w.date, home: LIV, away: opp, result: null } as unknown as Fixture;
  const run = (auto: boolean, seed: number) => {
    for (const p of Object.values(w.players)) { p.injury = null; p.fitness = 100; }
    const m = prepareMatch(w, f, createRng(seed), { manualSide: 'home' });
    m.home.autoSub = auto;
    playToEnd(m, { players: w.players, rng: createRng(seed + 99) });
    const injured = m.summary.injuries.filter((i) => i.side === 'home').length;
    const ins = Object.entries(m.home.played).filter(([, p]) => p.from > 0);
    return { subs: m.home.subsUsed - injured, ins, m };
  };

  it('켜면 지친 선수를 자리에 맞는 후보로 바꾸고, 끄면 부상 교체만', () => {
    let on = 0, off = 0;
    for (let s = 1; s <= 12; s++) {
      const a = run(true, s);
      on += a.subs;
      // 들어온 선수는 모두 그 자리에 맞는 선수
      for (const [id] of a.ins) {
        const slot = a.m.home.onPitch.find((o) => o.id === id)?.slot;
        if (slot) expect(canSubInto(w.players[id], slot)).toBe(true);
      }
      off += run(false, s).subs;
    }
    console.log('12경기 자동 교체 수 · 켬', on, '끔', off);
    expect(on).toBeGreaterThan(12);
    expect(off).toBe(0);
  });
});

describe('상황 판단 교체', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 22);
  const clubs = Object.keys(w.clubs).filter((id) => id !== LIV);
  it('지고 있으면 일찍 몰아서, 이기면 늦게 · 크게 이기면 핵심 선수 휴식, 5분마다 한 명씩은 아님', () => {
    const byDiff: Record<string, { first: number[]; perWindow: number[] }> = { lose: { first: [], perWindow: [] }, draw: { first: [], perWindow: [] }, lead: { first: [], perWindow: [] } };
    let windowsTotal = 0, games = 0, keyRested = 0, bigLead = 0;
    for (let s = 1; s <= 40; s++) {
      for (const p of Object.values(w.players)) { p.injury = null; p.fitness = 100; }
      const opp = clubs[s % clubs.length];
      const f = { id: 'x', league: 'eng1', date: w.date, home: LIV, away: opp, result: null } as unknown as Fixture;
      const m = prepareMatch(w, f, createRng(s), { manualSide: 'home' });
      playToEnd(m, { players: w.players, rng: createRng(s + 500) });
      const injMin = new Set(m.summary.injuries.filter((i) => i.side === 'home').map((i) => i.minute));
      const mins = Object.values(m.home.played).filter((p) => p.from > 0 && !injMin.has(p.from)).map((p) => p.from);
      const uniq = [...new Set(mins)].sort((a, b) => a - b);
      if (!uniq.length) continue;
      games++; windowsTotal += uniq.length;
      const diffAt = (min: number) => m.summary.goals.filter((g) => g.minute < min && g.side === 'home').length - m.summary.goals.filter((g) => g.minute < min && g.side === 'away').length;
      const d0 = diffAt(uniq[0]);
      const k = d0 < 0 ? 'lose' : d0 === 0 ? 'draw' : 'lead';
      byDiff[k].first.push(uniq[0]);
      byDiff[k].perWindow.push(mins.filter((x) => x === uniq[0]).length);
      // 2골 이상 앞선 채 60분 → 선발 2명 이상 85분 전에 휴식
      if (diffAt(60) >= 2) {
        bigLead++;
        const out = Object.entries(m.home.played).filter(([, p]) => p.from === 0 && p.to != null && p.to < 85).length;
        if (out >= 2) keyRested++;
      }
    }
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : NaN;
    console.log('첫 교체 시각 평균 · 지고 있을 때', avg(byDiff.lose.first), `(${byDiff.lose.first.length}경기)`, '비길 때', avg(byDiff.draw.first), `(${byDiff.draw.first.length})`, '앞설 때', avg(byDiff.lead.first), `(${byDiff.lead.first.length})`);
    console.log('첫 타이밍 교체 인원 · 지고', avg(byDiff.lose.perWindow), '비김', avg(byDiff.draw.perWindow), '앞섬', avg(byDiff.lead.perWindow), '· 경기당 교체 타이밍', (windowsTotal / games).toFixed(1), '· 크게 앞선 경기', bigLead, '중 2명 이상 휴식', keyRested);
    expect(windowsTotal / games).toBeLessThanOrEqual(3.5);
    if (bigLead) expect(keyRested / bigLead).toBeGreaterThan(0.7);
    if (byDiff.lose.first.length && byDiff.lead.first.length) expect(avg(byDiff.lose.first)).toBeLessThan(avg(byDiff.lead.first));
  });
});
