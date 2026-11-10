// 감독 계약 · 신뢰도 · 제안 · 경질 · 이동 · 따라오는 선수 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { acceptOffer, boardTarget, chooseJob, declineOffer, ensureManager, managerDay, managerNewSeason, moveTo } from './manager';
import { createRng } from './rng';
import { overall } from './ratings';
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
const fresh = () => createWorld(load('2025-26', ['eng1']), LIV, 11);
/** 리그 순위를 강제로 정하기 (club 을 pos 위로) */
function forcePos(w: ReturnType<typeof fresh>, club: string, pos: number) {
  const t = w.competitions[w.clubs[club].league].table;
  const ids = Object.keys(t).filter((c) => c !== club);
  const order = [...ids.slice(0, pos - 1), club, ...ids.slice(pos - 1)];
  order.forEach((c, i) => Object.assign(t[c], { p: 10, w: 0, d: 0, l: 0, pts: 60 - i * 2, gf: 20, ga: 10 }));
}

describe('감독', () => {
  it('처음: 3시즌 계약 · 신뢰도 60 · 명성은 구단 명성 근처', () => {
    const w = fresh();
    const m = ensureManager(w);
    expect(m.contract).toBe('2028-06-30');
    expect(m.confidence).toBe(60);
    expect(Math.abs(m.reputation - w.clubs[LIV].reputation)).toBeLessThanOrEqual(6);
    expect(m.history[0]).toMatchObject({ club: LIV, to: null });
  });

  it('목표보다 한참 낮은 순위가 이어지면 신뢰도가 떨어지고 시즌 중 경질 → 갈 구단 3곳', () => {
    const w = fresh();
    const m = ensureManager(w);
    expect(boardTarget(w)).toBeLessThanOrEqual(4);
    forcePos(w, LIV, 19);
    const rng = createRng(3);
    let sacked = false;
    for (const d of ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']) {
      w.date = d;
      const ev = managerDay(w, rng);
      if (ev.some((e) => e.type === 'manager' && e.kind === 'sacked')) { sacked = true; break; }
    }
    expect(sacked).toBe(true);
    expect(m.pendingJob?.clubs.length).toBe(3);
    expect(m.pendingJob?.clubs).not.toContain(LIV);
    // 고르면 그 구단 감독이 된다
    const to = m.pendingJob!.clubs[0];
    chooseJob(w, to, rng);
    expect(w.userClubId).toBe(to);
    expect(m.pendingJob).toBeUndefined();
    expect(m.history.at(-2)).toMatchObject({ club: LIV, why: 'sacked' });
  });

  it('계약 마지막 해 3월: 신뢰도가 높으면 재계약 제안 → 수락하면 연장, 낮으면 재계약 없음', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.contract = '2026-06-30';
    m.confidence = 80;
    w.date = '2026-03-01';
    managerDay(w, createRng(1));
    const i = m.offers.findIndex((o) => o.kind === 'renew');
    expect(i).toBeGreaterThanOrEqual(0);
    acceptOffer(w, i, createRng(1));
    expect(m.contract).toBe('2029-06-30');

    const w2 = fresh();
    const m2 = ensureManager(w2);
    m2.contract = '2026-06-30';
    m2.confidence = 30;
    w2.date = '2026-03-01';
    const ev = managerDay(w2, createRng(1));
    expect(ev.some((e) => e.type === 'manager' && e.kind === 'norenew')).toBe(true);
    // 시즌이 바뀌어 계약이 끝나면 새 구단 고르기
    w2.date = '2026-07-01';
    managerNewSeason(w2, createRng(2));
    expect(m2.pendingJob?.reason).toBe('expired');
  });

  it('다른 구단 제안: 이적 희망을 켜면 시즌 동안 제안이 오고, 거절하면 사라진다', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.open = true;
    const rng = createRng(5);
    let got = 0;
    for (let k = 0; k < 12 && !m.offers.length; k++) { w.date = `2025-${String(8 + (k >> 1)).padStart(2, '0')}-${k % 2 ? '15' : '01'}`; got += managerDay(w, rng).filter((e) => e.type === 'manager' && e.kind === 'offer').length; }
    expect(got).toBeGreaterThan(0);
    const n = m.offers.length;
    declineOffer(w, 0);
    expect(m.offers.length).toBe(n - 1);
  });

  it('구단을 옮기면 오래 함께한 충성도 높은 선수가 따라오고, 이적시장에 시장가로 합류', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.since = '2024-07-01';   // 1시즌 넘게 함께함
    // 새 구단: 리버풀보다 조금 약한 구단 · 리버풀 선수 모두 충성도 높게
    const to = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[1].id;
    for (const id of w.clubs[LIV].squad) { const p = w.players[id]; p.loyalty = 90; p.stats.apps = 25; }
    w.clubs[to].finance.transferBudget = 2e9; w.clubs[to].finance.wageBudget = 5e7; w.clubs[to].finance.balance = 3e9; w.clubs[to].finance.revenue = 5e9;
    let follow: string[] = [];
    for (let seed = 1; seed < 20 && !follow.length; seed++) {
      const ww = fresh(); Object.assign(ww, structuredClone({ ...w }));
      const ev = moveTo(ww, to, 'offer', createRng(seed));
      const f = ev.find((e) => e.type === 'manager' && e.kind === 'follow');
      if (f && f.type === 'manager') {
        follow = f.players ?? [];
        expect(ww.userClubId).toBe(to);
        // 여름 이적시장에 처리
        ww.date = '2025-08-10';
        const done = managerDay(ww, createRng(1)).filter((e) => e.type === 'manager' && (e.kind === 'followDone' || e.kind === 'followFail'));
        expect(done.length).toBe(follow.length);
        for (const id of follow) if (done.some((e) => e.type === 'manager' && e.kind === 'followDone' && e.players?.includes(id))) expect(ww.players[id].clubId).toBe(to);
        console.log('따라온 선수', follow.map((id) => `${ww.players[id].name}(${overall(ww.players[id])})`).join(', '), done.map((e) => e.type === 'manager' && e.kind).join(', '));
      }
    }
    expect(follow.length).toBeGreaterThan(0);
  });
});
