// 원본 데이터 불러오기. 작은 메타 파일은 바로, 시즌 파일은 필요할 때만 읽는다.
import type {
  ClubMaster, ClubSeasonFile, LeagueMeta, LeagueSeasonFile, LocaleName, NationMeta,
} from './types';
import leaguesJson from '@data/meta/leagues.json';
import nationsJson from '@data/meta/nations.json';

const clubFiles = import.meta.glob<ClubMaster>('@data/clubs/*.json', { eager: true, import: 'default' });
const koFiles = import.meta.glob<Record<string, LocaleName>>('@data/locale/ko/players*.json', { eager: true, import: 'default' });
const seasonFiles = import.meta.glob<ClubSeasonFile | LeagueSeasonFile>('@data/seasons/*/*/*.json', { import: 'default' });

export const leagues: LeagueMeta[] = (leaguesJson as { leagues: LeagueMeta[] }).leagues;
export const nations = new Map<string, NationMeta>((nationsJson as { nations: NationMeta[] }).nations.map(n => [n.code, n]));
export const clubs = new Map<string, ClubMaster>(Object.values(clubFiles).map(c => [c.id, c]));

// 여러 파일로 나뉜 한국어 이름을 하나로 합친다 (뒤 파일이 앞 파일을 덮지 않도록 먼저 들어온 값 유지)
export const koNames = new Map<string, LocaleName>();
for (const file of Object.values(koFiles)) {
  for (const [id, v] of Object.entries(file)) if (!koNames.has(id)) koNames.set(id, v);
}

const keyOf = (path: string) => path.match(/seasons\/([^/]+)\/([^/]+)\/([^/]+)\.json$/)!.slice(1) as [string, string, string];
const index = new Map<string, () => Promise<unknown>>();
for (const [path, load] of Object.entries(seasonFiles)) index.set(keyOf(path).join('/'), load);

/** 수록된 시즌 목록 (리그별) */
export function availableSeasons(league: string): string[] {
  const out = new Set<string>();
  for (const k of index.keys()) { const [s, l, f] = k.split('/'); if (l === league && f === '_league') out.add(s); }
  return [...out].sort();
}

export async function loadLeagueSeason(season: string, league: string) {
  const meta = (await index.get(`${season}/${league}/_league`)?.()) as LeagueSeasonFile | undefined;
  if (!meta) throw new Error(`데이터 없음: ${season} ${league}`);
  const clubsData = await Promise.all(meta.clubs.map(id => index.get(`${season}/${league}/${id}`)!() as Promise<ClubSeasonFile>));
  return { meta, clubs: clubsData };
}

export const playerKo = (id: string, fallback: string) => koNames.get(id)?.name ?? fallback;
export const clubKo = (id: string) => clubs.get(id)?.ko ?? clubs.get(id)?.name ?? id;
