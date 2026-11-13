// 검색에서 연 창: 선수 정보 (영입 협상 · 관심) · 구단 선수단
import { ManagerLine } from './ManagerProfile';
import { useEffect, useState } from 'react';
import { ClubScoutBar, OvrText } from './Scout';
import { useApp } from '../../store/app';
import { buyoutOf } from '../../engine/clauses';
import { bosmanEligible } from '../../engine/bosman';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, compKo, nations, playerKo } from '../../data/db';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { marketValue, talkBanned, wageDemand, windowOpen } from '../../engine/transfer';
import { POS_ORDER } from '../../data/rating';
import { PlayerPanel } from '../views/PlayerPanel';
import { NegotiationModal } from './NegotiationModal';
import { ContractBox } from './ContractBox';
import { Crest } from './Crest';
import { PosTag } from './bits';
import { money } from '../format';

function useEsc(onClose: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, on]);
}

export function SearchModals() {
  return <><ClubModal /><ProfileModal /></>;
}

function ProfileModal() {
  const w = useWorld();
  const id = useApp((s) => s.profile);
  const close = useApp((s) => s.openProfile);
  const setTab = useApp((s) => s.setTab);
  const { toggleShortlist } = useGame();
  const [talk, setTalk] = useState(false);
  useEsc(() => close(null), !!id && !talk);
  const p = id ? w.players[id] : null;
  if (!p) return null;
  const mine = p.clubId === w.userClubId;
  const ban = talkBanned(w, p.id);
  const short = (w.shortlist ?? []).includes(p.id);
  const bosman = bosmanEligible(w, p, w.userClubId);
  const pre = p.precontract?.club === w.userClubId;
  const closed = !!p.clubId && !windowOpen(w.season, w.date) && !bosman;
  const actions = mine ? (
    <ContractBox p={p} extra={<button onClick={() => { close(null); setTab('squad'); }} className="h-10 rounded-lg px-4 text-[13px] text-mid ring-1 ring-line hover:text-hi">선수단</button>} />
  ) : (
    <div>
      <div className="mb-3 flex justify-between text-[12px] text-lo">
        <span>{p.clubId ? <>시장 가치 <span className="tnum text-mid">{money(marketValue(w, p))}</span> · 바이아웃 <span className="tnum text-mid">{buyoutOf(w, p) ? money(buyoutOf(w, p)) : '없음'}</span></> : <span className="text-neon">자유계약 · 이적료 없음</span>}</span>
        <span>원하는 주급 약 <span className="tnum text-mid">{money(wageDemand(w, p, w.userClubId))}</span></span>
      </div>
      {(ban || closed) && <div className="mb-2 rounded-lg border border-line bg-ink-900 px-3 py-2 text-[12px] text-amber">{ban ? `협상 결렬 · ${ban.slice(5).replace('-', '/')}까지 협상 불가` : '이적시장이 닫혀 있어 지금은 영입할 수 없습니다'}</div>}
      <div className="flex gap-2">
        <button disabled={!!ban || closed || pre} onClick={() => setTalk(true)} className="h-10 flex-1 rounded-lg bg-neon text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d] disabled:bg-ink-700 disabled:text-lo">{pre ? '사전 계약 완료 · 7월 합류' : bosman ? '사전 계약 (보스만)' : p.clubId ? '영입 협상' : '계약 협상 (FA)'}</button>
        <button onClick={() => toggleShortlist(p.id)} className={`h-10 rounded-lg px-4 text-[13px] ring-1 ring-line ${short ? 'text-neon' : 'text-mid hover:text-hi'}`}>{short ? '관심 ✓' : '관심'}</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[45] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/75 p-2 sm:p-6 backdrop-blur-sm" onClick={() => close(null)}>
      <div className="flex h-[86vh] max-h-[860px]" onClick={(e) => e.stopPropagation()}>
        <PlayerPanel p={p} age={ageOn(p.birth, w.date)} ko={playerKo(p.id, p.name)} nation={nations.get(p.nation)?.ko ?? p.nation} club actions={actions} />
      </div>
      {talk && <div onClick={(e) => e.stopPropagation()}><NegotiationModal p={p} onClose={() => setTalk(false)} /></div>}
    </div>
  );
}

function ClubModal() {
  const w = useWorld();
  const id = useApp((s) => s.clubView);
  const { openClub, openProfile, openTable } = useApp();
  const profileOpen = useApp((s) => !!s.profile);
  useEsc(() => openClub(null), !!id && !profileOpen);
  const c = id ? w.clubs[id] : null;
  if (!c) return null;
  const ps = c.squad.map((x) => w.players[x]).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || overall(b) - overall(a));
  const top = [...ps].map(overall).sort((a, b) => b - a).slice(0, 11);
  const lv = Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length));
  const lg = compKo(c.league) ?? c.league;
  return (
    <div className="fixed inset-0 z-40 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/75 p-2 sm:p-6 backdrop-blur-sm" onClick={() => openClub(null)}>
      <div className="panel flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-4 sm:flex-nowrap sm:px-6 sm:py-5">
          <Crest clubId={c.id} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[20px] font-semibold">{clubKo(c.id)}{c.id === w.userClubId && <span className="ml-2 align-middle text-[12px] text-neon">내 구단</span>}</div>
            <button onClick={() => openTable(c.league)} className="text-[12px] text-lo hover:text-hi">{lg} · 순위 보기</button>
          </div>
          <dl className="order-last flex w-full justify-around gap-5 text-center text-[12px] text-lo sm:order-none sm:w-auto sm:justify-start">
            <div><dd className="tnum text-[18px] font-semibold text-hi">{lv}</dd><dt>주전 평균</dt></div>
            <div><dd className="tnum text-[18px] font-semibold text-hi">{c.squad.length}</dd><dt>선수</dt></div>
            <div><dd className="tnum text-[18px] font-semibold text-hi">{c.reputation}</dd><dt>명성</dt></div>
          </dl>
          <button onClick={() => openClub(null)} className="h-8 w-8 shrink-0 rounded-md text-[18px] text-lo hover:bg-ink-800 hover:text-hi" aria-label="닫기">×</button>
        </header>
        <div className="border-b border-line px-6 py-2.5"><ManagerLine clubId={c.id} /></div>
        <ClubScoutBar clubId={c.id} />
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[13px]">
            <tbody>
              {ps.map((p) => { return (
                <tr key={p.id} onClick={() => openProfile(p.id)} className="h-10 cursor-pointer shadow-[inset_0_-1px_0_var(--color-line)] hover:bg-ink-800">
                  <td className="w-14 pl-6"><PosTag pos={p.pos} /></td>
                  <td className="font-medium">{playerKo(p.id, p.name)}</td>
                  <td className="tnum w-12 text-right text-mid">{ageOn(p.birth, w.date)}</td>
                  <td className="tnum w-24 text-right text-mid">{money(marketValue(w, p))}</td>
                  <td className="w-20 pr-6 text-right"><OvrText w={w} p={p} /></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
