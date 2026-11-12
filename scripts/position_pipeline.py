"""포지션 교정 파이프라인 (실명 데이터 data/seasons 대상 · 결과물은 모두 gitignore)

  py scripts/position_pipeline.py --extract   점검 보고서를 읽어 오탐을 거르고 검수용 배치를 만든다
  py scripts/position_pipeline.py --apply     data/patches/patch_*.json 을 원본에 반영하고 다시 점검한다

입력: data/_pipeline/reports/positions-check.txt (node tools/data_pipeline positions-check 가 만든 것)
출력: data/batches/mismatch_batch_NN.json · missing_batch_NN.json · gk_conflict.json (80줄씩)
      data/patches/patch_mainbest_auto.json (#2 자동 보정)
패치 형식: [{"id", "season", "club", "main": "RW", "sub": ["RM"], "note": "..."}]
  sub 를 빼면 보조 포지션은 그대로 둔다. main 이 지금과 같으면 보조만 바꾼다.
"""
import argparse, glob, json, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'data')
SEASONS = os.path.join(DATA, 'seasons')
REPORT = os.path.join(DATA, '_pipeline', 'reports', 'positions-check.txt')
BATCHES = os.path.join(DATA, 'batches')
PATCHES = os.path.join(DATA, 'patches')
BATCH_SIZE = 80

GROUP = {'GK': 'GK', 'CB': 'DF', 'LB': 'DF', 'RB': 'DF', 'LWB': 'DF', 'RWB': 'DF', 'DM': 'MF', 'CM': 'MF', 'AM': 'MF',
         'LM': 'MF', 'RM': 'MF', 'LW': 'FW', 'RW': 'FW', 'ST': 'FW'}
OUTFIELD = [p for p in GROUP if p != 'GK']
# 포괄 표기 → 정상으로 볼 포지션 (같은 줄 + 경계에 걸친 자리)
GENERIC = {
    'midfielder': {'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW'},   # 옛 잉글랜드식 표기: 윙어도 Midfielder
    'forward': {'ST', 'LW', 'RW', 'AM', 'LM', 'RM'},           # 처진 공격수 · 측면 공격수
    'defender': {'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM'},        # 수비형 미드필더 겸업
}
SAME_LINE = {'midfielder': 'MF', 'forward': 'FW', 'defender': 'DF'}

# game/src/engine/ratings.ts 와 같은 가중치 (tools/data_pipeline/steps/positionCheck.js 와 같게)
OVR_W = {
    'GK': {'ref': 3, 'one': 2, 'han': 2, 'pos': 1.5, 'aer': 1, 'com': 1, 'pas': 0.5},
    'CB': {'tac': 3, 'pos': 3, 'aer': 2, 'str': 1.5, 'pac': 1, 'com': 1, 'pas': 0.7},
    'FB': {'tac': 2, 'pac': 2, 'sta': 1.5, 'pos': 1.5, 'pas': 1.2, 'dri': 1, 'str': 0.5},
    'DM': {'tac': 2.5, 'pos': 2, 'pas': 2, 'sta': 1.2, 'str': 1, 'com': 1, 'vis': 0.8},
    'CM': {'pas': 2.5, 'vis': 2, 'sta': 1.2, 'com': 1.2, 'dri': 1, 'tac': 1, 'sho': 0.6},
    'AM': {'pas': 2, 'vis': 2, 'dri': 2, 'sho': 1.5, 'com': 1.2, 'pac': 0.6},
    'WM': {'pas': 2, 'sta': 2, 'pac': 1.8, 'dri': 1.5, 'vis': 1.2, 'tac': 1, 'sho': 0.8},
    'W': {'dri': 2.5, 'pac': 2.5, 'sho': 1.3, 'pas': 1.3, 'vis': 1, 'com': 0.6},
    'ST': {'sho': 3, 'com': 2, 'pos': 1.2, 'dri': 1.2, 'pac': 1.2, 'str': 1, 'aer': 1},
}
ROLE = {'GK': 'GK', 'CB': 'CB', 'LB': 'FB', 'RB': 'FB', 'LWB': 'FB', 'RWB': 'FB', 'DM': 'DM', 'CM': 'CM', 'AM': 'AM',
        'LM': 'WM', 'RM': 'WM', 'LW': 'W', 'RW': 'W', 'ST': 'ST'}


