// Genera el informe de análisis de RPF/AWC.  Uso: RPF_DIR=<carpeta> node --experimental-strip-types scripts/analyze.ts > docs/ANALISIS_RPF.md
import { readFileSync } from 'node:fs';
import { carveAwc, inspectRpf } from '../src/core/rpf.ts';
import { streamFormat, extraChunkTags } from '../src/core/awc.ts';
import { createHash } from 'node:crypto';

const DIR = process.env.RPF_DIR ?? '.';
const FILES = (process.env.RPF_FILES ?? 'RESIDENT.rpf,RESIDENT_1.rpf,WEAPONS_PLAYER.rpf,WEAPONS_PLAYER_1.rpf').split(',');
const out: string[] = ['# Análisis de los RPF de muestra', ''];
const banksBy = new Map<string, ReturnType<typeof carveAwc>>();
for (const f of FILES) {
  const buf = readFileSync(`${DIR}/${f}`), info = inspectRpf(buf), slots = carveAwc(buf);
  banksBy.set(f, slots);
  out.push(`## ${f}`, '', `- Tamaño: ${buf.length} B · SHA-256: \`${createHash('sha256').update(buf).digest('hex')}\``, `- RPF7 · entradas: ${info.entryCount} · cifrado del índice: **${info.encryption}** (${info.readableToc ? 'legible' : 'no legible sin claves: nombres de archivos internos desconocidos'})`, `- Bancos AWC sin cifrar localizados por firma: **${slots.length}**`, '');
  out.push('| Offset | Streams | Bytes AWC | Hueco | Libre | Codecs | Frecuencias (Hz) | Duración total | Streams sin audio PCM | Chunks extra |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const s of slots) {
    const codecs = new Set<number>(), rates = new Set<number>(), extra = new Set<string>(); let secs = 0, non = 0;
    for (const st of s.awc.streams) { const fm = streamFormat(st); if (!fm) { non++; } else { codecs.add(fm.codec); rates.add(fm.sampleRate); secs += fm.samples / Math.max(1, fm.sampleRate); } extraChunkTags(st).forEach((t) => extra.add('0x' + t.toString(16))); }
    const r = [...rates].sort((a, b) => a - b);
    out.push(`| 0x${s.offset.toString(16)} | ${s.streamCount} | ${s.size} | ${s.slotSize} | ${s.slotSize - s.size} | ${[...codecs].join(',') || '—'} | ${r.length > 4 ? `${r[0]}…${r[r.length - 1]} (${r.length} valores)` : r.join(', ')} | ${secs.toFixed(1)} s | ${non} | ${[...extra].join(' ') || '—'} |`);
  }
  out.push('');
}
out.push('## Comparación entre versiones (por identificadores de stream)', '');
for (const [a, b] of [[FILES[0], FILES[1]], [FILES[2], FILES[3]]]) {
  if (!a || !b) continue;
  out.push(`### ${a} ↔ ${b}`, '', '| Banco A | Banco B | IDs comunes | Solo A | Solo B | Muestras distintas en comunes |', '|---|---|---|---|---|---|');
  for (const x of banksBy.get(a) ?? []) {
    let best: { y: ReturnType<typeof carveAwc>[number]; common: number } | null = null;
    const ids = new Set(x.awc.streams.map((s) => s.id));
    for (const y of banksBy.get(b) ?? []) { const c = y.awc.streams.filter((s) => ids.has(s.id)).length; if (c > 0 && (!best || c > best.common)) best = { y, common: c }; }
    if (!best) { out.push(`| 0x${x.offset.toString(16)} (${x.streamCount}) | — | 0 | ${x.streamCount} | — | — |`); continue; }
    const mapB = new Map(best.y.awc.streams.map((s) => [s.id, s])); let diff = 0;
    for (const s of x.awc.streams) { const o = mapB.get(s.id); if (o && streamFormat(s)?.samples !== streamFormat(o)?.samples) diff++; }
    out.push(`| 0x${x.offset.toString(16)} (${x.streamCount}) | 0x${best.y.offset.toString(16)} (${best.y.streamCount}) | ${best.common} | ${x.streamCount - best.common} | ${best.y.streamCount - best.common} | ${diff} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
