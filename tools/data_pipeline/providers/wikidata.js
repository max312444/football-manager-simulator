// Wikidata 제공자 (데이터 라이선스: CC0 — 재배포 제한 없음)
// SPARQL: https://query.wikidata.org  ·  검색 API: https://www.wikidata.org/w/api.php
const { getJson } = require('../lib/http');

const SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
const qid = (uri) => uri?.split('/').pop();

async function sparql(query, opts) {
  const body = await getJson('wikidata', SPARQL + encodeURIComponent(query.replace(/\s+/g, ' ').trim()),
    { ...opts, accept: 'application/sparql-results+json' });
  return body.results.bindings;
}

// 이름으로 구단 후보를 찾고, 축구 구단(Q476028)인지와 소속 국가를 함께 돌려준다
async function searchClub(name, opts) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=10&search=${encodeURIComponent(name)}`;
  const found = (await getJson('wikidataApi', url, opts)).search || [];
  if (!found.length) return [];
  const rows = await sparql(`
    SELECT ?item ?label ?country WHERE {
      VALUES ?item { ${found.map(f => `wd:${f.id}`).join(' ')} }
      ?item wdt:P31/wdt:P279* wd:Q476028 .
      OPTIONAL { ?item wdt:P17 ?country }
      OPTIONAL { ?item rdfs:label ?label FILTER(lang(?label) = "en") }
    }`, opts);
  const byId = new Map();
  for (const r of rows) {
    const id = qid(r.item.value);
    const e = byId.get(id) || { qid: id, label: r.label?.value, countries: [] };
    if (r.country) e.countries.push(qid(r.country.value));
    byId.set(id, e);
  }
  // 검색 순위를 유지
  return found.map(f => byId.get(f.id)).filter(Boolean);
}

// 구단의 모든 선수 소속 기록 (1999년 이후 끝났거나 아직 진행 중인 것). 구단당 요청 1번.
async function clubMemberships(clubQid, opts) {
  const rows = await sparql(`
    SELECT ?p ?label ?title ?dob ?dobPrec ?start ?sp ?end ?ep ?num ?apps WHERE {
      ?p p:P54 ?st . ?st ps:P54 wd:${clubQid} .
      ?p wdt:P21 wd:Q6581097 .
      OPTIONAL { ?st pqv:P580 ?sv . ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?sp . }
      OPTIONAL { ?st pqv:P582 ?ev . ?ev wikibase:timeValue ?end ; wikibase:timePrecision ?ep . }
      FILTER(!BOUND(?end) || YEAR(?end) >= 1999)
      OPTIONAL { ?st pq:P1618 ?num }
      OPTIONAL { ?st pq:P1350 ?apps }
      OPTIONAL { ?p p:P569/psv:P569 ?dv . ?dv wikibase:timeValue ?dob ; wikibase:timePrecision ?dobPrec . }
      OPTIONAL { ?art schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }
      OPTIONAL { ?p rdfs:label ?label FILTER(lang(?label) = "en") }
    }`, opts);
  return rows.map(r => ({
    apps: r.apps ? Number(r.apps.value) : null,
    qid: qid(r.p.value),
    label: r.label?.value ?? null,
    enwiki: r.title?.value ?? null,
    dob: r.dob ? { value: r.dob.value.slice(0, 10), precision: Number(r.dobPrec.value) } : null,
    start: r.start ? { value: r.start.value.slice(0, 10), precision: Number(r.sp.value) } : null,
    end: r.end ? { value: r.end.value.slice(0, 10), precision: Number(r.ep.value) } : null,
    number: r.num ? Number(r.num.value) : null,
  }));
}

// 영문 위키백과 문서 제목으로 선수 항목 찾기 (최대 100개씩)
async function byEnwikiTitles(titles, opts) {
  const out = [];
  for (let i = 0; i < titles.length; i += 100) {
    const chunk = titles.slice(i, i + 100);
    const rows = await sparql(`
      SELECT ?title ?p ?dob ?dobPrec WHERE {
        VALUES ?title { ${chunk.map(t => JSON.stringify(t) + '@en').join(' ')} }
        ?art schema:name ?title ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?p .
        OPTIONAL { ?p p:P569/psv:P569 ?dv . ?dv wikibase:timeValue ?dob ; wikibase:timePrecision ?dobPrec . }
      }`, opts);
    for (const r of rows) out.push({
      enwiki: r.title.value, qid: qid(r.p.value),
      dob: r.dob ? { value: r.dob.value.slice(0, 10), precision: Number(r.dobPrec.value) } : null,
    });
  }
  return out;
}

// 선수 신상 정보 (국가대표 소속 국가·국적·키·포지션) 최대 150명씩
async function playerFacts(qids, opts) {
  const out = {};
  for (let i = 0; i < qids.length; i += 150) {
    const chunk = qids.slice(i, i + 150);
    const rows = await sparql(`
      SELECT ?p ?sportCountry ?citizen ?height ?dob ?dobPrec WHERE {
        VALUES ?p { ${chunk.map(q => `wd:${q}`).join(' ')} }
        OPTIONAL { ?p p:P569/psv:P569 ?dv . ?dv wikibase:timeValue ?dob ; wikibase:timePrecision ?dobPrec . }
        OPTIONAL { ?p wdt:P1532 ?sc . ?sc rdfs:label ?sportCountry FILTER(lang(?sportCountry) = "en") }
        OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?citizen FILTER(lang(?citizen) = "en") }
        OPTIONAL { ?p p:P2048/psn:P2048/wikibase:quantityAmount ?height }
      }`, opts);
    for (const r of rows) {
      const id = qid(r.p.value);
      const f = out[id] || (out[id] = { sportCountries: [], citizenships: [], heightCm: null, dobs: [] });
      if (r.dob && Number(r.dobPrec.value) >= 11 && !f.dobs.includes(r.dob.value.slice(0, 10))) f.dobs.push(r.dob.value.slice(0, 10));
      if (r.sportCountry && !f.sportCountries.includes(r.sportCountry.value)) f.sportCountries.push(r.sportCountry.value);
      if (r.citizen && !f.citizenships.includes(r.citizen.value)) f.citizenships.push(r.citizen.value);
      // 정규화 값은 미터 단위
      if (r.height && !f.heightCm) f.heightCm = Math.round(Number(r.height.value) * 100);
    }
  }
  return out;
}

// 언어별 이름(label) 최대 200명씩: { Q..: "부카요 사카" }
async function labels(qids, lang, opts) {
  const out = {};
  for (let i = 0; i < qids.length; i += 200) {
    const chunk = qids.slice(i, i + 200);
    const rows = await sparql(`
      SELECT ?p ?label WHERE {
        VALUES ?p { ${chunk.map(q => `wd:${q}`).join(' ')} }
        ?p rdfs:label ?label FILTER(lang(?label) = "${lang}")
      }`, opts);
    for (const r of rows) out[qid(r.p.value)] = r.label.value;
  }
  return out;
}

const time = (v, p) => (v ? { value: v.value.slice(0, 10), precision: Number(p.value) } : null);

// 리그의 시즌 항목과 시즌별 참가 구단
async function leagueSeasons(leagueQid, opts) {
  const rows = await sparql(`
    SELECT ?s ?sLabel ?t ?tLabel ?tTitle WHERE {
      ?s wdt:P3450 wd:${leagueQid} .
      OPTIONAL { ?s wdt:P1923 ?t .
        OPTIONAL { ?ta schema:about ?t ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?tTitle . } }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`, opts);
  const seasons = new Map();
  for (const r of rows) {
    const id = qid(r.s.value);
    const s = seasons.get(id) || seasons.set(id, { qid: id, label: r.sLabel?.value, teams: [] }).get(id);
    if (r.t && !s.teams.some(t => t.qid === qid(r.t.value))) s.teams.push({ qid: qid(r.t.value), label: r.tLabel?.value, enwiki: r.tTitle?.value ?? null });
  }
  return [...seasons.values()];
}

// 선수 신상 + 모든 구단·대표팀 소속 기록 (최대 80명씩)
async function playerProfiles(qids, opts) {
  const out = {};
  for (let i = 0; i < qids.length; i += 80) {
    const chunk = qids.slice(i, i + 80);
    const values = chunk.map(q => `wd:${q}`).join(' ');
    const facts = await sparql(`
      SELECT ?p ?label ?title ?dob ?dobPrec ?height ?posLabel ?sportCountry ?citizen ?sl ?footballer WHERE {
        VALUES ?p { ${values} }
        OPTIONAL { ?p wikibase:sitelinks ?sl }
        BIND(EXISTS { ?p wdt:P106 wd:Q937857 } AS ?footballer)
        OPTIONAL { ?p rdfs:label ?label FILTER(lang(?label) = "en") }
        OPTIONAL { ?art schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }
        OPTIONAL { ?p p:P569/psv:P569 ?dv . ?dv wikibase:timeValue ?dob ; wikibase:timePrecision ?dobPrec . }
        OPTIONAL { ?p p:P2048/psn:P2048/wikibase:quantityAmount ?height }
        OPTIONAL { ?p wdt:P413 ?pos . ?pos rdfs:label ?posLabel FILTER(lang(?posLabel) = "en") }
        OPTIONAL { ?p wdt:P1532 ?sc . ?sc rdfs:label ?sportCountry FILTER(lang(?sportCountry) = "en") }
        OPTIONAL { ?p wdt:P27 ?c . ?c rdfs:label ?citizen FILTER(lang(?citizen) = "en") }
      }`, opts);
    for (const r of facts) {
      const id = qid(r.p.value);
      const f = out[id] || (out[id] = { qid: id, label: null, enwiki: null, dob: null, heightCm: null, positions: [], sportCountries: [], citizenships: [], careers: [] });
      f.label ??= r.label?.value ?? null;
      f.enwiki ??= r.title?.value ?? null;
      if (r.sl) f.sitelinks = Number(r.sl.value);
      f.footballer = r.footballer?.value === 'true';
      if (r.dob && (!f.dob || Number(r.dobPrec.value) > f.dob.precision)) f.dob = time(r.dob, r.dobPrec);
      if (r.height && !f.heightCm) f.heightCm = Math.round(Number(r.height.value) * 100);
      for (const [k, v] of [['positions', r.posLabel], ['sportCountries', r.sportCountry], ['citizenships', r.citizen]]) {
        if (v && !f[k].includes(v.value)) f[k].push(v.value);
      }
    }
    const careers = await sparql(`
      SELECT ?p ?club ?start ?sp ?end ?ep ?apps ?national ?parent WHERE {
        VALUES ?p { ${values} }
        ?p p:P54 ?st . ?st ps:P54 ?club .
        OPTIONAL { ?st pqv:P580 ?sv . ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?sp . }
        OPTIONAL { ?st pqv:P582 ?ev . ?ev wikibase:timeValue ?end ; wikibase:timePrecision ?ep . }
        OPTIONAL { ?st pq:P1350 ?apps }
        OPTIONAL { ?club wdt:P831 ?parent }
        BIND(EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 } AS ?national)
      }`, opts);
    for (const r of careers) {
      const f = out[qid(r.p.value)];
      if (!f) continue;
      f.careers.push({
        club: qid(r.club.value), start: time(r.start, r.sp), end: time(r.end, r.ep),
        apps: r.apps ? Number(r.apps.value) : null, national: r.national?.value === 'true',
        parent: r.parent ? qid(r.parent.value) : null,
      });
    }
  }
  return out;
}

// 구단 신상: 이름·창단·연고지·공식 색·경기장 수용 인원
async function clubProfiles(qids, opts) {
  const rows = await sparql(`
    SELECT ?c ?en ?ko ?title ?short ?inception ?cityLabel ?hex ?capacity WHERE {
      VALUES ?c { ${qids.map(q => `wd:${q}`).join(' ')} }
      OPTIONAL { ?c rdfs:label ?en FILTER(lang(?en) = "en") }
      OPTIONAL { ?c rdfs:label ?ko FILTER(lang(?ko) = "ko") }
      OPTIONAL { ?art schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }
      OPTIONAL { ?c wdt:P1813 ?short }
      OPTIONAL { ?c wdt:P571 ?inception }
      OPTIONAL { ?c wdt:P159 ?city . ?city rdfs:label ?cityLabel FILTER(lang(?cityLabel) = "en") }
      OPTIONAL { ?c wdt:P6364 ?color . ?color wdt:P465 ?hex }
      OPTIONAL { ?c wdt:P115 ?venue . ?venue wdt:P1083 ?capacity }
    }`, opts);
  const out = {};
  for (const r of rows) {
    const id = qid(r.c.value);
    const c = out[id] || (out[id] = { qid: id, en: null, ko: null, enwiki: null, shorts: [], founded: null, city: null, colors: [], capacity: null });
    c.en ??= r.en?.value ?? null;
    c.ko ??= r.ko?.value ?? null;
    c.enwiki ??= r.title?.value ?? null;
    if (r.short && !c.shorts.includes(r.short.value)) c.shorts.push(r.short.value);
    c.founded ??= r.inception ? Number(r.inception.value.slice(0, 4)) : null;
    c.city ??= r.cityLabel?.value ?? null;
    if (r.hex && !c.colors.includes(r.hex.value)) c.colors.push(r.hex.value);
    if (r.capacity) c.capacity = Math.max(c.capacity ?? 0, Math.round(Number(r.capacity.value)));
  }
  return out;
}

module.exports = { searchClub, clubMemberships, byEnwikiTitles, playerFacts, labels, leagueSeasons, playerProfiles, clubProfiles };
