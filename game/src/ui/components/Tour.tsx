// 처음 게임에 들어오면 한 번 도는 튜토리얼: 화면을 옮겨 다니며 곳곳을 비추고 기본 조작을 설명
//  끝내거나 건너뛰면 이 브라우저에 기록 (다시 안 뜸). 도움말 → '튜토리얼 다시 보기' 로 언제든
//  튜토리얼 내용이 크게 바뀌면 VERSION 을 올린다 → 예전 튜토리얼을 본 사람에게도 한 번 더 뜸
import { useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { useApp, type HubTab } from '../../store/app';

const KEY = 'pitchboss.tutorial';
const VERSION = 'v2';   // 2026-11-13: 뉴스 · 선발 표시 · 라커룸 · 끌어서 포메이션 · 후보 편집 · 이적 조항
export const tutorialDone = () => { try { return localStorage.getItem(KEY) === VERSION; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(KEY, VERSION); } catch { /* 무시 */ } };
/** 다음에 게임에 들어갈 때 다시 보이게 (첫 화면 도움말에서) */
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } };

export const useTour = create<{ open: boolean; start(): void; stop(): void }>((set) => ({
  open: false,
  start: () => set({ open: true }),
  stop: () => { markDone(); set({ open: false }); useApp.getState().setTab('home'); },
}));

