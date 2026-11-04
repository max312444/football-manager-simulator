// 내보내기: 기존 게임 JSON(data/seasons/...)에 확실한 수정만 반영
// - 기본은 미리보기(dry-run). --apply 일 때만 파일을 고친다
// - 현재 반영 대상: 출처와 생년월일이 다르고 출생연도는 같은 경우 (ID가 바뀌지 않는 수정)
// - 출생연도가 바뀌는 수정(ID 변경), 선수 추가·삭제는 검토 목록으로만 남긴다
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, CANONICAL_DIR } = require('../config');
const { readJson, writeJsonIfChanged } = require('../lib/util');

function filesContaining(id) {
  const out = [];
  for (const season of fs.readdirSync(SEASONS_DIR)) {
    for (const league of fs.readdirSync(path.join(SEASONS_DIR, season))) {
      const dir = path.join(SEASONS_DIR, season, league);
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
        const p = path.join(dir, f);
        if (fs.readFileSync(p, 'utf8').includes(`"id": "${id}"`)) out.push(p);
      }
    }
  }
  return out;
}

// 파일 서식을 유지하려고 해당 선수 줄의 birth 값만 바꾼다 (id·birth는 같은 줄에 있음)
function replaceBirth(file, id, from, to) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"id": "${id}"`) && lines[i].includes(`"birth": "${from}"`)) {
      lines[i] = lines[i].replace(`"birth": "${from}"`, `"birth": "${to}"`);
      changed = true;
    }
  }
  if (changed) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, lines.join('\n'));
    fs.renameSync(tmp, file);
  }
  return changed;
}

function exportFixes({ issues, league, apply, log }) {
  const fixes = issues.filter(i => i.type === 'dob-mismatch');
  let filesChanged = 0;
  for (const f of fixes) {
    const files = filesContaining(f.id);
    if (apply) for (const file of files) if (replaceBirth(file, f.id, f.ours, f.source)) filesChanged++;
    log(`  ${apply ? '수정' : '제안'}: ${f.id} 생년월일 ${f.ours} → ${f.source} (${files.length}개 파일, Wikidata ${f.qid})`);
  }

  // 능력치 출처 메타데이터: 지금 능력치는 실측·라이선스 데이터가 아니라 추정값임을 명시
  const metaFile = path.join(CANONICAL_DIR, 'attribute-sources.json');
  const meta = readJson(metaFile, {});
  meta[league] ??= {
    attribute_source: 'llm-estimate',
    attribute_model_version: 'v0',
    attribute_type: 'derived',
    attribute_confidence: 'low',
    attribute_updated_at: new Date().toISOString().slice(0, 10),
    note: '선수 능력치는 출처 데이터가 아닌 추정값. 자체 평가 모델 또는 라이선스 데이터로 교체 예정',
  };
  writeJsonIfChanged(metaFile, meta);
  return { proposed: fixes.length, filesChanged };
}

module.exports = { exportFixes };
