// 다국어 이름: Wikidata 이름(label)으로 비어 있는 선수 이름을 채운다
// - 이미 있는 이름은 덮어쓰지 않는다 (차이는 보고만)
// - 결과는 출처를 구분하려고 locale/<언어>/players-wikidata.json 에 따로 저장
const fs = require('fs');
const path = require('path');
const { DATA } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');
const { PLAYERS_FILE } = require('./resolve');
const wikidata = require('../providers/wikidata');

// 성을 앞에 쓰는 국가: 한국·북한·중국은 전체 이름, 일본은 첫 단어(성)를 짧은 이름으로
const FAMILY_FIRST = { KOR: 'full', PRK: 'full', CHN: 'full', JPN: 'first' };

// 한글·공백만 허용. Wikidata 표기의 가운뎃점(·)은 공백으로 바꾼다
function cleanKo(label) {
  if (!label) return null;
  const s = label.replace(/[·・]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^[가-힣 ]+$/.test(s) ? s : null;
}

function shortName(name, nation) {
  const parts = name.split(' ');
  if (FAMILY_FIRST[nation] === 'full') return name.replace(/ /g, '');
  if (FAMILY_FIRST[nation] === 'first') return parts[0];
  return parts[parts.length - 1];
}

function loadLocale(lang) {
  const dir = path.join(DATA, 'locale', lang);
  const all = {};
  if (!fs.existsSync(dir)) return all;
  for (const f of fs.readdirSync(dir).filter(f => /^players.*\.json$/.test(f))) Object.assign(all, readJson(path.join(dir, f)));
  return all;
}

async function fillNames({ lang, names, apply, log }) {
  if (lang !== 'ko') throw new Error('지금은 ko만 지원 (짧은 이름 규칙이 언어마다 다름)');
  const playerMap = readJson(PLAYERS_FILE, {});
  const existing = loadLocale(lang);
  const ids = [...names.keys()];
  const mapped = ids.filter(id => playerMap[id]?.status === 'valid' && playerMap[id].wikidata);
  const fetched = await wikidata.labels([...new Set(mapped.map(id => playerMap[id].wikidata))], lang);

  const outFile = path.join(DATA, 'locale', lang, 'players-wikidata.json');
  const out = readJson(outFile, {});
  let filled = 0, rejected = 0, noLabel = 0, differs = 0;
  const stillMissing = [];
  const diffSamples = [];
  for (const id of ids) {
    const raw = playerMap[id]?.wikidata ? fetched[playerMap[id].wikidata] : null;
    const ko = cleanKo(raw);
    if (existing[id]) {
      if (ko && ko !== existing[id].name) { differs++; if (diffSamples.length < 10) diffSamples.push(`${existing[id].name} / Wikidata: ${ko}`); }
      continue;
    }
    if (!raw) noLabel++;
    else if (!ko) rejected++;
    if (!ko) { stillMissing.push(id); continue; }
    out[id] = { name: ko, short: shortName(ko, names.get(id).nation) };
    filled++;
  }
  if (apply) writeJsonIfChanged(outFile, out);
  log(`  ${apply ? '채움' : '채울 수 있음'} ${filled}명 · Wikidata에 한국어 이름 없음 ${noLabel}명 · 한글 외 문자라 제외 ${rejected}명`);
  log(`  기존 이름과 Wikidata 표기가 다른 선수 ${differs}명 (덮어쓰지 않음)${diffSamples.length ? ' — 예: ' + diffSamples.slice(0, 5).join(', ') : ''}`);

  // 남은 선수는 기존 도구(missing-names)로 처리할 수 있게 목록을 남긴다
  writeJsonIfChanged(path.join(DATA, '_pipeline', 'review', `names-${lang}-missing.json`),
    stillMissing.map(id => ({ id, name: names.get(id).name, nation: names.get(id).nation })));
  return { filled, noLabel, rejected, differs, stillMissing: stillMissing.length };
}

module.exports = { fillNames };
