import { Crest } from './Crest';
import { Icon } from './Icon';
import { useApp, type HubTab } from '../../store/app';
import { clubKo, leagues } from '../../data/db';
import { useWorld } from '../hooks';
import { useState } from 'react';
import { useGame } from '../../store/game';
import { SaveSlots } from './SaveSlots';

const NAV: { key: HubTab; label: string; icon: string; ready?: boolean }[] = [
  { key: 'home', label: '홈', icon: 'home', ready: true },
  { key: 'inbox', label: '받은편지함', icon: 'inbox', ready: true },
  { key: 'squad', label: '선수단', icon: 'squad', ready: true },
  { key: 'tactics', label: '전술', icon: 'tactics', ready: true },
  { key: 'schedule', label: '일정', icon: 'schedule', ready: true },
  { key: 'table', label: '순위', icon: 'table', ready: true },
  { key: 'transfers', label: '이적', icon: 'transfers' },
  { key: 'finance', label: '재정', icon: 'finance' },
  { key: 'club', label: '구단', icon: 'club' },
];

export function Sidebar() {
  const { tab, setTab, go } = useApp();
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const lg = leagues.find((l) => l.id === club.league);
  const save = useGame((s) => s.save);
  const [saveOpen, setSaveOpen] = useState(false);
  const unreadInjuries = club.squad.filter((id) => w.players[id].injury).length;
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-ink-900">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Crest clubId={club.id} size={34} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{clubKo(club.id)}</div>
          <div className="truncate text-[12px] text-lo">{lg?.ko} · {w.season.replace('-', '/')}</div>
        </div>
      </div>
      <div className="mx-5 h-px bg-line" />

      <nav className="mt-3 flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((n) => {
          const active = tab === n.key;
          return (
            <button key={n.key} onClick={() => setTab(n.key)}
              className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${
                active ? 'bg-neon-ghost font-semibold text-hi' : n.ready ? 'text-mid hover:bg-ink-800 hover:text-hi' : 'text-lo hover:bg-ink-800'}`}>
              {active && <span className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-r-full bg-neon" />}
              <Icon name={n.icon} className={active ? 'text-neon' : 'text-lo group-hover:text-mid'} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === 'squad' && unreadInjuries > 0 && (
                <span title="부상자" className="tnum rounded-md bg-red/15 px-1.5 text-[11px] leading-5 font-semibold text-red">{unreadInjuries}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="relative border-t border-line p-3">
        {saveOpen && (
          <div className="panel absolute bottom-full left-3 z-40 mb-2 w-[340px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="text-[13px] font-semibold">저장하기</span><button onClick={() => setSaveOpen(false)} className="text-[12px] text-lo hover:text-hi">닫기</button></div>
            <SaveSlots mode="save" onPick={async (slot) => { await save(slot); }} />
            <div className="border-t border-line px-5 py-2 text-[12px] text-lo">진행할 때마다 자동 저장도 됩니다</div>
          </div>
        )}
        <button onClick={() => setSaveOpen((v) => !v)}
          className="mb-1 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-mid transition-colors hover:bg-ink-800 hover:text-hi">
          <Icon name="inbox" size={16} />
          저장하기
        </button>
        <button onClick={() => go('title')}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-lo transition-colors hover:bg-ink-800 hover:text-mid">
          <Icon name="settings" size={16} />
          메인 메뉴
        </button>
      </div>
    </aside>
  );
}
