// 구단 ID 바꾸기: 잘못 만들어진 구단 ID(예: ars-et-labor-ferrara)를 고정 ID(spal)로 옮긴다.
// 대상: 시즌 파일 이름 · club 필드 · _league.json 참가 목록 · 임대 원소속(loan) · 구단 마스터 · canonical/clubs.json
// 근거 없이 합치지 않도록, 별칭(club-aliases.json)에 등록된 ID로만 바꿀 수 있다.
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, CLUBS_DIR, CANONICAL_DIR } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');

function renameClub(from, into, { apply = false, log = console.log } = {}) {
  if (!from || !into || from === into) throw new Error('사용법: rename-club <바꿀 ID> <새 ID> [--apply]');
  const aliases = readJson(path.join(CANONICAL_DIR, 'club-aliases.json'), {});
  if (!Object.values(aliases).includes(into)) throw new Error(`${into}는 club-aliases.json에 별칭 대상으로 등록되어 있지 않음`);

  const ops = [];
  for (const season of fs.readdirSync(SEASONS_DIR)) {
    for (const league of fs.readdirSync(path.join(SEASONS_DIR, season))) {
      const dir = path.join(SEASONS_DIR, season, league);
      const metaFile = path.join(dir, '_league.json');
      if (fs.existsSync(metaFile)) {
        const meta = readJson(metaFile);
        if (meta.clubs?.includes(from)) {
          if (meta.clubs.includes(into)) throw new Error(`${season}/${league}에 ${from}와 ${into}가 둘 다 있음`);
          meta.clubs = meta.clubs.map((c) => (c === from ? into : c)).sort();
          ops.push(['league', metaFile, meta]);
        }
      }
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
        const file = path.join(dir, f);
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes(`"${from}"`)) continue;
        const next = text.split(`"${from}"`).join(`"${into}"`);
        const target = f === `${from}.json` ? path.join(dir, `${into}.json`) : file;
        if (target !== file && fs.existsSync(target)) throw new Error(`이미 있음: ${target}`);
        ops.push(['season', file, next, target]);
      }
    }
  }
  const master = path.join(CLUBS_DIR, `${from}.json`);
  const masterInto = path.join(CLUBS_DIR, `${into}.json`);
  const canonFile = path.join(CANONICAL_DIR, 'clubs.json');
  const canon = readJson(canonFile, {});

  log(`■ 구단 ID 바꾸기 ${from} → ${into}${apply ? ' (적용)' : ' (미리보기)'}`);
  log(`  시즌 참가 목록 ${ops.filter((o) => o[0] === 'league').length}개 · 시즌 파일 ${ops.filter((o) => o[0] === 'season').length}개`);
  log(`  구단 마스터: ${fs.existsSync(master) ? (fs.existsSync(masterInto) ? `${from}.json 삭제 (${into}.json 유지)` : `${from}.json → ${into}.json`) : '없음'}`);
  if (!apply) return;

  for (const op of ops) {
    if (op[0] === 'league') writeJsonIfChanged(op[1], op[2]);
    else { fs.writeFileSync(op[3], op[2]); if (op[3] !== op[1]) fs.unlinkSync(op[1]); }
  }
  if (fs.existsSync(master)) {
    if (fs.existsSync(masterInto)) fs.unlinkSync(master);
    else {
      const m = readJson(master);
      m.id = into;
      writeJsonIfChanged(masterInto, m);
      fs.unlinkSync(master);
    }
  }
  if (canon[from]) {
    canon[into] = { ...canon[from], ...(canon[into] || {}), renamedFrom: from };
    delete canon[from];
    writeJsonIfChanged(canonFile, canon);
  }
  log('  적용 완료');
}

module.exports = { renameClub };
