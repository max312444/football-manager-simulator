// 감독 데이터: 시즌별 구단 감독 + 감독 능력 (실력은 진짜 실력 — 우리 시즌 데이터의 실제 성적으로 계산)
//   node tools/data_pipeline managers [--apply]
//   → data/history/managers.json (실명, 내 PC에만) · 보고서 data/_pipeline/reports/managers.txt
//   → 공개용 패러디 판은 publish --apply 가 data-public/history/managers.json 으로 만든다
//
// 출처 (우선순위)
//  ① 영어 위키백과 리그 시즌 문서의 "Managerial changes" 표 (+ 같은 문서 "Personnel and kits" 표) — 날짜가 있는 교체 기록
//  ② Wikidata: 구단의 감독(P286) · 사람의 감독 소속(P6087, 직책 한정자로 수석 코치 · 골키퍼 코치 등은 뺀다) — 일 · 월 단위 날짜
//  ③ 위키백과 "Personnel" 표만 있는 시즌 (교체 표 없음 — 시즌 끝 기준일 수 있음)
//  ④ Wikidata 연 단위 날짜
//  ⑤ 구단 시즌 문서("2000–01 Liverpool F.C. season") 정보 상자의 manager 칸
//  모두 없으면 가상 감독 (같은 구단에서 이어지는 빈 시즌은 같은 가상 감독)
//
// 시즌 감독 = 그 시즌 9월 15일에 맡고 있던 감독 (개막 후 6주 안에 바뀌었으면 새 감독)
// 능력 계산용 몫 = 9/15 · 11/15 · 2/1 · 4/15 네 시점에 맡은 감독에게 1/4씩
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA, SEASONS_DIR, CANONICAL_DIR, PIPELINE_DIR, LEAGUES } = require('../config');
const { readJson, writeJsonIfChanged, normName } = require('../lib/util');
const { getJson } = require('../lib/http');
const wikidata = require('../providers/wikidata');
const wikipedia = require('../providers/wikipedia');
const wt = require('../lib/wikitable');

const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';
const OUT_FILE = path.join(DATA, 'history', 'managers.json');
const OVERRIDE_FILE = path.join(CANONICAL_DIR, 'managers-override.json');
const REPORT_FILE = path.join(PIPELINE_DIR, 'reports', 'managers.txt');
const qid = (uri) => uri?.split('/').pop();

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 감독 ID: 이름과 무관한 고정 코드 (Wikidata 항목 또는 이름 · 가상 감독은 구단 + 첫 시즌)
const managerIdOf = (key) => 'm' + hash('manager:' + key).toString(36).padStart(7, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const yearsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);

