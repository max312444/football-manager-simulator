// 상단 검색창: 선수 · 구단 · 리그. "/" 또는 Ctrl+K 로 바로 입력, ↑↓ Enter 로 선택
//  선수 → 선수 정보 창, 구단 → 구단 선수단 창, 리그 → 순위 화면
import { useEffect, useMemo, useRef, useState } from 'react';
import { estOverall } from '../../engine/scout';
import { clubKo, compKo, clubs as clubMasters, leagues, playerKo } from '../../data/db';
import { useApp } from '../../store/app';
import { useWorld } from '../hooks';
import { Crest } from './Crest';
import { Icon } from './Icon';
import { PosTag } from './bits';
import { ratingTone } from '../format';

type Hit =
  | { kind: 'player'; id: string; label: string; sub: string; ovr: number; pos: string; club: string | null }
  | { kind: 'club'; id: string; label: string; sub: string }
  | { kind: 'league'; id: string; label: string; sub: string };

export function GlobalSearch() {
  const w = useWorld();
  const { openProfile, openClub, openTable } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // "/" 또는 Ctrl+K 로 검색창에 바로 입력
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return [];
    const has = (...names: (string | undefined)[]) => names.some((n) => n && n.toLowerCase().replace(/\s+/g, '').includes(s));
    const lg = leagues.filter((l) => w.competitions[l.id] && has(l.ko, l.en, l.id))
      .map<Hit>((l) => ({ kind: 'league', id: l.id, label: l.ko ?? l.id, sub: `${Object.keys(w.competitions[l.id].table).length}개 구단 · 순위 보기` }));
    const cl = Object.values(w.clubs).filter((c) => w.competitions[c.league] && has(clubKo(c.id), clubMasters.get(c.id)?.name))
      .sort((a, b) => b.reputation - a.reputation).slice(0, 5)
      .map<Hit>((c) => ({ kind: 'club', id: c.id, label: clubKo(c.id), sub: `${compKo(c.league) ?? c.league} · 선수 ${c.squad.length}명` }));
    const pl = Object.values(w.players).filter((p) => !p.retired && has(playerKo(p.id, p.name), p.name))
      .map((p) => ({ p, o: estOverall(w, p) })).sort((a, b) => +(b.p.clubId === w.userClubId) - +(a.p.clubId === w.userClubId) || b.o - a.o).slice(0, 8)
      .map<Hit>(({ p, o }) => ({ kind: 'player', id: p.id, label: playerKo(p.id, p.name), sub: p.clubId ? clubKo(p.clubId) : '자유계약', ovr: o, pos: p.pos, club: p.clubId }));
    return [...pl, ...cl, ...lg];
  }, [q, w]);

  const pick = (h: Hit) => {
    setOpen(false); setQ(''); input.current?.blur();
    if (h.kind === 'player') openProfile(h.id);
    else if (h.kind === 'club') openClub(h.id);
    else openTable(h.id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && hits[cur]) pick(hits[cur]);
  };
  const group = (k: Hit['kind']) => ({ player: '선수', club: '구단', league: '리그' })[k];

  return (
    <div ref={box} data-tour="search" className="relative mx-auto w-full max-w-[420px]">
      <label className={`flex h-9 items-center gap-2 rounded-lg border bg-ink-850 px-3 text-[13px] transition-colors ${open ? 'border-line-strong' : 'border-line'}`}>
        <Icon name="search" size={15} />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setCur(0); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder="선수, 구단, 리그 검색" className="min-w-0 flex-1 bg-transparent text-hi outline-none placeholder:text-lo" />
        {!q && <kbd className="rounded border border-line px-1.5 text-[11px] text-lo">/</kbd>}
      </label>
      {open && q.trim() && (
        <div className="absolute top-11 right-0 left-0 z-40 max-h-[60vh] overflow-auto rounded-xl border border-line-strong bg-ink-850 py-1.5 shadow-2xl">
          {hits.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-lo">"{q}"에 맞는 결과가 없습니다</div>}
          {hits.map((h, i) => (
            <div key={h.kind + h.id}>
              {(i === 0 || hits[i - 1].kind !== h.kind) && <div className="px-4 pt-2 pb-1 text-[11px] font-semibold text-lo">{group(h.kind)}</div>}
              <button onMouseEnter={() => setCur(i)} onClick={() => pick(h)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${cur === i ? 'bg-ink-700' : ''}`}>
                {h.kind === 'player' ? <><PosTag pos={h.pos as never} /><span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-lo">{h.club && <Crest clubId={h.club} size={14} />}{h.sub}</span>
                  <span className={`tnum w-6 text-right font-semibold ${ratingTone(h.ovr)}`}>{h.ovr}</span></>
                : h.kind === 'club' ? <><Crest clubId={h.id} size={18} /><span className="flex-1 truncate font-medium">{h.label}</span><span className="text-[12px] text-lo">{h.sub}</span></>
                : <><span className="grid h-[18px] w-[18px] place-items-center"><Icon name="table" size={15} /></span><span className="flex-1 truncate font-medium">{h.label}</span><span className="text-[12px] text-lo">{h.sub}</span></>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
