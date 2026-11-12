// 임대 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { aiLoanDay, buyFloor, endLoans, evaluateLoan, exerciseBuy, loanCandidates, loanMove, playerWillLoan } from './loan';
import { wageBillOf } from './finance';
import { evaluateBid, marketValue } from './transfer';
import { overall } from './ratings';
import { createRng } from './rng';
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
const fresh = () => { const w = createWorld(load('2025-26', ['eng1']), LIV, 21); w.date = '2025-08-10'; return w; };
const byRank = (w: ReturnType<typeof fresh>, club: string) => w.clubs[club].squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a));

describe('임대', () => {
  it('원소속 구단: 핵심 선수는 거절, 벤치 선수는 주급 절반 이상이면 수락 · 이적시장 밖은 불가', () => {
    const w = fresh();
    const big = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const ranked = byRank(w, big);
    expect(evaluateLoan(w, ranked[0], LIV, { share: 1, fee: 0 }).ok).toBe(false);
    const bench = ranked[ranked.length - 3];
    expect(evaluateLoan(w, bench, LIV, { share: 0.25, fee: 0 }).ok).toBe(false);
    expect(evaluateLoan(w, bench, LIV, { share: 0.5, fee: 0 }).ok).toBe(true);
    w.date = '2025-10-10';
    expect(evaluateLoan(w, bench, LIV, { share: 0.5, fee: 0 }).ok).toBe(false);
  });

  it('임대 이동: 주급은 분담 비율대로 · 임대 중에는 이적 불가 · 시즌 끝에 복귀', () => {
    const w = fresh();
    const p = byRank(w, LIV).at(-1)!;
    const to = loanCandidates(w, p)[0]?.club ?? Object.keys(w.clubs).find((c) => c !== LIV)!;
    const billFrom0 = wageBillOf(w, LIV), billTo0 = wageBillOf(w, to);
    loanMove(w, p, to, { share: 0.75, fee: 0 });
    expect(p.clubId).toBe(to);
    expect(w.clubs[LIV].squad).not.toContain(p.id);
    expect(wageBillOf(w, to) - billTo0).toBeCloseTo(p.wage * 0.75, -1);
    expect(billFrom0 - wageBillOf(w, LIV)).toBeCloseTo(p.wage * 0.75, -1);   // 원소속은 25% 만 계속 냄
    expect(evaluateBid(w, p, Object.keys(w.clubs).find((c) => c !== to && c !== LIV)!, 1e9).decision).toBe('reject');
    endLoans(w);
    expect(p.clubId).toBe(LIV);
    expect(p.loan).toBeUndefined();
    expect(w.clubs[LIV].squad).toContain(p.id);
    expect(w.clubs[to].squad).not.toContain(p.id);
  });

  it('완전 영입 옵션: 행사하면 빌린 구단 소속으로 정식 이적', () => {
    const w = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const p = byRank(w, other).at(-2)!;
    loanMove(w, p, LIV, { share: 1, fee: 0, buy: 5e6 });
    exerciseBuy(w, p);
    expect(p.clubId).toBe(LIV);
    expect(p.loan).toBeUndefined();
    expect(w.clubs[other].squad).not.toContain(p.id);
    expect(w.clubs[LIV].squad.filter((id) => id === p.id).length).toBe(1);
  });

  it('선수: 가서 뛸 수 없는 팀이면 거절', () => {
    const w = fresh();
    const weakest = Object.values(w.clubs).sort((a, b) => a.reputation - b.reputation)[0].id;
    const p = byRank(w, weakest).at(-1)!;   // 약팀의 가장 약한 선수 → 리버풀에서는 못 뛴다
    expect(playerWillLoan(w, p, LIV).ok).toBe(false);
  });

  it('AI 구단: 이적시장 동안 유망주를 하위 구단에 임대 보낸다', () => {
    const w = fresh();
    let n = 0;
    for (let d = 0; d < 20; d++) { w.date = `2025-08-${String(10 + d).padStart(2, '0')}`; n += aiLoanDay(w, createRng(d + 1)).length; }
    console.log('AI 임대 (20일)', n);
    expect(n).toBeGreaterThan(0);
    for (const p of Object.values(w.players)) if (p.loan) { expect(w.clubs[p.loan.from].loanedOut).toContain(p.id); expect(w.clubs[p.clubId!].squad).toContain(p.id); }
  });
});

describe('임대 이적 조건 (완전 영입 옵션 · 의무 이적)', () => {
  it('의무 이적은 시장 가치의 75%부터, 옵션은 90%부터 받아 준다', () => {
    const w = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const p = byRank(w, other).at(-3)!;
    const v = marketValue(w, p);
    const fee = Math.round(v * 0.8);
    expect(evaluateLoan(w, p, LIV, { share: 1, fee: 0, buy: fee }).ok).toBe(false);
    expect(evaluateLoan(w, p, LIV, { share: 1, fee: 0, buy: fee, must: true }).ok).toBe(true);
    expect(buyFloor(w, p, true)).toBeLessThan(buyFloor(w, p));
  });

  it('의무 이적: 시즌 끝에 정해 둔 이적료 · 주급으로 자동 이적 (3년 계약)', () => {
    const w = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const p = byRank(w, other).at(-3)!;
    const buy = buyFloor(w, p, true), buyWage = Math.round(p.wage * 1.2);
    loanMove(w, p, LIV, { share: 1, fee: 0, buy, buyWage, must: true });
    const ev = endLoans(w);
    expect(p.clubId).toBe(LIV);
    expect(p.loan).toBeUndefined();
    expect(p.wage).toBe(buyWage);
    expect(p.lastFee).toBe(buy);
    expect(p.contract).toBe('2029-06-30');
    expect(ev.some((e) => e.type === 'loan' && e.kind === 'bought' && e.must)).toBe(true);
  });

  it('옵션만 있으면 사용자는 행사하지 않으면 복귀 · 행사하면 영입 후 주급으로', () => {
    const w = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0].id;
    const [a, b] = byRank(w, other).slice(-4, -2);
    loanMove(w, a, LIV, { share: 1, fee: 0, buy: buyFloor(w, a), buyWage: a.wage + 1000 });
    loanMove(w, b, LIV, { share: 1, fee: 0, buy: buyFloor(w, b), buyWage: b.wage + 2000 });
    const want = b.wage + 2000;
    exerciseBuy(w, b);
    expect(b.clubId).toBe(LIV);
    expect(b.wage).toBe(want);
    endLoans(w);
    expect(a.clubId).toBe(other);   // 행사 안 한 옵션 → 복귀
  });

  it('보내기 후보: 이적 조건을 걸면 그 이적료를 감당할 수 있는 구단만', () => {
    const w = fresh();
    const p = byRank(w, LIV)[14];
    const plain = loanCandidates(w, p);
    const huge = loanCandidates(w, p, [], { buy: 5e9 });
    expect(huge.length).toBe(0);
    const ok = loanCandidates(w, p, [], { buy: buyFloor(w, p, true), must: true });
    expect(ok.length).toBeLessThanOrEqual(plain.length);
    for (const c of ok) expect(c.terms.must).toBe(true);
  });
});
