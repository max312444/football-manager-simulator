// 국가대표: 대륙 연맹 · 대표 선발 · A매치 기간 차출
//
//  - 대표 선발: 그 국적 선수 중 능력 순으로 포지션 묶음별 인원 (23명: GK 3 · DF 8 · MF 8 · FW 4, 26명: 3 · 9 · 9 · 5)
//    게임에는 유럽 리그 선수만 있어서 인원이 모자라는 나라는 '국내파' 가상 선수로 채운다 (월드컵 동안만 있고 시즌이 바뀌면 지운다)
//  - A매치 기간 (9월 · 10월 · 11월 · 3월 리그 휴식 주말): 나라마다 상위 23명 차출 → 체력 소모 · 작은 부상 위험 · 경기 감각 +
import type { Position } from '../data/types';
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { posGroup } from '../data/rating';

export type Confed = 'UEFA' | 'AFC' | 'CAF' | 'CONMEBOL' | 'CONCACAF' | 'OFC';
// 나라 → 대륙 연맹 (nations.json 지역 기준 + 예외: 튀르키예 · 이스라엘 UEFA, 호주 AFC, 수리남 CONCACAF)
const CONFED_LIST: Record<Confed, string> = {
  UEFA: 'ENG SCO WAL NIR IRL NOR SWE DEN FIN ISL NED BEL LUX GER AUT SUI FRA ESP POR ITA GRE CYP MLT POL CZE SVK HUN ROU UKR RUS BLR LTU LVA EST GEO ARM AZE KAZ MDA CRO SRB SVN BIH MNE MKD ALB KVX BUL TUR ISR',
  AFC: 'IRN KSA UAE QAT OMA IRQ JOR SYR LBN UZB KOR JPN CHN PRK THA VIE IDN MAS PHI IND AUS',
  CAF: 'MAR ALG TUN EGY LBY SEN CIV GHA NGA CMR MLI GUI GNB BFA TOG BEN GAM SLE LBR CPV MTN GAB COD CGO EQG CTA ANG ZAM ZIM RSA MOZ KEN TAN UGA ETH MAD COM BDI',
  CONMEBOL: 'BRA ARG URU COL CHI PER ECU PAR VEN BOL',
  CONCACAF: 'SUR GUY MEX CRC PAN HON JAM BRB GRN ATG SKN TRI HAI CUW GLP MTQ BER CUB USA CAN',
  OFC: 'NZL',
};
const CONFED = new Map<string, Confed>();
for (const [c, list] of Object.entries(CONFED_LIST) as [Confed, string][]) for (const code of list.split(' ')) CONFED.set(code, c);
export const confedOf = (nation: string): Confed | null => CONFED.get(nation) ?? null;
export const ALL_NATIONS = [...CONFED.keys()];

const QUOTA: Record<number, Record<string, number>> = {
  23: { GK: 3, DF: 8, MF: 8, FW: 4 },
  26: { GK: 3, DF: 9, MF: 9, FW: 5 },
};

/** 국적 선수 (현역 · 소속 있음) 능력 순 */
export function nationPlayers(w: World, nation: string): PlayerState[] {
  return Object.values(w.players).filter((p) => p.nation === nation && !p.retired && p.clubId && !p.injury)
    .sort((a, b) => overall(b) - overall(a));
}

/** 대표 선발 (실제 선수만): 포지션 묶음별 인원, 모자라면 남은 자리를 능력 순으로 */
export function selectSquad(w: World, nation: string, size: 23 | 26 = 23): PlayerState[] {
  const quota = QUOTA[size];
  const ps = nationPlayers(w, nation);
  const pick: PlayerState[] = [];
  for (const [g, n] of Object.entries(quota)) pick.push(...ps.filter((p) => posGroup(p.pos) === g).slice(0, n));
  for (const p of ps) { if (pick.length >= size) break; if (!pick.includes(p)) pick.push(p); }
  return pick.slice(0, size);
}

/** 대표팀 전력: 상위 11명 평균 (모자란 자리는 '국내파' 수준으로) */
export function nationStrength(w: World, nation: string): number {
  const top = nationPlayers(w, nation).slice(0, 11).map(overall);
  const filler = fillerLevel(top);
  while (top.length < 11) top.push(filler);
  return top.reduce((a, b) => a + b, 0) / 11;
}
/** '국내파' 가상 선수 능력: 유럽 리그 선수가 많지 않은 나라는 대체로 그보다 낮은 수준 */
export const fillerLevel = (top: number[]) => (top.length ? Math.max(52, Math.min(70, top.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, top.length) - 12)) : 55);

/** 모자란 포지션 묶음 (가상 선수를 채울 때) */
export function missingSlots(squad: PlayerState[], size: 23 | 26): Position[] {
  const quota = QUOTA[size];
  const out: Position[] = [];
  const POS: Record<string, Position[]> = { GK: ['GK'], DF: ['CB', 'LB', 'RB', 'CB'], MF: ['DM', 'CM', 'AM', 'CM'], FW: ['ST', 'LW', 'RW'] };
  for (const [g, n] of Object.entries(quota)) {
    const have = squad.filter((p) => posGroup(p.pos) === g).length;
    for (let i = have; i < n; i++) out.push(POS[g][i % POS[g].length]);
  }
  return out.slice(0, Math.max(0, size - squad.length));
}

/** A매치 기간 (리그가 쉬는 토요일): 9월 둘째 · 10월 둘째 · 11월 셋째 · 3월 넷째 토요일 */
export function intlBreaks(season: string): string[] {
  const y = +season.slice(0, 4);
  const sat = (yy: number, m: number, n: number) => {
    const first = new Date(Date.UTC(yy, m - 1, 1));
    return new Date(first.getTime() + (((6 - first.getUTCDay() + 7) % 7) + 7 * (n - 1)) * 86400000).toISOString().slice(0, 10);
  };
  return [sat(y, 9, 2), sat(y, 10, 2), sat(y, 11, 3), sat(y + 1, 3, 4)];
}

/**
 * A매치 기간 차출 (그날 하루): 나라마다 상위 23명. 체력 −10 ~ −25 (경기 · 이동), 부상 1.5%, 경기 감각 +6.
 * 내 구단 선수가 뽑히면 받은편지함 소식
 */
export function intlBreakDay(w: World, rng: Rng): GameEvent[] {
  if (!intlBreaks(w.season).includes(w.date)) return [];
  const events: GameEvent[] = [];
  const mine: string[] = [], hurt: string[] = [];
  const nations = new Set(Object.values(w.players).filter((p) => p.clubId && !p.retired).map((p) => p.nation));
  for (const nation of nations) {
    for (const p of selectSquad(w, nation, 23)) {
      p.fitness = Math.max(40, p.fitness - rng.int(10, 25));
      p.sharpness = Math.min(100, p.sharpness + 6);
      if (rng.chance(0.015 * (0.6 + p.hidden.injuryProne / 20))) {
        const days = rng.int(5, 30);
        p.injury = { days, label: '대표팀 경기 중 부상' };
        if (p.clubId === w.userClubId) { hurt.push(p.id); events.push({ type: 'injury', date: w.date, player: p.id, club: p.clubId, days, label: '대표팀 경기 중 부상' }); }
      }
      if (p.clubId === w.userClubId) mine.push(p.id);
    }
  }
  if (mine.length) events.push({ type: 'callup', date: w.date, players: mine, injured: hurt });
  return events;
}
