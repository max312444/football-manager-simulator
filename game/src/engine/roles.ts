// 선수 역할 (내 구단): 계약 때 약속하는 출전 기대치
//  핵심 주전 · 주전 · 로테이션 · 유망주 · 백업 → 출전 기대치 (loyalty.ts 의 벤치 불만에 쓰임)
//  - 핵심 · 주전으로 약속받은 선수는 벤치가 길어지면 더 빨리 불만 (약속 위반)
//  - 계약할 때 높은 역할을 약속할수록 선수가 오려고 한다 (transfer.ts playerWillJoin)
//  - 역할을 바꾸면: 올려 주면 사기 +, 내리면 사기 · 충성도 −
//  AI 구단은 역할 없이 선수단 순위로 기대치를 정한다
import type { PlayerState, World } from './types';
import { overall } from './ratings';
import { ageOn } from './condition';

export type Role = 'key' | 'regular' | 'rotation' | 'prospect' | 'backup';
export const ROLES: Role[] = ['key', 'regular', 'rotation', 'prospect', 'backup'];
export const ROLE_KO: Record<Role, string> = { key: '핵심 주전', regular: '주전', rotation: '로테이션', prospect: '유망주', backup: '백업' };
export const ROLE_HINT: Record<Role, string> = {
  key: '거의 모든 경기 선발', regular: '대부분 경기 선발', rotation: '경기 절반쯤', prospect: '어린 선수 · 가끔 기회', backup: '필요할 때만',
};
/** 출전 기대치 (0~1) */
export const ROLE_EXPECT: Record<Role, number> = { key: 1, regular: 0.85, rotation: 0.5, prospect: 0.25, backup: 0.1 };
/** 약속을 어겼을 때 불만이 커지는 배율 */
export const ROLE_PROMISE: Record<Role, number> = { key: 1.4, regular: 1.2, rotation: 1, prospect: 0.8, backup: 0.6 };
/** 계약 때 이 역할을 약속하면 선수 마음에 더하는 값 */
export const ROLE_JOIN: Record<Role, number> = { key: 1, regular: 0.5, rotation: 0, prospect: 0.2, backup: -1 };
const RANK: Record<Role, number> = { key: 0, regular: 1, rotation: 2, prospect: 3, backup: 4 };

/** 선수단 순위로 정하는 기본 역할 (골키퍼는 1번만 핵심) */
export function autoRole(w: World, p: PlayerState, clubId = p.clubId): Role {
  if (!clubId || !w.clubs[clubId]) return 'backup';
  const ps = w.clubs[clubId].squad.map((id) => w.players[id]).filter((x) => x.id !== p.id);
  const ovr = overall(p);
  if (p.pos === 'GK') return ps.filter((x) => x.pos === 'GK' && overall(x) > ovr).length === 0 ? 'key' : ageOn(p.birth, w.date) <= 21 ? 'prospect' : 'backup';
  const i = ps.filter((x) => x.pos !== 'GK' && overall(x) > ovr).length;
  if (i < 5) return 'key';
  if (i < 10) return 'regular';
  if (i < 16) return 'rotation';
  return ageOn(p.birth, w.date) <= 21 ? 'prospect' : 'backup';
}
export const roleOf = (w: World, p: PlayerState): Role => p.role ?? autoRole(w, p);

/** 역할 바꾸기: 올리면 사기 +6, 내리면 사기 −10 · 충성도 −8 (한 단계마다) */
export function changeRole(w: World, p: PlayerState, role: Role): { up: boolean; steps: number } {
  const from = roleOf(w, p);
  const steps = RANK[from] - RANK[role];
  if (steps > 0) p.morale = Math.min(100, p.morale + 6 * steps);
  if (steps < 0) { p.morale = Math.max(0, p.morale + 10 * steps); p.loyalty = Math.max(0, p.loyalty + 8 * steps); }
  p.role = role;
  return { up: steps > 0, steps: Math.abs(steps) };
}
