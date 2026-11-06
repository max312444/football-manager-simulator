// 리그 일정: 홈·원정 2번씩 (원형 방식 라운드 로빈) + 날짜 배정
import type { Fixture } from './types';
import type { Rng } from './rng';

/** 라운드별 대진. 후반기는 전반기의 홈·원정을 뒤집는다 */
export function roundRobin(clubs: string[], rng: Rng): [string, string][][] {
  const teams = [...clubs];
  for (let i = teams.length - 1; i > 0; i--) { const j = rng.int(0, i); [teams[i], teams[j]] = [teams[j], teams[i]]; }
  if (teams.length % 2) teams.push('__bye__');
  const n = teams.length;
  const first: [string, string][][] = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === '__bye__' || b === '__bye__') continue;
      // 고정 팀(0번)은 라운드마다 홈·원정을 번갈아, 나머지는 위치로 결정
      round.push(i === 0 ? (r % 2 ? [b, a] : [a, b]) : (r % 2 ? [a, b] : [b, a]));
    }
    first.push(round);
    arr.splice(1, 0, arr.pop()!);   // 0번 고정, 나머지 회전
  }
  return [...first, ...first.map((rd) => rd.map(([h, a]) => [a, h] as [string, string]))];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
function nthSaturday(y: number, m: number, n: number): Date {
  const first = utc(y, m, 1);
  return addDays(first, ((6 - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
}

export function seasonStart(season: string): string {
  return season === '2020-21' ? '2020-08-01' : `${season.slice(0, 4)}-07-01`;
}

/** 라운드 수만큼 경기일 배정: 토요일 위주, A매치 주간 제외, 부족하면 주중(수요일) 추가 */
export function matchDates(season: string, rounds: number): string[] {
  const y = +season.slice(0, 4);
  const start = season === '2020-21' ? utc(2020, 9, 12) : nthSaturday(y, 8, 2);
  const end = season === '2019-20' ? utc(2020, 7, 25) : utc(y + 1, 5, 25);
  const breaks = new Set([nthSaturday(y, 9, 2), nthSaturday(y, 10, 2), nthSaturday(y, 11, 3), nthSaturday(y + 1, 3, 4)].map(iso));
  const sats: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) if (!breaks.has(iso(d))) sats.push(iso(d));

  let dates = sats;
  if (sats.length > rounds) {
    // 고르게 솎아낸다
    dates = Array.from({ length: rounds }, (_, i) => sats[Math.round((i * (sats.length - 1)) / (rounds - 1))]);
  } else if (sats.length < rounds) {
    const extra: string[] = [];
    const mid = [utc(y, 12, 26), utc(y + 1, 1, 1)];
    for (let d = addDays(nthSaturday(y, 12, 1), 4); extra.length < rounds - sats.length && d < utc(y + 1, 5, 1); d = addDays(d, 7)) mid.push(d);
    for (const d of mid) if (extra.length < rounds - sats.length && !sats.includes(iso(d))) extra.push(iso(d));
    dates = [...sats, ...extra].sort();
  }
  return dates;
}

export function buildFixtures(league: string, season: string, clubs: string[], rng: Rng): Fixture[] {
  const rounds = roundRobin(clubs, rng);
  const dates = matchDates(season, rounds.length);
  return rounds.flatMap((rd, r) => rd.map(([home, away], i) => ({
    id: `${league}-${season}-${r + 1}-${i}`, league, round: r + 1, date: dates[r], home, away,
  })));
}
