// 재계약 요청 팝업 (1월 1일 · 4월 1일): 자동 재계약이 안 된 내 선수 (불만 · 주급 예산 부족)
// 선수마다 바로 재계약 협상, 또는 이적 명단에 올리기. 닫아도 선수단 화면에서 협상할 수 있다
import { useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { expiring } from '../../engine/contract';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { playerKo } from '../../data/db';
import { RenewModal } from './ContractBox';
import { PosTag } from './bits';
import { koDate, money, ratingTone } from '../format';

export function RenewalRequests() {
  const w = useWorld();
  const { clearRenewals, toggleTransferList } = useGame();
  const blocked = useGame((s) => !!s.match || !!s.seasonReport || !!s.awards || !!s.news || !!s.ceremony);
  const [talk, setTalk] = useState<string | null>(null);
  const list = (w.pendingRenewals ?? []).filter((x) => { const p = w.players[x.player]; return p && p.clubId === w.userClubId && expiring(w, p); });
  if (!w.pendingRenewals?.length || blocked) return null;
  const listed = new Set(w.transferList ?? []);
  const until = `${+w.season.slice(0, 4) + 1}-06-30`;

  return (
    <div className="fixed inset-0 z-[48] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm">
      <div className="panel flex max-h-[86vh] w-full max-w-[680px] flex-col overflow-hidden">
        <header className="border-b border-line px-4 sm:px-7 py-5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-amber"><span className="h-2 w-2 rounded-full bg-amber" />재계약 요청</div>
          <h2 className="mt-2 text-[20px] font-semibold">{list.length ? `계약이 끝나는 선수 ${list.length}명이 재계약을 기다리고 있습니다` : '재계약 요청을 모두 처리했습니다'}</h2>
          <p className="mt-1 text-[13px] text-lo">불만이 없는 선수는 자동으로 재계약했습니다. 아래 선수는 직접 협상하지 않으면 {koDate(until)} 이후 자유계약(FA)으로 떠납니다.</p>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {list.map(({ player, reason }) => {
            const p = w.players[player]; const o = overall(p);
            return (
              <div key={player} className="flex items-center gap-4 px-4 sm:px-7 py-4 shadow-[inset_0_-1px_0_var(--color-line)]">
                <span className={`tnum w-8 text-center text-[18px] font-semibold ${ratingTone(o)}`}>{o}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[14px] font-semibold"><PosTag pos={p.pos} />{playerKo(p.id, p.name)}<span className="text-[12px] font-normal text-lo">{ageOn(p.birth, w.date)}세 · 주급 {money(p.wage)}</span></div>
                  <div className="mt-1 text-[12px] text-amber">{reason}</div>
                </div>
                <button onClick={() => toggleTransferList(p.id)} className={`h-9 rounded-lg px-3 text-[12px] ring-1 ring-line ${listed.has(p.id) ? 'text-amber' : 'text-mid hover:text-hi'}`}>{listed.has(p.id) ? '이적 명단 ✓' : '이적 명단'}</button>
                <button onClick={() => setTalk(p.id)} className="h-9 rounded-lg bg-neon px-4 text-[13px] font-semibold text-ink-950 hover:bg-[#5bff3d]">재계약 협상</button>
              </div>
            );
          })}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-4 sm:px-7 py-4">
          <span className="text-[12px] text-lo">나중에 선수단 화면에서도 재계약할 수 있습니다</span>
          <button onClick={clearRenewals} className="h-10 rounded-lg bg-ink-700 px-6 text-[14px] font-semibold text-hi hover:bg-ink-750">{list.length ? '나중에' : '닫기'}</button>
        </footer>
      </div>
      {talk && w.players[talk] && <RenewModal p={w.players[talk]} onClose={() => setTalk(null)} />}
    </div>
  );
}
