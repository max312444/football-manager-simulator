// 라커룸 창: 팀 케미 (구성 요소) · 주장 지정 · 영향력 있는 선수 · 불만 · 혼자인 선수 · 팀 미팅
import { useState } from 'react';
import { chemistry, chemMult, meetingReady, tenureOf } from '../../engine/chemistry';
import { attr } from '../../engine/ratings';
import { unrestReasons } from '../../engine/loyalty';
import { playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { PosTag } from './bits';

const PARTS: [keyof ReturnType<typeof chemistry>['parts'], string, string][] = [
  ['tenure', '함께한 시간', '핵심 선수들이 이 구단에서 함께 뛴 시즌 (4시즌이면 만점)'],
  ['bond', '유대 · 언어', '같은 국적 동료가 있거나 리그 나라 선수인 비율'],
  ['morale', '사기', '핵심 선수 평균 사기'],
  ['leader', '리더십', '주장의 리더십'],
];
export const chemTone = (v: number) => (v >= 65 ? 'text-neon' : v >= 45 ? 'text-hi' : v >= 30 ? 'text-amber' : 'text-red');

export function LockerRoom({ onClose }: { onClose: () => void }) {
  const w = useWorld();
  const { setCaptain, holdMeeting } = useGame();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const club = w.clubs[w.userClubId];
  const c = chemistry(w, club.id);
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);
  const squad = club.squad.map((id) => w.players[id]).filter((p) => p && !p.loan).sort((a, b) => attr(b, 'ldr') - attr(a, 'ldr'));
  const mult = (chemMult(c.total) - 1) * 100;
  const ready = meetingReady(w);
  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[640px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-7">
          <div><div className="text-[17px] font-semibold">라커룸</div><div className="text-[12px] text-lo">팀 케미는 경기력에 ±3%까지 영향을 줍니다</div></div>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="space-y-6 overflow-auto px-5 py-5 sm:px-7">
          <section className="flex items-center gap-5">
            <div className="text-center">
              <div className={`tnum text-[40px] leading-none font-semibold ${chemTone(c.total)}`}>{c.total}</div>
              <div className="mt-1 text-[12px] text-lo">팀 케미</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {PARTS.map(([k, label, hint]) => (
                <div key={k} title={hint} className="flex items-center gap-3 text-[12px]">
                  <span className="w-20 shrink-0 text-mid">{label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"><span className="block h-full rounded-full bg-neon/70" style={{ width: `${c.parts[k]}%` }} /></span>
                  <span className="tnum w-8 text-right text-lo">{c.parts[k]}</span>
                </div>
              ))}
              {c.parts.unrest > 0 && <div className="text-[12px] text-red">불만 선수 감점 −{c.parts.unrest}</div>}
              <div className="text-[12px] text-lo">경기 영향 {mult >= 0 ? '+' : '−'}{Math.abs(mult).toFixed(1)}%</div>
            </div>
          </section>

          <section>
            <div className="mb-2 text-[12px] font-semibold text-neon">주장</div>
            <select value={club.captain ?? ''} onChange={(e) => setCaptain(e.target.value || null)} className="h-10 w-full rounded-lg border border-line bg-ink-850 px-3 text-[14px] text-hi">
              <option value="">자동 (리더십이 가장 높은 선수{c.captain && !club.captain ? ` · ${name(c.captain)}` : ''})</option>
              {squad.map((p) => <option key={p.id} value={p.id}>{name(p.id)} · 리더십 {Math.round(attr(p, 'ldr'))} · {tenureOf(p)}시즌째</option>)}
            </select>
            <div className="mt-1 text-[12px] text-lo">리더십이 높은 주장은 사기를 지켜 주고 팀 미팅 성공률을 올립니다</div>
          </section>

          <section>
            <div className="mb-2 text-[12px] font-semibold text-neon">영향력 있는 선수</div>
            <div className="divide-y divide-line rounded-lg border border-line">
              {c.leaders.map((l, i) => {
                const p = w.players[l.id];
                const angry = c.unrest.includes(l.id);
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="tnum w-4 text-lo">{i + 1}</span><PosTag pos={p.pos} />
                    <span className="min-w-0 flex-1 truncate">{name(l.id)}{l.id === c.captain && <span className="ml-2 rounded bg-neon-ghost px-1 text-[11px] font-semibold text-neon">주장</span>}</span>
                    <span className={`text-[12px] ${angry ? 'font-semibold text-red' : p.morale >= 65 ? 'text-neon' : 'text-lo'}`}>{angry ? '불만' : `사기 ${Math.round(p.morale)}`}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 text-[12px] text-lo">영향력 큰 선수가 불만이면 선수단 사기가 조금씩 떨어집니다</div>
          </section>

          {(c.unrest.length > 0 || c.isolated.length > 0 || c.newcomers.length > 0) && (
            <section className="space-y-1.5 text-[13px]">
              {c.unrest.length > 0 && <div><div className="text-red">불만</div>{c.unrest.map((id) => <div key={id} className="text-mid">· {name(id)} — <span className="text-amber">{unrestReasons(w, w.players[id]).join(' · ') || '출전 시간 불만'}</span></div>)}</div>}
              {c.isolated.length > 0 && <div><span className="text-amber">말이 통하는 동료 없음</span> <span className="text-mid">{c.isolated.map(name).join(', ')}</span></div>}
              {c.newcomers.length > 0 && <div><span className="text-sky">새로 온 핵심 선수</span> <span className="text-mid">{c.newcomers.map(name).join(', ')}</span></div>}
            </section>
          )}

          <section className="rounded-lg bg-ink-900 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 text-[13px]"><div className="font-semibold">팀 미팅</div><div className="text-[12px] text-lo">30일에 한 번 · 케미 · 최근 성적 · 주장 리더십이 좋을수록 성공 (사기 +6, 실패하면 −4)</div></div>
              <button disabled={!ready} onClick={() => setMsg(holdMeeting())} className="h-10 rounded-lg bg-neon px-5 text-[13px] font-semibold text-ink-950 hover:bg-[#5bff3d] disabled:bg-ink-700 disabled:text-lo">{ready ? '미팅 열기' : '최근에 열었음'}</button>
            </div>
            {msg && <div className={`mt-2 text-[12px] ${msg.ok ? 'text-neon' : 'text-amber'}`}>{msg.text}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
