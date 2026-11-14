/** Instalación segura con backup, manifiesto, verificación por hash y desinstalación. FS abstracto para poder probarlo. */
export interface Fs {
  exists(p: string): Promise<boolean>;
  read(p: string): Promise<Uint8Array>;
  write(p: string, data: Uint8Array): Promise<void>;
  remove(p: string): Promise<void>;
  rename(a: string, b: string): Promise<void>;
  mkdirp(p: string): Promise<void>;
}
export async function sha256(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const joinPath = (...p: string[]) => p.join('/').replace(/[\\/]+/g, '/');

export interface Manifest {
  id: string; createdAt: string; tool: string; project: string;
  target: string; existedBefore: boolean; originalSha256: string | null; newSha256: string; backupPath: string | null; size: number;
}
export interface HistoryEntry { date: string; project: string; file: string; operation: string; backup: string | null; result: 'ok' | 'error'; detail?: string; manifestId?: string }

export interface InstallPlan { target: string; exists: boolean; originalSha256: string | null; newSha256: string; sizeBefore: number | null; sizeAfter: number; sameContent: boolean }

export async function planInstall(fs: Fs, target: string, newBytes: Uint8Array): Promise<InstallPlan> {
  const exists = await fs.exists(target);
  const orig = exists ? await fs.read(target) : null;
  const originalSha256 = orig ? await sha256(orig) : null, newSha256 = await sha256(newBytes);
  return { target, exists, originalSha256, newSha256, sizeBefore: orig ? orig.length : null, sizeAfter: newBytes.length, sameContent: originalSha256 === newSha256 };
}

export async function appendHistory(fs: Fs, dataDir: string, e: HistoryEntry): Promise<void> {
  const p = joinPath(dataDir, 'history.json');
  let list: HistoryEntry[] = [];
  if (await fs.exists(p)) { try { list = JSON.parse(new TextDecoder().decode(await fs.read(p))); } catch { list = []; } }
  list.push(e);
  await fs.write(p, new TextEncoder().encode(JSON.stringify(list, null, 2)));
}
export async function readHistory(fs: Fs, dataDir: string): Promise<HistoryEntry[]> {
  const p = joinPath(dataDir, 'history.json');
  if (!(await fs.exists(p))) return [];
  try { return JSON.parse(new TextDecoder().decode(await fs.read(p))); } catch { return []; }
}

/** Crea una copia de seguridad con nombre único (nunca sobrescribe un backup existente). */
export async function createBackup(fs: Fs, dataDir: string, target: string): Promise<{ path: string; sha256: string }> {
  const bytes = await fs.read(target), h = await sha256(bytes);
  const dir = joinPath(dataDir, 'backups');
  await fs.mkdirp(dir);
  const base = target.split(/[\\/]/).pop() as string;
  let path = joinPath(dir, `${h.slice(0, 12)}_${base}`), n = 1;
  while (await fs.exists(path)) {
    if (await sha256(await fs.read(path)) === h) return { path, sha256: h }; // mismo contenido: reutilizar
    path = joinPath(dir, `${h.slice(0, 12)}_${n++}_${base}`);
  }
  await fs.write(path, bytes);
  if (await sha256(await fs.read(path)) !== h) throw new Error('La copia de seguridad no coincide con el original (hash distinto)');
  return { path, sha256: h };
}

export async function install(fs: Fs, dataDir: string, project: string, target: string, newBytes: Uint8Array, confirmed: boolean): Promise<Manifest> {
  if (!confirmed) throw new Error('Instalación sin confirmación explícita: cancelada');
  const plan = await planInstall(fs, target, newBytes);
  let backupPath: string | null = null;
  if (plan.exists) backupPath = (await createBackup(fs, dataDir, target)).path;
  const tmp = target + '.444tmp';
  try {
    await fs.write(tmp, newBytes);
    if (await sha256(await fs.read(tmp)) !== plan.newSha256) throw new Error('Escritura temporal corrupta (hash distinto)');
    if (plan.exists) await fs.remove(target);
    await fs.rename(tmp, target);
    if (await sha256(await fs.read(target)) !== plan.newSha256) throw new Error('El archivo instalado no coincide con el esperado');
  } catch (e) {
    if (await fs.exists(tmp)) await fs.remove(tmp).catch(() => {});
    if (backupPath && !(await fs.exists(target))) await fs.write(target, await fs.read(backupPath)); // no dejar el juego sin archivo
    await appendHistory(fs, dataDir, { date: new Date().toISOString(), project, file: target, operation: 'install', backup: backupPath, result: 'error', detail: (e as Error).message });
    throw e;
  }
  const m: Manifest = { id: `${Date.now()}`, createdAt: new Date().toISOString(), tool: '444CFG Sound Studio 1.0.0', project, target, existedBefore: plan.exists, originalSha256: plan.originalSha256, newSha256: plan.newSha256, backupPath, size: newBytes.length };
  await fs.mkdirp(joinPath(dataDir, 'manifests'));
  await fs.write(joinPath(dataDir, 'manifests', `${m.id}.json`), new TextEncoder().encode(JSON.stringify(m, null, 2)));
  await appendHistory(fs, dataDir, { date: m.createdAt, project, file: target, operation: 'install', backup: backupPath, result: 'ok', manifestId: m.id });
  return m;
}

/** Desinstala SOLO el archivo del manifiesto. Si el archivo cambió desde la instalación exige force. */
export async function uninstall(fs: Fs, dataDir: string, m: Manifest, force = false): Promise<void> {
  const exists = await fs.exists(m.target);
  if (exists && !force && await sha256(await fs.read(m.target)) !== m.newSha256) throw new Error('El archivo instalado ha cambiado desde la instalación (otro programa o una actualización). Usa «forzar» si quieres restaurar igualmente.');
  if (m.existedBefore) {
    if (!m.backupPath || !(await fs.exists(m.backupPath))) throw new Error('No se encuentra la copia de seguridad original');
    const b = await fs.read(m.backupPath);
    if (await sha256(b) !== m.originalSha256) throw new Error('La copia de seguridad está dañada (hash distinto): restauración cancelada');
    await fs.write(m.target + '.444tmp', b);
    if (exists) await fs.remove(m.target);
    await fs.rename(m.target + '.444tmp', m.target);
  } else if (exists) await fs.remove(m.target); // el archivo no existía antes: se elimina solo ese archivo
  await appendHistory(fs, dataDir, { date: new Date().toISOString(), project: m.project, file: m.target, operation: 'uninstall', backup: m.backupPath, result: 'ok', manifestId: m.id });
}
