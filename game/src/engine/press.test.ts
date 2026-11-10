// 기자회견 (언론 플레이) 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { answerPress, pressDay } from './press';
import { ensureManager } from './manager';
import { fanMoodOf } from './boardEvents';
import { createRng } from './rng';
import type { Fixture, GameEvent } from './types';
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
const fresh = () => { const w = createWorld(load('2025-26', ['eng1']), LIV, 17); ensureManager(w); w.date = '2025-09-20'; return w; };
const strongest = (w: ReturnType<typeof fresh>) => Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
const match = (w: ReturnType<typeof fresh>, opp: string, g: number, o: number, id = 'fx1'): GameEvent => ({ type: 'match', date: w.date, fixtureId: id, league: 'eng1', home: LIV, away: opp, score: [g, o], user: true });
/** 기자회견이 열릴 때까지 시드를 바꿔 본다 */
function open(w: ReturnType<typeof fresh>, run: (rng: ReturnType<typeof createRng>) => void) {
  const m = ensureManager(w);
  for (let s = 1; s < 60 && !m.press; s++) { m.lastPress = undefined; run(createRng(s)); }
  return m.press;
}

describe('기자회견', () => {
  it('대승 뒤 기자회견: "선수들이 다 했다" → 선수단 사기 +, 질문을 다 답하면 끝', () => {
    const w = fresh();
    const conf = open(w, (rng) => pressDay(w, [match(w, 'zzz', 4, 0)], rng, null));
    expect(conf?.kind).toBe('post');
    expect(conf!.questions[0].topic).toBe('big');
    const p = w.players[w.clubs[LIV].squad[0]];
    const m0 = p.morale;
    answerPress(w, 'players');
    expect(p.morale).toBe(Math.min(100, m0 + 4));
    while (w.manager!.press) answerPress(w, 'nocomment');
    expect(w.manager!.press).toBeUndefined();
  });

  it('경기 전 도발: 그 경기를 지면 팬 여론이 크게 깎인다', () => {
    const w = fresh();
    const opp = strongest(w);
    const next: Fixture = { id: 'fx9', league: 'eng1', round: 5, date: '2025-09-22', home: LIV, away: opp } as Fixture;
    const conf = open(w, (rng) => pressDay(w, [], rng, next));
    expect(conf?.kind).toBe('pre');
    answerPress(w, 'boast');
    while (w.manager!.press) answerPress(w, 'nocomment');
    expect(w.manager!.boast).toBe('fx9');
    const f0 = fanMoodOf(w);
    pressDay(w, [match(w, opp, 0, 2, 'fx9')], createRng(1), null);
    expect(fanMoodOf(w)).toBe(f0 - 6);
    expect(w.manager!.boast).toBeUndefined();
  });

  it('10일에 한 번까지 · 불참하면 여론 · 관계 조금 −', () => {
    const w = fresh();
    const m = ensureManager(w);
    open(w, (rng) => pressDay(w, [match(w, 'zzz', 5, 0)], rng, null));
    expect(m.press).toBeTruthy();
    const f0 = fanMoodOf(w), r0 = m.relation ?? 55;
    answerPress(w, 'skip');
    expect(m.press).toBeUndefined();
    expect(fanMoodOf(w)).toBe(f0 - 1);
    expect(m.relation).toBe(r0 - 1);
    // 바로 다음 날 또 대승해도 10일이 안 지나면 열리지 않음
    w.date = '2025-09-21';
    for (let s = 1; s < 20; s++) pressDay(w, [match(w, 'zzz', 5, 0)], createRng(s), null);
    expect(m.press).toBeUndefined();
  });
});
