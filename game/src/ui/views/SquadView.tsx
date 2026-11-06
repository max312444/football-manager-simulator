import { useMemo, useState } from 'react';
import type { PlayerState } from '../../engine/types';
import { overall, formAvg } from '../../engine/ratings';
import { ageOn } from '../../engine/condition';
import { nations, playerKo } from '../../data/db';
import { POS_ORDER, posGroup } from '../../data/rating';
import { money, ratingTone } from '../format';
import { useWorld } from '../hooks';
import { ConditionIcon, FitnessBar, PosTag } from '../components/bits';
import { PlayerPanel } from './PlayerPanel';

type Group = 'ALL' | 'GK' | 'DF' | 'MF' | 'FW';
type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'fit' | 'form' | 'apps' | 'goals' | 'wage';
const GROUPS: { key: Group; label: string }[] = [
  { key: 'ALL', label: '전체' }, { key: 'GK', label: '골키퍼' }, { key: 'DF', label: '수비수' },
  { key: 'MF', label: '미드필더' }, { key: 'FW', label: '공격수' },
];

interface Row { p: PlayerState; ovr: number; age: number; ko: string; form: number }

export function SquadView() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const [group, setGroup] = useState<Group>('ALL');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pos', dir: 1 });
  const [selected, setSelected] = useState<string | null>(null);

  const rows: Row[] = club.squad.map((id) => {
    const p = w.players[id];
    return { p, ovr: overall(p), age: ageOn(p.birth, w.date), ko: playerKo(p.id, p.name), form: formAvg(p) };
  });
  const sel = rows.find((r) => r.p.id === selected) ?? [...rows].sort((a, b) => b.ovr - a.ovr)[0];

  const shown = useMemo(() => {
    const f = rows.filter((r) => group === 'ALL' || posGroup(r.p.pos) === group);
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      pos: (a, b) => POS_ORDER.indexOf(a.p.pos) - POS_ORDER.indexOf(b.p.pos) || b.ovr - a.ovr,
      name: (a, b) => a.ko.localeCompare(b.ko, 'ko'),
      age: (a, b) => a.age - b.age,
      ovr: (a, b) => a.ovr - b.ovr,
      fit: (a, b) => a.p.fitness - b.p.fitness,
      form: (a, b) => a.form - b.form,
      apps: (a, b) => a.p.stats.apps + a.p.stats.subApps - b.p.stats.apps - b.p.stats.subApps,
      goals: (a, b) => a.p.stats.goals - b.p.stats.goals,
      wage: (a, b) => a.p.wage - b.p.wage,
    };
    return [...f].sort((a, b) => cmp[sort.key](a, b) * sort.dir);
  }, [rows, group, sort]);

  const injured = rows.filter((r) => r.p.injury).length;
  const suspended = rows.filter((r) => r.p.suspension > 0).length;
  const avgFit = rows.reduce((s, r) => s + r.p.fitness, 0) / rows.length;
  const top11 = [...rows].sort((a, b) => b.ovr - a.ovr).slice(0, 11);

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`px-3 font-medium ${cls}`}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : ['pos', 'name', 'age'].includes(key) ? 1 : -1 }))}
        className={`inline-flex items-center gap-1 hover:text-hi ${sort.key === key ? 'text-hi' : ''}`}>
        {label}<span className={`text-[9px] ${sort.key === key ? 'text-neon' : 'opacity-0'}`}>{sort.dir === 1 ? '▲' : '▼'}</span>
      </button>
    </th>
  );

  return (
    <div className="flex h-full min-h-0 gap-5 p-6">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-5 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line">
          {([
            ['선수', `${rows.length}명`, ''],
            ['주전 11명 평균', (top11.reduce((s, r) => s + r.ovr, 0) / top11.length).toFixed(0), 'text-neon'],
            ['평균 체력', `${avgFit.toFixed(0)}%`, ''],
            ['부상 · 징계', `${injured} · ${suspended}`, injured + suspended ? 'text-amber' : ''],
          ] as const).map(([k, v, c]) => (
            <div key={k} className="bg-ink-850 px-5 py-4">
              <div className="text-[12px] text-lo">{k}</div>
              <div className={`tnum mt-1 text-[22px] font-semibold ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-1">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => setGroup(g.key)}
              className={`h-8 rounded-md px-4 text-[13px] transition-colors ${group === g.key ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>
              {g.label}
            </button>
          ))}
        </div>

        <div className="panel min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead className="sticky top-0 z-10 bg-ink-800 text-left text-[12px] text-lo">
              <tr className="h-9 shadow-[inset_0_-1px_0_var(--color-line)]">
                <th className="w-12 px-3 text-center font-medium">번호</th>
                {th('name', '선수')}
                {th('pos', '포지션')}
                {th('age', '나이', 'text-right')}
                <th className="px-3 text-center font-medium">상태</th>
                {th('fit', '체력')}
                {th('form', '폼', 'text-right')}
                {th('ovr', '능력', 'text-right')}
                {th('apps', '출전', 'text-right')}
                {th('goals', '골', 'text-right')}
                {th('wage', '주급', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, ovr, age, ko, form }) => {
                const active = sel?.p.id === p.id;
                return (
                  <tr key={p.id} onClick={() => setSelected(p.id)}
                    className={`h-11 cursor-pointer shadow-[inset_0_-1px_0_var(--color-line)] transition-colors ${active ? 'bg-neon-ghost' : 'hover:bg-ink-800'}`}>
                    <td className={`tnum px-3 text-center font-semibold ${active ? 'text-neon' : 'text-lo'}`}>{p.number ?? '–'}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-hi">{ko}</span>
                        {p.injury && <span title={`${p.injury.label} · ${p.injury.days}일`} className="rounded bg-red/15 px-1 text-[11px] font-semibold text-red">부상 {p.injury.days}일</span>}
                        {p.suspension > 0 && <span className="rounded bg-amber/15 px-1 text-[11px] font-semibold text-amber">징계 {p.suspension}</span>}
                      </div>
                    </td>
                    <td className="px-3"><PosTag pos={p.pos} /></td>
                    <td className="tnum px-3 text-right text-mid">{age}</td>
                    <td className="px-3 text-center"><ConditionIcon value={p.condition} /></td>
                    <td className="px-3"><FitnessBar value={p.fitness} /></td>
                    <td className={`tnum px-3 text-right ${p.recentRatings.length ? ratingTone(form * 11) : 'text-lo'}`}>{p.recentRatings.length ? form.toFixed(1) : '–'}</td>
                    <td className={`tnum px-3 text-right text-[15px] font-semibold ${ratingTone(ovr)}`}>{ovr}</td>
                    <td className="tnum px-3 text-right text-mid">{p.stats.apps}{p.stats.subApps ? <span className="text-lo"> ({p.stats.subApps})</span> : ''}</td>
                    <td className="tnum px-3 text-right text-mid">{p.stats.goals || '–'}</td>
                    <td className="tnum px-3 text-right text-mid">{money(p.wage)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {sel && <PlayerPanel p={sel.p} age={sel.age} ko={sel.ko} nation={nations.get(sel.p.nation)?.ko ?? sel.p.nation} />}
    </div>
  );
}
