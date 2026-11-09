// 데이터 검사: node tools/validate.js [시즌 필터, 예: 2025-26]
// 규칙은 data/DATA_GUIDE.md 참고
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const FORMATIONS = ['4-4-2', '4-4-1-1', '4-3-3', '4-2-3-1', '4-1-4-1', '4-5-1', '4-3-1-2', '4-1-2-1-2', '4-2-2-2',
  '3-5-2', '3-4-3', '3-4-2-1', '3-4-1-2', '5-3-2', '5-4-1'];
const OUTFIELD_ATTRS =['sho', 'pas', 'dri', 'tac', 'pos', 'aer', 'pac', 'sta', 'str', 'vis', 'com', 'ldr'];
const GK_ATTRS = ['ref', 'han', 'one', 'pas', 'pos', 'aer', 'pac', 'sta', 'str', 'vis', 'com', 'ldr'];
const LOOKS = {
  hair: ['bald', 'buzz', 'short', 'short_curly', 'curly', 'afro', 'medium', 'long', 'bun', 'ponytail', 'dreadlocks', 'braids', 'mohawk', 'slick', 'undercut'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'grey', 'dyed'],
  beard: ['none', 'stubble', 'short', 'full', 'goatee', 'mustache'],
  acc: ['headband', 'hairband', 'glasses'],
};
const TRAITS = ['big_game', 'injury_prone', 'free_kick', 'penalty', 'long_shot', 'playmaker', 'target_man',
  'speedster', 'engine', 'leader', 'flair', 'sweeper_keeper', 'aerial_threat', 'clutch'];
