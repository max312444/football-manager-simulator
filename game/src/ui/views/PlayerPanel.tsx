import type { PlayerState } from '../../engine/types';
import { attr, overall, formAvg } from '../../engine/ratings';
import { POS_KO } from '../../data/rating';
import { ATTR_GROUPS, ATTR_KO, GK_GROUP, money, ratingBar, ratingTone } from '../format';
import { ConditionIcon, FitnessBar } from '../components/bits';
import { loyaltyLabel, UNHAPPY } from '../../engine/loyalty';

// 숨은 속성은 숫자 대신 게임 속 언론 평가 문장으로 (이 세이브에서 생성된 값, 실제 선수와 무관)
function pressNotes(p: PlayerState): string[] {
  const h = p.hidden, out: string[] = [];
  if (h.consistency >= 15) out.push('"기복 없는 활약으로 감독의 신뢰를 받는 선수"');
  else if (h.consistency <= 6) out.push('"좋은 날과 나쁜 날의 차이가 큰 선수"');
  if (h.bigMatch >= 15) out.push('"큰 경기일수록 존재감이 커진다"');
  else if (h.bigMatch <= 6) out.push('"빅매치에서는 아직 증명할 것이 남았다"');
  if (h.professionalism >= 15) out.push('"훈련장에 가장 먼저 나오는 성실파"');
  if (h.injuryProne >= 15) out.push('"잦은 부상이 늘 아쉬움으로 남는다"');
  else if (h.injuryProne <= 5) out.push('"좀처럼 다치지 않는 강철 체력"');
  if (h.temperament <= 6) out.push('"승부욕이 강해 경고를 자주 받는 편"');
  if (h.ambition >= 16) out.push('"더 큰 무대를 꿈꾸는 야심가"');
  if (!out.length) out.push('"아직 언론의 큰 주목을 받지 못했다"');
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
        <div className="tnum pointer-events-none absolute -top-6 -right-2 text-[120px] leading-none font-semibold text-white/[0.03]">{p.number ?? ''}</div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-lo">{POS_KO[p.pos]}</div>
            <div className="mt-1 truncate text-[22px] leading-tight font-semibold">{ko}</div>
            <div className="truncate text-[12px] text-lo">{p.name} · {nation} · {age}세</div>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-line bg-ink-900 px-3 py-2">
            <div className={`tnum text-[28px] leading-none font-semibold ${ratingTone(ovr)}`}>{ovr}</div>
            <div className="mt-1 text-[11px] font-semibold text-lo">능력</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-ink-900 px-3 py-3">
          <div className="flex items-center gap-2 text-[12px] text-mid"><ConditionIcon value={p.condition} />컨디션</div>
          <FitnessBar value={p.fitness} />
          <div className="text-[12px] text-mid">사기 <span className="tnum font-semibold text-hi">{Math.round(p.morale)}</span></div>
        </div>
        <div className="mt-2 rounded-lg bg-ink-900 px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-mid">충성도 <span className={`font-semibold ${p.loyalty < UNHAPPY ? 'text-amber' : 'text-hi'}`}>{loyaltyLabel(p.loyalty)}</span></span>
            <span className="text-lo">{p.benchStreak >= 3 ? `연속 ${p.benchStreak}경기 결장` : '출전하면 오르고, 연속 벤치면 떨어짐'}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-ink-700">
            <div className={`h-full rounded-full ${p.loyalty < UNHAPPY ? 'bg-amber' : p.loyalty >= 80 ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${p.loyalty}%` }} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {([['출전', apps], ['골', s.goals], ['도움', s.assists], ['평점', apps ? (s.ratingSum / apps).toFixed(2) : '–']] as const).map(([k, v]) => (
            <div key={k}><div className="tnum text-[16px] font-semibold">{v}</div><div className="text-[11px] text-lo">{k}</div></div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        {groups.map((g) => {
          const keys = g.keys.filter((k) => p.base[k] != null);
          if (!keys.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div className="mb-2 text-[11px] font-semibold text-lo">{g.title}</div>
              <div className="space-y-2">
                {keys.map((k) => {
                  const v = Math.round(attr(p, k));
                  return (
                    <div key={k} className="flex items-center gap-3 text-[13px]">
                      <span className="w-[72px] shrink-0 text-mid">{ATTR_KO[k]}</span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${ratingBar(v)}`} style={{ width: `${v}%` }} /></div>
                      <span className={`tnum w-7 text-right font-semibold ${ratingTone(v)}`}>{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="mb-2 text-[11px] font-semibold text-lo">언론 평가</div>
        <ul className="space-y-1 text-[13px] text-mid">
          {pressNotes(p).map((n) => <li key={n} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon/70" />{n}</li>)}
        </ul>
        <div className="mt-4 text-[12px] text-lo">주급 {money(p.wage)} · 계약 {p.contract ? p.contract.replace(/-/g, '.') : '정보 없음'} · 최근 폼 {p.recentRatings.length ? formAvg(p).toFixed(1) : '–'}</div>
      </div>
    </aside>
  );
}