/** target: 비출 곳 (data-tour) · tab: 먼저 이 화면으로 이동 */
interface Step { target?: string; tab?: HubTab; title: string; body: string; narrowOnly?: boolean }
const ALL_STEPS: Step[] = [
  { title: 'PITCH BOSS에 오신 걸 환영합니다', body: '이제 이 구단의 감독입니다. 선수단을 꾸리고, 전술을 짜고, 이적시장에서 선수를 사고팔며 이사회와 팬의 기대에 맞춰 성적을 내야 합니다. 화면을 옮겨 다니며 기본 조작을 보여 드릴게요 (2분 정도).' },
  { target: 'continue', tab: 'home', title: '계속 — 시간을 흐르게 하기', body: "'계속'을 누르면 날짜가 진행됩니다. 경기 날이나 중요한 일(이적시장 마감 · 재계약 요청 등)이 생기면 알아서 멈춥니다. 스페이스 키로도 누를 수 있습니다." },
  { target: 'nav-home', tab: 'home', title: '홈', body: '다음 경기, 리그 순위, 팀 상태, 진행 중인 이적 소문을 한눈에 봅니다. 무엇부터 할지 모르겠으면 여기부터 보세요.' },
  { target: 'nav-inbox', title: '받은편지함', body: '경기 결과, 부상, 이적 제안, 이사회 · 팬 소식, 스카우트 보고서, 라커룸 소식처럼 내 구단 일이 모두 여기에 쌓입니다.' },
  { target: 'nav-news', title: '뉴스 · 이적 소문', body: '리그 전체의 큰 이적 · 바이아웃 · 급매물 · 감독 교체 소식과 이적 소문을 봅니다. 소문은 출처 신뢰도(★)가 높을수록 사실이 될 가능성이 크고, 내 선수에 대한 소문은 실제 영입 제안으로 이어지기도 합니다.' },
  { target: 'squad-filter', tab: 'squad', title: '선수단 — 선발 · 후보 한눈에', body: "등번호가 초록 원이고 줄 왼쪽에 초록 막대가 있으면 지금 선발, 파란 테두리 · 파란 막대면 후보입니다. '선발 · 후보' 버튼으로 모아 볼 수 있어요. 선수를 누르면 능력치 · 포지션별 능력 · 계약 · 바이아웃을 보고, 불만이 있는 선수는 이름 아래에 사유가 나옵니다." },
  { target: 'squad-chem', tab: 'squad', title: '팀 케미 · 라커룸', body: '함께한 시간 · 말이 통하는 동료 · 사기 · 주장 리더십으로 정해지는 팀 케미는 경기력에 조금 영향을 줍니다. 누르면 라커룸이 열려 주장을 정하고, 영향력 있는 선수의 상태를 보고, 한 달에 한 번 팀 미팅을 열 수 있습니다.' },
  { target: 'tactics-pitch', tab: 'tactics', title: '전술 — 피치에서 바로 바꾸기', body: '자리를 누르면 그 자리에 넣을 선수를 고릅니다. 선수를 다른 선수 위로 끌면 두 자리가 바뀌고, 피치의 빈 곳으로 끌면 그 위치 포지션으로 바뀌면서 포메이션도 자동으로 바뀝니다 (예: 윙어를 가운데 위로). 휴대폰은 손가락으로 끌면 됩니다.' },
  { target: 'tactics-bench', tab: 'tactics', title: '후보 명단', body: '후보는 ✕ 로 빼고, 명단 밖 선수를 + 로 넣습니다. 후보로 정한 선수는 자동 선발에 쓰지 않습니다. 전술 화면에서는 포메이션 · 공수 성향 · 압박 강도 · 세트피스 키커 · 훈련도 정합니다.' },
  { target: 'nav-schedule', title: '일정 · 순위', body: '리그 · 컵 · 유럽 대회 일정과 결과, 순위표를 봅니다. 경기가 몰리면 체력이 다 차지 않으니 로테이션을 생각하세요.' },
  { target: 'transfers-top', tab: 'transfers', title: '이적 — 시장 상황', body: '이적시장이 열렸는지, 마감까지 며칠 남았는지(D-day), 예산과 주급 여유를 봅니다. 마감 3일 전과 마감 당일(데드라인 데이)에는 알림이 뜹니다.' },
  { target: 'nav-transfers', tab: 'transfers', title: '이적 — 영입 · 임대 · 조항', body: "선수를 골라 영입 협상이나 임대를 제안합니다. 리그 필터의 '보스만'은 이적료 없이 사전 계약할 수 있는 선수, '급매물'은 강제 매각 · 강등 조항으로 싸게 나온 선수입니다. 바이아웃 금액을 내면 구단은 거절할 수 없고, 임대에는 완전 영입 옵션 · 의무 이적을 걸 수 있습니다." },
  { target: 'nav-finance', title: '재정', body: '수입 · 지출과 잔고 추이, 재정 규정 한도를 확인합니다. 모든 구단이 같은 규칙으로 돈을 벌고 씁니다. 한도를 크게 넘은 구단은 핵심 선수를 싸게 내놓기도 합니다.' },
  { target: 'nav-club', title: '구단', body: '감독 계약 · 이사회 관계 · 팬 여론 · 시즌 목표 · 시설을 봅니다. 이사회에 예산이나 시설 투자를 요청할 수도 있습니다.' },
  { title: '경기 날', body: "경기 날에는 '경기 준비' 화면이 나옵니다. 전술 화면과 같은 방법으로 선발 · 후보 · 포메이션을 바꾸고 킥오프하면, 문자 중계를 보며 하프타임에 교체 · 전술을 바꿀 수 있습니다. '결과만 보기'를 누르면 바로 결과가 나옵니다." },
  { target: 'search', title: '검색', body: '선수 · 구단 · 리그를 바로 찾습니다. / 키를 누르면 바로 검색창으로 갑니다.' },
  { target: 'save', title: '저장', body: '진행할 때마다 자동 저장됩니다. 슬롯에 따로 저장하거나, 파일(.pitchboss)로 내 PC에 보관할 수도 있습니다.' },
  { target: 'help', title: '도움말 · 설정', body: "막히면 도움말에 사용 설명서가 있습니다. 이 튜토리얼도 거기서 다시 볼 수 있어요. 설정에서는 진행 방식 · 팝업 빈도 · 난이도를 바꾸고, '업데이트 내역' 탭에서 지금까지 바뀐 점을 모두 볼 수 있습니다." },
  { target: 'menu', title: '메뉴 (휴대폰)', body: '화면이 좁으면 메뉴가 서랍에 들어갑니다. 왼쪽 위 ☰ 버튼을 누르면 메뉴가 나오고, 메뉴를 고르면 다시 들어갑니다.', narrowOnly: true },
  { title: '준비 끝!', body: "선수단과 전술을 한 번 둘러본 뒤 '계속'을 눌러 시즌을 시작해 보세요. 행운을 빕니다, 감독님." },
];

