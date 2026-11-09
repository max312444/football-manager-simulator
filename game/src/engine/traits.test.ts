import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason } from './season';
import { seedTraits, TRAIT, traitMul, traitSeasonEnd } from './traits';
import { createRng } from './rng';
import { attr, overall } from './ratings';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIVERPOOL = 'c83d96l';
function loadSeason(season: string, league: string): SeasonInput {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return { season, leagues: [{ id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }] };
}

describe('호칭 (리버풀 2025/26)', () => {
  it('모두 호칭 없이 시작하고, 한 시즌 뒤 일부 선수에게만 붙는다', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 21);
    const active = Object.values(w.players).filter((p) => p.clubId);
    expect(active.every((p) => p.traits.length === 0)).toBe(true);
    while (!seasonOver(w)) advanceDay(w);
    const withT = active.filter((p) => p.traits.length);
    const count: Record<string, number> = {};
    for (const p of withT) for (const t of p.traits) count[TRAIT.get(t)!.ko] = (count[TRAIT.get(t)!.ko] ?? 0) + 1;
    console.log(`호칭 보유 ${withT.length}/${active.length}명`, count, '\n내 구단 알림', w.inbox.filter((e) => e.type === 'info' && e.text.includes('호칭')).length, '건');
    expect(withT.length).toBeGreaterThan(5);
    expect(withT.length).toBeLessThan(active.length * 0.35);
    expect(active.every((p) => p.traits.length <= 3)).toBe(true);
    // 함께 가질 수 없는 호칭
    for (const p of withT) for (const t of p.traits) for (const x of TRAIT.get(t)!.excludes ?? []) expect(p.traits).not.toContain(x);
    closeSeason(w);
  });

  it('호칭 효과가 능력치 · 확률에 반영된다', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 2);
    const p = w.players[w.clubs[LIVERPOOL].squad[0]];
    const before = attr(p, 'pas');
    p.traits = ['maestro', 'glass'];
    expect(attr(p, 'pas')).toBe(before + 2);
    expect(traitMul(p, 'injury')).toBe(1.5);
    p.traits = [];
  });
});

describe('시작 호칭 · 노쇠화', () => {
  const hist = JSON.parse(fs.readFileSync(path.join(DATA, 'history', 'players.json'), 'utf8'));
  const leagues = ['eng1', 'esp1', 'ita1', 'ger1', 'fra1'];
  const all = (season: string): SeasonInput => ({ season, leagues: leagues.map((l) => loadSeason(season, l).leagues[0]) });

  it('2025/26: 베테랑 · 스타 일부만 시작 호칭, 부정 호칭은 없음', () => {
    const w = createWorld(all('2025-26'), LIVERPOOL, 7);
    const n = seedTraits(w, hist, createRng(1));
    const ps = Object.values(w.players).filter((p) => p.clubId);
    const withT = ps.filter((p) => p.traits.length);
    const count: Record<string, number> = {};
    for (const p of withT) for (const t of p.traits) count[TRAIT.get(t)!.ko] = (count[TRAIT.get(t)!.ko] ?? 0) + 1;
    const age = (p: typeof ps[number]) => 2025 - +p.birth.slice(0, 4);
    const vet = ps.filter((p) => age(p) >= 30), young = ps.filter((p) => age(p) <= 23);
    console.log(`시작 호칭 ${n}개 · 보유 ${withT.length}/${ps.length}명 (${(withT.length / ps.length * 100).toFixed(1)}%) · 30세+ ${(vet.filter((p) => p.traits.length).length / vet.length * 100).toFixed(0)}% · 23세 이하 ${(young.filter((p) => p.traits.length).length / young.length * 100).toFixed(0)}%`, count);
    console.log('리버풀', w.clubs[LIVERPOOL].squad.map((id) => w.players[id]).filter((p) => p.traits.length).map((p) => `${p.name}(${age(p)}) ${p.traits.map((t) => TRAIT.get(t)!.ko).join('·')}`));
    expect(withT.length).toBeGreaterThan(ps.length * 0.04);
    expect(withT.length).toBeLessThan(ps.length * 0.3);
    expect(withT.every((p) => p.traits.every((t) => TRAIT.get(t)!.kind !== 'negative'))).toBe(true);
    expect(ps.every((p) => p.traits.length <= 2)).toBe(true);
  });

  it('노쇠화: 기량이 크게 떨어지면 스타일 호칭이 사라지고 하락세가 붙을 수 있다', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 4);
    const p = w.players[w.clubs[LIVERPOOL].squad.find((id) => w.players[id].pos !== 'GK')!];
    p.birth = '1990-01-01';
    p.traits = ['maestro', 'oneclub'];
    p.peak = overall(p) + 10;
    for (const k of ['pas', 'vis'] as const) p.base[k] = 70;
    let lost = 0, dec = 0;
    for (let i = 0; i < 40; i++) {
      p.traits = ['maestro', 'oneclub'];
      traitSeasonEnd(w, createRng(i + 1));
      if (!p.traits.includes('maestro')) lost++;
      if (p.traits.includes('decline')) dec++;
      expect(p.traits).toContain('oneclub');   // 영구 호칭
    }
    console.log(`40번 중 마에스트로 소멸 ${lost}번 · 하락세 ${dec}번`);
    expect(lost).toBeGreaterThan(20);
    expect(dec).toBeGreaterThan(8);
  });
});