// ── 시즌 데이터 ───────────────────────────────────────
function loadSeasonData() {
  const hist = readJson(path.join(DATA, 'history', 'players.json'));
  // 선수별 시즌 능력 (게임 엔진 기준 OVR, npm run history -- real 로 만든 파일)
  const ovr = new Map();   // `${season}|${pid}` → ovr
  if (hist) {
    for (const [pid, rows] of Object.entries(hist.p)) for (const r of rows.split(',')) {
      const [si, , o] = r.split('.').map(Number);
      ovr.set(`${hist.seasons[si]}|${pid}`, o);
    }
  }
  const clubSeasons = [];   // { season, league, club, n, rank, strength, reputation, formation, youth: [{id, age}] }
  for (const s of fs.readdirSync(SEASONS_DIR).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort()) {
    for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
      const meta = readJson(path.join(SEASONS_DIR, s, l, '_league.json'));
      for (const c of meta.clubs) {
        const j = readJson(path.join(SEASONS_DIR, s, l, `${c}.json`));
        if (!j) continue;
        const ref = `${s.slice(0, 4)}-09-01`;
        const ovrs = j.squad.map((p) => ovr.get(`${s}|${p.id}`)).filter((x) => x != null).sort((a, b) => b - a);
        const top = ovrs.slice(0, 14);
        const strength = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
        const youth = j.squad.filter((p) => p.birth && yearsBetween(p.birth, ref) < 24).map((p) => ({ id: p.id, age: Math.floor(yearsBetween(p.birth, ref)) }));
        const rank = meta.standings ? meta.standings.indexOf(c) + 1 : null;
        clubSeasons.push({ season: s, league: l, club: c, n: meta.clubs.length, rank: rank || null, strength, reputation: j.reputation ?? 50, formation: j.formation ?? null, youth });
      }
    }
  }
  // 리그 시즌 안 기대 순위 (선수단 상위 14명 평균 능력 순)
  const groups = new Map();
  for (const cs of clubSeasons) { const k = `${cs.season}|${cs.league}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(cs); }
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => b.strength - a.strength);
    sorted.forEach((cs, i) => { cs.expected = i + 1; });
  }
  return { clubSeasons, ovr, groups };
}

// ── 구단 이름 → 구단 ID ──────────────────────────────
function clubIndex() {
  const canon = readJson(path.join(CANONICAL_DIR, 'clubs.json'));
  const aliases = readJson(path.join(CANONICAL_DIR, 'club-aliases.json'), {});
  const byQid = new Map();
  for (const [id, c] of Object.entries(canon)) if (c.wikidata) byQid.set(c.wikidata, id);
  for (const [k, id] of Object.entries(aliases)) if (/^Q\d+$/.test(k)) byQid.set(k, id);
  byQid.set('Q265570', byQid.get('Q265570') ?? 'jahn-regensburg');
  const names = new Map();   // club id → [정규화 이름]
  const add = (id, n) => { const v = coreName(n); if (v) (names.get(id) ?? names.set(id, new Set()).get(id)).add(v); };
  for (const [id, c] of Object.entries(canon)) add(id, c.label);
  for (const f of fs.readdirSync(path.join(DATA, 'clubs'))) {
    const c = readJson(path.join(DATA, 'clubs', f));
    add(c.id, c.name);
  }
  for (const [k, id] of Object.entries(aliases)) if (!/^Q\d+$/.test(k)) add(id, k);
  return { canon, byQid, names };
}
const GENERIC = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'ud', 'cd', 'rc', 'rcd', 'sd', 'sv', 'tsv', 'vfb', 'vfl', 'tsg', 'fsv', 'bsc', 'spvgg', 'de', 'calcio', 'club', 'football', 'the', '1', '04', '05', '09', 'and', 'hove', 'sk', 'fk', 'sad', 'sa', 'f', 'c', 'a']);
function coreName(n) {
  return normName(n).split(' ').filter((w) => !GENERIC.has(w)).join(' ');
}

// ── 위키백과 리그 시즌 문서 ────────────────────────────
async function fetchPage(title) {
  const url = `${API}&action=query&prop=revisions&rvprop=ids|content&rvslots=main&rvlimit=1&redirects=1&titles=${encodeURIComponent(title)}`;
  const j = await getJson('wikipedia', url);
  return j.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? null;
}

function findCol(headers, re, not) {
  return headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
}

// 문서 → { changes: [{team, out, vac, inc, app}] | null, personnel: [{team, person}] | null }
function readLeaguePage(text) {
  const out = { changes: null, personnel: null };
  for (const tb of wt.parseTables(text)) {
    const H = tb.headers;
    const team = findCol(H, /^(team|club)\b/i);
    if (team < 0) continue;
    const outC = findCol(H, /outgoing|departing/i, /date|manner/i);
    const incC = findCol(H, /incoming|replaced by|replacement|new (manager|coach)/i, /date/i);
    if (outC >= 0 && incC >= 0) {
      let vac = findCol(H, /(exit date|date of (vacancy|departure)|vacancy|departure date|date left).*(departed|left)/i);
      if (vac < 0) vac = findCol(H, /vacan|exit date|date of departure|departure date|date left|departed/i);
      let app = findCol(H, /(incoming date|date of appointment|appointment date|arrival).*(arrived|joined|start)/i);
      if (app < 0) app = findCol(H, /appoint|incoming date|date of arrival|arrival|hired|joined/i);
      const rows = tb.rows.map((r) => ({
        team: wt.parseTeam(r[team]), out: wt.parsePerson(r[outC]), inc: wt.parsePerson(r[incC]),
        vac: vac >= 0 ? wt.parseDate(r[vac]) : null, app: app >= 0 ? wt.parseDate(r[app]) : null,
      })).filter((r) => r.team.name);
      out.changes = [...(out.changes ?? []), ...rows];
      continue;
    }
    const mgr = findCol(H, /manager|head coach|coach|trainer/i, /assistant|kit|captain|caretaker/i);
    if (mgr >= 0 && !out.personnel) {
      const rows = tb.rows.map((r) => ({ team: wt.parseTeam(r[team]), person: wt.parsePerson(r[mgr]) })).filter((r) => r.team.name && r.person);
      if (rows.length >= 10) out.personnel = rows;
    }
  }
  return out;
}

// ── Wikidata ─────────────────────────────────────────
// 감독 직책으로 보는 한정자 값 (이 밖의 직책 — 수석 코치 · 골키퍼 코치 · 유스 감독 등 — 은 뺀다)
const HEAD_ROLE = /head coach|manager|caretaker|interim|player-coach|player-manager|trainer|coach$/i;
const NOT_HEAD = /assistant|goalkeep|youth|academy|fitness|analyst|technical director|sporting director|scout|reserve|under-|u\d\d|women|director|chairman|president|physio|conditioning|set-piece|first-team coach|individual/i;

async function wikidataStints(clubQids, log) {
  const rows = [];
  for (let i = 0; i < clubQids.length; i += 20) {
    const chunk = clubQids.slice(i, i + 20);
    const r = await wikidata.sparql(`
      SELECT ?club ?coach ?prop ?start ?sp ?end ?ep ?role WHERE {
        VALUES ?club { ${chunk.map((q) => `wd:${q}`).join(' ')} }
        { ?club p:P286 ?st . ?st ps:P286 ?coach . BIND("P286" AS ?prop) } UNION { ?coach p:P6087 ?st . ?st ps:P6087 ?club . BIND("P6087" AS ?prop) }
        FILTER(isIRI(?coach))
        OPTIONAL { ?st pqv:P580 ?sv . ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?sp . }
        OPTIONAL { ?st pqv:P582 ?ev . ?ev wikibase:timeValue ?end ; wikibase:timePrecision ?ep . }
        OPTIONAL { ?st pq:P39|pq:P2868|pq:P3831|pq:P5102 ?role }
      }`);
    rows.push(...r);
  }
  const roles = [...new Set(rows.filter((r) => r.role && /entity\/Q/.test(r.role.value)).map((r) => qid(r.role.value)))];
  const roleLabel = roles.length ? await wikidata.labels(roles, 'en') : {};
  const byStmt = new Map();
  for (const r of rows) {
    const k = `${qid(r.club.value)}|${qid(r.coach.value)}|${r.prop.value}|${r.start?.value ?? ''}|${r.end?.value ?? ''}`;
    const e = byStmt.get(k) ?? byStmt.set(k, {
      club: qid(r.club.value), coach: qid(r.coach.value), prop: r.prop.value,
      start: r.start ? { v: r.start.value.slice(0, 10), p: +r.sp.value } : null,
      end: r.end ? { v: r.end.value.slice(0, 10), p: +r.ep.value } : null, roles: [],
    }).get(k);
    if (r.role) e.roles.push(roleLabel[qid(r.role.value)] ?? (r.role.value.startsWith('http') ? qid(r.role.value) : r.role.value));
  }
  const stints = [];
  let dropped = 0;
  for (const e of byStmt.values()) {
    const caretaker = e.roles.some((x) => /caretaker|interim|acting/i.test(x));
    if (e.roles.length && !e.roles.some((x) => HEAD_ROLE.test(x) && !NOT_HEAD.test(x))) { dropped++; continue; }
    if (!e.start) { dropped++; continue; }
    // 연 단위 날짜: 시작은 그해 7월 1일, 끝은 그해 6월 30일로 본다
    const s = e.start.p >= 11 ? e.start.v : e.start.p === 10 ? e.start.v.slice(0, 8) + '01' : e.start.v.slice(0, 4) + '-07-01';
    const en = !e.end ? null : e.end.p >= 11 ? e.end.v : e.end.p === 10 ? e.end.v.slice(0, 8) + '28' : e.end.v.slice(0, 4) + '-06-30';
    stints.push({ club: e.club, coach: e.coach, prop: e.prop, start: s, end: en, precise: e.start.p >= 10 && (!e.end || e.end.p >= 10), caretaker });
  }
  log(`  Wikidata 감독 기록 ${byStmt.size}개 → 사용 ${stints.length}개 (직책 · 날짜 없어 뺌 ${dropped}개)`);
  // 같은 구단 · 같은 사람: 정확한 기록이 있으면 겹치는 연 단위 기록은 버린다
  const keep = stints.filter((a) => a.precise || !stints.some((b) => b !== a && b.precise && b.club === a.club && b.coach === a.coach
    && b.start <= (a.end ?? '9999') && (b.end ?? '9999') >= a.start));
  // 끝 날짜가 없으면: 같은 구단의 다음 (다른 사람) 기록 시작 전날까지
  const byClub = new Map();
  for (const s of keep) (byClub.get(s.club) ?? byClub.set(s.club, []).get(s.club)).push(s);
  for (const list of byClub.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    for (const s of list) if (!s.end) {
      const next = list.find((x) => x.coach !== s.coach && x.start > s.start && !x.caretaker);
      s.end = next ? addDays(next.start, -1) : null;
      s.openEnded = true;
    }
  }
  return byClub;
}

function wdHolderAt(list, d) {
  const hits = (list ?? []).filter((s) => s.start <= d && (s.end ?? '9999-12-31') >= d);
  if (!hits.length) return null;
  // 정확한 날짜 > P286 > 늦게 시작한 쪽 (감독 대행보다 정식 감독)
  hits.sort((a, b) => (b.precise - a.precise) || (a.caretaker - b.caretaker) || ((b.prop === 'P286') - (a.prop === 'P286')) || b.start.localeCompare(a.start));
  return hits[0];
}

async function personFacts(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 120) {
    const chunk = qids.slice(i, i + 120);
    const rows = await wikidata.sparql(`
      SELECT ?p ?en ?ko ?title ?dob ?dobPrec ?sl ?citizen ?sport WHERE {
        VALUES ?p { ${chunk.map((q) => `wd:${q}`).join(' ')} }
        OPTIONAL { ?p wikibase:sitelinks ?sl }
        OPTIONAL { ?p rdfs:label ?en FILTER(lang(?en) = "en") }
        OPTIONAL { ?p rdfs:label ?ko FILTER(lang(?ko) = "ko") }
        OPTIONAL { ?art schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }
        OPTIONAL { ?p p:P569/psv:P569 ?dv . ?dv wikibase:timeValue ?dob ; wikibase:timePrecision ?dobPrec . }
        OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?citizen FILTER(lang(?citizen) = "en") }
        OPTIONAL { ?p wdt:P1532 ?sc . ?sc rdfs:label ?sport FILTER(lang(?sport) = "en") }
      }`);
    for (const r of rows) {
      const id = qid(r.p.value);
      const f = out[id] ?? (out[id] = { en: null, ko: null, title: null, dob: null, sitelinks: 0, citizen: [], sport: [] });
      f.en ??= r.en?.value ?? null;
      f.ko ??= r.ko?.value ?? null;
      f.title ??= r.title?.value ?? null;
      if (r.sl) f.sitelinks = Math.max(f.sitelinks, +r.sl.value);
      if (r.dob && +r.dobPrec.value >= 11 && !f.dob) f.dob = r.dob.value.slice(0, 10);
      if (r.dob && +r.dobPrec.value === 9 && !f.dob) f.dobYear = r.dob.value.slice(0, 4);
      if (r.citizen && !f.citizen.includes(r.citizen.value)) f.citizen.push(r.citizen.value);
      if (r.sport && !f.sport.includes(r.sport.value)) f.sport.push(r.sport.value);
    }
  }
  return out;
}

// 감독 경력 전체 (우리 데이터 밖 포함): 감독으로 맡은 구단 · 대표팀 수와 기간 (명성 사전값용)
async function careerSpan(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 120) {
    const chunk = qids.slice(i, i + 120);
    const rows = await wikidata.sparql(`
      SELECT ?p (COUNT(DISTINCT ?t) AS ?teams) (MIN(?s) AS ?first) WHERE {
        VALUES ?p { ${chunk.map((q) => `wd:${q}`).join(' ')} }
        { ?p p:P6087 ?st . ?st ps:P6087 ?t . } UNION { ?t p:P286 ?st . ?st ps:P286 ?p . }
        OPTIONAL { ?st pq:P580 ?s }
      } GROUP BY ?p`);
    for (const r of rows) out[qid(r.p.value)] = { teams: +r.teams.value, first: r.first ? r.first.value.slice(0, 4) : null };
  }
  return out;
}

// ── 출처 모으기 → 구단 시즌별 감독 ─────────────────────
const SAMPLE_DAYS = (y) => [`${y}-09-15`, `${y}-11-15`, `${y + 1}-02-01`, `${y + 1}-04-15`];

async function gather({ log }) {
  const sd = loadSeasonData();
  const ci = clubIndex();
  const leagueSeasons = [...sd.groups.keys()].map((k) => k.split('|'));

  // ① 위키백과 리그 시즌 문서
  log('  위키백과 리그 시즌 문서 읽기');
  const pages = new Map();
  for (const [s, l] of leagueSeasons) {
    const cfg = LEAGUES[l];
    const y = +s.slice(0, 4);
    const name = typeof cfg.enwiki === 'function' ? cfg.enwiki(y) : cfg.enwiki;
    const text = await fetchPage(`${y}–${s.slice(5)} ${name}`);
    if (text) pages.set(`${s}|${l}`, readLeaguePage(text));
  }
  // 구단 · 사람 문서 제목 → Wikidata
  const teamTitles = new Set(), personTitles = new Set();
  for (const p of pages.values()) {
    for (const r of p.changes ?? []) { if (r.team.title) teamTitles.add(r.team.title); for (const x of [r.out, r.inc]) if (x?.title) personTitles.add(x.title); }
    for (const r of p.personnel ?? []) { if (r.team.title) teamTitles.add(r.team.title); if (r.person.title) personTitles.add(r.person.title); }
  }
  const titleQid = await titlesToQids([...teamTitles, ...personTitles]);
  const clubOfTeam = (team, clubsHere) => {
    const q = team.title ? titleQid.get(team.title) : null;
    const id = q ? ci.byQid.get(q) : null;
    if (id && clubsHere.includes(id)) return id;
    // 이름으로: 이 리그 시즌 구단 중에서만
    const n = coreName(team.name);
    if (!n) return null;
    let best = null, bestScore = 0;
    for (const c of clubsHere) {
      for (const v of ci.names.get(c) ?? []) {
        const score = v === n ? 3 : (v.includes(n) || n.includes(v)) && Math.min(v.length, n.length) >= 4 ? 2 : 0;
        if (score > bestScore) { best = c; bestScore = score; }
      }
    }
    return best;
  };
  const personKey = (p) => (p ? (p.title && titleQid.get(p.title)) || 'n:' + normName(p.name) : null);
  let unmatchedTeams = 0;
  for (const [k, p] of pages) {
    const clubsHere = sd.groups.get(k).map((cs) => cs.club);
    for (const r of p.changes ?? []) {
      r.club = clubOfTeam(r.team, clubsHere);
      if (!r.club) unmatchedTeams++;
      r.outKey = personKey(r.out); r.incKey = personKey(r.inc);
    }
    for (const r of p.personnel ?? []) { r.club = clubOfTeam(r.team, clubsHere); r.key = personKey(r.person); if (!r.club) unmatchedTeams++; }
  }
  log(`  문서 ${pages.size}개 · 교체 표 ${[...pages.values()].filter((p) => p.changes).length}개 · 감독 표 ${[...pages.values()].filter((p) => p.personnel).length}개 · 구단 못 맞춘 행 ${unmatchedTeams}개`);

  // ② Wikidata 감독 기록
  log('  Wikidata 감독 기록');
  const clubIds = [...new Set(sd.clubSeasons.map((cs) => cs.club))];
  const clubQid = Object.fromEntries(clubIds.map((c) => [c, ci.canon[c]?.wikidata]).filter((x) => x[1]));
  const wd = await wikidataStints([...new Set(Object.values(clubQid))], log);

  // 위키백과 표에 나온 이름 (사람 키별)
  const names = new Map();
  const noteName = (key, p) => {
    if (!key || !p) return;
    const e = names.get(key) ?? names.set(key, { name: p.name, flag: null, n: 0 }).get(key);
    e.n++;
    e.flag ??= p.flag ?? null;
  };
  for (const p of pages.values()) {
    for (const r of p.changes ?? []) { noteName(r.outKey, r.out); noteName(r.incKey, r.inc); }
    for (const r of p.personnel ?? []) noteName(r.key, r.person);
  }

  // 구단 시즌별 감독 (네 시점)
  const wpHolder = (page, club, d) => {
    if (!page?.changes) return null;
    // 날짜를 못 읽은 교체 기록만 있으면 이 문서로는 정하지 않는다 (감독 표는 시즌 끝 기준일 수 있음)
    if (page.changes.some((e) => e.club === club && !e.app && !e.vac) && !page.changes.some((e) => e.club === club && (e.app || e.vac))) return null;
    const evs = page.changes.filter((e) => e.club === club && (e.app || e.vac)).sort((a, b) => (a.app ?? a.vac).localeCompare(b.app ?? b.vac));
    let cur = null;
    for (const e of evs) {
      const t = e.app ?? e.vac;
      if (t <= d || (e.vac && e.vac <= d && e.app && e.app <= addDays(d, 14))) { if (e.incKey) cur = { key: e.incKey, caretaker: e.inc.caretaker }; }
    }
    if (cur) return cur;
    const after = evs.find((e) => (e.app ?? e.vac) > d && e.outKey);
    if (after) return { key: after.outKey, caretaker: after.out.caretaker };
    const pers = page.personnel?.find((r) => r.club === club);
    return pers?.key ? { key: pers.key, caretaker: pers.person.caretaker } : null;
  };
  const personnelHolder = (page, club) => {
    const r = page?.personnel?.find((x) => x.club === club);
    return r?.key ? { key: r.key, caretaker: r.person.caretaker } : null;
  };
  const assign = new Map();   // `${season}|${club}` → { keys: [4], src: [4], caretaker: [4], wdSep }
  for (const cs of sd.clubSeasons) {
    const y = +cs.season.slice(0, 4);
    const page = pages.get(`${cs.season}|${cs.league}`);
    const list = wd.get(clubQid[cs.club]);
    const a = { keys: [], src: [], caretaker: [], wdSep: null };
    for (const [i, d] of SAMPLE_DAYS(y).entries()) {
      let h = null, src = null;
      const w = wdHolderAt(list, d);
      if (i === 0 && w) a.wdSep = w.coach;
      if (page?.changes && (h = wpHolder(page, cs.club, d))) src = 'wp';
      else if (w && w.precise) { h = { key: w.coach, caretaker: w.caretaker }; src = 'wd'; }
      else if ((h = personnelHolder(page, cs.club))) src = 'wp-personnel';
      else if (w) { h = { key: w.coach, caretaker: w.caretaker }; src = 'wd-year'; }
      a.keys.push(h?.key ?? null); a.src.push(src); a.caretaker.push(!!h?.caretaker);
    }
    assign.set(`${cs.season}|${cs.club}`, a);
  }

  // ⑤ 빈 시즌: 구단 시즌 문서 정보 상자
  const gaps = sd.clubSeasons.filter((cs) => !assign.get(`${cs.season}|${cs.club}`).keys[0]);
  if (gaps.length) {
    log(`  빈 구단 시즌 ${gaps.length}개 → 구단 시즌 문서 확인`);
    const clubTitle = await clubEnwiki([...new Set(gaps.map((cs) => clubQid[cs.club]).filter(Boolean))]);
    const found = [];
    for (const cs of gaps) {
      const t = clubTitle[clubQid[cs.club]];
      if (!t) continue;
      const text = await fetchPage(`${cs.season.slice(0, 4)}–${cs.season.slice(5)} ${t} season`);
      const p = text && infoboxManager(text);
      if (p) found.push({ cs, p });
    }
    const tq = await titlesToQids(found.map((f) => f.p.title).filter(Boolean));
    for (const { cs, p } of found) {
      const key = (p.title && tq.get(p.title)) || 'n:' + normName(p.name);
      noteName(key, p);
      const a = assign.get(`${cs.season}|${cs.club}`);
      a.keys = a.keys.map((k) => k ?? key); a.src = a.src.map((s) => s ?? 'wp-season'); a.caretaker = a.caretaker.map((c, i) => (a.keys[i] === key ? !!p.caretaker : c));
    }
    log(`  구단 시즌 문서로 채움 ${found.length}개`);
  }

  // 이름만 있는 사람 → 같은 이름의 Wikidata 사람으로 합치기
  const qids = new Set();
  for (const a of assign.values()) { for (const k of a.keys) if (k && !k.startsWith('n:')) qids.add(k); if (a.wdSep) qids.add(a.wdSep); }
  const facts = await personFacts([...qids]);
  // 이름 → QID (같은 구단 시즌의 Wikidata 감독 이름이 먼저 — 동명이인 줄이기)
  const qidByName = new Map();
  for (const [q, f] of Object.entries(facts)) for (const n of [f.en, f.title?.replace(/\s*\(.*\)$/, '')]) if (n) qidByName.set(normName(n), q);
  for (const a of assign.values()) {
    const wf = a.wdSep && facts[a.wdSep];
    if (!wf) continue;
    const wn = [wf.en, wf.title?.replace(/\s*\(.*\)$/, '')].filter(Boolean).map(normName);
    a.keys = a.keys.map((k) => (k?.startsWith('n:') && wn.includes(k.slice(2)) ? a.wdSep : k));
  }
  for (const a of assign.values()) a.keys = a.keys.map((k) => (k?.startsWith('n:') && qidByName.get(k.slice(2))) || k);

  return { sd, ci, pages, wd, clubQid, assign, names, facts };
}

async function titlesToQids(titles) {
  const uniq = [...new Set(titles)];
  if (!uniq.length) return new Map();
  const canonT = await wikipedia.resolveTitles(uniq);
  const hits = await wikidata.byEnwikiTitles([...new Set(Object.values(canonT).filter(Boolean))]);
  const q = new Map(hits.map((h) => [h.enwiki, h.qid]));
  return new Map(uniq.map((t) => [t, q.get(canonT[t] ?? t) ?? null]).filter((x) => x[1]));
}

async function clubEnwiki(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 150) {
    const rows = await wikidata.sparql(`
      SELECT ?c ?title WHERE {
        VALUES ?c { ${qids.slice(i, i + 150).map((q) => `wd:${q}`).join(' ')} }
        ?art schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
      }`);
    for (const r of rows) out[qid(r.c.value)] = r.title.value;
  }
  return out;
}

// 구단 시즌 문서 정보 상자의 감독 (첫 사람)
function infoboxManager(text) {
  const m = text.match(/\|\s*(?:manager|head[ _]coach|coach|trainer)\s*=\s*([^\n]*)/i);
  if (!m || !m[1].trim()) return null;
  return wt.parsePerson(m[1]);
}

// ── 국적 ─────────────────────────────────────────────
function nationLookup() {
  const map = new Map(readJson(path.join(DATA, 'meta', 'nations.json')).nations.map((n) => [n.en.toLowerCase(), n.code]));
  const aliases = {
    ireland: 'IRL', 'republic of ireland': 'IRL', 'united states': 'USA', 'united states of america': 'USA', 'czech republic': 'CZE',
    'ivory coast': 'CIV', "côte d'ivoire": 'CIV', 'democratic republic of the congo': 'COD', 'republic of the congo': 'CGO',
    'south korea': 'KOR', turkey: 'TUR', türkiye: 'TUR', 'kingdom of the netherlands': 'NED', "people's republic of china": 'CHN',
    'the gambia': 'GAM', 'cape verde': 'CPV', russia: 'RUS', 'bosnia and herzegovina': 'BIH', 'kingdom of spain': 'ESP',
    'kingdom of italy': 'ITA', germany: 'GER', 'west germany': 'GER', 'east germany': 'GER', 'german democratic republic': 'GER', 'kingdom of belgium': 'BEL', 'kingdom of denmark': 'DEN',
    'kingdom of sweden': 'SWE', 'kingdom of norway': 'NOR', 'serbia and montenegro': 'SRB', 'federal republic of yugoslavia': 'SRB', yugoslavia: 'SRB',
    'socialist federal republic of yugoslavia': 'SRB', 'soviet union': 'RUS', czechoslovakia: 'CZE', 'north macedonia': 'MKD', 'republic of macedonia': 'MKD', 'curaçao': 'CUW',
    'nazi germany': 'GER', 'weimar republic': 'GER', 'kingdom of portugal': 'POR', 'second spanish republic': 'ESP', 'francoist spain': 'ESP',
  };
  for (const [k, v] of Object.entries(aliases)) map.set(k, v);
  return (label) => map.get(label.toLowerCase()) ?? null;
}

// ── 이름 ─────────────────────────────────────────────
function cleanKo(label) {
  if (!label) return null;
  const s = label.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[·・]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^[가-힣 ]+$/.test(s) ? s : null;
}

// ── 능력 ─────────────────────────────────────────────
// 백분위 → 능력 (엘리트는 확실히 높게)
const CURVE = [[0, 48], [0.25, 57], [0.5, 63], [0.75, 70], [0.9, 77], [0.96, 84], [0.985, 89], [1, 95]];
function curve(p) {
  for (let i = 1; i < CURVE.length; i++) {
    const [p0, v0] = CURVE[i - 1], [p1, v1] = CURVE[i];
    if (p <= p1) return v0 + (v1 - v0) * (p - p0) / (p1 - p0);
  }
  return CURVE[CURVE.length - 1][1];
}
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let up = lo;
    while (up < n && sorted[up] === v) up++;
    return n <= 1 ? 0.5 : ((lo + up - 1) / 2) / (n - 1);
  };
}
function zscore(values) {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) || 1;
  return (v) => (v - m) / sd;
}
// 사람마다 고정된 작은 흔들림 (-1~1)
const jitter = (key, salt) => (hash(`${salt}:${key}`) % 2001) / 1000 - 1;

const LEVEL = { eng1: 1, esp1: 1, ita1: 1, ger1: 1, fra1: 1, ger2: 2 };
const MODERN_FORMATION = ['4-2-3-1', '4-3-3', '4-2-3-1', '4-4-2'];

async function managers({ apply = false, log = console.log } = {}) {
  log(`■ 감독 데이터${apply ? ' (적용)' : ' (미리보기)'}`);
  const g = await gather({ log });
  const { sd, assign, facts, names } = g;
  const override = readJson(OVERRIDE_FILE, {});
  const ovByName = new Map(Object.entries(override).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [normName(k), v]));
  const toCode = nationLookup();
  const clubInfo = Object.fromEntries(fs.readdirSync(path.join(DATA, 'clubs')).map((f) => { const c = readJson(path.join(DATA, 'clubs', f)); return [c.id, c]; }));
  const csByKey = new Map(sd.clubSeasons.map((cs) => [`${cs.season}|${cs.club}`, cs]));

  // ── 시즌 감독 (9/15, 없으면 그 시즌 다른 시점) ──
  const seasonKey = new Map();
  for (const [k, a] of assign) seasonKey.set(k, a.keys[0] ?? a.keys.find(Boolean) ?? null);

  // ── 가상 감독: 같은 구단의 이어진 빈 시즌은 한 사람 ──
  const genOf = new Map();   // `${season}|${club}` → gen key
  const genInfo = new Map(); // gen key → { club, first }
  const seasons = [...new Set(sd.clubSeasons.map((cs) => cs.season))].sort();
  const byClub = new Map();
  for (const cs of sd.clubSeasons) (byClub.get(cs.club) ?? byClub.set(cs.club, []).get(cs.club)).push(cs);
  for (const [club, list] of byClub) {
    list.sort((a, b) => a.season.localeCompare(b.season));
    let run = null, prevIdx = -9;
    for (const cs of list) {
      const idx = seasons.indexOf(cs.season);
      if (seasonKey.get(`${cs.season}|${club}`)) { run = null; prevIdx = idx; continue; }
      if (!run || idx !== prevIdx + 1) { run = `gen:${club}:${cs.season}`; genInfo.set(run, { club, first: cs.season, seasons: [] }); }
      genInfo.get(run).seasons.push(cs.season);
      genOf.set(`${cs.season}|${club}`, run);
      prevIdx = idx;
    }
  }

  // ── 실제 감독 기록 모으기 (네 시점 몫) ──
  const rec = new Map();   // key → { share, perf, titles1, titles2, releg, clubs: Map, youth, youthN, seasonsHeld:Set, firstSeason, formations }
  const R = (k) => rec.get(k) ?? rec.set(k, { share: 0, rankedShare: 0, perf: 0, titles1: 0, titles2: 0, releg: 0, clubs: new Map(), youth: 0, youthN: 0, seasons: new Set(), first: null, formations: {}, maxRep: 0, repSum: 0, bigShare: 0, expSum: 0, caretakerOnly: true }).get(k);
  // 젊은 선수 다음 시즌 능력 변화의 나이별 평균
  const growth = new Map();
  const nextSeason = (s) => seasons[seasons.indexOf(s) + 1];
  for (const cs of sd.clubSeasons) {
    const ns = nextSeason(cs.season);
    if (!ns) continue;
    for (const y of cs.youth) {
      const a = sd.ovr.get(`${cs.season}|${y.id}`), b = sd.ovr.get(`${ns}|${y.id}`);
      if (a == null || b == null) continue;
      y.delta = b - a;
      const e = growth.get(y.age) ?? growth.set(y.age, { s: 0, n: 0 }).get(y.age);
      e.s += b - a; e.n++;
    }
  }
  const avgGrowth = (age) => { const e = growth.get(age); return e && e.n ? e.s / e.n : 0; };

  for (const [k, a] of assign) {
    const cs = csByKey.get(k);
    a.keys.forEach((key, i) => {
      if (!key) return;
      const r = R(key);
      const w = 0.25;
      r.share += w;
      r.seasons.add(cs.season);
      if (!a.caretaker[i]) r.caretakerOnly = false;
      r.first = !r.first || cs.season < r.first ? cs.season : r.first;
      r.clubs.set(cs.club, (r.clubs.get(cs.club) ?? 0) + w);
      r.maxRep = Math.max(r.maxRep, cs.reputation - (LEVEL[cs.league] === 2 ? 12 : 0));
      r.repSum += w * cs.reputation;
      if (cs.formation) r.formations[cs.formation] = (r.formations[cs.formation] ?? 0) + w;
      if (cs.rank) {
        r.rankedShare += w;
        const lvlW = LEVEL[cs.league] === 2 ? 0.6 : 1;
        r.perf += w * lvlW * (cs.expected - cs.rank) / (cs.n - 1);
        r.expSum += w * (cs.expected - 1) / (cs.n - 1);
        // 우승: 이미 우승 후보(기대 1위)면 조금 덜, 프랑스 리그는 조금 덜
        if (cs.rank === 1) { if (LEVEL[cs.league] === 1) r.titles1 += w * (cs.expected === 1 ? 0.75 : 1) * (cs.league === 'fra1' ? 0.75 : 1); else r.titles2 += w; }
        if (cs.rank > cs.n - 3) r.releg += w * (LEVEL[cs.league] === 2 ? 0.6 : 1);
      }
      for (const y of cs.youth) if (y.delta != null) { r.youth += w * (y.delta - avgGrowth(y.age)); r.youthN += w; }
    });
  }

  // ── 실제 감독 신상 ──
  const keys = [...rec.keys()];
  const career = await careerSpan(keys.filter((k) => !k.startsWith('n:')));
  const people = new Map();
  for (const key of keys) {
    const f = facts[key];
    const nm = names.get(key) ?? (f?.en ? names.get('n:' + normName(f.en)) : null);
    const name = (f?.en ?? nm?.name ?? key.slice(2)).replace(/\s*\(.*?\)\s*$/, '').trim();
    const ov = ovByName.get(normName(name)) ?? (key.startsWith('Q') ? override[key] : null) ?? {};
    let nation = ov.nation ?? null;
    for (const lbl of [...(f?.sport ?? []), ...(f?.citizen ?? [])]) { if (nation) break; nation = toCode(lbl); }
    if ((!nation || nation === 'GBR') && nm?.flag) nation = nm.flag;
    if (f?.citizen?.includes('United Kingdom') && (!nation || nation === 'GBR')) nation = nm?.flag ?? 'ENG';
    nation ??= nm?.flag ?? clubInfo[[...rec.get(key).clubs.keys()][0]]?.nation ?? 'ENG';
    // 한국어 이름은 Wikidata ko 이름만 (없으면 게임이 영어 이름을 씀)
    // 전체 이름(긴 본명)으로 된 이름은 쓰지 않는다
    let ko = cleanKo(f?.ko);
    if (ko && ko.split(' ').length > name.split(' ').length + 1) ko = null;
    people.set(key, { name, ko, nation, birth: f?.dob ?? (f?.dobYear ? `${f.dobYear}-07-01` : null), sitelinks: f?.sitelinks ?? 0, ov, wikidata: key.startsWith('Q') ? key : null, career: career[key] });
  }

  // ── 능력 계산 (실제 감독 전체 백분위) ──
  const raw = new Map();
  for (const key of keys) {
    const r = rec.get(key), p = people.get(key);
    const S = r.rankedShare;
    const titles = r.titles1 + 0.3 * r.titles2;
    const careerTeams = p.career?.teams ?? 0;
    raw.set(key, {
      perf: r.perf / (S + 2),
      titles: Math.log1p(titles * 1.5),
      releg: r.releg / (S + 2),
      fame: Math.log1p(p.sitelinks) + 0.15 * Math.log1p(careerTeams),
      big: r.maxRep / 100 + (r.share ? r.repSum / r.share / 100 : 0) * 0.5,
      youth: r.youthN ? r.youth / (r.youthN + 25) : 0,
      dataW: Math.min(S, 6) / 6,
    });
  }
  const zs = (f) => zscore([...raw.values()].map(f));
  const zPerf = zs((x) => x.perf), zTit = zs((x) => x.titles), zRel = zs((x) => x.releg), zFame = zs((x) => x.fame), zBig = zs((x) => x.big), zYouth = zs((x) => x.youth);
  const comp = new Map();
  for (const [key, x] of raw) {
    const d = x.dataW;
    const tac = d * (1.0 * zPerf(x.perf) + 0.9 * zTit(x.titles) - 0.35 * zRel(x.releg)) + (1.1 - 0.5 * d) * zFame(x.fame) + 0.25 * zBig(x.big);
    const rep = 1.1 * zFame(x.fame) + 0.8 * zBig(x.big) + 0.7 * zTit(x.titles) + 0.2 * d * zPerf(x.perf);
    comp.set(key, { tac, rep });
  }
  const pTac = percentiles([...comp.values()].map((c) => c.tac));
  const pRep = percentiles([...comp.values()].map((c) => c.rep));
  const devC = new Map([...raw].map(([k, x]) => [k, 0.55 * zYouth(x.youth) * Math.min(1, x.dataW * 1.5) + 0.45 * comp.get(k).tac / 1.5]));
  const pDev = percentiles([...devC.values()]);

  // ── 성향 ──
  const styleOf = (key, tac, r, p) => {
    const ov = p.ov ?? {};
    const lastSeason = [...r.seasons].sort().pop() ?? '2010-11';
    const born = p.birth ? +p.birth.slice(0, 4) : 1965;
    const avgExp = r.rankedShare ? r.expSum / r.rankedShare : 0.5;   // 0 = 우승 후보 · 1 = 꼴찌 후보
    let mentality = 0;
    if (tac >= 80 && avgExp < 0.4) mentality = 1;
    else if (avgExp > 0.7 && tac < 66) mentality = -1;
    if (raw.get(key).perf > 0.12 && avgExp < 0.5) mentality = Math.max(mentality, 1);
    let pressing = lastSeason >= '2014-15' && born >= 1968 ? 1 + (jitter(key, 'press') > 0.55 ? 1 : 0) : jitter(key, 'press') > 0.6 ? 0 : 1;
    let formation = Object.entries(r.formations).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!formation) {
      if (lastSeason < '2006-07') formation = mentality < 0 ? '4-5-1' : '4-4-2';
      else formation = mentality > 0 ? '4-3-3' : mentality < 0 ? '4-4-2' : MODERN_FORMATION[hash('f:' + key) % MODERN_FORMATION.length];
    }
    return {
      mentality: ov.mentality ?? mentality,
      pressing: ov.pressing ?? pressing,
      formation: ov.formation ?? formation,
    };
  };

  // ── 결과 만들기 ──
  const out = { managers: {}, seasons: {} };
  const koOut = {};   // data/locale/ko/managers.json
  const idOfKey = new Map();
  const usedIds = new Set();
  const newId = (key) => { let n = 0, id; do { id = managerIdOf(key + (n ? `#${n}` : '')); n++; } while (usedIds.has(id)); usedIds.add(id); idOfKey.set(key, id); return id; };
  const r1 = (v) => Math.round(clamp(v, 1, 99));
  for (const key of [...keys].sort()) {
    const r = rec.get(key), p = people.get(key), c = comp.get(key);
    const tac = r1(curve(pTac(c.tac)));
    const rep = r1(curve(pRep(c.rep)));
    const dev = r1(curve(pDev(devC.get(key))));
    const mot = r1(0.55 * tac + 0.35 * rep + 0.1 * 62 + 3 * jitter(key, 'mot'));
    const avg = (tac + mot + dev) / 3;
    const firstY = +(r.first ?? '2000').slice(0, 4);
    const age = p.birth ? firstY - +p.birth.slice(0, 4) : null;
    let room = age != null ? clamp(46 - age, 0, 15) : 2;
    if (r.rankedShare < 3) room += 3;
    if (age != null && age >= 55) room = Math.min(room, 1);
    const potential = r1(Math.max(avg, avg + room));
    const id = newId(key);
    out.managers[id] = {
      name: p.name, birth: p.birth, nation: p.nation, ...(p.wikidata ? { wikidata: p.wikidata } : {}),
      tac, mot, dev, rep, potential: Math.max(potential, Math.ceil(avg)),
      style: styleOf(key, tac, r, p),
    };
    if (p.ko) koOut[id] = { name: p.ko, short: p.ko.split(' ').pop() };
  }

  // 가상 감독: 이름은 구단 나라 선수들의 이름 · 성 (영어 이름만, 한국어 이름 없음)
  const pools = new Map();
  for (const cs of sd.clubSeasons) {
    const j = readJson(path.join(SEASONS_DIR, cs.season, cs.league, `${cs.club}.json`));
    for (const pl of j.squad) {
      const en = pl.name.split(/\s+/);
      if (en.length !== 2) continue;
      const pool = pools.get(pl.nation) ?? pools.set(pl.nation, new Map()).get(pl.nation);
      pool.set(pl.id, { en });
    }
  }
  const poolArr = new Map([...pools].map(([n, m]) => [n, [...m.values()]]));
  for (const [gk, gi] of [...genInfo].sort((a, b) => a[0].localeCompare(b[0]))) {
    const club = clubInfo[gi.club];
    const nation = club?.nation ?? 'ENG';
    const pool = poolArr.get(nation)?.length >= 10 ? poolArr.get(nation) : poolArr.get('ENG');
    const h = hash(gk);
    const A = pool[h % pool.length], B = pool[Math.floor(h / 7919) % pool.length];
    const reps = gi.seasons.map((s) => csByKey.get(`${s}|${gi.club}`).reputation);
    const crep = reps.reduce((a, b) => a + b, 0) / reps.length;
    const core = clamp(47 + (crep - 50) * 0.15 + 3 * jitter(gk, 'core'), 44, 57);
    const y = +gi.first.slice(0, 4);
    const young = jitter(gk, 'young') > 0.2;
    const age = young ? 36 + (h % 9) : 46 + (h % 17);
    const tac = r1(core + 3 * jitter(gk, 'tac')), mot = r1(core + 4 * jitter(gk, 'mot')), dev = r1(core + 4 * jitter(gk, 'dev'));
    const avg = (tac + mot + dev) / 3;
    const id = newId(gk);
    out.managers[id] = {
      name: `${A.en[0]} ${B.en[1]}`, birth: `${y - age}-${String(1 + (h % 12)).padStart(2, '0')}-${String(1 + (h % 28)).padStart(2, '0')}`, nation,
      tac, mot, dev, rep: r1(core - 4), potential: r1(avg + (young ? 6 + (h % 10) : h % 4)),
      style: { mentality: [-1, 0, 0, 1, 0][h % 5], pressing: [0, 1, 1, 2][(h >> 3) % 4], formation: y < 2006 ? '4-4-2' : MODERN_FORMATION[h % MODERN_FORMATION.length] },
      generated: true,
    };
  }
  for (const cs of sd.clubSeasons) {
    const k = `${cs.season}|${cs.club}`;
    const key = seasonKey.get(k) ?? genOf.get(k);
    (out.seasons[cs.season] ??= {})[cs.club] = idOfKey.get(key);
  }

  // ── 보고 ──
  const lines = report({ koOut, g, out, idOfKey, seasonKey, genOf, rec, people, csByKey });
  for (const l of lines) log(l);
  if (apply) {
    writeJsonIfChanged(OUT_FILE, out);
    writeJsonIfChanged(path.join(DATA, 'locale', 'ko', 'managers.json'), koOut);
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n');
    log(`  → ${path.relative(process.cwd(), OUT_FILE)} · 감독 ${Object.keys(out.managers).length}명 · 보고서 ${path.relative(process.cwd(), REPORT_FILE)}`);
  } else log('  (--apply 로 저장)');
  return out;
}