def rating_at(attrs, pos):
    w = OVR_W[ROLE[pos]]
    return sum(attrs.get(k, 50) * v for k, v in w.items()) / sum(w.values())


FIELD_KEYS = ['sho', 'pas', 'dri', 'tac', 'pos', 'aer', 'pac', 'sta', 'str', 'vis', 'com']


def rebalance(p):
    """자리를 바꿨는데 다른 자리가 더 높으면: 실력(가장 높은 오버롤)은 그대로 두고 주 포지션이 가장 높게.
    주 포지션 쪽 능력치를 올린 뒤(ensure_main_best) 모든 필드 능력치를 같은 만큼 내려 최고값을 원래대로 (부풀림 없음)"""
    if p['pos'] == 'GK':
        return False
    best = max(rating_at(p['attrs'], x) for x in OUTFIELD)
    if rating_at(p['attrs'], p['pos']) >= best - 0.05:
        return False
    ensure_main_best(p)
    d = round(rating_at(p['attrs'], p['pos']) - best)
    if d > 0:
        for k in FIELD_KEYS:
            if k in p['attrs']:
                p['attrs'][k] = max(1, p['attrs'][k] - d)
    return True


def ensure_main_best(p):
    """주 포지션이 가장 높은 능력이 되도록, 주 포지션이 경쟁 자리보다 더 중요하게 쓰는 능력치만 1씩 올린다 (positionCheck.js 와 같은 규칙)"""
    if p['pos'] == 'GK':
        return False
    norm = lambda pos: {k: v / sum(OVR_W[ROLE[pos]].values()) for k, v in OVR_W[ROLE[pos]].items()}
    mine, changed, a = norm(p['pos']), False, p['attrs']
    for _ in range(30):
        here = rating_at(a, p['pos'])
        rival = max((x for x in OUTFIELD if x != p['pos']), key=lambda x: rating_at(a, x))
        if rating_at(a, rival) < here:
            break
        theirs = norm(rival)
        keys = [k for k in mine if mine[k] > theirs.get(k, 0) and a.get(k) is not None and a[k] < 99]
        if not keys:
            break
        for k in keys:
            a[k] += 1
        changed = True
    return changed


# ---------- 데이터 ----------
def club_files():
    for f in sorted(glob.glob(os.path.join(SEASONS, '*', '*', '*.json'))):
        if not os.path.basename(f).startswith('_'):
            yield f


def load(f):
    with open(f, encoding='utf8') as h:
        return json.load(h)


def save(f, c):
    with open(f, 'w', encoding='utf8', newline='\n') as h:
        h.write(json.dumps(c, indent=2, ensure_ascii=False) + '\n')


def build_index():
    """(season, club) → 파일 · 선수 id → [(season, club, 선수)]"""
    files, by_id = {}, {}
    for f in club_files():
        c = load(f)
        files[(c['season'], c['club'])] = f
        for p in c.get('squad', []):
            by_id.setdefault(p['id'], []).append((c['season'], c['club'], p))
    return files, by_id


# ---------- 보고서 ----------
LINE1 = re.compile(r'^(\S+) (\S+) (.+?): 데이터 (\w+) · 인포박스 (\S+)  \[(.*)\]$')
LINE2 = re.compile(r'^(\S+) (\S+) (.+?): (\w+) (\d+) · (\w+) (\d+)$')
LINE4 = re.compile(r'^(.+) \(([^()]+)\)$')


def read_report():
    sec, out = None, {'1': [], 'gk': [], '2': [], '3': [], '4': []}
    with open(REPORT, encoding='utf8') as h:
        for line in h.read().splitlines():
            if line.startswith('# 1)'): sec = '1'
            elif line.startswith('# 골키퍼'): sec = 'gk'
            elif line.startswith('# 2)'): sec = '2'
            elif line.startswith('# 3)'): sec = '3'
            elif line.startswith('# 4)'): sec = '4'
            elif line.strip() and sec:
                out[sec].append(line)
    return out


def generic_terms(raw):
    """인포박스 원문이 포괄 표기로만 되어 있으면 그 단어들, 아니면 None"""
    terms = [t.strip().lower() for t in re.split(r',|/|;|\band\b|<br\s*/?>', raw) if t.strip()]
    return terms if terms and all(t in GENERIC for t in terms) else None


