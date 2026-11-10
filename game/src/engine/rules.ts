// 재정 규정 (샐러리 캡): 리그 · 시대별 실제 규정을 단순화해서 적용. AI · 사용자 같은 규칙
//
// 선수단 비용 = 연 주급 총액 + 이적료 상각 (이적료 ÷ 계약 연수). 한도 안에서만 영입 · 재계약할 수 있다
//  - 비율 규정: 한도 = (매출 + 이번 시즌 선수 판매 수입) × 비율
//  - 손실 한도 규정: 한도 = (매출 + 판매 수입) × (1 − 운영비 비율) + 1년 허용 손실 (3년 한도 ÷ 3)
//  - 규정이 없는 시대: 기본 샐러리 캡 — 선수단 비용 매출의 70%
//  - 유럽 대회에 나가는 구단은 UEFA 규정도 지켜야 해서 둘 중 엄격한 쪽
//  - 프랑스 DNCG: 리그 전체 한도는 없고 (기본 캡), 잔고가 마이너스인 구단은 주급 총액을 늘리는 영입 금지 (급여 통제)
//
// 확인한 실제 규정 (2026-11 조사)
//  UEFA: 2011-12 ~ 2021-22 손익 균형 (3년 허용 손실 €5M → 2013-15 €45M → 이후 €30M), 2022-23 전환,
//        선수단 비용 비율 2023-24 90% · 2024-25 80% · 2025-26~ 70%
//  잉글랜드 1부: 2013-14 ~ 2025-26 PSR (3년 손실 £105M ≈ €120M), 2026-27~ 선수단 비용 비율 85% (상하 연동 캡은 부결)
//  잉글랜드 2부: 2016-17~ P&S (3년 손실 £39M ≈ €45M)
//  스페인 1 · 2부: 2013-14~ 선수단 비용 한도 LCPD (매출 − 고정비 − 부채 기준, 리그가 구단별로 정함) → 매출의 70% − 부채 상환분으로 단순화
//  이탈리아 1 · 2부: 2025-26~ 인건비 비율 70% (그 전 유동성 지수는 영입 한도가 아니라 기본 캡)
//  독일 1 · 2부: 2027-28~ 선수단 비용 규정 70% (그 전에는 리그 한도 없음)
//  프랑스 1 · 2부: 리그 한도 없음 · DNCG 개별 통제
import type { ClubState, PlayerState, World } from './types';
import { SHARE, TRAINING_COST, clubRevenue, wageBillOf } from './finance';
import { nationOf } from './pyramid';

export interface CostRule {
  /** 화면 표시 이름 */
  name: string;
  kind: 'ratio' | 'loss';
  /** 비율 규정: 매출 대비 비율 */
  ratio?: number;
  /** 손실 한도 규정: 1년 허용 손실 (유로) */
  loss?: number;
  /** 잔고 마이너스면 주급 총액 증가 금지 (DNCG) */
  dncg?: boolean;
  /** 부채가 있으면 한도에서 뺌 (LCPD) */
  debt?: boolean;
}

const y0 = (season: string) => +season.slice(0, 4);
export const DEFAULT_CAP = 0.7;
const DEFAULT: CostRule = { name: '기본 샐러리 캡 (매출의 70%)', kind: 'ratio', ratio: DEFAULT_CAP };

/** 리그 규정 */
export function leagueRule(league: string, season: string): CostRule {
  const y = y0(season);
  const nation = nationOf(league);
  const second = /2$/.test(league);
  switch (nation) {
    case 'ENG':
      if (!second) {
        if (y >= 2026) return { name: '프리미어리그 선수단 비용 비율 85%', kind: 'ratio', ratio: 0.85 };
        if (y >= 2013) return { name: '프리미어리그 PSR (3년 손실 £105M)', kind: 'loss', loss: 40e6 };
        return DEFAULT;
      }
      return y >= 2016 ? { name: '챔피언십 P&S (3년 손실 £39M)', kind: 'loss', loss: 15e6 } : DEFAULT;
    case 'ESP':
      return y >= 2013 ? { name: '라리가 선수단 비용 한도 (LCPD)', kind: 'ratio', ratio: 0.7, debt: true } : DEFAULT;
    case 'ITA':
      return y >= 2025 ? { name: '이탈리아 인건비 비율 70%', kind: 'ratio', ratio: 0.7 } : DEFAULT;
    case 'GER':
      return y >= 2027 ? { name: '독일 선수단 비용 규정 70%', kind: 'ratio', ratio: 0.7 } : DEFAULT;
    case 'FRA':
      return { ...DEFAULT, name: '기본 샐러리 캡 (매출의 70%) · DNCG 통제', dncg: true };
    default:
      return DEFAULT;
  }
}

