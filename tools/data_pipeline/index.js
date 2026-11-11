// 데이터 파이프라인 CLI
//   node tools/data_pipeline collect  --league eng1 [--club arsenal] [--force]
//   node tools/data_pipeline validate --league eng1 [--club arsenal]
//   node tools/data_pipeline export   --league eng1 [--apply]
//   node tools/data_pipeline sync     --league eng1 | --club arsenal | --all  [--apply] [--force]
//   node tools/data_pipeline report   --league eng1
//   node tools/data_pipeline merge    <중복 ID> <남길 ID>
//   node tools/data_pipeline dedupe [--apply]    같은 시즌 중복 소속 정리
//   node tools/data_pipeline worldcups [--apply]   월드컵 참가국 · 조 (위키백과 squads 문서)
//   node tools/data_pipeline standings [--league esp1] [--season 2019-20] [--apply]   실제 최종 순위 (위키백과 순위표)
//   node tools/data_pipeline photos [--club liverpool] [--season 2025-26] [--league eng1,esp1] [--limit 100]   선수 사진 (위키미디어 공용, 개인 보관용 · Git 제외)
//   node tools/data_pipeline photos-ids [--season 2025-26] [--league eng1] [--club liverpool]   사진 넣을 선수 ID 목록 (CSV)
//   node tools/data_pipeline photos-import   data/photos/inbox/<선수ID>/<시즌>.jpg 사진 가져오기
//   node tools/data_pipeline economy [--season 2024-25] [--apply]   구단 재정 · 명성 · 주급 다시 맞추기 (Money League 실제 매출 + 추정)
//   node tools/data_pipeline publish [--apply]   공개용 패러디 데이터(data-public/) 만들기
//   node tools/data_pipeline rename-club <바꿀 구단 ID> <고정 구단 ID> [--apply]
//   node tools/data_pipeline names    --league eng1 [--lang ko] [--apply]
//   node tools/data_pipeline build    --league esp1 [--season 2025-26] [--apply] [--overwrite]
// 순서: 구단 식별 → 수집 → 선수 식별 → 검증 → 내보내기. 내보내기는 --apply 없이는 미리보기만.
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, PIPELINE_DIR } = require('./config');
const { readJson, writeJsonIfChanged, listSeasons, listClubFiles } = require('./lib/util');
const { stats } = require('./lib/http');
const { resolveClubs } = require('./steps/clubs');
const { collectMemberships, membershipsFile } = require('./steps/collect');
const { resolvePlayers } = require('./steps/resolve');
const { validate } = require('./steps/validate');
const { exportFixes } = require('./steps/export');
const { mergePlayers } = require('./steps/merge');
const { fillNames } = require('./steps/names');
const { buildLeague } = require('./steps/build');
const { renameClub } = require('./steps/renameClub');
const { publish } = require('./steps/publish');
const { dedupe } = require('./steps/dedupe');
const { unifyNames } = require('./steps/unify');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]); };
const log = (...a) => console.log(...a);

function leaguesWithData() {
  const set = new Set();
  for (const s of fs.readdirSync(SEASONS_DIR)) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) set.add(l);
  return [...set].sort();
}

// --club만 주면 그 구단이 있는 리그를 찾는다
function leagueOfClub(club) {
  return leaguesWithData().find(l => listSeasons(SEASONS_DIR, l).some(s => fs.existsSync(path.join(SEASONS_DIR, s, l, `${club}.json`))));
}

function clubsOf(league, seasons, clubFilter) {
  const set = new Set();
  for (const s of seasons) for (const c of listClubFiles(SEASONS_DIR, s, league)) set.add(c);
  return [...set].filter(c => !clubFilter || c === clubFilter).sort();
}

