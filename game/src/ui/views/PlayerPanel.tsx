import type { PlayerState, World } from '../../engine/types';
import { attr, overall, formAvg } from '../../engine/ratings';
import { POS_KO } from '../../data/rating';
import { ATTR_GROUPS, ATTR_KO, GK_GROUP, money, ratingBar, ratingTone } from '../format';
import { ConditionIcon, FitnessBar } from '../components/bits';
import { loyaltyLabel, UNHAPPY } from '../../engine/loyalty';
import { TRAIT, type PlayerHistory, type TraitKind } from '../../engine/traits';
import { AWARD_KO, isTrophy } from '../../engine/awards';
import type { ReactNode } from 'react';
import { clubKo, compKo } from '../../data/db';
import { useHistory, useWorld } from '../hooks';
import { Crest } from '../components/Crest';

export interface Spell { from: string; to: string; club: string; seasons: number; apps: number; goals: number; ovr: [number, number] | null }

/** 경력: 게임 시작 전 시즌은 시즌 데이터 이력, 이후는 이 세이브에서 뛴 기록. 같은 구단 연속 시즌은 한 줄로 */
export function careerSpells(w: World, p: PlayerState, hist: PlayerHistory | null): Spell[] {
  const start = w.history.reduce((m, h) => (h.season < m ? h.season : m), w.season);
  const rows: { season: string; club: string; apps: number; goals: number; ovr: number | null }[] = [];
  for (const e of hist?.p[p.id]?.split(',') ?? []) {
    const [si, ci, o] = e.split('.').map(Number);
    const season = hist!.seasons[si];
    if (season < start) rows.push({ season, club: hist!.clubs[ci], apps: 0, goals: 0, ovr: o });
  }
  for (const c of p.career) if (c.club) rows.push({ season: c.season, club: c.club, apps: c.apps, goals: c.goals, ovr: null });
  if (p.clubId && !p.career.some((c) => c.season === w.season)) rows.push({ season: w.season, club: p.clubId, apps: p.stats.apps + p.stats.subApps, goals: p.stats.goals, ovr: null });
  const spells: Spell[] = [];
  for (const r of rows) {
    const last = spells.at(-1);
    if (last && last.club === r.club) {
      if (last.to !== r.season) last.seasons++;
      last.to = r.season; last.apps += r.apps; last.goals += r.goals;
      if (r.ovr != null) last.ovr = last.ovr ? [last.ovr[0], r.ovr] : [r.ovr, r.ovr];
    } else spells.push({ from: r.season, to: r.season, club: r.club, seasons: 1, apps: r.apps, goals: r.goals, ovr: r.ovr != null ? [r.ovr, r.ovr] : null });
  }
  return spells;
}

