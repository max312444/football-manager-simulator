import { useState } from 'react';
import type { Position } from '../../data/types';
import { available, FORMATIONS, isCustom, matchRules, MAX_CUSTOM, pickLineup } from '../../engine/squad';
import { FormationEditor } from '../components/FormationEditor';
import { slotRating } from '../../engine/ratings';
import { playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { ATTR_KO, money, ratingTone } from '../format';
import { Card, ConditionIcon, FitnessBar, PosTag } from '../components/bits';
import type { Mentality, Pressing } from '../../engine/types';
import { FOCUS_ATTRS, FOCUS_KO, INTENSITY_KO, trainingCost, trainingOf, type Intensity, type TrainFocus } from '../../engine/training';
import { ageOn } from '../../engine/condition';

export const MENTALITY: { v: Mentality; label: string }[] = [
  { v: -2, label: '매우 수비적' }, { v: -1, label: '수비적' }, { v: 0, label: '균형' }, { v: 1, label: '공격적' }, { v: 2, label: '매우 공격적' },
];
export const PRESSING: { v: Pressing; label: string }[] = [{ v: 0, label: '낮음' }, { v: 1, label: '보통' }, { v: 2, label: '높음' }];

// 피치 위 자리 좌표 (가로 0~100, 세로 0=상대 골문 ~ 100=우리 골문)
export function slotXY(slots: Position[]): { x: number; y: number }[] {
  const rowY: Record<string, number> = { GK: 92, CB: 75, LB: 72, RB: 72, LWB: 62, RWB: 62, DM: 63, CM: 47, LM: 44, RM: 44, AM: 32, LW: 24, RW: 24, ST: 13 };
  const rows = new Map<number, number[]>();
  slots.forEach((s, i) => { const y = rowY[s]; rows.set(y, [...(rows.get(y) ?? []), i]); });
  const out: { x: number; y: number }[] = new Array(slots.length);
  for (const [y, idx] of rows) {
    // 오른쪽(R) 자리는 오른편, 왼쪽(L)은 왼편, 가운데는 고르게
    const left = idx.filter((i) => slots[i].startsWith('L')), right = idx.filter((i) => slots[i].startsWith('R'));
    const mid = idx.filter((i) => !left.includes(i) && !right.includes(i));
    left.forEach((i) => (out[i] = { x: 12, y }));
    right.forEach((i) => (out[i] = { x: 88, y }));
    mid.forEach((i, k) => (out[i] = { x: mid.length === 1 ? 50 : 26 + (48 * k) / (mid.length - 1), y }));
  }
  return out;
}

export function Pitch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[68/90] w-full overflow-hidden rounded-lg bg-[linear-gradient(180deg,#0d1a10,#0a130c)] ring-1 ring-line">
      <svg viewBox="0 0 68 90" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <g stroke="rgb(57 255 20 / 0.16)" strokeWidth="0.35" fill="none">
          <rect x="2" y="2" width="64" height="86" /><line x1="2" y1="45" x2="66" y2="45" /><circle cx="34" cy="45" r="7" />
          <rect x="16" y="2" width="36" height="13" /><rect x="25" y="2" width="18" height="5" />
          <rect x="16" y="75" width="36" height="13" /><rect x="25" y="83" width="18" height="5" />
        </g>
      </svg>
      {children}
    </div>
  );
}

export function TacticsView() {
  const w = useWorld();
  const setClubTactics = useGame((s) => s.setClubTactics);
  const setLineup = useGame((s) => s.setLineup);
  const [sel, setSel] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ edit?: string } | null>(null);
  const club = w.clubs[w.userClubId];
  const t = club.tactics;
  const squad = club.squad.map((id) => w.players[id]);
  const rules = matchRules(w.season);
  const lineup = pickLineup(squad, t.formation, rules.benchSize, club.lineup?.starters, club.lineup?.bench);
  const slots = FORMATIONS[lineup.formation];
  const pos = slotXY(slots);
  const fixed = club.lineup?.starters ?? [];
  // 자리 순서대로 현재 선발 (자동 선택분 포함)
  const current: (string | null)[] = slots.map((_, i) => lineup.starters[i]?.id ?? null);

  const assign = (slotIdx: number, id: string) => {
    const next = slots.map((_, i) => fixed[i] ?? null);
    const from = next.indexOf(id);
    if (from >= 0) next[from] = next[slotIdx];      // 다른 자리에 직접 지정돼 있던 선수면 맞바꿈
    next[slotIdx] = id;
    setLineup(next, club.lineup?.bench ?? []);
    setSel(null);
  };
  const fixAll = () => setLineup(current, lineup.bench);
  const changeFormation = (f: string) => {
    if (f === t.formation) return;
    setClubTactics({ formation: f });
    setLineup(null);                                // 자리 구성이 바뀌므로 직접 지정 초기화
    setSel(null);
  };

  const seg = <T extends number>(opts: { v: T; label: string }[], value: T, on: (v: T) => void) => (
    <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => on(o.v)}
          className={`h-8 flex-1 rounded-md text-[13px] transition-colors ${value === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
      ))}
    </div>
  );

  const candidates = sel == null ? [] : [...squad].sort((a, b) => slotRating(b, slots[sel]) - slotRating(a, slots[sel]));

  return (
    <div className="flex h-full gap-6 p-6">
      {editor && <FormationEditor edit={editor.edit} base={t.formation} onClose={() => setEditor(null)} />}
      <div className="w-[440px] shrink-0">
        <Pitch>
          {slots.map((slot, i) => {
            const id = current[i];
            const p = id ? w.players[id] : null;
            const r = p ? Math.round(slotRating(p, slot)) : 0;
            const isFixed = !!fixed[i] && fixed[i] === id;
            const ring = sel === i ? 'bg-neon text-ink-950 ring-2 ring-neon' : isFixed ? 'ring-2 ring-neon/80' : 'ring-1 ring-mid/40';
            return (
              <button key={i} onClick={() => setSel(sel === i ? null : i)}
                className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                <div className={`grid h-9 w-9 place-items-center rounded-full bg-ink-950/90 text-[13px] font-semibold transition-colors ${ring}`}>{p?.number ?? ''}</div>
                <div className="mt-1 max-w-full truncate rounded bg-ink-950/80 px-1.5 text-[12px] font-semibold">{p ? playerKo(p.id, p.name).split(' ').slice(-1)[0] : '빈 자리'}</div>
                <div className="text-[11px] text-lo">{slot}{p && <> · <span className={ratingTone(r)}>{r}</span></>}</div>
              </button>
            );
          })}
        </Pitch>
        <div className="mt-3 flex items-center justify-between text-[12px] text-lo">
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-neon/80" />직접 지정</span>
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-1 ring-mid/40" />자동 선택</span>
          </span>
          <span className="flex gap-4">
            <button onClick={fixAll} className="text-mid transition-colors hover:text-hi">현재 선발 고정</button>
            <button onClick={() => setLineup(null)} disabled={!club.lineup} className="text-mid transition-colors hover:text-hi disabled:opacity-40">모두 자동으로</button>
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {sel != null ? (
          <Card title={`${slots[sel]} 자리에 넣을 선수`} action={<button onClick={() => setSel(null)} className="text-[12px] text-lo hover:text-hi">닫기</button>} className="min-h-0 flex-1">
            <div className="h-full overflow-auto">
              {candidates.map((p) => {
                const r = Math.round(slotRating(p, slots[sel]));
                const where = current.indexOf(p.id);
                const ok = available(p);
                return (
                  <button key={p.id} disabled={!ok} onClick={() => assign(sel, p.id)}
                    className="flex w-full items-center gap-3 px-5 py-2 text-left text-[13px] shadow-[inset_0_-1px_0_var(--color-line)] transition-colors enabled:hover:bg-ink-800 disabled:opacity-40">
                    <PosTag pos={p.pos} />
                    <span className="min-w-0 flex-1 truncate">
                      {playerKo(p.id, p.name)}
                      {where >= 0 && <span className="ml-2 text-[12px] text-lo">선발 {slots[where]}</span>}
                      {!ok && <span className="ml-2 text-[12px] text-red">{p.injury ? '부상' : '징계'}</span>}
                    </span>
                    <ConditionIcon value={p.condition} />
                    <FitnessBar value={p.fitness} />
                    <span className={`tnum w-7 text-right font-semibold ${ratingTone(r)}`}>{r}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : (
          <>
            <Card title="포메이션">
              <div className="grid grid-cols-5 gap-2 p-4">
                {Object.keys(FORMATIONS).filter((f) => !isCustom(f)).map((f) => (
                  <button key={f} onClick={() => changeFormation(f)}
                    className={`tnum h-9 rounded-md text-[13px] transition-colors ${t.formation === f ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-900 text-mid ring-1 ring-line hover:text-hi'}`}>{f}</button>
                ))}
              </div>
              <div className="border-t border-line px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-[12px] text-lo">
                  <span>내 포메이션</span>
                  {Object.keys(w.customFormations ?? {}).length < MAX_CUSTOM && <button onClick={() => setEditor({})} className="text-neon hover:underline">+ 만들기</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(w.customFormations ?? {}).map((f) => (
                    <span key={f} className={`flex h-9 items-center rounded-md text-[13px] ${t.formation === f ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-900 text-mid ring-1 ring-line'}`}>
                      <button onClick={() => changeFormation(f)} className="tnum h-full pl-3 pr-2 hover:text-hi">{f}</button>
                      <button onClick={() => setEditor({ edit: f })} title="고치기" className="h-full border-l border-current/20 px-2 text-[11px] opacity-70 hover:opacity-100">고치기</button>
                    </span>
                  ))}
                  {!Object.keys(w.customFormations ?? {}).length && <span className="text-[12px] text-lo">기본 포메이션을 본떠 자리마다 포지션을 바꿔 나만의 포메이션을 만들 수 있습니다.</span>}
                </div>
              </div>
            </Card>
            <Card title="팀 성향">
              <div className="space-y-4 p-4">
                <div><div className="mb-2 text-[12px] text-lo">공격 · 수비 성향</div>{seg(MENTALITY, t.mentality, (v) => setClubTactics({ mentality: v }))}</div>
                <div><div className="mb-2 text-[12px] text-lo">압박 강도 — 높으면 상대 기회 ↓, 체력 소모 ↑</div>{seg(PRESSING, t.pressing, (v) => setClubTactics({ pressing: v }))}</div>
              </div>
            </Card>
            <TrainingCard />
            <Card title={`후보 ${lineup.bench.length}명`} className="flex-1">
              <div className="grid grid-cols-2 gap-x-6 px-5 py-3 text-[13px]">
                {lineup.bench.map((id) => { const p = w.players[id]; return (
                  <div key={id} className="flex items-center gap-2 py-1"><span className="w-9 text-[11px] font-semibold text-lo">{p.pos}</span><span className="truncate">{playerKo(p.id, p.name)}</span></div>
                ); })}
              </div>
              <p className="px-5 pb-4 text-[12px] leading-relaxed text-lo">피치의 자리를 눌러 선수를 바꿀 수 있습니다. 직접 지정하지 않은 자리와 부상 · 징계로 빠진 자리는 체력과 자리 적합도로 자동 선택됩니다.</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/** 훈련 설정: 초점 · 강도 (매달 선수 성장에 반영) */
