// 계약 조항: 바이아웃 (방출 조항)
//  - 바이아웃 금액 이상을 내면 원래 구단은 거절할 수 없다 (선수 본인은 동의해야 함)
//  - 스페인 리그는 모든 선수에게 의무 (실제 법). 다른 리그는 약 20%의 선수만
//  - AI 구단 선수의 바이아웃: 처음 볼 때 정해서 저장 (같은 세이브 · 같은 구단이면 같은 값)
//  - 내 선수: 영입 · 재계약 때 감독이 정한다 (선택). 안 넣으면 일반 계약, 넣으면 선수가 주급을 깎아 준다 (낮을수록 더). 대신
//    이적시장 동안 다른 구단이 바이아웃을 내고 데려갈 수 있다 (거절 불가)
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { createRng, hashSeed } from './rng';
import { overall } from './ratings';
import { canAfford, clubLevel, completeTransfer, marketValue, playerWillJoin, wageDemand } from './transfer';

const r05 = (v: number) => Math.max(1e6, Math.round(v / 5e5) * 5e5);
const valueOf = (w: World, p: PlayerState) => Math.max(marketValue(w, p), 5e5);

/** 이 리그는 바이아웃이 의무인가 (스페인) */
export const buyoutMandatory = (w: World, clubId: string | null) => !!clubId && (w.clubs[clubId]?.league ?? '').startsWith('esp');

/** 바이아웃 금액 (유로). 0 = 조항 없음 */
export function buyoutOf(w: World, p: PlayerState): number {
  if (!p.clubId || p.clubId.startsWith('nt-') || p.retired) return 0;
  if (p.buyoutClub === p.clubId && p.buyout != null) return p.buyout;
  const rng = createRng((hashSeed(`${p.id}:${p.clubId}:buyout`) ^ w.seed) >>> 0);
  const value = valueOf(w, p);
  let v = 0;
  if (buyoutMandatory(w, p.clubId)) v = r05(value * (overall(p) >= 80 ? 3 + rng.next() * 2 : 2 + rng.next() * 1.5));
  else if (rng.chance(0.2)) v = r05(value * (1.8 + rng.next() * 1.2));
  setBuyout(p, v);
  return v;
}

/** 계약할 때 정한 바이아웃 (0 = 없음) */
export function setBuyout(p: PlayerState, v: number) {
  p.buyout = Math.max(0, Math.round(v));
  p.buyoutClub = p.clubId ?? undefined;
}

/** 계약 화면의 바이아웃 선택지: 시장 가치의 배수 (스페인은 '없음' 불가) */
export const BUYOUT_MULTS = [0, 1.5, 2.5, 4] as const;
export function buyoutOptions(w: World, p: PlayerState, clubId: string): { mult: number; fee: number }[] {
  const value = valueOf(w, p);
  return BUYOUT_MULTS.filter((m) => m > 0 || !buyoutMandatory(w, clubId)).map((m) => ({ mult: m, fee: m ? r05(value * m) : 0 }));
}

/** 바이아웃에 따른 주급 요구 배율: 안 넣으면 그대로(일반 계약), 넣으면 깎아 준다 — 낮게 걸수록(언제든 떠날 수 있어서) 더 (이적료는 그대로) */
export function buyoutWageFactor(w: World, p: PlayerState, clause: number): number {
  if (clause <= 0) return 1;
  const r = clause / valueOf(w, p);
  return r <= 1.65 ? 0.9 : r <= 2.75 ? 0.94 : r <= 4.4 ? 0.97 : 1;   // 선택지 금액 반올림 여유 10%
}

/**
 * 이적시장 동안 매일: 다른 구단이 내 선수의 바이아웃을 내고 데려가는지 (거절 불가)
 *  - 바이아웃이 시장 가치에 가까울수록 자주 (×1.3 이하 하루 2% · ×2 이하 0.4% · ×3 이하 0.08% · 그 위 없음)
 *  - 데려가는 구단: 그 선수가 주전급인 구단(수준 −3 이상) 중 이적 예산 · 주급 · 재정 규정을 감당하고 선수도 가고 싶어 하는 곳, 명성이 가장 높은 곳
 *  - 하루 최대 1명
 */
export function aiBuyoutRaids(w: World, rng: Rng): GameEvent[] {
  const me = w.clubs[w.userClubId];
  if (!me) return [];
  for (const id of me.squad) {
    const p = w.players[id];
    if (p.loan) continue;
    const clause = buyoutOf(w, p);
    if (clause <= 0) continue;
    const r = clause / valueOf(w, p);
    const chance = r <= 1.3 ? 0.02 : r <= 2 ? 0.004 : r <= 3 ? 0.0008 : 0;
    if (!chance || !rng.chance(chance)) continue;
    const ovr = overall(p);
    const wage = wageDemand(w, p);
    const club = Object.values(w.clubs)
      .filter((c) => c.id !== w.userClubId && w.competitions[c.league] && ovr >= clubLevel(w, c.id) - 3 && canAfford(w, c.id, clause, wage, 4) && playerWillJoin(w, p, c.id, wage).ok)
      .sort((a, b) => b.reputation - a.reputation)[0];
    if (!club) continue;
    const ev = completeTransfer(w, p, club.id, clause, wage, 4);
    w.inbox.push({ type: 'buyout', date: w.date, player: p.id, to: club.id, fee: clause });
    return [ev];
  }
  return [];
}
