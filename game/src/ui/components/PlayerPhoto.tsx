// 선수 사진 (개인이 내 PC 에 추가). 누르면 확대 · 자동 수집 후보로 바꾸기 · 직접 넣기 (파일 · 붙여넣기 · 이미지 주소) · 빼기
// 사진이 없으면 빈 칸 (+ 사진) 을 눌러 바로 넣을 수 있다. 개발 서버가 없으면 (사진 기능 없음) 아무것도 그리지 않는다
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { choosePhoto, removePhoto, uploadPhoto, usePhotos, type PhotoCand } from '../../data/photos';
import { useWorld } from '../hooks';

export function PlayerPhoto({ id, size = 64, name }: { id: string; size?: number; name?: string }) {
  const w = useWorld();
  const { ph, ready } = usePhotos(id, w.season);
  const [open, setOpen] = useState(false);
  if (!ready) return null;
  const H = Math.round(size * 1.2);
  return (
    <>
      <button onClick={() => setOpen(true)} title={ph ? '크게 보기 · 사진 바꾸기' : '사진 넣기'}
        className={`relative shrink-0 overflow-hidden rounded-lg border bg-ink-900 transition-opacity hover:opacity-85 ${ph ? 'border-line' : 'border-dashed border-line-strong'}`} style={{ width: size, height: H }}>
        {ph ? <FaceCrop src={ph.src} c={ph.credit} W={size} H={H} /> : <span className="grid h-full place-items-center text-[11px] leading-tight text-lo">+<br />사진</span>}
      </button>
      {open && createPortal(<PhotoViewer id={id} name={name} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** 얼굴 위치에 맞춰 확대해 자르기 (얼굴이 칸 너비의 약 55%) · 얼굴 정보가 없으면 위쪽 기준으로 채우기 */
function FaceCrop({ src, c, W, H }: { src: string; c: { w?: number; h?: number; face?: number[] }; W: number; H: number }) {
  if (!c.face || !c.w || !c.h) return <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_15%]" />;
  const [fx, fy, fw, fh] = c.face;
  const ar = c.w / c.h;
  const dw = Math.max((0.55 * W) / fw, W, H * ar);   // 칸을 다 덮도록
  const dh = dw / ar;
  const cx = (fx + fw / 2) * dw, cy = (fy + fh / 2) * dh;
  const left = Math.min(0, Math.max(W - dw, W / 2 - cx));
  const top = Math.min(0, Math.max(H - dh, H * 0.45 - cy));
  return <img src={src} alt="" loading="lazy" className="absolute max-w-none" style={{ width: dw, height: dh, left, top }} />;
}

/** 사진 출처 (선수 정보 맨 아래 작게, 자동 수집 사진만) */
export function PhotoCredit({ id }: { id: string }) {
  const w = useWorld();
  const { ph } = usePhotos(id, w.season);
  if (!ph || ph.credit.user) return null;
  const c = ph.credit;
  return <a href={c.url} target="_blank" rel="noreferrer" className="block shrink-0 truncate px-5 py-1.5 text-[10px] text-lo hover:text-mid" title={c.title}>사진: {c.author || '작가 미상'} · {c.license || '라이선스 확인 필요'} · Wikimedia Commons{c.date ? ` · ${c.date}` : ''}</a>;
}

const readFile = (f: File) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });

function PhotoViewer({ id, name, onClose }: { id: string; name?: string; onClose: () => void }) {
  const w = useWorld();
  const season = w.season;
  const { ph, cands } = usePhotos(id, season);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [url, setUrl] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (label: string, job: () => Promise<{ ok: boolean; error?: string; face?: boolean }>, done: string) => {
    setBusy(label); setMsg(null);
    const r = await job();
    setBusy(null);
    setMsg(r.ok ? { t: r.face === false ? `${done} · 얼굴을 찾지 못해 위쪽 기준으로 보여 줍니다` : done } : { t: r.error ?? '실패했습니다', bad: true });
    if (r.ok) setUrl('');
  };
  const putData = (data: string) => run('upload', () => uploadPhoto(id, season, { data }), '사진을 넣었습니다');
  const putFiles = async (files: FileList | File[] | null) => { const f = [...(files ?? [])].find((x) => x.type.startsWith('image/')); if (f) putData(await readFile(f)); else setMsg({ t: '그림 파일이 아닙니다', bad: true }); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // 붙여넣기 (Ctrl+V): 복사한 이미지 또는 이미지 주소
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (img) { e.preventDefault(); readFile(img).then(putData); return; }
      const text = e.clipboardData?.getData('text')?.trim();
      if (text && /^https?:\/\//.test(text)) { e.preventDefault(); run('upload', () => uploadPhoto(id, season, { url: text }), '사진을 넣었습니다'); }
    };
    window.addEventListener('keydown', k);
    window.addEventListener('paste', paste);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('paste', paste); };
  });

  return (
    <div className="fixed inset-0 z-[80] grid animate-[fade_0.15s_ease-out] place-items-center bg-ink-950/90 p-2 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[900px] flex-col items-center gap-3 overflow-auto" onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); putFiles(e.dataTransfer.files); }}>
        {ph ? <img src={ph.src} alt="" className="max-h-[58vh] max-w-full rounded-xl border border-line object-contain" />
          : <div className="grid h-[240px] w-[200px] place-items-center rounded-xl border border-dashed border-line-strong text-[13px] text-lo">이번 시즌 사진 없음</div>}
        <div className="text-center text-[15px] font-semibold">{name}<span className="ml-2 text-[12px] font-normal text-lo">{season.replace('-', '/')} 시즌{ph?.credit.user ? ' · 직접 넣은 사진' : ph?.picked ? ' · 직접 고른 사진' : ''}</span></div>

        {cands.length > 0 && (
          <div className="w-full">
            <div className="mb-1.5 text-center text-[11px] text-lo">자동으로 찾은 이 시즌 사진 · 누르면 이 사진으로 바꿉니다</div>
            <div className="flex justify-center gap-2 overflow-x-auto pb-1">
              {cands.map((c: PhotoCand) => {
                const cur = c.title === ph?.credit.title;
                return (
                  <button key={c.title} disabled={cur || !!busy} onClick={() => run(c.title, () => choosePhoto(id, season, c), '사진을 바꿨습니다')} title="이 사진으로 바꾸기"
                    className={`relative h-[96px] w-[78px] shrink-0 overflow-hidden rounded-md border ${cur ? 'border-neon' : 'border-line hover:border-line-strong'} ${busy && !cur ? 'opacity-50' : ''}`}>
                    <FaceCrop src={c.src} c={c} W={78} H={96} />
                    {busy === c.title && <span className="absolute inset-0 grid place-items-center bg-ink-950/70 text-[11px]">받는 중…</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 직접 넣기 */}
        <div className={`w-full max-w-[560px] rounded-xl border border-dashed px-4 py-3 text-center ${drag ? 'border-neon bg-neon-ghost' : 'border-line-strong'}`}>
          <div className="text-[13px] font-semibold">사진 직접 넣기</div>
          <div className="mt-0.5 text-[11px] text-lo">사진 파일을 여기로 끌어다 놓기 · 복사한 이미지를 Ctrl+V · 이미지 주소 붙여넣기 — 얼굴 위치는 자동으로 맞춥니다</div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="h-9 shrink-0 rounded-lg bg-ink-700 px-3 text-[12px] font-semibold hover:bg-ink-750">파일 고르기</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { putFiles(e.target.files); e.target.value = ''; }} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="이미지 주소 (https://...)" onKeyDown={(e) => e.key === 'Enter' && url && run('upload', () => uploadPhoto(id, season, { url: url.trim() }), '사진을 넣었습니다')}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink-850 px-3 text-[12px] outline-none focus:border-line-strong" />
            <button onClick={() => url && run('upload', () => uploadPhoto(id, season, { url: url.trim() }), '사진을 넣었습니다')} disabled={!url || !!busy} className="h-9 shrink-0 rounded-lg bg-neon px-3 text-[12px] font-semibold text-ink-950 disabled:bg-ink-700 disabled:text-lo">넣기</button>
          </div>
        </div>
        {busy === 'upload' && <div className="text-[12px] text-mid">사진을 넣는 중… (얼굴 찾는 중)</div>}
        {msg && <div className={`text-[12px] ${msg.bad ? 'text-red' : 'text-neon'}`}>{msg.t}</div>}
        <div className="flex gap-2">
          {ph && <button onClick={() => run('remove', () => removePhoto(id, season), '이 시즌 사진을 뺐습니다')} disabled={!!busy} className="h-9 rounded-lg px-4 text-[13px] text-lo ring-1 ring-line hover:text-red">이 시즌 사진 빼기</button>}
          <button onClick={onClose} className="h-9 rounded-lg px-5 text-[13px] text-mid ring-1 ring-line hover:text-hi">닫기 (Esc)</button>
        </div>
      </div>
    </div>
  );
}
