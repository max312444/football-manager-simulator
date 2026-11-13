// 스폰서 계약 (모든 구단): 메인(가슴) 스폰서 · 유니폼 용품 — 실존 브랜드 아님 (이름은 만들어 씀)
//  - 스폰서 · 상품 수입(매출의 25%) = 메인 스폰서 45% + 용품 25% + 상품 · 기타 30%(계약 없이 매달)
//  - 계약 연액을 12로 나눠 매월 1일 (financeDay). 계약이 없는 구단(예전 세이브)은 처음 쓸 때 만든다
//  - 내 구단: 계약 만료 시즌 3월 1일부터 제안 3개 (고정형 · 성과형 · 장기형), 6월 25일까지 고르기 → 안 고르면 고정형 자동
//    제안 금액 = 기준 × 성적(목표 대비 순위) × 명성 × 팬 여론 × 운 (±8%)
//  - AI 구단: 만료되면 성적에 따라 자동 갱신
//  - 성과 보너스 (시즌 끝): 리그 우승 · 4위 안 · 국내 컵 우승 · 유럽 대회 우승
import type { ClubState, GameEvent, SeasonRecord, World } from './types';
import type { Rng } from './rng';
import { createRng } from './rng';
import { book, clubRevenue, SHARE } from './finance';
import { sortTable } from './standings';
import { boardTarget } from './manager';

export type SponsorSlot = 'shirt' | 'kit';
export type SponsorKind = 'fixed' | 'bonus' | 'long';
export interface SponsorBonus { title?: number; top4?: number; cup?: number; euro?: number }
export interface SponsorDeal { slot: SponsorSlot; name: string; value: number; until: string; kind: SponsorKind; bonus?: SponsorBonus; /** 내 구단: 이번 만료 건 제안을 이미 받음 */ renewing?: boolean }
export interface SponsorOffer extends SponsorDeal { id: string; expires: string }

export const SLOT_SHARE: Record<SponsorSlot, number> = { shirt: 0.45, kit: 0.25 };
/** 계약 없이 매달 들어오는 상품 · 기타 몫 */
export const MERCH_SHARE = 0.3;
export const SLOT_KO: Record<SponsorSlot, string> = { shirt: '메인 스폰서', kit: '유니폼 용품' };
export const KIND_KO: Record<SponsorKind, string> = { fixed: '고정형', bonus: '성과형', long: '장기형' };

const r5 = (v: number) => Math.round(v / 1e5) * 1e5;
const endYear = (season: string) => +season.slice(0, 4) + 1;
const untilOf = (season: string, years: number) => `${endYear(season) + years - 1}-06-30`;
const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// 가상 회사 이름 (실존 브랜드와 겹치지 않게 조합)
const HEAD = ['노바', '블루스톤', '아스트라', '실버라인', '오로라', '헬리오', '퀀텀', '베르텍', '루미나', '카스텔', '그린필드', '오닉스', '제니스', '포르테', '알타', '넥서스', '솔라리스', '테라', '벨로', '마리너'];
const TAIL = ['에너지', '항공', '모바일', '뱅크', '모터스', '텔레콤', '보험', '홀딩스', '테크', '캐피털', '물류', '헬스', '게임즈', '푸드', '리조트'];
const KIT = ['스트라이드', '킥라인', '베르텍스 스포츠', '아크로', '피닉스 애슬레틱', '코어핏', '런웨이', '펄스', '타이탄 스포츠', '에어로'];
function sponsorName(slot: SponsorSlot, rng: Rng) { return slot === 'kit' ? rng.pick(KIT) : `${rng.pick(HEAD)} ${rng.pick(TAIL)}`; }

/** 이 구단 슬롯 기준 연액 (매출 × 25% × 슬롯 몫) */
const slotBase = (w: World, clubId: string, slot: SponsorSlot) => clubRevenue(w, clubId) * SHARE.commercial * SLOT_SHARE[slot];

/** 계약이 없으면 만든다 (첫 시즌: 내 구단 메인 스폰서는 이번 시즌 끝 만료 → 봄에 새 제안) */
export function ensureSponsors(w: World, c: ClubState): SponsorDeal[] {
  if (c.sponsors?.length) return c.sponsors;
  const rng = createRng(hash(c.id + w.seed));
  const mine = c.id === w.userClubId;
  c.sponsors = (['shirt', 'kit'] as SponsorSlot[]).map((slot) => ({
    slot, name: sponsorName(slot, rng), value: r5(slotBase(w, c.id, slot)), kind: 'fixed' as SponsorKind,
    until: untilOf(w.season, mine ? (slot === 'shirt' ? 1 : 3) : rng.int(1, 4)),   // 내 구단: 메인은 첫 시즌 끝, 용품은 3시즌 (만료 시기를 나눔)
  }));
  return c.sponsors;
}

/** 매월 스폰서 · 상품 수입 (financeDay 에서): 계약 연액 / 12 + 상품 · 기타 몫 */
export function monthlyCommercial(w: World, c: ClubState, merchFactor: number): number {
  const deals = ensureSponsors(w, c);
  const merch = (clubRevenue(w, c.id) * SHARE.commercial * MERCH_SHARE) / 12 * merchFactor;
  return Math.round(deals.reduce((s, d) => s + d.value / 12, 0) + merch);
}

/** 성적 배율: 목표 순위보다 잘하면 ↑ (0.8 ~ 1.3), 명성 · 팬 여론 반영 */
function performance(w: World, clubId: string): number {
  const c = w.clubs[clubId];
  const comp = w.competitions[c.league];
  let f = 1;
  if (comp) {
    const table = sortTable(comp.table);
    const pos = table.findIndex((r) => r.club === clubId) + 1;
    if (pos > 0 && table.some((r) => r.p >= 5)) f += ((boardTarget(w, clubId) - pos) / table.length) * 0.6;
  }
  if (clubId === w.userClubId && w.manager?.fanMood != null) f += (w.manager.fanMood - 60) / 400;
  return Math.max(0.8, Math.min(1.3, f));
}

