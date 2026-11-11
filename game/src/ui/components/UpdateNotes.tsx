// 첫 화면 '업데이트 소식': 새 버전을 처음 본 뒤 24시간 동안 표시, 그 뒤 자동으로 사라짐
//  여러 버전을 건너뛰었으면 마지막으로 본 버전 이후 내역을 모두 보여 준다. 이 브라우저에만 기록 (localStorage)
import { useState } from 'react';
import { changesSince, GAME_VERSION, type ChangeEntry } from '../../version';

const KEY = 'pitchboss.update';
const DAY = 24 * 60 * 60 * 1000;
interface Seen { v: string; from: string | null; at: number }

function notesToShow(): ChangeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const seen: Seen | null = raw ? JSON.parse(raw) : null;
    const now = Date.now();
    if (!seen || seen.v !== GAME_VERSION) {
      const next: Seen = { v: GAME_VERSION, from: seen?.v ?? null, at: now };
      localStorage.setItem(KEY, JSON.stringify(next));
      return changesSince(next.from);
    }
    return now - seen.at < DAY ? changesSince(seen.from) : [];
  } catch { return []; }
}
function dismiss() {
  try { const raw = localStorage.getItem(KEY); if (raw) localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(raw), at: 0 })); } catch { /* 무시 */ }
}

export function UpdateNotes() {
  const [list, setList] = useState(notesToShow);
  if (!list.length) return null;
  return (
    <aside className="absolute top-8 right-8 z-10 w-[360px] animate-[fade_0.4s_ease-out] rounded-xl border border-line bg-ink-900/90 p-5 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-neon">업데이트 소식</span>
        <button onClick={() => { dismiss(); setList([]); }} className="text-[11px] text-lo hover:text-hi">닫기</button>
      </div>
      <div className="max-h-[420px] space-y-4 overflow-auto pr-1">
        {list.map((e) => (
          <div key={e.version}>
            <div className="mb-1.5 flex items-baseline gap-2"><span className="tnum text-[14px] font-semibold">v{e.version}</span><span className="tnum text-[11px] text-lo">{e.date.replace(/-/g, '.')}</span></div>
            <ul className="space-y-1 text-[12px] leading-relaxed text-mid">
              {e.items.map((t) => <li key={t} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon/70" />{t}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-lo">하루가 지나면 자동으로 사라집니다</div>
    </aside>
  );
}
