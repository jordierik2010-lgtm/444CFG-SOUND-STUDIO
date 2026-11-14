import { useState } from 'react';
import { useApp } from '../store.tsx';
import { Btn, Card } from '../components/Controls.tsx';
import { Workbench } from '../components/Workbench.tsx';
import { importAudioFile } from '../lib/audio.ts';
import { pickFiles, pickSave, baseName } from '../lib/native.ts';
import { encodeWavPcm16, floatToPcm16, pcm16ToFloat } from '../core/wav.ts';
import { writeFile } from '@tauri-apps/plugin-fs';
import { addToLibrary, loadLibrary } from '../lib/library.ts';

export function EffectsPage() {
  const { settings, notify, selected, currentPcm, rowFor, setPending, setPage, dir } = useApp();
  const [audio, setAudio] = useState<{ name: string; samples: Float32Array; sr: number } | null>(null); const [out, setOut] = useState<{ s: Float32Array; sr: number } | null>(null);
  const load = async () => { try { const f = (await pickFiles('Abrir audio', ['wav', 'mp3', 'ogg', 'flac', 'm4a'], false))[0]; if (!f) return; const m = await importAudioFile(f, settings.ffmpeg || null); setAudio({ name: baseName(f), samples: m.samples, sr: m.sampleRate }); } catch (e) { notify('err', (e as Error).message); } };
  const fromStream = () => { if (!selected) return notify('info', 'Selecciona antes un sonido en el Sound Pack Editor'); const p = currentPcm(selected), r = rowFor(selected); if (!p || !r) return notify('err', 'El stream no es PCM16'); setAudio({ name: r.name ?? `stream_${r.index}`, samples: pcm16ToFloat(p), sr: r.sampleRate }); };
  return (
    <div className="page">
      <div className="toolbar"><Btn onClick={load}>ABRIR AUDIO (WAV/MP3/OGG)</Btn><Btn kind="ghost" onClick={fromStream}>Cargar sonido seleccionado del banco</Btn>{audio && <span className="muted">{audio.name} · {audio.sr} Hz</span>}</div>
      {audio ? (
        <Card title="AUDIO EFFECTS" right={<span className="muted">Los efectos se oyen antes de aplicarlos. Rueda = zoom · Shift+rueda = desplazar · arrastrar = seleccionar.</span>}>
          <Workbench key={audio.name} base={audio.samples} sampleRate={audio.sr} onProcessed={(s, sr) => setOut({ s, sr })}
            actions={<>
              <Btn kind="ghost" disabled={!out} onClick={async () => { const p = await pickSave('Exportar WAV', audio.name.replace(/\.[^.]+$/, '') + '_fx.wav', ['wav']); if (p && out) { await writeFile(p, encodeWavPcm16(floatToPcm16(out.s), out.sr)); notify('ok', `Exportado: ${p}`); } }}>Exportar WAV</Btn>
              <Btn kind="ghost" disabled={!out} onClick={async () => { if (!out) return; try { await addToLibrary(dir, await loadLibrary(dir), audio.name.replace(/\.[^.]+$/, ''), 'CUSTOM', out.s, out.sr); notify('ok', 'Guardado en la biblioteca (CUSTOM)'); } catch (e) { notify('err', String(e)); } }}>Guardar en biblioteca</Btn>
              <Btn disabled={!out} onClick={() => { if (out) { setPending({ name: audio.name, samples: out.s, sampleRate: out.sr }); setPage('editor'); notify('info', 'Listo: pulsa «Usar …» en el stream que quieras sustituir'); } }}>Enviar al Sound Pack Editor</Btn>
            </>} />
        </Card>) : <Card title="AUDIO EFFECTS"><p className="muted pad">Abre un audio o carga el sonido seleccionado de un banco para editarlo: volumen, graves, agudos, ecualizador, reverberación, eco, pitch, velocidad, normalizar, fundidos, recorte y bucle.</p></Card>}
    </div>
  );
}