/** 제안 3개 (고정형 · 성과형 · 장기형) */
export function makeOffers(w: World, slot: SponsorSlot, rng: Rng): SponsorOffer[] {
  const base = slotBase(w, w.userClubId, slot) * performance(w, w.userClubId);
  const next = `${endYear(w.season)}-${String((endYear(w.season) + 1) % 100).padStart(2, '0')}`;
  const expires = `${endYear(w.season)}-06-25`;
  const luck = () => 0.92 + rng.next() * 0.16;
  const mk = (kind: SponsorKind, value: number, years: number, bonus?: SponsorBonus): SponsorOffer =>
    ({ id: `${slot}-${kind}-${w.date}`, slot, kind, name: sponsorName(slot, rng), value: r5(value), until: untilOf(next, years), expires, ...(bonus ? { bonus } : {}) });
  const b = slotBase(w, w.userClubId, slot);
  return [
    mk('fixed', base * luck(), 3),
    mk('bonus', base * 0.8 * luck(), 3, { title: r5(b * 0.35), top4: r5(b * 0.15), cup: r5(b * 0.1), euro: r5(b * 0.3) }),
    mk('long', base * 0.93 * luck(), 5),
  ];
}

/** 매일: 내 구단 만료 시즌 3월 1일 제안 · 6월 25일 지나면 자동 계약 */
export function sponsorDay(w: World, rng: Rng): GameEvent[] {
  const c = w.clubs[w.userClubId];
  if (!c) return [];
  const deals = ensureSponsors(w, c);
  const out: GameEvent[] = [];
  const seasonEnd = `${endYear(w.season)}-06-30`;
  const offers = (w.sponsorOffers ??= []);
  for (const d of deals) {
    if (d.until > seasonEnd) continue;   // 이번 시즌에 끝나지 않음
    const mine = offers.filter((o) => o.slot === d.slot);
    if (!mine.length && w.date >= `${endYear(w.season)}-03-01` && w.date < `${endYear(w.season)}-06-25` && !d.renewing) {
      d.renewing = true;
      offers.push(...makeOffers(w, d.slot, rng));
      out.push({ type: 'sponsor', date: w.date, kind: 'offers', slot: d.slot });
    }
    if (mine.length && w.date >= mine[0].expires) {
      const pick = mine.find((o) => o.kind === 'fixed') ?? mine[0];
      out.push(signSponsor(w, pick.id, true)!);
    }
  }
  return out;
}

/** 내 구단 제안 수락 (auto: 기한이 지나 자동) */
export function signSponsor(w: World, offerId: string, auto = false): GameEvent | null {
  const o = w.sponsorOffers?.find((x) => x.id === offerId);
  const c = w.clubs[w.userClubId];
  if (!o || !c) return null;
  const { id: _i, expires: _e, ...deal } = o;
  c.sponsors = [...ensureSponsors(w, c).filter((d) => d.slot !== o.slot), deal];
  w.sponsorOffers = w.sponsorOffers!.filter((x) => x.slot !== o.slot);
  return { type: 'sponsor', date: w.date, kind: auto ? 'auto' : 'signed', slot: o.slot, name: o.name, amount: o.value };
}

/**
 * 시즌 끝: 성과 보너스 (모든 구단) · AI 구단 만료 계약 자동 갱신
 *  내 구단 만료 계약은 sponsorDay 가 처리 (안 고르면 자동 계약)
 */
export function sponsorSeasonEnd(w: World, recs: SeasonRecord[]): GameEvent[] {
  const out: GameEvent[] = [];
  const pos = new Map<string, number>();
  for (const r of recs) r.table.forEach((row, i) => pos.set(row.club, i + 1));
  const cupWin = new Set(Object.values(w.cups ?? {}).map((c) => c.winner).filter(Boolean) as string[]);
  const euroWin = new Set(Object.values(w.europe ?? {}).map((c) => c.winner).filter(Boolean) as string[]);
  const seasonEnd = `${endYear(w.season)}-06-30`;
  const rng = createRng(hash(w.season + w.seed));
  for (const c of Object.values(w.clubs)) {
    if (!w.competitions[c.league]) continue;
    const deals = ensureSponsors(w, c);
    for (const d of deals) {
      if (d.bonus) {
        const p = pos.get(c.id) ?? 99;
        const amount = (p === 1 ? d.bonus.title ?? 0 : 0) + (p <= 4 ? d.bonus.top4 ?? 0 : 0) + (cupWin.has(c.id) ? d.bonus.cup ?? 0 : 0) + (euroWin.has(c.id) ? d.bonus.euro ?? 0 : 0);
        if (amount) {
          book(w, c.id, 'commercial', amount);
          if (c.id === w.userClubId) out.push({ type: 'sponsor', date: w.date, kind: 'bonus', slot: d.slot, name: d.name, amount });
        }
      }
      // AI 구단: 만료면 성적 반영해 갱신 (같은 회사 70% · 새 회사 30%)
      if (c.id !== w.userClubId && d.until <= seasonEnd) {
        const v = r5(slotBase(w, c.id, d.slot) * performance(w, c.id) * (0.92 + rng.next() * 0.16));
        Object.assign(d, { value: v, until: untilOf(`${endYear(w.season)}-${String((endYear(w.season) + 1) % 100).padStart(2, '0')}`, rng.int(2, 4)), name: rng.chance(0.7) ? d.name : sponsorName(d.slot, rng), kind: 'fixed', bonus: undefined, renewing: undefined });
      }
    }
  }
  return out;
}
