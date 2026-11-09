// 같은 시즌 중복 소속 정리: 한 선수가 한 시즌에 여러 구단 파일에 있으면 근거에 따라 한 구단만 남긴다
//
// 판단 순서 (모두 출처 근거)
//  1) 임대: 한쪽에만 "임대로 와 있음"(loan)이 있으면 실제로 뛰는 그 구단
//  2) 소속 기간 (Wikidata P54): 그 시즌 기준일(9월 1일)을 포함하는 구단, 여럿이면 가장 늦게 합류한 구단
//  3) 출처 우선순위: 위키백과 기준일 명단 > 검증된 초기 데이터(EPL) > Wikidata 추정 명단
//  4) 그래도 못 정하면 첫 번째를 남기고 검토 목록에 기록
// 결과 보고: data/_pipeline/review/dedupe.json
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, CANONICAL_DIR, PIPELINE_DIR, snapshotDate } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');
const wikidata = require('../providers/wikidata');

const sourceRank = (file) => (file.source?.roster?.startsWith('enwiki:') ? 3 : !file.source ? 2 : 1);

/** 기준일이 소속 기간 안에 있는지: 3 확실 · 2 연도 단위라 애매하게 겹침 · 0 아님 */
function containScore(m, date) {
  if (!m?.start?.value) return 0;
  const sY = m.start.precision >= 11 ? m.start.value.slice(0, 10) : `${m.start.value.slice(0, 4)}-01-01`;
  const eVal = m.end?.value ? (m.end.precision >= 11 ? m.end.value.slice(0, 10) : `${m.end.value.slice(0, 4)}-12-31`) : '9999-12-31';
  if (date < sY || date > eVal) return 0;
  const exact = m.start.precision >= 11 && (!m.end || m.end.precision >= 11);
  return exact ? 3 : 2;
}

