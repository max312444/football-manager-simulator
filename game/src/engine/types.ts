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
  /** 경기 최우수 선수 횟수 */
  pom?: number;
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
  /** 데이터에 계약 정보가 없어 게임이 정한 계약 */
  contractGen?: boolean;
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
  loyalty: number;     // 충성도 0~100 (출전 시간에 따라 변함)
  benchStreak: number; // 뛸 수 있는데 연속으로 못 나간 경기 수
  unhappy?: boolean;   // 출전 시간 불만 알림을 보냈는지
  /** 호칭 판정용 시즌 행동 기록 */
  tlog?: import('./traits').TraitLog;
  /** 마지막 이적료 (먹튀 판정) */
  lastFee?: number;
  /** 전성기 능력 (하락세 판정) */
  peak?: number;
  /** 수상 경력 */
  honours?: { season: string; kind: import('./awards').AwardKind; league: string }[];
  /** 수상 효과: 남은 달 동안 모든 능력치 +amount */
  boost?: { amount: number; months: number };
  /** 게임 시작 전 실제 기록상 현 구단 연속 시즌 수 · 원클럽 여부 */
  seedClubSeasons?: number;
  seedOneClub?: boolean;

  stats: SeasonStats;
  /** 지난 시즌 기록 (시즌이 끝날 때 쌓임) */
  career: CareerEntry[];
  retired?: boolean;
}

export interface CareerEntry {
  season: string; club: string | null; apps: number; goals: number; assists: number; rating: number | null;
}

export interface ClubState {
  id: string;
  league: string;
  reputation: number;
  squad: string[];
  tactics: Tactics;
  finance: { balance: number; transferBudget: number; wageBudget: number };
  /** 사용자가 직접 정한 선발 (없으면 자동 선택). 자리 순서는 포메이션 자리 순서 */
  lineup?: { starters: (string | null)[]; bench: string[] } | null;
  /** 팬 수 */
  fans?: number;
  /** 내 구단 재정 장부 */
  ledger?: import('./finance').Ledger;
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
  /** 경기 최우수 선수 · 최악의 선수 (30분 이상 출전) */
  pom?: string;
  worst?: string;
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
  | { type: 'info'; date: string; text: string }
  | { type: 'transfer'; date: string; player: string; from: string | null; to: string; fee: number; user: boolean }
  | { type: 'offer'; date: string; player: string; from: string; fee: number }
  | { type: 'retire'; date: string; player: string; club: string | null; season: string };

/** 은퇴 소식 (내 구단 선수 · 스타 선수) */
export interface RetireNews { player: string; club: string | null; season: string; ovr: number; mine: boolean }

/** 영입 협상 진행 상황 (창을 닫았다 열어도 유지) */
export interface Talk { fee: number; wage: number; agreed?: number; until: string }

/** 사용자 선수에게 들어온 영입 제안 */
export interface TransferOffer {
  id: string;
  player: string;
  from: string;      // 제안한 구단
  fee: number;
  date: string;
  expires: string;
  /** 사는 구단이 낼 수 있는 최대 금액 (화면에 안 보임) */
  max?: number;
  /** 내가 역제안한 횟수 */
  tries?: number;
  /** 이적 명단에 없던 선수에게 온 제안 */
  unsolicited?: boolean;
}

export interface SeasonRecord {
  season: string;
  league: string;
  table: TableRow[];
  champion: string;
  topScorer: { player: string; club: string | null; goals: number } | null;
  awards?: import('./awards').Award[];
}

export const WORLD_VERSION = 2;

export interface World {
  version: typeof WORLD_VERSION;
  seed: number;
  rng: number;               // 난수 상태 (이어서 진행용)
  /** 지난 시즌 내 구단 리그 상금 */
  lastPrize?: number;
  /** 지난 시즌 말 사라진 내 선수 호칭 */
  lostTraits?: string[];
  /** 화면에 보여줄 내 구단 수상 (시즌 전환 때) */
  pendingAwards?: import('./awards').Award[];
  date: string;
  season: string;
  userClubId: string;
  players: Record<string, PlayerState>;
  clubs: Record<string, ClubState>;
  competitions: Record<string, Competition>;
  inbox: GameEvent[];
  warnings: string[];        // 데이터 문제 (중복 소속 등)
  history: SeasonRecord[];   // 지난 시즌 최종 순위
  /** 어느 데이터로 만든 세이브인지 (public: 패러디 이름, real: 실명). 없으면 옛 세이브 = real */
  dataset?: 'public' | 'real';
  /** 이적 명단에 올린 내 선수 */
  transferList?: string[];
  /** 내 선수에게 들어온 제안 */
  offers?: TransferOffer[];
  /** 관심 목록 */
  shortlist?: string[];
  /** 진행 중인 영입 협상 (선수 ID별) */
  talks?: Record<string, Talk>;
  /** 협상 결렬로 이 날짜까지 다시 협상 불가 (선수 ID별) */
  talkBan?: Record<string, string>;
  /** 화면에 보여줄 은퇴 소식 (시즌 전환 때) */
  pendingNews?: RetireNews[];
}
