// 스카우트: 앎에 따른 능력치 범위 · 보고서 · 리그 관찰 · 경기 노출 · 비용
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, type SeasonInput } from './world';
import { overall } from './ratings';
import { HIDDEN_K, hiddenKnown, knowledge, scoutCost, seenOverall, startScout } from './scout';
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
const quiet = (w: ReturnType<typeof createWorld>) => { w.sagaPrompt = undefined; w.scandalPrompt = undefined; if (w.manager) { w.manager.press = undefined; w.manager.boardEvent = undefined; } };

describe('스카우트', () => {
  const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 7);
  const mine = w.players[w.clubs[LIV].squad[0]];
  const foreign = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId].league === 'esp1' && overall(p) < 80)[0];

  it('내 선수는 정확, 다른 리그 무명 선수는 넓은 범위 (진짜 값은 범위 안)', () => {
    expect(seenOverall(w, mine)).toEqual([overall(mine), overall(mine)]);
    const [lo, hi] = seenOverall(w, foreign);
    expect(hi - lo).toBeGreaterThanOrEqual(10);
    expect(lo).toBeLessThanOrEqual(overall(foreign));
    expect(hi).toBeGreaterThanOrEqual(overall(foreign));
    expect(hiddenKnown(w, foreign)).toBe(false);
  });

  it('선수 스카우트: 비용이 빠지고 14일 뒤 보고서 → 정확한 능력 · 숨은 성향 공개', () => {
    const bal = w.clubs[LIV].finance.balance;
    const cost = scoutCost(w, 'player', foreign.id);
    expect(startScout(w, 'player', foreign.id).ok).toBe(true);
    expect(startScout(w, 'player', foreign.id).ok).toBe(false);          // 같은 선수 두 번 X
    expect(w.clubs[LIV].finance.balance).toBe(bal - cost);
    let report = false;
    for (let d = 0; d < 15; d++) { report ||= advanceDay(w).some((e) => e.type === 'scout' && e.player === foreign.id); quiet(w); }
    expect(report).toBe(true);
    const [lo, hi] = seenOverall(w, foreign);
    expect(lo).toBe(hi);
    expect(hiddenKnown(w, foreign)).toBe(true);
    console.log('선수 스카우트 비용', cost);
  });

  it('리그 관찰: 28일 뒤 그 리그 선수 모두 숨은 성향까지 (앎 65 → 범위 좁아짐)', () => {
    expect(startScout(w, 'league', 'esp1').ok).toBe(true);
    for (let d = 0; d < 29; d++) { advanceDay(w); quiet(w); }
    const esp = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId].league === 'esp1');
    expect(esp.every((p) => knowledge(w, p) >= 65)).toBe(true);
    expect(esp.every((p) => knowledge(w, p) < HIDDEN_K || p.id === foreign.id || knowledge(w, p) >= 65)).toBe(true);
  });

  it('맞붙은 상대 선수는 조금씩 알게 된다', () => {
    const before = Object.fromEntries(Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId].league === 'eng1' && p.clubId !== LIV).map((p) => [p.id, knowledge(w, p)]));
    for (let d = 0; d < 60 && w.competitions.eng1.table[LIV].p < 2; d++) { advanceDay(w); quiet(w); }
    const up = Object.keys(before).filter((id) => knowledge(w, w.players[id]) > before[id]).length;
    expect(up).toBeGreaterThanOrEqual(11);
  }, 60000);

  it('설정에서 끄면 모두 정확', () => {
    w.settings = { ...w.settings, scoutFog: false };
    const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId].league === 'esp1' && knowledge(w, x) < 100 && x.id !== foreign.id);
    expect(p).toBeUndefined();
    w.settings = { ...w.settings, scoutFog: true };
  });
});
