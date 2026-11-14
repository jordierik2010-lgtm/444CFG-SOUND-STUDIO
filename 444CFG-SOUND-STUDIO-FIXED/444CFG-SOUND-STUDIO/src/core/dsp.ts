/** Efectos de audio sobre Float32 mono. Mismo código para previsualizar y para aplicar. */
export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function norm(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
export function lowShelf(sr: number, f: number, gainDb: number): Biquad {
  const A = 10 ** (gainDb / 40), w = (2 * Math.PI * f) / sr, c = Math.cos(w), s = Math.sin(w), al = (s / 2) * Math.SQRT2, t = 2 * Math.sqrt(A) * al;
  return norm(A * ((A + 1) - (A - 1) * c + t), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - t),
    (A + 1) + (A - 1) * c + t, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - t);
}
export function highShelf(sr: number, f: number, gainDb: number): Biquad {
  const A = 10 ** (gainDb / 40), w = (2 * Math.PI * f) / sr, c = Math.cos(w), s = Math.sin(w), al = (s / 2) * Math.SQRT2, t = 2 * Math.sqrt(A) * al;
  return norm(A * ((A + 1) + (A - 1) * c + t), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - t),
    (A + 1) - (A - 1) * c + t, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - t);
}
export function peaking(sr: number, f: number, gainDb: number, q = 1): Biquad {
  const A = 10 ** (gainDb / 40), w = (2 * Math.PI * f) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  return norm(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
}
export function lowpass(sr: number, f: number, q = Math.SQRT1_2): Biquad {
  const w = (2 * Math.PI * f) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  return norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
}
export function applyBiquad(x: Float32Array, q: Biquad): Float32Array {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = q.b0 * x[i] + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export const dbToGain = (db: number) => 10 ** (db / 20);
export const peak = (x: Float32Array) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };

export function gain(x: Float32Array, db: number): Float32Array { const g = dbToGain(db), y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * g; return y; }
export function normalize(x: Float32Array, targetDb = -1): Float32Array { const p = peak(x); return p < 1e-9 ? x : gain(x, targetDb - 20 * Math.log10(p)); }
export function fade(x: Float32Array, sr: number, inSec: number, outSec: number): Float32Array {
  const y = Float32Array.from(x), a = Math.min(x.length, Math.round(inSec * sr)), b = Math.min(x.length, Math.round(outSec * sr));
  for (let i = 0; i < a; i++) y[i] *= i / a;
  for (let i = 0; i < b; i++) y[x.length - 1 - i] *= i / b;
  return y;
}
export function trim(x: Float32Array, sr: number, startSec: number, endSec: number): Float32Array {
  const a = Math.max(0, Math.round(startSec * sr)), b = Math.min(x.length, Math.round(endSec * sr));
  return b > a ? x.slice(a, b) : x.slice(0, 0);
}

/** Remuestreo con interpolación cúbica (Hermite) y paso bajo previo al reducir frecuencia. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to || x.length === 0) return Float32Array.from(x);
  let src = x;
  if (to < from) { const lp = lowpass(from, to * 0.45); src = applyBiquad(applyBiquad(x, lp), lp); }
  const n = Math.max(1, Math.round((src.length * to) / from)), y = new Float32Array(n), r = from / to, L = src.length;
  const at = (i: number) => src[Math.min(L - 1, Math.max(0, i))];
  for (let i = 0; i < n; i++) {
    const p = i * r, i0 = Math.floor(p), t = p - i0, a = at(i0 - 1), b = at(i0), c = at(i0 + 1), d = at(i0 + 2);
    y[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  return y;
}

/** WSOLA: cambia la duración (ratio = salida/entrada) sin cambiar el tono. */
export function timeStretch(x: Float32Array, sr: number, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-4 || x.length < 64) return Float32Array.from(x);
  const frame = Math.max(64, Math.round(sr * 0.03)) & ~1, hop = frame / 2, tol = Math.round(sr * 0.01);
  const outLen = Math.round(x.length * ratio), y = new Float32Array(outLen + frame), wsum = new Float32Array(outLen + frame);
  const win = new Float32Array(frame); for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / frame);
  const anaHop = hop / ratio; let prev = 0;
  for (let k = 0, o = 0; o < outLen; k++, o += hop) {
    let pos = Math.round(k * anaHop);
    if (k > 0) {
      const target = prev + hop; let best = pos, bc = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const s = pos + d; if (s < 0 || s + frame > x.length || target + frame > x.length) continue;
        let c = 0; for (let i = 0; i < frame; i += 4) c += x[s + i] * x[target + i];
        if (c > bc) { bc = c; best = s; }
      }
      pos = best;
    }
    prev = pos;
    for (let i = 0; i < frame && pos + i < x.length; i++) { y[o + i] += x[pos + i] * win[i]; wsum[o + i] += win[i]; }
  }
  const out = new Float32Array(outLen); for (let i = 0; i < outLen; i++) out[i] = wsum[i] > 1e-6 ? y[i] / wsum[i] : 0;
  return out;
}

export function echo(x: Float32Array, sr: number, delayMs: number, feedback: number, mix: number): Float32Array {
  const d = Math.max(1, Math.round((delayMs / 1000) * sr)), fb = Math.min(0.95, Math.max(0, feedback));
  const repeats = fb > 0 ? Math.min(12, Math.ceil(Math.log(0.001) / Math.log(fb))) : 1;
  const n = x.length + d * repeats, wet = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dry = i < x.length ? x[i] : 0;
    // línea de retardo con realimentación: wet[i] = x[i-d] + fb*wet[i-d]
    wet[i] = i >= d ? (i - d < x.length ? x[i - d] : 0) + wet[i - d] * fb : 0;
    y[i] = dry + wet[i] * mix;
  }
  return y;
}

