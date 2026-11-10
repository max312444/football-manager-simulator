// 이적 화면: 선수 검색 · 관심 목록 · 내 선수(이적 명단 · 방출) · 받은 제안
import { useMemo, useState } from 'react';
import type { PlayerState } from '../../engine/types';
import { overall } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { marketValue, nextWindow, offerValid, talkBanned, wageBill, wageDemand, windowOpen } from '../../engine/transfer';
import { clubKo, compKo, nations, playerKo } from '../../data/db';
import { PlayerPanel } from './PlayerPanel';
import { NegotiationModal } from '../components/NegotiationModal';
import { SellNegotiationModal } from '../components/SellNegotiationModal';
import { ContractBox } from '../components/ContractBox';
import { posGroup } from '../../data/rating';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Crest } from '../components/Crest';
import { PosTag } from '../components/bits';
import { koDate, money, ratingTone } from '../format';
import { useApp } from '../../store/app';
import { analyzeClub, searchPreset } from '../../engine/analysis';
import type { Position } from '../../data/types';

type Tab = 'search' | 'shortlist' | 'mine' | 'offers';
type Group = 'ALL' | 'GK' | 'DF' | 'MF' | 'FW';

export function TransfersView({ initialGroup }: { initialGroup?: Group }) {
  const w = useWorld();
  const preset = useApp((s) => s.transferPreset);
  const { toggleShortlist, toggleTransferList, release, answerOffer } = useGame();
  const [tab, setTab] = useState<Tab>('search');
  const [group, setGroup] = useState<Group>(initialGroup ?? 'ALL');
  const [league, setLeague] = useState<string>('ALL');
  const [maxAge, setMaxAge] = useState(preset?.maxAge ?? 40);
  const [minOvr, setMinOvr] = useState(preset?.minOvr ?? 60);
  const [posSet, setPosSet] = useState<{ positions: Position[]; label: string } | null>(preset ? { positions: preset.positions, label: preset.label } : null);
  const advice = useMemo(() => analyzeClub(w, w.userClubId).priorities, [w, w.clubs[w.userClubId].squad.length]);
  const [maxValue, setMaxValue] = useState(0);   // 0 = 제한 없음
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [talkWith, setTalkWith] = useState<string | null>(null);
  const [sellTalk, setSellTalk] = useState<string | null>(null);

  const club = w.clubs[w.userClubId];
  const win = windowOpen(w.season, w.date);
  const bill = wageBill(w, w.userClubId);
  const offers = (w.offers ?? []).filter((o) => offerValid(w, o));
  const shortlist = w.shortlist ?? [];
  const listed = new Set(w.transferList ?? []);

  const rows = useMemo(() => {
    const name = (p: PlayerState) => playerKo(p.id, p.name);
    let ps: PlayerState[];
    if (tab === 'shortlist') ps = shortlist.map((id) => w.players[id]).filter(Boolean);
    else if (tab === 'mine') ps = club.squad.map((id) => w.players[id]);
    else {
      ps = Object.values(w.players).filter((p) => !p.retired && p.clubId !== w.userClubId
        && (league === 'ALL' || (league === 'FA' ? !p.clubId : p.clubId && w.clubs[p.clubId]?.league === league)));
      ps = ps.filter((p) => (posSet ? posSet.positions.includes(p.pos) : group === 'ALL' || posGroup(p.pos) === group) && ageOn(p.birth, w.date) <= maxAge && overall(p) >= minOvr
        && (!q || name(p).includes(q) || p.name.toLowerCase().includes(q.toLowerCase())));
      if (maxValue) ps = ps.filter((p) => marketValue(w, p) <= maxValue);
    }
    return ps.map((p) => ({ p, ovr: overall(p), age: ageOn(p.birth, w.date), value: marketValue(w, p) }))
      .sort((a, b) => b.ovr - a.ovr || a.age - b.age).slice(0, 200);
  }, [w, tab, group, league, maxAge, minOvr, maxValue, q, shortlist, club.squad, posSet]);

  const selected = sel ? w.players[sel] : null;

  return (
    <div className="flex h-full min-h-0 gap-6 p-6">
      <section className="flex min-w-0 flex-1 flex-col">
        {/* 상단: 이적시장 상태 · 예산 */}
        <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line">
          <div className="bg-ink-850 px-5 py-4">
            <div className="text-[12px] text-lo">이적시장</div>
            <div className={`mt-1 text-[16px] font-semibold ${win ? 'text-neon' : 'text-mid'}`}>{win ? (win === 'summer' ? '여름 이적시장 열림' : '겨울 이적시장 열림') : '닫힘'}</div>
            <div className="text-[12px] text-lo">{win ? '다른 구단 선수 영입 가능' : `다음: ${koDate(nextWindow(w.season, w.date))} · 자유계약은 가능`}</div>
          </div>
          <div className="bg-ink-850 px-5 py-4"><div className="text-[12px] text-lo">이적 예산</div><div className="tnum mt-1 text-[20px] font-semibold">{money(club.finance.transferBudget)}</div></div>
          <div className="bg-ink-850 px-5 py-4"><div className="text-[12px] text-lo">주급 여유</div><div className={`tnum mt-1 text-[20px] font-semibold ${club.finance.wageBudget - bill < 0 ? 'text-amber' : ''}`}>{money(club.finance.wageBudget - bill)}</div></div>
          <div className="bg-ink-850 px-5 py-4"><div className="text-[12px] text-lo">선수단</div><div className="tnum mt-1 text-[20px] font-semibold">{club.squad.length}명</div></div>
        </div>

        {/* 탭 */}
        <div className="mb-3 flex items-center gap-1">
          {([['search', '선수 검색'], ['shortlist', `관심 목록 ${shortlist.length}`], ['mine', '내 선수'], ['offers', `받은 제안 ${offers.length}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setSel(null); }}
              className={`h-8 rounded-md px-4 text-[13px] transition-colors ${tab === k ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>{label}</button>
          ))}
        </div>

        {tab === 'search' && advice.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-lo">추천 보강</span>
            {advice.map((a) => {
              const pr = searchPreset(a);
              const on = posSet?.label === pr.label;
              return (
                <button key={a.unit.key} onClick={() => { if (on) { setPosSet(null); return; } setPosSet({ positions: pr.positions, label: pr.label }); setMinOvr(pr.minOvr); setMaxAge(pr.maxAge); }}
                  className={`h-7 rounded-md px-3 transition-colors ${on ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-850 text-mid ring-1 ring-line hover:text-hi'}`}>
                  {a.unit.label} · 능력 {pr.minOvr}+
                </button>
              );
            })}
          </div>
        )}
        {tab === 'search' && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            {posSet && <button onClick={() => setPosSet(null)} className="h-8 rounded-lg bg-neon-ghost px-3 text-[12px] text-neon ring-1 ring-line-strong">{posSet.label} ({posSet.positions.join('·')}) ✕</button>}
            <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
              {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((g) => (
                <button key={g} onClick={() => { setGroup(g); setPosSet(null); }} className={`h-7 rounded-md px-3 text-[12px] transition-colors ${group === g ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>
                  {{ ALL: '전체', GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' }[g]}
                </button>
              ))}
            </div>
            <select value={league} onChange={(e) => setLeague(e.target.value)} className="h-9 rounded-lg border border-line bg-ink-850 px-3 text-mid">
              <option value="ALL">모든 리그</option>
              {Object.keys(w.competitions).map((id) => <option key={id} value={id}>{compKo(id) ?? id}</option>)}
              <option value="FA">자유계약 (FA)</option>
            </select>
            <label className="flex items-center gap-2 text-lo">나이 ≤ <input type="number" value={maxAge} min={16} max={45} onChange={(e) => setMaxAge(+e.target.value || 40)} className="tnum h-9 w-16 rounded-lg border border-line bg-ink-850 px-2 text-hi" /></label>
            <label className="flex items-center gap-2 text-lo">능력 ≥ <input type="number" value={minOvr} min={40} max={95} onChange={(e) => setMinOvr(+e.target.value || 0)} className="tnum h-9 w-16 rounded-lg border border-line bg-ink-850 px-2 text-hi" /></label>
            <select value={maxValue} onChange={(e) => setMaxValue(+e.target.value)} className="h-9 rounded-lg border border-line bg-ink-850 px-3 text-mid">
              <option value={0}>몸값 제한 없음</option>
              {[5e6, 10e6, 20e6, 40e6, 80e6].map((v) => <option key={v} value={v}>몸값 ≤ {money(v)}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="h-9 w-40 rounded-lg border border-line bg-ink-850 px-3 text-hi placeholder:text-lo" />
          </div>
        )}

        {tab === 'offers' ? (
          <div className="panel min-h-0 flex-1 overflow-auto">
            {offers.length === 0 && <div className="grid h-full place-items-center text-[13px] text-lo">받은 제안이 없습니다. 내 선수 탭에서 이적 명단에 올리면 다른 구단이 제안해 옵니다.</div>}
            {offers.map((o) => { const p = w.players[o.player]; return (
              <div key={o.id} className="flex items-center gap-4 px-5 py-4 shadow-[inset_0_-1px_0_var(--color-line)]">
                <Crest clubId={o.from} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{playerKo(p.id, p.name)} <span className="text-lo">← {clubKo(o.from)}</span></div>
                  <div className="text-[12px] text-lo">제안 이적료 <span className="tnum font-semibold text-neon">{money(o.fee)}</span> · 시장 가치 {money(marketValue(w, p))} · {koDate(o.expires)}까지{o.unsolicited ? ' · 이적 명단에 없는 선수' : ''}{o.tries ? ` · 역제안 ${o.tries}회` : ''}</div>
                </div>
                <button onClick={() => setSellTalk(o.id)} className="h-9 rounded-lg bg-ink-700 px-4 text-[13px] font-semibold text-hi transition-colors hover:bg-ink-750">협상</button>
                <button onClick={() => setNotice(answerOffer(o.id, false))} className="h-9 rounded-lg px-4 text-[13px] text-mid ring-1 ring-line transition-colors hover:text-hi">거절</button>
                <button onClick={() => setNotice(answerOffer(o.id, true))} className="h-9 rounded-lg bg-neon px-4 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">수락</button>
              </div>
            ); })}
          </div>
        ) : (
          <div className="panel min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-ink-800 text-left text-[12px] text-lo">
                <tr className="h-9 shadow-[inset_0_-1px_0_var(--color-line)]">
                  <th className="px-4 font-medium">선수</th><th className="px-2 font-medium">포지션</th><th className="px-2 text-right font-medium">나이</th>
                  <th className="px-3 font-medium">소속</th><th className="px-2 text-right font-medium">능력</th>
                  <th className="px-3 text-right font-medium">시장 가치</th><th className="px-3 text-right font-medium">주급</th><th className="px-4 text-right font-medium">계약</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-lo">조건에 맞는 선수가 없습니다</td></tr>}
                {rows.map(({ p, ovr, age, value }) => (
                  <tr key={p.id} onClick={() => setSel(p.id)} className={`h-11 cursor-pointer shadow-[inset_0_-1px_0_var(--color-line)] transition-colors ${sel === p.id ? 'bg-neon-ghost' : p.clubId ? 'hover:bg-ink-800' : 'bg-sky/[0.06] hover:bg-sky/10'}`}>
                    <td className={`px-4 ${p.clubId ? '' : 'shadow-[inset_3px_0_0_var(--color-sky)]'}`}><span className="font-medium">{playerKo(p.id, p.name)}</span>
                      {!p.clubId && <span className="ml-2 rounded bg-sky/15 px-1.5 py-px text-[11px] font-semibold text-sky">FA</span>}
                      {listed.has(p.id) && <span className="ml-2 rounded bg-amber/15 px-1 text-[11px] text-amber">이적 명단</span>}
                      {shortlist.includes(p.id) && tab !== 'shortlist' && <span className="ml-2 text-[11px] text-neon">관심</span>}
                    </td>
                    <td className="px-2"><PosTag pos={p.pos} /></td>
                    <td className="tnum px-2 text-right text-mid">{age}</td>
                    <td className="px-3"><span className="flex items-center gap-2">{p.clubId ? <><Crest clubId={p.clubId} size={16} /><span className="truncate text-mid">{clubKo(p.clubId)}</span></> : <span className="text-sky">소속 없음 · 이적료 없음</span>}</span></td>
                    <td className={`tnum px-2 text-right font-semibold ${ratingTone(ovr)}`}>{ovr}</td>
                    <td className="tnum px-3 text-right">{p.clubId ? money(value) : '–'}</td>
                    <td className="tnum px-3 text-right text-mid">{money(p.wage)}</td>
                    <td className="tnum px-4 text-right text-mid">{p.contract ? p.contract.slice(0, 7).replace('-', '.') : p.clubId ? '–' : <span className="text-sky">FA</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {notice && <div className="mt-3 rounded-lg bg-ink-800 px-4 py-3 text-[13px] text-mid">{notice}</div>}
      </section>

      {selected && <Side p={selected} mine={selected.clubId === w.userClubId} listed={listed.has(selected.id)} shortlisted={shortlist.includes(selected.id)}
        onList={() => toggleTransferList(selected.id)} onShort={() => toggleShortlist(selected.id)} onTalk={() => setTalkWith(selected.id)}
        onRelease={() => { release(selected.id); setSel(null); setNotice(`${playerKo(selected.id, selected.name)} 방출`); }} />}
      {sellTalk && <SellNegotiationModal offerId={sellTalk} onClose={() => setSellTalk(null)} />}
      {talkWith && w.players[talkWith] && <NegotiationModal p={w.players[talkWith]} onClose={() => { setTalkWith(null); if (w.players[talkWith].clubId === w.userClubId) setSel(null); }} />}
    </div>
  );
}

/** 오른쪽 선수 정보 + 할 수 있는 일 (영입 협상 · 관심 목록 / 이적 명단 · 방출) */
function Side({ p, mine, listed, shortlisted, onList, onShort, onRelease, onTalk }: {
  p: PlayerState; mine: boolean; listed: boolean; shortlisted: boolean; onList: () => void; onShort: () => void; onRelease: () => void; onTalk: () => void;
}) {
  const w = useWorld();
  const ban = talkBanned(w, p.id);
  const talk = w.talks?.[p.id];
  const value = marketValue(w, p);
  const actions = mine ? (
    <div>
      <div className="mb-3 text-[12px] text-lo">시장 가치 <span className="tnum text-mid">{money(value)}</span> · 이적 명단에 올리면 이적시장 동안 다른 구단이 제안해 옵니다</div>
      <div className="mb-4 flex gap-2">
        <button onClick={onList} className={`h-10 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${listed ? 'bg-amber/15 text-amber' : 'bg-ink-700 text-hi hover:bg-ink-750'}`}>{listed ? '이적 명단에서 빼기' : '이적 명단에 올리기'}</button>
        <button onClick={onRelease} className="h-10 rounded-lg px-4 text-[13px] text-red ring-1 ring-line transition-colors hover:bg-red/10">방출</button>
      </div>
      <ContractBox p={p} />
    </div>
  ) : (
    <div>
      <div className="mb-3 flex justify-between text-[12px] text-lo">
        <span>{p.clubId ? <>시장 가치 <span className="tnum text-mid">{money(value)}</span></> : <span className="text-neon">자유계약 · 이적료 없음</span>}</span>
        <span>원하는 주급 약 <span className="tnum text-mid">{money(wageDemand(w, p))}</span></span>
      </div>
      {ban && <div className="mb-2 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-[12px] text-red">협상 결렬 · {koDate(ban)}까지 협상 불가</div>}
      <div className="flex gap-2">
        <button onClick={onTalk} disabled={!!ban} className="h-10 flex-1 rounded-lg bg-neon text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d] disabled:bg-ink-700 disabled:text-lo">
          {talk?.agreed != null ? '개인 계약 협상 계속' : talk && (talk.fee || talk.wage) ? '협상 계속' : p.clubId ? '영입 협상' : '계약 협상 (FA)'}
        </button>
        <button onClick={onShort} className={`h-10 rounded-lg px-4 text-[13px] ring-1 ring-line transition-colors ${shortlisted ? 'text-neon' : 'text-mid hover:text-hi'}`}>{shortlisted ? '관심 ✓' : '관심'}</button>
      </div>
    </div>
  );
  return <PlayerPanel p={p} age={ageOn(p.birth, w.date)} ko={playerKo(p.id, p.name)} nation={nations.get(p.nation)?.ko ?? p.nation} club actions={actions} />;
}
