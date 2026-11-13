import { useSettings } from '../../store/settings';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, compKo, playerKo } from '../../data/db';
import { SEGMENTS } from '../../engine/match';
import { FORMATIONS } from '../../engine/squad';
import type { FeedLine } from '../../engine/commentary';
import type { Side } from '../../engine/types';
import { clubColor, Crest } from '../components/Crest';
import { Icon } from '../components/Icon';
import { CompBadge, PosTag } from '../components/bits';
import { MENTALITY, PRESSING } from '../views/TacticsView';
import { MatchPrep } from './MatchPrep';
import { LivePitch } from '../components/LivePitch';
import { FinalIntro, isFinal, ShootoutOverlay, TrophyOverlay } from '../components/BigMoments';
import { roundLabel } from '../format';

const SPEEDS = [{ label: '보통', ms: 1100 }, { label: '빠르게', ms: 450 }, { label: '매우 빠르게', ms: 150 }];

export function MatchScreen() {
  const w = useWorld();
  const { match: m, stepMatch, changeTactics, changeFormation, sub, setAutoSub, closeMatch, liveSwap, liveReshape } = useGame();
  const [pitchMsg, setPitchMsg] = useState('');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(useSettings.getState().s.matchSpeed);   // 설정: 기본 경기 속도
  const [subOut, setSubOut] = useState<string | null>(null);
  const [panel, setPanel] = useState<'feed' | 'events'>('feed');
  // 하프타임: 직접 지휘하는 경기는 45분에 한 번 멈춘다 (교체 · 전술 · 포메이션을 바꾸고 '후반 시작')
  const [half, setHalf] = useState<'before' | 'now' | 'done'>('before');
  const seg = m?.state?.segment ?? 0;
  useEffect(() => {
    if (half === 'before' && seg >= 9 && m?.phase === 'live') { setPlaying(false); setHalf('now'); }
  }, [seg, half, m?.phase]);
  const resume = () => { setHalf('done'); setPlaying(true); };

  // 큰 경기 연출: 결승 시작 · 승부차기 · 우승
  const [moment, setMoment] = useState<'intro' | 'pens' | 'trophy' | 'league' | null>(null);
  const shown = useRef({ intro: false, end: false });
  useEffect(() => { shown.current = { intro: false, end: false }; setMoment(null); }, [m?.fixture.id]);   // 경기마다 새로
  const final = !!m && isFinal(m.fixture);
  const sumNow = m?.state?.summary;
  const winSide: Side | null = !sumNow ? null : sumNow.homeGoals > sumNow.awayGoals ? 'home' : sumNow.homeGoals < sumNow.awayGoals ? 'away' : sumNow.pens ?? null;
  const userWon = !!m && winSide === m.side;
  useEffect(() => {
    if (m?.phase === 'live' && seg === 0 && final && !shown.current.intro) { shown.current.intro = true; setPlaying(false); setMoment('intro'); }
    if (m?.phase === 'full' && !shown.current.end) {
      shown.current.end = true;
      if (sumNow?.shootout) setMoment('pens');
      else if (final && userWon) setMoment('trophy');
      else if (m.clinch != null) setMoment('league');
    }
  }, [m?.phase, seg, final, userWon, sumNow?.shootout]);
  const live = m?.phase === 'live';
  useEffect(() => {
    if (!live || !playing) return;
    const t = setInterval(() => stepMatch(1), SPEEDS[speed].ms);
    return () => clearInterval(t);
  }, [live, playing, speed, stepMatch]);

  if (!m) return null;
  // 경기 전: 스쿼드 설정 화면 (선발 확정하면 바로 킥오프)
  if (m.phase === 'squad' || !m.state) return <MatchPrep />;
  const s = m.state, sum = s.summary;
  const me = s[m.side], opp = s[m.side === 'home' ? 'away' : 'home'];
  const minute = Math.min(90, s.segment * 5);
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);

  // 사건 목록 (골·카드·부상·교체)
  type Ev = { minute: number; side: Side; kind: 'goal' | 'yellow' | 'red' | 'injury' | 'sub'; text: string; sub?: string };
  const evs: Ev[] = [
    ...sum.goals.map((g) => ({ minute: g.minute, side: g.side, kind: 'goal' as const, text: name(g.scorer) + (g.kind === 'pen' ? ' (PK)' : ''), sub: [g.kind === 'set' ? '세트피스' : '', g.assist ? `도움 ${name(g.assist)}` : ''].filter(Boolean).join(' · ') || undefined })),
    ...sum.cards.map((c) => ({ minute: c.minute, side: c.side, kind: c.red ? 'red' as const : 'yellow' as const, text: name(c.player) })),
    ...sum.injuries.map((c) => ({ minute: c.minute, side: c.side, kind: 'injury' as const, text: name(c.player), sub: w.players[c.player].injury?.label })),
    ...(['home', 'away'] as Side[]).flatMap((side) => Object.entries(s[side].played).filter(([, p]) => p.from > 0)
      .map(([id, p]) => ({ minute: p.from, side, kind: 'sub' as const, text: name(id), sub: '교체 투입' }))),
  ].sort((a, b) => b.minute - a.minute);
  const goalsSoFar = { home: sum.goals.filter((g) => g.side === 'home').length, away: sum.goals.filter((g) => g.side === 'away').length };
  const xg = { home: s.home.xg, away: s.away.xg };
  const poss = s.segment ? Math.round((s.home.possSum / s.segment) * 100) : 50;


  const momentEl = moment === 'intro' ? <FinalIntro home={s.home.clubId} away={s.away.clubId} title={compKo(m.fixture.league)} onDone={() => { setMoment(null); setPlaying(true); }} />
    : moment === 'pens' && sum.shootout ? <ShootoutOverlay seq={sum.shootout} home={s.home.clubId} away={s.away.clubId} mySide={m.side} onDone={() => setMoment(final && userWon ? 'trophy' : null)} />
    : moment === 'trophy' ? <TrophyOverlay club={w.userClubId} title={compKo(m.fixture.league)} onDone={() => setMoment(null)} />
    : moment === 'league' ? <TrophyOverlay club={w.userClubId} title={compKo(w.clubs[w.userClubId].league)} headline="리그 우승 확정!" sub={m.clinch ? `${m.clinch}경기를 남기고 우승` : '마지막 경기에서 우승'} onDone={() => setMoment(null)} />
    : null;

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {momentEl}
      {/* 점수판 */}
      <header className="relative shrink-0 overflow-hidden border-b border-line bg-ink-900 pt-[env(safe-area-inset-top)]">
        <div className="relative mx-auto flex max-w-[1100px] items-center justify-between gap-2 px-3 py-3 lg:px-8 lg:py-5">
          <TeamHead club={s.home.clubId} mine={m.side === 'home'} align="right" />
          <div className="flex shrink-0 flex-col items-center">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-lo"><span className="hidden sm:inline"><CompBadge f={m.fixture} /></span> {roundLabel(m.fixture)}</div>
            <div className="led mt-2 text-[40px] leading-none font-medium whitespace-nowrap text-neon lg:text-[56px]">
              {goalsSoFar.home}<span className="mx-3 text-lo">:</span>{goalsSoFar.away}
            </div>
            <div className={`led mt-2 rounded-md px-2.5 py-0.5 text-[13px] font-semibold ${m.phase === 'live' ? 'bg-neon/15 text-neon' : 'bg-ink-700 text-mid'}`}>
              {m.phase === 'full' ? (sum.pens ? `경기 종료 · 승부차기 ${clubKo(sum.pens === 'home' ? s.home.clubId : s.away.clubId)} 승` : '경기 종료') : `${minute}'`}
            </div>
          </div>
          <TeamHead club={s.away.clubId} mine={m.side === 'away'} align="left" />
        </div>
        <div className="h-1 w-full bg-ink-800"><div className="h-full origin-left bg-neon transition-transform duration-500 ease-[var(--ease-out-quart)]" style={{ transform: `scaleX(${s.segment / SEGMENTS})` }} /></div>
      </header>

      {/* 휴대폰: 통계 · 전술 → 경기 기록 → 내 팀 순서로 세로 스크롤, 진행 버튼은 아래 고정 */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 pb-[calc(84px+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[360px_1fr] lg:gap-5 lg:overflow-hidden lg:p-5">
        {/* 상대 선수 / 경기 기록 */}
        <section className="panel order-2 flex shrink-0 flex-col max-lg:max-h-[55dvh] lg:order-none lg:min-h-0 lg:shrink">
          <div className="flex h-11 shrink-0 items-center gap-1 px-3 shadow-[inset_0_-1px_0_var(--color-line)]">
            {([['feed', '문자 중계'], ['events', '주요 장면']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setPanel(k)} className={`h-8 rounded-md px-3 text-[13px] ${panel === k ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{label}</button>
            ))}
          </div>
          {panel === 'feed' && <Feed lines={s.cm?.feed ?? []} clubs={{ home: s.home.clubId, away: s.away.clubId }} />}
          <div className={`min-h-0 flex-1 overflow-auto px-2 py-2 ${panel === 'feed' ? 'hidden' : ''}`}>
            {evs.length === 0 && <div className="px-3 py-4 text-[13px] text-lo">아직 큰 사건이 없습니다</div>}
            {evs.map((e, i) => (
              <div key={i} className={`mb-1 flex items-center gap-3 rounded-md py-2 pr-3 pl-3 text-[13px] ${e.kind === 'goal' ? 'bg-ink-800' : ''}`}
                style={{ boxShadow: `inset 4px 0 0 ${clubColor(s[e.side].clubId)}` }}>
                <span className="tnum w-8 text-right text-lo">{e.minute}'</span>
                <EventIcon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${e.kind === 'goal' ? 'font-semibold' : ''}`}>{e.text}</div>
                  {e.sub && <div className="truncate text-[11px] text-lo">{e.sub}</div>}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold" style={{ color: clubColor(s[e.side].clubId) }}>
                  <Crest clubId={s[e.side].clubId} size={20} /><span className="max-w-[90px] truncate">{clubKo(s[e.side].clubId)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 가운데: 통계 + 조작 */}
        <section className="order-1 flex shrink-0 flex-col gap-4 lg:order-none lg:min-h-0 lg:shrink lg:gap-5">
          <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-5 lg:overflow-auto">
          <div className="panel grid gap-x-8 px-6 py-4 sm:grid-cols-2">
            {([
              ['점유율', poss, 100 - poss, (v: number) => `${v}%`],
              ['슈팅', s.home.shots, s.away.shots, String],
              ['유효 슈팅', s.home.onTarget, s.away.onTarget, String],
              ['기대 득점', xg.home, xg.away, (v: number) => v.toFixed(2)],
            ] as const).map(([k, h, a, fmt]) => (
              <div key={k} className="py-1.5">
                <div className="mb-1 flex justify-between text-[13px]"><span className="tnum font-semibold">{fmt(h)}</span><span className="text-lo">{k}</span><span className="tnum font-semibold">{fmt(a)}</span></div>
                <div className="flex h-1.5 gap-1">
                  <div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`ml-auto h-full rounded-full ${m.side === 'home' ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${(h / (h + a || 1)) * 100}%` }} /></div>
                  <div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${m.side === 'away' ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${(a / (h + a || 1)) * 100}%` }} /></div>
                </div>
              </div>
            ))}
          </div>

          {m.phase === 'full' && sum.pom ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <PomCard kind="pom" id={sum.pom} rating={sum.ratings[sum.pom]} club={w.players[sum.pom].clubId} name={name(sum.pom)} pos={w.players[sum.pom].pos} goals={sum.goals} />
              {sum.worst && <PomCard kind="worst" id={sum.worst} rating={sum.ratings[sum.worst]} club={w.players[sum.worst].clubId} name={name(sum.worst)} pos={w.players[sum.worst].pos} goals={sum.goals} />}
            </div>
          ) : (
          <>
          {half === 'now' && m.phase === 'live' && (
            <div className="panel flex animate-[fade_0.3s_ease-out] flex-wrap items-center gap-x-4 gap-y-2 border-neon/40 px-5 py-3 ring-1 ring-neon/30">
              <span className="text-[15px] font-semibold text-neon">하프타임</span>
              <span className="tnum text-[13px] text-mid">{goalsSoFar.home} : {goalsSoFar.away}</span>
              <span className="hidden min-w-0 flex-1 text-[12px] text-lo sm:inline">교체 · 자리 · 포메이션 · 성향을 정리하고 후반을 시작하세요 (남은 교체 {me.maxSubs - me.subsUsed}명)</span><span className="flex-1 sm:hidden" />
              <button onClick={resume} className="flex h-10 items-center gap-2 rounded-lg bg-neon px-5 text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d]">후반 시작 <Icon name="arrow" size={16} /></button>
            </div>
          )}
          <div className="panel px-5 py-5">
            {m.phase !== 'full' && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-lo">
                  <span className="font-semibold text-mid">{clubKo(me.clubId)}</span>
                  <select value={me.tactics.formation} onChange={(e) => { changeFormation(e.target.value); setPitchMsg(''); }}
                    className="h-8 w-[130px] rounded-lg border border-line bg-ink-900 px-2 text-[13px] text-hi" title="고르면 뛰는 선수들을 새 자리에 맞게 다시 배치합니다">
                    {Object.keys(FORMATIONS).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <span className="ml-auto flex items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-1.5" title="켜면 점수 · 시간 · 체력을 보고 AI가 알아서 교체합니다 (하프타임 교체는 직접)">
                      <input type="checkbox" checked={me.autoSub !== false} onChange={(e) => setAutoSub(e.target.checked)} className="accent-[#39ff14]" />자동 교체
                    </label>
                    <span className="tnum">교체 {me.subsUsed}/{me.maxSubs}</span>
                    <span className="hidden sm:inline">상대 {opp.tactics.formation}</span>
                  </span>
                </div>
                <div>
                  <LivePitch team={me} ratings={sum.ratings} editable={m.phase === 'live'} selected={subOut} onSelect={setSubOut}
                    onSub={(o, i) => { setSubOut(null); setPitchMsg(sub(o, i) ? '' : '이 자리에 맞지 않는 선수입니다 (주 · 보조 · 가까운 포지션만)'); }}
                    onSwap={(a, b) => setPitchMsg(liveSwap(a, b))} onReshape={(i, p) => { setSubOut(null); setPitchMsg(liveReshape(i, p)); }}
                    side={<>
                      <div>
                        <div className="mb-1.5 text-[12px] text-lo">공격 · 수비 성향</div>
                        <div className="grid grid-cols-5 gap-1 rounded-lg bg-ink-950 p-1">
                          {MENTALITY.map((o) => (
                            <button key={o.v} onClick={() => changeTactics({ mentality: o.v })}
                              className={`h-10 rounded-md px-0.5 text-[12px] leading-tight ${me.tactics.mentality === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-[12px] text-lo">압박 강도</div>
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-950 p-1">
                          {PRESSING.map((o) => (
                            <button key={o.v} onClick={() => changeTactics({ pressing: o.v })}
                              className={`h-9 rounded-md text-[12px] ${me.tactics.pressing === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                    </>} />
                  {pitchMsg && <div className="mt-1.5 text-[12px] text-sky">{pitchMsg}</div>}
                </div>
              </>
            )}
          </div>
          </>
          )}
          </div>

          <div className="mt-auto flex items-center gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:border-t max-lg:border-line max-lg:bg-ink-900/95 max-lg:px-3 max-lg:pt-2 max-lg:pb-[max(8px,env(safe-area-inset-bottom))] max-lg:backdrop-blur">
            {m.phase === 'live' && (
              <>
                <button onClick={() => (half === 'now' ? resume() : setPlaying((p) => !p))} className={`h-12 w-20 shrink-0 rounded-lg text-[14px] font-semibold lg:w-28 ${half === 'now' ? 'bg-neon text-ink-950' : 'bg-ink-700 hover:bg-ink-750'}`}>{half === 'now' ? '후반 시작' : playing ? '일시정지' : '재개'}</button>
                <div className="flex h-12 flex-1 gap-1 rounded-lg bg-ink-900 p-1">
                  {SPEEDS.map((sp, i) => (
                    <button key={sp.label} onClick={() => setSpeed(i)} className={`flex-1 rounded-md text-[12px] whitespace-nowrap lg:text-[13px] ${speed === i ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{sp.label}</button>
                  ))}
                </div>
              </>
            )}
            {m.phase !== 'full' ? (
              <button onClick={closeMatch} className="h-12 shrink-0 rounded-lg px-3 text-[13px] whitespace-nowrap text-lo ring-1 ring-line hover:text-hi lg:px-4"><span className="sm:hidden">결과만</span><span className="hidden sm:inline">결과만 보기</span></button>
            ) : (
              <button onClick={closeMatch} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-neon text-[15px] font-semibold text-ink-950 hover:bg-[#5bff3d]">
                계속 <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

/** 중계 줄 앞 그림: 골 · 페널티 실축 · 경고 · 퇴장 */
const FEED_ICON: Record<string, string> = { goal: '⚽', penMiss: '⚽', yellow: '🟨', red: '🟥' };

/** 문자 중계: 최근 줄이 위 · 캐스터는 장면, 해설은 의견 (이름 토큰을 화면 이름으로) */
const TEAM_KIND = new Set(['goal', 'penMiss', 'yellow', 'red']);
const TEAM_HEAD: Record<string, string> = { goal: '골!', penMiss: 'PK 실축', yellow: '경고', red: '퇴장' };

function Feed({ lines, clubs }: { lines: FeedLine[]; clubs: Record<Side, string> }) {
  const w = useWorld();
  const fill = (t: string) => t.replace(/\{p:([^}]+)\}/g, (_, id) => playerKo(id, w.players[id]?.name ?? id)).replace(/\{c:([^}]+)\}/g, (_, id) => clubKo(id));
  const list = [...lines].reverse();
  // 새 줄이 생기면 맨 위(최신)로
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [lines.length]);
  return (
    <div ref={box} className="min-h-0 flex-1 overflow-auto px-3 py-2 [overflow-anchor:none]">
      {!list.length && <div className="px-2 py-4 text-[13px] text-lo">곧 경기가 시작됩니다</div>}
      {list.map((l, i) => (
        <div key={lines.length - i} className={`flex gap-3 border-b border-line/60 px-2 py-2.5 text-[13px] leading-relaxed last:border-0 ${i === 0 ? 'animate-[fade_0.4s_ease-out]' : ''} ${l.kind === 'goal' ? 'rounded-md bg-ink-800' : ''}`}
          style={l.side && TEAM_KIND.has(l.kind) ? { boxShadow: `inset 4px 0 0 ${clubColor(clubs[l.side])}` } : undefined}>
          <span className="tnum w-8 shrink-0 pt-px text-right text-lo">{l.minute}'</span>
          <div className="min-w-0 flex-1">
            {l.side && TEAM_KIND.has(l.kind) && (
              <div className={`mb-1 flex items-center gap-1.5 font-semibold ${l.kind === 'goal' ? 'text-[15px]' : 'text-[12px]'}`} style={{ color: clubColor(clubs[l.side]) }}>
                <Crest clubId={clubs[l.side]} size={l.kind === 'goal' ? 22 : 16} />{clubKo(clubs[l.side])}
                <span className={l.kind === 'goal' ? 'text-neon' : l.kind === 'red' ? 'text-red' : l.kind === 'yellow' ? 'text-amber' : 'text-mid'}>{TEAM_HEAD[l.kind]}</span>
              </div>
            )}
            {l.voice === 'pundit' && <span className="mr-1.5 rounded bg-sky/15 px-1.5 py-px text-[11px] font-semibold text-sky">해설</span>}
            {FEED_ICON[l.kind] && <span className="mr-1.5" aria-hidden>{FEED_ICON[l.kind]}</span>}
            <span className={`${l.big ? 'font-semibold text-hi' : l.voice === 'pundit' ? 'text-mid' : 'text-hi'}`}>{fill(l.text)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamHead({ club, mine, align }: { club: string; mine: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center lg:w-[320px] lg:flex-none lg:gap-4 ${align === 'right' ? 'lg:flex-row-reverse lg:text-right' : 'lg:flex-row lg:text-left'}`}>
      <Crest clubId={club} size={40} />
      <div className="min-w-0 max-w-full">
        <div className="truncate text-[14px] font-semibold lg:text-[20px]">{clubKo(club)}</div>
        {mine && <div className="text-[11px] font-semibold text-neon">내 구단</div>}
      </div>
    </div>
  );
}


function EventIcon({ kind }: { kind: 'goal' | 'yellow' | 'red' | 'injury' | 'sub' }) {
  if (kind === 'goal') return <BallIcon />;
  if (kind === 'yellow') return <span className="mx-1.5 inline-block h-4 w-3 rounded-[2px] bg-amber" />;
  if (kind === 'red') return <span className="mx-1.5 inline-block h-4 w-3 rounded-[2px] bg-red" />;
  if (kind === 'injury') return <span className="grid h-5 w-5 place-items-center rounded-full bg-red/20 text-[12px] font-semibold text-red">+</span>;
  return <span className="grid h-5 w-5 place-items-center text-sky"><Icon name="transfers" size={15} /></span>;
}

/** 골 표시용 축구공 */
function BallIcon() {
  return (
    <svg width={20} height={20} viewBox="-12 -12 24 24" aria-label="골" className="shrink-0">
      <circle r={11} fill="#f4f4f2" stroke="#0d100e" strokeWidth={0.8} />
      <path d="M0 -4.2 L4 -1.3 L2.5 3.4 L-2.5 3.4 L-4 -1.3 Z" fill="#141414" />
      <path d="M0 -4.2 V-8.5 M4 -1.3 L8.2 -2.6 M2.5 3.4 L5 7.2 M-2.5 3.4 L-5 7.2 M-4 -1.3 L-8.2 -2.6" stroke="#141414" strokeWidth={0.9} fill="none" />
      <g fill="#141414">
        <path d="M-2.6 -10.6 L2.6 -10.6 L0 -8.5 Z" /><path d="M10.4 -1 L9 3.6 L8.2 -2.6 Z" /><path d="M-10.4 -1 L-9 3.6 L-8.2 -2.6 Z" />
        <path d="M3.2 10.4 L7.5 7.6 L5 7.2 Z" /><path d="M-3.2 10.4 L-7.5 7.6 L-5 7.2 Z" />
      </g>
    </svg>
  );
}

/** 경기 종료 후 POM · 워스트 카드 */
function PomCard({ kind, rating, club, name, pos, goals, id }: { kind: 'pom' | 'worst'; id: string; rating: number; club: string | null; name: string; pos: import('../../data/types').Position; goals: { scorer: string; assist?: string }[] }) {
  const pom = kind === 'pom';
  const g = goals.filter((x) => x.scorer === id).length, a = goals.filter((x) => x.assist === id).length;
  return (
    <div className={`panel relative overflow-hidden px-5 py-4 ${pom ? 'ring-1 ring-neon/40' : ''}`} style={{ animation: 'fade .4s ease-out both' }}>
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-semibold ${pom ? 'text-neon' : 'text-red'}`}>{pom ? '경기 최우수 선수' : '오늘의 워스트'}</span>
        {club && <Crest clubId={club} size={18} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold">{name}</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-lo"><PosTag pos={pos} />{g ? `${g}골` : ''}{g && a ? ' · ' : ''}{a ? `${a}도움` : ''}</div>
        </div>
        <div className={`tnum text-[32px] leading-none font-semibold ${pom ? 'text-neon' : 'text-red'}`}>{rating.toFixed(1)}</div>
      </div>
      <div className="mt-3 text-[11px] text-lo">{pom ? '사기 상승 · 시즌 POM 기록' : '사기 소폭 하락'}</div>
    </div>
  );
}
