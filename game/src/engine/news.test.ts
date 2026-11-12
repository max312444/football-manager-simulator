// 뉴스 · 이적 소문 테스트: 여름 이적시장 한 번을 실제로 진행
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, type SeasonInput } from './world';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIV = 'c83d96l';
const load = (season: string): SeasonInput => ({
  season, leagues: fs.readdirSync(path.join(DATA, 'seasons', season)).map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});

describe('뉴스 · 이적 소문', () => {
  it('여름 이적시장 동안 소문이 돌고, 신뢰도가 높을수록 사실이 되며, 마감 뒤에는 모두 결론이 난다', () => {
    const w = createWorld(load('2025-26'), LIV, 51);
    const t0 = Date.now();
    let days = 0;
    while (w.date <= '2025-09-03') { advanceDay(w); days++; }
    const ms = (Date.now() - t0) / days;
    const news = w.news ?? [];
    const rumours = news.filter((n) => n.kind === 'rumour');
    const by = (s: number[]) => { const xs = rumours.filter((n) => s.includes(n.stars!)); return { n: xs.length, sure: xs.length ? xs.filter((n) => n.status === 'true').length / xs.length : 0 }; };
    const low = by([1, 2]), high = by([4, 5]);
    const kinds = news.reduce<Record<string, number>>((a, n) => ({ ...a, [n.kind]: (a[n.kind] ?? 0) + 1 }), {});
    console.log('하루', Math.round(ms), 'ms · 소문', rumours.length, '· ★1~2 사실', (low.sure * 100).toFixed(0) + '%', `(${low.n})`, '· ★4~5 사실', (high.sure * 100).toFixed(0) + '%', `(${high.n})`, '· 내 선수 소문', rumours.filter((n) => n.from === LIV).length, '· 종류', kinds);
    expect(rumours.length).toBeGreaterThan(20);   // 실력 분포에 따라 달라짐 (2026-11-12 재구성 뒤 27개)
    expect(high.sure).toBeGreaterThan(low.sure);
    expect(rumours.filter((n) => n.status === 'open').length).toBe(0);   // 마감 뒤 모두 결론
    expect(kinds.transfer ?? 0).toBeGreaterThan(5);
    expect(kinds.deadline ?? 0).toBe(1);
  }, 300000);
});
