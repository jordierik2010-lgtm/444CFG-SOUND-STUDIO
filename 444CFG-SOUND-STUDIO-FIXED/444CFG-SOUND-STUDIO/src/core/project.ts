import type { EffectSettings } from './dsp.ts';
import type { Category } from './classify.ts';

export const PROJECT_VERSION = 1;
export interface SourceRef { id: string; name: string; path: string; kind: 'rpf' | 'awc' | 'audio'; sha256: string; size: number }
export interface ReplacementMeta {
  key: string;            // `${sourceId}:${awcOffset}:${streamIndex}`
  sourceId: string; awcOffset: number; streamIndex: number; streamId: number;
  wavFile: string;        // nombre dentro de audio/ (PCM16 mono ya procesado)
  sampleRate: number; fx: EffectSettings | null; note?: string; modifiedAt: string;
}
export interface ProjectFile {
  version: number; name: string; createdAt: string; updatedAt: string;
  sources: SourceRef[]; replacements: ReplacementMeta[];
  bankTags: Record<string, Category>;   // `${sourceId}:${awcOffset}` → categoría manual
  exportConfig: { targetRate: 'original' | number; installDir?: string };
  info: { description: string; author: string };
}
export const newProject = (name: string): ProjectFile => ({
  version: PROJECT_VERSION, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  sources: [], replacements: [], bankTags: {}, exportConfig: { targetRate: 'original' }, info: { description: '', author: '' },
});
export function parseProject(json: string): ProjectFile {
  const p = JSON.parse(json) as ProjectFile;
  if (typeof p !== 'object' || p === null || p.version !== PROJECT_VERSION || !Array.isArray(p.sources) || !Array.isArray(p.replacements)) throw new Error('Archivo de proyecto no válido o de otra versión');
  return p;
}
export const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 64) || 'proyecto';
