import type { PlayerState, World } from '../../engine/types';
import { nextUserFixture } from '../../engine/world';
import { OvrText } from '../components/Scout';
import { overall } from '../../engine/ratings';
import { sortTable } from '../../engine/standings';
import { levelOf } from '../../engine/pyramid';
import { ageOn } from '../../engine/condition';
import { clubKo, playerKo } from '../../data/db';
import { posGroup } from '../../data/rating';
import { Crest } from '../components/Crest';
import { COMP_TONE, Card, CompBadge, PosTag, ResultDot, compKind } from '../components/bits';
import { money, ratingTone, roundLabel } from '../format';
import { useWorld } from '../hooks';
import { useApp } from '../../store/app';
import { LeagueTable } from './TableView';
import { describe } from './InboxView';
import { resultFor, userFixtures } from './ScheduleView';

/** 주전 11명 평균 능력 */
export const strength = (w: World, club: string) => {
  const top = w.clubs[club].squad.map((id) => overall(w.players[id])).sort((a, b) => b - a).slice(0, 11);
  return Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length));
};
const formOf = (w: World, club: string) => w.competitions[w.clubs[club].league].table[club]?.form ?? [];

/** 주전 전력 순위로 정하는 이사회 목표 (게임 규칙) */
export function objective(rank: number, n: number, level = 1) {
  if (level >= 2) {
    if (rank <= 2) return { goal: '1부 승격', detail: '자동 승격권 (2위 이내)', target: 2 };
    if (rank <= 6) return { goal: '승격 플레이오프', detail: '6위 이내', target: 6 };
    if (rank <= n - 6) return { goal: '중위권 안착', detail: `${Math.ceil(n / 2)}위 이내`, target: Math.ceil(n / 2) };
    return { goal: '2부 리그 잔류', detail: `${n - 3}위 이내`, target: n - 3 };
  }
  if (rank === 1) return { goal: '리그 우승', detail: '우승 후보로 평가받고 있습니다', target: 1 };
  if (rank <= 4) return { goal: '챔피언스리그 진출', detail: '4위 이내', target: 4 };
  if (rank <= 7) return { goal: '유럽 대항전 진출', detail: '7위 이내', target: 7 };
  if (rank <= n - 6) return { goal: '중위권 안착', detail: `${Math.ceil(n / 2)}위 이내`, target: Math.ceil(n / 2) };
  return { goal: '1부 리그 잔류', detail: `${n - 3}위 이내`, target: n - 3 };
}

const ActionLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="text-[12px] text-lo transition-colors hover:text-hi">{children}</button>
);
const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-5 py-3 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)] last:shadow-none">{children}</div>
);

