// 선수 이력 파일 만들기: 시즌 데이터(출처 있는 기록)에서 선수별 [시즌, 소속, 그 시즌 능력]만 뽑는다
// → 새 게임 시작 때 베테랑 · 스타 선수의 시작 호칭 계산에 사용
//   npm run history            (공개 데이터 data-public)
//   npm run history -- real    (내 PC 실명 데이터 data, Git에 올라가지 않음)
// 데이터를 다시 만들면(publish 등) 이 스크립트도 다시 실행해야 한다
import fs from 'node:fs';
import path from 'node:path';
import { overall } from '../src/engine/ratings';
import type { ClubSeasonFile } from '../src/data/types';
import type { PlayerState } from '../src/engine/types';

const DATA = path.resolve(__dirname, process.argv.includes('real') ? '../../data' : '../../data-public');
const seasons = fs.readdirSync(path.join(DATA, 'seasons')).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort();
const clubs: string[] = [];
const clubIdx = new Map<string, number>();
const rows = new Map<string, string[]>();

for (const [si, s] of seasons.entries()) {
  for (const l of fs.readdirSync(path.join(DATA, 'seasons', s))) {
    for (const f of fs.readdirSync(path.join(DATA, 'seasons', s, l)).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
      const j = JSON.parse(fs.readFileSync(path.join(DATA, 'seasons', s, l, f), 'utf8')) as ClubSeasonFile;
      if (!clubIdx.has(j.club)) { clubIdx.set(j.club, clubs.length); clubs.push(j.club); }
      for (const p of j.squad) {
        const ovr = overall({ base: p.attrs, growth: {}, traits: [], pos: p.pos } as unknown as PlayerState);
        (rows.get(p.id) ?? rows.set(p.id, []).get(p.id)!).push(`${si}.${clubIdx.get(j.club)}.${ovr}`);
      }
    }
  }
}
const out = { note: '시즌 데이터에서 계산한 선수 이력 (시즌 번호.구단 번호.그 시즌 능력)', seasons, clubs, p: Object.fromEntries([...rows].map(([id, r]) => [id, r.join(',')])) };
fs.mkdirSync(path.join(DATA, 'history'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'history', 'players.json'), JSON.stringify(out));
console.log(`${path.relative(process.cwd(), DATA)}/history/players.json · 시즌 ${seasons.length} · 구단 ${clubs.length} · 선수 ${rows.size} · ${(fs.statSync(path.join(DATA, 'history', 'players.json')).size / 1e6).toFixed(1)}MB`);
