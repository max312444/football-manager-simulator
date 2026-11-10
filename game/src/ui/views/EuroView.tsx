// 유럽 대회 화면: 조별리그 순위 · 8강 / 준결승 / 결승 (순위 화면에서 유럽 대회 탭을 고르면 나온다)
import type { EuroComp, EuroTie } from '../../engine/europe';
import { euroPrize, euroProgress } from '../../engine/europe';
import { sortTable } from '../../engine/standings';
import { clubKo, compKo } from '../../data/db';
import { Crest } from '../components/Crest';
import { koDate, money } from '../format';
import { useWorld } from '../hooks';

export function EuroView({ id }: { id: string }) {
  const w = useWorld();
  const c = w.europe?.[id];
  if (!c) return <div className="panel grid flex-1 place-items-center text-[13px] text-lo">이번 시즌에는 이 대회가 없습니다 (출전 구단이 모자람)</div>;
  const me = euroProgress(c, w.userClubId);
  const past = (w.cupHistory ?? []).filter((h) => h.cup === id && h.season !== c.season).slice(-5).reverse();
  const ko = ['8강', '준결승', '결승'].map((name, i) => ({ name, round: c.knockout[i], date: name === '8강' ? c.dates.qf : name === '준결승' ? c.dates.sf : [c.dates.final] }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4 text-[13px]">
        <div className="text-[16px] font-semibold">{compKo(id)} <span className="ml-1 text-[13px] font-normal text-lo">{c.season.replace('-', '/')} · 16개 구단 · 조별리그 → 8강 · 준결승 (2경기 합산) → 결승</span></div>
        {me && <div>내 구단: <span className={me === '우승' ? 'font-semibold text-[#f2c94c]' : me === '준우승' ? 'text-hi' : me.includes('탈락') ? 'text-red' : 'text-neon'}>{me}</span></div>}
        {c.winner && <div>우승 <span className="font-semibold text-[#f2c94c]">{clubKo(c.winner)}</span> · 준우승 {clubKo(c.runnerUp!)}</div>}
        <div className="text-lo">참가 {money(euroPrize(c, 'entry'))} · 승 {money(euroPrize(c, 'win'))} · 우승 {money(euroPrize(c, 'champion'))}</div>
        {past.length > 0 && <div className="ml-auto text-lo">지난 우승: {past.map((h) => `${h.season.slice(2, 4)}/${h.season.slice(5)} ${clubKo(h.winner)}`).join(' · ')}</div>}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {c.groups.map((g) => (
          <section key={g.name} className="panel px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">{g.name}조</span>
              <span className="text-[11px] text-lo">{koDate(c.dates.group[0])} ~ {koDate(c.dates.group[5])}</span>
            </div>
            <table className="w-full table-fixed text-[13px]">
              <thead><tr className="text-[11px] text-lo"><th className="w-7 text-left font-normal">#</th><th className="text-left font-normal">구단</th>{['경기', '승', '무', '패', '득실', '승점'].map((h) => <th key={h} className={`${h === "득실" || h === "승점" ? "w-9" : "w-7"} text-right font-normal`}>{h}</th>)}</tr></thead>
              <tbody>
                {sortTable(g.table).map((r, i) => (
                  <tr key={r.club} className={`${r.club === w.userClubId ? 'text-neon' : ''} ${i < 2 ? '' : 'text-mid'}`}>
                    <td className="py-1 whitespace-nowrap"><span className={`mr-1.5 inline-block h-3 w-0.5 rounded align-middle ${i < 2 ? 'bg-neon' : 'bg-transparent'}`} /><span className="tnum text-lo">{i + 1}</span></td>
                    <td className="py-1"><div className="flex min-w-0 items-center gap-2"><Crest clubId={r.club} size={14} /><span className="truncate">{clubKo(r.club)}</span></div></td>
                    {[r.p, r.w, r.d, r.l, r.gf - r.ga, r.pts].map((v, k) => <td key={k} className={`tnum text-right ${k === 5 ? 'font-semibold' : ''}`}>{k === 4 && v > 0 ? `+${v}` : v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-3">
        {ko.map(({ name, round, date }) => (
          <section key={name} className="panel flex flex-col">
            <div className="border-b border-line px-4 py-3">
              <div className="text-[14px] font-semibold">{name}</div>
              <div className="text-[11px] text-lo">{date.map(koDate).join(' · ')}{date.length === 2 ? ' · 2경기 합산' : ' · 단판'}</div>
            </div>
            <div className="space-y-2 p-3">
              {round ? round.ties.map((t, i) => <TieCard key={i} c={c} t={t} />)
                : <div className="py-6 text-center text-[12px] text-lo">{name === '8강' ? '조별리그가 끝나면 추첨 (조 1위 vs 다른 조 2위)' : '앞 라운드가 끝나면 추첨'}</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TieCard({ c, t }: { c: EuroComp; t: EuroTie }) {
  const w = useWorld();
  const legs = t.legs.map((id) => c.fixtures.find((f) => f.id === id)!);
  const goals = (club: string) => legs.map((f) => (f.result ? (f.home === club ? f.result.homeGoals : f.result.awayGoals) : null));
  const mine = t.a === w.userClubId || t.b === w.userClubId;
  const last = legs.at(-1)!;
  return (
    <div className={`rounded-lg px-3 py-2 ${mine ? 'bg-neon-ghost ring-1 ring-neon/30' : 'bg-ink-900'}`}>
      {[t.a, t.b].map((id) => (
        <div key={id} className={`flex items-center gap-2 py-0.5 text-[13px] ${t.winner === id ? 'font-semibold text-hi' : t.winner ? 'text-lo' : 'text-mid'}`}>
          <Crest clubId={id} size={14} />
          <span className="min-w-0 flex-1 truncate">{clubKo(id)}</span>
          {goals(id).map((g, k) => <span key={k} className="tnum w-5 text-right text-lo">{g ?? ''}</span>)}
          {legs.length === 2 && <span className="tnum w-6 text-right font-semibold">{t.agg ? (id === t.a ? t.agg[0] : t.agg[1]) : ''}</span>}
        </div>
      ))}
      {last.result?.pens && <div className="mt-0.5 text-[11px] text-lo">승부차기 {clubKo(last.result.pens === 'home' ? last.home : last.away)} 승</div>}
    </div>
  );
}
