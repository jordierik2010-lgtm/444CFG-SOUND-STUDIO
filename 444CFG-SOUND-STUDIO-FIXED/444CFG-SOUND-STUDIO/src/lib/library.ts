import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { encodeWavPcm16, floatToPcm16, decodeWav, downmixMono } from '../core/wav.ts';
import { joinPath } from '../core/install.ts';
import { tauriFs } from './native.ts';

export type LibCategory = 'DEATH' | 'FOOTSTEPS' | 'WEAPONS' | 'IMPACTS' | 'EFFECTS' | 'CUSTOM';
export const LIB_CATEGORIES: LibCategory[] = ['DEATH', 'FOOTSTEPS', 'WEAPONS', 'IMPACTS', 'EFFECTS', 'CUSTOM'];
export interface LibItem { id: string; name: string; category: LibCategory; tags: string[]; file: string; sampleRate: number; seconds: number; addedAt: string }

const idx = (dir: string) => joinPath(dir, 'library', 'index.json');
export async function loadLibrary(dir: string): Promise<LibItem[]> {
  try { return JSON.parse(new TextDecoder().decode(await readFile(idx(dir)))); } catch { return []; }
}
async function save(dir: string, items: LibItem[]) {
  await tauriFs.mkdirp(joinPath(dir, 'library'));
  await writeFile(idx(dir), new TextEncoder().encode(JSON.stringify(items, null, 2)));
}
/** La biblioteca guarda SU PROPIA copia (WAV PCM16 mono): las fuentes originales no se tocan. */
export async function addToLibrary(dir: string, items: LibItem[], name: string, category: LibCategory, samples: Float32Array, sampleRate: number): Promise<LibItem[]> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, file = `${id}.wav`;
  await tauriFs.mkdirp(joinPath(dir, 'library', 'files'));
  await writeFile(joinPath(dir, 'library', 'files', file), encodeWavPcm16(floatToPcm16(samples), sampleRate));
  const next = [...items, { id, name, category, tags: [], file, sampleRate, seconds: samples.length / sampleRate, addedAt: new Date().toISOString() }];
  await save(dir, next); return next;
}
export const updateItem = async (dir: string, items: LibItem[], id: string, patch: Partial<LibItem>) => { const n = items.map((i) => (i.id === id ? { ...i, ...patch } : i)); await save(dir, n); return n; };
export async function removeItem(dir: string, items: LibItem[], id: string) {
  const it = items.find((i) => i.id === id); if (it) await tauriFs.remove(joinPath(dir, 'library', 'files', it.file)).catch(() => {});
  const n = items.filter((i) => i.id !== id); await save(dir, n); return n;
}
export async function readItem(dir: string, it: LibItem) {
  const w = decodeWav(await readFile(joinPath(dir, 'library', 'files', it.file))); return { samples: downmixMono(w.channels), sampleRate: w.sampleRate };
}
