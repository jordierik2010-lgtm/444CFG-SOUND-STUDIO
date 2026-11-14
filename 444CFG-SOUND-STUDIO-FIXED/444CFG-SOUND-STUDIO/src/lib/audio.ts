import { useEffect, useRef, useState, useCallback } from 'react';
import { decodeWav, downmixMono } from '../core/wav.ts';
import { dataDir, runFfmpeg, tauriFs, baseName } from './native.ts';
import { readFile } from '@tauri-apps/plugin-fs';

export interface Mono { samples: Float32Array; sampleRate: number }

/** Importa WAV/MP3/OGG/FLAC. WAV por decodificador propio, resto por Web Audio y, si falla, FFmpeg. Los errores son reales. */
export async function importAudioFile(path: string, ffmpegPath: string | null): Promise<Mono> {
  const bytes = await readFile(path);
  if (/\.wav$/i.test(path)) {
    try { const w = decodeWav(bytes); return { samples: downmixMono(w.channels), sampleRate: w.sampleRate }; } catch { /* probar otros métodos */ }
  }
  let webErr = '';
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(bytes.slice().buffer);
    const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice());
    return { samples: downmixMono(chs), sampleRate: buf.sampleRate };
  } catch (e) { webErr = String(e); }
  try {
    const tmp = `${await dataDir()}/tmp_${Date.now()}.wav`;
    await runFfmpeg(ffmpegPath, path, tmp, 44100);
    const w = decodeWav(await readFile(tmp)); await tauriFs.remove(tmp).catch(() => {});
    return { samples: downmixMono(w.channels), sampleRate: w.sampleRate };
  } catch (e) {
    throw new Error(`No se pudo leer «${baseName(path)}». Web Audio: ${webErr}. FFmpeg: ${String(e)}`);
  }
}

export type PlayState = 'stopped' | 'playing' | 'paused';
/** Reproductor Web Audio con pausa real (suspend/resume), bucle y selección. */
export function usePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const meta = useRef({ startCtx: 0, from: 0, to: 0, rate: 1, vol: 1 });
  const [state, setState] = useState<PlayState>('stopped');
  const [position, setPosition] = useState(0);

  const ctx = () => {
    if (!ctxRef.current) { const c = new AudioContext(); const g = c.createGain(); g.connect(c.destination); g.gain.value = meta.current.vol; ctxRef.current = c; gainRef.current = g; }
    return ctxRef.current;
  };
  const stop = useCallback(() => {
    try { srcRef.current?.stop(); } catch { /* ya detenido */ }
    srcRef.current = null; setState('stopped'); setPosition(0);
    ctxRef.current?.resume().catch(() => {});
  }, []);
  const play = useCallback(async (data: Float32Array, sr: number, opts: { from?: number; to?: number; loop?: boolean } = {}) => {
    stop();
    if (data.length === 0) return;
    const c = ctx(); await c.resume();
    const buf = c.createBuffer(1, data.length, sr); buf.getChannelData(0).set(data);
    const s = c.createBufferSource(); s.buffer = buf; s.connect(gainRef.current!);
    const from = Math.max(0, opts.from ?? 0), to = opts.to && opts.to > from ? opts.to : buf.duration;
    s.loop = !!opts.loop; if (s.loop) { s.loopStart = from; s.loopEnd = to; }
    s.onended = () => { if (srcRef.current === s) { srcRef.current = null; setState('stopped'); setPosition(0); } };
    s.start(0, from, s.loop ? undefined : to - from);
    srcRef.current = s; meta.current = { ...meta.current, startCtx: c.currentTime, from, to, rate: 1 };
    setState('playing');
  }, [stop]);
  const pause = useCallback(async () => {
    const c = ctxRef.current; if (!c || !srcRef.current) return;
    if (c.state === 'running') { await c.suspend(); setState('paused'); } else { await c.resume(); setState('playing'); }
  }, []);
  const setVolume = useCallback((v: number) => { meta.current.vol = v; if (gainRef.current) gainRef.current.gain.value = v; }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = ctxRef.current;
      if (c && srcRef.current) {
        const m = meta.current; let t = m.from + (c.currentTime - m.startCtx);
        if (srcRef.current.loop && m.to > m.from) t = m.from + ((t - m.from) % (m.to - m.from));
        setPosition(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); try { srcRef.current?.stop(); } catch { /* */ } srcRef.current = null; ctxRef.current?.close().catch(() => {}); ctxRef.current = null; gainRef.current = null; /* StrictMode remonta: no reutilizar un contexto cerrado */ };
  }, []);
  return { state, position, play, pause, stop, setVolume };
}
