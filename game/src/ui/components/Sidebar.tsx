import { Crest } from './Crest';
import { Icon } from './Icon';
import { useApp, type HubTab } from '../../store/app';
import { clubKo, leagues } from '../../data/db';
import { useWorld } from '../hooks';

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
  const unreadInjuries = club.squad.filter((id) => w.players[id].injury).length;
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-ink-900">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Crest clubId={club.id} size={34} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-[-0.02em]">{clubKo(club.id)}</div>
          <div className="truncate text-[12px] text-lo">{lg?.ko} · {w.season.replace('-', '/')}</div>
        </div>
      </div>
      <div className="mx-5 h-px bg-line" />

      <nav className="mt-3 flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((n) => {
          const active = tab === n.key;
          return (
            <button key={n.key} onClick={() => setTab(n.key)}
              className={`group relative flex h-10 items-center gap-3 rounded-[5px] px-3 text-[14px] transition-colors ${
                active ? 'bg-neon-ghost font-semibold text-hi' : n.ready ? 'text-mid hover:bg-ink-800 hover:text-hi' : 'text-lo hover:bg-ink-800'}`}>
              {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-neon shadow-[0_0_10px_rgb(57_255_20/0.7)]" />}
              <Icon name={n.icon} className={active ? 'text-neon' : 'text-lo group-hover:text-mid'} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === 'squad' && unreadInjuries > 0 && (
                <span title="부상자" className="tnum rounded-[4px] bg-red/15 px-1.5 text-[11px] leading-[18px] font-bold text-red">{unreadInjuries}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <button onClick={() => go('title')}
          className="flex h-9 w-full items-center gap-3 rounded-[5px] px-3 text-[13px] text-lo transition-colors hover:bg-ink-800 hover:text-mid">
          <Icon name="settings" size={16} />
          메인 메뉴
        </button>
      </div>
    </aside>
  );
}
