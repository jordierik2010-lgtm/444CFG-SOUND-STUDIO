import { parseAwc } from './awc.ts';
import type { AwcFile } from './awc.ts';

export const RPF7_MAGIC = 0x52504637;
export const ENC_NAMES: Record<number, string> = {
  0: 'Sin cifrar', 0x4e45504f: 'OPEN', 0x0ffffff9: 'AES', 0x0fefffff: 'NG',
};
export interface RpfInfo { entryCount: number; namesLength: number; encryption: string; tocBytes: number; readableToc: boolean }

export function inspectRpf(buf: Uint8Array): RpfInfo {
  if (buf.length < 16) throw new Error('Archivo demasiado corto para ser RPF');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== RPF7_MAGIC) throw new Error('No es un RPF7 (firma 7FPR no encontrada)');
  const entryCount = dv.getUint32(4, true), namesLength = dv.getUint32(8, true), enc = dv.getUint32(12, true);
  const tocBytes = 16 + entryCount * 16 + namesLength;
  return {
    entryCount, namesLength, encryption: ENC_NAMES[enc] ?? `Desconocido 0x${enc.toString(16)}`, tocBytes,
    readableToc: enc === 0 || enc === 0x4e45504f,
  };
}

export interface AwcSlot {
  offset: number;      // posición absoluta en el RPF
  size: number;        // bytes reales del AWC (máximo permitido para sustituirlo en sitio)
  slotSize: number;    // size + relleno de ceros hasta el siguiente múltiplo de 512
  streamCount: number;
  awc: AwcFile;
}

/** Localiza bancos AWC sin cifrar por firma. Criterios estrictos: alineado a 512, parseo completo y coherente. */
export function carveAwc(buf: Uint8Array): AwcSlot[] {
  const out: AwcSlot[] = [];
  let i = 0;
  while (i < buf.length - 16) {
    i = buf.indexOf(0x41, i);
    if (i < 0) break;
    if (i % 512 === 0 && buf[i + 1] === 0x44 && buf[i + 2] === 0x41 && buf[i + 3] === 0x54) {
      try {
        const awc = parseAwc(buf, i);
        const end = i + awc.byteLength, aligned = Math.ceil(end / 512) * 512;
        let zero = aligned <= buf.length;
        for (let k = end; zero && k < aligned; k++) if (buf[k] !== 0) zero = false;
        out.push({ offset: i, size: awc.byteLength, slotSize: zero ? aligned - i : awc.byteLength, streamCount: awc.streams.length, awc });
        i += Math.max(awc.byteLength, 4);
        continue;
      } catch { /* no es un AWC válido: seguir buscando */ }
    }
    i++;
  }
  return out;
}

export interface Patch { offset: number; bytes: Uint8Array }

/** Sustituye un AWC dentro del RPF SIN alterar el TOC ni el tamaño del archivo. */
export function patchAwcInPlace(rpf: Uint8Array, slot: AwcSlot, newAwc: Uint8Array): void {
  if (newAwc.length > slot.size) {
    throw new Error(`El AWC nuevo (${newAwc.length} B) no cabe en el hueco original (${slot.size} B). Acorta el audio o usa «Exportar AWC».`);
  }
  rpf.fill(0, slot.offset, slot.offset + slot.slotSize);
  rpf.set(newAwc, slot.offset);
}

export interface PatchReport { ok: boolean; errors: string[] }
/** Comprueba que el RPF modificado difiere del original solo dentro de los huecos parcheados y que los AWC siguen siendo válidos. */
export function verifyPatchedRpf(original: Uint8Array, patched: Uint8Array, slots: AwcSlot[]): PatchReport {
  const errors: string[] = [];
  if (original.length !== patched.length) errors.push('La longitud del RPF ha cambiado');
  else {
    const info = inspectRpf(original);
    for (let i = 0; i < info.tocBytes; i++) if (original[i] !== patched[i]) { errors.push('El TOC/cabecera ha sido modificado'); break; }
    const sorted = [...slots].sort((a, b) => a.offset - b.offset);
    let si = 0;
    for (let i = 0; i < original.length && errors.length < 5; i++) {
      if (original[i] === patched[i]) continue;
      while (si < sorted.length && sorted[si].offset + sorted[si].slotSize <= i) si++;
      if (si >= sorted.length || i < sorted[si].offset) { errors.push(`Byte modificado fuera de un hueco AWC en 0x${i.toString(16)}`); break; }
    }
  }
  for (const s of slots) {
    try { parseAwc(patched, s.offset); } catch (e) { errors.push(`AWC en 0x${s.offset.toString(16)} inválido tras parchear: ${(e as Error).message}`); }
  }
  return { ok: errors.length === 0, errors };
}
