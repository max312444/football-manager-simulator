import type { PlayerState } from '../../engine/types';
import { attr, overall, formAvg } from '../../engine/ratings';
import { POS_KO } from '../../data/rating';
import { ATTR_GROUPS, ATTR_KO, GK_GROUP, money, ratingBar, ratingTone } from '../format';
import { ConditionIcon, FitnessBar } from '../components/bits';

// 숨은 속성은 숫자 대신 코치 평가 문장으로
function coachNotes(p: PlayerState): string[] {
  const h = p.hidden, out: string[] = [];
  if (h.consistency >= 15) out.push('경기력이 매우 꾸준함'); else if (h.consistency <= 6) out.push('경기마다 기복이 큼');
  if (h.bigMatch >= 15) out.push('큰 경기에 강함'); else if (h.bigMatch <= 6) out.push('큰 경기에서 위축됨');
  if (h.professionalism >= 15) out.push('자기 관리가 철저함');
  if (h.injuryProne >= 15) out.push('부상이 잦은 편'); else if (h.injuryProne <= 5) out.push('잘 다치지 않음');
  if (h.temperament <= 6) out.push('다혈질 — 카드를 자주 받음');
  if (!out.length) out.push('특별히 눈에 띄는 성향 없음');
  return out;
}

export function PlayerPanel({ p, age, ko, nation }: { p: PlayerState; age: number; ko: string; nation: string }) {
  const ovr = overall(p);
  const groups = p.pos === 'GK' ? [GK_GROUP, ...ATTR_GROUPS] : ATTR_GROUPS;
  const s = p.stats;
  const apps = s.apps + s.subApps;
  return (
    <aside key={p.id} className="panel flex w-[340px] shrink-0 animate-[fade_0.25s_ease-out] flex-col overflow-hidden">
      <div className="relative overflow-hidden border-b border-line px-5 pt-5 pb-4">
        <div className="tnum pointer-events-none absolute -top-6 -right-2 text-[120px] leading-none font-black tracking-[-0.06em] text-white/[0.03]">{p.number ?? ''}</div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-lo">{POS_KO[p.pos]}</div>
            <div className="mt-1 truncate text-[22px] leading-tight font-bold tracking-[-0.03em]">{ko}</div>
            <div className="truncate text-[12px] text-lo">{p.name} · {nation} · {age}세</div>
          </div>
          <div className="flex flex-col items-center rounded-[6px] border border-line bg-ink-900 px-3 py-2">
            <div className={`tnum text-[28px] leading-none font-black tracking-[-0.04em] ${ratingTone(ovr)}`}>{ovr}</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.12em] text-lo">능력</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-[5px] bg-ink-900 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px] text-mid"><ConditionIcon value={p.condition} />컨디션</div>
          <FitnessBar value={p.fitness} />
          <div className="text-[12px] text-mid">사기 <span className="tnum font-semibold text-hi">{Math.round(p.morale)}</span></div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {([['출전', apps], ['골', s.goals], ['도움', s.assists], ['평점', apps ? (s.ratingSum / apps).toFixed(2) : '–']] as const).map(([k, v]) => (
            <div key={k}><div className="tnum text-[16px] font-bold">{v}</div><div className="text-[11px] text-lo">{k}</div></div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        {groups.map((g) => {
          const keys = g.keys.filter((k) => p.base[k] != null);
          if (!keys.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-lo">{g.title}</div>
              <div className="space-y-1.5">
                {keys.map((k) => {
                  const v = Math.round(attr(p, k));
                  return (
                    <div key={k} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[72px] shrink-0 text-mid">{ATTR_KO[k]}</span>
                      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${ratingBar(v)}`} style={{ width: `${v}%` }} /></div>
                      <span className={`tnum w-7 text-right font-bold ${ratingTone(v)}`}>{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-lo">코치 평가</div>
        <ul className="space-y-1 text-[13px] text-mid">
          {coachNotes(p).map((n) => <li key={n} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon/70" />{n}</li>)}
        </ul>
        <div className="mt-4 text-[12px] text-lo">주급 {money(p.wage)} · 계약 {p.contract ? p.contract.replace(/-/g, '.') : '정보 없음'} · 최근 폼 {p.recentRatings.length ? formAvg(p).toFixed(1) : '–'}</div>
      </div>
    </aside>
  );
}
