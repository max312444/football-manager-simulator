// 게임 시작 전 안내: 감독 시뮬레이터이며 실제 선수 · 평가 · 보도가 아님을 한 번 알린다
import { Icon } from './Icon';

const KEY = 'pitchboss.notice.v1';
export const noticeSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch { /* 저장 못 해도 진행 */ } };

export function NoticeDialog({ onClose, confirmLabel = '확인하고 시작' }: { onClose: () => void; confirmLabel?: string }) {
  const close = () => { markSeen(); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-8 backdrop-blur-sm">
      <div className="panel w-full max-w-[560px] overflow-hidden">
        <div className="px-8 pt-8 pb-6">
          <div className="text-[12px] text-lo">시작하기 전에</div>
          <h2 className="mt-2 text-[22px] font-semibold">이 게임은 축구 감독 시뮬레이터입니다</h2>
          <ul className="mt-6 space-y-4 text-[14px] leading-relaxed text-mid">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <span>등장하는 선수 · 구단 · 리그는 <span className="text-hi">게임 속 가상의 존재</span>이며, 실제 인물이나 단체와 관계가 없습니다.</span></li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <span>능력치 · 몸값 · 호칭 · 언론 평가는 모두 <span className="text-hi">게임이 만든 값</span>이며, 실제 선수에 대한 평가나 실제 보도가 아닙니다.</span></li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <span>경기 결과와 이적은 시뮬레이션으로 정해지며, 세이브마다 다른 이야기가 펼쳐집니다.</span></li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
              <span>비공식 팬 프로젝트로, 어떤 리그 · 구단 · 게임사의 승인도 받지 않았습니다.</span></li>
          </ul>
        </div>
        <footer className="flex items-center justify-between border-t border-line px-8 py-5">
          <span className="text-[12px] text-lo">데이터 출처: Wikidata · Wikipedia</span>
          <button onClick={close} className="flex h-11 items-center gap-2 rounded-lg bg-neon px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">
            {confirmLabel} <Icon name="arrow" size={17} />
          </button>
        </footer>
      </div>
    </div>
  );
}
