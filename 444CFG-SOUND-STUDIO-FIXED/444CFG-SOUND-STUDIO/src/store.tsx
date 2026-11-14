import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readDir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { AwcFile, buildAwc, parseAwc, replaceStreamPcm, streamFormat, streamPcm, validateAwc } from './core/awc.ts';
import { carveAwc, inspectRpf, RpfInfo, AwcSlot } from './core/rpf.ts';
import { decodeWav, encodeWavPcm16, floatToPcm16, pcm16ToFloat } from './core/wav.ts';
import { resample, EffectSettings } from './core/dsp.ts';
import { NameDict, Category, classifyName, Classification } from './core/classify.ts';
import { sha256, joinPath } from './core/install.ts';
import { newProject, parseProject, ProjectFile, ReplacementMeta, safeName, SourceRef } from './core/project.ts';
import { baseName, dataDir, pickFolder, pickFiles, tauriFs, detectEnvironment } from './lib/native.ts';

export type Page = 'home' | 'editor' | 'death' | 'footsteps' | 'weapons' | 'effects' | 'mixer' | 'library' | 'export' | 'settings' | 'history';
export interface Bank { key: string; sourceId: string; offset: number; size: number; slotSize: number; awc: AwcFile; label: string }
export interface Source { id: string; name: string; path: string; kind: 'rpf' | 'awc'; bytes: Uint8Array; sha256: string; rpf?: RpfInfo; banks: Bank[]; slots: AwcSlot[] }
export interface Sel { sourceId: string; offset: number; streamIndex: number }
export interface Edit { meta: ReplacementMeta; pcm: Int16Array }
export interface Settings { gta: string; fivem: string; codewalker: string; ffmpeg: string }
export interface Pending { name: string; samples: Float32Array; sampleRate: number }
export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }
export interface StreamRow { source: Source; bank: Bank; index: number; id: number; name?: string; cls: Classification | null; manual?: Category; codec: number | null; samples: number; sampleRate: number }

export const keyOf = (s: Sel) => `${s.sourceId}:${s.offset}:${s.streamIndex}`;
const bankKey = (sourceId: string, offset: number) => `${sourceId}:${offset}`;

