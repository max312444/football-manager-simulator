// 시즌 수상: 리그 우승 · 득점왕 · 도움왕 · 시즌 MVP · 영플레이어 · 골든글러브
// 보상: 구단(팬 증가 · 우승 보너스), 선수(사기 · 충성도 · 몇 달 동안 능력치 상승 · 수상 경력)
import type { PlayerState, World } from './types';
import { sortTable } from './standings';
import { book, clubRevenue } from './finance';

export type AwardKind = 'champion' | 'mvp' | 'boot' | 'assist' | 'young' | 'glove' | 'cup' | 'euro';
/** 우승 트로피 (리그 · 컵 · 유럽) */
export const isTrophy = (k: AwardKind) => k === 'champion' || k === 'cup' || k === 'euro';
export const AWARD_KO: Record<AwardKind, string> = {
  champion: '리그 우승', cup: '컵 우승', euro: '유럽 대회 우승', mvp: '시즌 MVP', boot: '득점왕', assist: '도움왕', young: '올해의 영플레이어', glove: '골든글러브',
};
export interface Award {
  kind: AwardKind;
  season: string;
  league: string;
  club: string;
  player?: string;
  /** 기록 (예: "27골") */
  value: string;
  /** 받은 보상 (화면 표시용) */
  rewards: string[];
}

/** 구단 기본 팬 수 (명성 기준) */
export const baseFans = (reputation: number) => Math.round((1e6 * 1.12 ** (reputation - 70)) / 1000) * 1000;
export function fansOf(w: World, clubId: string): number {
  const c = w.clubs[clubId];
  c.fans ??= baseFans(c.reputation);
  return c.fans;
}
/** 팬 규모가 수입에 주는 배수 (기본 팬 대비, 0.7~1.6) */
export const fanFactor = (w: World, clubId: string) => Math.max(0.7, Math.min(1.6, Math.sqrt(fansOf(w, clubId) / baseFans(w.clubs[clubId].reputation))));
export function addFans(w: World, clubId: string, ratio: number) {
  w.clubs[clubId].fans = Math.round(fansOf(w, clubId) * ratio);
}

const apps = (p: PlayerState) => p.stats.apps + p.stats.subApps;
const avg = (p: PlayerState) => (apps(p) ? p.stats.ratingSum / apps(p) : 0);
const score = (p: PlayerState) => avg(p) + 0.04 * (p.stats.pom ?? 0) + 0.015 * (p.stats.goals + p.stats.assists);
const ageAt = (birth: string, date: string) => Math.floor((Date.parse(date) - Date.parse(birth)) / (365.25 * 86400000));
const best = (ps: PlayerState[], f: (p: PlayerState) => number) => ps.reduce<PlayerState | null>((b, p) => (!b || f(p) > f(b) ? p : b), null);

/** 시즌 말 수상 결정 + 보상 적용. 내 구단 수상은 w.pendingAwards 에 넣어 화면 연출 */
export function seasonAwards(w: World): Award[] {
  const out: Award[] = [];
  for (const comp of Object.values(w.competitions)) {
    const table = sortTable(comp.table);
    if (!table.length) continue;
    const ps = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId]?.league === comp.id && !p.retired);
    const regular = ps.filter((p) => apps(p) >= 20);
    const add = (kind: AwardKind, club: string, value: string, player?: PlayerState) => out.push({ kind, season: w.season, league: comp.id, club, value, rewards: [], ...(player ? { player: player.id } : {}) });

    const champ = table[0];
    add('champion', champ.club, `승점 ${champ.pts} · ${champ.w}승 ${champ.d}무 ${champ.l}패`);
    const boot = best(ps, (p) => p.stats.goals * 100 - apps(p));
    if (boot && boot.stats.goals > 0) add('boot', boot.clubId!, `${boot.stats.goals}골`, boot);
    const ast = best(ps, (p) => p.stats.assists * 100 - apps(p));
    if (ast && ast.stats.assists > 0) add('assist', ast.clubId!, `${ast.stats.assists}도움`, ast);
    const mvp = best(regular, score);
    if (mvp) add('mvp', mvp.clubId!, `평점 ${avg(mvp).toFixed(2)} · POM ${mvp.stats.pom ?? 0}회`, mvp);
    const young = best(regular.filter((p) => ageAt(p.birth, w.date) <= 23 && p.id !== mvp?.id), score);
    if (young) add('young', young.clubId!, `${ageAt(young.birth, w.date)}세 · 평점 ${avg(young).toFixed(2)}`, young);
    const glove = best(regular.filter((p) => p.pos === 'GK'), (p) => p.stats.cleanSheets * 100 + avg(p));
    if (glove && glove.stats.cleanSheets > 0) add('glove', glove.clubId!, `무실점 ${glove.stats.cleanSheets}경기`, glove);
  }

  // 보상
  for (const a of out) {
    if (a.kind === 'champion') {
      const before = fansOf(w, a.club);
      addFans(w, a.club, 1.08);
      a.rewards.push(`팬 +${Math.round((fansOf(w, a.club) - before) / 1000).toLocaleString()}천 명`);
      // 우승 보너스 (모든 구단): 매출의 8%
      const bonus = Math.round(clubRevenue(w, a.club) * 0.08);
      book(w, a.club, 'prize', bonus);
      a.rewards.push(`우승 보너스 €${(bonus / 1e6).toFixed(1)}M`);
      // 우승 멤버: 사기 · 충성도 · 수상 경력
      for (const id of w.clubs[a.club].squad) {
        const p = w.players[id];
        if (apps(p) < 10) continue;
        p.morale = Math.min(100, p.morale + 10);
        p.loyalty = Math.min(100, p.loyalty + 5);
        (p.honours ??= []).push({ season: a.season, kind: 'champion', league: a.league });
      }
      a.rewards.push('우승 멤버 사기 · 충성도 상승');
    } else if (a.player) {
      const p = w.players[a.player];
      const amount = a.kind === 'mvp' ? 2 : 1;
      p.morale = Math.min(100, p.morale + 15);
      p.loyalty = Math.min(100, p.loyalty + 8);
      p.boost = { amount: Math.max(amount, p.boost?.amount ?? 0), months: 5 };
      (p.honours ??= []).push({ season: a.season, kind: a.kind, league: a.league });
      addFans(w, a.club, 1.02);
      a.rewards.push(`능력치 +${amount} (다음 시즌 초반 몇 달)`, '사기 · 충성도 상승', '구단 팬 +2%');
    }
  }
  w.pendingAwards = [...out.filter((a) => a.club === w.userClubId), ...(w.cupAwards ?? [])];
  w.cupAwards = [];
  return out;
}

/** 매달 1일: 수상 효과 기간 줄이기 */
export function boostMonth(w: World) {
  if (w.date.slice(8) !== '01') return;
  for (const p of Object.values(w.players)) {
    if (!p.boost) continue;
    p.boost.months--;
    if (p.boost.months <= 0) p.boost = undefined;
  }
}

/** 경기 결과로 팬 증감 (승 +0.4%, 패 −0.2%) */
export function matchFans(w: World, home: string, away: string, hg: number, ag: number) {
  const d = Math.sign(hg - ag);
  addFans(w, home, d > 0 ? 1.004 : d < 0 ? 0.998 : 1.0005);
  addFans(w, away, d < 0 ? 1.004 : d > 0 ? 0.998 : 1.0005);
}