def find_player(by_id, season, club, name):
    for pid, rows in by_id.items():
        for s, c, p in rows:
            if s == season and c == club and p['name'] == name:
                return pid
    return None


def row(season, club, p, wiki):
    return {'id': p['id'], 'season': season, 'club': club, 'player': p['name'], 'current_main': p['pos'],
            'current_sub': p.get('alt', []), 'wiki_pos': wiki}


def write_batches(prefix, rows):
    for f in glob.glob(os.path.join(BATCHES, f'{prefix}_batch_*.json')):
        os.remove(f)
    names = []
    for i in range(0, len(rows), BATCH_SIZE):
        name = f'{prefix}_batch_{i // BATCH_SIZE + 1:02d}.json'
        with open(os.path.join(BATCHES, name), 'w', encoding='utf8') as h:
            json.dump(rows[i:i + BATCH_SIZE], h, ensure_ascii=False, separators=(',', ':'))
        names.append(name)
    return names


def extract():
    rep = read_report()
    files, by_id = build_index()
    name_to_id = {}
    for pid, rows in by_id.items():
        for s, c, p in rows:
            name_to_id[(s, c, p['name'])] = pid
    os.makedirs(BATCHES, exist_ok=True)
    os.makedirs(PATCHES, exist_ok=True)

    # 1) 인포박스와 다른 포지션: 보고서는 선수마다 첫 줄만 → 그 선수의 모든 시즌으로 펼친 뒤 규칙으로 거른다
    stat = {'players': 0, 'rows': 0, 'same_line': 0, 'adjacent': 0, 'kept': 0, 'unmatched': 0}
    mismatch = []
    for line in rep['1']:
        m = LINE1.match(line)
        if not m:
            stat['unmatched'] += 1
            continue
        season, club, name, _, codes, raw = m.groups()
        pid = name_to_id.get((season, club, name))
        if not pid:
            stat['unmatched'] += 1
            continue
        stat['players'] += 1
        codes = set(codes.split('/'))
        terms = generic_terms(raw)
        for s, c, p in by_id[pid]:
            if p['pos'] in codes:
                continue   # 이 시즌은 인포박스와 맞음
            stat['rows'] += 1
            if terms and any(SAME_LINE[t] == GROUP[p['pos']] for t in terms):
                stat['same_line'] += 1          # 예: Midfielder 인데 RM
            elif terms and any(p['pos'] in GENERIC[t] for t in terms):
                stat['adjacent'] += 1           # 예: Midfielder 인데 LW · Forward 인데 AM
            else:
                stat['kept'] += 1
                mismatch.append(row(s, c, p, raw))

    # 골키퍼 충돌: 동명이인 연결 오류 의심 → 따로
    gk = []
    for line in rep['gk']:
        m = LINE1.match(line)
        if m:
            season, club, name, _, _, raw = m.groups()
            pid = name_to_id.get((season, club, name))
            if pid:
                gk += [dict(row(s, c, p, raw), flag='slug_suspect') for s, c, p in by_id[pid]]
    with open(os.path.join(BATCHES, 'gk_conflict.json'), 'w', encoding='utf8') as h:
        json.dump(gk, h, ensure_ascii=False, separators=(',', ':'))

    # 2) 주 포지션보다 높은 자리 → 자동 보정 패치 (능력치)
    auto = []
    for line in rep['2']:
        m = LINE2.match(line)
        if not m:
            continue
        season, club, name = m.groups()[:3]
        f = files.get((season, club))
        pid = name_to_id.get((season, club, name))
        if f and pid:
            for s, c, p in by_id[pid]:
                q = json.loads(json.dumps(p))
                if ensure_main_best(q):
                    auto.append({'id': p['id'], 'season': s, 'club': c, 'main': p['pos'], 'attrs': q['attrs'], 'note': 'main-best auto'})
    with open(os.path.join(PATCHES, 'patch_mainbest_auto.json'), 'w', encoding='utf8') as h:
        json.dump(auto, h, ensure_ascii=False, indent=1)

    # 4) 인포박스 없음
    missing = []
    for line in rep['4']:
        m = LINE4.match(line)
        if m and m.group(2) in by_id:
            missing += [row(s, c, p, None) for s, c, p in by_id[m.group(2)]]

    mb = write_batches('mismatch', mismatch)
    ms = write_batches('missing', missing)
    print(f"# 1) 보고서 {len(rep['1'])}명 → 시즌으로 펼쳐 {stat['rows']}줄")
    print(f"   자동 제외: 같은 줄 {stat['same_line']} · 경계 자리 {stat['adjacent']} → 남은 검수 대상 {stat['kept']}줄 (못 찾은 줄 {stat['unmatched']})")
    print(f"# 골키퍼 충돌(동명이인 의심): {len(gk)}줄 → gk_conflict.json")
    print(f"# 2) 자동 보정 패치: {len(auto)}줄 → patch_mainbest_auto.json")
    print(f"# 3) 선수단 구성 부족: {len(rep['3'])}개 구단 시즌")
    print(f"# 4) 인포박스 없음: {len(rep['4'])}명 → {len(missing)}줄")
    print('배치:', ', '.join(mb + ms) or '없음')


