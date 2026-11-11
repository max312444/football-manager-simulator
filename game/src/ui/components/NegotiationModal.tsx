// 영입 협상 창 (화면 가운데)
//  ① 이적료: 파는 구단과 합의 (자유계약 선수는 건너뜀)
//  ② 개인 계약: 선수와 주급 · 계약 기간 합의
// 이적료 · 주급 각각 3번 안에 합의 못 하면 협상 결렬 → 이번 이적시장 동안 이 선수와 다시 협상 불가
import { autoRole, ROLE_KO, ROLES, type Role } from '../../engine/roles';
import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../../engine/types';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { MAX_TRIES, marketValue, talkBanned, wageDemand } from '../../engine/transfer';
import { wageRoomInfo } from '../../engine/rules';
import { clubKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Crest } from './Crest';
import { PosTag } from './bits';
import { money, ratingTone } from '../format';

export type Who = 'me' | 'club' | 'player' | 'sys';
export interface Msg { who: Who; text: string; tone?: 'ok' | 'warn' | 'bad' }

export function NegotiationModal({ p, onClose }: { p: PlayerState; onClose: () => void }) {
  const w = useWorld();
  const { bid, sign } = useGame();
  const fa = !p.clubId;
  const club = p.clubId;
  const talk = w.talks?.[p.id];
  const value = marketValue(w, p);
  const demand = wageDemand(w, p);
  const [stage, setStage] = useState<'fee' | 'contract'>(fa || talk?.agreed != null ? 'contract' : 'fee');
  const [fee, setFee] = useState(Math.round((talk?.agreed ?? value * 0.9) / 1e5) / 10);
  const [wage, setWage] = useState(Math.round(demand / 1000));
  const [years, setYears] = useState(3);
  const [role, setRole] = useState<Role>(() => autoRole(w, p, w.userClubId));
  const [broken, setBroken] = useState(!!talkBanned(w, p.id));
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    fa ? { who: 'sys', text: '자유계약 선수입니다. 이적료 없이 주급과 계약 기간만 협상하면 됩니다.' }
      : talk?.agreed != null ? { who: 'sys', text: `${clubKo(club!)}와 이적료 ${money(talk.agreed)}에 합의한 상태입니다. 선수와 개인 계약을 협상하세요.` }
      : { who: 'sys', text: `${clubKo(club!)}에 이적료를 제안하세요. 구단이 원하는 금액은 알려지지 않았습니다.` },
    ...(talkBanned(w, p.id) ? [{ who: 'sys' as Who, tone: 'bad' as const, text: '이미 협상이 결렬된 선수입니다. 이번 이적시장 동안은 다시 협상할 수 없습니다.' }] : []),
  ]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const used = stage === 'fee' ? w.talks?.[p.id]?.fee ?? 0 : w.talks?.[p.id]?.wage ?? 0;
  const left = broken ? 0 : MAX_TRIES - used;
  const push = (...m: Msg[]) => setMsgs((x) => [...x, ...m]);
  const fail = () => { setBroken(true); push({ who: 'sys', tone: 'bad', text: '협상 결렬 — 이번 이적시장 동안 이 선수와는 다시 협상할 수 없습니다.' }); };

  const sendFee = () => {
    const r = bid(p.id, fee * 1e6);
    push({ who: 'me', text: `이적료 ${money(fee * 1e6)} 제안` });
    if (r.blocked) return push({ who: 'sys', tone: 'warn', text: r.blocked });
    if (r.decision === 'accept') {
      push({ who: 'club', tone: 'ok', text: `좋습니다. ${money(fee * 1e6)}에 보내겠습니다.` }, { who: 'sys', text: '이적료 합의 완료 — 이제 선수와 개인 계약을 협상하세요.' });
      setStage('contract');
      return;
    }
    push({ who: 'club', tone: 'warn', text: r.reason });
    if (r.decision === 'counter') setFee(Math.round(r.ask / 1e5) / 10);
    if (r.broken) fail();
  };
  const sendContract = () => {
    const r = sign(p.id, wage * 1000, years, role);
    push({ who: 'me', text: `주급 ${money(wage * 1000)} · ${years}년 계약 제안` });
    if (r.ok) { onClose(); return; }
    push({ who: r.left === undefined ? 'sys' : 'player', tone: 'warn', text: r.reason });
    if (r.broken) fail();
  };
  // 계약 후 여유: 예산 · 규정 중 좁은 쪽. 규정에는 합의한 이적료의 상각 (이적료 ÷ 계약 연수)도 들어간다
  const ri = wageRoomInfo(w, w.userClubId, fa ? 0 : w.talks?.[p.id]?.agreed ?? 0, years);
  const room = ri.room - wage * 1000;
  const ovr = overall(p);

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-[88vh] w-[580px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 선수 */}
        <header className="flex items-center gap-4 border-b border-line px-6 py-5">
          <div className={`tnum grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line bg-ink-900 text-[22px] font-semibold ${ratingTone(ovr)}`}>{ovr}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[20px] font-semibold">{playerKo(p.id, p.name)}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-lo">
              <PosTag pos={p.pos} />{ageOn(p.birth, w.date)}세 ·
              {club ? <><Crest clubId={club} size={14} />{clubKo(club)}</> : <span className="text-neon">자유계약 (FA)</span>}
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-[18px] text-lo transition-colors hover:bg-ink-800 hover:text-hi" aria-label="닫기">×</button>
        </header>

        {/* 단계 */}
        <div className="flex items-center gap-2 border-b border-line px-6 py-3 text-[12px]">
          {!fa && <Step n={1} label="이적료 (구단)" on={stage === 'fee'} done={stage === 'contract'} />}
          {!fa && <span className="h-px w-6 bg-line-strong" />}
          <Step n={fa ? 1 : 2} label="개인 계약 (선수)" on={stage === 'contract'} done={false} />
          <span className="ml-auto flex items-center gap-1.5 text-lo">남은 기회
            {Array.from({ length: MAX_TRIES }, (_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i < left ? 'bg-neon' : 'bg-ink-700'}`} />)}
          </span>
        </div>

        {/* 대화 */}
        <div ref={log} className="min-h-[180px] flex-1 space-y-2 overflow-auto px-6 py-4">
          {msgs.map((m, i) => <Bubble key={i} m={m} club={club} />)}
        </div>

        {/* 입력 */}
        <footer className="border-t border-line bg-ink-900/50 px-6 py-5">
          {broken ? (
            <button onClick={onClose} className="h-11 w-full rounded-lg bg-ink-700 text-[14px] font-semibold text-hi transition-colors hover:bg-ink-750">닫기</button>
          ) : stage === 'fee' ? (
            <div className="space-y-3">
              <div className="flex justify-between text-[12px] text-lo"><span>시장 가치 <span className="tnum text-mid">{money(value)}</span></span><span>이적 예산 <span className="tnum text-mid">{money(w.clubs[w.userClubId].finance.transferBudget)}</span></span></div>
              <div className="flex gap-2">
                <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-lo">이적료
                  <input autoFocus type="number" step={0.5} min={0} value={fee} onChange={(e) => setFee(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendFee()} className="tnum min-w-0 flex-1 bg-transparent text-right text-[16px] font-semibold text-hi outline-none" />백만 유로
                </label>
                <button onClick={sendFee} className="h-11 rounded-lg bg-neon px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">제안</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-[12px] text-lo"><span>현재 주급 <span className="tnum text-mid">{money(p.wage)}</span> · 원하는 주급 약 <span className="tnum text-mid">{money(demand)}</span></span>
                <span className={room < 0 ? 'text-red' : ''}>계약 후 주급 여유 <span className="tnum">{room < 0 ? `−${money(-room)}` : money(room)}</span></span></div>
              <div className="flex gap-2">
                <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-lo">주급
                  <input autoFocus type="number" min={1} value={wage} onChange={(e) => setWage(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendContract()} className="tnum min-w-0 flex-1 bg-transparent text-right text-[16px] font-semibold text-hi outline-none" />천 유로
                </label>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} title="약속하는 역할: 높을수록 선수가 오려고 하지만, 약속만큼 못 뛰면 불만이 빨리 생깁니다" className="h-11 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-hi">
                  {ROLES.map((x) => <option key={x} value={x}>{ROLE_KO[x]}</option>)}
                </select>
                <select value={years} onChange={(e) => setYears(+e.target.value)} className="h-11 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-hi">
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <button onClick={sendContract} disabled={room < 0} className="h-11 rounded-lg bg-neon px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d] disabled:bg-ink-700 disabled:text-lo">계약 제안</button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function Step({ n, label, on, done }: { n: number; label: string; on: boolean; done: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${on ? 'font-semibold text-hi' : done ? 'text-neon' : 'text-lo'}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${on ? 'bg-neon text-ink-950' : done ? 'bg-neon-ghost text-neon' : 'bg-ink-800'}`}>{done ? '✓' : n}</span>{label}
    </span>
  );
}

export function Bubble({ m, club }: { m: Msg; club: string | null }) {
  if (m.who === 'sys') {
    const cls = m.tone === 'bad' ? 'border-red/40 bg-red/10 text-red' : m.tone === 'warn' ? 'border-amber/40 bg-amber/10 text-amber' : 'border-line bg-ink-850 text-mid';
    return <div className={`rounded-lg border px-4 py-2.5 text-center text-[13px] ${cls}`}>{m.text}</div>;
  }
  const me = m.who === 'me';
  const tone = m.tone === 'ok' ? 'text-neon' : m.tone === 'warn' ? 'text-amber' : 'text-hi';
  return (
    <div className={`flex animate-[fade_0.2s_ease-out] ${me ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-[13px] ${me ? 'bg-ink-700 text-hi' : 'bg-ink-850 ring-1 ring-line'}`}>
        {!me && <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-lo">{m.who === 'club' && club ? <><Crest clubId={club} size={12} />{clubKo(club)}</> : '선수 측 에이전트'}</div>}
        <span className={me ? '' : tone}>{m.text}</span>
      </div>
    </div>
  );
}
