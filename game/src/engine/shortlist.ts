// 관심 선수 알림: 관심 목록(이적 화면 '관심') 선수에게 영입 기회가 생기면 받은편지함으로
//  - 급매물 (강제 매각 · 강등 조항 발동)으로 나옴
//  - 자유계약이 됨 (방출 · 계약 만료)
//  - 보스만 사전 계약 가능 (계약 마지막 6개월 · 다른 나라 구단인 내 구단)
//  - 계약 만료가 6개월 이내로 남음 (같은 나라라 보스만은 안 되지만 여름에 자유계약)
//  선수 · 사건마다 한 번 (시즌이 바뀌면 다시 알릴 수 있게 시즌을 키에 넣음)
import type { GameEvent, World } from './types';
import { bargainOf } from './firesale';
import { bosmanEligible, inFinalMonths } from './bosman';

export function shortlistDay(w: World): GameEvent[] {
  if (w.shortlist?.some((id) => w.players[id]?.clubId === w.userClubId)) w.shortlist = w.shortlist.filter((id) => w.players[id]?.clubId !== w.userClubId);   // 우리 선수가 되면 관심 해제
  const list = w.shortlist ?? [];
  if (!list.length) return [];
  const seen = (w.shortlistSeen ??= {});
  const out: GameEvent[] = [];
  const once = (id: string, key: string, ev: GameEvent) => {
    const k = `${key}:${w.season}`;
    const s = (seen[id] ??= []);
    if (s.includes(k)) return;
    s.push(k);
    out.push(ev);
  };
  for (const id of list) {
    const p = w.players[id];
    if (!p || p.retired || p.clubId === w.userClubId) continue;
    if (!p.clubId) { once(id, 'free', { type: 'shortlist', date: w.date, player: id, kind: 'free', club: null }); continue; }
    const b = bargainOf(w, p);
    if (b) once(id, `bargain-${b.kind}`, { type: 'shortlist', date: w.date, player: id, kind: 'bargain', club: p.clubId });
    if (bosmanEligible(w, p, w.userClubId)) once(id, 'bosman', { type: 'shortlist', date: w.date, player: id, kind: 'bosman', club: p.clubId });
    else if (inFinalMonths(w, p) && !p.precontract) once(id, 'expiring', { type: 'shortlist', date: w.date, player: id, kind: 'expiring', club: p.clubId });
  }
  // 관심 목록에서 빠진 선수 기록은 정리
  for (const k of Object.keys(seen)) if (!list.includes(k)) delete seen[k];
  return out;
}
