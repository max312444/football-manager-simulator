import { useEffect, useState } from 'react';
import { useApp } from '../../store/app';
import { sortTable } from '../../engine/standings';
import { levelOf, pairRule, nationOf, zoneOf, type Tie } from '../../engine/pyramid';
import { clubKo, compKo } from '../../data/db';
import { Crest } from '../components/Crest';
import { ResultDot } from '../components/bits';
import { useWorld } from '../hooks';
import { CupView } from './CupView';
import { EuroView } from './EuroView';
import { WorldCupView } from './WorldCupView';

/** 리그 순위표. compact면 홈 화면용 (내 구단 주변만) */
export function LeagueTable({ league, compact = false }: { league: string; compact?: boolean }) {
  const w = useWorld();
  const started = Object.values(w.competitions[league].table).some((r) => r.p > 0);
  // 개막 전: 순위 대신 명성 순으로 보여주고 순위 번호는 비운다
  const rows = started ? sortTable(w.competitions[league].table)
    : Object.values(w.competitions[league].table).sort((a, b) => w.clubs[b.club].reputation - w.clubs[a.club].reputation);
  const n = rows.length;
  const me = rows.findIndex((r) => r.club === w.userClubId);
  const shown = compact ? rows.map((r, i) => ({ r, i })).filter(({ i }) => (started ? i < 3 || Math.abs(i - me) <= 2 || i === n - 1 : i < 5 || Math.abs(i - me) <= 1 || i === n - 1)) : rows.map((r, i) => ({ r, i }));
  const season = w.competitions[league].season;
  const second = levelOf(league) === 2;
  const zone = (i: number) => {
    if (!started) return 'bg-transparent';
    const z = zoneOf(league, season, i + 1, n);
    if (z === 'down') return 'bg-red';
    if (z === 'barrage') return 'bg-amber';
    if (second) return z === 'up' ? 'bg-neon' : z === 'playoff' ? 'bg-sky' : 'bg-transparent';
    return i < 4 ? 'bg-neon' : i === 4 ? 'bg-sky' : 'bg-transparent';   // 1부: 유럽 대회 (대회는 아직 없음)
  };

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-10 bg-ink-800 text-[12px] text-lo">
        <tr className="h-9 shadow-[inset_0_-1px_0_var(--color-line)]">
          <th className="w-10 px-2 text-center font-medium">#</th>
          <th className="px-2 text-left font-medium">구단</th>
          <th className="w-10 text-right font-medium">경기</th>
          {!compact && <><th className="hidden w-9 text-right font-medium sm:table-cell">승</th><th className="hidden w-9 text-right font-medium sm:table-cell">무</th><th className="hidden w-9 text-right font-medium sm:table-cell">패</th>
            <th className="hidden w-10 text-right font-medium sm:table-cell">득</th><th className="hidden w-10 text-right font-medium sm:table-cell">실</th></>}
          <th className="w-12 text-right font-medium">득실</th>
          <th className="w-14 pr-4 text-right font-medium">승점</th>
          {!compact && <th className="hidden w-36 pr-4 text-left font-medium lg:table-cell">최근 5경기</th>}
        </tr>
      </thead>
      <tbody>
        {shown.map(({ r, i }, k) => {
          const mine = r.club === w.userClubId;
          const gap = k > 0 && shown[k - 1].i !== i - 1;
          return (
            <tr key={r.club} className={`h-10 shadow-[inset_0_-1px_0_var(--color-line)] ${mine ? 'bg-neon-ghost' : ''} ${gap ? 'border-t border-dashed border-line-strong' : ''}`}>
              <td className="relative px-2 text-center">
                <span className={`absolute top-2 bottom-2 left-0 w-0.5 rounded-r ${zone(i)}`} />
                <span className={`tnum font-semibold ${mine ? 'text-neon' : 'text-mid'}`}>{started ? i + 1 : '–'}</span>
              </td>
              <td className="px-2">
                <div className="flex items-center gap-3"><Crest clubId={r.club} size={17} /><span className={`truncate ${mine ? 'font-semibold text-hi' : 'text-hi'}`}>{clubKo(r.club)}</span></div>
              </td>
              <td className="tnum text-right text-mid">{r.p}</td>
              {!compact && <><td className="tnum hidden text-right text-mid sm:table-cell">{r.w}</td><td className="tnum hidden text-right text-mid sm:table-cell">{r.d}</td><td className="tnum hidden text-right text-mid sm:table-cell">{r.l}</td>
                <td className="tnum hidden text-right text-mid sm:table-cell">{r.gf}</td><td className="tnum hidden text-right text-mid sm:table-cell">{r.ga}</td></>}
              <td className="tnum text-right text-mid">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
              <td className="tnum pr-4 text-right text-[14px] font-semibold">{r.pts}</td>
              {!compact && <td className="hidden pr-4 lg:table-cell"><div className="flex gap-1">{r.form.map((f, j) => <ResultDot key={j} r={f} />)}</div></td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function TableView() {
  const w = useWorld();
  const ids = Object.keys(w.competitions);
  const cupIds = Object.keys(w.cups ?? {});
  const want = useApp((a) => a.tableLeague);
  const euroIds = [...Object.keys(w.europe ?? {}), ...(w.worldCup || w.worldCupHistory?.length ? ['wc'] : [])];
  const known = (id: string | null | undefined): id is string => !!id && (!!w.competitions[id] || !!w.cups?.[id] || !!w.europe?.[id] || id === 'wc');
  const [league, setLeague] = useState(known(want) ? want : w.clubs[w.userClubId].league);
  useEffect(() => { if (known(want)) setLeague(want); }, [want]);
  const isCup = !w.competitions[league];
  const tab = (id: string, small = false) => (
    <button key={id} onClick={() => setLeague(id)}
      className={`shrink-0 rounded-md ${small ? 'h-7 px-3 text-[12px]' : 'h-8 px-4 text-[13px]'} ${league === id ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>
      {compKo(id)}
    </button>
  );
  return (
    <div className="flex h-full flex-col p-3 lg:p-6">
      <div className="mb-1 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">{ids.map((id) => tab(id))}</div>
        {!isCup && <Legend league={league} />}
      </div>
      {(euroIds.length > 0 || cupIds.length > 0) && (
        <div className="mb-3 flex items-center gap-1 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[11px] text-lo">대회</span>
          {euroIds.map((id) => tab(id, true))}
          {euroIds.length > 0 && cupIds.length > 0 && <span className="mx-2 h-4 w-px shrink-0 bg-line" />}
          {cupIds.map((id) => tab(id, true))}
        </div>
      )}
      {league === 'wc' ? <WorldCupView /> : w.europe?.[league] ? <EuroView id={league} /> : isCup ? <CupView cupId={league} /> : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="panel min-h-0 flex-1 overflow-auto"><LeagueTable league={league} /></div>
          {w.competitions[league]?.playoff?.ties.length ? <Playoffs league={league} /> : null}
        </div>
      )}
    </div>
  );
}

function Legend({ league }: { league: string }) {
  const w = useWorld();
  const n = nationOf(league);
  const r = n ? pairRule(n, w.competitions[league].season) : null;
  const item = (cls: string, t: string) => <span key={t} className="flex items-center gap-2"><span className={`h-2.5 w-0.5 rounded ${cls}`} />{t}</span>;
  const items = levelOf(league) === 2 && r
    ? [item('bg-neon', `자동 승격 (${r.up}팀)`), r.playoff && item('bg-sky', `승격 플레이오프 (${r.playoff.seeds.join('·')}위)`), r.barrage && !r.playoff && item('bg-amber', `승강 플레이오프 (${r.up + 1}위)`), item('bg-red', `3부 강등 (${r.secondDown}팀)`)]
    : [item('bg-neon', '챔피언스리그권'), item('bg-sky', '유로파리그권'), r?.barrage && item('bg-amber', '승강 플레이오프'), item('bg-red', r ? `2부 강등 (${r.topDown}팀)` : '강등')];
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-lo lg:ml-auto">{items.filter(Boolean)}</div>;
}

/** 승격 · 승강 플레이오프 대진과 결과 */
function Playoffs({ league }: { league: string }) {
  const w = useWorld();
  const c = w.competitions[league];
  const st = c.playoff!;
  const name: Record<Tie['kind'], string> = { semi: '준결승', final: '결승', ladder: '플레이오프', barrage: '승강 플레이오프' };
  const score = (t: Tie) => t.legs.map((id) => c.fixtures.find((f) => f.id === id)).map((f) => (f?.result ? `${f.home === t.a ? f.result.homeGoals : f.result.awayGoals}-${f.home === t.a ? f.result.awayGoals : f.result.homeGoals}` : '–'));
  return (
    <aside className="panel w-[300px] shrink-0 overflow-auto px-5 py-4">
      <div className="mb-3 text-[13px] font-semibold text-mid">플레이오프</div>
      <div className="space-y-3">
        {st.ties.map((t, i) => (
          <div key={i} className="rounded-lg bg-ink-900 px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-lo">{name[t.kind]}{t.legs.length === 2 ? ' · 2경기 합산' : ''}</div>
            {[t.a, t.b].map((id, k) => (
              <div key={id} className={`flex items-center gap-2 py-0.5 text-[13px] ${t.winner === id ? 'font-semibold text-hi' : t.winner ? 'text-lo' : 'text-mid'} ${id === w.userClubId ? 'text-neon' : ''}`}>
                <Crest clubId={id} size={14} /><span className="min-w-0 flex-1 truncate">{clubKo(id)}</span>
                <span className="tnum text-[12px]">{score(t).map((x) => x.split('-')[k]).join(' · ')}</span>
              </div>
            ))}
            {t.winner && <div className="mt-1 text-[11px] text-lo">{t.agg ? `합산 ${t.agg[0]}-${t.agg[1]}` : ''}{t.pens ? ' · 승부차기' : ''}</div>}
          </div>
        ))}
        {st.winner && <div className="text-[12px] text-neon">승격 플레이오프 승자: {clubKo(st.winner)}</div>}
        {st.barrage && <div className="text-[12px] text-amber">승강 플레이오프: {clubKo(st.barrage.winner)} {st.barrage.winner === st.barrage.top ? '1부 잔류' : '1부 승격'}</div>}
      </div>
    </aside>
  );
}
