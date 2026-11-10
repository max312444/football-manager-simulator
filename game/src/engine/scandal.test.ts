// 선수 논란 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { scandalDay, scandalRespond } from './scandal';
import { pressDay } from './press';
import { ensureManager } from './manager';
import { fanMoodOf } from './boardEvents';
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
const fresh = () => { const w = createWorld(load('2025-26', ['eng1']), LIV, 7); ensureManager(w); return w; };
/** 논란이 날 때까지 */
function until(w: ReturnType<typeof fresh>) {
  for (let s = 1; s < 500 && !w.scandalPrompt; s++) { w.lastScandal = undefined; w.date = '2025-10-08'; scandalDay(w, createRng(s)); }
  return w.scandalPrompt;
}

describe('선수 논란', () => {
  it('기질 · 프로의식이 낮은 선수에게서 잘 터진다', () => {
    const count = (temp: number, pro: number) => {
      const w = fresh();
      for (const id of w.clubs[LIV].squad) w.players[id].hidden = { ...w.players[id].hidden, temperament: temp, professionalism: pro };
      let n = 0;
      for (let s = 1; s <= 300; s++) { w.scandalPrompt = undefined; w.lastScandal = undefined; w.date = '2025-10-08'; n += scandalDay(w, createRng(s)).length; }
      return n;
    };
    const calm = count(18, 18), wild = count(3, 3);
    console.log('침착 · 성실한 팀', calm, '· 거친 팀', wild, '(300번 중)');
    expect(wild).toBeGreaterThan(calm * 3);
  });

  it('20일에 한 번까지 · 대응하면 창이 닫힌다 · 공개 비판하면 팬 여론 +', () => {
    const w = fresh();
    const s = until(w);
    expect(s).toBeTruthy();
    w.date = '2025-10-23';
    expect(scandalDay(w, createRng(99)).length).toBe(0);   // 아직 답 안 함 + 20일 안 지남
    const f0 = fanMoodOf(w);
    scandalRespond(w, 'criticize', createRng(1));
    expect(w.scandalPrompt).toBeUndefined();
    expect(fanMoodOf(w)).toBe(f0 + 3);
    expect(w.players[s!.player].scandals).toBeGreaterThan(0);
  });

  it('논란 직후 기자회견에서 그 일을 묻는다', () => {
    const w = fresh();
    const s = until(w)!;
    scandalRespond(w, 'ignore', createRng(1));
    const m = ensureManager(w);
    for (let k = 1; k < 60 && !m.press; k++) { m.lastPress = undefined; pressDay(w, [{ type: 'match', date: w.date, fixtureId: 'x', league: 'eng1', home: LIV, away: 'zz', score: [5, 0], user: true }], createRng(k), null); }
    expect(m.press?.questions.some((q) => q.player === s.player && q.text.includes('논란'))).toBe(true);
  });
});