async function run(league, stages, { clubFilter, force, apply }) {
  const t0 = Date.now();
  const seasons = listSeasons(SEASONS_DIR, league);
  const clubs = clubsOf(league, seasons, clubFilter);
  log(`\n■ ${league}: 시즌 ${seasons.length}개 · 구단 ${clubs.length}개`);

  log('① 구단 식별');
  const clubMap = await resolveClubs(clubs, { log });

  let memberships = {};
  if (stages.collect) {
    log('② 수집 (Wikidata 소속 기록)');
    memberships = await collectMemberships(clubMap, clubs, { force, log });
  } else {
    for (const c of clubs) { const f = readJson(membershipsFile(c)); if (f) memberships[c] = f.memberships; }
    log(`② 수집 생략: 저장된 소스 ${Object.keys(memberships).length}개 구단 사용`);
  }
  if (!stages.resolve) return report(league, { t0 });

  log('③ 선수 식별');
  const resolved = await resolvePlayers({ league, seasons, clubFilter, memberships, log });
  log('④ 검증');
  const v = await validate(resolved);

  let exported = null;
  if (stages.export) {
    log(`⑤ 내보내기 (${apply ? '적용' : '미리보기'})`);
    exported = exportFixes({ issues: v.issues, league, apply, log });
  }

  const statusCount = {};
  for (const i of v.issues) statusCount[i.status] = (statusCount[i.status] || 0) + 1;
  const typeCount = {};
  for (const i of v.issues) typeCount[i.type] = (typeCount[i.type] || 0) + 1;
  const players = [...resolved.names.keys()];
  const mapStatus = {};
  for (const id of players) { const s = resolved.playerMap[id]?.status ?? 'unmatched'; mapStatus[s] = (mapStatus[s] || 0) + 1; }
  const compared = resolved.comparisons.filter(c => !c.skipped);

  const summary = {
    league, clubFilter: clubFilter ?? null, seasons: seasons.length, clubs: clubs.length,
    clubMapping: Object.fromEntries(clubs.map(c => [c, clubMap[c]?.status ?? 'missing'])),
    players: players.length, playerMapping: mapStatus,
    clubSeasonsCompared: compared.length,
    squadEntries: compared.reduce((a, c) => a + c.squad, 0),
    squadEntriesMatched: compared.reduce((a, c) => a + c.matched, 0),
    sourceOnlyNotInOurData: v.sourceOnlyOther,
    issuesByStatus: statusCount, issuesByType: typeCount,
    formatValidator: v.format.summary, exported,
  };
  writeJsonIfChanged(path.join(PIPELINE_DIR, 'reports', `${league}${clubFilter ? '-' + clubFilter : ''}.json`), { summary, issues: v.issues });
  writeJsonIfChanged(path.join(PIPELINE_DIR, 'review', `${league}${clubFilter ? '-' + clubFilter : ''}.json`),
    v.issues.filter(i => i.status === 'pending_review'));
  return report(league, { t0, summary });
}

