// 임대 창: 빌려 오기 (주급 분담 · 임대료 · 이적 조건) / 보내기 (받아 줄 구단 후보 · 이적 조건)
//  이적 조건: 없음 (시즌 끝 복귀) · 완전 영입 옵션 (언제든 행사, 안 하면 복귀) · 의무 이적 (시즌 끝 자동 이적, 옵션보다 싸게)
import { useMemo, useState } from 'react';
import type { PlayerState } from '../../engine/types';
import { buyFloor, evaluateLoan, loanCandidates, playerWillLoan } from '../../engine/loan';
import { marketValue, wageDemand } from '../../engine/transfer';
import { clubKo, compKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { money } from '../format';
import { useWorld } from '../hooks';
import { Crest } from './Crest';

type Deal = 'none' | 'option' | 'must';
const DEAL_KO: Record<Deal, string> = { none: '옵션 없음', option: '완전 영입 옵션', must: '의무 이적' };
const DEAL_HINT: Record<Deal, string> = {
  none: '시즌이 끝나면 원소속 구단으로 돌아갑니다',
  option: '정해 둔 이적료 · 주급으로 시즌 중 언제든 영입할 수 있습니다. 안 하면 시즌 끝에 돌아갑니다',
  must: '시즌이 끝나면 정해 둔 이적료 · 주급으로 자동 이적합니다. 확실한 거래라 옵션보다 싸게(시장 가치의 75%부터) 받아 줍니다',
};

function Shell({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel w-full max-w-[520px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div><div className="text-[16px] font-semibold">{title}</div><div className="mt-0.5 text-[12px] text-lo">{sub}</div></div>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DealPicker({ deal, setDeal }: { deal: Deal; setDeal: (d: Deal) => void }) {
  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
        {(['none', 'option', 'must'] as Deal[]).map((d) => (
          <button key={d} onClick={() => setDeal(d)} className={`h-8 flex-1 rounded-md px-2 text-[12px] ${deal === d ? 'bg-ink-700 font-semibold text-hi' : 'text-mid'}`}>{DEAL_KO[d]}</button>
        ))}
      </div>
      <div className="mt-1.5 text-[12px] text-lo">{DEAL_HINT[deal]}</div>
    </div>
  );
}

const Num = ({ label, value, set, unit, step = 0.5 }: { label: string; value: number; set: (v: number) => void; unit: string; step?: number }) => (
  <label className="flex items-center justify-between gap-3"><span className="text-mid">{label}</span>
    <span className="flex items-center gap-2"><input type="number" min={0} step={step} value={value} onChange={(e) => set(Math.max(0, +e.target.value))} className="tnum h-9 w-24 rounded-lg border border-line bg-ink-850 px-2 text-right" />{unit}</span></label>
);

/** 빌려 오기 */
export function LoanInModal({ p, onClose }: { p: PlayerState; onClose: () => void }) {
  const w = useWorld();
  const loanIn = useGame((s) => s.loanIn);
  const value = marketValue(w, p);
  const [share, setShare] = useState(1);
  const [fee, setFee] = useState(0);
  const [deal, setDeal] = useState<Deal>('none');
  const [buy, setBuy] = useState(Math.round(buyFloor(w, p) / 1e5) / 10);
  const [buyWage, setBuyWage] = useState(Math.round(wageDemand(w, p, w.userClubId) / 1000));
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const pick = (d: Deal) => { setDeal(d); if (d !== 'none') setBuy(Math.round(buyFloor(w, p, d === 'must') / 1e5) / 10); };
  const terms = { share, fee: Math.round(fee * 1e6), ...(deal !== 'none' ? { buy: Math.round(buy * 1e6), buyWage: buyWage * 1000, ...(deal === 'must' ? { must: true } : {}) } : {}) };
  // 미리 보기: 원소속 구단 · 선수 반응
  const club = evaluateLoan(w, p, w.userClubId, terms);
  const player = playerWillLoan(w, p, w.userClubId);
  return (
    <Shell title={`${playerKo(p.id, p.name)} 임대 제안`} sub={`${clubKo(p.clubId ?? '')} · 시장 가치 ${money(value)} · 주급 ${money(p.wage)} · 이번 시즌 끝까지`} onClose={onClose}>
      <div className="space-y-4 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-mid">주급 부담</span>
          <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
            {[0.5, 0.75, 1].map((v) => <button key={v} onClick={() => setShare(v)} className={`h-7 rounded-md px-3 text-[12px] ${share === v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid'}`}>{v * 100}% · {money(Math.round(p.wage * v))}</button>)}
          </div>
        </div>
        <Num label="임대료 (선택)" value={fee} set={setFee} unit="백만 유로" />
        <DealPicker deal={deal} setDeal={pick} />
        {deal !== 'none' && (
          <div className="space-y-2 rounded-lg border border-line px-4 py-3">
            <Num label={`${DEAL_KO[deal]} 이적료`} value={buy} set={setBuy} unit="백만 유로" />
            <Num label="영입 후 주급" value={buyWage} set={setBuyWage} unit="천 유로" step={1} />
            <div className="text-[12px] text-lo">최저 이적료 {money(buyFloor(w, p, deal === 'must'))} · 선수가 원하는 주급 약 {money(wageDemand(w, p, w.userClubId))} · 영입 후 3년 계약</div>
          </div>
        )}
        <div className="space-y-1 rounded-lg bg-ink-900 px-4 py-3 text-[12px]">
          <div className={club.ok ? 'text-neon' : 'text-amber'}>구단: {club.reason}</div>
          <div className={player.ok ? 'text-neon' : 'text-amber'}>선수: {player.reason}</div>
        </div>
        {msg && <div className={`text-[12px] ${msg.ok ? 'text-neon' : 'text-red'}`}>{msg.t}</div>}
        <button onClick={() => { const r = loanIn(p.id, terms); setMsg({ t: r.msg, ok: r.ok }); if (r.ok) setTimeout(onClose, 700); }}
          className="h-11 w-full rounded-lg bg-neon text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">임대 제안</button>
      </div>
    </Shell>
  );
}

/** 보내기: 이적 조건을 걸면 그 이적료 · 주급을 감당할 수 있는 구단만 후보로 */
export function LoanOutModal({ p, onClose }: { p: PlayerState; onClose: () => void }) {
  const w = useWorld();
  const loanOut = useGame((s) => s.loanOut);
  const [deal, setDeal] = useState<Deal>('none');
  const [buy, setBuy] = useState(Math.round(buyFloor(w, p) / 1e5) / 10);
  const pick = (d: Deal) => { setDeal(d); if (d !== 'none') setBuy(Math.round(buyFloor(w, p, d === 'must') / 1e5) / 10); };
  const cands = useMemo(() => loanCandidates(w, p, [], deal === 'none' ? undefined : { buy: Math.round(buy * 1e6), must: deal === 'must' }), [w, p, deal, buy]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  return (
    <Shell title={`${playerKo(p.id, p.name)} 임대 보내기`} sub={`시장 가치 ${money(marketValue(w, p))} · 가서 주전으로 뛸 수 있고 주급을 낼 수 있는 구단`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <DealPicker deal={deal} setDeal={pick} />
        {deal !== 'none' && <Num label={`${DEAL_KO[deal]} 이적료`} value={buy} set={setBuy} unit="백만 유로" />}
        <div className="space-y-2">
          {cands.length === 0 && <div className="py-6 text-center text-[13px] text-lo">받아 줄 구단이 없습니다 (선수 수준에 맞는 구단이 없거나, 주급 · 이적료를 낼 여유가 없음)</div>}
          {cands.map((c) => (
            <button key={c.club} onClick={() => { const r = loanOut(p.id, c.club, c.terms); setMsg({ t: r.msg, ok: r.ok }); if (r.ok) setTimeout(onClose, 700); }}
              className="flex w-full items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-left transition-colors hover:bg-ink-800">
              <Crest clubId={c.club} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{clubKo(c.club)}</div>
                <div className="text-[12px] text-lo">{compKo(w.clubs[c.club].league)} · 주급 {c.terms.share * 100}% 부담 ({money(Math.round(p.wage * c.terms.share))}){c.terms.buy ? ` · ${DEAL_KO[deal]} ${money(c.terms.buy)}` : ''}</div>
              </div>
              <span className="text-[12px] font-semibold text-neon">보내기</span>
            </button>
          ))}
        </div>
        {msg && <div className={`pt-1 text-[12px] ${msg.ok ? 'text-neon' : 'text-red'}`}>{msg.t}</div>}
      </div>
    </Shell>
  );
}
