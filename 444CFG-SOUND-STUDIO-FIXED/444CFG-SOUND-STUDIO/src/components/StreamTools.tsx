import { useMemo, useState } from 'react';
import { useApp, Sel, StreamRow, keyOf } from '../store.tsx';
import { pcm16ToFloat } from '../core/wav.ts';
import { encodeWavPcm16, floatToPcm16 } from '../core/wav.ts';
import { hex } from '../core/hash.ts';
import { Workbench } from './Workbench.tsx';
import { Btn, Badge, Card } from './Controls.tsx';
import { Waveform } from './Waveform.tsx';
import { importAudioFile } from '../lib/audio.ts';
import { pickFiles, pickSave, baseName } from '../lib/native.ts';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { EffectSettings } from '../core/dsp.ts';

export function StreamList({ rows, group, empty }: { rows: StreamRow[]; group?: (r: StreamRow) => string; empty?: string }) {
  const { selected, select, edits } = useApp(); const [q, setQ] = useState(''); const [limit, setLimit] = useState(300);
  const filtered = useMemo(() => rows.filter((r) => !q || (r.name ?? '').toLowerCase().includes(q.toLowerCase()) || hex(r.id).toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const groups = useMemo(() => { const m = new Map<string, StreamRow[]>(); filtered.slice(0, limit).forEach((r) => { const g = group ? group(r) : ''; m.set(g, [...(m.get(g) ?? []), r]); }); return [...m.entries()]; }, [filtered, group, limit]);
  return (
    <div className="list">
      <input className="input" placeholder="Buscar nombre o ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows.length && <p className="muted pad">{empty ?? 'Sin sonidos.'}</p>}
      {groups.map(([g, rs]) => (
        <div key={g}>{g && <div className="group">{g} <em>{rs.length}</em></div>}
          {rs.map((r) => { const s: Sel = { sourceId: r.source.id, offset: r.bank.offset, streamIndex: r.index }; const on = selected && keyOf(selected) === keyOf(s); const mod = !!edits[keyOf(s)];
            return (
              <button key={keyOf(s)} className={`row ${on ? 'on' : ''}`} onClick={() => select(s)} disabled={false}>
                <span className="nm">{r.name ?? hex(r.id)}</span>
                <span className="meta">{r.codec === 0 ? `${(r.samples / Math.max(1, r.sampleRate)).toFixed(2)} s` : 'sin audio PCM'}</span>
                {mod && <i className="dot" title="Modificado" />}
              </button>); })}
        </div>))}
      {filtered.length > limit && <button className="mini" onClick={() => setLimit(limit + 300)}>Mostrar más ({filtered.length - limit})</button>}
    </div>
  );
}

export function Properties({ sel }: { sel: Sel }) {
  const { rowFor, edits, sources } = useApp(); const r = rowFor(sel); if (!r) return null; const e = edits[keyOf(sel)];
  const st = r.bank.awc.streams[r.index]; const bytes = st.chunks.reduce((a, c) => a + c.size, 0);
  const ed = Object.values(edits).filter((x) => x.meta.sourceId === sel.sourceId && x.meta.awcOffset === sel.offset);
  const delta = ed.reduce((a, x) => { const o = sources.find((s) => s.id === x.meta.sourceId)?.banks.find((b) => b.offset === x.meta.awcOffset)?.awc.streams[x.meta.streamIndex]; const old = o?.chunks.find((c) => c.tag === 0x55)?.size ?? 0; return a + x.pcm.length * 2 - old; }, 0);
  const free = r.bank.size - (r.bank.awc.byteLength + delta);
  return (
    <Card title="PROPIEDADES">
      <dl className="props">
        <dt>Nombre</dt><dd>{r.name ?? <span className="muted">desconocido (solo hash)</span>}</dd>
        <dt>Identificador</dt><dd>{hex(r.id)}</dd>
        <dt>Formato</dt><dd>{r.codec === 0 ? 'PCM 16-bit LE' : r.codec === null ? 'Sin chunk de audio' : `codec ${r.codec}`}</dd>
        <dt>Duración</dt><dd>{r.sampleRate ? (r.samples / r.sampleRate).toFixed(3) + ' s' : '—'}</dd>
        <dt>Frecuencia</dt><dd>{r.sampleRate ? r.sampleRate + ' Hz' : '—'}</dd>
        <dt>Canales</dt><dd>{r.codec === 0 ? '1 (mono)' : '—'}</dd>
        <dt>Tamaño</dt><dd>{(bytes / 1024).toFixed(1)} KB</dd>
        <dt>Chunks</dt><dd>{st.chunks.map((c) => '0x' + c.tag.toString(16)).join(', ')}</dd>
        <dt>Banco</dt><dd>{r.source.name} · 0x{r.bank.offset.toString(16).toUpperCase()}</dd>
        <dt>Estado</dt><dd>{e ? <Badge kind="warn">Modificado</Badge> : <Badge kind="ok">Original</Badge>}</dd>
        <dt>Hueco del banco</dt><dd className={free < 0 ? 'bad' : ''}>{free >= 0 ? `${(free / 1024).toFixed(1)} KB libres` : `excede en ${(-free / 1024).toFixed(1)} KB`}</dd>
      </dl>
      {free < 0 && <p className="warn">Con los cambios actuales el banco no cabe en su hueco original: «Exportar RPF» (parche en sitio) lo rechazará. Acorta el audio o exporta el AWC suelto.</p>}
    </Card>
  );
}

/** Edita un stream concreto: escuchar original/modificado, importar WAV/MP3, efectos, sustituir, restaurar, exportar WAV. */
export function StreamWorkbench({ sel, title }: { sel: Sel; title?: string }) {
  const { rowFor, originalPcm, edits, setEdit, restore, notify, settings, pending, setPending } = useApp();
  const r = rowFor(sel); const [imported, setImported] = useState<{ name: string; samples: Float32Array; sr: number } | null>(null); const [latest, setLatest] = useState<{ s: Float32Array; sr: number; fx: EffectSettings } | null>(null);
  const k = keyOf(sel); const editPcm = edits[k]?.pcm;
  // Memorizados: Workbench reinicia efectos y selección cuando cambia la identidad de `base`; sin esto se reiniciaba en cada render.
  const origF = useMemo(() => { const p = originalPcm(sel); return p ? pcm16ToFloat(p) : null; }, [k, originalPcm]); // eslint-disable-line react-hooks/exhaustive-deps
  const curF = useMemo(() => (editPcm ? pcm16ToFloat(editPcm) : origF), [editPcm, origF]);
  const orig = origF;
  if (!r) return null;
  if (!orig || !origF || !curF) return <Card title={title ?? 'EDITOR DE AUDIO'}><p className="warn">Este stream no contiene audio PCM16 que la herramienta pueda reproducir o sustituir (chunks: {r.bank.awc.streams[r.index].chunks.map((c) => '0x' + c.tag.toString(16)).join(', ')}). Se conserva intacto al exportar.</p></Card>;
  const sr = r.sampleRate; const baseF = imported ? imported.samples : curF; const baseSr = imported ? imported.sr : edits[k]?.meta.sampleRate ?? sr;
  const doImport = async () => {
    try { const f = (await pickFiles('Importar audio', ['wav', 'mp3', 'ogg', 'flac', 'm4a'], false))[0]; if (!f) return; const m = await importAudioFile(f, settings.ffmpeg || null); setImported({ name: baseName(f), samples: m.samples, sr: m.sampleRate }); notify('info', `Importado ${baseName(f)} (${m.sampleRate} Hz, ${(m.samples.length / m.sampleRate).toFixed(2)} s). Se convertirá a PCM16 mono ${sr} Hz al guardar.`); }
    catch (e) { notify('err', (e as Error).message); }
  };
  return (
    <Card title={title ?? 'EDITOR DE AUDIO'} right={<span className="muted">{r.name ?? hex(r.id)}</span>}>
      <Workbench key={k + (imported?.name ?? '') + (pending ? '1' : '0')} base={baseF} sampleRate={baseSr} reference={origF} refRate={sr} refLabel="Original del banco"
        initialFx={imported ? edits[k]?.meta.fx ?? null : null} onProcessed={(s, rate, fx) => setLatest({ s, sr: rate, fx })}
        actions={<>
          <Btn kind="ghost" onClick={doImport}>IMPORTAR AUDIO</Btn>
          {pending && <Btn kind="ghost" onClick={() => { setImported({ name: pending.name, samples: pending.samples, sr: pending.sampleRate }); setPending(null); }}>Usar «{pending.name}»</Btn>}
          <Btn kind="ghost" onClick={async () => { const p = await pickSave('Exportar WAV', `${r.name ?? hex(r.id)}.wav`, ['wav']); if (p && latest) { await writeFile(p, encodeWavPcm16(floatToPcm16(latest.s), latest.sr)); notify('ok', `WAV exportado: ${p}`); } }}>Exportar WAV</Btn>
          <Btn kind="ghost" disabled={!edits[k]} onClick={() => { restore(sel); setImported(null); notify('info', 'Stream restaurado al original'); }}>RESTAURAR ORIGINAL</Btn>
          <Btn disabled={!latest} onClick={() => { try { setEdit(sel, latest!.s, latest!.sr, latest!.fx); notify('ok', 'Sustitución guardada en el proyecto (aún no exportada al banco)'); } catch (e) { notify('err', (e as Error).message); } }}>GUARDAR CAMBIOS</Btn>
        </>} />
      {edits[k] && <div className="cmp"><Waveform data={pcm16ToFloat(edits[k].pcm)} sampleRate={edits[k].meta.sampleRate} label="Sustituto guardado" color="#86efac" height={70} /></div>}
    </Card>
  );
}