function report({ koOut, g, out, idOfKey, seasonKey, genOf, rec, people, csByKey }) {
  const L = [];
  const { sd, assign } = g;
  const M = out.managers;
  const nameOfKey = (k) => (k ? M[idOfKey.get(k)]?.name ?? k : '-');
  L.push(`감독 데이터 보고서 (${new Date().toISOString().slice(0, 10)})`);
  L.push('');
  L.push('■ 실제 감독을 찾은 구단 시즌 비율 (리그별)');
  const per = {};
  const srcCount = {};
  for (const cs of sd.clubSeasons) {
    const k = `${cs.season}|${cs.club}`;
    const e = per[cs.league] ?? (per[cs.league] = { n: 0, found: 0 });
    e.n++;
    if (seasonKey.get(k)) e.found++;
    const s = assign.get(k).src.find(Boolean) ?? 'generated';
    srcCount[s] = (srcCount[s] ?? 0) + 1;
  }
  let tn = 0, tf = 0;
  for (const [l, e] of Object.entries(per).sort()) { L.push(`  ${l}: ${e.found}/${e.n} (${(e.found / e.n * 100).toFixed(1)}%)`); tn += e.n; tf += e.found; }
  L.push(`  전체: ${tf}/${tn} (${(tf / tn * 100).toFixed(1)}%)`);
  L.push(`  출처: ${Object.entries(srcCount).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const all = Object.values(M);
  L.push(`  감독 ${all.length}명 (실제 ${all.filter((m) => !m.generated).length} · 가상 ${all.filter((m) => m.generated).length})`);
  L.push('');
  L.push('■ 전술(tac) 상위 30명');
  const clubsOf = (id) => {
    const key = [...idOfKey].find(([, v]) => v === id)?.[0];
    const r = rec.get(key);
    return r ? [...r.clubs.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 5).join(', ') : '';
  };
  const real = Object.entries(M).filter(([, m]) => !m.generated);
  const top = real.sort((a, b) => b[1].tac - a[1].tac || b[1].rep - a[1].rep).slice(0, 30);
  top.forEach(([id, m], i) => L.push(`  ${String(i + 1).padStart(2)}. ${m.name}${koOut[id] ? ` (${koOut[id].name})` : ''} tac ${m.tac} · mot ${m.mot} · dev ${m.dev} · rep ${m.rep} · pot ${m.potential} · ${m.style.formation} 공격${m.style.mentality} 압박${m.style.pressing} — ${clubsOf(id)}`));
  L.push('');
  L.push('■ 능력 분포 (실제 감독 tac)');
  const tacs = Object.values(M).filter((m) => !m.generated).map((m) => m.tac).sort((a, b) => a - b);
  const q = (p) => tacs[Math.floor(p * (tacs.length - 1))];
  L.push(`  최저 ${tacs[0]} · 25% ${q(0.25)} · 중간 ${q(0.5)} · 75% ${q(0.75)} · 90% ${q(0.9)} · 97% ${q(0.97)} · 최고 ${tacs[tacs.length - 1]} · 85 이상 ${tacs.filter((t) => t >= 85).length}명`);
  L.push('');
  L.push('■ 주요 구단 시즌별 감독 (9월 15일 기준 · * 출처 위키백과 외 · (c) 대행 · [가상])');
  for (const c of ['liverpool', 'man-utd', 'arsenal', 'chelsea', 'man-city', 'barcelona', 'real-madrid', 'atletico', 'bayern', 'dortmund', 'juventus', 'milan', 'inter', 'psg', 'lyon']) {
    const list = sd.clubSeasons.filter((cs) => cs.club === c).sort((a, b) => a.season.localeCompare(b.season));
    if (!list.length) continue;
    const parts = [];
    let prev = null;
    for (const cs of list) {
      const k = `${cs.season}|${c}`;
      const key = seasonKey.get(k);
      const a = assign.get(k);
      const label = key ? nameOfKey(key) + (a.caretaker[0] ? '(c)' : '') + (a.src[0] && a.src[0] !== 'wp' ? '*' : '') : `[가상 ${M[idOfKey.get(genOf.get(k))]?.name}]`;
      if (label !== prev) parts.push(`${cs.season.slice(2)} ${label}`);
      prev = label;
    }
    L.push(`  ${c}: ${parts.join(' → ')}`);
  }
  L.push('');
  L.push('■ 점검할 항목');
  // 같은 시즌 두 구단
  const dup = [];
  for (const [s, m] of Object.entries(out.seasons)) {
    const seen = new Map();
    for (const [c, id] of Object.entries(m)) { if (seen.has(id)) dup.push(`${s} ${M[id].name}: ${seen.get(id)} · ${c}`); seen.set(id, c); }
  }
  L.push(`  같은 시즌 두 구단에 배정 ${dup.length}건${dup.length ? '' : ''}`);
  for (const d of dup.slice(0, 40)) L.push(`    - ${d}`);
  // 위키백과와 Wikidata가 다른 시즌
  const diff = [];
  for (const [k, a] of assign) if (a.src[0] === 'wp' && a.wdSep && a.keys[0] && a.wdSep !== a.keys[0]) diff.push(`${k.replace('|', ' ')}: 위키백과 ${nameOfKey(a.keys[0])} / Wikidata ${people.get(a.wdSep)?.name ?? g.facts[a.wdSep]?.en ?? a.wdSep}`);
  L.push(`  위키백과 · Wikidata 9/15 감독이 다른 시즌 ${diff.length}건 (위키백과 우선)`);
  for (const d of diff.slice(0, 40)) L.push(`    - ${d}`);
  // Wikidata만으로 정한 시즌 (수석 코치 등 섞였을 수 있음)
  const wdOnly = [...assign].filter(([, a]) => ['wd', 'wd-year'].includes(a.src[0]));
  L.push(`  Wikidata만으로 정한 시즌 ${wdOnly.length}건 (연 단위 ${wdOnly.filter(([, a]) => a.src[0] === 'wd-year').length})`);
  for (const [k, a] of wdOnly.filter(([, x]) => x.src[0] === 'wd-year').slice(0, 30)) L.push(`    - ${k.replace('|', ' ')}: ${nameOfKey(a.keys[0])} (연 단위 날짜)`);
  // 감독 대행으로 시즌 시작
  const ct = [...assign].filter(([, a]) => a.caretaker[0]);
  L.push(`  9/15 감독이 대행인 시즌 ${ct.length}건: ${ct.slice(0, 25).map(([k, a]) => `${k.replace('|', ' ')} ${nameOfKey(a.keys[0])}`).join(' · ')}`);
  // 가상 감독 구간
  const gens = Object.values(M).filter((m) => m.generated);
  const genRuns = [...new Set([...genOf.values()])];
  L.push(`  가상 감독 ${gens.length}명 (빈 구단 시즌 ${genOf.size}개):`);
  for (const gk of genRuns.slice(0, 60)) {
    const ss = [...genOf].filter(([, v]) => v === gk).map(([k]) => k.split('|')[0]).sort();
    L.push(`    - ${gk.split(':')[1]} ${ss[0]}${ss.length > 1 ? '~' + ss[ss.length - 1] : ''}`);
  }
  // 한국어 이름을 규칙으로 만든 감독
  const realN = Object.values(M).filter((m) => !m.generated).length;
  L.push(`  한국어 이름 (Wikidata ko): 있음 ${Object.keys(koOut).length}명 · 없음 ${realN - Object.keys(koOut).length}명 (실제 감독 ${realN}명 중) · 가상 감독은 영어 이름만`);
  return L;
}

module.exports = { managers, managerIdOf, hash, gather };