/** UEFA 규정 (유럽 대회 출전 시즌) */
export function uefaRule(season: string): CostRule | null {
  const y = y0(season);
  if (y >= 2025) return { name: 'UEFA 선수단 비용 비율 70%', kind: 'ratio', ratio: 0.7 };
  if (y === 2024) return { name: 'UEFA 선수단 비용 비율 80%', kind: 'ratio', ratio: 0.8 };
  if (y === 2023) return { name: 'UEFA 선수단 비용 비율 90%', kind: 'ratio', ratio: 0.9 };
  if (y >= 2013) return { name: 'UEFA 재정적 페어플레이 (3년 손실 €30M)', kind: 'loss', loss: 10e6 };
  if (y >= 2011) return { name: 'UEFA 재정적 페어플레이 (3년 손실 €5M)', kind: 'loss', loss: 1.7e6 };
  return null;
}

const inEurope = (w: World, clubId: string) => Object.values(w.europe ?? {}).some((c) => c.entrants.includes(clubId));

/** 규정에 따른 연 선수단 비용 한도 */
function limitOf(w: World, c: ClubState, r: CostRule): number {
  const base = clubRevenue(w, c.id) + Math.max(0, c.sales ?? 0);
  // 손실 한도 규정: 매출 − 운영비 − 보통 강도 훈련비 + 허용 손실
  let lim = r.kind === 'ratio' ? base * (r.ratio ?? DEFAULT_CAP) : base * (1 - SHARE.operations - TRAINING_COST[1] * 10) + (r.loss ?? 0);
  if (r.debt && c.finance.balance < 0) lim += c.finance.balance / 3;   // 부채를 3년에 걸쳐 갚는 만큼 줄어든다
  return Math.max(0, Math.round(lim));
}

/** 이 구단에 지금 적용되는 규정 (리그 · UEFA 중 엄격한 쪽)과 한도 */
export function costLimit(w: World, clubId: string): { rule: CostRule; limit: number } {
  const c = w.clubs[clubId];
  const lr = leagueRule(c.league, w.season);
  let best = { rule: lr, limit: limitOf(w, c, lr) };
  const u = inEurope(w, clubId) ? uefaRule(w.season) : null;
  if (u) { const l = limitOf(w, c, u); if (l < best.limit) best = { rule: { ...u, dncg: lr.dncg }, limit: l }; }
  return best;
}

/** 선수 이적료 상각 (연) */
export const amortOf = (w: World, p: PlayerState) => (p.amort && (!p.amortEnd || w.date <= p.amortEnd) ? p.amort : 0);
/** 지금 선수단 비용 (연): 주급 × 52 + 이적료 상각 */
export function squadCost(w: World, clubId: string): number {
  const c = w.clubs[clubId];
  return wageBillOf(w, clubId) * 52 + c.squad.reduce((s, id) => s + amortOf(w, w.players[id]), 0);
}

/**
 * 영입 · 재계약이 규정 안인지. addWage = 늘어나는 주급 (주), fee = 이적료, years = 계약 연수
 * (재계약은 addWage = 새 주급 − 지금 주급, fee 0)
 */
export function withinRules(w: World, clubId: string, addWage: number, fee = 0, years = 1): { ok: boolean; reason?: string; room: number } {
  const { rule, limit } = costLimit(w, clubId);
  const add = addWage * 52 + (fee > 0 ? fee / Math.max(1, years) : 0);
  const room = limit - squadCost(w, clubId);
  if (rule.dncg && w.clubs[clubId].finance.balance < 0 && addWage > 0)
    return { ok: false, room, reason: 'DNCG 급여 통제 — 잔고가 마이너스라 주급 총액을 늘릴 수 없습니다' };
  if (add > room) return { ok: false, room, reason: `${rule.name} 초과 — 남은 선수단 비용 여유 연 €${Math.max(0, room / 1e6).toFixed(1)}M` };
  return { ok: true, room };
}

/** 주급으로 환산한 남은 여유 (주) — 이적료 상각 없이 주급만 더할 때 */
export const ruleWageRoom = (w: World, clubId: string) => Math.floor(withinRules(w, clubId, 0).room / 52);
