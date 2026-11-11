// 처음 게임에 들어오면 한 번 도는 튜토리얼: 화면 곳곳을 비추며 기본 조작을 설명
//  끝내거나 건너뛰면 이 브라우저에 기록 (다시 안 뜸). 도움말 → '튜토리얼 다시 보기' 로 언제든
import { useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'zustand';

const KEY = 'pitchboss.tutorial';
export const tutorialDone = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
const markDone = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* 무시 */ } };
/** 다음에 게임에 들어갈 때 다시 보이게 (첫 화면 도움말에서) */
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } };

export const useTour = create<{ open: boolean; start(): void; stop(): void }>((set) => ({
  open: false,
  start: () => set({ open: true }),
  stop: () => { markDone(); set({ open: false }); },
}));

interface Step { target?: string; title: string; body: string }
const STEPS: Step[] = [
  { title: 'PITCH BOSS에 오신 걸 환영합니다', body: '이제 이 구단의 감독입니다. 선수단을 꾸리고, 전술을 짜고, 이적시장에서 선수를 사고팔며 이사회와 팬의 기대에 맞춰 성적을 내야 합니다. 1분 동안 기본 조작을 보여 드릴게요.' },
  { target: 'continue', title: '계속 — 시간을 흐르게 하기', body: "'계속'을 누르면 날짜가 진행됩니다. 경기 날이나 중요한 일이 생기면 알아서 멈춥니다. 스페이스 키로도 누를 수 있습니다. 경기 날에는 '경기 준비'로 바뀝니다." },
  { target: 'nav-home', title: '홈', body: '다음 경기, 리그 순위, 팀 상태, 핵심 선수를 한눈에 봅니다. 무엇부터 할지 모르겠으면 여기부터 보세요.' },
  { target: 'nav-inbox', title: '받은편지함', body: '경기 결과, 부상, 이적 제안, 이사회 · 팬 소식, 스카우트 보고서가 모두 여기에 쌓입니다.' },
  { target: 'nav-squad', title: '선수단', body: '선수를 누르면 능력치, 포지션별 능력, 컨디션, 계약, 역할을 볼 수 있습니다. 재계약과 이적 명단 등록도 여기서 합니다.' },
  { target: 'nav-tactics', title: '전술', body: '포메이션 · 공수 성향 · 압박 강도를 정하고, 피치의 자리를 눌러 선발과 선수별 지시를 정합니다. 세트피스 키커, 훈련 방향, 나만의 포메이션도 여기서 정합니다.' },
  { target: 'nav-schedule', title: '일정 · 순위', body: '리그 · 컵 · 유럽 대회 일정과 결과, 순위표를 봅니다.' },
  { target: 'nav-transfers', title: '이적', body: '선수를 검색해 영입 · 임대 제안을 넣습니다 (이적시장 기간에만). 다른 구단 선수 능력치는 범위로만 보이니 스카우트를 보내 정확히 알아보세요.' },
  { target: 'nav-finance', title: '재정', body: '수입 · 지출과 잔고 추이, 재정 규정 한도를 확인합니다. 모든 구단이 같은 규칙으로 돈을 벌고 씁니다.' },
  { target: 'nav-club', title: '구단', body: '감독 계약 · 이사회 관계 · 팬 여론 · 시즌 목표 · 시설을 봅니다. 이사회에 예산이나 시설 투자를 요청할 수도 있습니다.' },
  { target: 'search', title: '검색', body: '선수 · 구단 · 리그를 바로 찾습니다. / 키를 누르면 바로 검색창으로 갑니다.' },
  { target: 'save', title: '저장', body: '진행할 때마다 자동 저장됩니다. 슬롯에 따로 저장하거나, 파일(.pitchboss)로 내 PC에 보관할 수도 있습니다.' },
  { target: 'help', title: '도움말 · 설정', body: '막히면 도움말에 사용 설명서가 있습니다. 이 튜토리얼도 거기서 다시 볼 수 있어요. 설정에서는 진행 방식, 팝업 빈도, 난이도를 바꿉니다.' },
  { title: '준비 끝!', body: "먼저 선수단과 전술을 한 번 둘러본 뒤 '계속'을 눌러 시즌을 시작해 보세요. 행운을 빕니다, 감독님." },
];

export function Tour() {
  const { open, start, stop } = useTour();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // 처음이면 자동으로 시작
  useEffect(() => { if (!tutorialDone()) { const t = setTimeout(start, 600); return () => clearTimeout(t); } }, [start]);
  useEffect(() => { if (open) setI(0); }, [open]);
  const step = STEPS[i];
  useLayoutEffect(() => {
    if (!open) return;
    const find = () => setRect(step.target ? document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect() ?? null : null);
    find();
    window.addEventListener('resize', find);
    return () => window.removeEventListener('resize', find);
  }, [open, step]);
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
  const hole = rect && { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  // 설명 카드 위치: 대상 오른쪽 (자리가 없으면 위쪽), 대상이 없으면 가운데
  const W = 380;
  let card: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (hole) {
    const right = hole.left + hole.width + 16;
    if (right + W < window.innerWidth - 16) card = { left: right, top: Math.min(Math.max(16, hole.top), window.innerHeight - 260) };
    else card = { left: Math.min(Math.max(16, hole.left + hole.width / 2 - W / 2), window.innerWidth - W - 16), top: Math.max(16, hole.top - 230) };
  }
  return (
    <div data-tour-overlay className="fixed inset-0 z-[90]">
      {hole
        ? <div className="pointer-events-none absolute rounded-lg ring-2 ring-neon transition-all duration-300" style={{ ...hole, boxShadow: '0 0 0 9999px rgb(5 8 6 / 0.78)' }} />
        : <div className="absolute inset-0 bg-ink-950/80" />}
      <div className="absolute w-[380px] animate-[fade_0.25s_ease-out] rounded-xl border border-line bg-ink-900 p-5 shadow-2xl" style={card} key={i}>
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
