// 첫 화면 '데이터베이스': 수록 데이터 · 실명 데이터 켜고 끄기 · 선수 사진 켜고 끄기 (+ 넣는 방법)
import { useEffect, useRef, useState } from 'react';
import { availableSeasons, dataset, leagues, realAvailable, realSource, setDataset } from '../../data/db';
import { clearRealPack, filesFromDrop, importRealFolder, realBoot, type PickedFile } from '../../data/realStore';
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
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-2 sm:p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[640px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 sm:px-7 py-4">
          <h2 className="text-[17px] font-semibold">데이터베이스</h2>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="space-y-6 overflow-auto px-4 sm:px-7 py-6 text-[13px]">
          {/* 실명 데이터 */}
          <section>
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">실명 데이터</div>
                <div className="mt-0.5 text-[12px] text-lo">
                  {realSource === 'folder' ? '이 PC의 data/ 폴더에 실명 데이터가 있습니다'
                    : realSource === 'browser' && realBoot.info ? `이 브라우저에 넣어 둔 실명 데이터: 시즌 ${realBoot.info.seasons}개 · 리그 ${realBoot.info.leagues.length}개 (${realBoot.info.date.replace(/-/g, '.')})`
                    : '실명 데이터가 없습니다 — 지금은 패러디 이름(공개 데이터)으로 플레이합니다'}
                </div>
              </div>
              <span className={`text-[12px] ${dataset === 'real' ? 'text-neon' : 'text-lo'}`}>{dataset === 'real' ? '실명 사용 중' : '패러디 이름 사용 중'}</span>
              <Switch on={dataset === 'real'} disabled={!realAvailable} onChange={(v) => setDataset(v ? 'real' : 'public')} />
            </div>
            {realSource !== 'folder' && <RealImport />}
            <div className="mt-2 rounded-lg bg-ink-900 px-4 py-3 text-[12px] leading-relaxed text-mid">
              실명 데이터는 게임에 들어 있지 않습니다. 개인이 직접 넣어야 합니다.
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-lo">
                <li><b className="text-mid">폴더 고르기</b>: 실명 데이터 폴더(<Code>meta</Code> · <Code>clubs</Code> · <Code>seasons</Code> 가 들어 있는 폴더)를 고르면 필요한 파일만 이 브라우저에 저장합니다.
                  브라우저가 '업로드' 확인을 묻지만 <b className="text-mid">어디로도 전송되지 않고</b> 이 PC 브라우저 안에만 저장됩니다. 사진 등 나머지 파일은 읽지 않습니다.</li>
                <li><b className="text-mid">직접 실행할 때</b>: 저장소의 <Code>data/</Code> 자리에 폴더를 두고 개발 서버를 켜면 자동으로 씁니다. 만드는 방법은 README '실명 데이터로 플레이하기'.</li>
                <li>바꾸면 화면을 다시 불러옵니다. 실명으로 시작한 세이브는 실명 데이터가 있어야 이름이 제대로 나옵니다.</li>
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

/** 실명 데이터 폴더 고르기 · 지우기 (브라우저 저장) */
function RealImport() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { ref.current?.setAttribute('webkitdirectory', ''); }, []);
  const [over, setOver] = useState(false);
  const onPick = async (files: FileList | PickedFile[] | null) => {
    if (!files?.length) { if (files) setErr('폴더 안에서 파일을 찾지 못했습니다.'); return; }
    setErr(null); setBusy('파일 찾는 중…');
    try {
      const info = await importRealFolder(files, (d, t) => setBusy(`읽는 중 ${d} / ${t}`));
      setBusy(`넣었습니다: 시즌 ${info.seasons}개 · 파일 ${info.files}개. 실명으로 바꿉니다…`);
      setDataset('real');
    } catch (e) { setErr((e as Error).message); setBusy(null); }
    if (ref.current) ref.current.value = '';
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); if (busy) return; setErr(null); setBusy('폴더 훑는 중…'); onPick(await filesFromDrop(e.dataTransfer).catch(() => [])); }}
      className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 transition-colors ${over ? 'border-neon bg-neon/10' : 'border-line'}`}>
      <span className="w-full text-[12px] text-lo">실명 데이터 폴더를 여기에 끌어다 놓거나</span>
      <input ref={ref} type="file" multiple hidden onChange={(e) => onPick(e.target.files)} />
      <button disabled={!!busy} onClick={() => ref.current?.click()} className="rounded-md bg-neon px-3.5 py-1.5 text-[12px] font-semibold text-ink-950 disabled:opacity-50">
        {realBoot.available ? '다른 폴더로 바꾸기' : '실명 데이터 폴더 고르기'}
      </button>
      {realBoot.available && !busy && (
        <button onClick={async () => { if (!confirm('이 브라우저에 넣어 둔 실명 데이터를 지울까요? (원본 폴더 · 세이브는 그대로)')) return; await clearRealPack(); setDataset('public'); }}
          className="rounded-md border border-line px-3 py-1.5 text-[12px] text-lo hover:text-red">지우기</button>
      )}
      {busy && <span className="text-[12px] text-neon">{busy}</span>}
      {err && <span className="text-[12px] text-red">{err}</span>}
    </div>
  );
}