const PLAYER_KEYS = ['id', 'name', 'fullName', 'birth', 'nation', 'nation2', 'height', 'foot', 'looks', 'number',
  'pos', 'alt', 'attrs', 'wage', 'contract', 'loan', 'traits', 'verify'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*-(\d{4})(-\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEASON_RE = /^(\d{4})-(\d{2})$/;

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const nations = new Set(readJson(path.join(DATA, 'meta', 'nations.json')).nations.map(n => n.code));
const leagues = new Set(readJson(path.join(DATA, 'meta', 'leagues.json')).leagues.map(l => l.id));
const clubs = new Set();
for (const f of fs.readdirSync(path.join(DATA, 'clubs')).filter(f => f.endsWith('.json'))) {
  const where = `clubs/${f}`;
  let c;
  try { c = readJson(path.join(DATA, 'clubs', f)); } catch (e) { err(where, `JSON 파싱 실패: ${e.message}`); continue; }
  if (c.id !== f.replace(/\.json$/, '')) err(where, `id(${c.id})가 파일 이름과 다름`);
  for (const k of ['name', 'ko', 'short', 'nation', 'kits']) if (!c[k]) err(where, `${k} 누락`);
  if (c.nation && !nations.has(c.nation)) err(where, `알 수 없는 국가 코드: ${c.nation}`);
  clubs.add(c.id);
}

const filter = process.argv[2];
const seasonsDir = path.join(DATA, 'seasons');
const identities = new Map(); // id -> { name, birth, nation, where }
let fileCount = 0, playerCount = 0, verifyCount = 0;

for (const season of fs.existsSync(seasonsDir) ? fs.readdirSync(seasonsDir).sort() : []) {
  if (filter && season !== filter) continue;
  const sm = SEASON_RE.exec(season);
  if (!sm || (Number(sm[1]) + 1) % 100 !== Number(sm[2])) { err(season, '시즌 폴더 이름 형식 오류 (YYYY-YY)'); continue; }
  const seasonStart = `${sm[1]}-07-01`;
  const seenInSeason = new Map();

  for (const league of fs.readdirSync(path.join(seasonsDir, season)).sort()) {
    if (!leagues.has(league)) err(`${season}/${league}`, '알 수 없는 리그 ID');
    const leagueDir = path.join(seasonsDir, season, league);
    const clubFiles = fs.readdirSync(leagueDir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort();
    checkLeagueFile(leagueDir, season, league, clubFiles.map(f => f.replace(/\.json$/, '')));
    for (const file of clubFiles) {
      const where = `${season}/${league}/${file}`;
      let data;
      try { data = readJson(path.join(seasonsDir, season, league, file)); } catch (e) { err(where, `JSON 파싱 실패: ${e.message}`); continue; }
      fileCount++;
      checkClubSeason(data, where, season, league, file.replace(/\.json$/, ''), seasonStart, seenInSeason);
    }
  }
}

function checkClubSeason(d, where, season, league, clubFile, seasonStart, seenInSeason) {
  // 출처 기반으로 만든 파일(source 있음)은 출처에 없는 값을 지어내지 않고 null로 둔다
  const sourced = !!d.source;
  const optional = (v) => sourced && v == null;
  if (d.season !== season) err(where, `season 값(${d.season})이 폴더와 다름`);
  if (d.league !== league) err(where, `league 값(${d.league})이 폴더와 다름`);
  if (d.club !== clubFile) err(where, `club 값(${d.club})이 파일 이름과 다름`);
  if (!clubs.has(d.club)) err(where, `clubs/에 없는 구단: ${d.club}`);
  inRange(d.reputation, 1, 99, where, 'reputation');
  for (const k of ['balance', 'transferBudget', 'wageBudget']) {
    if (typeof d.finance?.[k] !== 'number') err(where, `finance.${k} 누락`);
  }
  inRange(d.facilities?.training, 1, 5, where, 'facilities.training');
  inRange(d.facilities?.youth, 1, 5, where, 'facilities.youth');
  if (!Number.isInteger(d.stadiumCapacity) && !optional(d.stadiumCapacity)) err(where, 'stadiumCapacity 누락');
  if (!d.formation) warn(where, 'formation 없음');
  else if (!FORMATIONS.includes(d.formation)) err(where, `알 수 없는 포메이션: ${d.formation}`);
  if (!Array.isArray(d.squad)) { err(where, 'squad 누락'); return; }
  if (d.squad.length < 18 || d.squad.length > 40) warn(where, `선수단 ${d.squad.length}명 (권장 22~30)`);
  if (!d.squad.some(p => p.pos === 'GK')) err(where, '골키퍼 없음');

  const numbers = new Set();
  for (const p of d.squad) {
    playerCount++;
    if (p.verify) verifyCount++;
    const pw = `${where} [${p.id || p.name || '?'}]`;
    for (const k of Object.keys(p)) if (!PLAYER_KEYS.includes(k)) warn(pw, `알 수 없는 필드: ${k}`);

    const m = ID_RE.exec(p.id || '');
    if (!m) err(pw, 'id 형식 오류');
    if (!p.name) err(pw, 'name 누락');
    if (!DATE_RE.test(p.birth || '')) err(pw, 'birth 형식 오류 (YYYY-MM-DD)');
    else if (m && m[2] !== p.birth.slice(0, 4)) err(pw, 'id의 출생연도와 birth가 다름');
    if (!nations.has(p.nation)) err(pw, `알 수 없는 국가 코드: ${p.nation}`);
    if (p.nation2 && !nations.has(p.nation2)) err(pw, `알 수 없는 국가 코드: ${p.nation2}`);
    if (!optional(p.height)) inRange(p.height, 155, 210, pw, 'height');
    if (!['L', 'R', 'B'].includes(p.foot) && !optional(p.foot)) err(pw, 'foot은 L/R/B');

    if (optional(p.number)) { /* 등번호 미상 */ }
    else if (!Number.isInteger(p.number) || p.number < 1 || p.number > 99) err(pw, 'number는 1~99');
    else if (numbers.has(p.number)) err(pw, `등번호 중복: ${p.number}`);
    else numbers.add(p.number);

    if (!POSITIONS.includes(p.pos)) err(pw, `알 수 없는 포지션: ${p.pos}`);
    for (const a of p.alt || []) if (!POSITIONS.includes(a)) err(pw, `알 수 없는 포지션: ${a}`);

    const keys = p.pos === 'GK' ? GK_ATTRS : OUTFIELD_ATTRS;
    for (const k of keys) inRange(p.attrs?.[k], 1, 99, pw, `attrs.${k}`);
    for (const k of Object.keys(p.attrs || {})) if (!keys.includes(k)) err(pw, `포지션에 맞지 않는 능력치: ${k}`);

    if (!Number.isInteger(p.wage) || p.wage <= 0) err(pw, 'wage 누락');
    if (optional(p.contract)) { /* 계약 만료일 미상 */ }
    else if (!DATE_RE.test(p.contract || '')) err(pw, 'contract 형식 오류');
    else if (p.contract < seasonStart) err(pw, `계약이 시즌 시작 전에 만료됨: ${p.contract}`);
    if (p.loan && !clubs.has(p.loan)) warn(pw, `clubs/에 없는 임대 원소속 구단: ${p.loan}`);

    for (const [k, v] of Object.entries(p.looks || {})) {
      if (k === 'skin') inRange(v, 1, 8, pw, 'looks.skin');
      else if (!LOOKS[k]) err(pw, `알 수 없는 외형 키: ${k}`);
      else if (!LOOKS[k].includes(v)) err(pw, `알 수 없는 외형 값: ${k}=${v}`);
    }
    if ((p.traits || []).length > 3) err(pw, '특성은 최대 3개');
    for (const t of p.traits || []) if (!TRAITS.includes(t)) err(pw, `알 수 없는 특성: ${t}`);

    if (DATE_RE.test(p.birth || '')) {
      const age = (new Date(seasonStart) - new Date(p.birth)) / (365.25 * 864e5);
      if (age < 15 || age > 45) err(pw, `시즌 시작 시 나이 ${age.toFixed(1)}세`);
    }

    // 같은 시즌 중복 등록
    if (seenInSeason.has(p.id)) err(pw, `같은 시즌에 이미 등록됨: ${seenInSeason.get(p.id)}`);
    else seenInSeason.set(p.id, where);

    // 시즌 간 고정 정보 일치
    const prev = identities.get(p.id);
    if (!prev) identities.set(p.id, { name: p.name, birth: p.birth, nation: p.nation, where });
    else for (const k of ['name', 'birth', 'nation']) {
      // 국적은 이중 국적 선수가 시즌마다 다르게 기록될 수 있어 경고로만 (이름 · 생년월일은 오류)
      if (prev[k] !== p[k]) (k === 'nation' ? warn : err)(pw, `${k} 불일치: "${p[k]}" vs "${prev[k]}" (${prev.where})`);
    }
  }
}

function checkLeagueFile(dir, season, league, clubIds) {
  const where = `${season}/${league}/_league.json`;
  const p = path.join(dir, '_league.json');
  if (!fs.existsSync(p)) { warn(where, '없음 (참가 구단 목록)'); return; }
  let d;
  try { d = readJson(p); } catch (e) { err(where, `JSON 파싱 실패: ${e.message}`); return; }
  if (d.season !== season || d.league !== league) err(where, 'season/league 값이 폴더와 다름');
  const listed = new Set(d.clubs || []);
  for (const c of listed) if (!clubs.has(c)) err(where, `clubs/에 없는 구단: ${c}`);
  for (const c of listed) if (!clubIds.includes(c)) warn(where, `구단 파일 아직 없음: ${c}`);
  for (const c of clubIds) if (!listed.has(c)) err(where, `참가 목록에 없는 구단 파일: ${c}`);
  if (d.standings) {
    const s = new Set(d.standings);
    if (s.size !== listed.size || [...s].some(c => !listed.has(c))) err(where, 'standings와 clubs 목록이 다름');
  }
}

function inRange(v, lo, hi, where, name) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) err(where, `${name}는 ${lo}~${hi} 정수 (현재: ${v})`);
}

// 같은 사람인데 id가 다르게 적힌 경우 의심: 생년월일 + 국적이 같은 서로 다른 id
const byBirth = new Map();
for (const [id, v] of identities) {
  const key = `${v.birth}|${v.nation}`;
  if (byBirth.has(key)) warn(id, `같은 선수일 수 있음: ${byBirth.get(key)} (생년월일·국적 동일)`);
  else byBirth.set(key, id);
}

// 다국어 이름: 각 언어 파일의 누락·잘못된 ID
const localeDir = path.join(DATA, 'locale');
const localeSummary = [];
for (const lang of fs.existsSync(localeDir) ? fs.readdirSync(localeDir) : []) {
  // players.json + players-*.json (여러 작업이 나눠 쓴 파일) 을 합쳐서 검사
  const files = fs.readdirSync(path.join(localeDir, lang)).filter(f => /^players(-[\w-]+)?\.json$/.test(f));
  if (!files.length) continue;
  const names = {};
  for (const f of files) {
    const where = `locale/${lang}/${f}`;
    let part;
    try { part = readJson(path.join(localeDir, lang, f)); } catch (e) { err(where, `JSON 파싱 실패: ${e.message}`); continue; }
    for (const [id, v] of Object.entries(part)) {
      if (names[id]) warn(`${where} [${id}]`, '다른 파일에 이미 있는 이름');
      if (!v?.name || !v?.short) err(`${where} [${id}]`, 'name/short 누락');
      if (!filter && !identities.has(id)) warn(`${where} [${id}]`, '데이터에 없는 선수 ID');
      names[id] = v;
    }
  }
  const missing = [...identities.keys()].filter(id => !names[id]).length;
  localeSummary.push(`${lang} 이름 ${identities.size - missing}/${identities.size}`);
}

for (const w of warnings) console.log('⚠ ', w);
for (const e of errors) console.log('✗ ', e);
console.log(`\n파일 ${fileCount}개 · 선수 항목 ${playerCount}개 · 고유 선수 ${identities.size}명 · 검토 필요 ${verifyCount}개`);
if (localeSummary.length) console.log(`번역: ${localeSummary.join(' · ')}`);
console.log(errors.length ? `오류 ${errors.length}개` : '오류 없음');
process.exit(errors.length ? 1 : 0);
