// 포지션 · 능력 점검 (읽기만, 고치지 않음)
//  node tools/data_pipeline positions-check [--season 2025-26] [--league esp1]
//  1) 인포박스와 다른 포지션: 지금 포지션이 위키백과 인포박스 포지션 어디에도 없음 (골키퍼 충돌은 따로)
//  2) 능력치와 맞지 않는 포지션: 게임 공식(game/src/engine/ratings.ts 와 같은 가중치)으로 다른 포지션 능력이
//     지금 포지션보다 5 이상 높은데 보조 포지션에도 없음 → 능력치가 다른 포지션에 맞춰 만들어졌을 가능성
//  3) 선수단 구성: 시즌 · 구단마다 골키퍼 2 · 수비 5 · 미드필더 4 · 공격 2 명 미만
//  4) 인포박스가 없는 선수 (사람이 확인할 목록)
//  결과: 요약은 화면, 목록은 data/_pipeline/reports/positions-check.txt
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', 'data');
const SEASONS = path.join(ROOT, 'seasons');
const POSFILE = path.join(ROOT, 'canonical', 'positions.json');
const GROUP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };

// game/src/engine/ratings.ts 의 OVR_W · ROLE 과 같게 유지할 것
const OVR_W = {
  GK: { ref: 3, one: 2, han: 2, pos: 1.5, aer: 1, com: 1, pas: 0.5 },
  CB: { tac: 3, pos: 3, aer: 2, str: 1.5, pac: 1, com: 1, pas: 0.7 },
  FB: { tac: 2, pac: 2, sta: 1.5, pos: 1.5, pas: 1.2, dri: 1, str: 0.5 },
  DM: { tac: 2.5, pos: 2, pas: 2, sta: 1.2, str: 1, com: 1, vis: 0.8 },
  CM: { pas: 2.5, vis: 2, sta: 1.2, com: 1.2, dri: 1, tac: 1, sho: 0.6 },
  AM: { pas: 2, vis: 2, dri: 2, sho: 1.5, com: 1.2, pac: 0.6 },
  WM: { pas: 2, sta: 2, pac: 1.8, dri: 1.5, vis: 1.2, tac: 1, sho: 0.8 },
  W: { dri: 2.5, pac: 2.5, sho: 1.3, pas: 1.3, vis: 1, com: 0.6 },
  ST: { sho: 3, com: 2, pos: 1.2, dri: 1.2, pac: 1.2, str: 1, aer: 1 },
};
const ROLE = { GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', DM: 'DM', CM: 'CM', AM: 'AM', LM: 'WM', RM: 'WM', LW: 'W', RW: 'W', ST: 'ST' };
const ratingAt = (attrs, pos) => { const w = OVR_W[ROLE[pos]]; let s = 0, t = 0; for (const [k, v] of Object.entries(w)) { s += (attrs[k] ?? 50) * v; t += v; } return s / t; };

function* seasonFiles(season, league) {
  for (const s of fs.readdirSync(SEASONS).sort()) {
    if (season && s !== season) continue;
    for (const l of fs.readdirSync(path.join(SEASONS, s))) {
      if (league && l !== league) continue;
      for (const f of fs.readdirSync(path.join(SEASONS, s, l))) if (!f.startsWith('_') && f.endsWith('.json')) yield { season: s, league: l, file: path.join(SEASONS, s, l, f) };
    }
  }
}

function positionCheck({ season, league, log }) {
  const box = fs.existsSync(POSFILE) ? JSON.parse(fs.readFileSync(POSFILE, 'utf8')).players : {};
  const { codesOf } = require('./positions');   // 저장된 원문을 지금 규칙으로
  for (const v of Object.values(box)) v.codes = v.raw ? codesOf(v.raw).all : [];
  const st = { rows: 0, players: new Set(), boxMismatch: 0, gkConflict: 0, attrMismatch: 0, noBox: new Set(), squads: 0, thin: 0 };
  const lines = { boxMismatch: [], gkConflict: [], attrMismatch: [], thin: [] };
  const seen = { boxMismatch: new Set(), attrMismatch: new Set(), gkConflict: new Set() };
  const OUTFIELD = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
  for (const { season: s, league: l, file } of seasonFiles(season, league)) {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    const count = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const p of c.squad ?? []) {
      st.rows++; st.players.add(p.id);
      count[GROUP[p.pos]]++;
      const codes = box[p.id]?.codes ?? [];
      if (!codes.length) st.noBox.add(`${p.name} (${p.id})`);
      else if (p.pos === 'GK' ? !codes.includes('GK') : codes.every((x) => x === 'GK')) {   // 데이터는 골키퍼인데 인포박스엔 없음 · 또는 그 반대
        st.gkConflict++; if (!seen.gkConflict.has(p.id)) { seen.gkConflict.add(p.id); lines.gkConflict.push(`${s} ${c.club} ${p.name}: 데이터 ${p.pos} · 인포박스 ${codes.join('/')}  [${box[p.id].raw}]`); }
      } else if (!codes.includes(p.pos)) {
        st.boxMismatch++; if (!seen.boxMismatch.has(p.id)) { seen.boxMismatch.add(p.id); lines.boxMismatch.push(`${s} ${c.club} ${p.name}: 데이터 ${p.pos} · 인포박스 ${codes.join('/')}  [${box[p.id].raw}]`); }
      }
      if (p.pos !== 'GK') {
        const here = ratingAt(p.attrs, p.pos);
        const best = OUTFIELD.map((x) => [x, ratingAt(p.attrs, x)]).sort((a, b) => b[1] - a[1])[0];
        if (best[0] !== p.pos && best[1] - here > 1) {   // 주 포지션보다 1 넘게 높은 자리가 있음 → 있으면 안 됨
          st.attrMismatch++; if (!seen.attrMismatch.has(p.id)) { seen.attrMismatch.add(p.id); lines.attrMismatch.push(`${s} ${c.club} ${p.name}: ${p.pos} ${Math.round(here)} · ${best[0]} ${Math.round(best[1])}`); }
        }
      }
    }
    st.squads++;
    if (count.GK < 2 || count.DF < 5 || count.MF < 4 || count.FW < 2) { st.thin++; lines.thin.push(`${s} ${l} ${c.club}: GK ${count.GK} · DF ${count.DF} · MF ${count.MF} · FW ${count.FW}`); }
  }
  log(`선수 · 시즌 ${st.rows}줄 · 선수 ${st.players.size}명 · 구단 시즌 ${st.squads}개`);
  log(`1) 인포박스와 다른 포지션: ${st.boxMismatch}줄 (${seen.boxMismatch.size}명) · 골키퍼 충돌 ${st.gkConflict}줄 (${seen.gkConflict.size}명)`);
  log(`2) 주 포지션보다 능력이 높은 자리가 있는 선수: ${st.attrMismatch}줄 (${seen.attrMismatch.size}명)`);
  log(`3) 선수단 구성이 모자란 구단 시즌: ${st.thin} / ${st.squads}`);
  log(`4) 인포박스가 없는 선수: ${st.noBox.size}명`);
  const report = path.join(ROOT, '_pipeline', 'reports', 'positions-check.txt');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, [
    '# 1) 인포박스와 다른 포지션', ...lines.boxMismatch, '', '# 골키퍼 충돌 (그대로 둠 · 동명이인 연결 오류 확인)', ...lines.gkConflict, '',
    '# 2) 주 포지션보다 능력이 높은 자리', ...lines.attrMismatch, '', '# 3) 선수단 구성', ...lines.thin, '', '# 4) 인포박스 없음', ...[...st.noBox],
  ].join('\n'));
  log(`목록: ${path.relative(process.cwd(), report)}`);
  return st;
}

