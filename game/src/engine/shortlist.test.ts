// 관심 선수 알림 · 구단 단위 스카우트 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { shortlistDay } from './shortlist';
import { clubScoutTargets, knowledge, REPORT_K, scoutCost, scoutDay, scoutNewSeason, scoutProgress, startScout } from './scout';
import { appealDay } from './appeal';
import { createRng } from './rng';
import { askingPrice, completeTransfer, wageDemand } from './transfer';
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
    const job = w.scout!.jobs.find((j) => j.kind === 'club')!;
    expect(scoutProgress(w, job).pct).toBe(0);
    w.date = new Date(Date.parse(job.start) + (Date.parse(job.done) - Date.parse(job.start)) / 2).toISOString().slice(0, 10);
    expect(scoutProgress(w, job).pct).toBeGreaterThanOrEqual(40);
    expect(scoutProgress(w, job).pct).toBeLessThanOrEqual(60);
    w.date = '2025-07-20';
    const ev = scoutDay(w) as { club?: string; count?: number }[];
    expect(ev[0].club).toBe(esp.id);
    expect(esp.squad.every((id) => knowledge(w, w.players[id]) >= REPORT_K)).toBe(true);
    expect(clubScoutTargets(w, esp.id).length).toBe(0);
    expect(startScout(w, 'club', esp.id).ok).toBe(false);   // 다 아는 구단
    const fa = w.players[w.clubs[esp.id === LIV ? LIV : Object.values(w.clubs).find((c) => c.league === 'eng1' && c.id !== LIV)!.id].squad[0]];
    expect(knowledge(w, fa)).toBeLessThan(REPORT_K);
    releasePlayer(w, fa);
    expect(knowledge(w, fa)).toBe(100);   // 자유계약 선수는 공개
  });
});

describe('관심 해제 · 이적 어필 · 스카우트 기억', () => {
  it('영입하면 관심 목록에서 자동으로 빠진다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 91);
    const other = Object.values(w.clubs).find((c) => c.id !== LIV)!;
    const p = w.players[other.squad[0]];
    w.shortlist = [p.id];
    completeTransfer(w, p, LIV, 1e6, p.wage, 3);
    expect(w.shortlist).toEqual([]);
  });

  it('어필: 이적시장에 우리 구단에 오고 싶은 선수가 연락 · 우리 구단엔 주급 15% 덜, 이적료는 그대로', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 92);
    const evs: { type: string; player?: string }[] = [];
    for (let i = 0; i < 40 && !evs.length; i++) evs.push(...(appealDay(w, createRng(i)) as { type: string; player?: string }[]));
    expect(evs.length).toBe(1);
    const p = w.players[evs[0].player!];
    expect(w.shortlist).toContain(p.id);
    const full = wageDemand(w, p), mine = wageDemand(w, p, LIV);
    console.log('어필 선수', p.name, w.clubs[p.clubId!].reputation, '→ 우리', w.clubs[LIV].reputation, '주급', full, '→', mine);
    expect(mine).toBeLessThan(full * 0.9);
    expect(wageDemand(w, p, Object.keys(w.clubs).find((id) => id !== LIV && id !== p.clubId))).toBe(full);   // 다른 구단엔 그대로
    expect(askingPrice(w, p)).toBeGreaterThan(0);   // 이적료는 파는 구단 기준 그대로
    // 우리 구단으로 오면 어필 · 관심 정리
    completeTransfer(w, p, LIV, askingPrice(w, p), mine, 3);
    expect(w.appeals?.some((a) => a.player === p.id)).toBe(false);
  });

  it('스카우트: 우리 구단 출신 · 임대 보낸 선수는 계속 공개, 스카우트 보고서는 그 시즌만', () => {
    const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 93);
    const mine = w.players[w.clubs[LIV].squad[5]];
    const other = Object.values(w.clubs).find((c) => c.league === 'esp1')!;
    completeTransfer(w, mine, other.id, 1e6, mine.wage, 3);   // 우리 선수를 팔아도
    expect(knowledge(w, mine)).toBe(100);
    const stranger = w.players[other.squad[0]];
    w.scout!.k[stranger.id] = REPORT_K;
    expect(knowledge(w, stranger)).toBeGreaterThanOrEqual(REPORT_K);
    scoutNewSeason(w);
    expect(knowledge(w, stranger)).toBeLessThan(REPORT_K);   // 새 시즌엔 다시 확인
    expect(knowledge(w, mine)).toBe(100);
  });
});
