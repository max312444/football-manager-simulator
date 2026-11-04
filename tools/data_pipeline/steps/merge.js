// 중복 선수 합치기: from ID를 into ID로 바꾼다 (시즌 파일 · 다국어 이름 · 매핑)
// 남기는 쪽(into)의 신원 정보(name, birth, nation)를 기준으로 맞춘다
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, DATA } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');
const { PLAYERS_FILE } = require('./resolve');

function seasonFiles() {
  const out = [];
  for (const s of fs.readdirSync(SEASONS_DIR)) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
    const dir = path.join(SEASONS_DIR, s, l);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) out.push(path.join(dir, f));
  }
  return out;
}

function findIdentity(id, files) {
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(f, 'utf8')).squad.find(x => x.id === id);
    if (p) return p;
  }
  return null;
}

function mergePlayers(from, into, { log }) {
  const files = seasonFiles();
  const keep = findIdentity(into, files);
  if (!keep) throw new Error(`남길 선수 ${into}를 데이터에서 찾을 수 없음`);
  let changed = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes(`"id": "${from}"`)) continue;
    if (text.includes(`"id": "${into}"`)) throw new Error(`${f}: 같은 구단 시즌에 두 ID가 모두 있음 — 수동 확인 필요`);
    // 해당 선수 줄에서 id·name·birth·nation만 바꿔 파일 서식을 유지한다
    const next = text.split('\n').map(line => {
      if (!line.includes(`"id": "${from}"`)) return line;
      return line
        .replace(`"id": "${from}"`, `"id": "${into}"`)
        .replace(/"name": "[^"]*"/, `"name": ${JSON.stringify(keep.name)}`)
        .replace(/"birth": "[^"]*"/, `"birth": "${keep.birth}"`)
        .replace(/"nation": "[^"]*"/, `"nation": "${keep.nation}"`);
    }).join('\n');
    fs.writeFileSync(`${f}.tmp`, next);
    fs.renameSync(`${f}.tmp`, f);
    changed++;
  }

  const localeDir = path.join(DATA, 'locale');
  for (const lang of fs.existsSync(localeDir) ? fs.readdirSync(localeDir) : []) {
    for (const f of fs.readdirSync(path.join(localeDir, lang)).filter(f => /^players.*\.json$/.test(f))) {
      const p = path.join(localeDir, lang, f);
      const names = readJson(p);
      if (!names[from]) continue;
      delete names[from];
      fs.writeFileSync(p, JSON.stringify(names, null, 2) + '\n');
    }
  }

  const map = readJson(PLAYERS_FILE, {});
  if (map[from]) {
    if (!map[into]?.wikidata && map[from].wikidata) map[into] = { ...map[from], status: 'valid', method: 'merge' };
    else if (map[into]) map[into] = { ...map[into], status: 'valid' };
    delete map[from];
    writeJsonIfChanged(PLAYERS_FILE, map);
  }
  log(`  합침: ${from} → ${into} (시즌 파일 ${changed}개)`);
  return changed;
}

module.exports = { mergePlayers };
