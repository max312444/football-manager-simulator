import { useState } from 'react';
import { sortTable } from '../../engine/standings';
import { clubKo, leagues } from '../../data/db';
import { Crest } from '../components/Crest';
import { ResultDot } from '../components/bits';
import { useWorld } from '../hooks';

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
  const zone = (i: number) => (!started ? 'bg-transparent' : i < 4 ? 'bg-neon' : i === 4 ? 'bg-sky' : i >= n - 3 ? 'bg-red' : 'bg-transparent');

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-10 bg-ink-800 text-[12px] text-lo">
        <tr className="h-9 shadow-[inset_0_-1px_0_var(--color-line)]">
          <th className="w-10 px-2 text-center font-medium">#</th>
          <th className="px-2 text-left font-medium">구단</th>
          <th className="w-10 text-right font-medium">경기</th>
          {!compact && <><th className="w-9 text-right font-medium">승</th><th className="w-9 text-right font-medium">무</th><th className="w-9 text-right font-medium">패</th>
            <th className="w-10 text-right font-medium">득</th><th className="w-10 text-right font-medium">실</th></>}
          <th className="w-12 text-right font-medium">득실</th>
          <th className="w-14 pr-4 text-right font-medium">승점</th>
          {!compact && <th className="w-36 pr-4 text-left font-medium">최근 5경기</th>}
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
              {!compact && <><td className="tnum text-right text-mid">{r.w}</td><td className="tnum text-right text-mid">{r.d}</td><td className="tnum text-right text-mid">{r.l}</td>
                <td className="tnum text-right text-mid">{r.gf}</td><td className="tnum text-right text-mid">{r.ga}</td></>}
              <td className="tnum text-right text-mid">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
              <td className="tnum pr-4 text-right text-[14px] font-semibold">{r.pts}</td>
              {!compact && <td className="pr-4"><div className="flex gap-1">{r.form.map((f, j) => <ResultDot key={j} r={f} />)}</div></td>}
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
  const [league, setLeague] = useState(w.clubs[w.userClubId].league);
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-center gap-1">
        {ids.map((id) => (
          <button key={id} onClick={() => setLeague(id)}
            className={`h-8 rounded-md px-4 text-[13px] ${league === id ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>
            {leagues.find((l) => l.id === id)?.ko ?? id}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[12px] text-lo">
          <span className="flex items-center gap-2"><span className="h-2.5 w-0.5 rounded bg-neon" />챔피언스리그</span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-0.5 rounded bg-sky" />유로파리그</span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-0.5 rounded bg-red" />강등</span>
        </div>
      </div>
      <div className="panel min-h-0 flex-1 overflow-auto"><LeagueTable league={league} /></div>
    </div>
  );
}
