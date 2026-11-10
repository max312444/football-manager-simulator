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
  /** 이적료 상각 (연, 유로) = 이적료 ÷ 계약 연수. 계약이 끝나거나 떠나면 없어짐 */
  amort?: number;
  /** 상각이 끝나는 날 (처음 계약 만료일) */
  amortEnd?: string;
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
  /** 이번 시즌 컵 대회 기록 (리그 기록과 따로) */
  cupStats?: { apps: number; goals: number; assists: number };
  /** 월드컵 기록 (대회가 있는 시즌) */
  intlStats?: { apps: number; goals: number; assists: number };
  /** 지난 시즌 기록 (시즌이 끝날 때 쌓임) */
  career: CareerEntry[];
  retired?: boolean;
  /** 게임이 만든 선수 (유스 · 신규) */
  generated?: boolean;
  /** 지난달 훈련 성장 크기 (화면의 성장 추세 표시) */
  dev?: number;
  /** 잠재력 (숨은 값, 게임이 만든 선수만): 25세 무렵 이 종합 능력에 닿도록 성장 */
  potential?: number;
  /** 이름을 가져온 선수 [이름, 성] (한국어 이름 만들기용) */
  nameFrom?: [string | null, string | null];
  /** 게임이 만든 선수의 한국어 이름 */
  ko?: string;
  /** 언론 플레이 (연봉 인상 요구 · 이적 요청 → 태업), saga.ts */
  saga?: import('./saga').Saga;
  /** 논란 횟수 · 마지막 논란 (scandal.ts) */
  scandals?: number;
  lastScandal?: { kind: import('./scandal').ScandalKind; date: string };
}

export interface CareerEntry {
  season: string; club: string | null; apps: number; goals: number; assists: number; rating: number | null;
  cupApps?: number; cupGoals?: number;
}

export interface ClubState {
  id: string;
  league: string;
  reputation: number;
  squad: string[];
  tactics: Tactics;
  /** revenue = 연 매출 기준값 (데이터 · 시즌 시작 때 정함). 모든 구단이 이 매출로 수입 · 지출이 생긴다 */
  finance: { balance: number; transferBudget: number; wageBudget: number; revenue?: number };
  /** 사용자가 직접 정한 선발 (없으면 자동 선택). 자리 순서는 포메이션 자리 순서 */
  lineup?: { starters: (string | null)[]; bench: string[] } | null;
  /** 팬 수 */
  fans?: number;
  /** 내 구단 재정 장부 */
  ledger?: import('./finance').Ledger;
  /** 훈련 설정 (없으면 균형 · 보통) */
  training?: import('./training').Training;
  /** 이번 시즌 선수 판매 수입 (재정 규정 한도에 더해짐, 시즌마다 초기화) */
  sales?: number;
  /** 시설 수준 1~5 (훈련장 · 유스) · 경기장 수용 인원 (데이터, 시즌마다 갱신) */
  facilities?: { training: number; youth: number };
  /** 시설 공사 중 · 투자로 올린 단계 (다음 시즌 데이터보다 낮아지지 않음) */
  building?: { kind: 'training' | 'youth'; level: number; done: string; cost: number }[];
  built?: { training?: number; youth?: number };
  stadium?: number;
}

export interface Fixture {
  id: string;
  league: string;
  round: number;
  date: string;          // YYYY-MM-DD
  home: string;
  away: string;
  result?: MatchSummary;
  /** 플레이오프 · 컵 경기 (순위표에 넣지 않음). 컵 경기는 league 가 컵 ID */
  stage?: 'semi' | 'final' | 'ladder' | 'barrage' | 'cup' | 'euro' | 'intl';
  /** 유럽 대회 조별리그 조 이름 */
  group?: string;
  /** 컵 라운드 이름 (예: "16강") */
  name?: string;
  /** 2경기 합산 대결의 몇 차전 */
  leg?: number;
}

export interface MatchSummary {
  homeGoals: number;
  awayGoals: number;
  /** 승부차기 승자 (플레이오프) */
  pens?: Side;
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
  /** 2부 리그 승격 · 승강 플레이오프 진행 */
  playoff?: import('./pyramid').PlayoffState;
}

