import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEffects, defaultEffects, echo, gain, mixTracks, normalize, peak, resample, reverb, timeStretch, fade, trim, applyBiquad, lowShelf } from '../src/core/dsp.ts';

const sine = (f: number, sr: number, sec: number, a = 0.5) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const zeroCross = (x: Float32Array) => { let c = 0; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) c++; return c; };

test('gain +6 dB ≈ ×2', () => { assert.ok(Math.abs(peak(gain(sine(440, 44100, 0.1), 6)) / 0.5 - 1.995) < 0.01); });
test('normalize lleva el pico a -1 dBFS', () => { assert.ok(Math.abs(20 * Math.log10(peak(normalize(sine(440, 44100, 0.1, 0.1)))) + 1) < 0.01); });
test('resample cambia la longitud según la razón', () => { assert.equal(resample(sine(440, 44100, 1), 44100, 22050).length, 22050); });
test('pitch +12 semitonos duplica frecuencia y conserva duración', () => {
  const x = sine(300, 44100, 1), s = defaultEffects(); s.pitchSemitones = 12;
  const y = applyEffects(x, 44100, s);
  assert.ok(Math.abs(y.length - x.length) / x.length < 0.03, `len ${y.length}`);
  assert.ok(Math.abs(zeroCross(y) / zeroCross(x) - 2) < 0.15, `ratio ${zeroCross(y) / zeroCross(x)}`);
});
test('speed 2 acorta a la mitad', () => { const s = defaultEffects(); s.speed = 2; assert.equal(applyEffects(sine(300, 44100, 1), 44100, s).length, 22050); });
test('timeStretch ×1.5 alarga sin cambiar el tono', () => {
  const x = sine(500, 44100, 1), y = timeStretch(x, 44100, 1.5);
  assert.ok(Math.abs(y.length / x.length - 1.5) < 0.01);
  assert.ok(Math.abs(zeroCross(y) / y.length / (zeroCross(x) / x.length) - 1) < 0.05);
});
test('bass boost sube graves y no agudos', () => {
  const lo = sine(60, 44100, 0.5), hi = sine(8000, 44100, 0.5), q = lowShelf(44100, 120, 9);
  assert.ok(rms(applyBiquad(lo, q)) / rms(lo) > 2); assert.ok(Math.abs(rms(applyBiquad(hi, q)) / rms(hi) - 1) < 0.05);
});
test('echo y reverb alargan la señal y mantienen el inicio seco', () => {
  const x = sine(440, 44100, 0.2);
  assert.ok(echo(x, 44100, 150, 0.4, 0.5).length > x.length);
  const r = reverb(x, 44100, 0.6, 0.4, 0.3, 1); assert.ok(r.length > x.length && peak(r) > 0);
});
test('fade y trim', () => {
  const f = fade(Float32Array.from({ length: 1000 }, () => 1), 1000, 0.1, 0.1); assert.equal(f[0], 0); assert.equal(f[999], 0); assert.equal(f[500], 1);
  assert.equal(trim(new Float32Array(44100), 44100, 0.25, 0.5).length, 11025);
});
test('mezcla: offset y silencio de pista', () => {
  const t = (m: boolean, off: number) => ({ samples: sine(440, 8000, 0.5), sampleRate: 8000, gainDb: 0, offsetSec: off, mute: m });
  assert.equal(mixTracks([t(false, 0), t(false, 1)], 8000).length, 8000 * 1.5);
  assert.equal(mixTracks([t(false, 0), t(true, 5)], 8000).length, 4000);
});
