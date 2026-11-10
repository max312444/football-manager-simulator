// 경기 전 스쿼드 설정: AI가 상대에 맞춰 추천한 선발로 시작 → 사용자가 수정 → 선발 확정하면 바로 킥오프
import { useApp } from '../../store/app';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, playerKo } from '../../data/db';
import { FORMATIONS, available } from '../../engine/squad';
import { overall, slotRating } from '../../engine/ratings';
import { recommend, teamStrength } from '../../engine/ai';
import { Crest } from '../components/Crest';
import { Icon } from '../components/Icon';
import { Card, CompBadge, ConditionIcon, FitnessBar, PosTag, ResultDot } from '../components/bits';
import { MENTALITY, PRESSING, Pitch, slotXY } from '../views/TacticsView';
import { koDate, ratingTone, roundLabel } from '../format';

export function MatchPrep() {
  const w = useWorld();
  const { match: m, updateDraft, resetDraft, confirmLineup, closeMatch, leaveMatch } = useGame();
  const [sel, setSel] = useState<number | null>(null);

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
      <header className="shrink-0 border-b border-line bg-ink-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-8 py-5">
          <div>
            <div className="flex items-center gap-2 text-[12px] text-lo">경기 전 스쿼드 설정 <CompBadge f={f} /> {roundLabel(f)}</div>
            <div className="mt-1 text-[15px] text-mid">{koDate(f.date)} · {m.side === 'home' ? '홈 경기' : '원정 경기'}</div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3"><span className="text-[18px] font-semibold">{clubKo(f.home)}</span><Crest clubId={f.home} size={44} /></div>
            <span className="text-[13px] text-lo">대</span>
            <div className="flex items-center gap-3"><Crest clubId={f.away} size={44} /><span className="text-[18px] font-semibold">{clubKo(f.away)}</span></div>
          </div>
          <div className="w-[220px]" />
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-[300px_440px_1fr] gap-6 p-6">
        {/* 왼쪽: 상대 분석 */}
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
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
                  <span className={`tnum font-semibold ${ratingTone(overall(p))}`}>{overall(p)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 가운데: 피치 */}
        <div className="flex min-h-0 flex-col">
          <Pitch>
            {slots.map((slot, i) => {
              const id = d.starters[i];
              const p = id ? w.players[id] : null;
              const r = p ? Math.round(slotRating(p, slot)) : 0;
              const recId = m.rec.lineup.formation === d.formation ? m.rec.lineup.starters[i]?.id : undefined;
              const mine = !!id && recId !== undefined && recId !== id;
              const ring = sel === i ? 'bg-neon text-ink-950 ring-2 ring-neon' : mine ? 'ring-2 ring-sky' : 'ring-2 ring-neon/70';
              return (
                <button key={i} onClick={() => setSel(sel === i ? null : i)}
                  className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                  <div className={`grid h-9 w-9 place-items-center rounded-full bg-ink-950/90 text-[13px] font-semibold transition-colors ${ring}`}>{p?.number ?? ''}</div>
                  <div className="mt-1 max-w-full truncate rounded bg-ink-950/80 px-1.5 text-[12px] font-semibold">{id ? short(id) : '빈 자리'}</div>
                  <div className="text-[11px] text-lo">{slot}{p && <> · <span className={ratingTone(r)}>{r}</span></>}</div>
                </button>
              );
            })}
          </Pitch>
          <div className="mt-3 flex items-center gap-4 text-[12px] text-lo">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-neon/70" />AI 추천</span>
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-sky" />직접 바꾼 자리</span>
            <span className="ml-auto">자리를 눌러 선수 교체</span>
          </div>
        </div>

        {/* 오른쪽: AI 추천 · 전술 · 후보 / 선수 선택 */}
        <div className="flex min-h-0 flex-col gap-4">
          {sel != null ? (
            <Card title={`${slots[sel]} 자리에 넣을 선수`} action={<button onClick={() => setSel(null)} className="text-[12px] text-lo hover:text-hi">닫기</button>} className="min-h-0 flex-1">
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
                        {p.unhappy && <span className="ml-2 text-[12px] text-amber">출전 불만</span>}
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
                  <div className="grid grid-cols-5 gap-2">
                    {Object.keys(FORMATIONS).map((fm) => (
                      <button key={fm} onClick={() => updateDraft({ formation: fm })}
                        className={`tnum relative h-8 rounded-md text-[12px] transition-colors ${d.formation === fm ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-900 text-mid ring-1 ring-line hover:text-hi'}`}>
                        {fm}
                        {m.rec.lineup.formation === fm && d.formation !== fm && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-neon" title="AI 추천" />}
                      </button>
                    ))}
                  </div>
                  <div><div className="mb-2 text-[12px] text-lo">공격 · 수비 성향</div>{seg(MENTALITY, d.mentality, m.rec.tactics.mentality, (v) => updateDraft({ mentality: v }))}</div>
                  <div><div className="mb-2 text-[12px] text-lo">압박 강도</div>{seg(PRESSING, d.pressing, m.rec.tactics.pressing, (v) => updateDraft({ pressing: v }))}</div>
                </div>
              </Card>
              <Card title={`후보 ${d.bench.length}명`} className="min-h-0 flex-1">
                <div className="grid grid-cols-2 gap-x-6 overflow-auto px-5 py-3 text-[13px]">
                  {d.bench.map((id) => { const p = w.players[id]; return (
                    <div key={id} className="flex items-center gap-2 py-1"><span className="w-9 text-[11px] font-semibold text-lo">{p.pos}</span><span className="min-w-0 flex-1 truncate">{name(id)}</span><ConditionIcon value={p.condition} /></div>
                  ); })}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* 아래: 확정 */}
      <footer className="flex h-[72px] shrink-0 items-center gap-4 border-t border-line bg-ink-900/90 px-6">
        <button onClick={() => { useApp.getState().setTab('home'); leaveMatch(); }} className="flex h-12 items-center gap-2 rounded-lg px-4 text-[13px] text-mid ring-1 ring-line transition-colors hover:text-hi" title="경기는 그대로 남습니다 · 계속을 누르면 다시 이 화면"><span className="inline-block rotate-180"><Icon name="arrow" size={16} /></span>홈으로</button>
        <div className="text-[13px] text-mid">{changed ? '직접 수정한 선발로 나갑니다' : 'AI 추천 선발로 나갑니다'}</div>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-[12px] text-lo lg:inline"><kbd className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-mid">Space</kbd> 로 확정</span>
          <button onClick={closeMatch} className="h-12 rounded-lg px-4 text-[13px] text-lo ring-1 ring-line transition-colors hover:text-hi">결과만 보기</button>
          <button onClick={confirmLineup}
            className="flex h-12 min-w-[220px] items-center justify-center gap-3 rounded-lg bg-neon px-8 text-[15px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d] active:scale-[0.98]">
            선발 확정 · 킥오프 <Icon name="arrow" size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}
