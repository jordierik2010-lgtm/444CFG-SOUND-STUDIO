import { EffectSettings, EQ_FREQS, defaultEffects } from '../core/dsp.ts';
import { Slider } from './Controls.tsx';

export function FxPanel({ fx, onChange, show = 'all' }: { fx: EffectSettings; onChange: (f: EffectSettings) => void; show?: 'all' | 'basic' }) {
  const set = (p: Partial<EffectSettings>) => onChange({ ...fx, ...p });
  return (
    <div className="fx">
      <div className="fx-group"><h4>Volumen y tono</h4>
        <Slider label="Volumen" value={fx.gainDb} min={-24} max={24} step={0.5} unit=" dB" onChange={(v) => set({ gainDb: v })} />
        <Slider label="Graves (Bass boost)" value={fx.bassDb} min={-12} max={18} step={0.5} unit=" dB" onChange={(v) => set({ bassDb: v })} />
        <Slider label="Agudos (Treble)" value={fx.trebleDb} min={-12} max={18} step={0.5} unit=" dB" onChange={(v) => set({ trebleDb: v })} />
        <Slider label="Pitch (conserva duración)" value={fx.pitchSemitones} min={-12} max={12} step={0.5} unit=" st" onChange={(v) => set({ pitchSemitones: v })} />
        <Slider label="Velocidad (cambia tono)" def={1} value={fx.speed} min={0.5} max={2} step={0.05} unit="×" onChange={(v) => set({ speed: v })} />
      </div>
      {show === 'all' && <div className="fx-group"><h4>Ecualizador</h4>
        <div className="eq">{EQ_FREQS.map((f, i) => (
          <label key={f}><input type="range" min={-12} max={12} step={0.5} value={fx.eq[i]} onChange={(e) => { const eq = [...fx.eq]; eq[i] = parseFloat(e.target.value); set({ eq }); }} /><span>{f >= 1000 ? f / 1000 + 'k' : f}</span><em>{fx.eq[i].toFixed(1)}</em></label>
        ))}</div>
      </div>}
      <div className="fx-group"><h4>Eco <input type="checkbox" checked={fx.echoOn} onChange={(e) => set({ echoOn: e.target.checked })} /></h4>
        <Slider label="Retardo" value={fx.echoMs} min={20} max={800} step={10} unit=" ms" onChange={(v) => set({ echoMs: v })} />
        <Slider label="Repeticiones" value={fx.echoFeedback} min={0} max={0.9} step={0.05} onChange={(v) => set({ echoFeedback: v })} />
        <Slider label="Mezcla" value={fx.echoMix} min={0} max={1} step={0.05} onChange={(v) => set({ echoMix: v })} />
      </div>
      <div className="fx-group"><h4>Reverberación <input type="checkbox" checked={fx.reverbOn} onChange={(e) => set({ reverbOn: e.target.checked })} /></h4>
        <Slider label="Sala" value={fx.reverbRoom} min={0} max={1} step={0.05} onChange={(v) => set({ reverbRoom: v })} />
        <Slider label="Amortiguación" value={fx.reverbDamp} min={0} max={0.9} step={0.05} onChange={(v) => set({ reverbDamp: v })} />
        <Slider label="Mezcla" value={fx.reverbMix} min={0} max={1} step={0.05} onChange={(v) => set({ reverbMix: v })} />
        <Slider label="Cola" value={fx.reverbTail} min={0.2} max={4} step={0.1} unit=" s" onChange={(v) => set({ reverbTail: v })} />
      </div>
      {show === 'all' && <div className="fx-group"><h4>Acabado</h4>
        <label className="check"><input type="checkbox" checked={fx.normalize} onChange={(e) => set({ normalize: e.target.checked })} /> Normalizar (−1 dBFS)</label>
        <Slider label="Fade in" value={fx.fadeIn} min={0} max={2} step={0.01} unit=" s" onChange={(v) => set({ fadeIn: v })} />
        <Slider label="Fade out" value={fx.fadeOut} min={0} max={2} step={0.01} unit=" s" onChange={(v) => set({ fadeOut: v })} />
        <button className="mini" onClick={() => onChange(defaultEffects())}>Restablecer efectos</button>
      </div>}
    </div>
  );
}
