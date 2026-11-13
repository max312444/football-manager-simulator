// 감독 능력 표시: 내 감독 카드 (능력 · 철학 · 압박 바꾸기) · 다른 구단 감독 한 줄
import { useState } from 'react';
import { managerAge, managerOf, managerOverall, philosophyOf, PHILOSOPHY_KO, type Manager, type Philosophy } from '../../engine/managers';
import type { Pressing } from '../../engine/types';
import { managerKo, nationKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { Card } from './bits';
import { ratingTone } from '../format';

const PRESS: [Pressing, string][] = [[0, '낮음'], [1, '보통'], [2, '높음']];
const MENT_KO: Record<number, string> = { [-2]: '매우 수비적', [-1]: '수비적', 0: '균형', 1: '공격적', 2: '매우 공격적' };

function Bar({ k, v, hint }: { k: string; v: number; hint: string }) {
  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between text-[12px]"><span className="text-lo">{k}</span><span className={`tnum font-semibold ${ratingTone(v)}`}>{v}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-sky" style={{ width: `${v}%` }} /></div>
    </div>
  );
}
function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-950 p-1">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)} className={`h-7 flex-1 rounded-md px-2 text-[12px] whitespace-nowrap ${value === v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{label}</button>
      ))}
    </div>
  );
}

/** 내 감독: 능력 (성적을 내면 오름) · 철학 · 압박 · 이름 */
export function MyManagerCard() {
  const w = useWorld();
  const edit = useGame((s) => s.editMyManager);
  const m = w.managers?.user;
  const [name, setName] = useState(m?.name ?? '');
  if (!m) return null;
  const room = Math.max(0, m.potential - Math.round((m.tac + m.mot + m.dev) / 3));
  return (
    <Card title="내 감독" action={<span className="text-[11px] text-lo">종합 {managerOverall({ ...m, rep: w.manager?.reputation ?? m.rep })}</span>}>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3">
          <span className="shrink-0 text-[12px] text-lo">이름</span>
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onBlur={() => edit({ name })} onKeyDown={(e) => e.key === 'Enter' && edit({ name })}
            className="min-w-0 flex-1 bg-transparent text-right font-semibold text-hi outline-none" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <Bar k="전술" v={m.tac} hint="경기력: 60보다 높을수록 팀이 강해집니다" />
          <Bar k="동기부여" v={m.mot} hint="선수 사기가 돌아가는 기준이 높아집니다" />
          <Bar k="육성" v={m.dev} hint="선수(특히 젊은 선수) 성장이 빨라집니다" />
        </div>
        <div className="text-[11px] text-lo">{room > 0 ? `성장 여지 +${room} · 시즌마다 기대(전력 순위)보다 잘하면 오르고 우승하면 크게 오릅니다` : '전성기 · 이제 경험으로 유지합니다'}{m.titles ? ` · 우승 ${m.titles}회` : ''}</div>
        <div><div className="mb-1 text-[12px] text-lo">축구 철학 <span className="text-[11px]">· 이 성향(공격 · 수비)으로 싸우면 경기력 조금 ↑</span></div>
          <Seg value={philosophyOf(m)} options={(Object.keys(PHILOSOPHY_KO) as Philosophy[]).map((k) => [k, PHILOSOPHY_KO[k]])} onChange={(v) => edit({ philosophy: v })} /></div>
        <div><div className="mb-1 text-[12px] text-lo">선호 압박 <span className="text-[11px]">· 같은 압박 강도로 싸우면 조금 ↑</span></div>
          <Seg value={m.style.pressing} options={PRESS} onChange={(v) => edit({ pressing: v })} /></div>
      </div>
    </Card>
  );
}

/** 다른 구단 감독 한 줄: 이름 · 나이 · 전술 성향 · 능력 */
export function ManagerLine({ clubId, compact }: { clubId: string; compact?: boolean }) {
  const w = useWorld();
  const m = managerOf(w, clubId);
  if (!m) return null;
  return <ManagerInfo m={m} age={managerAge(w, m)} compact={compact} />;
}
function ManagerInfo({ m, age, compact }: { m: Manager; age: number; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      <span className="text-lo">감독</span>
      <span className="font-semibold text-hi">{managerKo(m)}</span>
      {!compact && <span className="text-lo">{m.birth ? `${age}세 · ` : ''}{nationKo(m.nation)} · {MENT_KO[m.style.mentality]} · 압박 {PRESS[m.style.pressing][1]}</span>}
      <span className="tnum text-lo">전술 <b className={ratingTone(m.tac)}>{m.tac}</b> · 동기 <b className={ratingTone(m.mot)}>{m.mot}</b> · 육성 <b className={ratingTone(m.dev)}>{m.dev}</b></span>
    </div>
  );
}