export function HomeView() {
  const w = useWorld();
  const setTab = useApp((s) => s.setTab);
  const club = w.clubs[w.userClubId];
  const comp = w.competitions[club.league];
  const started = Object.values(comp.table).some((r) => r.p > 0);
  const next = nextUserFixture(w);
  const all = userFixtures(w);
  const played = all.filter((f) => f.result).slice(-5).reverse();
  const upcoming = all.filter((f) => !f.result).slice(next ? 1 : 0, (next ? 1 : 0) + 5);
  const table = sortTable(comp.table);
  const pos = table.findIndex((r) => r.club === club.id) + 1;
  const row = comp.table[club.id];
  const squad = club.squad.map((id) => w.players[id]);
  const key = [...squad].sort((a, b) => overall(b) - overall(a)).slice(0, 6);
  const news = [...w.inbox].reverse().slice(0, 5);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-6">
        {next ? <NextMatch w={w} home={next.home} away={next.away} date={next.date} round={roundLabel(next)} fx={next} />
          : <section className="panel px-8 py-6 text-[15px]">시즌이 끝났습니다 · 최종 {pos}위 · 승점 {row.pts}</section>}

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <div className="flex flex-col gap-6">
            <Card title={started ? `리그 순위 · ${pos}위` : '리그 순위 · 개막 전'} action={<ActionLink onClick={() => setTab('table')}>전체 보기</ActionLink>}>
              <LeagueTable league={club.league} compact />
            </Card>
            {news.length > 0 && (
              <Card title="최근 소식" action={<ActionLink onClick={() => setTab('inbox')}>받은편지함</ActionLink>}>
                {news.map((e, i) => { const d = describe(e, w); return (
                  <Row key={i}>
                    <span className={`w-8 text-[12px] font-medium ${d.tone}`}>{d.tag}</span>
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="tnum text-[12px] text-lo">{e.date.slice(5).replace('-', '.')}</span>
                  </Row>
                ); })}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <SeasonGoal w={w} pos={started ? pos : null} />
            <SquadStatus w={w} squad={squad} onOpen={() => setTab('squad')} />
          </div>

          <div className="flex flex-col gap-6">
            <Card title="다가오는 일정" action={<ActionLink onClick={() => setTab('schedule')}>전체 일정</ActionLink>}>
              {upcoming.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">남은 경기가 없습니다</div> : upcoming.map((f) => {
                const home = f.home === w.userClubId; const opp = home ? f.away : f.home;
                return (
                  <Row key={f.id}>
                    <span className="tnum w-11 shrink-0 text-[12px] text-lo">{f.date.slice(5).replace('-', '.')}</span>
                    <span className={`w-8 shrink-0 text-[12px] ${home ? 'text-hi' : 'text-lo'}`}>{home ? '홈' : '원정'}</span>
                    <CompBadge f={f} short className="w-12 text-center" />
                    <Crest clubId={opp} size={18} />
                    <span className="min-w-0 flex-1 truncate">{clubKo(opp)}</span>
                    <span className={`tnum text-[12px] ${ratingTone(strength(w, opp))}`}>{strength(w, opp)}</span>
                  </Row>
                );
              })}
            </Card>
            {played.length > 0 && (
              <Card title="최근 경기">
                {played.map((f) => { const home = f.home === w.userClubId; const opp = home ? f.away : f.home; return (
                  <Row key={f.id}>
                    <ResultDot r={resultFor(f, w.userClubId)!} />
                    <span className="w-8 shrink-0 text-[12px] text-lo">{home ? '홈' : '원정'}</span>
                    <CompBadge f={f} short className="w-12 text-center" />
                    <Crest clubId={opp} size={18} /><span className="min-w-0 flex-1 truncate">{clubKo(opp)}</span>
                    {f.result!.pom && <span className="hidden max-w-[120px] truncate text-[11px] text-lo sm:inline" title="경기 최우수 선수">POM {playerKo(f.result!.pom, w.players[f.result!.pom]?.name ?? '')}</span>}
                    <span className="tnum font-medium">{home ? `${f.result!.homeGoals}-${f.result!.awayGoals}` : `${f.result!.awayGoals}-${f.result!.homeGoals}`}</span>
                  </Row>
                ); })}
              </Card>
            )}
            <Finance w={w} squad={squad} />
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[2fr_1fr]">
          <Card title="주요 선수" action={<ActionLink onClick={() => setTab('squad')}>선수단</ActionLink>}>
            <div className="grid grid-cols-1 md:grid-cols-2">
              {key.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-4 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)]">
                  <PosTag pos={p.pos} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{playerKo(p.id, p.name)}</div>
                    <div className="text-[12px] text-lo">{ageOn(p.birth, w.date)}세 · {p.stats.apps + p.stats.subApps}경기 · {p.stats.goals}골 · {p.stats.assists}도움</div>
                  </div>
                  <span className={`tnum text-[16px] font-semibold ${ratingTone(overall(p))}`}>{overall(p)}</span>
                </div>
              ))}
            </div>
          </Card>
          <LeagueLeaders w={w} league={club.league} started={started} />
        </div>
      </div>
    </div>
  );
}

