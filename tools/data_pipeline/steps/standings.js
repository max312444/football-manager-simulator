// 실제 최종 순위: 영어 위키백과 "{시즌} {리그}" 문서의 순위표 틀(Sports table · Fb cl team) 순서에서 읽는다
//  → data/seasons/{시즌}/{리그}/_league.json 의 standings (1위부터)
//  구단 매칭은 위키백과 문서 → Wikidata QID → canonical/clubs.json (+ club-aliases.json 의 QID 별칭). 이름 비슷함으로는 맞추지 않는다
//  순위표 구단 목록이 _league.json clubs 와 정확히 같을 때만 쓴다. 다르면 보고만 한다
//  진행 중인 시즌 (순위표에 '경기 남음' 표시가 있으면)은 건너뛴다
//  node tools/data_pipeline standings [--league esp1] [--season 2019-20] [--apply]
const fs = require('fs');
const path = require('path');
const { DATA, LEAGUES } = require('../config');
const { readJson } = require('../lib/util');
const wikipedia = require('../providers/wikipedia');
const wikidata = require('../providers/wikidata');

async function standings({ apply, leagueFilter, seasonFilter, log }) {
  log(`\n■ 실제 최종 순위 (${apply ? '적용' : '미리보기'})`);
  const canon = readJson(path.join(DATA, 'canonical', 'clubs.json'));
  const aliases = readJson(path.join(DATA, 'canonical', 'club-aliases.json'));
  const byQid = new Map();
  for (const [id, c] of Object.entries(canon)) if (c.wikidata) byQid.set(c.wikidata, id);
  for (const [k, id] of Object.entries(aliases)) if (/^Q\d+$/.test(k)) byQid.set(k, id);   // QID 별칭이 우선 (-1 / -2 로 나눈 구단)
  // 순위표 매칭에만 쓰는 별칭 (사용자 결정, 구단 데이터는 합치지 않음):
  //  레겐스부르크 — 위키백과 문서 항목 Q265570 (SSV Jahn Regensburg) · 우리 데이터 항목 Q97927377 (SSV Jahn 2000 Regensburg)
  const STANDINGS_ONLY = { Q265570: 'jahn-regensburg' };
  for (const [q, id] of Object.entries(STANDINGS_ONLY)) if (!byQid.has(q)) byQid.set(q, id);

  const report = { ok: 0, same: 0, skipped: [] };
  for (const [lg, cfg] of Object.entries(LEAGUES)) {
    if (leagueFilter && lg !== leagueFilter) continue;
    const seasons = fs.readdirSync(path.join(DATA, 'seasons')).filter((s) => fs.existsSync(path.join(DATA, 'seasons', s, lg, '_league.json')));
    for (const season of seasons) {
      if (seasonFilter && season !== seasonFilter) continue;
      const file = path.join(DATA, 'seasons', season, lg, '_league.json');
      const meta = readJson(file);
      const name = typeof cfg.enwiki === 'function' ? cfg.enwiki(+season.slice(0, 4)) : cfg.enwiki;
      const title = `${season.slice(0, 4)}–${season.slice(5)} ${name}`;
      const { teams, revid, ongoing } = await wikipedia.seasonTableTeams(title, { order: true });
      if (!teams.length) { report.skipped.push(`${season} ${lg}: 순위표 없음 (${title})`); continue; }
      if (ongoing) { report.skipped.push(`${season} ${lg}: 시즌 진행 중`); continue; }
      const canonT = await wikipedia.resolveTitles(teams);
      const hits = await wikidata.byEnwikiTitles([...new Set(Object.values(canonT).filter(Boolean))]);
      const qidOf = new Map(hits.map((h) => [h.enwiki, h.qid]));
      const listed = new Set(meta.clubs);
      // -1 / -2 로 나눈 구단 (club-aliases 의 QID 별칭): 순위표가 다른 쪽 항목을 가리키면, 이 리그 목록에 있는 짝으로 맞춘다 (순위용, 합치지 않음)
      const sibling = (id) => {
        if (!id || listed.has(id) || !/-\d$/.test(id)) return id;
        const pair = meta.clubs.filter((c) => c.replace(/-\d$/, '') === id.replace(/-\d$/, '') && c !== id);
        return pair.length === 1 ? pair[0] : id;
      };
      const order = teams.map((t) => sibling(byQid.get(qidOf.get(canonT[t] ?? t)) ?? null));
      const missing = teams.filter((t, i) => !order[i]);
      const extra = order.filter((id) => id && !listed.has(id));
      const absent = meta.clubs.filter((id) => !order.includes(id));
      if (missing.length || extra.length || absent.length || new Set(order).size !== order.length) {
        report.skipped.push(`${season} ${lg}: 구단 불일치 · 매칭 안 됨 [${missing.join(', ')}] · 목록 밖 [${extra.join(', ')}] · 순위표에 없음 [${absent.join(', ')}]`);
        continue;
      }
      if (JSON.stringify(meta.standings) === JSON.stringify(order)) { report.same++; continue; }
      report.ok++;
      log(`  ${season} ${lg}: 1위 ${order[0]} · 꼴찌 ${order[order.length - 1]} (enwiki ${revid})`);
      if (apply) {
        // 원래 파일 모양 (키 순서 · 줄바꿈)을 유지하고 standings 만 넣는다
        const text = fs.readFileSync(file, 'utf8');
        const next = JSON.parse(text);
        next.standings = order;
        const oneLine = /"clubs": \[[^\n]*\]/.test(text);
        let out = JSON.stringify(next, null, 2);
        if (oneLine) out = out.replace(/\[\n\s+("[^\]]*?)\n\s+\]/g, (_, body) => `[${body.replace(/,\n\s+/g, ', ')}]`);
        fs.writeFileSync(file, out + '\n');
      }
    }
  }
  log(`  새로 넣음 ${report.ok} · 이미 같음 ${report.same} · 건너뜀 ${report.skipped.length}`);
  for (const s of report.skipped) log(`  - ${s}`);
  if (!apply && report.ok) log('  (--apply 로 저장)');
  return report;
}

module.exports = { standings };
