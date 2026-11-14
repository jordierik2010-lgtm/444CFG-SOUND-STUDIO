export interface WavData { sampleRate: number; channels: Float32Array[] }

export function decodeWav(bytes: Uint8Array): WavData {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('No es un WAV RIFF válido');
  let p = 12, fmt: { format: number; ch: number; sr: number; bits: number } | null = null, dataOff = -1, dataLen = 0;
  while (p + 8 <= bytes.length) {
    const id = tag(p), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') {
      let format = dv.getUint16(p + 8, true);
      const bits = dv.getUint16(p + 22, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(p + 32, true);
      fmt = { format, ch: dv.getUint16(p + 10, true), sr: dv.getUint32(p + 12, true), bits };
    } else if (id === 'data') { dataOff = p + 8; dataLen = Math.min(size, bytes.length - dataOff); break; }
    p += 8 + size + (size & 1);
  }
  if (!fmt || dataOff < 0) throw new Error('WAV sin chunks fmt/data');
  const { format, ch, sr, bits } = fmt;
  const supported = (format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && [32, 64].includes(bits));
  if (!supported || ch < 1) throw new Error(`Formato WAV no soportado (tipo ${format}, ${bits} bit)`);
  const bps = bits / 8, frames = Math.floor(dataLen / (bps * ch));
  const out = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) {
    const o = dataOff + (i * ch + c) * bps; let v: number;
    if (format === 3) v = bits === 32 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
    else if (bits === 8) v = (dv.getUint8(o) - 128) / 128;
    else if (bits === 16) v = dv.getInt16(o, true) / 32768;
    else if (bits === 24) v = (dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16)) / 8388608;
    else v = dv.getInt32(o, true) / 2147483648;
    out[c][i] = v;
  }
  return { sampleRate: sr, channels: out };
}

export function floatToPcm16(x: Float32Array): Int16Array {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])); o[i] = Math.round(v < 0 ? v * 32768 : v * 32767); }
  return o;
}
export const pcm16ToFloat = (x: Int16Array): Float32Array => Float32Array.from(x, (v) => v / 32768);

export function encodeWavPcm16(pcm: Int16Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2), dv = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return out;
}
export function downmixMono(chs: Float32Array[]): Float32Array {
  if (chs.length === 1) return chs[0];
  const o = new Float32Array(chs[0].length);
  for (const c of chs) for (let i = 0; i < o.length; i++) o[i] += c[i] / chs.length;
  return o;
}
