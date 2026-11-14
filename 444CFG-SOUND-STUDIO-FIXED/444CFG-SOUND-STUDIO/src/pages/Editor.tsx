import { useState } from 'react';
import { useApp, Sel } from '../store.tsx';
import { Btn, Card, Badge } from '../components/Controls.tsx';
import { StreamList, StreamWorkbench, Properties } from '../components/StreamTools.tsx';
import type { Category } from '../core/classify.ts';

export function EditorPage() {
  const { sources, rows, selected, select, openDialog, openFolderDialog, closeSource, tagBank, project, editsForBank } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const active = sources.flatMap((s) => s.banks).find((b) => selected && b.sourceId === selected.sourceId && b.offset === selected.offset) ?? null;
  const bankRows = rows.filter((r) => active && r.source.id === active.sourceId && r.bank.offset === active.offset);
  return (
    <div className="page editor">
      <div className="toolbar"><Btn onClick={openDialog}>IMPORTAR SOUND PACK</Btn><Btn kind="ghost" onClick={openFolderDialog}>Importar carpeta</Btn>
        <span className="muted">Formatos de banco: .rpf (RPF7), .awc, .oac. WAV/MP3/OGG se importan dentro del editor.</span></div>
      <div className="cols3">
        <Card title="EXPLORADOR DE ARCHIVOS" className="explorer">
          {!sources.length && <p className="muted pad">Abre un .rpf o .awc para empezar.</p>}
          {sources.map((s) => (
            <div key={s.id} className="tree">
              <div className="tnode src"><b>{s.name}</b> <Badge kind={s.kind === 'rpf' ? 'info' : 'ok'}>{s.kind === 'rpf' ? `RPF7 · ${s.rpf!.encryption}` : 'AWC'}</Badge><button className="mini" onClick={() => closeSource(s.id)}>cerrar</button></div>
              {s.kind === 'rpf' && !s.rpf!.readableToc && <p className="muted small">Índice cifrado ({s.rpf!.entryCount} entradas): los bancos se localizan por firma AWC, sin nombres de archivo.</p>}
              {s.banks.map((b) => {
                const on = open === b.key, tag = project.bankTags[b.key], n = editsForBank(b);
                return (<div key={b.key}>
                  <button className={`tnode bank ${active?.key === b.key ? 'on' : ''}`} onClick={() => { setOpen(on ? null : b.key); const sel: Sel = { sourceId: b.sourceId, offset: b.offset, streamIndex: 0 }; select(sel); }}>
                    {on ? '▾' : '▸'} {b.label} {n > 0 && <i className="dot" title={`${n} modificados`} />}{tag && <Badge kind="info">{tag}</Badge>}</button>
                  {on && <div className="tagrow">Etiquetar banco como: {(['death', 'footsteps', 'weapons'] as Category[]).map((c) => <button key={c} className={`mini ${tag === c ? 'sel' : ''}`} onClick={() => tagBank(b, tag === c ? null : c)}>{c}</button>)}</div>}
                </div>);
              })}
            </div>))}
          {active && <StreamList rows={bankRows} empty="Banco sin streams." />}
        </Card>
        <div>{selected ? <StreamWorkbench sel={selected} /> : <Card title="EDITOR DE AUDIO"><p className="muted pad">Selecciona un sonido del explorador.</p></Card>}</div>
        <div>{selected && <Properties sel={selected} />}</div>
      </div>
    </div>
  );
}
