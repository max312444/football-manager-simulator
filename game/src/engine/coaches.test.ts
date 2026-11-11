// AI 구단 감독 교체 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { coachDay, coachOf } from './coaches';
import { ensureManager } from './manager';
import { createRng } from './rng';
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

describe('AI 구단 감독', () => {
  it('목표보다 한참 못하는 구단은 신뢰도가 떨어져 경질 · 새 감독은 신뢰도 60, 공석이면 나에게 제안이 올 수 있다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
    ensureManager(w).reputation = 85;
    // 명성 높은 구단을 꼴찌로
    const big = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const t = w.competitions.eng1.table;
    Object.keys(t).forEach((c, i) => Object.assign(t[c], { p: 10, pts: 60 - i }));
    Object.assign(t[big], { p: 10, pts: 0 });
    coachOf(w, big).since = '2025-01-01';
    coachOf(w, big).confidence = 20;   // 이미 흔들리는 감독
    let sacked = false, offered = false;
    for (const d of ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']) {
      w.date = d;
      const ev = coachDay(w, createRng(+d.slice(5, 7)));
      if (ev.some((e) => e.type === 'coach' && e.club === big)) sacked = true;
      if (ev.some((e) => e.type === 'manager' && e.kind === 'offer' && e.club === big)) offered = true;
      if (sacked) break;
    }
    expect(sacked).toBe(true);
    expect(coachOf(w, big).confidence).toBe(60);
    console.log('공석 제안', offered);
  });

  it('한 시즌: 경질은 리그당 몇 번 정도 (너무 많지 않게)', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 11);
    let n = 0;
    while (!seasonOver(w)) { n += advanceDay(w).filter((e) => e.type === 'coach').length; w.sagaPrompt = undefined; w.scandalPrompt = undefined; if (w.manager) { w.manager.press = undefined; w.manager.boardEvent = undefined; } }
    console.log('한 시즌 경질', n);
    expect(n).toBeLessThanOrEqual(6);
  }, 60000);
});
