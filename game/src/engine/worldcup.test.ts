// 월드컵 · A매치 차출 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, allFixtures, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { createWorldCup, isNT, worldCupYear, type WorldCupMeta } from './worldcup';
import { confedOf, intlBreaks } from './national';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const META: Record<string, WorldCupMeta> = JSON.parse(fs.readFileSync(path.join(DATA, 'meta', 'worldcups.json'), 'utf8'));
const LEAGUES = ['eng1', 'esp1', 'ita1', 'ger1', 'ger2', 'fra1'];
const load = (season: string, withWc = true): SeasonInput => ({
  season, worldCups: withWc ? META : undefined,
  leagues: LEAGUES.filter((id) => fs.existsSync(path.join(DATA, 'seasons', season, id))).map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});
const LIV = 'c83d96l';

describe('월드컵', () => {
  it('2026: 실제 참가국 48팀 · 12개 조 → 32강 … 결승, 끝나면 대표팀 구단 · 가상 선수 정리', () => {
    expect(worldCupYear('2025-26')).toBe(2026);
    expect(worldCupYear('2024-25')).toBeNull();
    const w = createWorld(load('2025-26'), LIV, 3);
    const wc = w.worldCup!;
    expect(wc.size).toBe(48);
    expect(wc.real).toBe(true);
    expect(wc.groups).toHaveLength(12);
    expect(wc.groups[0].teams).toEqual(['nt-CZE', 'nt-MEX', 'nt-RSA', 'nt-KOR']);
    expect(wc.fixtures).toHaveLength(72);
    // 리그 · 컵 · 유럽 대회와 날짜가 겹치는 구단이 없어야 한다 (월드컵은 시즌이 끝난 뒤)
    const lastClubGame = allFixtures(w).filter((f) => f.stage !== 'intl').map((f) => f.date).sort().at(-1)!;
    expect(wc.dates.group[0] > lastClubGame).toBe(true);

    let callups = 0;
    while (!seasonOver(w)) for (const e of advanceDay(w)) if (e.type === 'callup') callups++;
    expect(callups).toBeGreaterThan(0);                       // A매치 기간 리버풀 선수 차출 소식
    expect(wc.winner).toBeTruthy();
    expect(wc.knockout.map((r) => r.name)).toEqual(['32강', '16강', '8강', '준결승', '3·4위전', '결승']);
    expect(wc.fixtures).toHaveLength(72 + 16 + 8 + 4 + 2 + 1 + 1);
    for (const f of wc.fixtures) if (f.result!.homeGoals === f.result!.awayGoals && !f.group) expect(f.result!.pens).toBeTruthy();
    const korea = w.clubs['nt-KOR'];
    expect(korea.squad).toHaveLength(26);                    // 유럽 리그 선수가 적어 '국내파'로 채움
    expect(korea.squad.some((id) => w.players[id].retired && w.players[id].generated)).toBe(true);
    expect(Object.values(w.players).some((p) => p.honours?.some((h) => h.kind === 'wc'))).toBe(true);
    const h = w.worldCupHistory!.at(-1)!;
    console.log('2026 우승', h.winner, '· 준우승', h.runnerUp, '· 3위', h.third, '· 득점왕', h.topScorer?.name, h.topScorer?.goals, '골');
    expect(h.year).toBe(2026);
    // 리그 순위표에는 대표팀 경기가 안 들어간다
    expect(Object.values(w.competitions.eng1.table).every((r) => r.p === 38)).toBe(true);

    const fillers = wc.fillers!;
    const endDate = w.date;
    closeSeason(w);
    startNextSeason(w, load('2026-27'));
    expect(Object.keys(w.clubs).some(isNT)).toBe(false);
    expect(fillers.every((id) => !w.players[id])).toBe(true);
    expect(w.worldCup).toBeUndefined();                       // 2027년에는 월드컵 없음
    expect(w.date >= '2026-07-01' && w.date >= endDate).toBe(true);   // 날짜가 거꾸로 가지 않음
  }, 180000);

  it('2030 (자료 없음): 대표팀 전력 + 대륙 쿼터로 48팀, 개최국 포함, 같은 조에 같은 연맹은 UEFA 2팀까지', () => {
    const w = createWorld(load('2025-26', false), LIV, 9);
    const wc = createWorldCup(w, '2029-30')!;
    const nations = wc.groups.flatMap((g) => g.teams.map((t) => t.slice(3)));
    expect(nations).toHaveLength(48);
    expect(new Set(nations).size).toBe(48);
    for (const h of ['ESP', 'POR', 'MAR']) expect(nations).toContain(h);
    const by = (c: string) => nations.filter((n) => confedOf(n) === c).length;
    console.log('2030 연맹별', ['UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF', 'OFC'].map((c) => `${c} ${by(c)}`).join(' · '));
    expect(by('UEFA')).toBeGreaterThanOrEqual(16);
    expect(by('CAF')).toBeGreaterThanOrEqual(9);
    for (const g of wc.groups) {
      const cs = g.teams.map((t) => confedOf(t.slice(3)));
      for (const c of new Set(cs)) expect(cs.filter((x) => x === c).length).toBeLessThanOrEqual(c === 'UEFA' ? 2 : 1);
    }
  });

  it('A매치 기간은 리그 휴식 주말 4번', () => {
    expect(intlBreaks('2025-26')).toEqual(['2025-09-13', '2025-10-11', '2025-11-15', '2026-03-28']);
  });
});
