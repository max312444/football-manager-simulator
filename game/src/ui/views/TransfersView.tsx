// 이적 화면: 선수 검색 · 관심 목록 · 내 선수(이적 명단 · 방출) · 받은 제안
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerState } from '../../engine/types';
import { estOverall, seenOverall } from '../../engine/scout';
import { OvrText } from '../components/Scout';
import { ageOn } from '../../engine/condition';
import { marketValue, nextWindow, offerValid, talkBanned, wageDemand, windowOpen } from '../../engine/transfer';
import { wageRoomInfo } from '../../engine/rules';
import { clubKo, compKo, nations, playerKo } from '../../data/db';
import { PlayerPanel } from './PlayerPanel';
import { NegotiationModal } from '../components/NegotiationModal';
import { SellNegotiationModal } from '../components/SellNegotiationModal';
import { ContractBox } from '../components/ContractBox';
import { LoanInModal, LoanOutModal } from '../components/LoanModal';
import { posGroup } from '../../data/rating';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Crest } from '../components/Crest';
import { PosTag } from '../components/bits';
import { koDate, money } from '../format';
import { useApp } from '../../store/app';
import { analyzeClub, searchPreset } from '../../engine/analysis';
import type { Position } from '../../data/types';

type Tab = 'search' | 'shortlist' | 'mine' | 'offers';
type Group = 'ALL' | 'GK' | 'DF' | 'MF' | 'FW';
/** 세부 포지션 (여러 개 골라서 보기) */
const POS_CHIPS: Position[] = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];

