// 같은 선수의 이름 표기 통일: 시즌마다 표기가 다르면(예: Alexei / Alexey) 가장 최근 시즌 표기로 맞춘다
// 생년월일이 다른 경우는 다른 사람일 수도 있어 건드리지 않고 검토 목록에 남긴다
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, PIPELINE_DIR } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');

function unifyNames({ apply = false, log = console.log } = {}) {
  log(`■ 선수 이름 표기 통일${apply ? ' (적용)' : ' (미리보기)'}`);
  const latest = new Map();   // id → { name, season }
  const files = [];
  for (const s of fs.readdirSync(SEASONS_DIR).sort()) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
    for (const f of fs.readdirSync(path.join(SEASONS_DIR, s, l)).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
      const p = path.join(SEASONS_DIR, s, l, f);
      const j = readJson(p);
      files.push([p, j]);
      for (const pl of j.squad) {
        const cur = latest.get(pl.id);
        if (!cur || s >= cur.season) latest.set(pl.id, { name: pl.name, season: s });
      }
    }
  }
  const changes = [];
  const byFile = new Map();
  for (const [p, j] of files) for (const pl of j.squad) {
    const want = latest.get(pl.id).name;
    if (pl.name !== want) {
      changes.push({ id: pl.id, from: pl.name, to: want });
      (byFile.get(p) || byFile.set(p, []).get(p)).push([pl.id, pl.name, want]);
    }
  }
  const uniq = new Map(changes.map((c) => [`${c.id}|${c.from}`, c]));
  log(`  표기가 다른 선수 항목 ${changes.length}개 (선수 ${new Set(changes.map((c) => c.id)).size}명) · 예: ${[...uniq.values()].slice(0, 3).map((c) => `${c.from} → ${c.to}`).join(', ')}`);
  writeJsonIfChanged(path.join(PIPELINE_DIR, 'review', 'unify-names.json'), [...uniq.values()]);
  if (!apply) return;
  let ok = 0;
  for (const [p, list] of byFile) {
    let text = fs.readFileSync(p, 'utf8');
    for (const [id, from, to] of list) text = text.split(`"id": "${id}", "name": ${JSON.stringify(from)}`).join(`"id": "${id}", "name": ${JSON.stringify(to)}`);
    const j = JSON.parse(text);   // 형식이 맞는지 확인
    if (j.squad.every((x) => x.name === latest.get(x.id).name)) { fs.writeFileSync(p, text); ok++; }
    else log(`  ⚠ ${path.relative(SEASONS_DIR, p)}: 줄 형식이 달라 건너뜀`);
  }
  log(`  적용 완료 · 파일 ${ok}개`);
}

module.exports = { unifyNames };
