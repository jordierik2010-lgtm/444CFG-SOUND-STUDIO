import { useMemo, useState } from 'react';
import { useApp, Sel, keyOf, StreamRow } from '../store.tsx';
import type { Category } from '../core/classify.ts';
import { variationBase } from '../core/classify.ts';
import { Btn, Card } from '../components/Controls.tsx';
import { StreamList, StreamWorkbench, Properties } from '../components/StreamTools.tsx';
import { applyEffects, defaultEffects } from '../core/dsp.ts';
import { pcm16ToFloat } from '../core/wav.ts';

const TITLES: Record<Category, string> = { death: 'DEATH SOUNDS', footsteps: 'FOOTSTEPS EDITOR', weapons: 'WEAPON SOUNDS', other: 'OTROS' };
const WEAPON_ORDER = ['PISTOLS', 'SMG', 'RIFLES', 'SHOTGUNS', 'SNIPERS', 'OTHER'];

export function CategoryPage({ category }: { category: Category }) {
  const { rows, selected, names, namesCount, setPage, setEdit, currentPcm, notify, project } = useApp();
  const mine = useMemo(() => rows.filter((r) => (r.cls?.category === category) || (!r.cls && r.manual === category && r.codec === 0)), [rows, category]);
  const named = mine.filter((r) => r.cls).length;
  const group = (r: StreamRow) => {
    if (category === 'weapons') return `${r.cls?.sub ?? 'OTHER'}${r.cls?.action ? ' · ' + r.cls.action : ''}`;
    if (category === 'footsteps') return `${r.cls?.sub ?? 'Sin clasificar'} · ${variationBase(r.name ?? '')}`;
    return r.cls?.sub ?? 'Etiqueta manual de banco (sin nombre resuelto)';
  };
  const sorted = useMemo(() => [...mine].sort((a, b) => category === 'weapons' ? WEAPON_ORDER.indexOf(a.cls?.sub ?? 'OTHER') - WEAPON_ORDER.indexOf(b.cls?.sub ?? 'OTHER') : 0), [mine, category]);
  const sameGroup = selected ? mine.filter((r) => group(r) === group(mine.find((m) => keyOf({ sourceId: m.source.id, offset: m.bank.offset, streamIndex: m.index }) === keyOf(selected)) ?? r)) : [];
  const [gainDb, setGainDb] = useState(0);
  const batch = () => {
    let n = 0;
    for (const r of sameGroup) { const s: Sel = { sourceId: r.source.id, offset: r.bank.offset, streamIndex: r.index }; const p = currentPcm(s); if (!p || r.codec !== 0) continue; const f = { ...defaultEffects(), gainDb }; setEdit(s, applyEffects(pcm16ToFloat(p), r.sampleRate, f), r.sampleRate, f); n++; }
    notify('ok', `${n} variaciones ajustadas ${gainDb} dB (cada una conserva su propia muestra)`);
  };
  void names;
  return (
    <div className="page">
      <div className="cols3">
        <Card title={`${TITLES[category]} · ${mine.length}`} className="explorer">
          <StreamList rows={sorted} group={group} empty={namesCount === 0
            ? 'No hay nombres resueltos. Los bancos AWC identifican los sonidos solo por hash: carga un diccionario de nombres (Configuración → Diccionario) o etiqueta un banco entero como esta categoría en el Sound Pack Editor. Sin una de las dos cosas esta sección no puede mostrar sonidos reales.'
            : 'Ningún sonido de los bancos cargados coincide con esta categoría según su nombre. Puedes etiquetar un banco manualmente en el Sound Pack Editor.'} />
          {mine.length > 0 && <p className="muted small">{named} identificados por nombre · {mine.length - named} por etiqueta manual de banco. {project.bankTags && ''}</p>}
        </Card>
        <div>
          {selected && mine.some((m) => keyOf({ sourceId: m.source.id, offset: m.bank.offset, streamIndex: m.index }) === keyOf(selected))
            ? <><StreamWorkbench sel={selected} title={TITLES[category]} />{category === 'footsteps' && <div className="toolbar"><label className="check">Volumen del grupo <input className="input num" type="number" step="0.5" value={gainDb} onChange={(e) => setGainDb(parseFloat(e.target.value) || 0)} /> dB</label><Btn kind="ghost" onClick={batch}>Aplicar a las {sameGroup.length} variaciones del grupo</Btn></div>}</>
            : <Card title={TITLES[category]}><p className="muted pad">Selecciona un sonido de la lista.</p><Btn kind="ghost" onClick={() => setPage('editor')}>Ir al Sound Pack Editor</Btn></Card>}
        </div>
        <div>{selected && <Properties sel={selected} />}</div>
      </div>
    </div>
  );
}
