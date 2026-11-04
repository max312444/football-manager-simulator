// 파일 입출력·이름 정규화 도우미
const fs = require('fs');
const path = require('path');

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

// 내용이 같으면 파일을 다시 쓰지 않는다. 임시 파일에 쓴 뒤 교체한다.
function writeJsonIfChanged(p, value) {
  const text = JSON.stringify(sortKeys(value), null, 2) + '\n';
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
  return true;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

// 악센트·대소문자·문장부호를 없앤 비교용 이름
function normName(s) {
  return (s || '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss').replace(/ł/gi, 'l').replace(/đ/gi, 'd')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// 이름 토큰이 하나라도 겹치는지 (성만 같아도 후보로 본다; 단독으로는 병합 근거가 아님)
function namesOverlap(a, b) {
  const ta = new Set(normName(a).split(' ').filter(t => t.length > 1));
  return normName(b).split(' ').some(t => t.length > 1 && ta.has(t));
}

function listSeasons(seasonsDir, league) {
  return fs.readdirSync(seasonsDir).filter(s => fs.existsSync(path.join(seasonsDir, s, league))).sort();
}

function readClubSeason(seasonsDir, season, league, club) {
  return readJson(path.join(seasonsDir, season, league, `${club}.json`));
}

function listClubFiles(seasonsDir, season, league) {
  return fs.readdirSync(path.join(seasonsDir, season, league))
    .filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.replace(/\.json$/, '')).sort();
}

module.exports = { readJson, writeJsonIfChanged, normName, namesOverlap, listSeasons, readClubSeason, listClubFiles };