function Career({ p }: { p: PlayerState }) {
  const w = useWorld();
  const hist = useHistory();
  const spells = careerSpells(w, p, hist);
  const yy = (s: string) => s.slice(2, 4) + '/' + s.slice(5, 7);
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between"><span className="text-[11px] font-semibold text-lo">경력</span>{p.lastFee ? <span className="text-[11px] text-lo">최근 이적료 {money(p.lastFee)}</span> : null}</div>
      {!spells.length ? <div className="text-[12px] text-lo">{hist === null && !p.career.length ? '이력을 불러오는 중…' : '기록된 경력이 없습니다'}</div> : (
        <ul className="space-y-1.5">
          {[...spells].reverse().map((sp, i) => (
            <li key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${i === 0 && sp.club === p.clubId ? 'bg-ink-900' : ''}`}>
              <span className="tnum w-[74px] shrink-0 text-lo">{sp.from === sp.to ? yy(sp.from) : `${yy(sp.from)}–${yy(sp.to)}`}</span>
              <Crest clubId={sp.club} size={16} />
              <span className="min-w-0 flex-1 truncate text-hi">{clubKo(sp.club)}</span>
              <span className="tnum shrink-0 text-lo">{sp.ovr ? (sp.ovr[0] === sp.ovr[1] ? `능력 ${sp.ovr[0]}` : `능력 ${sp.ovr[0]}→${sp.ovr[1]}`) : `${sp.apps}경기 ${sp.goals}골`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND: Record<TraitKind, { label: string; cls: string }> = {
  positive: { label: '긍정', cls: 'border-neon/40 text-neon' },
  double: { label: '양날의 검', cls: 'border-amber/40 text-amber' },
  negative: { label: '부정', cls: 'border-red/40 text-red' },
};

function Traits({ p }: { p: PlayerState }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between"><span className="text-[11px] font-semibold text-lo">호칭</span><span className="text-[11px] text-lo">{p.traits.length}/3</span></div>
      {p.traits.length === 0 ? <div className="text-[12px] leading-relaxed text-lo">아직 호칭이 없습니다. 경기에서 보여준 플레이가 쌓이면 낮은 확률로 붙습니다.</div> : (
        <div className="space-y-2">
          {p.traits.map((id) => { const t = TRAIT.get(id); if (!t) return null; const k = KIND[t.kind]; return (
            <div key={id} className="rounded-lg bg-ink-900 px-3 py-2.5">
              <div className="flex items-center gap-2"><span className={`rounded border px-1.5 py-px text-[13px] font-semibold ${k.cls}`}>{t.ko}</span><span className="text-[11px] text-lo">{k.label}{t.permanent ? ' · 영구' : ''}</span></div>
              <div className="mt-1.5 text-[12px] text-lo">{t.how}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[12px]">{t.plus && <span className="text-neon">+ {t.plus}</span>}{t.minus && <span className="text-red">− {t.minus}</span>}</div>
            </div>
          ); })}
          <div className="text-[11px] text-lo">이 세이브에서 게임이 만든 평가이며 실제 선수와 무관합니다</div>
        </div>
      )}
    </div>
  );
}

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

export function PlayerPanel({ p, age, ko, nation, actions, club }: { p: PlayerState; age: number; ko: string; nation: string; actions?: ReactNode; club?: boolean }) {
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
            {club && <div className="mt-1 flex items-center gap-1.5 text-[12px] text-mid">{p.clubId ? <><Crest clubId={p.clubId} size={14} />{clubKo(p.clubId)}</> : <span className="text-neon">자유계약 (FA)</span>}</div>}
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
        {p.cupStats?.apps ? <div className="mt-2 text-center text-[11px] text-lo">리그 기록 · 컵 대회 {p.cupStats.apps}경기 {p.cupStats.goals}골 {p.cupStats.assists}도움</div> : null}
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        {p.clubId && (p.dev ?? 0) !== 0 && (
          <div className="mb-3 text-[12px] text-lo">지난달 훈련 성장 <span className={(p.dev ?? 0) > 0.05 ? 'text-neon' : (p.dev ?? 0) < -0.05 ? 'text-red' : 'text-mid'}>{(p.dev ?? 0) > 0.05 ? '↑ 잘 자라는 중' : (p.dev ?? 0) < -0.05 ? '↓ 정체 · 하락' : '→ 보통'}</span> · 오른쪽 작은 숫자는 훈련으로 바뀐 만큼</div>
        )}
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
                      {/* 훈련으로 바뀐 만큼 (실제 기준선 대비) */}
                      <span className={`tnum w-7 text-right text-[11px] ${(p.growth[k] ?? 0) >= 0.5 ? 'text-neon' : (p.growth[k] ?? 0) <= -0.5 ? 'text-red' : 'text-transparent'}`}>
                        {Math.abs(p.growth[k] ?? 0) >= 0.5 ? `${(p.growth[k] ?? 0) > 0 ? '+' : ''}${Math.round(p.growth[k] ?? 0)}` : '0'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Traits p={p} />
        <Career p={p} />
        {(p.honours?.length || p.boost) ? (
          <div className="mb-5">
            <div className="mb-2 flex items-baseline justify-between"><span className="text-[11px] font-semibold text-lo">수상 경력</span>{p.boost && <span className="text-[11px] text-neon">수상 효과 능력 +{p.boost.amount} · {p.boost.months}개월 남음</span>}</div>
            <ul className="space-y-1 text-[12px]">
              {[...(p.honours ?? [])].reverse().map((h, i) => (
                <li key={i} className="flex justify-between"><span className={isTrophy(h.kind) ? 'text-[#f2c94c]' : 'text-hi'}>{AWARD_KO[h.kind]}{isTrophy(h.kind) ? ` · ${compKo(h.league)}` : ''}</span><span className="tnum text-lo">{h.season.replace('-', '/')}</span></li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mb-2 text-[11px] font-semibold text-lo">언론 평가</div>
        <ul className="space-y-1 text-[13px] text-mid">
          {pressNotes(p).map((n) => <li key={n} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon/70" />{n}</li>)}
        </ul>
        <div className="mt-4 text-[12px] text-lo">주급 {money(p.wage)} · 계약 {p.contract ? p.contract.slice(0, 7).replace('-', '.') + (p.contractGen ? ' (게임 설정)' : '') : p.clubId ? '정보 없음' : '없음 (FA)'} · 최근 폼 {p.recentRatings.length ? formAvg(p).toFixed(1) : '–'}</div>
      </div>
      {actions && <div className="shrink-0 border-t border-line px-5 py-4">{actions}</div>}
    </aside>
  );
}
