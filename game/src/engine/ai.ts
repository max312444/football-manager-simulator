// AI 경기 준비: 상대에 맞춘 포메이션 · 성향 · 압박 · 선발 추천
// 사용자에게는 "추천"으로 보여주고, AI 구단은 그대로 쓴다.
import type { Mentality, PlayerState, Pressing, Tactics, World } from './types';
import { FORMATIONS, isCustom, matchRules, pickLineup, type Lineup } from './squad';
import { overall, slotRating } from './ratings';

const ATTACKING = ['4-3-3', '4-2-3-1', '3-4-3', '4-4-2', '3-4-2-1'];
const BALANCED = Object.keys(FORMATIONS).filter((f) => !isCustom(f));
const DEFENSIVE = ['4-2-3-1', '4-1-4-1', '4-5-1', '5-3-2', '5-4-1', '4-4-1-1'];

/** 주전 11명 평균 능력 */
export function teamStrength(w: World, clubId: string): number {
  const top = w.clubs[clubId].squad.map((id) => w.players[id]).filter((p) => !p.injury && p.suspension === 0)
    .map(overall).sort((a, b) => b - a).slice(0, 11);
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
}

export interface Recommendation {
  tactics: Tactics;
  lineup: Lineup;
  /** 우리 - 상대 전력 차 (홈 이점 포함) */
  edge: number;
  reasons: string[];
}

function lineupScore(players: PlayerState[], lineup: Lineup): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  return lineup.starters.reduce((s, x) => s + slotRating(byId.get(x.id)!, x.slot), 0) / Math.max(1, lineup.starters.length);
}

/**
 * 상대에 맞춘 추천.
 * fixed: 사용자가 전술 화면에서 직접 고정한 선발이 있으면 그 포메이션과 선수는 존중한다.
 */
export function recommend(w: World, clubId: string, oppId: string, home: boolean): Recommendation {
  const club = w.clubs[clubId];
  const players = club.squad.map((id) => w.players[id]);
  const bench = matchRules(w.season).benchSize;
  const edge = teamStrength(w, clubId) - teamStrength(w, oppId) + (home ? 1.5 : -1.5);
  const reasons: string[] = [];

  let mentality: Mentality = 0, pressing: Pressing = 1, pool = BALANCED;
  if (edge >= 6) { mentality = 2; pressing = 2; pool = ATTACKING; reasons.push('전력에서 크게 앞섬 → 매우 공격적으로 몰아붙이기'); }
  else if (edge >= 3) { mentality = 1; pressing = 2; pool = ATTACKING; reasons.push('전력 우위 → 공격적 · 높은 압박'); }
  else if (edge > -3) { reasons.push('전력이 비슷함 → 균형 잡힌 운영'); }
  else if (edge > -7) { mentality = -1; pool = DEFENSIVE; reasons.push('상대가 더 강함 → 수비적으로 버티며 역습'); }
  else { mentality = -2; pressing = 0; pool = DEFENSIVE; reasons.push('상대가 훨씬 강함 → 매우 수비적 · 낮은 압박으로 체력 아끼기'); }

  // 사용자가 직접 고정한 선발이 있으면 그 포메이션 유지
  if (club.lineup?.starters.some(Boolean)) {
    const lineup = pickLineup(players, club.tactics.formation, bench, club.lineup.starters, club.lineup.bench);
    reasons.push(`직접 정한 선발 유지 (${lineup.formation})`);
    return { tactics: { formation: lineup.formation, mentality, pressing }, lineup, edge, reasons };
  }

  // 내가 만든 포메이션을 골라 두었으면 그 포메이션 유지 (선수만 자동으로)
  if (isCustom(club.tactics.formation) && FORMATIONS[club.tactics.formation]) {
    const lineup = pickLineup(players, club.tactics.formation, bench);
    reasons.push(`내 포메이션 유지 (${lineup.formation})`);
    return { tactics: { formation: lineup.formation, mentality, pressing }, lineup, edge, reasons };
  }

  // 후보 포메이션마다 실제 선발을 짜 보고 자리 적합 능력이 가장 높은 것을 고른다 (평소 포메이션은 약간 우대)
  let best: { lineup: Lineup; score: number } | null = null;
  for (const f of pool) {
    const lineup = pickLineup(players, f, bench);
    if (lineup.starters.length < 11) continue;
    const score = lineupScore(players, lineup) + (f === club.tactics.formation ? 0.6 : 0);
    if (!best || score > best.score) best = { lineup, score };
  }
  const lineup = best?.lineup ?? pickLineup(players, club.tactics.formation, bench);
  reasons.push(`선수단에 가장 잘 맞는 포메이션: ${lineup.formation}`);

  const tired = players.filter((p) => !p.injury && p.suspension === 0 && p.fitness < 80 && overall(p) >= 75).length;
  if (tired >= 2) reasons.push(`체력이 떨어진 주전 ${tired}명은 로테이션`);
  return { tactics: { formation: lineup.formation, mentality, pressing }, lineup, edge, reasons };
}
