import { JobModal } from '../components/ManagerCard';
import { BoardEventModal } from '../components/BoardEventModal';
import { PressModal } from '../components/PressModal';
import { SagaModal } from '../components/SagaModal';
import { ScandalModal } from '../components/ScandalModal';
import { EventResultModal } from '../components/EventResult';
import { Tour } from '../components/Tour';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { ContinueBar } from '../components/ContinueBar';
import { SeasonReportPanel } from '../components/SeasonReportPanel';
import { TransferCeremony } from '../components/TransferCeremony';
import { useGame } from '../../store/game';
import { useApp, type HubTab } from '../../store/app';
import { clubKo } from '../../data/db';
import { useWorld } from '../hooks';
import { HomeView } from '../views/HomeView';
import { SquadView } from '../views/SquadView';
import { TableView } from '../views/TableView';
import { ScheduleView } from '../views/ScheduleView';
import { InboxView } from '../views/InboxView';
import { TacticsView } from '../views/TacticsView';
import { TransfersView } from '../views/TransfersView';
import { FinanceView } from '../views/FinanceView';
import { ClubView } from '../views/ClubView';
import { AwardCeremony } from '../components/AwardCeremony';
import { RetireNews } from '../components/RetireNews';
import { SearchModals } from '../components/SearchModals';
import { RenewalRequests } from '../components/RenewalRequests';
import { DeadlineAlert } from '../components/DeadlineAlert';

const TITLES: Record<HubTab, string> = {
  home: '홈', inbox: '받은편지함', squad: '선수단', tactics: '전술', schedule: '일정',
  table: '순위', transfers: '이적', finance: '재정', club: '구단',
};

export function HubScreen() {
  const tab = useApp((s) => s.tab);
  const w = useWorld();
  const ceremony = useGame((s) => s.ceremony);
  const preset = useApp((s) => s.transferPreset);
  const closeCeremony = useGame((s) => s.closeCeremony);
  const view = {
    home: <HomeView />, squad: <SquadView />, table: <TableView />, schedule: <ScheduleView />,
    inbox: <InboxView />, finance: <FinanceView />, club: <ClubView />, tactics: <TacticsView />, transfers: <TransfersView key={preset ? preset.label + preset.minOvr : 'free'} />,
  }[tab as string];

  return (
    <div className="flex h-full animate-[fade_0.35s_ease-out] bg-ink-950">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar title={TITLES[tab]} subtitle={`${clubKo(w.userClubId)} · 1군`} />
        <div className="min-h-0 flex-1">
          {view ?? (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-px w-10 bg-neon" />
                <div className="text-[17px] font-semibold">{TITLES[tab]} 화면은 준비 중입니다</div>
                <div className="mt-1 text-[13px] text-lo">다음 단계에서 구현됩니다.</div>
              </div>
            </div>
          )}
        </div>
        <ContinueBar />
      </main>
      <SeasonReportPanel />
      {ceremony && <TransferCeremony c={ceremony} onClose={closeCeremony} />}
      <AwardCeremony />
      <RetireNews />
      <SearchModals />
      <RenewalRequests />
      <DeadlineAlert />
      <JobModal />
      <BoardEventModal />
      <PressModal />
      <SagaModal />
      <ScandalModal />
      <EventResultModal />
      <Tour />
    </div>
  );
}
