// 내 선수 계약 상자 (선수 정보 패널 아래) + 재계약 협상 창
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerState } from '../../engine/types';
import { expiring, renewDemand, renewEnd, willStay } from '../../engine/contract';
import { MAX_TRIES, talkBanned, wageRoom, yearsLeft } from '../../engine/transfer';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Bubble, type Msg } from './NegotiationModal';
import { PosTag } from './bits';
import { koDate, money, ratingTone } from '../format';

export function ContractBox({ p, extra }: { p: PlayerState; extra?: ReactNode }) {
  const w = useWorld();
  const [open, setOpen] = useState(false);
  const soon = expiring(w, p);
  const yl = yearsLeft(p, w.date);
  const ban = talkBanned(w, `renew:${p.id}`);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[12px]">
        <span className="text-lo">계약 <span className={`tnum font-semibold ${soon ? 'text-amber' : 'text-mid'}`}>{p.contract ? koDate(p.contract) : '정보 없음'}</span>{p.contractGen ? ' (게임 설정)' : ''}</span>
        <span className={soon ? 'font-semibold text-amber' : 'text-lo'}>{soon ? '이번 시즌 끝에 만료' : `남은 기간 ${yl.toFixed(1)}년`}</span>
      </div>
      {ban && <div className="mb-2 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-[12px] text-red">재계약 결렬 · {koDate(ban)} 이후 다시 협상 가능</div>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(true)} disabled={!!ban}
          className={`h-10 flex-1 rounded-lg text-[13px] font-semibold transition-colors disabled:bg-ink-700 disabled:text-lo ${soon ? 'bg-neon text-ink-950 hover:bg-[#5bff3d]' : 'bg-ink-700 text-hi hover:bg-ink-750'}`}>재계약 협상</button>
        {extra}
      </div>
      {open && <RenewModal p={p} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function RenewModal({ p, onClose }: { p: PlayerState; onClose: () => void }) {
  const w = useWorld();
  const { renew } = useGame();
  const demand = renewDemand(w, p);
  const age = ageOn(p.birth, w.date);
  const [wage, setWage] = useState(Math.round(demand / 1000));
  const [years, setYears] = useState(age >= 33 ? 1 : 3);
  const [ended, setEnded] = useState(!!talkBanned(w, `renew:${p.id}`));
  const stay = willStay(w, p);
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { who: 'sys', text: `현재 계약 ${p.contract ? koDate(p.contract) : '정보 없음'}까지 · 주급 ${money(p.wage)}. 새 주급과 기간을 제안하세요.` },
    ...(!stay.ok ? [{ who: 'sys' as const, tone: 'warn' as const, text: '선수가 구단에 불만이 있어 보입니다. 재계약을 거절할 수도 있습니다.' }] : []),
  ]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const used = w.talks?.[`renew:${p.id}`]?.wage ?? 0;
  const left = ended ? 0 : MAX_TRIES - used;
  const room = wageRoom(w, w.userClubId) - (wage * 1000 - p.wage);
  const push = (...m: Msg[]) => setMsgs((x) => [...x, ...m]);
  const send = () => {
    push({ who: 'me', text: `주급 ${money(wage * 1000)} · ${years}년 (${renewEnd(w, years).slice(0, 4)}년 6월까지) 제안` });
    const r = renew(p.id, wage * 1000, years);
    if (r.ok) { push({ who: 'player', tone: 'ok', text: r.reason }); setEnded(true); return; }
    push({ who: r.left === undefined ? 'sys' : 'player', tone: 'warn', text: r.reason });
    if (r.broken) { setEnded(true); push({ who: 'sys', tone: 'bad', text: '재계약 협상 결렬 — 30일 뒤에 다시 시도할 수 있습니다.' }); }
  };
  const ovr = overall(p);

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="panel flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-4 border-b border-line px-6 py-5">
          <div className={`tnum grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line bg-ink-900 text-[22px] font-semibold ${ratingTone(ovr)}`}>{ovr}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[20px] font-semibold">{playerKo(p.id, p.name)} <span className="text-[13px] font-normal text-lo">재계약</span></div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-lo"><PosTag pos={p.pos} />{age}세 · 충성도 {Math.round(p.loyalty)} · 사기 {Math.round(p.morale)}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-[18px] text-lo hover:bg-ink-800 hover:text-hi" aria-label="닫기">×</button>
        </header>
        <div className="flex items-center gap-4 border-b border-line px-6 py-3 text-[12px] text-lo">
          <span>현재 주급 <span className="tnum text-mid">{money(p.wage)}</span></span>
          <span>원하는 주급 약 <span className="tnum text-mid">{money(demand)}</span></span>
          <span className="ml-auto flex items-center gap-1.5">남은 기회{Array.from({ length: MAX_TRIES }, (_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i < left ? 'bg-neon' : 'bg-ink-700'}`} />)}</span>
        </div>
        <div ref={log} className="min-h-[160px] flex-1 space-y-2 overflow-auto px-6 py-4">
          {msgs.map((m, i) => <Bubble key={i} m={m} club={null} />)}
        </div>
        <footer className="border-t border-line bg-ink-900/50 px-6 py-5">
          {ended ? (
            <button onClick={onClose} className="h-11 w-full rounded-lg bg-ink-700 text-[14px] font-semibold text-hi hover:bg-ink-750">닫기</button>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-[12px] text-lo"><span>새 계약 종료 {koDate(renewEnd(w, years))}</span>
                <span className={room < 0 ? 'text-red' : ''}>계약 후 주급 여유 <span className="tnum">{room < 0 ? `−${money(-room)}` : money(room)}</span></span></div>
              <div className="flex flex-wrap gap-2">
                <label className="flex h-11 min-w-0 flex-1 basis-full sm:basis-0 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-lo">주급
                  <input autoFocus type="number" min={1} value={wage} onChange={(e) => setWage(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="tnum min-w-0 flex-1 bg-transparent text-right text-[16px] font-semibold text-hi outline-none" />천 유로
                </label>
                <select value={years} onChange={(e) => setYears(+e.target.value)} className="h-11 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-hi max-sm:flex-1">
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <button onClick={send} disabled={room < 0} className="h-11 rounded-lg bg-neon px-6 max-sm:flex-1 text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d] disabled:bg-ink-700 disabled:text-lo">제안</button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
