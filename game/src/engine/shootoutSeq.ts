// 승부차기 한 번씩 (화면 연출용): 이미 정해진 승자(cup.shootout)에 맞는 키커 · 성공/실패 순서를 만든다
//  - 키커: 경기 끝에 뛰던 선수 중 슈팅 · 침착성 높은 순 (골키퍼는 마지막), 11명이 다 차면 처음부터
//  - 성공 확률: 키커 슈팅 · 침착성 vs 상대 골키퍼 반사 신경 · 1:1 (55~90%)
//  - 5명씩 → 이미 결과가 정해지면 바로 끝, 동점이면 서든데스. 정해진 승자와 다르면 다시 뽑는다
import type { MatchState, OnPitch } from './match';
import type { PlayerState, Side } from './types';
import { attr } from './ratings';
import { createRng } from './rng';

export interface Kick { id: string; scored: boolean; saved: boolean }
export interface ShootoutSeq { home: Kick[]; away: Kick[]; score: [number, number] }

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function takers(onPitch: OnPitch[], players: Record<string, PlayerState>): string[] {
  const gk = onPitch.filter((o) => o.slot === 'GK').map((o) => o.id);
  const field = onPitch.filter((o) => o.slot !== 'GK').map((o) => players[o.id])
    .sort((a, b) => attr(b, 'sho') + attr(b, 'com') - (attr(a, 'sho') + attr(a, 'com'))).map((p) => p.id);
  return [...field, ...gk];
}

export function shootoutSeq(m: MatchState, players: Record<string, PlayerState>, winner: Side, key: string): ShootoutSeq {
  const order = { home: takers(m.home.onPitch, players), away: takers(m.away.onPitch, players) };
  const keeper = (side: Side) => players[(side === 'home' ? m.away : m.home).onPitch.find((o) => o.slot === 'GK')?.id ?? ''];
  const chance = (id: string, side: Side) => {
    const p = players[id], gk = keeper(side);
    const kick = (attr(p, 'sho') + attr(p, 'com')) / 2, save = gk ? (attr(gk, 'ref') + attr(gk, 'one')) / 2 : 50;
    return Math.max(0.55, Math.min(0.9, 0.75 + (kick - 70) / 200 - (save - 70) / 250));
  };
  for (let tryN = 0; tryN < 200; tryN++) {
    const rng = createRng(hash(`${key}#${tryN}`));
    const seq: ShootoutSeq = { home: [], away: [], score: [0, 0] };
    const kick = (side: Side) => {
      const list = seq[side];
      const id = order[side][list.length % order[side].length];
      const scored = rng.chance(chance(id, side));
      list.push({ id, scored, saved: !scored && rng.chance(0.6) });
      if (scored) seq.score[side === 'home' ? 0 : 1]++;
    };
    // 5명씩: 남은 차기로 따라잡을 수 없으면 끝
    for (let k = 0; k < 5; k++) {
      kick('home');
      if (seq.score[0] > seq.score[1] + (5 - k) || seq.score[1] > seq.score[0] + (5 - k - 1)) break;
      kick('away');
      if (Math.abs(seq.score[0] - seq.score[1]) > 4 - k) break;
    }
    // 서든데스
    while (seq.score[0] === seq.score[1] && seq.home.length < 30) { kick('home'); kick('away'); }
    const won: Side = seq.score[0] > seq.score[1] ? 'home' : 'away';
    if (won === winner) return seq;
  }
  // 거의 없지만: 마지막 차기를 결과에 맞게
  const id = (s: Side) => order[s][0];
  return winner === 'home'
    ? { home: [{ id: id('home'), scored: true, saved: false }], away: [{ id: id('away'), scored: false, saved: true }], score: [1, 0] }
    : { home: [{ id: id('home'), scored: false, saved: true }], away: [{ id: id('away'), scored: true, saved: false }], score: [0, 1] };
}