function report(league, { t0, summary } = {}) {
  if (league) summary ??= readJson(path.join(PIPELINE_DIR, 'reports', `${league}.json`))?.summary;
  if (summary) {
    log('\n── 결과 ──');
    log(`선수 ${summary.players}명 · 매핑 ${JSON.stringify(summary.playerMapping)}`);
    log(`구단 시즌 대조 ${summary.clubSeasonsCompared}개 · 선수 항목 ${summary.squadEntries}개 중 소스와 일치 ${summary.squadEntriesMatched}개`);
    log(`검증 이슈 ${JSON.stringify(summary.issuesByStatus)}`);
    log(`  유형별 ${JSON.stringify(summary.issuesByType)}`);
    log(`형식 검사: ${summary.formatValidator}`);
  }
  if (t0) {
    const total = stats.requests + stats.cacheHits;
    log(`요청 ${stats.requests}회 · 캐시 적중 ${stats.cacheHits}회 (${total ? Math.round(stats.cacheHits / total * 100) : 0}%) · 재시도 ${stats.retries} · 실패 ${stats.failures} · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    fs.mkdirSync(PIPELINE_DIR, { recursive: true });
    fs.appendFileSync(path.join(PIPELINE_DIR, 'usage.log'),
      `${new Date().toISOString()}\t${cmd}\t${league}\trequests=${stats.requests}\tcacheHits=${stats.cacheHits}\tretries=${stats.retries}\tfailures=${stats.failures}\n`);
  }
}

(async () => {
  const STAGES = {
    collect: { collect: true },
    validate: { resolve: true },
    export: { resolve: true, export: true },
    sync: { collect: true, resolve: true, export: true },
  };
  const clubFilter = typeof opt('club') === 'string' ? opt('club') : undefined;
  let leagues = opt('all') ? leaguesWithData() : [typeof opt('league') === 'string' ? opt('league') : clubFilter && leagueOfClub(clubFilter)].filter(Boolean);

  if (cmd === 'report') return leagues.forEach(l => report(l));
  if (cmd === 'unify-names') return unifyNames({ apply: args.includes('--apply'), log });
  if (cmd === 'worldcups') return require('./steps/worldcups').worldcups({ apply: args.includes('--apply'), log });
  if (cmd === 'standings') return require('./steps/standings').standings({ apply: args.includes('--apply'), leagueFilter: typeof opt('league') === 'string' ? opt('league') : undefined, seasonFilter: typeof opt('season') === 'string' ? opt('season') : undefined, log });
  if (cmd === 'photos') return require('./steps/photos').photos({ club: typeof opt('club') === 'string' ? opt('club') : undefined, league: typeof opt('league') === 'string' ? opt('league') : undefined, season: typeof opt('season') === 'string' ? opt('season') : undefined, limit: typeof opt('limit') === 'string' ? +opt('limit') : undefined, log });
  if (cmd === 'photos-ids') return require('./steps/photoImport').photoIds({ season: typeof opt('season') === 'string' ? opt('season') : undefined, league: typeof opt('league') === 'string' ? opt('league') : undefined, club: typeof opt('club') === 'string' ? opt('club') : undefined, log });
  if (cmd === 'photos-import') return require('./steps/photoImport').photoImport({ log });
  if (cmd === 'economy') return require('./steps/economy').economy({ apply: args.includes('--apply'), seasonFilter: typeof opt('season') === 'string' ? opt('season') : undefined, log });
  if (cmd === 'dedupe') return dedupe({ apply: args.includes('--apply'), log });
  if (cmd === 'publish') return publish({ apply: args.includes('--apply'), log });
  if (cmd === 'rename-club') return renameClub(args[1], args[2], { apply: args.includes('--apply'), log });
  if (cmd === 'merge') return mergePlayers(args[1], args[2], { log });
  if (cmd === 'build') {
    const t0 = Date.now();
    for (const l of leagues) {
      log(`
■ ${l} 구축 (${opt('apply') ? '적용' : '미리보기'})`);
      await buildLeague({ league: l, apply: !!opt('apply'), overwrite: !!opt('overwrite'), seasonFilter: typeof opt('season') === 'string' ? opt('season') : undefined, log });
    }
    return report(null, { t0 });
  }
  if (cmd === 'names') {
    const t0 = Date.now();
    for (const l of leagues) {
      const names = new Map();
      for (const s of listSeasons(SEASONS_DIR, l)) for (const c of listClubFiles(SEASONS_DIR, s, l)) {
        for (const p of readJson(path.join(SEASONS_DIR, s, l, `${c}.json`)).squad) names.set(p.id, { name: p.name, nation: p.nation });
      }
      log(`\n■ ${l}: 선수 ${names.size}명 이름 확인`);
      await fillNames({ lang: typeof opt('lang') === 'string' ? opt('lang') : 'ko', names, apply: !!opt('apply'), log });
    }
    return report(leagues[0], { t0 });
  }
  if (!STAGES[cmd] || !leagues.length) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 7).join('\n'));
    process.exit(1);
  }
  for (const l of leagues) await run(l, STAGES[cmd], { clubFilter, force: !!opt('force'), apply: !!opt('apply') });
})().catch(e => { console.error('✗', e.message); process.exit(1); });
