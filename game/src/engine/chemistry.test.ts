// 라커룸 · 팀 케미 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { attr, overall } from './ratings';
import { chemistry, chemMult, lockerDay, meetingReady, teamMeeting } from './chemistry';
import { createRng } from './rng';
import { seedTraits, type PlayerHistory } from './traits';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIV = 'c83d96l';
const HIST: PlayerHistory = JSON.parse(fs.readFileSync(path.join(DATA, 'history', 'players.json'), 'utf8'));
/** 실제 게임처럼: 새 게임 때 이력으로 현 구단 연속 시즌 · 시작 호칭 */
const make = (seed: number) => { const w = createWorld(load('2025-26'), LIV, seed); seedTraits(w, HIST, createRng(seed)); return w; };
const load = (season: string): SeasonInput => ({
  season, leagues: fs.readdirSync(path.join(DATA, 'seasons', season)).map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});

describe('팀 케미', () => {
  const w = make(61);
  const clubs = Object.values(w.clubs).filter((c) => w.competitions[c.league]);

  it('구단마다 고르게 퍼져 있고 (극단 없음) 경기 배율은 ±3% 안', () => {
    const xs = clubs.map((c) => chemistry(w, c.id).total).sort((a, b) => a - b);
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
    const parts = chemistry(w, LIV).parts;
    const tops = clubs.map((c) => [c.id, c.reputation, chemistry(w, c.id).total] as const).sort((a, b) => b[2] - a[2]);
    console.log('케미 상위', tops.slice(0, 4), '하위', tops.slice(-4));
    console.log('케미 분포 · 최저', xs[0], '· 평균', avg.toFixed(1), '· 최고', xs.at(-1), '· 리버풀', chemistry(w, LIV).total, parts);
    expect(avg).toBeGreaterThan(35);
    expect(avg).toBeLessThan(70);
    expect(xs.at(-1)! - xs[0]).toBeGreaterThan(15);
    expect(chemMult(0)).toBeCloseTo(0.97);
    expect(chemMult(100)).toBeCloseTo(1.03);
  });

  it('주장 지정 · 영향력 순위 · 불만 선수는 감점', () => {
    const club = w.clubs[LIV];
    const before = chemistry(w, LIV);
    const weakLeader = club.squad.map((id) => w.players[id]).sort((a, b) => attr(a, 'ldr') - attr(b, 'ldr'))[0];
    club.captain = weakLeader.id;
    expect(chemistry(w, LIV).captain).toBe(weakLeader.id);
    expect(chemistry(w, LIV).parts.leader).toBeLessThanOrEqual(before.parts.leader);
    club.captain = undefined;
    const star = club.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[0];
    star.unhappy = true;
    const after = chemistry(w, LIV);
    expect(after.unrest).toContain(star.id);
    expect(after.total).toBeLessThan(before.total);
    star.unhappy = false;
    expect(before.leaders.length).toBe(5);
  });

  it('영향력 큰 선수가 불만이면 사기가 퍼지듯 떨어지고 알림이 온다', () => {
    const ww = make(62);
    const club = ww.clubs[LIV];
    const top = chemistry(ww, LIV).leaders[0].id;
    ww.players[top].unhappy = true;
    const avg = () => club.squad.reduce((s, id) => s + ww.players[id].morale, 0) / club.squad.length;
    const m0 = avg();
    for (let d = 0; d < 10; d++) lockerDay(ww);
    console.log('불만 전염 10일 · 사기', m0.toFixed(1), '→', avg().toFixed(1));
    expect(avg()).toBeLessThan(m0 - 1.5);
    expect(ww.inbox.filter((e) => e.type === 'locker').length).toBe(1);   // 30일에 한 번
  });

  it('팀 미팅은 30일에 한 번 · 성공하면 사기 +6 · 실패하면 −4', () => {
    const ww = make(63);
    const p = ww.players[ww.clubs[LIV].squad[0]];
    const m0 = p.morale;
    expect(meetingReady(ww)).toBe(true);
    const r = teamMeeting(ww, createRng(1));
    expect(p.morale - m0).toBe(r.ok ? 6 : -4);
    expect(meetingReady(ww)).toBe(false);
  });
});
