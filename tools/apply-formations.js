// 포메이션 목록 파일을 구단 시즌 파일에 넣는다.
// node tools/apply-formations.js <목록.json> [리그=eng1]
// 목록 형식: { "2000-01": { "arsenal": "4-4-2", ... }, ... }
const fs = require('fs');
const path = require('path');

const [listFile, league = 'eng1'] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const seasonsDir = path.join(__dirname, '..', 'data', 'seasons');
let applied = 0;
const missing = [];

for (const season of fs.readdirSync(seasonsDir).sort()) {
  const dir = path.join(seasonsDir, season, league);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
    const club = f.replace(/\.json$/, '');
    const formation = list[season]?.[club];
    if (!formation) { missing.push(`${season}/${club}`); continue; }
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, 'utf8');
    // 파일 서식을 유지하려고 stadiumCapacity 줄 뒤에 한 줄만 넣거나 바꾼다
    const next = /"formation": "[^"]*"/.test(text)
      ? text.replace(/"formation": "[^"]*"/, `"formation": "${formation}"`)
      : text.replace(/("stadiumCapacity": \d+,)(\r?\n)(\s*)/, `$1$2$3"formation": "${formation}",$2$3`);
    if (next === text && !text.includes(`"formation": "${formation}"`)) { missing.push(`${season}/${club} (넣을 위치 못 찾음)`); continue; }
    fs.writeFileSync(p, next);
    applied++;
  }
}
console.log(`적용 ${applied}개`);
if (missing.length) console.log(`누락 ${missing.length}개:\n  ${missing.join('\n  ')}`);