async function dedupe({ apply = false, log = console.log } = {}) {
  log(`■ 같은 시즌 중복 소속 정리${apply ? ' (적용)' : ' (미리보기)'}`);
  const clubsCanon = readJson(path.join(CANONICAL_DIR, 'clubs.json'), {});
  const playersCanon = readJson(path.join(CANONICAL_DIR, 'players.json'), {});

  // 시즌 → 선수 → 등장 위치들
  const files = new Map();   // 경로 → 내용
  const where = new Map();   // "시즌|선수" → [{ file, club, idx }]
  for (const s of fs.readdirSync(SEASONS_DIR).sort()) for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
    for (const f of fs.readdirSync(path.join(SEASONS_DIR, s, l)).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
      const p = path.join(SEASONS_DIR, s, l, f);
      const j = readJson(p);
      files.set(p, j);
      for (const pl of j.squad) {
        const k = `${s}|${pl.id}`;
        (where.get(k) || where.set(k, []).get(k)).push({ p, club: j.club, league: l, player: pl });
      }
    }
  }
  const dups = [...where.entries()].filter(([, v]) => v.length > 1);
  log(`  중복 ${dups.length}건`);

  // 필요한 구단의 소속 기록 (캐시된 Wikidata 응답 사용)
  const memo = new Map();
  const membershipsOf = async (clubId) => {
    if (memo.has(clubId)) return memo.get(clubId);
    const q = clubsCanon[clubId]?.wikidata;
    const ms = q ? await wikidata.clubMemberships(q) : [];
    const byQid = new Map();
    for (const m of ms) (byQid.get(m.qid) || byQid.set(m.qid, []).get(m.qid)).push(m);
    memo.set(clubId, byQid);
    return byQid;
  };

  const report = { byRule: { loan: 0, membership: 0, source: 0, undecided: 0 }, undecided: [], removed: [] };
  const toRemove = new Map();   // 경로 → Set(선수 ID)
  for (const [k, entries] of dups) {
    const [season, pid] = k.split('|');
    const date = snapshotDate(season);
    let keep = null, rule = null;

    const loaned = entries.filter((e) => e.player.loan);
    if (loaned.length === 1) { keep = loaned[0]; rule = 'loan'; }

    if (!keep) {
      const qid = playersCanon[pid]?.wikidata;
      if (qid) {
        const scored = [];
        for (const e of entries) {
          const recs = (await membershipsOf(e.club)).get(qid) || [];
          let best = { score: 0, start: '' };
          for (const m of recs) {
            const sc = containScore(m, date);
            if (sc > best.score || (sc === best.score && (m.start?.value || '') > best.start)) best = { score: sc, start: m.start?.value || '' };
          }
          scored.push({ e, ...best });
        }
        scored.sort((a, b) => b.score - a.score || b.start.localeCompare(a.start));
        if (scored[0].score > 0 && (scored.length < 2 || scored[0].score > scored[1].score || scored[0].start > scored[1].start)) { keep = scored[0].e; rule = 'membership'; }
      }
    }

    if (!keep) {
      const ranked = [...entries].sort((a, b) => sourceRank(files.get(b.p)) - sourceRank(files.get(a.p)));
      if (sourceRank(files.get(ranked[0].p)) > sourceRank(files.get(ranked[1].p))) { keep = ranked[0]; rule = 'source'; }
    }

    if (!keep) { keep = entries[0]; rule = 'undecided'; report.undecided.push({ season, player: pid, clubs: entries.map((e) => `${e.league}/${e.club}`) }); }
    report.byRule[rule]++;
    for (const e of entries) {
      if (e === keep) continue;
      (toRemove.get(e.p) || toRemove.set(e.p, new Set()).get(e.p)).add(pid);
      report.removed.push({ season, player: pid, from: `${e.league}/${e.club}`, kept: `${keep.league}/${keep.club}`, rule });
    }
  }
  log(`  판단 근거: 임대 ${report.byRule.loan} · 소속 기간 ${report.byRule.membership} · 출처 우선순위 ${report.byRule.source} · 미결정 ${report.byRule.undecided}`);
  log(`  제거할 항목 ${report.removed.length}개 (파일 ${toRemove.size}개)`);
  // 너무 작아지는 선수단 경고
  const shrink = [];
  for (const [p, ids] of toRemove) {
    const n = files.get(p).squad.length - ids.size;
    if (n < 16) shrink.push(`${path.relative(SEASONS_DIR, p)} → ${n}명`);
  }
  if (shrink.length) log(`  ⚠ 정리 후 16명 미만이 되는 구단 ${shrink.length}개: ${shrink.slice(0, 6).join(', ')}`);

  writeJsonIfChanged(path.join(PIPELINE_DIR, 'review', 'dedupe.json'), report);
  if (!apply) return report;

  // 파일 형식(다른 항목 · 줄 배치)을 그대로 두고 해당 선수 객체만 잘라낸다. 잘라낸 뒤 JSON이 맞는지 확인
  let ok = 0, fallback = 0;
  for (const [p, ids] of toRemove) {
    const text = fs.readFileSync(p, 'utf8');
    const out = removePlayers(text, ids);
    let parsed = null;
    try { parsed = JSON.parse(out); } catch { /* 아래에서 처리 */ }
    const expected = files.get(p).squad.length - ids.size;
    if (parsed && parsed.squad.length === expected && !parsed.squad.some((x) => ids.has(x.id))) { fs.writeFileSync(p, out); ok++; }
    else {
      const j = files.get(p);
      fs.writeFileSync(p, JSON.stringify({ ...j, squad: j.squad.filter((x) => !ids.has(x.id)) }, null, 2) + '\n');
      fallback++;
    }
  }
  log(`  적용 완료 · 파일 ${ok + fallback}개 (형식 유지 ${ok} · 다시 쓰기 ${fallback})`);
  return report;
}

/** squad 배열에서 id가 ids에 있는 객체를 중괄호 짝으로 찾아 지운다 (앞뒤 쉼표 정리) */
function removePlayers(text, ids) {
  let out = text;
  for (const id of ids) {
    const at = out.indexOf(`"id": "${id}"`);
    if (at < 0) continue;
    let start = out.lastIndexOf('{', at);
    let depth = 0, end = start;
    for (let i = start; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    // 객체 앞의 줄 시작까지, 뒤의 쉼표까지
    const lineStart = out.lastIndexOf('\n', start) + 1;
    let after = end;
    while (out[after] === ' ') after++;
    if (out[after] === ',') { out = out.slice(0, lineStart) + out.slice(out.indexOf('\n', after) + 1); }
    else {
      // 마지막 원소: 앞 원소 뒤의 쉼표를 지운다
      const before = out.lastIndexOf(',', lineStart);
      out = out.slice(0, before) + out.slice(before + 1, lineStart) + out.slice(out.indexOf('\n', end) + 1);
    }
  }
  return out;
}

module.exports = { dedupe, removePlayers };
