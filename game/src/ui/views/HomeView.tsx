import { nextUserFixture } from '../../engine/world';
import { overall } from '../../engine/ratings';
import { clubKo, leagues, playerKo } from '../../data/db';
import { sortTable } from '../../engine/standings';
import { Crest } from '../components/Crest';
import { Card, ResultDot } from '../components/bits';
import { koDate } from '../format';
import { useWorld } from '../hooks';
import { useApp } from '../../store/app';
import { LeagueTable } from './TableView';
import { describe } from './InboxView';
import { resultFor, userFixtures } from './ScheduleView';

export function HomeView() {
  const w = useWorld();
  const setTab = useApp((s) => s.setTab);
  const club = w.clubs[w.userClubId];
  const next = nextUserFixture(w);
  const played = userFixtures(w).filter((f) => f.result).slice(-5).reverse();
  const table = sortTable(w.competitions[club.league].table);
  const pos = table.findIndex((r) => r.club === club.id) + 1;
  const row = table[pos - 1];
  const squad = club.squad.map((id) => w.players[id]);
  const scorers = [...squad].filter((p) => p.stats.goals).sort((a, b) => b.stats.goals - a.stats.goals).slice(0, 5);
  const news = [...w.inbox].reverse().slice(0, 6);

  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] grid-rows-[auto_1fr] gap-5 overflow-auto p-6">
      {/* 다음 경기 */}
      <section className="panel relative col-span-2 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgb(57_255_20/0.10),transparent_60%)]" />
        {next ? (
          <div className="relative flex items-center gap-10 px-8 py-6">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-neon">다음 경기</div>
              <div className="mt-1 text-[13px] text-mid">{koDate(next.date)} · {leagues.find((l) => l.id === next.league)?.ko} {next.round}라운드</div>
            </div>
            <div className="flex flex-1 items-center justify-center gap-8">
              <div className="flex items-center gap-3"><span className="text-[18px] font-bold">{clubKo(next.home)}</span><Crest clubId={next.home} size={40} /></div>
              <span className="text-[13px] font-semibold text-lo">VS</span>
              <div className="flex items-center gap-3"><Crest clubId={next.away} size={40} /><span className="text-[18px] font-bold">{clubKo(next.away)}</span></div>
            </div>
            <div className="text-right">
              <div className="text-[12px] text-lo">현재 순위</div>
              <div className="tnum text-[30px] leading-none font-black tracking-[-0.04em]">{pos}<span className="text-[15px] text-lo">위</span></div>
              <div className="tnum mt-1 text-[12px] text-mid">{row.pts}점 · {row.w}승 {row.d}무 {row.l}패</div>
            </div>
          </div>
        ) : (
          <div className="relative px-8 py-6 text-[15px] font-semibold">시즌이 끝났습니다 · 최종 {pos}위 ({row.pts}점)</div>
        )}
      </section>

      <div className="flex min-h-0 flex-col gap-5">
        <Card title="리그 순위" action={<button onClick={() => setTab('table')} className="text-[12px] text-lo hover:text-hi">전체 보기</button>}>
          <LeagueTable league={club.league} compact />
        </Card>
        <Card title="최근 소식" action={<button onClick={() => setTab('inbox')} className="text-[12px] text-lo hover:text-hi">받은편지함</button>} className="flex-1">
          {news.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">우측 상단 "계속"을 눌러 시즌을 시작하세요.</div> :
            news.map((e, i) => { const d = describe(e, w); return (
              <div key={i} className="flex items-center gap-4 px-5 py-2.5 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)]">
                <span className={`w-9 text-[11px] font-bold ${d.tone}`}>{d.tag}</span>
                <span className="flex-1 truncate">{d.title}</span>
                <span className="tnum text-[11px] text-lo">{e.date.slice(5).replace('-', '.')}</span>
              </div>
            ); })}
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-5">
        <Card title="최근 경기">
          {played.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">아직 치른 경기가 없습니다.</div> :
            played.map((f) => { const home = f.home === w.userClubId; const opp = home ? f.away : f.home; return (
              <div key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)]">
                <ResultDot r={resultFor(f, w.userClubId)!} />
                <span className="w-8 text-[11px] text-lo">{home ? '홈' : '원정'}</span>
                <Crest clubId={opp} size={16} /><span className="flex-1 truncate">{clubKo(opp)}</span>
                <span className="tnum font-bold">{home ? `${f.result!.homeGoals}-${f.result!.awayGoals}` : `${f.result!.awayGoals}-${f.result!.homeGoals}`}</span>
              </div>
            ); })}
        </Card>
        <Card title="팀 득점" className="flex-1">
          {scorers.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">기록 없음</div> :
            scorers.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)]">
                <span className="tnum w-4 text-lo">{i + 1}</span>
                <span className="flex-1 truncate font-semibold">{playerKo(p.id, p.name)}</span>
                <span className="tnum text-[12px] text-lo">능력 {overall(p)}</span>
                <span className="tnum w-8 text-right text-[15px] font-bold text-neon">{p.stats.goals}</span>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
}