# ---------- 적용 ----------
def run_check():
    r = subprocess.run(['node', os.path.join('tools', 'data_pipeline'), 'positions-check'], cwd=ROOT,
                       capture_output=True, text=True, encoding='utf8')
    print(r.stdout.strip())
    return len(read_report()['3'])


def apply():
    patches = sorted(glob.glob(os.path.join(PATCHES, 'patch_*.json')))
    if not patches:
        print('적용할 패치 없음')
        return
    thin_before = len(read_report()['3'])
    files, _ = build_index()
    # 같은 선수 · 시즌이 여러 패치에 있으면 번호가 뒤인 패치만 (자동 보정 패치는 맨 먼저) → 포지션이 왔다 갔다 하며 능력치가 부풀지 않게
    patches.sort(key=lambda f: (0 if 'auto' in os.path.basename(f) else 1, os.path.basename(f)))
    latest = {}
    for f in patches:
        for e in json.load(open(f, encoding='utf8')):
            latest[(e['id'], e['season'], e['club'])] = (os.path.basename(f), e)
    todo = {}
    for (_, season, club), item in latest.items():
        todo.setdefault((season, club), []).append(item)
    n = {'pos': 0, 'sub': 0, 'attrs': 0, 'same': 0, 'notfound': 0}
    for key, items in todo.items():
        f = files.get(key)
        if not f:
            n['notfound'] += len(items)
            continue
        c, dirty = load(f), False
        squad = {p['id']: p for p in c['squad']}
        for src, e in items:
            p = squad.get(e['id'])
            if not p:
                n['notfound'] += 1
                print(f'  없음: {src} {e["season"]} {e["club"]} {e["id"]}')
                continue
            before = (p['pos'], list(p.get('alt', [])), dict(p['attrs']))
            if e.get('main') and e['main'] in GROUP and (e['main'] == 'GK') == (p['pos'] == 'GK'):
                p['pos'] = e['main']
            if 'attrs' in e:
                p['attrs'].update(e['attrs'])
            if 'sub' in e:
                sub = [x for x in e['sub'] if x in GROUP and x != p['pos']]
                if sub: p['alt'] = sub
                else: p.pop('alt', None)
            elif 'alt' in p:
                p['alt'] = [x for x in p['alt'] if x != p['pos']] or p.pop('alt')
            # 능력치를 부풀리지 않는다: 다른 자리가 더 높을 때만 균형을 옮기고 최고값은 그대로 (rebalance)
            rebalance(p)
            after = (p['pos'], list(p.get('alt', [])), dict(p['attrs']))
            if after == before:
                n['same'] += 1
                continue
            dirty = True
            n['pos'] += before[0] != after[0]
            n['sub'] += before[1] != after[1]
            n['attrs'] += before[2] != after[2]
        if dirty:
            save(f, c)
    print(f"패치 {len(patches)}개 · 주 포지션 변경 {n['pos']} · 보조 변경 {n['sub']} · 능력치 보정 {n['attrs']} · 변화 없음 {n['same']} · 못 찾음 {n['notfound']}")
    thin_after = run_check()
    print(f"# 3) 선수단 구성 부족 구단 시즌: {thin_before} → {thin_after}")
    print('공개 데이터에 반영하려면: node tools/data_pipeline publish --apply (켜 둔 개발 서버는 껐다 켤 것)')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf8')
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--extract', action='store_true')
    g.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    extract() if a.extract else apply()
