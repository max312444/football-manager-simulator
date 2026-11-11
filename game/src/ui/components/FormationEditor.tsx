// 내 포메이션 만들기 · 고치기: 피치의 자리를 눌러 포지션을 바꾼다. 말이 안 되는 구성은 저장 불가 (validateFormation)
import { useState } from 'react';
import type { Position } from '../../data/types';
import { CUSTOM_MARK, FORMATIONS, formationShape, isCustom, OUTFIELD, validateFormation } from '../../engine/squad';
import { useGame } from '../../store/game';
import { Pitch, slotXY } from '../views/TacticsView';

const POS_KO: Record<string, string> = {
  CB: '센터백', LB: '왼쪽 풀백', RB: '오른쪽 풀백', LWB: '왼쪽 윙백', RWB: '오른쪽 윙백', DM: '수비형 미드', CM: '중앙 미드',
  LM: '왼쪽 미드', RM: '오른쪽 미드', AM: '공격형 미드', LW: '왼쪽 윙어', RW: '오른쪽 윙어', ST: '스트라이커',
};

/** edit: 고칠 내 포메이션 이름 (없으면 base 를 본떠 새로 만들기) */
export function FormationEditor({ edit, base, onClose }: { edit?: string; base: string; onClose: () => void }) {
  const save = useGame((s) => s.saveFormation);
  const del = useGame((s) => s.deleteFormation);
  const [slots, setSlots] = useState<Position[]>(() => [...(FORMATIONS[edit ?? base] ?? FORMATIONS['4-4-2'])]);
  const [name, setName] = useState(edit ? edit.slice(CUSTOM_MARK.length).trim() : '');
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const errs = validateFormation(slots);
  const pos = slotXY(slots);
  const set = (i: number, p: Position) => { setSlots(slots.map((x, k) => (k === i ? p : x))); setErr(null); };

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[860px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-7 py-4">
          <div>
            <h2 className="text-[17px] font-semibold">{edit ? '내 포메이션 고치기' : '내 포메이션 만들기'}</h2>
            <div className="mt-0.5 text-[12px] text-lo">피치의 자리를 누르고 오른쪽에서 포지션을 고르세요. 실제 축구에서 쓰는 범위 안에서만 저장됩니다.</div>
          </div>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="flex gap-6 overflow-auto p-6">
          <div className="w-[340px] shrink-0">
            <Pitch>
              {slots.map((s, i) => (
                <button key={i} disabled={i === 0} onClick={() => setSel(sel === i ? null : i)}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                  <div className={`grid h-10 w-10 place-items-center rounded-full text-[12px] font-semibold transition-colors ${sel === i ? 'bg-neon text-ink-950 ring-2 ring-neon' : i === 0 ? 'bg-ink-950/90 text-lo ring-1 ring-line' : 'bg-ink-950/90 ring-1 ring-mid/50 hover:ring-neon'}`}>{s}</div>
                </button>
              ))}
            </Pitch>
            <div className="mt-2 text-center text-[13px] text-lo">모양 <span className="tnum font-semibold text-hi">{formationShape(slots)}</span></div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-5 text-[13px]">
            <div>
              <div className="mb-2 text-[12px] text-lo">본뜰 포메이션</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(FORMATIONS).filter((f) => !isCustom(f)).map((f) => (
                  <button key={f} onClick={() => { setSlots([...FORMATIONS[f]]); setSel(null); setErr(null); }}
                    className="tnum rounded-md bg-ink-900 px-2.5 py-1 text-[12px] text-mid ring-1 ring-line hover:text-hi">{f}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[12px] text-lo">{sel == null ? '자리를 고르면 포지션을 바꿀 수 있습니다' : `${sel + 1}번 자리 (${POS_KO[slots[sel]]}) → 바꿀 포지션`}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {OUTFIELD.map((p) => {
                  const ok = sel != null && !validateFormation(slots.map((x, k) => (k === sel ? p : x))).length;
                  return (
                    <button key={p} disabled={sel == null} onClick={() => sel != null && set(sel, p)}
                      title={sel != null && !ok ? '이렇게 바꾸면 아직 규칙에 맞지 않습니다 (다른 자리도 바꾸면 됨)' : undefined}
                      className={`rounded-md px-2 py-1.5 text-left text-[12px] transition-colors disabled:opacity-40 ${sel != null && slots[sel] === p ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-900 ring-1 ring-line hover:text-hi ' + (ok ? 'text-hi' : 'text-lo')}`}>
                      <span className="font-semibold">{p}</span> <span className="text-[11px] opacity-80">{POS_KO[p]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-lg px-4 py-3 text-[12px] ${errs.length ? 'bg-red/10 text-red' : 'bg-neon/10 text-neon'}`}>
              {errs.length ? <ul className="list-disc space-y-0.5 pl-4">{errs.map((e) => <li key={e}>{e}</li>)}</ul> : '규칙에 맞는 포메이션입니다'}
            </div>

            <div>
              <div className="mb-2 text-[12px] text-lo">이름 (비우면 모양 이름)</div>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} maxLength={20} placeholder={formationShape(slots)}
                className="w-full rounded-md bg-ink-900 px-3 py-2 text-[13px] ring-1 ring-line outline-none focus:ring-neon" />
            </div>

            <div className="mt-auto flex items-center gap-2">
              {err && <span className="mr-auto text-[12px] text-red">{err}</span>}
              {edit && <button onClick={() => { if (confirm('이 포메이션을 지울까요?')) { del(edit); onClose(); } }} className="mr-auto rounded-md border border-line px-3 py-2 text-[12px] text-lo hover:text-red">지우기</button>}
              <button onClick={onClose} className="rounded-md px-4 py-2 text-[13px] text-mid hover:text-hi">취소</button>
              <button disabled={!!errs.length} onClick={() => { const e = save(edit ?? null, name, slots); if (e) setErr(e); else onClose(); }}
                className="rounded-md bg-neon px-5 py-2 text-[13px] font-semibold text-ink-950 disabled:opacity-40">저장</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
