// 선수 역할 · 약속 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { autoRole, changeRole, roleOf } from './roles';
import { updatePlaytime } from './loyalty';
import { playerWillJoin, wageDemand } from './transfer';
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
const fresh = () => createWorld(load('2025-26', ['eng1']), LIV, 5);

describe('선수 역할', () => {
  it('자동 역할: 최고 선수는 핵심 주전, 가장 약한 선수는 백업 · 유망주', () => {
    const w = fresh();
    const ps = w.clubs[LIV].squad.map((id) => w.players[id]).filter((p) => p.pos !== 'GK').sort((a, b) => overall(b) - overall(a));
    expect(autoRole(w, ps[0])).toBe('key');
    expect(['backup', 'prospect']).toContain(autoRole(w, ps[ps.length - 1]));
  });

  it('핵심 주전으로 약속한 선수는 벤치에 앉으면 백업보다 훨씬 빨리 불만', () => {
    const w = fresh();
    const [a, b] = w.clubs[LIV].squad.map((id) => w.players[id]).filter((p) => p.pos !== 'GK').slice(0, 2);
    for (const p of [a, b]) { p.loyalty = 60; p.benchStreak = 6; p.hidden = { ...p.hidden, ambition: 12 }; p.injury = null; p.suspension = 0; }
    a.role = 'key'; b.role = 'backup';
    for (let k = 0; k < 6; k++) updatePlaytime(w, [LIV], {}, new Set());
    console.log('핵심 약속', a.loyalty.toFixed(1), '· 백업', b.loyalty.toFixed(1));
    expect(60 - a.loyalty).toBeGreaterThan((60 - b.loyalty) * 5);
  });

  it('계약 때 높은 역할을 약속할수록 선수가 오려고 한다', () => {
    const w = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => b.reputation - a.reputation)[0];
    const p = w.players[other.squad[0]];
    const wage = wageDemand(w, p);
    const score = (r?: 'key' | 'backup') => { let lo = 0; for (let k = 0; k < 1; k++) lo = playerWillJoin(w, p, LIV, wage, r).ok ? 1 : 0; return lo; };
    expect(score('key')).toBeGreaterThanOrEqual(score('backup'));
  });

  it('역할을 올리면 사기 +, 내리면 사기 · 충성도 −', () => {
    const w = fresh();
    const p = w.players[w.clubs[LIV].squad[0]];
    p.role = 'rotation'; p.morale = 50; p.loyalty = 60;
    changeRole(w, p, 'key');
    expect(p.morale).toBe(62);
    changeRole(w, p, 'backup');
    expect(p.morale).toBeLessThan(62);
    expect(p.loyalty).toBeLessThan(60);
    expect(roleOf(w, p)).toBe('backup');
  });
});
