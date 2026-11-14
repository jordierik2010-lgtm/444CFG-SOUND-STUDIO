import { useMemo, useState } from 'react';
import { useApp } from '../store.tsx';
import { Btn, Card } from '../components/Controls.tsx';
import { Waveform } from '../components/Waveform.tsx';
import { importAudioFile, usePlayer } from '../lib/audio.ts';
import { pickFiles, pickSave, baseName } from '../lib/native.ts';
import { mixTracks } from '../core/dsp.ts';
import { encodeWavPcm16, floatToPcm16 } from '../core/wav.ts';
import { writeFile } from '@tauri-apps/plugin-fs';

interface Track { id: number; name: string; samples: Float32Array; sr: number; gainDb: number; offset: number; mute: boolean }
const RATE = 44100;

export function MixerPage() {
  const { settings, notify, setPending, setPage } = useApp(); const [tracks, setTracks] = useState<Track[]>([]); const player = usePlayer();
  const mix = useMemo(() => mixTracks(tracks.map((t) => ({ samples: t.samples, sampleRate: t.sr, gainDb: t.gainDb, offsetSec: t.offset, mute: t.mute })), RATE), [tracks]);
  const add = async () => { try { for (const f of await pickFiles('Añadir pistas', ['wav', 'mp3', 'ogg', 'flac'])) { const m = await importAudioFile(f, settings.ffmpeg || null); setTracks((t) => [...t, { id: Date.now() + t.length, name: baseName(f), samples: m.samples, sr: m.sampleRate, gainDb: 0, offset: 0, mute: false }]); } } catch (e) { notify('err', (e as Error).message); } };
  const upd = (id: number, p: Partial<Track>) => setTracks((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setTracks((t) => { const n = [...t], j = i + d; if (j < 0 || j >= n.length) return t; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <div className="page">
      <div className="toolbar"><Btn onClick={add}>+ AÑADIR PISTAS</Btn>
        <Btn kind="ghost" disabled={!mix.length} onClick={() => player.play(mix, RATE)}>▶ Reproducir mezcla</Btn><Btn kind="ghost" onClick={() => player.pause()}>⏸ Pausar</Btn><Btn kind="ghost" onClick={() => player.stop()}>⏹ Detener</Btn>
        <span className="sp" />
        <Btn kind="ghost" disabled={!mix.length} onClick={async () => { const p = await pickSave('Exportar mezcla', 'mezcla.wav', ['wav']); if (p) { await writeFile(p, encodeWavPcm16(floatToPcm16(mix), RATE)); notify('ok', `Mezcla exportada: ${p}`); } }}>Exportar mezcla (WAV)</Btn>
        <Btn disabled={!mix.length} onClick={() => { setPending({ name: 'mezcla_mixer', samples: mix, sampleRate: RATE }); setPage('editor'); notify('info', 'Mezcla enviada: pulsa «Usar mezcla_mixer» en el stream destino'); }}>Enviar al Sound Pack Editor</Btn></div>
      {!tracks.length && <Card title="AUDIO MIXER"><p className="muted pad">Añade varias pistas WAV/MP3 (por ejemplo disparo + reverberación + efecto metálico), ajusta volumen y posición temporal, y envía el resultado como nueva muestra.</p></Card>}
      {tracks.map((t, i) => (
        <Card key={t.id} title={`PISTA ${i + 1} · ${t.name}`} right={<span className="row-actions"><button className="mini" onClick={() => move(i, -1)}>↑</button><button className="mini" onClick={() => move(i, 1)}>↓</button><button className="mini" onClick={() => player.play(t.samples, t.sr)}>▶</button><button className="mini danger" onClick={() => setTracks((x) => x.filter((y) => y.id !== t.id))}>Eliminar</button></span>}>
          <Waveform data={t.samples} sampleRate={t.sr} height={70} color={t.mute ? '#4b5275' : '#a78bfa'} />
          <div className="mixrow">
            <label>Volumen <input type="range" min={-30} max={12} step={0.5} value={t.gainDb} onChange={(e) => upd(t.id, { gainDb: parseFloat(e.target.value) })} /><em>{t.gainDb} dB</em></label>
            <label>Posición <input type="range" min={0} max={5} step={0.01} value={t.offset} onChange={(e) => upd(t.id, { offset: parseFloat(e.target.value) })} /><em>{t.offset.toFixed(2)} s</em></label>
            <label className="check"><input type="checkbox" checked={t.mute} onChange={(e) => upd(t.id, { mute: e.target.checked })} /> Silenciar</label>
          </div>
        </Card>))}
      {tracks.length > 0 && <Card title="MEZCLA FINAL"><Waveform data={mix} sampleRate={RATE} height={100} color="#c4b5fd" cursor={player.position} /></Card>}
    </div>
  );
}
