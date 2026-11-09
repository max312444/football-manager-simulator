// 구축: 출처(Wikidata)에서 리그 시즌 데이터를 새로 만든다 (기존 리그가 없는 경우)
//   시즌 참가 구단 → 구단 ID 연결 → 시즌별 소속 선수 → 필터(유스·임대 나감·나이) → 기존 JSON 형식으로 출력
// 사실 정보(명단·생일·국적·포지션·키)는 출처 그대로, 능력치·주급·구단 재정은 자체 추정 모델(derived)
// 기본은 미리보기. --apply 일 때만 파일을 쓰고, 이미 있는 시즌 파일은 덮어쓰지 않는다(--overwrite 제외)
const fs = require('fs');
const path = require('path');
const { DATA, SEASONS_DIR, CLUBS_DIR, CANONICAL_DIR, LEAGUES, FIRST_SEASON, LAST_SEASON, snapshotDate } = require('../config');
const { readJson, writeJsonIfChanged, normName } = require('../lib/util');
const wikidata = require('../providers/wikidata');
const wikipedia = require('../providers/wikipedia');
const { membershipAt, PLAYERS_FILE } = require('./resolve');

const WIKIPEDIA_FROM = 2007; // 이 시즌부터 위키백과 선수단 표를 명단 1순위로 쓴다 (그 이전 판은 표 형식이 제각각)
const POS_GROUP = { GK: ['GK'], DF: ['CB', 'LB', 'RB', 'LWB', 'RWB'], MF: ['CM', 'DM', 'AM', 'LM', 'RM'], FW: ['ST', 'LW', 'RW'] };
const nationCodes = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'meta', 'nations.json'), 'utf8')).nations.map(n => n.code));
const { CLUBS_FILE } = require('./clubs');
const model = require('./model');

const ALIASES_FILE = path.join(CANONICAL_DIR, 'club-aliases.json'); // { "정규화된 위키백과 제목": "club-id" }
const STRIP = new Set(['fc', 'cf', 'cd', 'rcd', 'sd', 'ud', 'ca', 'rc', 'ac', 'as', 'ss', 'us', 'ssc', 'afc', 'sc', 'bc', 'acf', 'uc',
  'cfc', 'calcio', 'club', 'de', 'del', 'futbol', 'vfb', 'vfl', 'fsv', 'bsc', 'rb', 'msv', 'spvgg', 'osc', 'ogc', 'hsc', 'aj', 'sco',
  'es', 'fco', 'acr', 'acn', 'ssd', 'sv', 'tsg', 'f', 'c', 'a', 'l', 'r']);

// DATA_GUIDE.md에 고정해 둔 구단 ID 목록
function fixedClubIds() {
  const guide = fs.readFileSync(path.join(DATA, 'DATA_GUIDE.md'), 'utf8');
  return new Set([...guide.matchAll(/구단 ID \(고정\)\*\*:([^\n]+)/g)].flatMap(m => [...m[1].matchAll(/`([a-z0-9-]+)`/g)].map(x => x[1])));
}

function slugClub(title) {
  return normName(title).split(' ').filter(t => t && !STRIP.has(t) && !/^\d+$/.test(t)).join('-');
}

function clubIdFor(team, ctx) {
  if (ctx.byQid.has(team.qid)) return { id: ctx.byQid.get(team.qid), method: 'known' };
  const title = team.enwiki || team.label || team.qid;
  const alias = ctx.aliases[normName(title)];
  if (alias) return { id: alias, method: 'alias' };
  const slug = slugClub(title);
  if (ctx.fixed.has(slug)) return { id: slug, method: 'exact' };
  const ends = [...ctx.fixed].filter(id => slug.endsWith('-' + id)).sort((a, b) => b.length - a.length)[0];
  if (ends) return { id: ends, method: 'suffix' };
  const starts = [...ctx.fixed].filter(id => slug.startsWith(id + '-')).sort((a, b) => b.length - a.length)[0];
  if (starts) return { id: starts, method: 'prefix' };
  return { id: slug, method: 'new' };
}

