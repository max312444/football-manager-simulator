// 유스 · 신규 선수 생성 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { growTowardPotential, makeAttrs, rollPotential } from './youth';
import { createRng } from './rng';
import { overall } from './ratings';
import { newPlayer } from './world';
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

describe('유스 · 신규 선수', () => {
  it('잠재력 분포: 대부분 평범, 약 3%는 월드클래스(86+), 약 13%는 78+', () => {
    const rng = createRng(1);
    const xs = Array.from({ length: 20000 }, () => rollPotential(80, rng));
    const share = (f: (v: number) => boolean) => xs.filter(f).length / xs.length;
    console.log('86+', share((v) => v >= 86).toFixed(3), '· 78+', share((v) => v >= 78).toFixed(3), '· 평균', (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1));
    expect(share((v) => v >= 86)).toBeGreaterThan(0.02);
    expect(share((v) => v >= 86)).toBeLessThan(0.045);
    expect(share((v) => v >= 78)).toBeGreaterThan(0.1);
    expect(share((v) => v >= 78)).toBeLessThan(0.2);
  });

  it('유망주는 25세 무렵 잠재력에 닿는다', () => {
    const rng = createRng(7);
    const p = newPlayer({ id: 't', name: 'T', birth: '2009-01-01', nation: 'ENG', height: null, foot: null, number: null, pos: 'ST', attrs: makeAttrs(60, 'ST', rng), wage: 1000, contract: null }, null, 1);
    p.potential = 90;
    const start = overall(p);
    for (let age = 17; age <= 25; age++) growTowardPotential(p, age, 1, rng);
    console.log('17세 능력', start, '→ 25세', overall(p), '(잠재력 90)');
    expect(overall(p)).toBeGreaterThanOrEqual(86);
    expect(overall(p)).toBeLessThanOrEqual(94);
  });

  it('데이터가 끝난 시즌부터 구단마다 2~4명 입단 (나이 16~18, 같은 국적 이름 섞기)', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
    while (!seasonOver(w)) advanceDay(w);
    closeSeason(w);
    const r = startNextSeason(w, { season: '2026-27', leagues: [] });
    const all = (r.youth ?? []).flatMap((y) => y.players).map((id) => w.players[id]);
    console.log('입단', all.length, '명 · 예시', all.slice(0, 4).map((p) => `${p.name}(${p.nation}, ${p.pos}, 능력 ${overall(p)}, 잠재력 ${p.potential})`).join(' / '));
    expect(r.youth!.length).toBe(20);
    for (const y of r.youth!) { expect(y.players.length).toBeGreaterThanOrEqual(2); expect(y.players.length).toBeLessThanOrEqual(4); }
    for (const p of all) {
      const age = 2026 - +p.birth.slice(0, 4);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(18);
      expect(p.generated).toBe(true);
      expect(p.clubId && w.clubs[p.clubId].squad.includes(p.id)).toBeTruthy();
      const src = p.nameFrom![1]!;
      expect(w.players[src].nation).toBe(p.nation);              // 같은 국적 선수의 성
      expect(p.name.endsWith(w.players[src].name.split(' ').at(-1)!)).toBe(true);
    }
    expect(w.inbox.some((e) => e.type === 'youth')).toBe(true);
  });

  it('데이터가 있는 시즌에는 유스를 만들지 않는다 (실제 신인이 등장)', () => {
    const w = createWorld(load('2024-25', ['eng1']), LIV, 4);
    while (!seasonOver(w)) advanceDay(w);
    closeSeason(w);
    const r = startNextSeason(w, load('2025-26', ['eng1']));
    expect(r.youth).toEqual([]);
  });
});
