// 공개용 데이터 만들기: data/ (실명, 내 PC에만) → data-public/ (패러디 이름, 저장소에 공개)
//
// 바꾸는 것
//  - 선수 이름: 규칙으로 변형 (한글은 한 낱말에 모음 하나, 영문은 철자 하나). 같은 선수는 항상 같은 이름
//  - 선수 ID: 이름이 들어간 ID → 의미 없는 코드 (p + 해시)
//  - 생년월일: 연 · 월만 (일은 01)
//  - 구단: 실제 이름의 핵심 단어에서 한 글자만 바꾼 패러디 이름 (유나이티드 · 시티 · FC 같은 흔한 단어는 그대로)
//  - 리그: 가상 리그 이름
//  - 엠블럼: 디자인 설정(crest-styles.js)을 구단 파일의 crest 항목으로 넣는다 (머리글자는 패러디 약칭)
// 실제 → 공개 ID 대응표는 data/canonical/public-map.json (내 PC에만)에 남긴다
const fs = require('fs');
const path = require('path');
const { ROOT, DATA, SEASONS_DIR, CLUBS_DIR, CANONICAL_DIR } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');
const { CREST_STYLES, NATION_SHAPE } = require('../crest-styles');

const PUB = path.join(ROOT, 'data-public');

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── 이름 변형 ─────────────────────────────────────────
const EN_SWAP = { a: 'e', e: 'a', i: 'y', o: 'u', u: 'o', y: 'i' };
const plainAscii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/đ/g, 'd');

function parodyEnWord(w, key) {
  if (w.length < 4 || !/[a-z]/i.test(w)) return w;
  const idx = [];
  for (let i = 1; i < w.length; i++) if (EN_SWAP[w[i].toLowerCase()]) idx.push(i);
  if (!idx.length) return w;
  const i = idx[hash(key + w) % idx.length];
  const c = w[i], r = EN_SWAP[c.toLowerCase()];
  return w.slice(0, i) + (c === c.toUpperCase() ? r.toUpperCase() : r) + w.slice(i + 1);
}
function parodyEn(name, key) {
  // 성(마지막 낱말, 4글자 이상)에서만 한 글자 바꾸고 이름은 그대로 — 알아보기 쉽게
  const plain = plainAscii(name);
  const parts = plain.split(' ');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].replace(/[^A-Za-z]/g, '').length < 4) continue;
    const t = parodyEnWord(parts[i], key);
    if (t !== parts[i]) { parts[i] = t; return parts.join(' '); }
  }
  return `${plain}o`;
}

// 한글 모음 바꾸기 (ㅏ↔ㅓ, ㅐ↔ㅔ, ㅑ↔ㅕ, ㅗ↔ㅜ, ㅛ↔ㅠ, ㅡ→ㅜ, ㅣ→ㅔ)
const KO_SWAP = { 0: 4, 4: 0, 1: 5, 5: 1, 2: 6, 6: 2, 8: 13, 13: 8, 12: 17, 17: 12, 18: 13, 20: 5 };
function parodyKoWord(w, key) {
  const syl = [...w];
  const cand = syl.map((ch, i) => ({ ch, i })).filter(({ ch }) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 && KO_SWAP[Math.floor(c / 28) % 21] !== undefined;
  });
  if (syl.length < 2 || !cand.length) return w;
  const pool = cand.length > 1 ? cand.filter((x) => x.i > 0) : cand;   // 첫 글자는 되도록 유지
  const { ch, i } = pool[hash(key + w) % pool.length];
  const c = ch.charCodeAt(0) - 0xac00;
  const jong = c % 28, jung = Math.floor(c / 28) % 21, cho = Math.floor(c / 588);
  syl[i] = String.fromCharCode(0xac00 + cho * 588 + KO_SWAP[jung] * 28 + jong);
  return syl.join('');
}
function parodyKo(name, key) {
  // 성(마지막 낱말)에서만 한 글자 — 이름은 그대로
  const parts = name.split(' ');
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parodyKoWord(parts[i], key);
    if (t !== parts[i]) { parts[i] = t; return parts.join(' '); }
  }
  return `${name}오`;
}

