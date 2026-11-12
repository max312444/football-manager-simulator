// 데드라인 데이 · 보스만 룰 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { overall } from './ratings';
import { evaluateBid } from './transfer';
import { contractCheck, willStay } from './contract';
import { aiBosmanDay, bosmanEligible, deadlineCheck, signPrecontract, type DeadlineAlert } from './bosman';
import { createRng } from './rng';
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
const fresh = () => createWorld(load('2024-25', ['eng1', 'esp1']), LIV, 31);

describe('데드라인 데이', () => {
  it('여름 이적시장 마감 3일 전 · 당일에만 알림', () => {
    const w = fresh();
    const at = (d: string) => { w.date = d; w.deadlineAlert = undefined; deadlineCheck(w); return w.deadlineAlert as DeadlineAlert | undefined; };
    expect(at('2024-08-28')).toBeUndefined();
    expect(at('2024-08-29')?.left).toBe(3);
    expect(at('2024-08-30')).toBeUndefined();
    expect(at('2024-09-01')?.left).toBe(0);
    expect(at('2024-09-01')?.window).toBe('summer');
    expect(at('2025-01-28')?.window).toBe('winter');
    expect(at('2025-01-31')?.left).toBe(0);
    expect(at('2024-10-15')).toBeUndefined();
  });
});

describe('보스만', () => {
  it('계약 마지막 6개월 · 다른 나라 구단만 사전 계약 가능', () => {
    const w = fresh();
    const esp = Object.values(w.clubs).find((c) => c.league === 'esp1')!;
    const esp2 = Object.values(w.clubs).find((c) => c.league === 'esp1' && c.id !== esp.id)!;
    const p = w.players[esp.squad[0]];
    p.contract = '2025-06-30';
    w.date = '2024-12-20';
    expect(bosmanEligible(w, p, LIV)).toBe(false);    // 아직 6개월 전
    w.date = '2025-01-02';
    expect(bosmanEligible(w, p, LIV)).toBe(true);     // 잉글랜드 구단 → 가능
    expect(bosmanEligible(w, p, esp2.id)).toBe(false); // 같은 나라 → 불가
    p.contract = '2026-06-30';
    expect(bosmanEligible(w, p, LIV)).toBe(false);    // 계약이 더 남음
  });

  it('사전 계약하면 다른 구단은 이적료로 데려갈 수 없고, 시즌이 바뀌면 이적료 없이 합류', () => {
    const w = fresh();
    const esp = Object.values(w.clubs).filter((c) => c.league === 'esp1').sort((a, b) => b.reputation - a.reputation)[0];
    const p = esp.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[2];
    p.contract = '2025-06-30';
    w.date = '2025-02-01';
    signPrecontract(w, p, LIV, 200000, 4, { buyout: 0 });
    const other = Object.values(w.clubs).find((c) => c.league === 'eng1' && c.id !== LIV)!;
    expect(evaluateBid(w, p, other.id, 1e9).decision).toBe('reject');
    closeSeason(w);
    startNextSeason(w, load('2025-26', ['eng1', 'esp1']));
    expect(p.clubId).toBe(LIV);
    expect(p.wage).toBe(200000);
    expect(p.lastFee).toBe(0);
    expect(p.precontract).toBeUndefined();
    expect(w.clubs[esp.id].squad).not.toContain(p.id);
  });

  it('재계약하지 않은 내 선수에게 해외 구단이 사전 계약 → 자동 재계약 · 재계약 불가', () => {
    const w = fresh();
    const mine = w.clubs[LIV].squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a)).slice(3, 12);
    for (const p of mine) p.contract = '2025-06-30';
    w.date = '2025-01-03';
    const rng = createRng(5);
    let ev: ReturnType<typeof aiBosmanDay> = [];
    for (let d = 0; d < 400 && !ev.length; d++) ev = aiBosmanDay(w, rng);
    expect(ev.length).toBe(1);
    const p = w.players[(ev[0] as { player: string }).player];
    const to = w.clubs[p.precontract!.club];
    console.log('사전 계약:', p.id, '→', to.id, to.league);
    expect(to.league.startsWith('eng')).toBe(false);
    expect(willStay(w, p).ok).toBe(false);
    w.date = '2025-04-01';
    contractCheck(w);
    expect(p.contract).toBe('2025-06-30');   // 자동 재계약되지 않음
    expect(w.inbox.some((e) => e.type === 'bosman' && e.player === p.id)).toBe(true);
  });
});