function NextMatch({ w, home, away, date, round, fx }: { w: World; home: string; away: string; date: string; round: string; fx: { league: string; stage?: string } }) {
  const k = compKind(fx);
  const mine = w.userClubId;
  const sh = strength(w, home), sa = strength(w, away);
  const d = new Date(date + 'T00:00:00');
  return (
    <section className="panel relative grid grid-cols-1 items-center gap-6 overflow-hidden px-8 py-6 lg:grid-cols-[200px_1fr_240px]">
      <span className={`absolute top-0 bottom-0 left-0 w-1 ${COMP_TONE[k].bar}`} />
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-lo">다음 경기 <CompBadge f={fx} /> <span className={k === 'league' ? '' : COMP_TONE[k].text}>{round}</span></div>
        <div className="mt-2 text-[22px] font-semibold whitespace-nowrap">{d.getMonth() + 1}월 {d.getDate()}일 <span className="font-normal text-mid">{'일월화수목금토'[d.getDay()]}요일</span></div>
        <div className="mt-1 text-[13px] text-mid">{home === mine ? '홈 경기' : '원정 경기'}</div>
      </div>
      <div className="flex items-center justify-center gap-6">
        <Side club={home} w={w} align="right" />
        <span className="text-[13px] text-lo">대</span>
        <Side club={away} w={w} align="left" />
      </div>
      <div>
        <div className="mb-3 text-[12px] text-lo">주전 전력 비교</div>
        {([[home, sh], [away, sa]] as const).map(([c, v]) => (
          <div key={c} className="mb-2 flex items-center gap-3 last:mb-0">
            <span className={`w-20 truncate text-[12px] ${c === mine ? 'text-hi' : 'text-mid'}`}>{clubKo(c)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
              <div className={`h-full rounded-full ${c === mine ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${Math.min(100, Math.max(4, (v - 50) * 2.2))}%` }} />
            </div>
            <span className="tnum w-6 text-right text-[13px] font-medium">{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Side({ club, w, align }: { club: string; w: World; align: 'left' | 'right' }) {
  const form = formOf(w, club);
  return (
    <div className={`flex items-center gap-4 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <Crest clubId={club} size={56} />
      <div>
        <div className="text-[18px] font-semibold whitespace-nowrap">{clubKo(club)}</div>
        <div className={`mt-2 flex gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {form.length ? form.map((f, i) => <ResultDot key={i} r={f} />) : <span className="text-[12px] whitespace-nowrap text-lo">시즌 첫 경기</span>}
        </div>
      </div>
    </div>
  );
}

function SeasonGoal({ w, pos }: { w: World; pos: number | null }) {
  const club = w.clubs[w.userClubId];
  const ids = Object.keys(w.competitions[club.league].table);
  const ranked = [...ids].sort((a, b) => strength(w, b) - strength(w, a));
  const rank = ranked.indexOf(club.id) + 1;
  const o = objective(rank, ids.length, levelOf(club.league));
  const onTrack = pos == null ? null : pos <= o.target;
  return (
    <Card title="시즌 목표">
      <div className="px-5 py-5">
        <div className="text-[12px] text-lo">이사회 기대</div>
        <div className="mt-1 text-[20px] font-semibold">{o.goal}</div>
        <div className="text-[13px] text-mid">{o.detail}</div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[12px] text-lo">전력 순위</div>
            <div className="tnum mt-1 text-[18px] font-semibold">{rank}<span className="text-[13px] font-normal text-lo"> / {ids.length}</span></div>
          </div>
          <div>
            <div className="text-[12px] text-lo">현재 순위</div>
            <div className={`tnum mt-1 text-[18px] font-semibold ${onTrack == null ? '' : onTrack ? 'text-neon' : 'text-amber'}`}>
              {pos ?? '–'}{pos != null && <span className="text-[13px] font-normal text-lo"> {onTrack ? '목표권' : '목표 밖'}</span>}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SquadStatus({ w, squad, onOpen }: { w: World; squad: PlayerState[]; onOpen: () => void }) {
  const groups = [['GK', '골키퍼'], ['DF', '수비수'], ['MF', '미드필더'], ['FW', '공격수']] as const;
  const count = (g: string) => squad.filter((p) => posGroup(p.pos) === g).length;
  const max = Math.max(...groups.map(([g]) => count(g)));
  const injured = squad.filter((p) => p.injury).length, suspended = squad.filter((p) => p.suspension > 0).length;
  const avgAge = squad.reduce((s, p) => s + ageOn(p.birth, w.date), 0) / squad.length;
  const fit = squad.reduce((s, p) => s + p.fitness, 0) / squad.length;
  return (
    <Card title="선수단 현황" action={<ActionLink onClick={onOpen}>자세히</ActionLink>}>
      <div className="grid grid-cols-3 gap-4 px-5 pt-5">
        {([['인원', `${squad.length}명`], ['평균 나이', `${avgAge.toFixed(1)}세`], ['평균 체력', `${fit.toFixed(0)}%`]] as const).map(([k, v]) => (
          <div key={k}><div className="text-[12px] text-lo">{k}</div><div className="tnum mt-1 text-[16px] font-semibold">{v}</div></div>
        ))}
      </div>
      <div className="space-y-2 px-5 py-5">
        {groups.map(([g, label]) => (
          <div key={g} className="flex items-center gap-3 text-[13px]">
            <span className="w-16 text-mid">{label}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-mid" style={{ width: `${(count(g) / max) * 100}%` }} /></div>
            <span className="tnum w-5 text-right">{count(g)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-6 border-t border-line px-5 py-3 text-[13px]">
        <span className="text-mid">부상 <span className={`tnum font-semibold ${injured ? 'text-red' : 'text-hi'}`}>{injured}</span></span>
        <span className="text-mid">징계 <span className={`tnum font-semibold ${suspended ? 'text-amber' : 'text-hi'}`}>{suspended}</span></span>
      </div>
    </Card>
  );
}

function Finance({ w, squad }: { w: World; squad: PlayerState[] }) {
  const f = w.clubs[w.userClubId].finance;
  const bill = squad.reduce((s, p) => s + p.wage, 0);
  const ratio = Math.min(1, bill / Math.max(1, f.wageBudget));
  return (
    <Card title="재정">
      <div className="grid grid-cols-2 gap-4 px-5 pt-5">
        <div><div className="text-[12px] text-lo">이적 예산</div><div className="tnum mt-1 text-[18px] font-semibold">{money(f.transferBudget)}</div></div>
        <div><div className="text-[12px] text-lo">구단 잔고</div><div className="tnum mt-1 text-[18px] font-semibold">{money(f.balance)}</div></div>
      </div>
      <div className="px-5 py-5">
        <div className="mb-2 flex justify-between text-[12px]"><span className="text-lo">주급 지출 / 예산</span><span className="tnum text-mid">{money(bill)} / {money(f.wageBudget)}</span></div>
        <div className="h-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${ratio > 0.95 ? 'bg-amber' : 'bg-mid'}`} style={{ width: `${ratio * 100}%` }} /></div>
      </div>
    </Card>
  );
}

function LeagueLeaders({ w, league, started }: { w: World; league: string; started: boolean }) {
  const ps = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId]?.league === league);
  const list = started
    ? ps.filter((p) => p.stats.goals > 0).sort((a, b) => b.stats.goals - a.stats.goals || a.stats.apps - b.stats.apps).slice(0, 6)
    : ps.sort((a, b) => overall(b) - overall(a)).slice(0, 6);
  return (
    <Card title={started ? '리그 득점 순위' : '리그 주목 선수'}>
      {list.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">아직 득점이 없습니다</div> : list.map((p, i) => (
        <Row key={p.id}>
          <span className="tnum w-4 text-[12px] text-lo">{i + 1}</span>
          <Crest clubId={p.clubId!} size={18} />
          <div className="min-w-0 flex-1">
            <div className={`truncate ${p.clubId === w.userClubId ? 'font-semibold' : ''}`}>{playerKo(p.id, p.name)}</div>
            <div className="truncate text-[12px] text-lo">{clubKo(p.clubId!)}</div>
          </div>
          {started ? <span className="tnum text-[15px] font-semibold">{p.stats.goals}골</span> : <OvrText w={w} p={p} className="text-[15px]" />}
        </Row>
      ))}
    </Card>
  );
}
