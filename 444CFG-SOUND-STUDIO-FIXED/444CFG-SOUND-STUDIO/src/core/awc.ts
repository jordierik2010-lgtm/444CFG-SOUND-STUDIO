/**
 * Lector / escritor AWC (contenedor de audio de GTA V, "ADAT").
 * Estructura verificada contra 32 bancos reales (ver VERIFICACION.md):
 *   cabecera: 'ADAT', u16 versión(1), u16 flags(0xFF01), u32 nStreams, u32 infoOffset(=fin de tabla)
 *   u16[n] índices de chunk, u32[n] (chunks<<29 | id29), tabla de chunks: u64 (tag<<56 | size<<28 | offset)
 *   Chunks: 0xFA formato (24 B), 0x55 datos PCM16 LE, 0x36/0xBD/0x68 otros (se conservan sin tocar).
 * Solo se admite codec 0 (PCM 16 bit mono). Otros codecs se reportan como no soportados.
 */
export const AWC_MAGIC = 0x54414441;
export const TAG_FORMAT = 0xfa;
export const TAG_DATA = 0x55;
const PACKED_TAGS = new Set([0xfa, 0x36, 0xbd]); // se colocan sin alinear (verificado en los 32 bancos)

export interface AwcChunk { tag: number; offset: number; size: number; bytes: Uint8Array; order: number }
export interface AwcStream { id: number; chunks: AwcChunk[] }
export interface AwcFile { version: number; flags: number; streams: AwcStream[]; byteLength: number; headerSize: number }
export interface AwcFormat {
  samples: number; loopPoint: number; sampleRate: number; headroom: number;
  loopBegin: number; loopEnd: number; playEnd: number; playBegin: number; codec: number;
}
export class AwcError extends Error {}

const align16 = (n: number) => (n + 15) & ~15;

export function parseAwc(buf: Uint8Array, start = 0): AwcFile {
  const dv = new DataView(buf.buffer, buf.byteOffset + start, buf.byteLength - start);
  if (dv.byteLength < 16) throw new AwcError('Archivo demasiado corto para ser AWC');
  if (dv.getUint32(0, true) !== AWC_MAGIC) throw new AwcError('Firma ADAT no encontrada');
  const version = dv.getUint16(4, true);
  const flags = dv.getUint16(6, true);
  const count = dv.getUint32(8, true);
  const infoOffset = dv.getUint32(12, true);
  if (version !== 1) throw new AwcError(`Versión AWC no soportada: ${version}`);
  if ((flags & 0x100) === 0) throw new AwcError(`Flags AWC no soportados: 0x${flags.toString(16)} (sin tabla de chunks)`);
  if (count > 0xffff) throw new AwcError(`Número de streams implausible: ${count}`);
  let p = 16;
  if (p + count * 6 > dv.byteLength) throw new AwcError('Cabecera truncada');
  const idx: number[] = [];
  for (let i = 0; i < count; i++, p += 2) idx.push(dv.getUint16(p, true));
  const infos: number[] = [];
  for (let i = 0; i < count; i++, p += 4) infos.push(dv.getUint32(p, true));
  const streams: AwcStream[] = [];
  let running = 0, maxEnd = 0;
  for (let i = 0; i < count; i++) {
    const nChunks = infos[i] >>> 29;
    if (idx[i] !== running) throw new AwcError(`Índice de chunk inconsistente en el stream ${i}`);
    const chunks: AwcChunk[] = [];
    for (let k = 0; k < nChunks; k++, p += 8) {
      if (p + 8 > dv.byteLength) throw new AwcError('Tabla de chunks truncada');
      const lo = dv.getUint32(p, true), hi = dv.getUint32(p + 4, true);
      const offset = lo & 0x0fffffff;
      const size = (hi & 0xffffff) * 16 + (lo >>> 28); // bits 28..55
      const tag = hi >>> 24;
      if (offset + size > dv.byteLength) throw new AwcError(`Chunk 0x${tag.toString(16)} fuera de rango (stream ${i})`);
      chunks.push({ tag, offset, size, bytes: buf.subarray(start + offset, start + offset + size), order: offset });
      maxEnd = Math.max(maxEnd, offset + size);
    }
    running += nChunks;
    streams.push({ id: infos[i] & 0x1fffffff, chunks });
  }
  if (p !== infoOffset) throw new AwcError(`La tabla termina en ${p} pero la cabecera indica ${infoOffset}`);
  return { version, flags, streams, byteLength: Math.max(maxEnd, p), headerSize: p };
}

export function streamFormat(s: AwcStream): AwcFormat | null {
  const c = s.chunks.find((x) => x.tag === TAG_FORMAT);
  if (!c || c.size < 20) return null;
  const d = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
  return {
    samples: d.getUint32(0, true), loopPoint: d.getInt32(4, true), sampleRate: d.getUint16(8, true),
    headroom: d.getInt16(10, true), loopBegin: d.getUint16(12, true), loopEnd: d.getUint16(14, true),
    playEnd: d.getUint16(16, true), playBegin: d.getUint8(18), codec: d.getUint8(19),
  };
}

