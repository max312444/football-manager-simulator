// 검증: 기존 형식 검사(tools/validate.js) + 출처 대조 검사
// 결과 상태: valid / warning / invalid / pending_review  — 자동 수정은 하지 않는다
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, DATA } = require('../config');
const { readJson } = require('../lib/util');
const wikidata = require('../providers/wikidata');

// Wikidata 국가 이름 → 우리 국가 코드
function nationLookup() {
  const map = new Map(readJson(path.join(DATA, 'meta', 'nations.json')).nations.map(n => [n.en.toLowerCase(), n.code]));
  const aliases = {
    'ireland': 'IRL', 'republic of ireland': 'IRL', 'united states': 'USA', 'united states of america': 'USA',
    'czech republic': 'CZE', 'ivory coast': 'CIV', "côte d'ivoire": 'CIV', 'democratic republic of the congo': 'COD',
    'republic of the congo': 'CGO', 'south korea': 'KOR', 'turkey': 'TUR', 'türkiye': 'TUR', 'kingdom of the netherlands': 'NED',
    "people's republic of china": 'CHN', 'the gambia': 'GAM', 'cape verde': 'CPV', 'russia': 'RUS', 'bosnia and herzegovina': 'BIH',
  };
  for (const [k, v] of Object.entries(aliases)) map.set(k, v);
  return (label) => map.get(label.toLowerCase()) ?? null;
}

function runFormatValidator() {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'validate.js')], { encoding: 'utf8' });
    return { ok: true, summary: out.trim().split('\n').slice(-3).join(' / ') };
  } catch (e) {
    return { ok: false, summary: (e.stdout || '').trim().split('\n').filter(l => l.startsWith('✗')).slice(0, 20).join('\n') };
  }
}

async function validate({ playerMap, comparisons, review, names }) {
  const issues = [];
  const add = (status, type, detail) => issues.push({ status, type, ...detail });
  const toCode = nationLookup();

  // 1) 매핑 충돌
  for (const r of review) add('pending_review', r.type, r);

  // 2) 신원 대조 (확정 매핑만)
  const mapped = [...names.keys()].filter(id => playerMap[id]?.status === 'valid' && playerMap[id].wikidata);
  const facts = await wikidata.playerFacts([...new Set(mapped.map(id => playerMap[id].wikidata))]);
  const seasonsOf = new Map();
  for (const c of comparisons) for (const id of c.unmatched || []) (seasonsOf.get(id) || seasonsOf.set(id, []).get(id)).push(`${c.season}/${c.club}`);

  for (const id of mapped) {
    const f = facts[playerMap[id].wikidata];
    if (!f) continue;
    const ours = names.get(id);
    if (f.dobs.length === 1 && f.dobs[0] !== ours.birth) {
      const sameYear = f.dobs[0].slice(0, 4) === ours.birth.slice(0, 4);
      add(sameYear ? 'warning' : 'pending_review', sameYear ? 'dob-mismatch' : 'dob-year-mismatch',
        { id, ours: ours.birth, source: f.dobs[0], qid: playerMap[id].wikidata });
    }
    const codes = new Set(f.sportCountries.map(toCode).filter(Boolean));
    if (codes.size && !codes.has(ours.nation) && !(ours.nation2 && codes.has(ours.nation2))) {
      add('warning', 'nation-mismatch', { id, ours: ours.nation, source: [...codes], qid: playerMap[id].wikidata });
    }
    if (f.heightCm && ours.height && Math.abs(f.heightCm - ours.height) >= 5) {
      add('warning', 'height-mismatch', { id, ours: ours.height, source: f.heightCm });
    }
  }

  // 3) 시즌 소속 대조
  // Wikidata는 유스·리저브·임대 나간 선수도 소속으로 기록하므로, 소스에만 있는 선수는
  // 우리 데이터 어딘가에 1군으로 나오는 선수일 때만 "빠졌을 수 있음"으로 본다
  const ownerOf = new Map(Object.entries(playerMap).filter(([, v]) => v.wikidata).map(([id, v]) => [v.wikidata, id]));
  let sourceOnlyOther = 0;
  for (const c of comparisons) {
    if (c.skipped) continue;
    for (const id of c.unmatched) {
      if (playerMap[id]?.status === 'valid') add('warning', 'membership-not-in-source', { season: c.season, club: c.club, id });
    }
    for (const s of c.sourceOnly.filter(s => s.presence === 'definite')) {
      if (ownerOf.has(s.qid)) add('pending_review', 'possible-missing-player', { season: c.season, club: c.club, id: ownerOf.get(s.qid), ...s });
      else sourceOnlyOther++;
    }
  }
  for (const id of names.keys()) if (playerMap[id]?.status === 'unmatched') add('warning', 'no-source-identity', { id });

  const format = runFormatValidator();
  if (!format.ok) add('invalid', 'format', { detail: format.summary });
  return { issues, format, factsCount: Object.keys(facts).length, sourceOnlyOther };
}

module.exports = { validate };
