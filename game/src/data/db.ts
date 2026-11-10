// 원본 데이터 불러오기. 작은 메타 파일은 바로, 시즌 파일은 필요할 때만 읽는다.
//
// 데이터는 두 가지
//  - public: data-public/ (패러디 이름 · 가상 리그 이름, 저장소에 포함) — 기본
//  - real:   data/        (실명, 각자 파이프라인으로 만든 내 PC의 데이터) — 있을 때만 설정에서 선택 가능
import type {
  ClubMaster, ClubSeasonFile, CupMeta, LeagueMeta, LeagueSeasonFile, LocaleName, NationMeta,
} from './types';
import type { PlayerHistory } from '../engine/traits';

type Meta<T> = Record<string, T>;
const SETS = {
  public: {
    meta: import.meta.glob<unknown>('@pub/meta/*.json', { eager: true, import: 'default' }) as Meta<unknown>,
    clubs: import.meta.glob<ClubMaster>('@pub/clubs/*.json', { eager: true, import: 'default' }),
    ko: import.meta.glob<Record<string, LocaleName>>('@pub/locale/ko/players*.json', { eager: true, import: 'default' }),
    seasons: import.meta.glob<ClubSeasonFile | LeagueSeasonFile>('@pub/seasons/*/*/*.json', { import: 'default' }),
    history: import.meta.glob<PlayerHistory>('@pub/history/players.json', { import: 'default' }),
  },
  real: {
    meta: import.meta.glob<unknown>('@data/meta/*.json', { eager: true, import: 'default' }) as Meta<unknown>,
    clubs: import.meta.glob<ClubMaster>('@data/clubs/*.json', { eager: true, import: 'default' }),
    ko: import.meta.glob<Record<string, LocaleName>>('@data/locale/ko/players*.json', { eager: true, import: 'default' }),
    seasons: import.meta.glob<ClubSeasonFile | LeagueSeasonFile>('@data/seasons/*/*/*.json', { import: 'default' }),
    history: import.meta.glob<PlayerHistory>('@data/history/players.json', { import: 'default' }),
  },
};

export type Dataset = keyof typeof SETS;
const KEY = 'pitchboss.dataset';
/** 실명 데이터가 이 PC에 있는지 (시즌 파일이 하나라도 있으면) */
export const realAvailable = Object.keys(SETS.real.seasons).length > 0;
export const dataset: Dataset = (() => {
  try { return realAvailable && localStorage.getItem(KEY) === 'real' ? 'real' : 'public'; } catch { return 'public'; }
})();
/** 데이터 바꾸기: 다시 불러와야 적용된다 */
export function setDataset(d: Dataset) {
  try { localStorage.setItem(KEY, d); } catch { /* 무시 */ }
  location.reload();
}

const S = SETS[dataset];
const metaFile = <T,>(name: string): T => Object.entries(S.meta).find(([p]) => p.endsWith(`/meta/${name}.json`))![1] as T;

export const leagues: LeagueMeta[] = metaFile<{ leagues: LeagueMeta[] }>('leagues').leagues;
export const cups: CupMeta[] = metaFile<{ cups?: CupMeta[] }>('leagues').cups ?? [];
/** 리그 · 컵 대회 이름 */
export const compKo = (id: string) => leagues.find((l) => l.id === id)?.ko ?? cups.find((c) => c.id === id)?.ko ?? id;
export const nations = new Map<string, NationMeta>(metaFile<{ nations: NationMeta[] }>('nations').nations.map((n) => [n.code, n]));
export const clubs = new Map<string, ClubMaster>(Object.values(S.clubs).map((c) => [c.id, c]));

// 여러 파일로 나뉜 한국어 이름을 하나로 합친다 (먼저 들어온 값 유지)
export const koNames = new Map<string, LocaleName>();
for (const file of Object.values(S.ko)) {
  for (const [id, v] of Object.entries(file)) if (!koNames.has(id)) koNames.set(id, v);
}

const keyOf = (path: string) => path.match(/seasons\/([^/]+)\/([^/]+)\/([^/]+)\.json$/)!.slice(1) as [string, string, string];
const index = new Map<string, () => Promise<unknown>>();
for (const [path, load] of Object.entries(S.seasons)) index.set(keyOf(path).join('/'), load);

/** 수록된 시즌 목록 (리그별) */
export function availableSeasons(league: string): string[] {
  const out = new Set<string>();
  for (const k of index.keys()) { const [s, l, f] = k.split('/'); if (l === league && f === '_league') out.add(s); }
  return [...out].sort();
}

/** 실제 최종 순위 (데이터에 있을 때만) */
export async function loadStandings(season: string, league: string): Promise<string[] | undefined> {
  const meta = (await index.get(`${season}/${league}/_league`)?.()) as LeagueSeasonFile | undefined;
  return meta?.standings;
}

export async function loadLeagueSeason(season: string, league: string) {
  const meta = (await index.get(`${season}/${league}/_league`)?.()) as LeagueSeasonFile | undefined;
  if (!meta) throw new Error(`데이터 없음: ${season} ${league}`);
  const clubsData = await Promise.all(meta.clubs.map((id) => index.get(`${season}/${league}/${id}`)!() as Promise<ClubSeasonFile>));
  return { meta, clubs: clubsData };
}

/** 선수 이력 (시작 호칭 계산용). 파일이 없으면 null → npm run history 로 만들 수 있음 */
export async function loadHistory(): Promise<PlayerHistory | null> {
  const f = Object.values(S.history)[0];
  return f ? await f() : null;
}

export const playerKo = (id: string, fallback: string) => koNames.get(id)?.name ?? fallback;
export const clubKo = (id: string) => clubs.get(id)?.ko ?? clubs.get(id)?.name ?? id;

/**
 * 게임이 만든 선수(유스)의 한국어 이름 등록: 이름을 가져온 선수들의 한국어 이름에서 이름 · 성을 섞는다.
 * 만든 이름은 선수에 저장(p.ko)해서 세이브를 불러와도 같게
 */
export function registerGeneratedNames(players: Record<string, { generated?: boolean; ko?: string; name: string; nameFrom?: [string | null, string | null] }>) {
  const split = (s: string) => { const t = s.trim().split(/\s+/); return { first: t.length > 1 ? t.slice(0, -1).join(' ') : null, last: t.at(-1)! }; };
  for (const [id, p] of Object.entries(players)) {
    if (!p.generated) continue;
    if (!p.ko && p.nameFrom) {
      const [fId, lId] = p.nameFrom;
      const f = fId ? koNames.get(fId)?.name : null, l = lId ? koNames.get(lId)?.name : null;
      if (l) p.ko = [f ? split(f).first ?? split(f).last : null, split(l).last].filter(Boolean).join(' ');
    }
    if (p.ko) koNames.set(id, { name: p.ko, short: p.ko.split(' ').at(-1) });
  }
}