/** PCM16 mono del stream, o null si el codec/estructura no es soportado. */
export function streamPcm(s: AwcStream): Int16Array | null {
  const f = streamFormat(s);
  const c = s.chunks.find((x) => x.tag === TAG_DATA);
  if (!f || !c || f.codec !== 0 || c.size !== f.samples * 2) return null;
  const out = new Int16Array(f.samples);
  const d = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
  for (let i = 0; i < f.samples; i++) out[i] = d.getInt16(i * 2, true);
  return out;
}

export function extraChunkTags(s: AwcStream): number[] {
  return s.chunks.filter((c) => c.tag !== TAG_FORMAT && c.tag !== TAG_DATA).map((c) => c.tag);
}

/** Devuelve un AWC nuevo con el stream sustituido (el original no se modifica). */
export function replaceStreamPcm(file: AwcFile, streamIndex: number, pcm: Int16Array, sampleRate: number): AwcFile {
  const s = file.streams[streamIndex];
  if (!s) throw new AwcError('Stream inexistente');
  const f = streamFormat(s);
  if (!f || f.codec !== 0) throw new AwcError('Solo se pueden sustituir streams PCM16 (codec 0)');
  if (sampleRate < 1 || sampleRate > 0xffff) throw new AwcError('Frecuencia fuera de rango (1-65535 Hz)');
  if (pcm.length === 0) throw new AwcError('El audio nuevo está vacío');
  const chunks = s.chunks.map((c) => {
    if (c.tag === TAG_FORMAT) {
      const nb = new Uint8Array(c.bytes);
      const d = new DataView(nb.buffer);
      d.setUint32(0, pcm.length, true);
      d.setUint16(8, sampleRate, true);
      return { ...c, bytes: nb };
    }
    if (c.tag === TAG_DATA) {
      const nb = new Uint8Array(pcm.length * 2);
      const d = new DataView(nb.buffer);
      for (let i = 0; i < pcm.length; i++) d.setInt16(i * 2, pcm[i], true);
      return { ...c, bytes: nb };
    }
    return c;
  }).map((c) => ({ ...c, size: c.bytes.length }));
  const streams = file.streams.map((x, i) => (i === streamIndex ? { ...x, chunks } : x));
  return { ...file, streams };
}

export function buildAwc(file: AwcFile): Uint8Array {
  const n = file.streams.length;
  const nChunks = file.streams.reduce((a, s) => a + s.chunks.length, 0);
  const headerSize = 16 + n * 6 + nChunks * 8;
  const flat: AwcChunk[] = [];
  file.streams.forEach((s) => s.chunks.forEach((c) => flat.push(c)));
  const placed = [...flat].sort((a, b) => a.order - b.order);
  const offsets = new Map<AwcChunk, number>();
  let cur = headerSize;
  for (const c of placed) {
    if (!PACKED_TAGS.has(c.tag)) cur = align16(cur);
    offsets.set(c, cur);
    cur += c.bytes.length;
  }
  if (cur >= 0x10000000) throw new AwcError('El AWC resultante supera el límite de 256 MB del formato');
  const out = new Uint8Array(cur);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, AWC_MAGIC, true); dv.setUint16(4, file.version, true); dv.setUint16(6, file.flags, true);
  dv.setUint32(8, n, true); dv.setUint32(12, headerSize, true);
  let p = 16, running = 0;
  for (const s of file.streams) { dv.setUint16(p, running, true); p += 2; running += s.chunks.length; }
  for (const s of file.streams) {
    if (s.id > 0x1fffffff || s.chunks.length > 7) throw new AwcError('Stream con id/chunks fuera de rango');
    dv.setUint32(p, ((s.chunks.length << 29) | s.id) >>> 0, true); p += 4;
  }
  for (const s of file.streams) for (const c of s.chunks) {
    const off = offsets.get(c) as number, size = c.bytes.length;
    dv.setUint32(p, ((size & 0xf) * 0x10000000 + off) >>> 0, true); // bits 0..27 offset, 28..31 tamaño (bajo)
    dv.setUint32(p + 4, ((c.tag << 24) | (size >>> 4)) >>> 0, true);
    p += 8;
    out.set(c.bytes, off);
  }
  return out;
}

export interface Validation { ok: boolean; errors: string[]; warnings: string[] }
/** Re-parsea los bytes y comprueba coherencia estructural y de audio. */
export function validateAwc(bytes: Uint8Array): Validation {
  const errors: string[] = [], warnings: string[] = [];
  try {
    const f = parseAwc(bytes);
    if (f.byteLength !== bytes.length) warnings.push(`Longitud ${bytes.length} distinta de la extensión de chunks ${f.byteLength}`);
    f.streams.forEach((s, i) => {
      const fm = streamFormat(s);
      if (!fm) {
        if (s.chunks.some((c) => c.tag === TAG_DATA)) errors.push(`Stream ${i}: datos de audio sin chunk de formato`);
        else warnings.push(`Stream ${i}: sin chunk de audio (chunks ${s.chunks.map((c) => '0x' + c.tag.toString(16)).join(',')}); se conserva sin tocar`);
        return;
      }
      if (fm.codec === 0 && streamPcm(s) === null) errors.push(`Stream ${i}: tamaño de datos incoherente con las muestras`);
      if (fm.codec !== 0) warnings.push(`Stream ${i}: codec ${fm.codec} no soportado para edición`);
    });
  } catch (e) { errors.push((e as Error).message); }
  return { ok: errors.length === 0, errors, warnings };
}