/** Reverberación tipo Freeverb simplificada (8 combs + 4 allpass). */
export function reverb(x: Float32Array, sr: number, room: number, damp: number, mix: number, tailSec = 1.5): Float32Array {
  const k = sr / 44100, N = x.length + Math.round(tailSec * sr), inp = new Float32Array(N); inp.set(x);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((v) => Math.round(v * k));
  const aps = [556, 441, 341, 225].map((v) => Math.round(v * k));
  const fb = 0.7 + 0.28 * Math.min(1, Math.max(0, room)), d = Math.min(0.9, Math.max(0, damp)), out = new Float32Array(N);
  for (const len of combs) {
    const buf = new Float32Array(len); let idx = 0, store = 0;
    for (let i = 0; i < N; i++) { const o = buf[idx]; store = o * (1 - d) + store * d; buf[idx] = inp[i] * 0.015 + store * fb; if (++idx >= len) idx = 0; out[i] += o; }
  }
  let cur = out;
  for (const len of aps) {
    const buf = new Float32Array(len), y = new Float32Array(N); let idx = 0;
    for (let i = 0; i < N; i++) { const b = buf[idx]; y[i] = -cur[i] + b; buf[idx] = cur[i] + b * 0.5; if (++idx >= len) idx = 0; }
    cur = y;
  }
  const res = new Float32Array(N);
  for (let i = 0; i < N; i++) res[i] = (i < x.length ? x[i] : 0) * (1 - mix) + cur[i] * mix * 3;
  return res;
}

export interface EffectSettings {
  trimStart: number; trimEnd: number;       // s (trimEnd<=0 → hasta el final)
  speed: number;                            // varispeed: 1 = igual (cambia tono)
  pitchSemitones: number;                   // conserva duración
  gainDb: number; bassDb: number; trebleDb: number;
  eq: number[];                             // 5 bandas: 100,400,1k,3k,8k Hz (dB)
  echoOn: boolean; echoMs: number; echoFeedback: number; echoMix: number;
  reverbOn: boolean; reverbRoom: number; reverbDamp: number; reverbMix: number; reverbTail: number;
  normalize: boolean; fadeIn: number; fadeOut: number;
}
export const EQ_FREQS = [100, 400, 1000, 3000, 8000];
export const defaultEffects = (): EffectSettings => ({
  trimStart: 0, trimEnd: 0, speed: 1, pitchSemitones: 0, gainDb: 0, bassDb: 0, trebleDb: 0, eq: [0, 0, 0, 0, 0],
  echoOn: false, echoMs: 180, echoFeedback: 0.35, echoMix: 0.35,
  reverbOn: false, reverbRoom: 0.5, reverbDamp: 0.4, reverbMix: 0.25, reverbTail: 1.2,
  normalize: false, fadeIn: 0, fadeOut: 0,
});

/** Orden: recorte → velocidad → tono → EQ/graves/agudos → ganancia → eco → reverb → normalizar → fundidos. */
export function applyEffects(input: Float32Array, sr: number, s: EffectSettings): Float32Array {
  let x = input;
  if (s.trimStart > 0 || s.trimEnd > 0) x = trim(x, sr, s.trimStart, s.trimEnd > 0 ? s.trimEnd : x.length / sr);
  if (Math.abs(s.speed - 1) > 1e-3) x = resample(x, sr * s.speed, sr);
  if (s.pitchSemitones !== 0) { const r = 2 ** (s.pitchSemitones / 12); x = timeStretch(resample(x, sr * r, sr), sr, r); }
  if (s.bassDb) x = applyBiquad(x, lowShelf(sr, 120, s.bassDb));
  if (s.trebleDb) x = applyBiquad(x, highShelf(sr, 6000, s.trebleDb));
  s.eq.forEach((g, i) => { if (g && EQ_FREQS[i] < sr / 2.2) x = applyBiquad(x, peaking(sr, EQ_FREQS[i], g, 1)); });
  if (s.gainDb) x = gain(x, s.gainDb);
  if (s.echoOn) x = echo(x, sr, s.echoMs, s.echoFeedback, s.echoMix);
  if (s.reverbOn) x = reverb(x, sr, s.reverbRoom, s.reverbDamp, s.reverbMix, s.reverbTail);
  if (s.normalize) x = normalize(x, -1);
  if (s.fadeIn > 0 || s.fadeOut > 0) x = fade(x, sr, s.fadeIn, s.fadeOut);
  return x;
}

export interface MixTrack { samples: Float32Array; sampleRate: number; gainDb: number; offsetSec: number; mute: boolean }
export function mixTracks(tracks: MixTrack[], outRate: number): Float32Array {
  const parts = tracks.filter((t) => !t.mute).map((t) => ({ x: gain(resample(t.samples, t.sampleRate, outRate), t.gainDb), off: Math.round(Math.max(0, t.offsetSec) * outRate) }));
  const len = parts.reduce((m, p) => Math.max(m, p.off + p.x.length), 0), out = new Float32Array(len);
  for (const p of parts) for (let i = 0; i < p.x.length; i++) out[p.off + i] += p.x[i];
  const pk = peak(out); if (pk > 1) for (let i = 0; i < len; i++) out[i] /= pk;
  return out;
}
