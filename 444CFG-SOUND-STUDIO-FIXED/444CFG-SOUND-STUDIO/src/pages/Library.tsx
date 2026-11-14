import { useEffect, useState } from 'react';
import { useApp } from '../store.tsx';
import { Btn, Card } from '../components/Controls.tsx';
import { addToLibrary, LIB_CATEGORIES, LibCategory, LibItem, loadLibrary, readItem, removeItem, updateItem } from '../lib/library.ts';
import { importAudioFile, usePlayer } from '../lib/audio.ts';
import { pickFiles, baseName } from '../lib/native.ts';

export function LibraryPage() {
  const { dir, settings, notify, setPending, setPage } = useApp(); const [items, setItems] = useState<LibItem[]>([]); const [cat, setCat] = useState<LibCategory | 'ALL'>('ALL'); const [q, setQ] = useState(''); const player = usePlayer();
  useEffect(() => { if (dir) loadLibrary(dir).then(setItems); }, [dir]);
  const shown = items.filter((i) => (cat === 'ALL' || i.category === cat) && (!q || (i.name + i.tags.join(' ')).toLowerCase().includes(q.toLowerCase())));
  const add = async () => { try { let list = items; for (const f of await pickFiles('Importar a la biblioteca', ['wav', 'mp3', 'ogg', 'flac'])) { const m = await importAudioFile(f, settings.ffmpeg || null); list = await addToLibrary(dir, list, baseName(f).replace(/\.[^.]+$/, ''), cat === 'ALL' ? 'CUSTOM' : cat, m.samples, m.sampleRate); } setItems(list); notify('ok', 'Sonidos copiados a la biblioteca (las fuentes originales no se modifican)'); } catch (e) { notify('err', (e as Error).message); } };
  return (
    <div className="page">
      <div className="toolbar"><Btn onClick={add}>+ IMPORTAR SONIDOS</Btn><input className="input" placeholder="Buscar por nombre o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(['ALL', ...LIB_CATEGORIES] as const).map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'ALL' ? 'TODOS' : c}</button>)}</div>
      <Card title={`SOUND LIBRARY · ${shown.length}`}>
        {!shown.length && <p className="muted pad">La biblioteca está vacía. Importa sonidos o guárdalos desde Audio Effects.</p>}
        {shown.map((it) => (
          <div className="librow" key={it.id}>
            <button className="mini" onClick={async () => { const a = await readItem(dir, it); player.play(a.samples, a.sampleRate); }}>▶</button>
            <input className="input" defaultValue={it.name} onBlur={async (e) => { if (e.target.value !== it.name) setItems(await updateItem(dir, items, it.id, { name: e.target.value })); }} />
            <select className="input" value={it.category} onChange={async (e) => setItems(await updateItem(dir, items, it.id, { category: e.target.value as LibCategory }))}>{LIB_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input className="input" placeholder="etiquetas, separadas por coma" defaultValue={it.tags.join(', ')} onBlur={async (e) => setItems(await updateItem(dir, items, it.id, { tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} />
            <span className="muted">{it.seconds.toFixed(2)} s · {it.sampleRate} Hz</span>
            <Btn kind="ghost" onClick={async () => { const a = await readItem(dir, it); setPending({ name: it.name, samples: a.samples, sampleRate: a.sampleRate }); setPage('editor'); }}>Usar en proyecto</Btn>
            <button className="mini danger" onClick={async () => setItems(await removeItem(dir, items, it.id))}>Eliminar</button>
          </div>))}
      </Card>
    </div>
  );
}
