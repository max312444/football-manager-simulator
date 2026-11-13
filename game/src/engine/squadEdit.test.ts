// 선발 · 후보 편집 · 끌어다 놓아 포메이션 바꾸기 · 불만 사유 · 체력 회복 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, applyMatch, createWorld, prepareMatch, userFixtureToday, type SeasonInput } from './world';
import { currentLineup, FORMATIONS, matchRules, pickLineup, reshape, zonePos } from './squad';
import { unrestReasons } from './loyalty';
import { playToEnd } from './match';
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

describe('피치에서 끌어다 놓아 포메이션 바꾸기', () => {
  it('위치 → 포지션', () => {
    expect(zonePos(50, 12)).toBe('ST');
    expect(zonePos(15, 22)).toBe('LW');
    expect(zonePos(85, 45)).toBe('RM');
    expect(zonePos(50, 60)).toBe('DM');
    expect(zonePos(50, 75)).toBe('CB');
    expect(zonePos(50, 92)).toBeNull();   // 골키퍼 자리로는 안 됨
  });

  it('같은 구성의 기본 포메이션이 있으면 그 이름 · 선수 배치 유지 (4-4-2 의 ST 하나를 공격형으로 → 4-4-1-1)', () => {
    const slots = FORMATIONS['4-4-2'];
    const lw = slots.indexOf('ST');
    const r = reshape(slots, lw, 'AM');
    expect(r.formation).toBe('4-4-1-1');
    expect([...r.slots].sort()).toEqual([...slots.map((s, i) => (i === lw ? 'AM' : s))].sort());
    // 새 자리마다 원래 선수가 오고, 바뀐 선수는 ST 자리에
    const lwNew = r.order.indexOf(lw);
    expect(r.slots[lwNew]).toBe('AM');
    expect(new Set(r.order).size).toBe(11);
  });

  it('기본에 없는 구성이면 formation null (옮긴 그대로 내 포메이션으로): 4-3-3 의 LW 를 스트라이커로', () => {
    const s = FORMATIONS['4-3-3'];
    const r = reshape(s, s.indexOf('LW'), 'ST');
    expect(r.formation).toBeNull();
    expect(r.slots.filter((x) => x === 'ST').length).toBe(2);
  });
});

describe('선발 · 후보', () => {
  it('후보로 정한 선수는 자동 선발에 쓰지 않는다 · 지금 선발 · 후보 표시', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 71);
    const club = w.clubs[LIV];
    const players = club.squad.map((id) => w.players[id]);
    const size = matchRules(w.season).benchSize;
    const auto = pickLineup(players, club.tactics.formation, size);
    const star = auto.starters[5].id;
    const l = pickLineup(players, club.tactics.formation, size, undefined, [star]);
    expect(l.starters.some((x) => x.id === star)).toBe(false);
    expect(l.bench).toContain(star);
    club.lineup = { starters: club.tactics.formation ? FORMATIONS[club.tactics.formation].map(() => null) : [], bench: [star] };
    const xi = currentLineup(players, club, size);
    expect(xi.bench.has(star)).toBe(true);
    expect(xi.starters.size).toBe(11);
  });
});

describe('불만 사유 · 체력', () => {
  it('불만 선수는 사유가 나온다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 72);
    const p = w.players[w.clubs[LIV].squad[10]];
    expect(unrestReasons(w, p)).toEqual([]);
    p.unhappy = true; p.loyalty = 20; p.benchStreak = 7;
    expect(unrestReasons(w, p)[0]).toContain('연속 7경기 결장');
  });

  it('풀타임 뛰면 체력이 30 이상 떨어지고, 85 이상은 회복이 느려 일주일 뒤에도 꽉 차지 않는다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 73);
    let f = userFixtureToday(w);
    while (!f) { advanceDay(w); f = userFixtureToday(w); }
    const m = prepareMatch(w, f, createRng(1));
    const t = f.home === LIV ? m.home : m.away;
    const ids = t.onPitch.map((o) => o.id).filter((id) => w.players[id].pos !== 'GK');
    playToEnd(m, { players: w.players, rng: createRng(2) });
    applyMatch(w, f, m);
    const full = ids.filter((id) => t.played[id]?.to == null);
    const after = full.map((id) => w.players[id].fitness);
    for (let d = 0; d < 7; d++) advanceDay(w);
    const week = full.map((id) => w.players[id].fitness);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log('풀타임', full.length, '명 · 경기 직후 평균', avg(after).toFixed(1), '· 7일 뒤', avg(week).toFixed(1));
    expect(avg(after)).toBeLessThan(72);
    expect(avg(week)).toBeLessThan(96);
    expect(avg(week)).toBeGreaterThan(85);
  });
});
