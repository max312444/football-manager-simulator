// 급매물: 강제 매각 (Fire Sale) · 강등 조항 (Relegation Release Clause)
//
// 강제 매각: 이적시장이 열리는 날, 선수단 비용이 재정 규정 한도를 15% 이상 넘은 AI 구단은
//  핵심 선수 1명 (30% 이상이면 2명)을 시장 가치의 70~80%에 내놓는다 (팀 핵심이라도 거절하지 않음).
//  보통 강등 · 매출 감소로 새 시즌에 생긴다 (2024-25 → 2025-26 시뮬레이션: 한도 10% 이상 초과 약 10곳)
//
// 강등 조항: 1부 리그 명성 하위 40% 구단의 상위 3명 중 일부 (60%)는 계약에 "강등되면 바이아웃 가치 ×0.8~1.2" 조항이 있다.
//  시즌이 끝나 그 구단이 강등되면 발동 → 여름 이적시장 동안 그 금액이면 구단은 거절할 수 없다
//
// 두 매물 모두 그 이적시장 동안 유효 (팔리거나 마감되면 사라짐). AI 구단도 매일 노린다 (하루 2.5% · 여름 이적시장 동안 매물 약 80%가 팔림, 그 선수가 주전급이고 감당 가능한 구단 중 명성 1위)
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { createRng, hashSeed } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { levelOf } from './pyramid';
import { costLimit, squadCost } from './rules';
import { canAfford, clubLevel, completeTransfer, marketValue, playerWillJoin, wageDemand, windowEnd, windowOpen } from './transfer';

export interface Bargain { player: string; club: string; price: number; until: string; kind: 'fire' | 'releg'; /** 시장 가치 대비 할인 (강제 매각) */ cut?: number }

const r05 = (v: number) => Math.max(5e5, Math.round(v / 5e5) * 5e5);

/** 이 선수의 급매물 (지금 유효한 것) */
export function bargainOf(w: World, p: PlayerState): Bargain | null {
  const b = (w.bargains ?? []).find((x) => x.player === p.id);
  return b && b.club === p.clubId && b.until >= w.date && !p.loan && !p.precontract ? b : null;
}

/** 구단 재정 압박: 선수단 비용 ÷ 재정 규정 한도 */
export const overLimit = (w: World, clubId: string) => squadCost(w, clubId) / Math.max(1, costLimit(w, clubId).limit);

// ── 강등 조항 ─────────────────────────────────────────
/** 강등 조항 금액 (0 = 없음). 구단마다 처음 볼 때 정해 저장 */
export function relClauseOf(w: World, p: PlayerState): number {
  if (!p.clubId || p.clubId.startsWith('nt-') || p.retired || p.loan) return 0;
  if (p.relClub === p.clubId && p.relClause != null) return p.relClause;
  const club = w.clubs[p.clubId];
  let v = 0;
  if (club && w.competitions[club.league] && levelOf(club.league) === 1) {
    const mates = Object.values(w.clubs).filter((c) => c.league === club.league).sort((a, b) => a.reputation - b.reputation);
    const lowRep = mates.indexOf(club) < Math.ceil(mates.length * 0.4);
    const top3 = club.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a)).slice(0, 3).some((x) => x.id === p.id);
    const rng = createRng((hashSeed(`${p.id}:${p.clubId}:rel`) ^ w.seed) >>> 0);
    if (lowRep && top3 && rng.chance(0.6)) v = r05(Math.max(marketValue(w, p), 1e6) * (0.8 + rng.next() * 0.4));
  }
  p.relClause = v; p.relClub = p.clubId;
  return v;
}

/** 시즌 전환 전 (리그 바뀌기 전): 1부 구단 선수의 강등 조항을 정해 둔다 */
export function fixRelClauses(w: World) {
  for (const c of Object.values(w.clubs)) if (w.competitions[c.league] && levelOf(c.league) === 1) for (const id of c.squad) relClauseOf(w, w.players[id]);
}

/** 시즌 전환 (리그가 바뀐 뒤): 강등된 구단 선수의 강등 조항 발동 → 여름 이적시장 동안 급매물 */
export function triggerRelClauses(w: World, relegated: string[], season: string): string[] {
  const until = windowEnd(season, `${season.slice(0, 4)}-07-01`) ?? `${season.slice(0, 4)}-09-01`;
  const out: string[] = [];
  for (const cid of relegated) for (const id of w.clubs[cid]?.squad ?? []) {
    const p = w.players[id];
    if (p.relClub !== cid || !p.relClause) continue;
    (w.bargains ??= []).push({ player: id, club: cid, price: p.relClause, until, kind: 'releg' });
    p.relClause = 0;   // 한 번 발동하면 끝
    out.push(id);
  }
  return out;
}

// ── 강제 매각 · 매일 ─────────────────────────────────
/**
 * 이적시장 동안 매일: (열린 첫날) 재정 위기 구단의 강제 매각 매물 → 받은편지함,
 * AI 구단이 급매물을 사 감, 마감 · 소속이 바뀐 매물 정리
 */
export function bargainDay(w: World, rng: Rng): GameEvent[] {
  const win = windowOpen(w.season, w.date);
  w.bargains = (w.bargains ?? []).filter((b) => b.until >= w.date && w.players[b.player]?.clubId === b.club);
  if (!win) return [];
  const events: GameEvent[] = [];
  const key = `${w.season}:${win}`;
  if (w.fireSaleKey !== key) {
    w.fireSaleKey = key;
    const until = windowEnd(w.season, w.date)!;
    const made: string[] = [];
    for (const c of Object.values(w.clubs)) {
      if (c.id === w.userClubId || !w.competitions[c.league] || c.id.startsWith('nt-')) continue;
      const over = overLimit(w, c.id);
      if (over < 1.15) continue;
      const stars = c.squad.map((id) => w.players[id]).filter((p) => !p.loan && !p.precontract && !bargainOf(w, p) && ageOn(p.birth, w.date) <= 32)
        .sort((a, b) => overall(b) - overall(a)).slice(0, over >= 1.3 ? 2 : 1);
      for (const p of stars) {
        const cut = 0.2 + rng.next() * 0.1;
        w.bargains.push({ player: p.id, club: c.id, price: r05(marketValue(w, p) * (1 - cut)), until, kind: 'fire', cut });
        made.push(p.id);
      }
    }
    const notify = [...made, ...w.bargains.filter((b) => b.kind === 'releg').map((b) => b.player)];
    if (notify.length) w.inbox.push({ type: 'bargain', date: w.date, players: [...new Set(notify)].sort((a, b) => overall(w.players[b]) - overall(w.players[a])).slice(0, 6) });
  }
  // AI 구단이 급매물을 사 감 (하루 2.5%, 첫날은 사용자에게 기회)
  for (const b of [...w.bargains]) {
    if (b.until < w.date || w.date.endsWith('-07-01') || w.date.endsWith('-01-01') || !rng.chance(0.025)) continue;
    const p = w.players[b.player];
    const wage = wageDemand(w, p);
    const ovr = overall(p);
    const buyer = Object.values(w.clubs)
      .filter((c) => c.id !== b.club && c.id !== w.userClubId && w.competitions[c.league] && !c.id.startsWith('nt-') && ovr >= clubLevel(w, c.id) - 2 && canAfford(w, c.id, b.price, wage, 4) && playerWillJoin(w, p, c.id, wage).ok)
      .sort((a, z) => z.reputation - a.reputation)[0];
    if (!buyer) continue;
    events.push(completeTransfer(w, p, buyer.id, b.price, wage, 4));
    w.bargains = w.bargains.filter((x) => x !== b);
  }
  return events;
}
