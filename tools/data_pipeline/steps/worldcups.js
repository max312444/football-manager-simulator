// 월드컵 참가국 · 조 (2002 ~ 2026): 영어 위키백과 "{연도} FIFA World Cup squads" 문서의 조(==) · 나라(===) 제목에서 읽는다
//  → data/meta/worldcups.json { "2002": { "hosts": [...], "groups": { "A": ["DEN", ...] }, "source": "enwiki:...@revid" } }
//  나라 이름 → 코드는 meta/nations.json 의 en 이름 + 아래 별칭. 못 찾은 이름은 보고만 한다 (임의로 정하지 않음)
//  node tools/data_pipeline worldcups [--apply]
const path = require('path');
const { DATA } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');
const { getJson } = require('../lib/http');

const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';
const YEARS = [2002, 2006, 2010, 2014, 2018, 2022, 2026];
/** 개최국 (대회 공식 개최국) */
const HOSTS = { 2002: ['KOR', 'JPN'], 2006: ['GER'], 2010: ['RSA'], 2014: ['BRA'], 2018: ['RUS'], 2022: ['QAT'], 2026: ['USA', 'CAN', 'MEX'] };
/** 위키백과 표기 → nations.json en 표기가 다른 경우 */
const ALIAS = {
  'Turkey': 'Türkiye', 'China PR': 'China', 'IR Iran': 'Iran', 'Korea Republic': 'South Korea', 'Ireland': 'Republic of Ireland',
  'Ivory Coast': "Côte d'Ivoire", 'Czech Republic': 'Czechia',
  'Serbia and Montenegro': 'Serbia',
};

async function worldcups({ apply, log }) {
  log(`\n■ 월드컵 참가국 · 조 (${apply ? '적용' : '미리보기'})`);
  const nations = readJson(path.join(DATA, 'meta', 'nations.json')).nations;
  const byName = new Map();
  for (const n of nations) { byName.set(n.en.toLowerCase(), n.code); }
  const codeOf = (name) => byName.get(name.toLowerCase()) ?? byName.get((ALIAS[name] ?? '').toLowerCase()) ?? null;
  const out = {};
  const missing = new Set();
  for (const y of YEARS) {
    const title = `${y} FIFA World Cup squads`;
    const j = await getJson('wikipedia', `${API}&action=query&prop=revisions&rvprop=ids|content&rvslots=main&rvlimit=1&redirects=1&titles=${encodeURIComponent(title)}`);
    const rev = j.query?.pages?.[0]?.revisions?.[0];
    if (!rev) { log(`  ${y}: 문서 없음`); continue; }
    const groups = {};
    let cur = null;
    for (const m of rev.slots.main.content.matchAll(/^(==+)\s*(.+?)\s*\1\s*$/gm)) {
      const lv = m[1].length, name = m[2].replace(/\[\[|\]\]/g, '').trim();
      if (lv === 2 && /^Group [A-L]$/.test(name)) { cur = name.slice(6); groups[cur] = []; continue; }
      if (lv === 2) { cur = null; continue; }
      if (lv === 3 && cur && groups[cur].length < 4) {
        const code = codeOf(name);
        if (code) groups[cur].push(code); else { missing.add(`${name} (${y})`); groups[cur].push(`?${name}`); }
      }
    }
    const n = Object.values(groups).flat().length;
    out[y] = { hosts: HOSTS[y], groups, source: `enwiki:${title}@${rev.revid}` };
    log(`  ${y}: ${Object.keys(groups).length}개 조 · ${n}개 나라`);
  }
  if (missing.size) log(`  nations.json 에 없는 나라 ${missing.size}개: ${[...missing].join(', ')}`);
  if (apply) {
    if (missing.size) throw new Error('nations.json 에 없는 나라가 있어 저장하지 않음 (먼저 나라를 추가)');
    writeJsonIfChanged(path.join(DATA, 'meta', 'worldcups.json'), out);
    log('  저장: data/meta/worldcups.json');
  }
  return { out, missing: [...missing] };
}

module.exports = { worldcups };
