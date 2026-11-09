// 화면 없이 시즌 시뮬레이션: 밸런스 확인용
//   npm run sim -- --season 2013-14 --league eng1 [--seed 1] [--runs 5]
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, advanceDay, seasonOver } from '../src/engine/world';
import { sortTable } from '../src/engine/standings';
import type { ClubSeasonFile, LeagueSeasonFile } from '../src/data/types';

// 기본은 공개용(패러디) 데이터, --dataset real 이면 내 PC의 실명 데이터
const DATA = path.resolve(__dirname, process.argv.includes('real') ? '../../data' : '../../data-public');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const season = arg('season', '2025-26');
const leagueIds = arg('league', 'eng1').split(',');
const runs = +arg('runs', '1');
const seed0 = +arg('seed', '1');

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8'));
const ko: Record<string, { name: string }> = {};
for (const f of fs.readdirSync(path.join(DATA, 'locale/ko')).filter((f) => f.startsWith('players'))) {
  for (const [id, v] of Object.entries(readJson<Record<string, { name: string }>>(path.join(DATA, 'locale/ko', f)))) ko[id] ??= v;
}
const clubKo = (id: string) => {
  const p = path.join(DATA, 'clubs', `${id}.json`);
  return fs.existsSync(p) ? readJson<{ ko?: string; name: string }>(p).ko ?? id : id;
};

const input = {
  season,
  leagues: leagueIds.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta = readJson<LeagueSeasonFile>(path.join(dir, '_league.json'));
    return { id, clubs: meta.clubs.map((c) => readJson<ClubSeasonFile>(path.join(dir, `${c}.json`))) };
  }),
};

const agg = { matches: 0, goals: 0, home: 0, draw: 0, away: 0, yellow: 0, red: 0, inj: 0, corr: 0 };
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const w = createWorld(input, input.leagues[0].clubs[0].club, seed0 + r);
  if (r === 0 && w.warnings.length) console.log(`데이터 경고 ${w.warnings.length}건: ${w.warnings.slice(0, 3).join(' / ')}`);
  let days = 0;
  while (!seasonOver(w) && days < 400) { advanceDay(w); days++; }

  for (const comp of Object.values(w.competitions)) {
    for (const f of comp.fixtures) {
      const s = f.result!;
      agg.matches++; agg.goals += s.homeGoals + s.awayGoals;
      if (s.homeGoals > s.awayGoals) agg.home++; else if (s.homeGoals === s.awayGoals) agg.draw++; else agg.away++;
      agg.yellow += s.cards.filter((c) => !c.red).length; agg.red += s.cards.filter((c) => c.red).length; agg.inj += s.injuries.length;
    }
    const table = sortTable(comp.table);
    // 평판 순위와 최종 순위의 상관 (스피어만)
    const repRank = [...table].sort((a, b) => w.clubs[b.club].reputation - w.clubs[a.club].reputation).map((t) => t.club);
    const n = table.length;
    const d2 = table.reduce((s, t, i) => s + (i - repRank.indexOf(t.club)) ** 2, 0);
    agg.corr += 1 - (6 * d2) / (n * (n * n - 1));

    if (r === 0) {
      console.log(`\n■ ${comp.id} ${season} (시드 ${seed0}, ${days}일 진행)`);
      console.log(' 순위  구단                 경기  승  무  패  득  실  승점');
      table.forEach((t, i) => console.log(
        ` ${String(i + 1).padStart(3)}  ${clubKo(t.club).padEnd(18)} ${String(t.p).padStart(4)} ${String(t.w).padStart(3)} ${String(t.d).padStart(3)} ${String(t.l).padStart(3)} ${String(t.gf).padStart(3)} ${String(t.ga).padStart(3)} ${String(t.pts).padStart(5)}`));
      const scorers = Object.values(w.players).filter((p) => w.clubs[p.clubId!]?.league === comp.id)
        .sort((a, b) => b.stats.goals - a.stats.goals).slice(0, 5);
      console.log(' 득점 순위: ' + scorers.map((p) => `${ko[p.id]?.name ?? p.name}(${clubKo(p.clubId!)}) ${p.stats.goals}`).join(', '));
    }
  }
}
const n = agg.matches;
const leaguesRun = runs * leagueIds.length;
console.log(`\n■ 검증 (${runs}회 × ${leagueIds.length}리그, 경기 ${n}개, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
console.log(` 경기당 골      ${(agg.goals / n).toFixed(2)}   (목표 2.6~2.8)`);
console.log(` 홈/무/원정     ${(agg.home / n * 100).toFixed(1)}% / ${(agg.draw / n * 100).toFixed(1)}% / ${(agg.away / n * 100).toFixed(1)}%   (목표 약 45 / 26 / 29)`);
console.log(` 경고/퇴장      경기당 ${(agg.yellow / n).toFixed(2)} / ${(agg.red / n).toFixed(3)}`);
console.log(` 부상           경기당 ${(agg.inj / n).toFixed(2)}`);
console.log(` 평판↔순위 상관 ${(agg.corr / leaguesRun).toFixed(2)}   (1에 가까울수록 강팀이 위)`);