/**
 * 주 포지션이 가장 높은 능력이 되도록: 더 높은 자리(경쟁 자리)가 있으면
 * 주 포지션이 경쟁 자리보다 더 중요하게 쓰는 능력치만 1씩 올린다 (예: ST 대 LW → 슈팅 · 침착성 · 위치 선정 · 힘 · 공중볼)
 * → 주 포지션 능력이 경쟁 자리 수준에 맞춰지고, 전체 수준이 크게 부풀지 않는다. 최대 30번, 99까지. 골키퍼는 하지 않음
 */
function ensureMainBest(p) {
  if (p.pos === 'GK') return false;
  const OUT = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
  const norm = (pos) => { const w = OVR_W[ROLE[pos]]; const t = Object.values(w).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t])); };
  const mine = norm(p.pos);
  let changed = false;
  for (let n = 0; n < 30; n++) {
    const here = ratingAt(p.attrs, p.pos);
    const rival = OUT.filter((x) => x !== p.pos).map((x) => [x, ratingAt(p.attrs, x)]).sort((a, b) => b[1] - a[1])[0];
    if (rival[1] < here) break;   // 화면(반올림)에서도 주 포지션이 가장 높게
    const theirs = norm(rival[0]);
    const keys = Object.keys(mine).filter((k) => mine[k] > (theirs[k] ?? 0) && p.attrs[k] != null && p.attrs[k] < 99);
    if (!keys.length) break;
    for (const k of keys) p.attrs[k] += 1;
    changed = true;
  }
  return changed;
}

module.exports = { positionCheck, ratingAt, ensureMainBest };
