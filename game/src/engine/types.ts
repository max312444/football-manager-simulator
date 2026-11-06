// 엔진 상태 타입. 월드(World) = 세이브 하나에 들어가는 게임 세계 전체.
import type { AttrKey, Position } from '../data/types';

export type Side = 'home' | 'away';
export type Mentality = -2 | -1 | 0 | 1 | 2;   // 매우 수비 ~ 매우 공격
export type Pressing = 0 | 1 | 2;              // 낮음 · 보통 · 높음

export interface Tactics {
  formation: string;
  mentality: Mentality;
  pressing: Pressing;
}

/** 숨은 속성 (1~20). 게임이 생성한 값 — 출처 데이터가 아님 */
export interface Hidden {
  consistency: number;     // 꾸준함
  bigMatch: number;        // 큰 경기 강도
  professionalism: number; // 프로의식
  injuryProne: number;     // 부상 경향 (높을수록 잘 다침)
  adaptability: number;    // 적응력
  ambition: number;        // 야망
  temperament: number;     // 기질 (높을수록 침착)
  loyalty: number;         // 충성도
}

export interface SeasonStats {
  apps: number; subApps: number; goals: number; assists: number;
  yellow: number; red: number; cleanSheets: number; ratingSum: number;
}

export interface PlayerState {
  id: string;
  name: string;
  birth: string;
  nation: string;
  pos: Position;
  number: number | null;
  clubId: string | null;
  /** 그 시즌 실제 능력치 (기준선) */
  base: Partial<Record<AttrKey, number>>;
  /** 게임 속 육성 보정치 (시즌이 바뀌어도 유지) */
  growth: Partial<Record<AttrKey, number>>;
  wage: number;
  contract: string | null;
  hidden: Hidden;
  traits: string[];

  // 컨디션
  fitness: number;     // 체력 0~100
  condition: number;   // 몸 상태 -1(최악) ~ +1(최상)
  morale: number;      // 사기 0~100
  sharpness: number;   // 경기 감각 0~100
  recentRatings: number[]; // 최근 5경기 평점 (폼)
  injury: { days: number; label: string } | null;
  suspension: number;  // 남은 출장 정지 경기 수
  yellowCount: number; // 누적 경고 (리그)

  stats: SeasonStats;
}

export interface ClubState {
  id: string;
  league: string;
  reputation: number;
  squad: string[];
  tactics: Tactics;
  finance: { balance: number; transferBudget: number; wageBudget: number };
}

export interface Fixture {
  id: string;
  league: string;
  round: number;
  date: string;          // YYYY-MM-DD
  home: string;
  away: string;
  result?: MatchSummary;
}

export interface MatchSummary {
  homeGoals: number;
  awayGoals: number;
  goals: { minute: number; side: Side; scorer: string; assist?: string }[];
  cards: { minute: number; side: Side; player: string; red: boolean }[];
  injuries: { minute: number; side: Side; player: string }[];
  stats: Record<Side, { shots: number; onTarget: number; xg: number; possession: number }>;
  ratings: Record<string, number>;
}

export interface TableRow {
  club: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number;
  form: ('W' | 'D' | 'L')[];
}

export interface Competition {
  id: string;
  season: string;
  fixtures: Fixture[];
  table: Record<string, TableRow>;
}

export type GameEvent =
  | { type: 'match'; date: string; fixtureId: string; league: string; home: string; away: string; score: [number, number]; user: boolean }
  | { type: 'injury'; date: string; player: string; club: string; days: number; label: string }
  | { type: 'seasonEnd'; date: string; league: string; champion: string }
  | { type: 'info'; date: string; text: string };

export interface World {
  version: 1;
  seed: number;
  rng: number;               // 난수 상태 (이어서 진행용)
  date: string;
  season: string;
  userClubId: string;
  players: Record<string, PlayerState>;
  clubs: Record<string, ClubState>;
  competitions: Record<string, Competition>;
  inbox: GameEvent[];
  warnings: string[];        // 데이터 문제 (중복 소속 등)
}