function TrainingCard() {
  const w = useWorld();
  const setTraining = useGame((s) => s.setTraining);
  const club = w.clubs[w.userClubId];
  const tr = trainingOf(club);
  const btn = (on: boolean) => `h-8 flex-1 rounded-md text-[13px] transition-colors ${on ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`;
  // 성장 추세 (지난달): 22세 이하 선수 평균
  const young = club.squad.map((id) => w.players[id]).filter((p) => ageOn(p.birth, w.date) <= 22);
  const avg = young.length ? young.reduce((s, p) => s + (p.dev ?? 0), 0) / young.length : 0;
  return (
    <Card title="훈련">
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 text-[12px] text-lo">훈련 초점 — 고른 영역 능력치가 더 많이 오릅니다</div>
          <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
            {(Object.keys(FOCUS_KO) as TrainFocus[]).map((f) => (
              <button key={f} onClick={() => setTraining({ focus: f })} className={btn(tr.focus === f)} title={FOCUS_ATTRS[f].length ? FOCUS_ATTRS[f].map((k) => ATTR_KO[k] ?? k).join(' · ') : '모든 능력치 고르게'}>{FOCUS_KO[f]}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[12px] text-lo">훈련 강도 — 높으면 성장 ↑, 체력 회복 ↓ · 훈련 중 부상 위험</div>
          <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
            {INTENSITY_KO.map((l, i) => <button key={l} onClick={() => setTraining({ intensity: i as Intensity })} className={btn(tr.intensity === i)}>{l}</button>)}
          </div>
          <div className="mt-2 text-[12px] text-lo">
            훈련비 (한 번에, 매달 1일 · 8~5월): {INTENSITY_KO.map((l, i) => <span key={l} className={tr.intensity === i ? 'text-hi' : ''}>{i ? ' · ' : ''}{l} {money(trainingCost(w, club, i as Intensity))}</span>)}
            {club.finance.balance < 0 && <div className="mt-1 text-amber">잔고가 마이너스라 훈련비를 감당할 수 없어 강도 낮음으로만 훈련합니다</div>}
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-lo">
          매달 1일 (8월~5월) 선수 능력이 조금씩 변합니다. 어릴수록, 프로의식 · 야망이 높을수록, 많이 뛸수록, 구단 시설이 좋을수록 잘 자랍니다.
          {young.length > 0 && <> 지난달 22세 이하 {young.length}명 평균 성장 <span className={avg > 0.02 ? 'text-neon' : avg < -0.02 ? 'text-red' : 'text-mid'}>{avg > 0 ? '+' : ''}{avg.toFixed(2)}</span></>}
        </p>
      </div>
    </Card>
  );
}
