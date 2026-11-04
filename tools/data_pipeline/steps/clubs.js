// 구단 식별: 우리 구단 ID → Wikidata 항목
// 한 번 확정(valid)된 매핑은 다시 바꾸지 않는다. 애매하면 pending_review로 남긴다.
const path = require('path');
const { CLUBS_DIR, CANONICAL_DIR, NATION_TO_COUNTRY_QIDS } = require('../config');
const { readJson, writeJsonIfChanged, normName } = require('../lib/util');
const wikidata = require('../providers/wikidata');

const CLUBS_FILE = path.join(CANONICAL_DIR, 'clubs.json');
const OVERRIDES_FILE = path.join(CANONICAL_DIR, 'club-overrides.json'); // 수동 지정 { "club-id": "Q..." }

async function resolveClubs(clubIds, { log }) {
  const map = readJson(CLUBS_FILE, {});
  const overrides = readJson(OVERRIDES_FILE, {});
  for (const id of clubIds) {
    if (overrides[id]) { map[id] = { wikidata: overrides[id], status: 'valid', method: 'manual' }; continue; }
    if (map[id]?.status === 'valid') continue;

    const club = readJson(path.join(CLUBS_DIR, `${id}.json`));
    if (!club) { map[id] = { wikidata: null, status: 'invalid', note: 'clubs/ 파일 없음' }; continue; }
    const expected = NATION_TO_COUNTRY_QIDS[club.nation] || [];
    const cands = (await wikidata.searchClub(club.name))
      .filter(c => !expected.length || c.countries.some(q => expected.includes(q)));
    // 첫 후보의 영문 이름이 우리 이름과 같거나 "F.C." 등만 다르면 확정, 아니면 검토 대기
    const top = cands[0];
    const exact = top && normName(top.label).replace(/\b(f c|a f c|fc|afc)\b/g, '').trim() === normName(club.name).replace(/\b(fc|afc)\b/g, '').trim();
    map[id] = top
      ? { wikidata: top.qid, label: top.label, status: exact || cands.length === 1 ? 'valid' : 'pending_review', method: 'search+country',
          ...(exact || cands.length === 1 ? {} : { candidates: cands.slice(0, 5).map(c => `${c.qid} ${c.label}`) }) }
      : { wikidata: null, status: 'pending_review', note: '후보 없음' };
    log(`  구단 ${id} → ${map[id].wikidata ?? '-'} (${map[id].status}) ${map[id].label ?? ''}`);
  }
  writeJsonIfChanged(CLUBS_FILE, map);
  return map;
}

module.exports = { resolveClubs, CLUBS_FILE };
