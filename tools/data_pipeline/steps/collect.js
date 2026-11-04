// 수집: 구단별 선수 소속 기록을 Wikidata에서 받아 정규화해 저장 (구단당 요청 1번, 캐시 사용)
const path = require('path');
const { PIPELINE_DIR } = require('../config');
const { writeJsonIfChanged } = require('../lib/util');
const wikidata = require('../providers/wikidata');

const membershipsFile = (clubId) => path.join(PIPELINE_DIR, 'sources', 'wikidata', 'memberships', `${clubId}.json`);

async function collectMemberships(clubMap, clubIds, { force, log }) {
  const result = {};
  for (const id of clubIds) {
    const q = clubMap[id]?.status === 'valid' ? clubMap[id].wikidata : null;
    if (!q) { log(`  ${id}: 구단 매핑이 확정되지 않아 건너뜀`); continue; }
    const rows = await wikidata.clubMemberships(q, { force });
    rows.sort((a, b) => (a.qid + (a.start?.value ?? '')).localeCompare(b.qid + (b.start?.value ?? '')));
    writeJsonIfChanged(membershipsFile(id), { club: id, wikidata: q, provider: 'wikidata', license: 'CC0-1.0', memberships: rows });
    result[id] = rows;
    log(`  ${id}: 소속 기록 ${rows.length}건`);
  }
  return result;
}

module.exports = { collectMemberships, membershipsFile };
