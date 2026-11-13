// 로테이션: 약한 상대 · 컵에서 주전을 쉬게 하고 못 뛴 선수 · 유망주에게 기회 (한 시즌 절반 돌려서 출전 분포 확인)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, type SeasonInput } from './world';
import { rotationLevel } from './ai';
import { overall } from './ratings';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('로테이션', () => {
  it('로테이션 정도: 비슷한 상대 0 · 약한 상대 ↑ · 컵 ↑ · 큰 경기 0', () => {
    expect(rotationLevel(1)).toBe(0);
    expect(rotationLevel(8)).toBeGreaterThan(0.4);
    expect(rotationLevel(4, { stage: 'cup', name: '3라운드' })).toBeGreaterThan(0.3);   // 비슷한 상대도 컵이면 조금
    expect(rotationLevel(15, { stage: 'euro', name: '준결승' })).toBe(0);
  });

  it('반 시즌: 1군급 선수 대부분이 출전 기회를 받는다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 31);
    while (w.date < '2026-01-01') {
      advanceDay(w);
      w.sagaPrompt = undefined; w.scandalPrompt = undefined;
      if (w.manager) { w.manager.press = undefined; w.manager.boardEvent = undefined; }
    }
    const report = (id: string) => {
      const ps = w.clubs[id].squad.map((x) => w.players[x]).filter((p) => p.pos !== 'GK');
      const ranked = [...ps].sort((a, b) => overall(b) - overall(a)).slice(0, 18);   // 1군급 필드 선수 18명
      const apps = ranked.map((p) => p.stats.apps + p.stats.subApps + (p.cupStats?.apps ?? 0));
      const starts = ranked.map((p) => p.stats.apps);
      return { zero: apps.filter((a) => a === 0).length, maxStarts: Math.max(...starts), apps };
    };
    const strong = Object.keys(w.clubs).sort((a, b) => w.clubs[b].reputation - w.clubs[a].reputation).slice(0, 4);
    for (const id of [LIV, ...strong.filter((x) => x !== LIV).slice(0, 2)]) {
      const r = report(id);
      const all = w.clubs[id].squad.map((x) => w.players[x]).filter((p) => p.pos !== 'GK').sort((a, b) => overall(b) - overall(a));
      console.log(id, '1군급 18명 출전(리그+컵)', r.apps.join(','), '· 0경기', r.zero, '명 · 최다 선발', r.maxStarts, '| 필드 전원 선발 수', all.map((p) => p.stats.apps + (p.cupStats?.apps ?? 0)).join(','), '| 승점', w.competitions.eng1.table[id].pts);
      expect(r.zero).toBeLessThanOrEqual(3);
    }
  }, 120_000);
});
