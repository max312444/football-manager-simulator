// 리그 우승 확정: 남은 경기를 다 이겨도 못 따라오면 확정 (한 번만), 아니면 아직
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, type SeasonInput } from './world';
import { clinchCheck } from './clinch';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('리그 우승 확정', () => {
  it('승점 차가 남은 경기 × 3 보다 크면 확정, 같으면 아직 · 한 번만', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 71);
    const comp = w.competitions.eng1;
    // 34경기 치른 것으로: 남은 리그 경기 4개씩
    const league = comp.fixtures.filter((f) => !f.stage);
    const byClub: Record<string, number> = {};
    for (const f of league) {
      const n = Math.max(byClub[f.home] ?? 0, byClub[f.away] ?? 0);
      if (n < 34) { f.result = { homeGoals: 0, awayGoals: 0 } as never; byClub[f.home] = (byClub[f.home] ?? 0) + 1; byClub[f.away] = (byClub[f.away] ?? 0) + 1; }
    }
    const left = (id: string) => league.filter((f) => !f.result && (f.home === id || f.away === id)).length;
    const second = Object.keys(comp.table).find((id) => id !== LIV)!;
    for (const row of Object.values(comp.table)) { row.p = 34; row.pts = 50; }
    comp.table[LIV].pts = 50 + 3 * left(second);   // 2위가 다 이기면 같은 승점 → 아직
    for (const id of Object.keys(comp.table)) if (id !== LIV && id !== second) comp.table[id].pts = 40;
    expect(clinchCheck(w)).toBeNull();
    comp.table[LIV].pts += 1;                     // 1점 더 → 확정
    const ev = clinchCheck(w);
    expect(ev).toMatchObject({ type: 'clinch', league: 'eng1', club: LIV, left: left(LIV) });
    expect(clinchCheck(w)).toBeNull();            // 다시는 안 나옴
  });

  it('실제로 한 시즌을 돌리면 우승한 시즌엔 확정 소식이 한 번 (못 하면 없음)', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 72);
    let n = 0;
    while (w.date < '2026-05-31') {
      n += advanceDay(w).filter((e) => e.type === 'clinch').length;
      w.sagaPrompt = undefined; w.scandalPrompt = undefined; if (w.manager) { w.manager.press = undefined; w.manager.boardEvent = undefined; }
    }
    const rows = Object.values(w.competitions.eng1.table).sort((a, b) => b.pts - a.pts);
    console.log('리버풀 순위', rows.findIndex((r) => r.club === LIV) + 1, '확정 소식', n);
    expect(n).toBeLessThanOrEqual(1);
    if (rows[0].club !== LIV) expect(n).toBe(0);
  }, 120_000);
});
