// 번역 이름이 없는 선수 목록을 뽑는다.
// node tools/missing-names.js [언어=ko] [나눌 개수=1]
// → data/locale/<언어>/_todo-<n>.txt  (한 줄에 "id<TAB>영문 이름<TAB>국적")
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const lang = process.argv[2] || 'ko';
const parts = Number(process.argv[3] || 1);
const langDir = path.join(DATA, 'locale', lang);
fs.mkdirSync(langDir, { recursive: true });

const named = new Set();
for (const f of fs.readdirSync(langDir).filter(f => /^players(-[\w-]+)?\.json$/.test(f))) {
  for (const id of Object.keys(JSON.parse(fs.readFileSync(path.join(langDir, f), 'utf8')))) named.add(id);
}

const players = new Map();
const seasonsDir = path.join(DATA, 'seasons');
for (const season of fs.readdirSync(seasonsDir)) {
  for (const league of fs.readdirSync(path.join(seasonsDir, season))) {
    const dir = path.join(seasonsDir, season, league);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
      for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).squad) {
        if (!named.has(p.id) && !players.has(p.id)) players.set(p.id, `${p.id}\t${p.name}\t${p.nation}`);
      }
    }
  }
}

const lines = [...players.keys()].sort().map(id => players.get(id));
for (const old of fs.readdirSync(langDir).filter(f => f.startsWith('_todo-'))) fs.unlinkSync(path.join(langDir, old));
const size = Math.ceil(lines.length / parts);
for (let i = 0; i < parts; i++) {
  const chunk = lines.slice(i * size, (i + 1) * size);
  if (chunk.length) fs.writeFileSync(path.join(langDir, `_todo-${i + 1}.txt`), chunk.join('\n') + '\n');
}
console.log(`${lang}: 이름 없는 선수 ${lines.length}명 → ${Math.min(parts, Math.ceil(lines.length / size) || 0)}개 파일`);
