// 유럽 대회 테스트: 5개 리그 1부로 한 시즌 진행 → 출전권 · 조 추첨 · 녹아웃 · 일정 충돌 · 다음 시즌 출전권
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, allFixtures, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { sortTable } from './standings';
import { nationOf } from './pyramid';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const meta = (season: string, league: string): LeagueSeasonFile => JSON.parse(fs.readFileSync(path.join(DATA, 'seasons', season, league, '_league.json'), 'utf8'));
function clubsOf(season: string, league: string): ClubSeasonFile[] {
  const dir = path.join(DATA, 'seasons', season, league);
  return meta(season, league).clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile);
}
const LEAGUES = ['eng1', 'esp1', 'ita1', 'ger1', 'fra1'];
const input = (s: string, prev?: string): SeasonInput => ({
  season: s, leagues: LEAGUES.map((id) => ({ id, clubs: clubsOf(s, id) })),
  prevStandings: prev ? Object.fromEntries(LEAGUES.flatMap((id) => { const st = meta(prev, id).standings; return st ? [[id, st]] : []; })) : undefined,
});
const run = (w: ReturnType<typeof createWorld>) => { let n = 0; while (!seasonOver(w) && n++ < 420) advanceDay(w); return n; };
const LIV = 'c83d96l';

describe('유럽 대회', () => {
  it('출전권 · 조 추첨 · 한 시즌 진행 · 다음 시즌 출전권', () => {
    const w = createWorld(input('2024-25', '2023-24'), LIV, 11);
    const ucl = w.europe!.ucl, uel = w.europe!.uel;
    expect(ucl.entrants).toHaveLength(16);
    expect(uel.entrants).toHaveLength(16);
    expect(ucl.entrants.filter((c) => uel.entrants.includes(c))).toEqual([]);
    // 나라별 자리: 챔스 ENG 4 · ESP 4 · ITA 3 · GER 3 · FRA 2
    const count = (xs: string[], n: string) => xs.filter((c) => nationOf(w.clubs[c].league) === n).length;
    expect(['ENG', 'ESP', 'ITA', 'GER', 'FRA'].map((n) => count(ucl.entrants, n))).toEqual([4, 4, 3, 3, 2]);
    // 잉글랜드는 실제 2023-24 순위 상위 4팀
    const real = meta('2023-24', 'eng1').standings!.filter((c) => w.clubs[c]?.league === 'eng1').slice(0, 4);
    expect(ucl.entrants.filter((c) => w.clubs[c].league === 'eng1')).toEqual(real);
    // 같은 나라는 같은 조에 없음
    for (const g of [...ucl.groups, ...uel.groups]) expect(new Set(g.teams.map((c) => nationOf(w.clubs[c].league))).size).toBe(4);
    // 날짜: 챔스 화요일 · 유로파 목요일, 결승은 리그가 끝난 뒤
    for (const d of ucl.dates.group) expect(new Date(d).getUTCDay()).toBe(2);
    for (const d of uel.dates.group) expect(new Date(d).getUTCDay()).toBe(4);
    const lastLeague = Object.values(w.competitions).flatMap((c) => c.fixtures.map((f) => f.date)).sort().at(-1)!;
    expect(ucl.dates.final > lastLeague).toBe(true);

    run(w);
    expect(seasonOver(w)).toBe(true);
    for (const c of [ucl, uel]) {
      expect(c.winner).toBeTruthy();
      expect(c.knockout.map((r) => r.name)).toEqual(['8강', '준결승', '결승']);
      expect(c.fixtures).toHaveLength(48 + 8 + 4 + 1);
      // 8강은 조 1위 vs 다른 조 2위
      for (const t of c.knockout[0].ties) {
        const ga = c.groups.find((g) => g.teams.includes(t.a))!, gb = c.groups.find((g) => g.teams.includes(t.b))!;
        expect(ga).not.toBe(gb);
        expect(sortTable(ga.table)[0].club).toBe(t.a);
        expect(sortTable(gb.table)[1].club).toBe(t.b);
      }
      // 합산 동점이면 승부차기 승자
      for (const r of c.knockout) for (const t of r.ties) if (t.agg && t.agg[0] === t.agg[1]) expect(t.pens).toBe(true);
      for (const g of c.groups) expect(Object.values(g.table).every((r) => r.p === 6)).toBe(true);
    }
    // 한 구단이 같은 날 두 경기를 하지 않고, 경기 사이 최소 하루
    const days = new Map<string, string[]>();
    for (const f of allFixtures(w)) for (const c of [f.home, f.away]) days.set(c, [...(days.get(c) ?? []), f.date]);
    for (const [, ds] of days) { ds.sort(); for (let i = 1; i < ds.length; i++) expect(Date.parse(ds[i]) - Date.parse(ds[i - 1])).toBeGreaterThanOrEqual(2 * 86400000); }
    // 리그 순위표는 리그 경기만
    expect(Object.values(w.competitions.eng1.table).every((r) => r.p === 38)).toBe(true);
    console.log('챔스 우승', ucl.winner, '· 유로파 우승', uel.winner, '· 챔스 일정', ucl.dates.group.join(' '), '|', ucl.dates.qf.join(' '), '|', ucl.dates.sf.join(' '), '|', ucl.dates.final);

    // 다음 시즌: 게임 순위 상위 4팀이 챔스
    const engTop = sortTable(w.competitions.eng1.table).map((r) => r.club);
    closeSeason(w);
    startNextSeason(w, input('2025-26'));
    const next = w.europe!.ucl;
    expect(next.season).toBe('2025-26');
    expect(next.entrants.filter((c) => w.clubs[c].league === 'eng1')).toEqual(engTop.filter((c) => w.clubs[c].league === 'eng1').slice(0, 4));
    // 국내 컵 우승팀은 유럽 대회 출전
    const cupWin = w.cupHistory!.find((h) => h.season === '2024-25' && h.cup === 'eng-cup')!.winner;
    if (w.clubs[cupWin].league === 'eng1') expect([...next.entrants, ...w.europe!.uel.entrants]).toContain(cupWin);
  }, 120000);
});