function seasonOfLabel(label) {
  const m = label?.match(/(\d{4})\s*[–-]\s*(\d{2,4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

// Wikidata 포지션 이름 → 우리 포지션 코드
function mapPosition(labels) {
  const l = labels.map(s => s.toLowerCase());
  const has = (re) => l.some(s => re.test(s));
  const order = [
    [/goalkeeper/, 'GK'], [/left[- ]back|left wing-back/, 'LB'], [/right[- ]back|right wing-back/, 'RB'],
    [/centre[- ]back|center[- ]back|sweeper|defender/, 'CB'], [/full[- ]back|wing[- ]back/, 'RB'],
    [/defensive midfield/, 'DM'], [/attacking midfield|playmaker/, 'AM'], [/left wing/, 'LW'], [/right wing/, 'RW'],
    [/winger/, 'RW'], [/midfield/, 'CM'], [/forward|striker/, 'ST'],
  ];
  const found = order.filter(([re]) => has(re)).map(([, p]) => p).filter((p, i, a) => a.indexOf(p) === i);
  return { pos: found[0] ?? null, alt: found.slice(1, 3) };
}

function nationLookup() {
  const map = new Map(readJson(path.join(DATA, 'meta', 'nations.json')).nations.map(n => [n.en.toLowerCase(), n.code]));
  const aliases = {
    'ireland': 'IRL', 'republic of ireland': 'IRL', 'united states': 'USA', 'united states of america': 'USA', 'czech republic': 'CZE',
    'ivory coast': 'CIV', "côte d'ivoire": 'CIV', 'democratic republic of the congo': 'COD', 'republic of the congo': 'CGO',
    'south korea': 'KOR', 'turkey': 'TUR', 'türkiye': 'TUR', 'kingdom of the netherlands': 'NED', "people's republic of china": 'CHN',
    'the gambia': 'GAM', 'cape verde': 'CPV', 'russia': 'RUS', 'bosnia and herzegovina': 'BIH', 'kingdom of spain': 'ESP',
    'kingdom of italy': 'ITA', 'germany': 'GER', 'west germany': 'GER', 'kingdom of belgium': 'BEL', 'kingdom of denmark': 'DEN',
    'kingdom of sweden': 'SWE', 'kingdom of norway': 'NOR', 'serbia and montenegro': 'SRB', 'federal republic of yugoslavia': 'SRB',
    'soviet union': 'RUS', 'czechoslovakia': 'CZE', 'north macedonia': 'MKD', 'republic of macedonia': 'MKD', 'curaçao': 'CUW',
  };
  for (const [k, v] of Object.entries(aliases)) map.set(k, v);
  return (label) => map.get(label.toLowerCase()) ?? null;
}

const yearsBetween = (a, b) => (new Date(b) - new Date(a)) / (365.25 * 864e5);

function interval(t) {
  if (!t) return null;
  const [y, m] = t.value.split('-');
  if (t.precision >= 11) return [t.value, t.value];
  if (t.precision === 10) return [`${y}-${m}-01`, `${y}-${m}-28`];
  if (t.precision === 9) return [`${y}-01-01`, `${y}-12-31`];
  return null;
}

// 이 구단 소속 이후에 확실히 시작된 다른 구단(대표팀·산하 팀 제외) 소속으로 "기준일에 이미 떠났는지"를 판단한다
//   - 그 다른 소속이 기준일에도 진행 중 → 임대 나감 또는 이적 (제외)
//   - 다른 소속이 기준일 전에 끝났음 → 임대 복귀로 보고 남긴다
//   - 이 구단 소속에 종료일이 없고 오래전(8년 이상) 연 단위로 시작했는데 35세 이상 → 종료일이 빠진 옛 소속 (제외)
function leftBefore(profile, clubQid, membership, date, age) {
  const ourStart = interval(membership.start)?.[0] ?? '0000';
  const later = profile.careers.map(c => ({ c, s: interval(c.start), e: c.end ? interval(c.end) : null }))
    .filter(({ c, s, e }) => !c.national && c.club !== clubQid && c.parent !== clubQid && s && !(c.end && !e) && s[0] > ourStart && s[1] <= date);
  if (later.some(({ e }) => !e || e[0] >= date)) return 'elsewhere';
  if (!membership.end && (membership.start?.precision ?? 0) <= 9 && age >= 35 && yearsBetween(ourStart, date) >= 8) return 'stale';
  return null;
}

async function buildLeague({ league, apply, overwrite, seasonFilter, log }) {
  const cfg = LEAGUES[league];
  if (!cfg) throw new Error(`config.LEAGUES에 ${league} 없음`);
  const toCode = nationLookup();
  const clubMap = readJson(CLUBS_FILE, {});
  const playerMap = readJson(PLAYERS_FILE, {});
  const ctx = {
    fixed: fixedClubIds(),
    aliases: readJson(ALIASES_FILE, {}),
    byQid: new Map(Object.entries(clubMap).filter(([, v]) => v.wikidata && v.status === 'valid').map(([id, v]) => [v.wikidata, id])),
  };
  const idOfQid = new Map(Object.entries(playerMap).filter(([, v]) => v.wikidata).map(([id, v]) => [v.wikidata, id]));
  const usedIds = new Set(Object.keys(playerMap));

  // ① 시즌·참가 구단
  log('① 시즌 참가 구단');
  const bySeason = new Map();
  const known = new Map();      // 이 리그에 한 번이라도 참가한 구단 (시즌 보완용)
  const allCounts = [];
  for (const s of await wikidata.leagueSeasons(cfg.wikidata)) {
    const season = seasonOfLabel(s.label);
    if (!season || +season.slice(0, 4) < FIRST_SEASON || +season.slice(0, 4) > LAST_SEASON) continue;
    for (const t of s.teams) known.set(t.qid, t);
    if (s.teams.length >= 16) allCounts.push(s.teams.length);
    if (seasonFilter && season !== seasonFilter) continue;
    if (!bySeason.has(season) || bySeason.get(season).teams.length < s.teams.length) bySeason.set(season, s);
  }
  const counts = allCounts.sort((a, b) => a - b);
  const typical = counts[counts.length >> 1] ?? 20;
  let missingSeasons = [];
  const incomplete = [];
  for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) {
    const s = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    if (seasonFilter && s !== seasonFilter) continue;
    const n = bySeason.get(s)?.teams.length ?? 0;
    if (n < 16) missingSeasons.push(s);
    else if (n < typical) incomplete.push(s);
  }
  const wikiTeams = async (season) => {
    const title = `${season.slice(0, 4)}–${season.slice(5)} ${cfg.enwiki}`;
    // 순위표 템플릿의 구단만 사용 (문서 전체 링크는 다른 시즌 구단이 섞임)
    const { teams: tableTitles } = await wikipedia.seasonTableTeams(title);
    const canon = await wikipedia.resolveTitles(tableTitles);
    const hits = await wikidata.byEnwikiTitles([...new Set(Object.values(canon).filter(Boolean))]);
    return { title, teams: [...new Set(hits.map(h => h.qid))].filter(q => known.has(q)).map(q => known.get(q)) };
  };
  // Wikidata 참가 구단이 평소보다 적은 시즌 → 위키백과 시즌 문서에서 빠진 구단을 찾는다.
  // 합친 결과가 평소 구단 수와 정확히 같을 때만 반영 (다른 시즌 구단이 섞이는 것 방지)
  if (incomplete.length && cfg.enwiki) {
    for (const season of incomplete) {
      const cur = bySeason.get(season);
      const { title, teams } = await wikiTeams(season);
      const have = new Set(cur.teams.map(t => t.qid));
      const add = teams.filter(t => !have.has(t.qid));
      if (cur.teams.length + add.length === typical) {
        bySeason.set(season, { ...cur, teams: [...cur.teams, ...add], supplementedFromWikipedia: add.map(t => t.qid) });
        log(`  ${season}: 참가 구단 ${cur.teams.length}개 → 위키백과 "${title}"에서 ${add.length}개 보완 (${add.map(t => t.enwiki || t.label).join(', ')})`);
      } else log(`  ${season}: 참가 구단 ${cur.teams.length}개 (평소 ${typical}개) · 위키백과 후보 ${add.length}개라 보완하지 않음 → 검토 필요`);
    }
  }
  // Wikidata에 참가 구단이 없는 시즌 → 위키백과 시즌 문서("2019–20 La Liga")의 링크 중
  // 같은 리그의 다른 시즌에 참가한 구단만 골라 채운다. 구단 수가 평소와 2개 넘게 다르면 채우지 않는다
  if (missingSeasons.length && cfg.enwiki) {
    for (const season of missingSeasons) {
      const { title, teams } = await wikiTeams(season);
      if (Math.abs(teams.length - typical) <= 2) {
        bySeason.set(season, { qid: null, label: title, teams, fromWikipedia: true });
        log(`  ${season}: 위키백과 "${title}"에서 참가 구단 ${teams.length}개 보완`);
      } else log(`  ${season}: 위키백과에서 찾은 구단 ${teams.length}개 (평소 ${typical}개) → 보완하지 않음`);
    }
    missingSeasons = missingSeasons.filter(s => (bySeason.get(s)?.teams.length ?? 0) < 16);
  }
  for (const s of [...bySeason.keys()]) if (bySeason.get(s).teams.length < 16) bySeason.delete(s);
  const seasons = [...bySeason.keys()].sort();
  log(`  시즌 ${seasons.length}개${missingSeasons.length ? ` · 참가 구단 정보 없음: ${missingSeasons.join(', ')}` : ''}`);

  // ② 구단 ID 연결
  const teamIds = new Map();
  const clubReport = { known: 0, alias: 0, exact: 0, suffix: 0, prefix: 0, new: [] };
  for (const s of bySeason.values()) for (const t of s.teams) {
    if (teamIds.has(t.qid)) continue;
    const r = clubIdFor(t, ctx);
    teamIds.set(t.qid, r.id);
    if (r.method === 'new') clubReport.new.push(`${r.id} (${t.enwiki || t.label})`); else clubReport[r.method]++;
    clubMap[r.id] ??= { wikidata: t.qid, label: t.enwiki || t.label, status: 'valid', method: `league-participant:${r.method}` };
  }
  const idCount = new Map();
  for (const id of teamIds.values()) idCount.set(id, (idCount.get(id) || 0) + 1);
  const clashes = [...idCount].filter(([, n]) => n > 1).map(([id]) => id);
  log(`② 구단 ${teamIds.size}개 연결 · ${JSON.stringify({ ...clubReport, new: clubReport.new.length })}`);
  if (clubReport.new.length) log(`  고정 목록에 없는 구단: ${clubReport.new.join(', ')}`);
  if (clashes.length) throw new Error(`서로 다른 구단이 같은 ID로 연결됨: ${clashes.join(', ')} — club-aliases.json에 지정 필요`);

  // ③ 구단 신상 · 소속 기록
  log('③ 구단 정보·소속 기록 수집');
  const clubInfo = await wikidata.clubProfiles([...teamIds.keys()]);
  const memberships = {};
  for (const [q, id] of teamIds) memberships[id] = await wikidata.clubMemberships(q);

  // ④ 시즌별 후보 선수 → 신상 조회
  //   2007/08 이후는 위키백과 구단 문서의 그 시점 판(1군 선수단 표)이 1순위, 16명 미만이면 Wikidata 소속 기록
  const candBySeasonClub = new Map();
  const allQids = new Set();
  const wpRosters = new Map();
  for (const season of seasons) {
    if (+season.slice(0, 4) < WIKIPEDIA_FROM) continue;
    for (const t of bySeason.get(season).teams) {
      const title = clubInfo[t.qid]?.enwiki;
      if (!title) continue;
      let r = await wikipedia.squadAt(title, snapshotDate(season));
      let players = r.players.filter(p => p.title);
      // 1군 외 선수가 섞여 30명을 넘으면 등번호 있는 선수만 남긴다
      if (players.length > 30 && players.filter(p => p.number).length >= 18) players = players.filter(p => p.number);
      if (players.length >= 16) wpRosters.set(`${season}/${teamIds.get(t.qid)}`, { ...r, players });
    }
  }
  const titleMap = await wikipedia.resolveTitles([...new Set([...wpRosters.values()].flatMap(r => r.players.map(p => p.title)))]);
  const qidOfTitle = new Map();
  for (const h of await wikidata.byEnwikiTitles([...new Set(Object.values(titleMap).filter(Boolean))])) qidOfTitle.set(h.enwiki, h.qid);
  log(`  위키백과 선수단 ${wpRosters.size}개 구단 시즌 · 문서 제목 → Wikidata ${qidOfTitle.size}명 연결`);

  for (const season of seasons) {
    const date = snapshotDate(season);
    for (const t of bySeason.get(season).teams) {
      const id = teamIds.get(t.qid);
      const wp = wpRosters.get(`${season}/${id}`);
      if (wp) {
        const cands = [];
        for (const p of wp.players) {
          const q = qidOfTitle.get(titleMap[p.title]);
          if (!q) { wp.unresolved = (wp.unresolved || 0) + 1; continue; }
          if (cands.some(c => c.qid === q)) continue;
          cands.push({ qid: q, number: p.number, nat: p.nat, posGroup: p.posGroup, loanFrom: p.loanFrom, presence: 'definite', fromWikipedia: true });
          allQids.add(q);
        }
        candBySeasonClub.set(`${season}/${id}`, { club: id, clubQid: t.qid, season, date, cands, source: { roster: 'wikipedia', revid: wp.revid, unresolved: wp.unresolved || 0 } });
        continue;
      }
      const best = new Map();
      for (const m of memberships[id]) {
        // 말이 안 되는 날짜(예: 1930~2930)는 잘못 입력된 기록으로 버린다
        if (m.start && (+m.start.value.slice(0, 4) < 1950 || (m.end && +m.end.value.slice(0, 4) > LAST_SEASON + 3))) continue;
        const presence = membershipAt(m, date);
        if (presence === 'none') continue;
        if (presence === 'possible' && m.apps === 0) continue;
        const prev = best.get(m.qid);
        if (!prev || (prev.presence === 'possible' && presence === 'definite')) best.set(m.qid, { ...m, presence });
      }
      candBySeasonClub.set(`${season}/${id}`, { club: id, clubQid: t.qid, season, date, cands: [...best.values()], source: { roster: 'wikidata' } });
      for (const q of best.keys()) allQids.add(q);
    }
  }
  log(`④ 후보 선수 ${allQids.size}명 신상 조회`);
  const profiles = await wikidata.playerProfiles([...allQids]);

  // ⑤ 명단 확정 · 기존 형식으로 변환
  const stats = { clubSeasons: 0, players: 0, excluded: { loanedOut: 0, staleMembership: 0, weakEvidence: 0, notFootballer: 0, age: 0, noDob: 0, noNation: 0, youthNoApps: 0 }, reusedIds: 0, newIds: 0, verify: 0 };
  const outputs = [];
  for (const { club, clubQid, season, date, cands, source } of candBySeasonClub.values()) {
    const year = +season.slice(0, 4);
    const squad = [];
    for (const c of cands) {
      const p = profiles[c.qid];
      if (!p?.dob) { stats.excluded.noDob++; continue; }
      const age = yearsBetween(p.dob.value, date);
      if (!c.fromWikipedia) {
        // Wikidata 소속 기록만 있을 때의 필터 (위키백과 1군 명단에는 적용하지 않음)
        if (!p.footballer) { stats.excluded.notFootballer++; continue; }
        // 연도만 있고 종료일·출전 기록이 없는 오래된 소속은 근거가 약해 제외
        if (c.apps == null && !c.end && (c.start?.precision ?? 0) <= 9 && yearsBetween(c.start.value, date) >= 2) { stats.excluded.weakEvidence++; continue; }
        if (age < 16 || age > 42) { stats.excluded.age++; continue; }
        const left = leftBefore(p, clubQid, c, date, age);
        if (left) { stats.excluded[left === 'elsewhere' ? 'loanedOut' : 'staleMembership']++; continue; }
        // 출전 기록이 없고 만 20세 미만 → 유스로 본다
        if (c.apps === 0 || (c.apps == null && age < 20 && (p.sitelinks ?? 0) < 8)) { stats.excluded.youthNoApps++; continue; }
      }
      const wpNation = c.nat ? (nationCodes.has(c.nat) ? c.nat : toCode(c.nat)) : null;
      const nations = [...new Set([wpNation, ...[...p.sportCountries, ...p.citizenships].map(toCode)].filter(Boolean))];
      if (!nations.length) { stats.excluded.noNation++; continue; }

      let id = idOfQid.get(c.qid);
      if (id) stats.reusedIds++;
      else {
        const base = `${normName(p.enwiki || p.label || c.qid).replace(/ /g, '-')}-${p.dob.value.slice(0, 4)}`;
        id = base;
        for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
        usedIds.add(id);
        idOfQid.set(c.qid, id);
        playerMap[id] = { wikidata: c.qid, method: 'build', status: 'valid' };
        stats.newIds++;
      }
      const { pos, alt } = mapPosition(p.positions);
      const caps = p.careers.filter(x => x.national && x.start && x.start.value <= date).reduce((a, x) => a + (x.apps ?? 0), 0);
      const ovr = model.overall({ sitelinks: p.sitelinks ?? 1, caps, age, league });
      // 위키백과 포지션 묶음(GK/DF/MF/FW)이 있으면 그 안에서 Wikidata 세부 포지션을 쓴다
      const group = POS_GROUP[c.posGroup];
      const position = group ? (group.includes(pos) ? pos : group[0]) : (pos ?? 'CM');
      const exactEnd = c.end?.precision >= 11 && c.end.value >= date ? c.end.value : null;
      const loan = c.loanFrom ? clubIdFor({ qid: null, enwiki: c.loanFrom }, ctx).id : null;
      const verify = (!pos && !group) || p.dob.precision < 11 || c.presence === 'possible';
      if (verify) stats.verify++;
      squad.push({
        id,
        name: (p.enwiki || p.label || c.qid).replace(/\s*\(.*?\)\s*/g, ''),
        birth: p.dob.precision >= 11 ? p.dob.value : `${p.dob.value.slice(0, 4)}-07-01`,
        nation: nations[0],
        ...(nations[1] ? { nation2: nations[1] } : {}),
        height: p.heightCm && p.heightCm >= 155 && p.heightCm <= 210 ? p.heightCm : null,
        foot: null,
        number: c.number ?? null,
        pos: position,
        ...(alt.length ? { alt: alt.filter(a => a !== position) } : {}),
        attrs: model.attributes(ovr, position, `${id}:${season}`),
        wage: model.weeklyWage(ovr, year),
        contract: exactEnd,
        ...(loan ? { loan } : {}),
        ...(verify ? { verify: true } : {}),
        _ovr: ovr,
      });
    }
    // 같은 등번호가 겹치면 뒤쪽은 비운다 (출처 등번호는 드물고, 겹치면 확인 불가)
    const seenNum = new Set();
    for (const p of squad) { if (p.number != null) { if (seenNum.has(p.number)) p.number = null; else seenNum.add(p.number); } }
    squad.sort((a, b) => (a.number ?? 100) - (b.number ?? 100) || b._ovr - a._ovr || a.id.localeCompare(b.id));

    const top = squad.map(p => p._ovr).sort((a, b) => b - a).slice(0, 15);
    const reputation = Math.round(top.reduce((a, v) => a + v, 0) / Math.max(1, top.length));
    for (const p of squad) delete p._ovr;
    const wages = squad.reduce((a, p) => a + p.wage, 0);
    const info = clubInfo[clubQid] || {};
    outputs.push({
      season, club, info, clubQid,
      file: {
        season, club, league,
        reputation,
        finance: { balance: wages * 30, transferBudget: wages * 20, wageBudget: Math.round(wages * 1.1) },
        facilities: { training: reputation >= 80 ? 5 : reputation >= 74 ? 4 : reputation >= 68 ? 3 : 2, youth: reputation >= 78 ? 4 : 3 },
        stadiumCapacity: info.capacity ?? null,
        estimated: true,
        source: source.roster === 'wikipedia'
          ? { roster: `enwiki:${clubInfo[clubQid]?.enwiki}@${source.revid}`, rosterLicense: 'CC BY-SA 4.0', facts: 'wikidata', license: 'CC0-1.0', derived: model.MODEL_VERSION, snapshot: date }
          : { roster: 'wikidata', facts: 'wikidata', license: 'CC0-1.0', derived: model.MODEL_VERSION, snapshot: date },
        squad,
      },
    });
    stats.clubSeasons++;
    stats.players += squad.length;
  }

  const sizes = outputs.map(o => o.file.squad.length).sort((a, b) => a - b);
  log(`⑤ 구단 시즌 ${stats.clubSeasons}개 · 선수 항목 ${stats.players}개 (선수단 크기 최소 ${sizes[0]} · 중간 ${sizes[sizes.length >> 1]} · 최대 ${sizes[sizes.length - 1]})`);
  log(`  기존 ID 재사용 ${stats.reusedIds} · 새 ID ${stats.newIds} · 검토 표시 ${stats.verify} · 제외 ${JSON.stringify(stats.excluded)}`);

  if (!apply) return { stats, outputs, missingSeasons, preview: true };

  // ⑥ 쓰기
  let written = 0, skipped = 0, guarded = 0;
  const leagueFiles = new Map();
  for (const o of outputs) {
    const p = path.join(SEASONS_DIR, o.season, league, `${o.club}.json`);
    if (fs.existsSync(p) && !overwrite) { skipped++; continue; }
    // 안전장치: 이미 선수단이 충분한 파일을 훨씬 적은 선수단으로 덮어쓰지 않는다 (출처 조회 실패로 빈 명단이 나온 경우)
    if (fs.existsSync(p)) {
      const prev = readJson(p, { squad: [] }).squad.length;
      if (prev >= 16 && o.file.squad.length < Math.max(16, prev * 0.6)) {
        guarded++;
        log(`  ⚠ ${o.season} ${o.club}: 새 선수단 ${o.file.squad.length}명 < 기존 ${prev}명 → 기존 파일 유지`);
        (leagueFiles.get(o.season) || leagueFiles.set(o.season, []).get(o.season)).push(o.club);
        continue;
      }
    }
    if (writeSeasonFile(p, o.file)) written++;
    (leagueFiles.get(o.season) || leagueFiles.set(o.season, []).get(o.season)).push(o.club);
    writeClubMaster(o.club, o.info, cfg.nation);
  }
  for (const [season, clubs] of leagueFiles) {
    writeJsonIfChanged(path.join(SEASONS_DIR, season, league, '_league.json'), { season, league, clubs: clubs.sort() });
  }
  writeJsonIfChanged(CLUBS_FILE, clubMap);
  writeJsonIfChanged(PLAYERS_FILE, playerMap);
  const metaFile = path.join(CANONICAL_DIR, 'attribute-sources.json');
  const meta = readJson(metaFile, {});
  meta[league] ??= {
    attribute_source: 'pipeline-model', attribute_model_version: model.MODEL_VERSION, attribute_type: 'derived',
    attribute_confidence: 'low', attribute_updated_at: new Date().toISOString().slice(0, 10),
    note: 'Wikidata 지명도·국가대표 출전·나이·리그 수준으로 추정. 실제 능력치 아님',
  };
  writeJsonIfChanged(metaFile, meta);
  log(`⑥ 파일 ${written}개 작성 · 이미 있어서 건너뜀 ${skipped}개${guarded ? ` · 안전장치로 유지 ${guarded}개` : ""}`);
  return { stats, written, skipped, missingSeasons };
}

// 기존 시즌 파일과 같은 서식(선수 한 명 = 2~3줄)으로 쓴다
function writeSeasonFile(p, d) {
  const j = (v) => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  const player = (x) => {
    const { attrs, wage, contract, verify, ...head } = x;
    const tail = { wage, contract, ...(verify ? { verify } : {}) };
    return `    ${j(head).slice(0, -2)},\n      "attrs": ${j(attrs)},\n      ${j(tail).slice(2)}`;
  };
  const text = `{
  "season": "${d.season}",
  "club": "${d.club}",
  "league": "${d.league}",
  "reputation": ${d.reputation},
  "finance": ${j(d.finance)},
  "facilities": ${j(d.facilities)},
  "stadiumCapacity": ${d.stadiumCapacity},
  "estimated": true,
  "source": ${j(d.source)},
  "squad": [
${d.squad.map(player).join(',\n')}
  ]
}
`;
  JSON.parse(text);
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.tmp`, text);
  fs.renameSync(`${p}.tmp`, p);
  return true;
}

function writeClubMaster(id, info, nation) {
  const p = path.join(CLUBS_DIR, `${id}.json`);
  if (fs.existsSync(p)) return;
  const name = (info.enwiki || info.en || id).replace(/\s*\(.*?\)\s*/g, '');
  const short = ((info.shorts || []).find(s => /^[A-Z0-9]{3,4}$/.test(s)) || id.replace(/-/g, '').slice(0, 3)).toUpperCase();
  const [c1 = '#FFFFFF', c2 = '#000000'] = (info.colors || []).map(h => `#${h.toUpperCase()}`);
  writeJsonIfChanged(p, {
    id, name, ko: info.ko || name, short, nation, city: info.city ?? null, founded: info.founded ?? null,
    kits: { home: { primary: c1, secondary: c2, pattern: 'solid' }, away: { primary: c2, secondary: c1, pattern: 'solid' } },
    kitsEstimated: true, source: 'wikidata',
  });
}

module.exports = { buildLeague, slugClub };
