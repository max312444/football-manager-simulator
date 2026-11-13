// 경기 전 스쿼드 설정: AI가 상대에 맞춰 추천한 선발로 시작 → 사용자가 수정 → 선발 확정하면 바로 킥오프
import { useApp } from '../../store/app';
import { OvrText } from '../components/Scout';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, playerKo } from '../../data/db';
import { FORMATIONS, available, famOf, matchRules } from '../../engine/squad';
import { BenchEditor } from '../components/BenchEditor';
import { unrestReasons } from '../../engine/loyalty';
import { FamBar } from '../views/TacticsView';
import { DragGhost, usePitchDrag } from '../components/PitchDrag';
import { overall, slotRating } from '../../engine/ratings';
import { recommend, teamStrength } from '../../engine/ai';
import { Crest } from '../components/Crest';
import { Icon } from '../components/Icon';
import { Card, CompBadge, ConditionIcon, FitnessBar, PosTag, ResultDot } from '../components/bits';
import { MENTALITY, PRESSING, Pitch, slotXY } from '../views/TacticsView';
import { koDate, ratingTone, roundLabel } from '../format';

export function MatchPrep() {
  const w = useWorld();
  const { match: m, updateDraft, resetDraft, confirmLineup, closeMatch, leaveMatch, reshapeDraft } = useGame();
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      confirmLineup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmLineup]);

  const oppPlan = useMemo(() => {
    if (!m) return null;
    const opp = m.side === 'home' ? m.fixture.away : m.fixture.home;
    return recommend(w, opp, w.userClubId, m.side !== 'home');
  }, [m, w]);

  if (!m || !oppPlan) return null;
  const d = m.draft;
  const f = m.fixture;
  const oppId = m.side === 'home' ? f.away : f.home;
  const slots = FORMATIONS[d.formation];
  const pos = slotXY(slots);
  const squad = w.clubs[w.userClubId].squad.map((id) => w.players[id]);
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);
  const short = (id: string) => name(id).split(' ').slice(-1)[0];
  const changed = JSON.stringify([d.formation, d.mentality, d.pressing, d.starters]) !== JSON.stringify([m.rec.lineup.formation, m.rec.tactics.mentality, m.rec.tactics.pressing, m.rec.lineup.starters.map((x) => x.id)]);
  const myStr = teamStrength(w, w.userClubId), oppStr = teamStrength(w, oppId);
  const oppForm = w.competitions[w.clubs[oppId].league]?.table[oppId]?.form ?? [];
  const oppKey = w.clubs[oppId].squad.map((id) => w.players[id]).filter(available).sort((a, b) => overall(b) - overall(a)).slice(0, 5);

  // 끌어다 놓기: 두 자리 선수 맞바꿈
  const { bind, ghost, over } = usePitchDrag((i) => setSel(sel === i ? null : i), (a, b) => { const id = d.starters[a]; if (id) assign(b, id); }, (i, p) => { setMsg(reshapeDraft(i, p)); setSel(null); });
  const assign = (slotIdx: number, id: string) => {
    const starters = [...d.starters];
    let bench = [...d.bench];
    const old = starters[slotIdx];
    const from = starters.indexOf(id);
    if (from >= 0) starters[from] = old;                       // 선발끼리 자리 맞바꿈
    else if (bench.includes(id)) bench = bench.map((b) => (b === id ? old : b)).filter((b): b is string => !!b);  // 후보와 맞바꿈
    starters[slotIdx] = id;
    updateDraft({ starters, bench });
    setSel(null);
  };

  const seg = <T extends number>(opts: { v: T; label: string }[], value: T, rec: T, on: (v: T) => void) => (
    <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => on(o.v)}
          className={`relative h-8 flex-1 rounded-md text-[13px] transition-colors ${value === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>
          {o.label}
          {rec === o.v && <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-neon" title="AI 추천" />}
        </button>
      ))}
    </div>
  );

  const candidates = sel == null ? [] : [...squad].sort((a, b) => slotRating(b, slots[sel]) - slotRating(a, slots[sel]));

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* 머리: 대진 */}
      <header className="shrink-0 border-b border-line bg-ink-900 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-lo"><span className="hidden sm:inline">경기 전 스쿼드 설정</span> <CompBadge f={f} /> {roundLabel(f)}</div>
            <div className="mt-1 text-[13px] text-mid lg:text-[15px]">{koDate(f.date)} · {m.side === 'home' ? '홈 경기' : '원정 경기'}</div>
          </div>
          <div className="flex items-center justify-center gap-3 lg:gap-6">
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none lg:gap-3"><span className="truncate text-[15px] font-semibold lg:text-[18px]">{clubKo(f.home)}</span><span className="shrink-0"><Crest clubId={f.home} size={34} /></span></div>
            <span className="text-[13px] text-lo">대</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none lg:gap-3"><span className="shrink-0"><Crest clubId={f.away} size={34} /></span><span className="truncate text-[15px] font-semibold lg:text-[18px]">{clubKo(f.away)}</span></div>
          </div>
          <div className="hidden w-[220px] lg:block" />
        </div>
      </header>

      {/* 휴대폰: 피치 → 전술 · 후보 → 상대 분석 순서로 세로 스크롤 */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-y-auto p-3 lg:grid lg:grid-cols-[300px_440px_1fr] lg:gap-6 lg:overflow-hidden lg:p-6">
        {sel != null && <div className="fixed inset-0 z-30 bg-ink-950/60 lg:hidden" onClick={() => setSel(null)} />}
        {/* 왼쪽: 상대 분석 */}
        <div className="order-3 flex shrink-0 flex-col gap-4 lg:order-none lg:min-h-0 lg:shrink lg:overflow-auto">
          <Card title="전력 비교">
            <div className="space-y-3 px-5 py-4">
              {([[w.userClubId, myStr], [oppId, oppStr]] as const).map(([c, v]) => (
                <div key={c} className="flex items-center gap-3">
                  <Crest clubId={c} size={18} />
                  <span className={`w-20 truncate text-[13px] ${c === w.userClubId ? 'text-hi' : 'text-mid'}`}>{clubKo(c)}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${c === w.userClubId ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${Math.min(100, Math.max(4, (v - 50) * 2.2))}%` }} /></div>
                  <span className="tnum w-7 text-right text-[13px] font-medium">{v.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title={`상대 · ${clubKo(oppId)}`}>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between text-[13px]"><span className="text-lo">예상 포메이션</span><span className="tnum font-semibold">{oppPlan.tactics.formation}</span></div>
              <div className="mt-2 flex items-center justify-between text-[13px]"><span className="text-lo">예상 성향</span><span>{MENTALITY.find((x) => x.v === oppPlan.tactics.mentality)?.label}</span></div>
              <div className="mt-3 flex items-center justify-between text-[13px]">
                <span className="text-lo">최근 경기</span>
                <span className="flex gap-1">{oppForm.length ? oppForm.map((r, i) => <ResultDot key={i} r={r} />) : <span className="text-lo">시즌 첫 경기</span>}</span>
              </div>
            </div>
            <div className="border-t border-line">
              {oppKey.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2 text-[13px]">
                  <PosTag pos={p.pos} /><span className="min-w-0 flex-1 truncate">{name(p.id)}</span>
                  <OvrText w={w} p={p} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 가운데: 피치 */}
        <div className="order-1 mx-auto flex w-full max-w-[440px] shrink-0 flex-col lg:order-none lg:min-h-0 lg:shrink">
          <Pitch>
            {slots.map((slot, i) => {
              const id = d.starters[i];
              const p = id ? w.players[id] : null;
              const r = p ? Math.round(slotRating(p, slot)) : 0;
              const recId = m.rec.lineup.formation === d.formation ? m.rec.lineup.starters[i]?.id : undefined;
              const mine = !!id && recId !== undefined && recId !== id;
              const dropHere = ghost && over === i && ghost.i !== i;
              const ring = dropHere ? 'bg-sky/30 ring-2 ring-sky scale-110' : ghost?.i === i ? 'opacity-30 ring-2 ring-neon/40' : sel === i ? 'bg-neon text-ink-950 ring-2 ring-neon' : mine ? 'ring-2 ring-sky' : 'ring-2 ring-neon/70';
              const b = bind(i);
              return (
                <button key={i} {...b}
                  className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center select-none active:cursor-grabbing" style={{ ...b.style, left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                  <div className={`grid h-9 w-9 place-items-center rounded-full bg-ink-950/90 text-[13px] font-semibold transition-colors ${ring}`}>{p?.number ?? ''}</div>
                  <div className="mt-1 max-w-full truncate rounded bg-ink-950/80 px-1.5 text-[12px] font-semibold">{id ? short(id) : '빈 자리'}</div>
                  <div className="text-[11px] text-lo">{slot}{p && <> · <span className={ratingTone(r)}>{r}</span></>}</div>
                </button>
              );
            })}
          </Pitch>
          <DragGhost ghost={ghost} number={ghost && d.starters[ghost.i] ? w.players[d.starters[ghost.i]!].number : null} label={ghost && d.starters[ghost.i] ? short(d.starters[ghost.i]!) : ''} />
          <div className="mt-3 flex items-center gap-4 text-[12px] text-lo">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-neon/70" />AI 추천</span>
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-sky" />직접 바꾼 자리</span>
            <span className="ml-auto">누르면 교체 · 끌어서 자리 바꾸기 · 빈 곳으로 끌면 포지션 변경</span>
          </div>
          {msg && <div className="mt-1 text-[12px] text-sky">{msg}</div>}
        </div>

        {/* 오른쪽: AI 추천 · 전술 · 후보 / 선수 선택 */}
        <div className="order-2 flex shrink-0 flex-col gap-4 lg:order-none lg:min-h-0 lg:shrink">
          {sel != null ? (
            <Card title={`${slots[sel]} 자리에 넣을 선수`} action={<button onClick={() => setSel(null)} className="text-[12px] text-lo hover:text-hi">닫기</button>} className="min-h-0 flex-1 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[78dvh] max-lg:rounded-b-none max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-2xl">
              <div className="h-full overflow-auto">
                {candidates.map((p) => {
                  const r = Math.round(slotRating(p, slots[sel]));
                  const where = d.starters.indexOf(p.id);
                  const ok = available(p);
                  return (
                    <button key={p.id} disabled={!ok} onClick={() => assign(sel, p.id)}
                      className="flex w-full items-center gap-3 px-5 py-2 text-left text-[13px] shadow-[inset_0_-1px_0_var(--color-line)] transition-colors enabled:hover:bg-ink-800 disabled:opacity-40">
                      <PosTag pos={p.pos} />
                      <span className="min-w-0 flex-1 truncate">
                        {name(p.id)}
                        {where >= 0 && <span className="ml-2 text-[12px] text-lo">선발 {slots[where]}</span>}
                        {where < 0 && d.bench.includes(p.id) && <span className="ml-2 text-[12px] text-lo">후보</span>}
                        {!ok && <span className="ml-2 text-[12px] text-red">{p.injury ? '부상' : '징계'}</span>}
                        {p.unhappy && <span className="ml-2 text-[12px] text-amber">불만: {unrestReasons(w, p)[0] ?? '출전 시간'}</span>}
                      </span>
                      <ConditionIcon value={p.condition} />
                      <FitnessBar value={p.fitness} />
                      <span className={`tnum w-7 text-right font-semibold ${ratingTone(r)}`}>{r}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          ) : (
            <>
              <Card title="AI 추천" action={changed ? <button onClick={resetDraft} className="text-[12px] text-lo transition-colors hover:text-hi">AI 추천으로 되돌리기</button> : <span className="text-[12px] text-neon">적용 중</span>}>
                <ul className="space-y-2 px-5 py-4 text-[13px]">
                  {m.rec.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon" /><span className="text-mid">{r}</span></li>)}
                </ul>
              </Card>
              <Card title="포메이션 · 성향">
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {Object.keys(FORMATIONS).map((fm) => (
                      <button key={fm} onClick={() => updateDraft({ formation: fm })}
                        title={`${fm} · 숙련도 ${Math.round(famOf(w.clubs[w.userClubId], fm))}%`} className={`tnum relative h-9 truncate rounded-md px-1 text-[12px] transition-colors ${d.formation === fm ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-900 text-mid ring-1 ring-line hover:text-hi'}`}>
                        {fm}
                        <FamBar v={famOf(w.clubs[w.userClubId], fm)} on={d.formation === fm} />
                        {m.rec.lineup.formation === fm && d.formation !== fm && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-neon" title="AI 추천" />}
                      </button>
                    ))}
                  </div>
                  <div><div className="mb-2 text-[12px] text-lo">공격 · 수비 성향</div>{seg(MENTALITY, d.mentality, m.rec.tactics.mentality, (v) => updateDraft({ mentality: v }))}</div>
                  <div><div className="mb-2 text-[12px] text-lo">압박 강도</div>{seg(PRESSING, d.pressing, m.rec.tactics.pressing, (v) => updateDraft({ pressing: v }))}</div>
                </div>
              </Card>
              <Card title={`후보 ${d.bench.length}명`} className="min-h-0 flex-1">
                <div className="h-full overflow-auto">
                  <BenchEditor squad={squad} starters={d.starters} bench={d.bench} size={matchRules(w.season).benchSize} onChange={(b) => updateDraft({ bench: b })} />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* 아래: 확정 */}
      <footer className="box-content flex h-[64px] shrink-0 items-center gap-2 border-t border-line bg-ink-900/90 px-3 pb-[env(safe-area-inset-bottom)] lg:h-[72px] lg:gap-4 lg:px-6">
        <button onClick={() => { useApp.getState().setTab('home'); leaveMatch(); }} className="flex h-12 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] text-mid ring-1 ring-line transition-colors hover:text-hi lg:px-4" title="경기는 그대로 남습니다 · 계속을 누르면 다시 이 화면"><span className="inline-block rotate-180"><Icon name="arrow" size={16} /></span>홈으로</button>
        <div className="hidden text-[13px] text-mid md:block">{changed ? '직접 수정한 선발로 나갑니다' : 'AI 추천 선발로 나갑니다'}</div>
        <div className="ml-auto flex min-w-0 items-center gap-2 lg:gap-4">
          <span className="hidden text-[12px] text-lo lg:inline"><kbd className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-mid">Space</kbd> 로 확정</span>
          <button onClick={closeMatch} className="h-12 shrink-0 rounded-lg px-3 text-[13px] whitespace-nowrap text-lo ring-1 ring-line transition-colors hover:text-hi lg:px-4"><span className="sm:hidden">결과만</span><span className="hidden sm:inline">결과만 보기</span></button>
          <button onClick={confirmLineup}
            className="flex h-12 min-w-0 items-center justify-center gap-2 rounded-lg bg-neon px-4 text-[15px] font-semibold whitespace-nowrap text-ink-950 transition-colors hover:bg-[#5bff3d] active:scale-[0.98] lg:min-w-[220px] lg:gap-3 lg:px-8">
            <span className="hidden sm:inline">선발 확정 · </span>킥오프 <Icon name="arrow" size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}
