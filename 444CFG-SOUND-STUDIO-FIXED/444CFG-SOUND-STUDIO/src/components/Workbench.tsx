import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { applyEffects, defaultEffects, EffectSettings } from '../core/dsp.ts';
import { usePlayer } from '../lib/audio.ts';
import { Waveform } from './Waveform.tsx';
import { FxPanel } from './FxPanel.tsx';
import { Btn } from './Controls.tsx';

interface Snap { base: Float32Array; fx: EffectSettings }
export interface WorkbenchProps {
  base: Float32Array; sampleRate: number; reference?: Float32Array | null; refRate?: number; refLabel?: string;
  onProcessed?: (samples: Float32Array, sr: number, fx: EffectSettings) => void; actions?: ReactNode; fxMode?: 'all' | 'basic'; initialFx?: EffectSettings | null;
}

/** Editor de audio: forma de onda antes/después, efectos escuchables antes de aplicar, selección, bucle, deshacer/rehacer. */
export function Workbench({ base: base0, sampleRate: sr, reference, refRate, refLabel = 'Original', onProcessed, actions, fxMode = 'all', initialFx }: WorkbenchProps) {
  const [snap, setSnap] = useState<Snap>({ base: base0, fx: initialFx ?? defaultEffects() });
  const [undo, setUndo] = useState<Snap[]>([]); const [redo, setRedo] = useState<Snap[]>([]);
  const [sel, setSel] = useState<[number, number] | null>(null); const [loop, setLoop] = useState(false); const [vol, setVol] = useState(1);
  const [processed, setProcessed] = useState<Float32Array>(base0); const [busy, setBusy] = useState(false);
  const player = usePlayer(); const cb = useRef(onProcessed); cb.current = onProcessed;
  useEffect(() => { setSnap({ base: base0, fx: initialFx ?? defaultEffects() }); setUndo([]); setRedo([]); setSel(null); player.stop(); /* eslint-disable-next-line */ }, [base0]);
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => { const p = applyEffects(snap.base, sr, snap.fx); setProcessed(p); setBusy(false); cb.current?.(p, sr, snap.fx); }, 120);
    return () => clearTimeout(t);
  }, [snap, sr]);
  useEffect(() => player.setVolume(vol), [vol, player]);

  const push = (n: Snap) => { setUndo((u) => [...u.slice(-30), snap]); setRedo([]); setSnap(n); };
  const range = () => (sel ? { from: sel[0], to: sel[1] } : {});
  const hasFx = useMemo(() => JSON.stringify(snap.fx) !== JSON.stringify(defaultEffects()), [snap.fx]);

  return (
    <div className="bench">
      {reference && <Waveform data={reference} sampleRate={refRate ?? sr} label={refLabel} color="#7f8bb3" height={90} />}
      <Waveform data={snap.base} sampleRate={sr} label="Base" height={110} selection={sel} onSelect={setSel} cursor={player.position} onSeek={(t) => player.play(snap.base, sr, { from: t, loop })} />
      <Waveform data={processed} sampleRate={sr} label={busy ? 'Resultado (calculando…)' : 'Resultado con efectos'} color="#c4b5fd" height={110} />
      <div className="transport">
        <Btn onClick={() => player.play(snap.base, sr, { ...range(), loop })}>▶ Original</Btn>
        <Btn onClick={() => player.play(processed, sr, { ...(sel && !hasFx ? range() : {}), loop })}>▶ Modificado</Btn>
        <Btn kind="ghost" onClick={() => player.pause()} disabled={player.state === 'stopped'}>{player.state === 'paused' ? '▶ Reanudar' : '⏸ Pausar'}</Btn>
        <Btn kind="ghost" onClick={() => player.stop()}>⏹ Detener</Btn>
        <label className="check"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Bucle</label>
        <label className="check">Volumen <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} /></label>
        <span className="sp" />
        <Btn kind="ghost" disabled={!undo.length} onClick={() => { const p = undo[undo.length - 1]; setRedo((r) => [...r, snap]); setUndo((u) => u.slice(0, -1)); setSnap(p); }}>↶ Deshacer</Btn>
        <Btn kind="ghost" disabled={!redo.length} onClick={() => { const n = redo[redo.length - 1]; setUndo((u) => [...u, snap]); setRedo((r) => r.slice(0, -1)); setSnap(n); }}>↷ Rehacer</Btn>
      </div>
      <div className="transport">
        <Btn kind="ghost" disabled={!sel} onClick={() => { if (sel) { const a = Math.round(sel[0] * sr), b = Math.round(sel[1] * sr); push({ base: snap.base.slice(a, b), fx: snap.fx }); setSel(null); } }}>✂ Recortar a la selección</Btn>
        <Btn kind="ghost" disabled={!hasFx} onClick={() => push({ base: processed, fx: defaultEffects() })} title="Convierte el resultado en la nueva base (se puede deshacer)">Aplicar efectos a la base</Btn>
        {sel && <span className="muted">Selección: {sel[0].toFixed(3)}–{sel[1].toFixed(3)} s</span>}
        <span className="sp" />{actions}
      </div>
      <FxPanel fx={snap.fx} show={fxMode} onChange={(fx) => setSnap({ ...snap, fx })} />
    </div>
  );
}
