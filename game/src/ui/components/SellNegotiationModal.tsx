// 받은 영입 제안 협상 창: 지금 제안 수락 · 거절 · 역제안 (3번 안에 합의 못 하면 사는 구단이 손을 뗌)
import { useEffect, useRef, useState } from 'react';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { MAX_TRIES, marketValue } from '../../engine/transfer';
import { clubKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Crest } from './Crest';
import { PosTag } from './bits';
import { Bubble, type Msg } from './NegotiationModal';
import { money, ratingTone } from '../format';

export function SellNegotiationModal({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const w = useWorld();
  const { counter, answerOffer } = useGame();
  const live = (w.offers ?? []).find((o) => o.id === offerId);
  const [snap] = useState(live!);            // 제안이 끝나도 창 내용은 유지
  const o = live ?? snap;
  const p = w.players[o.player];
  const value = marketValue(w, p);
  const [ask, setAsk] = useState(Math.round(Math.max(o.fee * 1.25, value) / 1e5) / 10);
  const [ended, setEnded] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { who: 'club', text: `${playerKo(p.id, p.name)} 영입을 원합니다. 이적료 ${money(o.fee)}를 제안합니다.` },
    { who: 'sys', text: o.unsolicited ? '이적 명단에 없는 선수에게 온 제안입니다. 원하는 금액을 불러 보세요.' : '수락하거나, 원하는 금액을 불러 역제안할 수 있습니다.' },
  ]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const push = (...m: Msg[]) => setMsgs((x) => [...x, ...m]);
  const left = ended ? 0 : MAX_TRIES - (o.tries ?? 0);

  const sendCounter = () => {
    push({ who: 'me', text: `${money(ask * 1e6)}이면 보내겠습니다` });
    const r = counter(o.id, ask * 1e6);
    if (r.result === 'accept') {
      push({ who: 'club', tone: 'ok', text: r.reason.split(' · ')[0] });
      if (r.done) return setTimeout(onClose, 400);
      push({ who: 'sys', tone: 'bad', text: r.reason.split(' · ').slice(1).join(' · ') || r.reason }); setEnded(true);
    } else if (r.result === 'withdraw' || r.result === 'gone') {
      push({ who: 'club', tone: 'warn', text: r.reason }, { who: 'sys', tone: 'bad', text: '협상 결렬 — 제안이 철회됐습니다.' }); setEnded(true);
    } else push({ who: 'club', tone: 'warn', text: r.reason });
  };
  const accept = () => { const m = answerOffer(o.id, true); push({ who: 'sys', tone: m.startsWith('이적이') ? 'ok' : 'bad', text: m }); setEnded(true); if (m.startsWith('이적이')) setTimeout(onClose, 400); };
  const reject = () => { answerOffer(o.id, false); onClose(); };
  const ovr = overall(p);

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-4 border-b border-line px-6 py-5">
          <div className={`tnum grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-line bg-ink-900 text-[22px] font-semibold ${ratingTone(ovr)}`}>{ovr}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[20px] font-semibold">{playerKo(p.id, p.name)} <span className="text-[13px] font-normal text-lo">영입 제안</span></div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-lo"><PosTag pos={p.pos} />{ageOn(p.birth, w.date)}세 · 제안 구단 <Crest clubId={o.from} size={14} /><span className="text-mid">{clubKo(o.from)}</span></div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-[18px] text-lo hover:bg-ink-800 hover:text-hi" aria-label="닫기">×</button>
        </header>
        <div className="flex items-center gap-4 border-b border-line px-6 py-3 text-[12px] text-lo">
          <span>현재 제안 <span className="tnum text-[14px] font-semibold text-neon">{money(o.fee)}</span></span>
          <span>시장 가치 <span className="tnum text-mid">{money(value)}</span></span>
          <span className="ml-auto flex items-center gap-1.5">남은 기회{Array.from({ length: MAX_TRIES }, (_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i < left ? 'bg-neon' : 'bg-ink-700'}`} />)}</span>
        </div>
        <div ref={log} className="min-h-[180px] flex-1 space-y-2 overflow-auto px-6 py-4">
          {msgs.map((m, i) => <Bubble key={i} m={m} club={o.from} />)}
        </div>
        <footer className="border-t border-line bg-ink-900/50 px-6 py-5">
          {ended || !live ? (
            <button onClick={onClose} className="h-11 w-full rounded-lg bg-ink-700 text-[14px] font-semibold text-hi hover:bg-ink-750">닫기</button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex h-11 min-w-0 flex-1 basis-full sm:basis-0 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-lo">역제안
                  <input autoFocus type="number" step={0.5} min={0} value={ask} onChange={(e) => setAsk(+e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCounter()} className="tnum min-w-0 flex-1 bg-transparent text-right text-[16px] font-semibold text-hi outline-none" />백만 유로
                </label>
                <button onClick={sendCounter} className="h-11 rounded-lg bg-ink-700 px-5 text-[14px] font-semibold text-hi hover:bg-ink-750">역제안</button>
              </div>
              <div className="flex gap-2">
                <button onClick={reject} className="h-10 rounded-lg px-5 text-[13px] text-mid ring-1 ring-line hover:text-hi">거절</button>
                <button onClick={accept} className="h-10 flex-1 rounded-lg bg-neon text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d]">{money(o.fee)}에 수락</button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
