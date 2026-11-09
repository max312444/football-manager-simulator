import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason } from './season';
import { AWARD_KO, baseFans, fansOf } from './awards';
import { overall } from './ratings';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIVERPOOL = 'c83d96l';
function loadSeason(season: string, league: string): SeasonInput {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return { season, leagues: [{ id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }] };
}

describe('POM · 팬 · 시즌 수상 (리버풀 2025/26)', () => {
  it('경기마다 POM · 워스트, 시즌 말 수상과 보상', () => {
    const w = createWorld(loadSeason('2025-26', 'eng1'), LIVERPOOL, 31);
    const fans0 = fansOf(w, LIVERPOOL);
    expect(fans0).toBe(baseFans(w.clubs[LIVERPOOL].reputation));
    while (!seasonOver(w)) advanceDay(w);

    const fx = w.competitions.eng1.fixtures;
    expect(fx.every((f) => f.result?.pom && f.result?.worst)).toBe(true);
    const pomTotal = Object.values(w.players).reduce((s, p) => s + (p.stats.pom ?? 0), 0);
    expect(pomTotal).toBe(fx.length);
    const lfc = w.clubs[LIVERPOOL].squad.map((id) => w.players[id]).sort((a, b) => (b.stats.pom ?? 0) - (a.stats.pom ?? 0));
    console.log('리버풀 POM 상위', lfc.slice(0, 3).map((p) => `${p.name} ${p.stats.pom}회`), '· 팬', fans0, '→', fansOf(w, LIVERPOOL));

    const recs = closeSeason(w);
    const awards = recs[0].awards!;
    console.log(awards.map((a) => `${AWARD_KO[a.kind]}: ${a.player ? w.players[a.player].name : a.club} (${a.value}) ${a.club === LIVERPOOL ? '← 리버풀' : ''}`));
    console.log('리버풀 연출 대기', (w.pendingAwards ?? []).map((a) => AWARD_KO[a.kind]));
    expect(awards.map((a) => a.kind)).toEqual(expect.arrayContaining(['champion', 'boot', 'mvp', 'glove']));
    expect(w.pendingAwards!.every((a) => a.club === LIVERPOOL)).toBe(true);

    // 개인 수상자: 능력치 일시 상승 · 수상 경력
    const mvp = w.players[awards.find((a) => a.kind === 'mvp')!.player!];
    expect(mvp.boost?.amount).toBe(2);
    expect(mvp.honours?.some((h) => h.kind === 'mvp')).toBe(true);
    const before = overall(mvp);
    mvp.boost = undefined;
    expect(overall(mvp)).toBeLessThan(before);
    // 우승 구단 팬 증가
    const champ = awards.find((a) => a.kind === 'champion')!;
    expect(fansOf(w, champ.club)).toBeGreaterThan(baseFans(w.clubs[champ.club].reputation));
  });
});
