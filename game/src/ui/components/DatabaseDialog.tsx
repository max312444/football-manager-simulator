// 첫 화면 '데이터베이스': 수록 데이터 · 실명 데이터 켜고 끄기 · 선수 사진 켜고 끄기 (+ 넣는 방법)
import { useEffect, useState } from 'react';
import { availableSeasons, dataset, leagues, realAvailable, setDataset } from '../../data/db';
import { loadPhotos, photosEnabled, photoStats, setPhotosEnabled } from '../../data/photos';

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-neon' : 'bg-ink-700'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

const Code = ({ children }: { children: string }) => <code className="rounded bg-ink-900 px-1.5 py-0.5 text-[11px] text-mid">{children}</code>;

export function DatabaseDialog({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<ReturnType<typeof photoStats> | null>(null);
  const [server, setServer] = useState<boolean | null>(null);
  const [photosOn, setOn] = useState(photosEnabled());
  useEffect(() => { loadPhotos(true).then((m) => { setServer(!!m); setStats(photoStats(m)); }); }, []);
  const lgs = leagues.filter((l) => availableSeasons(l.id).length).map((l) => ({ ...l, seasons: availableSeasons(l.id) }));

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[640px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-7 py-4">
          <h2 className="text-[17px] font-semibold">데이터베이스</h2>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="space-y-6 overflow-auto px-7 py-6 text-[13px]">
          {/* 실명 데이터 */}
          <section>
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">실명 데이터</div>
                <div className="mt-0.5 text-[12px] text-lo">
                  {realAvailable ? '이 PC에 실명 데이터가 있습니다' : '이 PC에 실명 데이터가 없습니다 — 지금은 패러디 이름(공개 데이터)으로 플레이합니다'}
                </div>
              </div>
              <span className={`text-[12px] ${dataset === 'real' ? 'text-neon' : 'text-lo'}`}>{dataset === 'real' ? '실명 사용 중' : '패러디 이름 사용 중'}</span>
              <Switch on={dataset === 'real'} disabled={!realAvailable} onChange={(v) => setDataset(v ? 'real' : 'public')} />
            </div>
            <div className="mt-2 rounded-lg bg-ink-900 px-4 py-3 text-[12px] leading-relaxed text-mid">
              실명 데이터는 게임에 들어 있지 않습니다. 개인이 직접 넣어야 합니다.
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-lo">
                <li>받은 실명 데이터 폴더를 저장소의 <Code>data/</Code> 자리에 넣고 게임을 다시 켜면 이 스위치가 켜집니다.</li>
                <li>직접 만들 때는 데이터 수집 도구를 씁니다 (README '실명 데이터로 플레이하기').</li>
                <li>빼려면 스위치를 끄거나 <Code>data/</Code> 폴더를 다른 곳으로 옮기면 됩니다. 바꾸면 화면을 다시 불러옵니다.</li>
              </ul>
            </div>
          </section>

          {/* 선수 사진 */}
          <section>
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">선수 사진</div>
                <div className="mt-0.5 text-[12px] text-lo">
                  {server === null ? '확인 중…' : !server ? '사진 기능을 쓸 수 없습니다 (개발 서버로 실행했을 때만 쓸 수 있음)'
                    : stats && stats.files ? `사진 ${stats.files}장 · 사진 있는 선수 ${stats.players}명${stats.user ? ` · 직접 넣은 사진 ${stats.user}장` : ''}` : '아직 넣은 사진이 없습니다'}
                </div>
              </div>
              <span className={`text-[12px] ${photosOn ? 'text-neon' : 'text-lo'}`}>{photosOn ? '표시' : '숨김'}</span>
              <Switch on={photosOn} disabled={!server} onChange={(v) => { setPhotosEnabled(v); setOn(v); }} />
            </div>
            <div className="mt-2 rounded-lg bg-ink-900 px-4 py-3 text-[12px] leading-relaxed text-mid">
              선수 사진은 게임에 들어 있지 않습니다. 개인이 추가해야 합니다.
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-lo">
                <li><b className="text-mid">게임 안에서</b>: 선수 정보의 사진 칸(없으면 '+ 사진')을 누르고 파일을 끌어다 놓거나, 복사한 이미지를 Ctrl+V, 또는 이미지 주소를 붙여 넣습니다. 얼굴 위치는 자동으로 맞춥니다.</li>
                <li><b className="text-mid">직접 모은 사진 한꺼번에</b>: <Code>node tools/data_pipeline photos-ids --club liverpool</Code> 로 선수 ID 목록(CSV)을 뽑고,
                  사진을 <Code>data/photos/inbox/선수ID/2025-26.jpg</Code> 처럼 넣은 뒤 <Code>node tools/data_pipeline photos-import</Code>. 얼굴 위치는 자동으로 맞춥니다.</li>
                <li><b className="text-mid">공개 사진 자동 수집</b>: <Code>tools</Code> 폴더에서 <Code>npm i</Code> 한 번, 그다음 <Code>node tools/data_pipeline photos --club liverpool --season 2025-26</Code></li>
                <li>사진은 <Code>data/photos/</Code> 에만 저장되고 저장소에 올라가지 않습니다. 끄면 사진이 숨겨지고, 폴더를 지우면 완전히 빠집니다.</li>
              </ul>
            </div>
          </section>

          {/* 수록 데이터 */}
          <section>
            <div className="text-[15px] font-semibold">수록 데이터</div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
              {lgs.map((l) => (
                <div key={l.id} className="flex items-center justify-between">
                  <span className="text-mid">{l.ko}</span>
                  <span className="tnum text-[12px] text-lo">{l.seasons[0].slice(0, 4)}~{l.seasons[l.seasons.length - 1].slice(0, 4)} · {l.seasons.length}시즌</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