// ── 구단 이름 변형 ──────────────────────────────────
// 흔한 단어(유나이티드 · 시티 · FC · 레알 …)는 그대로 두고, 구단을 구분하는 핵심 단어 하나에서 한 글자만 바꾼다
const KO_GENERIC = new Set(['유나이티드', '시티', 'FC', 'CF', 'AC', 'AS', 'SC', 'SS', 'SSC', 'US', 'UD', 'CD', 'RC', 'RCD', 'SD', 'CA', 'AFC', '레알', '아틀레티코', '아틀레틱', '애슬레틱', '스포르팅', '올랭피크', '올림피크', '데포르티보', '라싱', '레이싱', '앤드', '호브', '1.', 'VfB', 'VfL', 'TSG', 'SV', 'SpVgg', '보루시아', '스타드', '앙제', '칼초', '클루브', '클럽', '원더러스', '로버스', '앨비언', '애슬레틱', '타운', '카운티', '디 ', '데', '델', '드']);
const EN_GENERIC = new Set(['united', 'city', 'fc', 'cf', 'ac', 'as', 'sc', 'ss', 'ssc', 'us', 'ud', 'cd', 'rc', 'rcd', 'sd', 'ca', 'afc', 'real', 'atletico', 'athletic', 'sporting', 'olympique', 'deportivo', 'racing', 'and', 'hove', 'vfb', 'vfl', 'tsg', 'sv', 'spvgg', 'borussia', 'stade', 'calcio', 'club', 'wanderers', 'rovers', 'albion', 'town', 'county', 'de', 'del', 'la', 'le', 'of', 'the', 'hotspur', '1.', 'fk', 'bk', 'if']);
/** 이름에서 바꿀 핵심 단어 (흔한 단어 제외, 가장 긴 것) */
function coreWord(name, generic) {
  const words = name.split(/\s+/).filter((w) => !generic.has(w.toLowerCase()) && !generic.has(w) && !/^[0-9.]+$/.test(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? name.split(/\s+/)[0];
}
function parodyClubKo(name, key) {
  // 한글 낱말이 있으면 그중에서 고른다 (ACR 같은 약자보다 이름 부분을 바꾸기)
  const hangul = name.split(/\s+/).filter((w) => /[가-힣]/.test(w)).join(' ');
  const core = coreWord(hangul || name, KO_GENERIC);
  const out = name.replace(core, parodyKoWord(core, key));
  if (out !== name) return out;
  // 한글이 없는 이름(예: SPAL)은 영문 철자를 바꾼다
  const en = name.replace(core, parodyEnWord(core.length >= 4 ? core : core + 'o', key));
  return en !== name ? en : name.replace(core, core + '오');
}
function parodyClubEn(name, key) {
  const plain = plainAscii(name);
  const core = coreWord(plain, EN_GENERIC);
  const out = plain.replace(core, parodyEnWord(core, key));
  return out === plain ? plain.replace(core, core + 'o') : out;
}

// ── 구단 색 이름 ──────────────────────────────────────
function colorWord(hex) {
  const n = parseInt((hex || '#808080').replace('#', '').slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  let h = 0;
  if (max !== min) h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (l > 0.86) return ['화이트', 'White'];
  if (l < 0.16) return ['블랙', 'Black'];
  if (s < 0.15) return ['그레이', 'Grey'];
  if (h < 15 || h >= 345) return l < 0.33 ? ['클라렛', 'Claret'] : ['레드', 'Red'];
  if (h < 45) return ['오렌지', 'Orange'];
  if (h < 70) return ['옐로', 'Yellow'];
  if (h < 170) return ['그린', 'Green'];
  if (h < 200) return l > 0.5 ? ['스카이', 'Sky'] : ['틸', 'Teal'];
  if (h < 250) return l < 0.3 ? ['네이비', 'Navy'] : ['블루', 'Blue'];
  if (h < 290) return ['퍼플', 'Purple'];
  return l < 0.35 ? ['마룬', 'Maroon'] : ['핑크', 'Pink'];
}
const SUFFIX = [['', ''], [' 유나이티드', ' United'], [' 시티', ' City'], [' 애슬레틱', ' Athletic'], [' 로버스', ' Rovers'], [' 원더러스', ' Wanderers'], [' FC', ' FC']];

const LEAGUE_PARODY = {
  eng1: ['잉글리시 프리미어 디비전', 'English Premier Division'],
  eng2: ['잉글리시 퍼스트 디비전', 'English First Division'],
  esp1: ['리가 이베리카', 'Liga Iberica'],
  esp2: ['리가 이베리카 2', 'Liga Iberica 2'],
  ita1: ['칼초 디비전', 'Calcio Division'],
  ita2: ['칼초 디비전 2', 'Calcio Division 2'],
  ger1: ['도이체 디비전', 'Deutsche Division'],
  ger2: ['도이체 디비전 2', 'Deutsche Division 2'],
  fra1: ['리그 프랑세즈', 'Ligue Francaise'],
  fra2: ['리그 프랑세즈 2', 'Ligue Francaise 2'],
};

// 컵 · 유럽 대회 이름 (실명 → 가상)
const CUP_PARODY = {
  'eng-cup': ['잉글리시 챌린지 컵', 'English Challenge Cup'],
  'esp-cup': ['코파 이베리카', 'Copa Iberica'],
  'ita-cup': ['코파 칼초', 'Coppa Calcio'],
  'ger-cup': ['도이체 포칼', 'Deutscher Pokal'],
  'fra-cup': ['쿠프 프랑세즈', 'Coupe Francaise'],
  ucl: ['컨티넨탈 챔피언스 컵', 'Continental Champions Cup'],
  uel: ['컨티넨탈 리그', 'Continental League'],
};

const slug = (s) => plainAscii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function crestFor(club) {
  const st = CREST_STYLES[club.id];
  if (st) return { ...st };
  const k = club.kits?.home;
  const kp = k?.pattern;
  return {
    shape: NATION_SHAPE[club.nation] || 'shield',
    colors: [k?.primary || '#2a2f2c', k?.secondary || '#f4f4f2', k?.secondary || '#f4f4f2'],
    pattern: ['stripes', 'hoops', 'halves', 'sash'].includes(kp) ? kp : 'solid',
    charge: 'ball',
  };
}

async function publish({ apply = false, log = console.log } = {}) {
  log(`■ 공개용 데이터 만들기${apply ? ' (적용)' : ' (미리보기)'}`);
  const clubFiles = fs.readdirSync(CLUBS_DIR).filter((f) => f.endsWith('.json'));
  const clubs = clubFiles.map((f) => readJson(path.join(CLUBS_DIR, f)));

  // ② 구단 패러디 이름 (명성 높은 구단이 짧은 이름을 갖도록 정렬)
  const latestRep = new Map();
  for (const s of fs.readdirSync(SEASONS_DIR).sort()) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
    for (const f of fs.readdirSync(path.join(SEASONS_DIR, s, l)).filter((x) => !x.startsWith('_'))) {
      const j = readJson(path.join(SEASONS_DIR, s, l, f));
      latestRep.set(j.club, j.reputation);
    }
  }
  const clubMap = {}, usedNames = new Set(), usedShort = new Set();
  for (const c of [...clubs].sort((a, b) => (latestRep.get(b.id) ?? 0) - (latestRep.get(a.id) ?? 0) || a.id.localeCompare(b.id))) {
    // 실제 구단 이름에서 핵심 단어 한 글자만 바꾼다 (흔한 단어는 그대로) — 겹치면 다른 글자로
    let ko, en;
    for (let n = 0; n < 6; n++) {
      ko = parodyClubKo(c.ko || c.name, c.id + (n ? '#' + n : ''));
      en = parodyClubEn(c.name, c.id + (n ? '#' + n : ''));
      if (!usedNames.has(en) && !usedNames.has(ko)) break;
    }
    usedNames.add(en); usedNames.add(ko);
    const core = coreWord(plainAscii(en), EN_GENERIC).replace(/[^A-Za-z]/g, '').toUpperCase();
    // 약칭: 핵심 단어 앞 세 글자 → 겹치면 첫 글자 + 뒤쪽 글자 조합 → 다른 낱말 머리글자 (숫자는 쓰지 않음)
    const letters = core.split('');
    const initials = plainAscii(en).split(/\s+/).map((w) => w[0]).filter((x) => /[A-Za-z]/.test(x)).join('').toUpperCase();
    const cands = [core.slice(0, 3)];
    for (let a = 1; a < letters.length; a++) for (let b = a + 1; b < letters.length; b++) cands.push(letters[0] + letters[a] + letters[b]);
    if (initials.length >= 2) cands.push(initials.slice(0, 3), (initials + core).slice(0, 3));
    let short = cands.find((x) => x.length === 3 && !usedShort.has(x)) ?? core.slice(0, 3) + usedShort.size;
    usedShort.add(short);
    const crest = crestFor(c);
    // 구단 ID는 이름과 무관한 고정 코드 (패러디 이름을 다듬어도 세이브가 깨지지 않게)
    clubMap[c.id] = { id: 'c' + hash('club:' + c.id).toString(36).padStart(6, '0'), ko, en, short, crest: { ...crest, mark: short } };
  }

  // ③ 선수 ID · 이름
  const koNames = {};
  const LOC = path.join(DATA, 'locale', 'ko');
  for (const f of fs.readdirSync(LOC).filter((x) => x.startsWith('players') && x.endsWith('.json')).sort()) {
    for (const [id, v] of Object.entries(readJson(path.join(LOC, f)))) koNames[id] ??= v;
  }
  const playerMap = {}, usedPid = new Set();
  const pidOf = (realId) => {
    if (playerMap[realId]) return playerMap[realId].id;
    let n = 0, pid;
    do { pid = 'p' + hash(realId + (n ? `#${n}` : '')).toString(36).padStart(7, '0'); n++; } while (usedPid.has(pid));
    usedPid.add(pid);
    playerMap[realId] = { id: pid };
    return pid;
  };

  // ④ 시즌 파일 변환
  const out = new Map();   // 경로 → 내용
  const mapClub = (id) => clubMap[id]?.id ?? slug(id);
  const mapLoan = (loan) => (loan == null ? loan : typeof loan === 'string' ? mapClub(loan) : { ...loan, from: mapClub(loan.from) });
  let players = 0;
  for (const s of fs.readdirSync(SEASONS_DIR).sort()) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
    const dir = path.join(SEASONS_DIR, s, l);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const j = readJson(path.join(dir, f));
      if (f === '_league.json') {
        out.set(path.join('seasons', s, l, '_league.json'), { ...j, clubs: j.clubs.map(mapClub).sort(), ...(j.standings ? { standings: j.standings.map(mapClub) } : {}) });
        continue;
      }
      const squad = j.squad.map((p) => {
        players++;
        const pid = pidOf(p.id);
        const pm = playerMap[p.id];
        pm.name ??= parodyEn(p.name, p.id);
        const ko = koNames[p.id]?.name;
        pm.ko ??= ko ? parodyKo(ko, p.id) : null;
        const q = { ...p, id: pid, name: pm.name, birth: p.birth ? `${p.birth.slice(0, 7)}-01` : p.birth };
        if (p.loan !== undefined) q.loan = mapLoan(p.loan);
        return q;
      });
      const cid = mapClub(j.club);
      out.set(path.join('seasons', s, l, `${cid}.json`), { ...j, club: cid, squad });
    }
  }

  // ⑤ 구단 · 리그 · 이름 파일
  for (const c of clubs) {
    const m = clubMap[c.id];
    out.set(path.join('clubs', `${m.id}.json`), {
      id: m.id, name: m.en, ko: m.ko, short: m.short, nation: c.nation, city: c.city ? plainAscii(c.city) : undefined,
      founded: c.founded, kits: c.kits, rivals: (c.rivals || []).map(mapClub), crest: m.crest,
    });
  }
  const leagues = readJson(path.join(DATA, 'meta', 'leagues.json'));
  out.set(path.join('meta', 'leagues.json'), {
    ...leagues,
    leagues: leagues.leagues.map((l) => {
      const [ko, en] = LEAGUE_PARODY[l.id] || [`${l.nation} ${l.level}부 리그`, `${l.nation} Division ${l.level}`];
      return { ...l, ko, en };
    }),
    cups: (leagues.cups || []).map((c) => {
      const [ko, en] = CUP_PARODY[c.id] || [`${c.nation} 컵`, `${c.nation} Cup`];
      return { ...c, ko, en };
    }),
  });
  out.set(path.join('meta', 'nations.json'), readJson(path.join(DATA, 'meta', 'nations.json')));
  // 데이터 형식 버전: ID 체계가 바뀌면 올린다 (게임이 옛 세이브를 알아보는 데 씀)
  out.set(path.join('meta', 'version.json'), { idScheme: 2 });
  const koOut = {};
  for (const pm of Object.values(playerMap)) if (pm.ko) koOut[pm.id] = { name: pm.ko, short: pm.ko.split(' ').slice(-1)[0] };
  out.set(path.join('locale', 'ko', 'players.json'), koOut);

  // 보고
  const ex = ['mohamed-salah-1992', 'virgil-van-dijk-1991', 'son-heung-min-1992', 'lionel-messi-1987'].filter((id) => playerMap[id]);
  log(`  구단 ${clubs.length}개 · 선수 ${Object.keys(playerMap).length}명 · 선수 항목 ${players}개`);
  for (const id of ['liverpool', 'man-utd', 'man-city', 'arsenal', 'chelsea', 'tottenham', 'real-madrid', 'barcelona', 'juventus', 'psg']) {
    if (clubMap[id]) log(`  ${id} → ${clubMap[id].ko} (${clubMap[id].en}, ${clubMap[id].short})`);
  }
  for (const id of ex) log(`  ${koNames[id]?.name ?? id} → ${playerMap[id].ko} (${playerMap[id].name})`);
  if (!apply) return;

  // 쓰기: 기존 data-public을 지우고 새로 (남은 옛 파일 방지)
  fs.rmSync(PUB, { recursive: true, force: true });
  for (const [rel, data] of out) writeJsonIfChanged(path.join(PUB, rel), data);
  fs.writeFileSync(path.join(PUB, 'README.md'), [
    '# 공개용 게임 데이터 (data-public)',
    '',
    '`node tools/data_pipeline publish --apply` 로 만든 **패러디 이름 데이터**입니다. 게임은 기본으로 이 데이터를 씁니다.',
    '',
    '- 선수 · 구단 · 리그 이름은 실제 이름을 규칙으로 변형한 가상의 이름입니다.',
    '- 생년월일은 연 · 월만 남겼습니다.',
    '- 능력치 · 주급 · 예산 · 명성은 추정치이며 실제 공식 수치가 아닙니다.',
    '- 출처: Wikidata (CC0), English Wikipedia (CC BY-SA 4.0). 이 데이터는 CC BY-SA 4.0으로 배포됩니다.',
    '- 실명 데이터는 저장소에 없습니다. 원하면 파이프라인으로 각자 만들 수 있습니다 (README 참고).',
    '',
  ].join('\n'));
  // 실제 → 공개 ID 대응표 (내 PC에만, 저장소 제외)
  writeJsonIfChanged(path.join(CANONICAL_DIR, 'public-map.json'), {
    clubs: Object.fromEntries(Object.entries(clubMap).map(([k, v]) => [k, v.id])),
    players: Object.fromEntries(Object.entries(playerMap).map(([k, v]) => [k, v.id])),
  });
  // 실명 데이터의 구단 파일에도 엠블럼 정보 (머리글자는 실제 약칭)
  for (const f of clubFiles) {
    const c = readJson(path.join(CLUBS_DIR, f));
    writeJsonIfChanged(path.join(CLUBS_DIR, f), { ...c, crest: crestFor(c) });
  }
  log(`  data-public/ 파일 ${out.size}개 작성`);
}

module.exports = { publish, parodyEn, parodyKo, colorWord };
