// 관심 선수 알림 · 구단 단위 스카우트 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { shortlistDay } from './shortlist';
import { clubScoutTargets, knowledge, REPORT_K, scoutCost, scoutDay, startScout } from './scout';
import { releasePlayer } from './transfer';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIV = 'c83d96l';
const load = (season: string, ids: string[]): SeasonInput => ({
  season, leagues: ids.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});

describe('관심 선수 알림', () => {
  it('보스만 가능 · 계약 만료 임박 · 자유계약 · 급매물은 한 번씩만 알린다', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 81);
    const esp = Object.values(w.clubs).find((c) => c.league === 'esp1')!;
    const eng = Object.values(w.clubs).find((c) => c.league === 'eng1' && c.id !== LIV)!;
    const a = w.players[esp.squad[0]], b = w.players[eng.squad[0]], c = w.players[eng.squad[1]], d = w.players[esp.squad[1]];
    a.contract = '2026-06-30'; b.contract = '2026-06-30';
    w.shortlist = [a.id, b.id, c.id, d.id];
    w.date = '2025-12-20';
    expect(shortlistDay(w)).toEqual([]);   // 아직 6개월 전
    w.date = '2026-01-02';
    const ev = shortlistDay(w) as { type: string; player: string; kind: string }[];
    expect(ev.find((e) => e.player === a.id)?.kind).toBe('bosman');     // 다른 나라 → 보스만
    expect(ev.find((e) => e.player === b.id)?.kind).toBe('expiring');   // 같은 나라 → 만료 임박
    releasePlayer(w, c);
    (w.bargains ??= []).push({ player: d.id, club: esp.id, price: 1e6, until: '2026-01-31', kind: 'fire', cut: 0.25 });
    const ev2 = shortlistDay(w) as { player: string; kind: string }[];
    expect(ev2.map((e) => `${e.player}:${e.kind}`).sort()).toEqual([`${c.id}:free`, `${d.id}:bargain`].sort());
    expect(shortlistDay(w)).toEqual([]);   // 같은 일은 다시 알리지 않음
  });
});

describe('구단 단위 스카우트', () => {
  it('구단 전체를 보내면 그 구단 선수 모두 정확히 · 비용은 아직 모르는 선수 비용의 합', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 82);
    w.clubs[LIV].finance.balance = 1e9;
    const esp = Object.values(w.clubs).find((c) => c.league === 'esp1')!;
    const n = clubScoutTargets(w, esp.id).length;
    const one = scoutCost(w, 'player', esp.squad[0]);
    expect(n).toBeGreaterThan(15);
    expect(scoutCost(w, 'club', esp.id)).toBe(one * n);
    const bal = w.clubs[LIV].finance.balance;
    expect(startScout(w, 'club', esp.id).ok).toBe(true);
    expect(bal - w.clubs[LIV].finance.balance).toBe(one * n);
    expect(startScout(w, 'club', esp.id).ok).toBe(false);   // 이미 보냄
    w.date = '2025-07-20';
    const ev = scoutDay(w) as { club?: string; count?: number }[];
    expect(ev[0].club).toBe(esp.id);
    expect(esp.squad.every((id) => knowledge(w, w.players[id]) >= REPORT_K)).toBe(true);
    expect(clubScoutTargets(w, esp.id).length).toBe(0);
    expect(startScout(w, 'club', esp.id).ok).toBe(false);   // 다 아는 구단
  });
});
