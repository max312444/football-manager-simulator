// 선수 식별: 우리 선수 ID ↔ Wikidata 항목, 그리고 시즌별 소속 대조
//
// 매칭 근거 (강한 순)
//   map          이미 확정된 매핑
//   enwiki-title 영문 위키백과 문서 제목 = 우리 name, 출생연도 일치 (우리 ID 규칙이 이 제목 기준)
//   dob+name     생년월일(일 단위) 일치 + 이름 토큰 일부 일치
// 이름 유사도만으로는 절대 매칭하지 않는다. 충돌은 모두 pending_review.
const path = require('path');
const { CANONICAL_DIR, SEASONS_DIR, snapshotDate } = require('../config');
const { readJson, writeJsonIfChanged, normName, namesOverlap, readClubSeason, listClubFiles } = require('../lib/util');
const wikidata = require('../providers/wikidata');

const PLAYERS_FILE = path.join(CANONICAL_DIR, 'players.json');

// Wikidata 날짜 + 정밀도 → [가장 이른 날, 가장 늦은 날]
function interval(t) {
  if (!t) return null;
  const [y, m] = t.value.split('-');
  if (t.precision >= 11) return [t.value, t.value];
  if (t.precision === 10) return [`${y}-${m}-01`, new Date(Date.UTC(+y, +m, 0)).toISOString().slice(0, 10)];
  if (t.precision === 9) return [`${y}-01-01`, `${y}-12-31`];
  return null;
}

// 기준일에 소속이었는가: definite(확실) / possible(연 단위 날짜라 애매) / none
function membershipAt(m, date) {
  const s = interval(m.start);
  if (!s) return 'none';
  const e = m.end ? interval(m.end) : null;
  if (m.end && !e) return 'none';
  if (s[0] > date || (e && e[1] < date)) return 'none';
  return s[1] <= date && (!e || e[0] >= date) ? 'definite' : 'possible';
}

const idYear = (id) => id.match(/-(\d{4})(-\d+)?$/)?.[1];
const titleKey = (t) => normName(t);

function matchSquad(squad, cands, playerMap) {
  const byQid = new Map(cands.map(c => [c.qid, c]));
  const used = new Set();
  const matches = [];
  const unmatched = [];
  for (const p of squad) {
    let hit = null, method = null;
    const mapped = playerMap[p.id]?.wikidata;
    if (mapped && byQid.has(mapped)) { hit = byQid.get(mapped); method = 'map'; }
    if (!hit) {
      hit = cands.find(c => !used.has(c.qid) && c.enwiki && titleKey(c.enwiki) === titleKey(p.name)
        && (!c.dob || c.dob.value.slice(0, 4) === idYear(p.id)));
      if (hit) method = 'enwiki-title';
    }
    if (!hit) {
      hit = cands.find(c => !used.has(c.qid) && c.dob?.precision >= 11 && c.dob.value === p.birth
        && namesOverlap(p.name, c.enwiki || c.label));
      if (hit) method = 'dob+name';
    }
    if (hit) { used.add(hit.qid); matches.push({ id: p.id, qid: hit.qid, method, presence: hit.presence }); }
    else unmatched.push(p.id);
  }
  const sourceOnly = cands.filter(c => !used.has(c.qid))
    .map(c => ({ qid: c.qid, name: c.enwiki || c.label || c.qid, dob: c.dob?.value ?? null, presence: c.presence }));
  return { matches, unmatched, sourceOnly };
}

async function resolvePlayers({ league, seasons, clubFilter, memberships, log }) {
  const playerMap = readJson(PLAYERS_FILE, {});
  const comparisons = [];
  const found = new Map();   // 우리 ID → Set(QID)
  const names = new Map();   // 우리 ID → { name, birth }

  for (const season of seasons) {
    const date = snapshotDate(season);
    for (const club of listClubFiles(SEASONS_DIR, season, league)) {
      if (clubFilter && club !== clubFilter) continue;
      const data = readClubSeason(SEASONS_DIR, season, league, club);
      for (const p of data.squad) names.set(p.id, { name: p.name, birth: p.birth, nation: p.nation, nation2: p.nation2, height: p.height });
      const rows = memberships[club];
      if (!rows) { comparisons.push({ season, club, skipped: '소스 없음' }); continue; }

      // 같은 선수의 소속 기록이 여러 줄이면 가장 확실한 상태를 쓴다
      const cands = new Map();
      for (const m of rows) {
        const presence = membershipAt(m, date);
        if (presence === 'none') continue;
        const prev = cands.get(m.qid);
        if (!prev || (prev.presence === 'possible' && presence === 'definite')) cands.set(m.qid, { ...m, presence });
      }
      const r = matchSquad(data.squad, [...cands.values()], playerMap);
      for (const m of r.matches) {
        if (!found.has(m.id)) found.set(m.id, new Map());
        found.get(m.id).set(m.qid, m.method);
      }
      comparisons.push({ season, club, date, squad: data.squad.length, matched: r.matches.length, unmatched: r.unmatched, sourceOnly: r.sourceOnly });
    }
  }

  // 시즌 대조에서 못 찾은 선수는 위키백과 문서 제목으로 신원만 확인
  const missing = [...names.keys()].filter(id => !found.has(id) && !playerMap[id]?.wikidata);
  if (missing.length) {
    log(`  소속 기록으로 못 찾은 ${missing.length}명 → 위키백과 제목으로 신원 조회`);
    const hits = await wikidata.byEnwikiTitles([...new Set(missing.map(id => names.get(id).name))]);
    const byTitle = new Map();
    for (const h of hits) (byTitle.get(titleKey(h.enwiki)) || byTitle.set(titleKey(h.enwiki), []).get(titleKey(h.enwiki))).push(h);
    for (const id of missing) {
      const ok = (byTitle.get(titleKey(names.get(id).name)) || []).filter(h => !h.dob || h.dob.value.slice(0, 4) === idYear(id));
      if (ok.length === 1) found.set(id, new Map([[ok[0].qid, 'enwiki-title-global']]));
    }
  }

  // 매핑 확정: 한 선수에 QID 하나, 한 QID에 선수 하나일 때만 valid
  const review = [];
  const qidOwners = new Map();
  for (const [id, qids] of found) for (const q of qids.keys()) (qidOwners.get(q) || qidOwners.set(q, new Set()).get(q)).add(id);
  for (const [id, qids] of found) {
    const prev = playerMap[id];
    const [[q, method]] = [...qids];
    if (qids.size > 1) {
      review.push({ type: 'player-multiple-qids', id, qids: [...qids.keys()] });
      playerMap[id] = { ...(prev || {}), status: 'pending_review', candidates: [...qids.keys()] };
    } else if (qidOwners.get(q).size > 1) {
      review.push({ type: 'qid-shared-by-ids', qid: q, ids: [...qidOwners.get(q)] });
      playerMap[id] = { wikidata: q, method, status: 'pending_review', note: '같은 Wikidata 항목에 여러 선수 ID (중복 의심)' };
    } else if (prev?.status === 'valid' && prev.wikidata !== q) {
      review.push({ type: 'mapping-changed', id, old: prev.wikidata, new: q });
    } else if (prev?.status !== 'valid') {
      playerMap[id] = { wikidata: q, method, status: 'valid' };
    }
  }
  for (const id of names.keys()) if (!playerMap[id]) playerMap[id] = { wikidata: null, status: 'unmatched' };

  writeJsonIfChanged(PLAYERS_FILE, playerMap);
  return { playerMap, comparisons, review, names };
}

module.exports = { resolvePlayers, PLAYERS_FILE, membershipAt };
