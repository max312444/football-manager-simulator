// 새 게임: 내 감독 (이름 · 축구 철학 · 압박 · 강점) · 난이도. 마지막으로 고른 값은 이 브라우저에 기억
import { useState } from 'react';
import type { Pressing } from '../../engine/types';
import { PHILOSOPHY_KO, STRENGTH_KO, type Philosophy, type Strength, type UserManagerInput } from '../../engine/managers';
import { DIFFICULTY_KO, difficultyPreset, type Difficulty } from '../../engine/gameSettings';
import { useSettings } from '../../store/settings';

const KEY = 'pitchboss.manager';
const DEFAULT: UserManagerInput = { name: '', philosophy: 'balance', pressing: 1, strength: 'tac' };
function read(): UserManagerInput { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; } }

export function useManagerSetup() {
  const [m, setM] = useState<UserManagerInput>(read);
  const change = (c: Partial<UserManagerInput>) => setM((x) => { const n = { ...x, ...c }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* 무시 */ } return n; });
  return { m, change };
}

const PRESS_KO: [Pressing, string][] = [[0, '낮음'], [1, '보통'], [2, '높음']];
const STRENGTH_HINT: Record<Strength, string> = { tac: '경기력 ↑', mot: '사기 ↑', dev: '유망주 성장 ↑' };
const DIFF_HINT: Record<Difficulty, string> = {
  easy: '상대가 평소 실력 · 이사회 너그러움 · 이적 쉬움',
  normal: '상대가 나와 싸울 때 조금 더 집중 (+5%) · 기본 규칙',
  hard: '상대가 나와 싸울 때 +10% · 이사회 엄격 · 재정 규정 엄격 · 이적 어려움',
};

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-lg bg-ink-950 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`h-8 rounded-md px-1 text-[12px] whitespace-nowrap transition-colors ${value === v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{label}</button>
      ))}
    </div>
  );
}

export function ManagerSetup({ m, change }: ReturnType<typeof useManagerSetup>) {
  const diff = useSettings((s) => s.s.difficulty);
  const setSettings = useSettings((s) => s.set);
  return (
    <div className="space-y-3 border-b border-line px-6 py-5 text-[12px]" data-tour="manager-setup">
      <div className="text-[11px] font-semibold text-lo">내 감독</div>
      <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-ink-850 px-3">
        <span className="shrink-0 text-lo">이름</span>
        <input value={m.name} maxLength={20} placeholder="감독 이름" onChange={(e) => change({ name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-right text-[14px] font-semibold text-hi outline-none placeholder:font-normal placeholder:text-lo" />
      </label>
      <div><div className="mb-1 text-lo">축구 철학 <span className="text-[11px]">· 이 성향으로 싸우면 조금 더 강함</span></div>
        <Seg value={m.philosophy} options={(Object.keys(PHILOSOPHY_KO) as Philosophy[]).map((k) => [k, PHILOSOPHY_KO[k]])} onChange={(v) => change({ philosophy: v })} /></div>
      <div><div className="mb-1 text-lo">선호 압박</div>
        <Seg value={m.pressing} options={PRESS_KO} onChange={(v) => change({ pressing: v })} /></div>
      <div><div className="mb-1 text-lo">강점 <span className="text-[11px]">· {STRENGTH_HINT[m.strength]}</span></div>
        <Seg value={m.strength} options={(Object.keys(STRENGTH_KO) as Strength[]).map((k) => [k, STRENGTH_KO[k]])} onChange={(v) => change({ strength: v })} /></div>
      <div className="pt-1"><div className="mb-1 text-lo">난이도</div>
        <Seg value={diff} options={(Object.keys(DIFFICULTY_KO) as Difficulty[]).map((k) => [k, DIFFICULTY_KO[k]])} onChange={(v) => setSettings(difficultyPreset(v) as Parameters<typeof setSettings>[0])} />
        <div className="mt-1.5 text-[11px] leading-relaxed text-lo">{DIFF_HINT[diff]}</div></div>
      <div className="text-[11px] leading-relaxed text-lo">신입 감독으로 시작합니다 (능력 55, 강점 65). 성적을 내면 능력이 오릅니다. 철학 · 압박 · 이름은 나중에 구단 화면에서 바꿀 수 있습니다.</div>
    </div>
  );
}