export function Tour() {
  const STEPS = ALL_STEPS.filter((s) => !s.narrowOnly || window.innerWidth < 1024);
  const { open, start, stop } = useTour();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // 처음이면 (또는 튜토리얼이 새로 바뀌었으면) 자동으로 시작
  useEffect(() => { if (!tutorialDone()) { const t = setTimeout(start, 600); return () => clearTimeout(t); } }, [start]);
  useEffect(() => { if (open) setI(0); }, [open]);
  const step = STEPS[i];
  useLayoutEffect(() => {
    if (!open) return;
    // 이 단계의 화면으로 이동
    if (step.tab && useApp.getState().tab !== step.tab) useApp.getState().setTab(step.tab);
    // 좁은 화면: 메뉴 안에 있는 대상(메뉴 항목 · 저장 · 도움말)이면 서랍을 열어서 보여 준다
    const inDrawer = !!step.target && (step.target.startsWith('nav-') || step.target === 'save' || step.target === 'help');
    const narrow = window.innerWidth < 1024;
    useApp.getState().setDrawer(narrow && inDrawer);
    const el = () => (step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null);
    const find = () => setRect(el()?.getBoundingClientRect() ?? null);
    find();
    // 화면이 바뀌거나 서랍이 열린 뒤 다시 잼 · 화면 밖이면 보이게 스크롤
    const t1 = setTimeout(() => { el()?.scrollIntoView({ block: 'nearest' }); find(); }, 120);
    const t2 = setTimeout(find, 320);
    window.addEventListener('resize', find);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', find); };
  }, [open, step]);
  useEffect(() => { if (!open) useApp.getState().setDrawer(false); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i === STEPS.length - 1) stop(); else setI(i + 1); }
      else if (e.key === 'ArrowLeft') setI(Math.max(0, i - 1));
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open, i, stop]);
  if (!open) return null;

  const pad = 6;
  // 비출 곳이 화면보다 크면 화면 안으로 잘라서
  const hole = rect && (() => {
    const top = Math.max(8, rect.top - pad), bottom = Math.min(window.innerHeight - 8, rect.bottom + pad);
    return { left: rect.left - pad, top, width: rect.width + pad * 2, height: Math.max(0, bottom - top) };
  })();
  // 설명 카드 위치: 대상 오른쪽 (자리가 없으면 위 · 아래), 대상이 없으면 가운데
  const W = Math.min(380, window.innerWidth - 32);
  let card: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: W };
  if (hole && window.innerWidth < 640) {
    // 휴대폰: 대상이 화면 아래쪽이면 카드는 위에, 아니면 아래에
    const low = hole.top + hole.height / 2 > window.innerHeight / 2;
    card = low ? { left: 16, right: 16, top: 'max(16px, env(safe-area-inset-top))' } : { left: 16, right: 16, bottom: 'max(16px, env(safe-area-inset-bottom))' };
  } else if (hole) {
    const right = hole.left + hole.width + 16;
    if (right + W < window.innerWidth - 16) card = { left: right, top: Math.min(Math.max(16, hole.top), window.innerHeight - 280) };
    else if (hole.left - W - 16 > 16) card = { left: hole.left - W - 16, top: Math.min(Math.max(16, hole.top), window.innerHeight - 280) };
    else if (hole.top > 260) card = { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), window.innerWidth - W - 16), top: Math.max(16, hole.top - 250) };
    else card = { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), window.innerWidth - W - 16), top: Math.min(hole.top + hole.height + 16, window.innerHeight - 260) };
  }
  return (
    <div data-tour-overlay className="fixed inset-0 z-[90]">
      {hole
        ? <div className="pointer-events-none absolute rounded-lg ring-2 ring-neon transition-all duration-300" style={{ ...hole, boxShadow: '0 0 0 9999px rgb(5 8 6 / 0.78)' }} />
        : <div className="absolute inset-0 bg-ink-950/80" />}
      <div className="absolute max-h-[calc(100dvh-32px)] max-w-[380px] animate-[fade_0.25s_ease-out] overflow-y-auto sm:w-[380px] rounded-xl border border-line bg-ink-900 p-5 shadow-2xl" style={card} key={i}>
        <div className="mb-1 flex items-center justify-between text-[11px] text-lo"><span className="font-semibold text-neon">튜토리얼</span><span className="tnum">{i + 1} / {STEPS.length}</span></div>
        <h3 className="text-[16px] font-semibold">{step.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-mid">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={stop} className="mr-auto text-[12px] text-lo hover:text-hi">건너뛰기</button>
          {i > 0 && <button onClick={() => setI(i - 1)} className="rounded-md px-3 py-1.5 text-[12px] text-mid hover:text-hi">이전</button>}
          <button autoFocus onClick={() => (i === STEPS.length - 1 ? stop() : setI(i + 1))} className="rounded-md bg-neon px-4 py-1.5 text-[12px] font-semibold text-ink-950">{i === STEPS.length - 1 ? '시작하기' : '다음'}</button>
        </div>
      </div>
    </div>
  );
}