export function TransfersView({ initialGroup }: { initialGroup?: Group }) {
  const w = useWorld();
  const preset = useApp((s) => s.transferPreset);
  const { toggleShortlist, toggleTransferList, release, answerOffer } = useGame();
  const [tab, setTab] = useState<Tab>('search');
  const [filters, setFilters] = useState(false);
  const [group, setGroup] = useState<Group>(initialGroup ?? 'ALL');
  const [league, setLeague] = useState<string>('ALL');
  const [maxAge, setMaxAge] = useState(preset?.maxAge ?? 40);
  const [minOvr, setMinOvr] = useState(preset?.minOvr ?? 60);
  const [posSet, setPosSet] = useState<{ positions: Position[]; label: string } | null>(preset ? { positions: preset.positions, label: preset.label } : null);
  const advice = useMemo(() => analyzeClub(w, w.userClubId).priorities, [w, w.clubs[w.userClubId].squad.length]);
  const [maxValue, setMaxValue] = useState(0);   // 0 = 제한 없음
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Position[]>([]);            // 세부 포지션 (비어 있으면 위 그룹 기준)
  const [clubPick, setClubPick] = useState<string | null>(null);   // 구단만 보기
  const [clubQ, setClubQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [talkWith, setTalkWith] = useState<string | null>(null);
  const [sellTalk, setSellTalk] = useState<string | null>(null);

  const club = w.clubs[w.userClubId];
  const win = windowOpen(w.season, w.date);
  const ri = wageRoomInfo(w, w.userClubId);
  const signedMoney = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));
  const offers = (w.offers ?? []).filter((o) => offerValid(w, o));
  const shortlist = w.shortlist ?? [];
  const listed = new Set(w.transferList ?? []);

  const rows = useMemo(() => {
    const name = (p: PlayerState) => playerKo(p.id, p.name);
    let ps: PlayerState[];
    if (tab === 'shortlist') ps = shortlist.map((id) => w.players[id]).filter(Boolean);
    else if (tab === 'mine') ps = [...club.squad, ...(club.loanedOut ?? [])].map((id) => w.players[id]).filter(Boolean);
    else {
      ps = Object.values(w.players).filter((p) => !p.retired && p.clubId !== w.userClubId
        && (clubPick ? p.clubId === clubPick : league === 'ALL' || (league === 'FA' ? !p.clubId : p.clubId && w.clubs[p.clubId]?.league === league)));
      ps = ps.filter((p) => (posSet ? posSet.positions.includes(p.pos) : pos.length ? pos.includes(p.pos) : group === 'ALL' || posGroup(p.pos) === group) && ageOn(p.birth, w.date) <= maxAge && seenOverall(w, p)[1] >= minOvr
        && (!q || name(p).includes(q) || p.name.toLowerCase().includes(q.toLowerCase())));
      if (maxValue) ps = ps.filter((p) => marketValue(w, p) <= maxValue);
    }
    // 능력은 아는 만큼 (스카우트): 범위 가운데 값으로 정렬
    return ps.map((p) => ({ p, ovr: estOverall(w, p), age: ageOn(p.birth, w.date), value: marketValue(w, p) }))
      .sort((a, b) => b.ovr - a.ovr || a.age - b.age).slice(0, 200);
  }, [w, tab, group, league, maxAge, minOvr, maxValue, q, shortlist, club.squad, posSet, pos, clubPick]);
  // 조건을 바꾸면 목록을 맨 위로
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [tab, group, league, maxAge, minOvr, maxValue, q, posSet, pos, clubPick]);
  /** 구단 고르기: 그 구단 선수단 전체가 보이게 능력 · 나이 조건을 넓힌다 */
  const pickClub = (id: string | null) => { setClubPick(id); setClubQ(''); if (id) { setMinOvr(40); setMaxAge(45); setPosSet(null); } };
  const clubHits = useMemo(() => {
    if (!clubQ.trim()) return [];
    const k = clubQ.trim().toLowerCase();
    return Object.values(w.clubs).filter((c) => w.competitions[c.league] && c.id !== w.userClubId && (clubKo(c.id).toLowerCase().includes(k) || c.id.includes(k))).slice(0, 8);
  }, [clubQ, w]);

  const selected = sel ? w.players[sel] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden lg:p-6">
      <section className="flex min-w-0 flex-col lg:flex-1">
        {/* 상단: 이적시장 상태 · 예산 */}
        <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:mb-4 lg:grid-cols-4">
          <div className="bg-ink-850 px-4 py-3 lg:px-5 lg:py-4">
            <div className="text-[12px] text-lo">이적시장</div>
            <div className={`mt-1 text-[16px] font-semibold ${win ? 'text-neon' : 'text-mid'}`}>{win ? (win === 'summer' ? '여름 이적시장 열림' : '겨울 이적시장 열림') : '닫힘'}</div>
            <div className="hidden text-[12px] text-lo sm:block">{win ? '다른 구단 선수 영입 가능' : `다음: ${koDate(nextWindow(w.season, w.date))} · 자유계약은 가능`}</div>
          </div>
          <div className="bg-ink-850 px-4 py-3 lg:px-5 lg:py-4"><div className="text-[12px] text-lo">이적 예산</div><div className="tnum mt-1 text-[18px] font-semibold lg:text-[20px]">{money(club.finance.transferBudget)}</div></div>
          <div className="bg-ink-850 px-4 py-3 lg:px-5 lg:py-4">
            <div className="text-[12px] text-lo">주급 여유</div>
            <div className={`tnum mt-1 text-[18px] font-semibold lg:text-[20px] ${ri.room < 0 ? 'text-amber' : ''}`}>{signedMoney(ri.room)}</div>
          </div>
          <div className="bg-ink-850 px-4 py-3 lg:px-5 lg:py-4"><div className="text-[12px] text-lo">선수단</div><div className="tnum mt-1 text-[18px] font-semibold lg:text-[20px]">{club.squad.length}명</div></div>
        </div>

        {/* 탭 */}
        <div className="mb-3 flex items-center gap-1 overflow-x-auto">
          {([['search', '선수 검색'], ['shortlist', `관심 목록 ${shortlist.length}`], ['mine', '내 선수'], ['offers', `받은 제안 ${offers.length}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setSel(null); }}
              className={`h-8 shrink-0 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors lg:px-4 ${tab === k ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>{label}</button>
          ))}
        </div>
        {/* 휴대폰: 검색 조건은 접어 둔다 */}
        {tab === 'search' && (
          <button onClick={() => setFilters((v) => !v)} className="mb-3 flex h-10 items-center justify-between rounded-lg bg-ink-850 px-4 text-[13px] text-mid ring-1 ring-line lg:hidden">
            <span>검색 조건 {pos.length || posSet || clubPick || q || league !== 'ALL' ? <span className="text-neon">· 적용 중</span> : ''}</span><span>{filters ? '접기 ▴' : '펼치기 ▾'}</span>
          </button>
        )}

        {tab === 'search' && advice.length > 0 && (
          <div className={`mb-3 flex flex-wrap items-center gap-2 text-[12px] ${filters ? '' : 'max-lg:hidden'}`}>
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
          <div className={`mb-3 flex flex-wrap items-center gap-2 text-[13px] ${filters ? '' : 'max-lg:hidden'}`}>
            {posSet && <button onClick={() => setPosSet(null)} className="h-8 rounded-lg bg-neon-ghost px-3 text-[12px] text-neon ring-1 ring-line-strong">{posSet.label} ({posSet.positions.join('·')}) ✕</button>}
            <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
              {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((g) => (
                <button key={g} onClick={() => { setGroup(g); setPosSet(null); setPos([]); }} className={`h-7 rounded-md px-3 text-[12px] transition-colors ${group === g ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="h-9 w-36 rounded-lg sm:w-40 border border-line bg-ink-850 px-3 text-hi placeholder:text-lo" />
            {/* 구단 검색: 고르면 그 구단 선수만 */}
            {clubPick ? (
              <button onClick={() => pickClub(null)} className="flex h-9 items-center gap-2 rounded-lg bg-neon-ghost px-3 text-[12px] text-neon ring-1 ring-line-strong" title="구단 필터 끄기">
                <Crest clubId={clubPick} size={16} />{clubKo(clubPick)} 선수만 ✕
              </button>
            ) : (
              <div className="relative">
                <input value={clubQ} onChange={(e) => setClubQ(e.target.value)} placeholder="구단 검색" className="h-9 w-40 rounded-lg border border-line bg-ink-850 px-3 text-hi placeholder:text-lo" />
                {clubHits.length > 0 && (
                  <div className="panel absolute top-10 left-0 z-30 w-64 overflow-hidden py-1">
                    {clubHits.map((c) => (
                      <button key={c.id} onClick={() => pickClub(c.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-ink-800">
                        <Crest clubId={c.id} size={16} /><span className="min-w-0 flex-1 truncate">{clubKo(c.id)}</span><span className="text-[11px] text-lo">{compKo(c.league)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {tab === 'search' && (
          <div className={`mb-3 flex flex-wrap items-center gap-1 text-[12px] ${filters ? '' : 'max-lg:hidden'}`}>
            <span className="mr-1 text-lo">세부 포지션</span>
            {POS_CHIPS.map((x) => {
              const on = pos.includes(x);
              return (
                <button key={x} onClick={() => { setPosSet(null); setGroup('ALL'); setPos((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x])); }}
                  className={`h-7 w-11 rounded-md font-semibold transition-colors ${on ? 'bg-neon text-ink-950' : 'bg-ink-850 text-mid ring-1 ring-line hover:text-hi'}`}>{x}</button>
              );
            })}
            {pos.length > 0 && <button onClick={() => setPos([])} className="ml-1 h-7 rounded-md px-2 text-lo hover:text-hi">지우기</button>}
          </div>
        )}

        {tab === 'offers' ? (
          <div className="panel min-h-0 overflow-auto lg:flex-1">
            {offers.length === 0 && <div className="grid h-full place-items-center text-[13px] text-lo">받은 제안이 없습니다. 내 선수 탭에서 이적 명단에 올리면 다른 구단이 제안해 옵니다.</div>}
            {offers.map((o) => { const p = w.players[o.player]; return (
              <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-4 shadow-[inset_0_-1px_0_var(--color-line)] lg:flex-nowrap lg:gap-4 lg:px-5">
                <Crest clubId={o.from} size={24} />
                <div className="min-w-0 flex-1 basis-[calc(100%-40px)] lg:basis-auto">
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
          <div ref={listRef} className="panel min-h-0 overflow-auto lg:flex-1">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-ink-800 text-left text-[12px] text-lo">
                <tr className="h-9 shadow-[inset_0_-1px_0_var(--color-line)]">
                  <th className="px-3 font-medium lg:px-4">선수</th><th className="px-2 font-medium">포지션</th><th className="hidden px-2 text-right font-medium lg:table-cell">나이</th>
                  <th className="hidden px-3 font-medium lg:table-cell">소속</th><th className="px-2 text-right font-medium">능력</th>
                  <th className="hidden px-3 text-right font-medium sm:table-cell">시장 가치</th><th className="hidden px-3 text-right font-medium lg:table-cell">주급</th><th className="hidden px-4 text-right font-medium lg:table-cell">계약</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-lo">조건에 맞는 선수가 없습니다</td></tr>}
                {rows.map(({ p, age, value }) => (
                  <tr key={p.id} onClick={() => setSel(p.id)} className={`h-12 cursor-pointer lg:h-11 shadow-[inset_0_-1px_0_var(--color-line)] transition-colors ${sel === p.id ? 'bg-neon-ghost' : p.clubId ? 'hover:bg-ink-800' : 'bg-sky/[0.06] hover:bg-sky/10'}`}>
                    <td className={`px-3 py-1.5 lg:px-4 lg:py-0 ${p.clubId ? '' : 'shadow-[inset_3px_0_0_var(--color-sky)]'}`}><span className="font-medium">{playerKo(p.id, p.name)}</span>
                      {!p.clubId && <span className="ml-2 rounded bg-sky/15 px-1.5 py-px text-[11px] font-semibold text-sky">FA</span>}
                      {listed.has(p.id) && <span className="ml-2 rounded bg-amber/15 px-1 text-[11px] text-amber">이적 명단</span>}
                      {p.loan && <span className="ml-2 rounded bg-sky/15 px-1 text-[11px] text-sky">{p.loan.from === w.userClubId ? '임대 보냄' : p.clubId === w.userClubId ? '임대 영입' : '임대 중'}</span>}
                      {shortlist.includes(p.id) && tab !== 'shortlist' && <span className="ml-2 text-[11px] text-neon">관심</span>}
                      <div className="truncate text-[11px] text-lo lg:hidden">{p.clubId ? clubKo(p.clubId) : 'FA'} · {age}세<span className="sm:hidden">{p.clubId ? ` · ${money(value)}` : ''}</span></div>
                    </td>
                    <td className="px-2"><PosTag pos={p.pos} /></td>
                    <td className="tnum hidden px-2 text-right text-mid lg:table-cell">{age}</td>
                    <td className="hidden px-3 lg:table-cell"><span className="flex items-center gap-2">{p.clubId ? <button title={p.clubId === w.userClubId ? '' : '이 구단 선수만 보기'} onClick={(e) => { if (p.clubId === w.userClubId) return; e.stopPropagation(); setTab('search'); pickClub(p.clubId); }} className="flex min-w-0 items-center gap-2 hover:text-hi"><Crest clubId={p.clubId} size={16} /><span className="truncate text-mid underline-offset-2 hover:underline">{clubKo(p.clubId)}</span></button> : <span className="text-sky">소속 없음 · 이적료 없음</span>}</span></td>
                    <td className="px-2 text-right"><OvrText w={w} p={p} /></td>
                    <td className="tnum hidden px-3 text-right sm:table-cell">{p.clubId ? money(value) : '–'}</td>
                    <td className="tnum hidden px-3 text-right text-mid lg:table-cell">{money(p.wage)}</td>
                    <td className="tnum hidden px-4 text-right text-mid lg:table-cell">{p.contract ? p.contract.slice(0, 7).replace('-', '.') : p.clubId ? '–' : <span className="text-sky">FA</span>}</td>
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
        onRelease={() => { release(selected.id); setSel(null); setNotice(`${playerKo(selected.id, selected.name)} 방출`); }} onClose={() => setSel(null)} />}
      {sellTalk && <SellNegotiationModal offerId={sellTalk} onClose={() => setSellTalk(null)} />}
      {talkWith && w.players[talkWith] && <NegotiationModal p={w.players[talkWith]} onClose={() => { setTalkWith(null); if (w.players[talkWith].clubId === w.userClubId) setSel(null); }} />}
    </div>
  );
}

/** 오른쪽 선수 정보 + 할 수 있는 일 (영입 협상 · 관심 목록 / 이적 명단 · 방출) */
function Side({ p, mine, listed, shortlisted, onList, onShort, onRelease, onTalk, onClose }: {
  p: PlayerState; mine: boolean; listed: boolean; shortlisted: boolean; onList: () => void; onShort: () => void; onRelease: () => void; onTalk: () => void; onClose: () => void;
}) {
  const w = useWorld();
  const ban = talkBanned(w, p.id);
  const talk = w.talks?.[p.id];
  const value = marketValue(w, p);
  const [loanIn, setLoanIn] = useState(false);
  const [loanOut, setLoanOut] = useState(false);
  const loanBuy = useGame((g) => g.loanBuy);
  const [loanMsg, setLoanMsg] = useState('');
  const open = !!windowOpen(w.season, w.date);
  const l = p.loan;
  // 임대 관련: 빌려 온 선수 · 보낸 선수 · 다른 구단의 임대 중 선수
  const loanInfo = l ? (
    <div className="mb-3 rounded-lg bg-sky/10 px-3 py-2 text-[12px] text-sky">
      임대 중 · 원소속 {clubKo(l.from)} → {clubKo(p.clubId ?? '')} · {l.until.slice(0, 7).replace('-', '.')}까지 · 주급 {Math.round(l.share * 100)}% 부담{l.buy ? ` · ${l.must ? '시즌 끝 의무 이적' : '완전 영입 옵션'} ${money(l.buy)} (영입 후 주급 ${money(l.buyWage ?? p.wage)})` : ''}
    </div>
  ) : null;
  if (l && p.clubId === w.userClubId) {
    const actions = (
      <div>
        {loanInfo}
        <div className="flex gap-2">
          {l.buy && <button onClick={() => setLoanMsg(loanBuy(p.id).msg)} className="h-10 flex-1 rounded-lg bg-neon text-[13px] font-semibold text-ink-950">{l.must ? '지금 바로 이적' : '완전 영입 옵션 행사'} {money(l.buy)}</button>}
          <button onClick={onRelease} className="h-10 rounded-lg px-4 text-[13px] text-mid ring-1 ring-line hover:text-hi">원소속으로 돌려보내기</button>
        </div>
        {loanMsg && <div className="mt-2 text-[12px] text-mid">{loanMsg}</div>}
      </div>
    );
    return <PlayerPanel p={p} age={ageOn(p.birth, w.date)} ko={playerKo(p.id, p.name)} nation={nations.get(p.nation)?.ko ?? p.nation} club sheet={{ open: true, onClose }} actions={actions} />;
  }
  if (l) return <PlayerPanel p={p} age={ageOn(p.birth, w.date)} ko={playerKo(p.id, p.name)} nation={nations.get(p.nation)?.ko ?? p.nation} club sheet={{ open: true, onClose }} actions={<div>{loanInfo}<div className="text-[12px] text-lo">임대 중인 선수는 시즌이 끝날 때까지 이적할 수 없습니다</div></div>} />;
  const actions = mine ? (
    <div>
      <div className="mb-3 text-[12px] text-lo">시장 가치 <span className="tnum text-mid">{money(value)}</span> · 이적 명단에 올리면 이적시장 동안 다른 구단이 제안해 옵니다</div>
      <div className="mb-4 flex gap-2">
        <button onClick={onList} className={`h-10 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${listed ? 'bg-amber/15 text-amber' : 'bg-ink-700 text-hi hover:bg-ink-750'}`}>{listed ? '이적 명단에서 빼기' : '이적 명단에 올리기'}</button>
        <button onClick={() => setLoanOut(true)} disabled={!open} title={open ? '' : '이적시장 기간에만'} className="h-10 rounded-lg px-4 text-[13px] text-sky ring-1 ring-line transition-colors hover:bg-sky/10 disabled:opacity-40">임대 보내기</button>
        <button onClick={onRelease} className="h-10 rounded-lg px-4 text-[13px] text-red ring-1 ring-line transition-colors hover:bg-red/10">방출</button>
      </div>
      <ContractBox p={p} />
      {loanOut && <LoanOutModal p={p} onClose={() => setLoanOut(false)} />}
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
        {p.clubId && <button onClick={() => setLoanIn(true)} disabled={!open} title={open ? '' : '이적시장 기간에만'} className="h-10 rounded-lg px-3 text-[13px] text-sky ring-1 ring-line transition-colors hover:bg-sky/10 disabled:opacity-40">임대</button>}
        <button onClick={onShort} className={`h-10 rounded-lg px-4 text-[13px] ring-1 ring-line transition-colors ${shortlisted ? 'text-neon' : 'text-mid hover:text-hi'}`}>{shortlisted ? '관심 ✓' : '관심'}</button>
      </div>
      {loanIn && <LoanInModal p={p} onClose={() => setLoanIn(false)} />}
    </div>
  );
  return <PlayerPanel p={p} age={ageOn(p.birth, w.date)} ko={playerKo(p.id, p.name)} nation={nations.get(p.nation)?.ko ?? p.nation} club sheet={{ open: true, onClose }} actions={actions} />;
}