interface Ctx {
  page: Page; setPage: (p: Page) => void;
  sources: Source[]; edits: Record<string, Edit>; selected: Sel | null; select: (s: Sel | null) => void;
  settings: Settings; setSettings: (s: Settings) => void; dir: string;
  project: ProjectFile; setProject: (p: ProjectFile) => void; projectDir: string | null; dirty: boolean;
  pending: Pending | null; setPending: (p: Pending | null) => void;
  toasts: Toast[]; notify: (kind: Toast['kind'], text: string) => void;
  names: NameDict; namesCount: number; loadDictionary: (text: string) => number;
  openPaths: (paths: string[]) => Promise<void>; openDialog: () => Promise<void>; openFolderDialog: () => Promise<void>;
  rows: StreamRow[]; rowFor: (s: Sel) => StreamRow | null;
  originalPcm: (s: Sel) => Int16Array | null; currentPcm: (s: Sel) => Int16Array | null;
  setEdit: (s: Sel, samples: Float32Array, sr: number, fx: EffectSettings | null) => void; restore: (s: Sel) => void;
  buildBankBytes: (bank: Bank) => Uint8Array; editsForBank: (bank: Bank) => number;
  tagBank: (bank: Bank, c: Category | null) => void;
  newProj: (name: string) => void; saveProj: () => Promise<void>; openProj: () => Promise<void>; closeSource: (id: string) => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('home');
  const [sources, setSources] = useState<Source[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [selected, select] = useState<Sel | null>(null);
  const [settings, setSettingsState] = useState<Settings>({ gta: '', fivem: '', codewalker: '', ffmpeg: '' });
  const [dir, setDir] = useState('');
  const [project, setProjectState] = useState<ProjectFile>(() => newProject('SIN_TITULO'));
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const namesRef = useRef(new NameDict()); const dictTexts = useRef<string[]>([]);
  const [namesCount, setNamesCount] = useState(0);
  const projRef = useRef(project); projRef.current = project;

  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random(); setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 12000 : 5000);
  }, []);
  const setProject = useCallback((p: ProjectFile) => { setProjectState({ ...p, updatedAt: new Date().toISOString() }); setDirty(true); }, []);

  useEffect(() => { (async () => {
    const d = await dataDir(); setDir(d);
    try { const s = JSON.parse(new TextDecoder().decode(await readFile(joinPath(d, 'settings.json')))); setSettingsState(s); return; } catch { /* primera ejecución */ }
    try {
      const det = await detectEnvironment();
      setSettingsState({ gta: det.gta_paths[0] ?? '', fivem: det.fivem_paths[0] ?? '', codewalker: det.codewalker ?? '', ffmpeg: det.ffmpeg ?? '' });
    } catch (e) { notify('err', `Detección de entorno: ${String(e)}`); }
  })(); }, [notify]);
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    if (dir) writeFile(joinPath(dir, 'settings.json'), new TextEncoder().encode(JSON.stringify(s, null, 2))).catch((e) => notify('err', `No se pudo guardar la configuración: ${e}`));
  }, [dir, notify]);

  const applyNames = useCallback((list: Source[]) => {
    const wanted = new Set<number>(); list.forEach((s) => s.banks.forEach((b) => b.awc.streams.forEach((st) => wanted.add(st.id))));
    const d = new NameDict(); dictTexts.current.forEach((t) => d.addLines(t, wanted)); namesRef.current = d; setNamesCount(d.size);
  }, []);
  const loadDictionary = useCallback((text: string) => {
    dictTexts.current.push(text); applyNames(sources); return namesRef.current.size;
  }, [applyNames, sources]);

  const loadOne = useCallback(async (path: string): Promise<Source | null> => {
    const name = baseName(path), ext = name.toLowerCase().split('.').pop();
    if (ext !== 'rpf' && ext !== 'awc' && ext !== 'oac') { notify('err', `Formato no soportado como banco: .${ext}. Importa WAV/MP3/OGG desde el editor de audio.`); return null; }
    const bytes = await readFile(path); const hash = await sha256(bytes); const id = hash.slice(0, 10);
    if (ext === 'rpf') {
      const rpf = inspectRpf(bytes), slots = carveAwc(bytes);
      const banks: Bank[] = slots.map((s, i) => ({ key: bankKey(id, s.offset), sourceId: id, offset: s.offset, size: s.size, slotSize: s.slotSize, awc: s.awc, label: `AWC #${i + 1} · 0x${s.offset.toString(16).toUpperCase()} · ${s.streamCount} streams` }));
      return { id, name, path, kind: 'rpf', bytes, sha256: hash, rpf, banks, slots };
    }
    const awc = parseAwc(bytes);
    const slot: AwcSlot = { offset: 0, size: awc.byteLength, slotSize: awc.byteLength, streamCount: awc.streams.length, awc };
    return { id, name, path, kind: 'awc', bytes, sha256: hash, banks: [{ key: bankKey(id, 0), sourceId: id, offset: 0, size: awc.byteLength, slotSize: awc.byteLength, awc, label: `${name} · ${awc.streams.length} streams` }], slots: [slot] };
  }, [notify]);

  const openPaths = useCallback(async (paths: string[]) => {
    const added: Source[] = [];
    for (const p of paths) {
      try {
        if (sources.some((s) => s.path === p) || added.some((s) => s.path === p)) { notify('info', `${baseName(p)} ya está abierto`); continue; }
        const s = await loadOne(p); if (!s) continue; added.push(s);
        const note = s.kind === 'rpf' ? `${s.name}: RPF7 (${s.rpf!.encryption}), ${s.banks.length} bancos AWC detectados. ${s.rpf!.readableToc ? '' : 'El índice está cifrado: no se muestran los nombres de archivo internos.'}` : `${s.name}: AWC con ${s.banks[0].awc.streams.length} streams`;
        notify('ok', note);
      } catch (e) { notify('err', `No se pudo abrir ${baseName(p)}: ${(e as Error).message}`); }
    }
    if (added.length) {
      const all = [...sources, ...added]; setSources(all); applyNames(all);
      setProjectState((pr) => ({ ...pr, sources: [...pr.sources, ...added.map<SourceRef>((s) => ({ id: s.id, name: s.name, path: s.path, kind: s.kind, sha256: s.sha256, size: s.bytes.length }))] })); setDirty(true);
      if (!selected) { const b = added[0].banks[0]; if (b) select({ sourceId: added[0].id, offset: b.offset, streamIndex: 0 }); }
    }
  }, [sources, loadOne, notify, applyNames, selected]);
  const openDialog = useCallback(async () => { const p = await pickFiles('Abrir sound pack', ['rpf', 'awc', 'oac']); if (p.length) await openPaths(p); }, [openPaths]);
  const openFolderDialog = useCallback(async () => {
    const f = await pickFolder('Carpeta con sound packs'); if (!f) return;
    const found: string[] = []; const walk = async (d: string, depth: number) => {
      for (const e of await readDir(d)) { const p = joinPath(d, e.name); if (e.isDirectory && depth < 3) await walk(p, depth + 1); else if (/\.(rpf|awc|oac)$/i.test(e.name)) found.push(p); }
    };
    try { await walk(f, 0); } catch (e) { notify('err', `No se pudo leer la carpeta: ${e}`); return; }
    if (!found.length) notify('info', 'La carpeta no contiene archivos .rpf/.awc/.oac'); else await openPaths(found);
  }, [openPaths, notify]);

  const closeSource = useCallback((id: string) => {
    const rest = sources.filter((s) => s.id !== id); setSources(rest); applyNames(rest);
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v.meta.sourceId !== id)));
    if (selected?.sourceId === id) select(null);
  }, [sources, applyNames, selected]);

  const rows = useMemo<StreamRow[]>(() => {
    const out: StreamRow[] = [];
    for (const source of sources) for (const bank of source.banks) {
      const manual = project.bankTags[bank.key];
      bank.awc.streams.forEach((st, index) => {
        const f = streamFormat(st), name = namesRef.current.get(st.id), cls = classifyName(name);
        out.push({ source, bank, index, id: st.id, name, cls, manual, codec: f ? f.codec : null, samples: f ? f.samples : 0, sampleRate: f ? f.sampleRate : 0 });
      });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, project.bankTags, namesCount]);

  const rowFor = useCallback((s: Sel) => rows.find((r) => r.source.id === s.sourceId && r.bank.offset === s.offset && r.index === s.streamIndex) ?? null, [rows]);
  const bankOf = useCallback((s: Sel) => sources.find((x) => x.id === s.sourceId)?.banks.find((b) => b.offset === s.offset) ?? null, [sources]);
  const originalPcm = useCallback((s: Sel) => { const b = bankOf(s); return b ? streamPcm(b.awc.streams[s.streamIndex]) : null; }, [bankOf]);
  const currentPcm = useCallback((s: Sel) => edits[keyOf(s)]?.pcm ?? originalPcm(s), [edits, originalPcm]);

  const setEdit = useCallback((s: Sel, samples: Float32Array, sr: number, fx: EffectSettings | null) => {
    const b = bankOf(s); if (!b) throw new Error('Banco no encontrado');
    const f = streamFormat(b.awc.streams[s.streamIndex]); if (!f || f.codec !== 0) throw new Error('Este stream no es PCM16: no se puede sustituir');
    const t = project.exportConfig.targetRate, target = t === 'original' ? f.sampleRate : t;
    const pcm = floatToPcm16(resample(samples, sr, target));
    if (pcm.length === 0) throw new Error('El audio resultante está vacío');
    const meta: ReplacementMeta = { key: keyOf(s), sourceId: s.sourceId, awcOffset: s.offset, streamIndex: s.streamIndex, streamId: b.awc.streams[s.streamIndex].id, wavFile: `${safeName(keyOf(s))}.wav`, sampleRate: target, fx, modifiedAt: new Date().toISOString() };
    setEdits((e) => ({ ...e, [meta.key]: { meta, pcm } })); setDirty(true);
  }, [bankOf, project.exportConfig.targetRate]);
  const restore = useCallback((s: Sel) => { setEdits((e) => { const n = { ...e }; delete n[keyOf(s)]; return n; }); setDirty(true); }, []);
  const editsForBank = useCallback((b: Bank) => Object.values(edits).filter((e) => e.meta.sourceId === b.sourceId && e.meta.awcOffset === b.offset).length, [edits]);

  const buildBankBytes = useCallback((b: Bank) => {
    let awc = b.awc;
    for (const e of Object.values(edits)) if (e.meta.sourceId === b.sourceId && e.meta.awcOffset === b.offset) awc = replaceStreamPcm(awc, e.meta.streamIndex, e.pcm, e.meta.sampleRate);
    const bytes = buildAwc(awc), v = validateAwc(bytes);
    if (!v.ok) throw new Error(`El AWC reconstruido no es válido: ${v.errors.join('; ')}`);
    return bytes;
  }, [edits]);

  const tagBank = useCallback((b: Bank, c: Category | null) => {
    const tags = { ...projRef.current.bankTags }; if (c) tags[b.key] = c; else delete tags[b.key]; setProject({ ...projRef.current, bankTags: tags });
  }, [setProject]);

  const newProj = useCallback((name: string) => { setProjectState(newProject(safeName(name))); setProjectDir(null); setSources([]); setEdits({}); select(null); setDirty(false); }, []);
  const saveProj = useCallback(async () => {
    let d = projectDir; if (!d) { const base = await pickFolder('Carpeta donde guardar el proyecto'); if (!base) return; d = joinPath(base, safeName(project.name)); }
    try {
      await tauriFs.mkdirp(joinPath(d, 'audio'));
      const metas = Object.values(edits).map((e) => e.meta);
      for (const e of Object.values(edits)) await writeFile(joinPath(d, 'audio', e.meta.wavFile), encodeWavPcm16(e.pcm, e.meta.sampleRate));
      const out: ProjectFile = { ...project, updatedAt: new Date().toISOString(), replacements: metas };
      await writeFile(joinPath(d, 'project.json'), new TextEncoder().encode(JSON.stringify(out, null, 2)));
      setProjectDir(d); setDirty(false); notify('ok', `Proyecto guardado en ${d}`);
    } catch (e) { notify('err', `No se pudo guardar el proyecto: ${e}`); }
  }, [projectDir, project, edits, notify]);
  const openProj = useCallback(async () => {
    const f = (await pickFiles('Abrir proyecto (project.json)', ['json'], false))[0]; if (!f) return;
    try {
      const d = f.replace(/\\/g, '/').replace(/\/[^/]+$/, ''); const p = parseProject(new TextDecoder().decode(await readFile(f)));
      const loaded: Source[] = [], missing: string[] = [];
      for (const ref of p.sources) {
        try { const s = await loadOne(ref.path); if (!s) continue; if (s.sha256 !== ref.sha256) notify('err', `${ref.name}: el archivo ha cambiado desde que se guardó el proyecto (hash distinto). Se carga igualmente; revisa los cambios.`); loaded.push(s); }
        catch { missing.push(ref.path); }
      }
      const ed: Record<string, Edit> = {};
      for (const m of p.replacements) {
        try { const w = decodeWav(await readFile(joinPath(d, 'audio', m.wavFile))); const pcm = floatToPcm16(w.channels[0]); ed[m.key] = { meta: m, pcm }; }
        catch (e) { missing.push(`audio/${m.wavFile}`); }
      }
      setSources(loaded); applyNames(loaded); setEdits(ed); setProjectState(p); setProjectDir(d); setDirty(false); select(null);
      notify(missing.length ? 'err' : 'ok', missing.length ? `Proyecto abierto con archivos que faltan: ${missing.join(', ')}` : `Proyecto «${p.name}» abierto`);
    } catch (e) { notify('err', `No se pudo abrir el proyecto: ${(e as Error).message}`); }
  }, [loadOne, applyNames, notify]);

  const value: Ctx = { page, setPage, sources, edits, selected, select, settings, setSettings, dir, project, setProject, projectDir, dirty, pending, setPending, toasts, notify, names: namesRef.current, namesCount, loadDictionary, openPaths, openDialog, openFolderDialog, rows, rowFor, originalPcm, currentPcm, setEdit, restore, buildBankBytes, editsForBank, tagBank, newProj, saveProj, openProj, closeSource };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export { pcm16ToFloat };
