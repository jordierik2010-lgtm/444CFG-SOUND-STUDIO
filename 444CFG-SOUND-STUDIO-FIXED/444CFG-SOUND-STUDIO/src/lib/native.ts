import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, exists, mkdir, remove, rename } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Fs } from '../core/install.ts';
import { joinPath } from '../core/install.ts';

export const tauriFs: Fs = {
  exists: (p) => exists(p),
  read: (p) => readFile(p),
  write: (p, d) => writeFile(p, d),
  remove: (p) => remove(p),
  rename: (a, b) => rename(a, b),
  mkdirp: (p) => mkdir(p, { recursive: true }),
};

export interface Detected { gta_paths: string[]; fivem_paths: string[]; codewalker: string | null; codewalker_keys_folder: boolean; ffmpeg: string | null }
export const detectEnvironment = () => invoke<Detected>('detect_environment');
export const launchExternal = (path: string) => invoke<void>('launch_external', { path });
export const runFfmpeg = (ffmpeg: string | null, input: string, output: string, sampleRate: number) =>
  invoke<void>('run_ffmpeg', { ffmpeg, input, output, sampleRate });

export async function dataDir(): Promise<string> {
  const d = (await appDataDir()).replace(/\\/g, '/').replace(/\/$/, '');
  await tauriFs.mkdirp(d);
  return d;
}
export async function pickFiles(title: string, extensions: string[], multiple = true): Promise<string[]> {
  const r = await open({ title, multiple, directory: false, filters: [{ name: 'Archivos', extensions }] });
  return r === null ? [] : Array.isArray(r) ? r : [r];
}
export async function pickFolder(title: string): Promise<string | null> {
  const r = await open({ title, directory: true, multiple: false });
  return typeof r === 'string' ? r : null;
}
export const pickSave = (title: string, name: string, extensions: string[]) => save({ title, defaultPath: name, filters: [{ name: 'Archivo', extensions }] });
export const openLink = (url: string) => openUrl(url);
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export { joinPath };
