// 원본 데이터(data/) 파일 형식. 데이터 가이드(data/DATA_GUIDE.md)와 같은 구조.

export type Position =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export type AttrKey =
  | 'sho' | 'pas' | 'dri' | 'tac' | 'pos' | 'aer' | 'pac' | 'sta' | 'str' | 'vis' | 'com' | 'ldr'
  | 'ref' | 'han' | 'one';

export interface SquadPlayer {
  id: string;
  name: string;
  birth: string;
  nation: string;
  height: number | null;
  foot: 'L' | 'R' | 'B' | null;
  number: number | null;
  pos: Position;
  attrs: Partial<Record<AttrKey, number>>;
  wage: number;
  contract: string | null;
  loan?: { from: string } | string;
  traits?: string[];
}

export interface ClubSeasonFile {
  season: string;
  club: string;
  league: string;
  reputation: number;
  finance: { balance: number; transferBudget: number; wageBudget: number };
  facilities: { training: number; youth: number };
  stadiumCapacity: number | null;
  formation: string;
  squad: SquadPlayer[];
}

export interface Kit { primary: string; secondary: string; pattern: string }

export interface ClubMaster {
  id: string;
  name: string;
  ko?: string;
  short: string;
  nation: string;
  city?: string;
  founded?: number;
  kits?: { home: Kit; away?: Kit };
  rivals?: string[];
  /** 엠블럼 디자인 (publish 단계에서 넣음) */
  crest?: import('../ui/crests/types').CrestStyle;
}

export interface LeagueSeasonFile { season: string; league: string; clubs: string[] }

export interface LeagueMeta { id: string; ko: string; en: string; nation: string; level: number; tier: 'A' | 'B' | 'C' }
export interface NationMeta { code: string; ko: string; en: string; region: string }
export interface LocaleName { name: string; short?: string }