export type GameEvent =
  | { type: 'match'; date: string; fixtureId: string; league: string; home: string; away: string; score: [number, number]; user: boolean }
  | { type: 'injury'; date: string; player: string; club: string; days: number; label: string }
  | { type: 'seasonEnd'; date: string; league: string; champion: string }
  | { type: 'info'; date: string; text: string }
  /** 감독: 제안 · 재계약 · 경질 · 이동 · 따라오는 선수 */
  /** 선수 언론 플레이: 시작 · 커짐 · 해결 */
  | { type: 'saga'; date: string; player: string; kind: import('./saga').SagaKind; stage: number; step: 'start' | 'escalate' | 'resolved' | 'forced' | 'wantsUs'; target?: string; from?: string; fee?: number }
  /** 선수 논란 (게임이 만든 가벼운 논란) */
  | { type: 'scandal'; date: string; player: string; kind: import('./scandal').ScandalKind; other?: string }
  /** 기자회견 열림 */
  | { type: 'press'; date: string; kind: 'pre' | 'post' | 'free'; opp?: string }
  /** 이사회 이벤트 (선택지) · 구단주 교체 */
  | { type: 'board'; date: string; kind: import('./boardEvents').BoardEventKind | 'ownerRich' | 'ownerCut'; player?: string }
  | { type: 'manager'; date: string; kind: 'offer' | 'renew' | 'norenew' | 'renewed' | 'sacked' | 'expired' | 'moved' | 'follow' | 'followDone' | 'followFail'; club: string; from?: string; years?: number; players?: string[]; fee?: number }
  | { type: 'transfer'; date: string; player: string; from: string | null; to: string; fee: number; user: boolean }
  | { type: 'offer'; date: string; player: string; from: string; fee: number }
  | { type: 'retire'; date: string; player: string; club: string | null; season: string }
  | { type: 'contract'; date: string; players: string[]; until: string }
  | { type: 'renewed'; date: string; players: string[] }
  | { type: 'leave'; date: string; player: string; club?: string }
  | { type: 'cup'; date: string; cup: string; club: string; round: string; result: 'through' | 'out' | 'champion'; prize?: number }
  | { type: 'youth'; date: string; players: string[]; star?: string }
  | { type: 'callup'; date: string; players: string[]; injured: string[] }
  | { type: 'worldcup'; date: string; year: number; result: 'start' | 'champion'; nation: string; players?: string[]; text?: string; scorer?: string };

/** 은퇴 소식 (내 구단 선수 · 스타 선수) */
export interface RetireNews { player: string; club: string | null; season: string; ovr: number; mine: boolean; /** leave = 계약 만료로 팀을 떠남 (없으면 은퇴) */ kind?: 'retire' | 'leave' }

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
  /** 국내 컵 대회 (이번 시즌) */
  cups?: Record<string, import('./cup').Cup>;
  /** 유럽 대회 (챔피언스리그 · 유로파리그, 이번 시즌) */
  europe?: Record<string, import('./europe').EuroComp>;
  /** 월드컵 (이번 시즌 끝에 열리면) */
  worldCup?: import('./worldcup').WorldCupState;
  /** 지난 월드컵 기록 */
  worldCupHistory?: import('./worldcup').WorldCupRecord[];
  /** 지난 컵 대회 우승 기록 */
  cupHistory?: import('./cup').CupRecord[];
  /** 이번 시즌 내 구단 컵 우승 (시즌 말 수상 연출에 합침) */
  cupAwards?: import('./awards').Award[];
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
  /** 재계약 요청 팝업에 띄울 내 선수 (불만이 있거나 주급 예산이 모자라 자동 재계약이 안 된 선수) */
  pendingRenewals?: { player: string; reason: string }[];
  /** 화면에 보여줄 은퇴 소식 (시즌 전환 때) */
  pendingNews?: RetireNews[];
  /** 감독 (사용자): 계약 · 이사회 신뢰도 · 제안 · 경력 */
  manager?: import('./manager').ManagerState;
  /** 완전 랜덤으로 시작한 첫 시즌 보정 (이 시즌에만: 이적 예산 +10% · 주급 예산 +5% · 재정 규정 한도 +5%) */
  randomBonus?: { season: string };
  /** 대응을 기다리는 선수 사가 (선수 ID) */
  sagaPrompt?: string;
  /** 대응을 기다리는 선수 논란 · 마지막 논란 날짜 */
  scandalPrompt?: import('./scandal').Scandal;
  lastScandal?: string;
}
