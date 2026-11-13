// 체력: 경기 소모 · 나이별 회복 (젊은 선수는 연전 가능, 베테랑은 로테이션)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, prepareMatch, type SeasonInput } from './world';
import { finalFitness, minutesPlayed, playToEnd } from './match';
import { createRng } from './rng';
import { ageRecovery, dailyUpdate } from './condition';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';
import type { Fixture } from './types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('체력 회복', () => {
  it('나이 배율: 젊을수록 빠르고 베테랑은 느림', () => {
    expect(ageRecovery(19)).toBe(1.3);
    expect(ageRecovery(27)).toBeCloseTo(1, 5);
    expect(ageRecovery(33)).toBeCloseTo(0.75, 5);
    expect(ageRecovery(38)).toBe(0.6);
    expect(ageRecovery(24)).toBeGreaterThan(ageRecovery(30));
  });

  it('풀타임 소모 · 사흘 간격 연전: 20세는 버티고 33세는 떨어진다', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 5);
    const opp = Object.values(w.clubs).find((c) => c.id !== LIV)!.id;
    const f = { id: 'x', league: 'eng1', date: w.date, home: LIV, away: opp, result: null } as unknown as Fixture;
    // 실제 경기 90분 소모 (필드 선수 평균)
    const drains: number[] = [];
    for (let i = 0; i < 8; i++) {
      for (const p of Object.values(w.players)) { p.fitness = 100; p.injury = null; }
      const m = prepareMatch(w, f, createRng(i + 1));
      playToEnd(m, { players: w.players, rng: createRng(i + 50) });
      const fit = finalFitness(m), min = minutesPlayed(m);
      for (const [id, v] of Object.entries(fit)) if (min[id] >= 90 && w.players[id].pos !== 'GK') drains.push(100 - v);
    }
    const drain = drains.reduce((a, b) => a + b, 0) / drains.length;
    console.log('90분 평균 소모', drain.toFixed(1));
    expect(drain).toBeGreaterThan(24);
    expect(drain).toBeLessThan(40);

    // 같은 선수를 나이만 바꿔서: 사흘 간격 5경기 연속 풀타임
    const base = w.players[w.clubs[LIV].squad.find((id) => w.players[id].pos === 'CM')!];
    const kick = (age: number) => {
      const p = structuredClone(base);
      p.birth = `${2025 - age}-01-01`; p.fitness = 100; p.injury = null;
      const rng = createRng(9); const out: number[] = [];
      for (let g = 0; g < 5; g++) {
        out.push(Math.round(p.fitness));
        p.fitness -= drain;
        for (let d = 0; d < 3; d++) dailyUpdate(p, '2025-09-10', rng, true);
      }
      return out;
    };
    const young = kick(20), prime = kick(27), vet = kick(33);
    console.log('경기 시작 체력 20세', young, '27세', prime, '33세', vet);
    expect(Math.min(...young)).toBeGreaterThanOrEqual(85);   // 연전을 계속 버팀
    expect(vet[2]).toBeLessThan(young[2] - 5);               // 베테랑은 쉬어야
    expect(prime[1]).toBeGreaterThanOrEqual(80);
    // 일주일 쉬면 베테랑도 거의 회복
    const p = structuredClone(base); p.birth = '1992-01-01'; p.fitness = 100 - drain;
    const rng = createRng(3);
    for (let d = 0; d < 7; d++) dailyUpdate(p, '2025-09-10', rng, false);
    expect(p.fitness).toBeGreaterThanOrEqual(90);
  });
});
