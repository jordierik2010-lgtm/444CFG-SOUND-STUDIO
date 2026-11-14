import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackup, install, planInstall, readHistory, sha256, uninstall } from '../src/core/install.ts';
import type { Fs } from '../src/core/install.ts';
import { classifyName, NameDict } from '../src/core/classify.ts';
import { joaat } from '../src/core/hash.ts';
import { newProject, parseProject } from '../src/core/project.ts';

const nfs: Fs = {
  exists: async (p) => fsp.access(p).then(() => true, () => false),
  read: async (p) => new Uint8Array(await fsp.readFile(p)),
  write: async (p, d) => fsp.writeFile(p, d),
  remove: (p) => fsp.rm(p),
  rename: (a, b) => fsp.rename(a, b),
  mkdirp: async (p) => { await fsp.mkdir(p, { recursive: true }); },
};
const enc = (s: string) => new TextEncoder().encode(s);

async function setup() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), '444-'));
  const game = path.join(dir, 'sfx'); await fsp.mkdir(game);
  const other = path.join(game, 'OTRO.rpf'); await fsp.writeFile(other, 'ajeno');
  return { dir, game, data: path.join(dir, 'data'), other };
}

test('instalar → backup + manifiesto + historial; desinstalar restaura el original exacto', async () => {
  const t = await setup(), target = path.join(t.game, 'WEAPONS_PLAYER.rpf');
  await fsp.writeFile(target, 'ORIGINAL');
  const m = await install(nfs, t.data, 'proj', target, enc('MODIFICADO'), true);
  assert.equal(await fsp.readFile(target, 'utf8'), 'MODIFICADO');
  assert.equal(await fsp.readFile(m.backupPath!, 'utf8'), 'ORIGINAL');
  await uninstall(nfs, t.data, m);
  assert.equal(await fsp.readFile(target, 'utf8'), 'ORIGINAL');
  assert.equal(await fsp.readFile(t.other, 'utf8'), 'ajeno', 'no toca archivos ajenos');
  assert.deepEqual((await readHistory(nfs, t.data)).map((h) => h.operation), ['install', 'uninstall']);
  assert.ok(!(await nfs.exists(target + '.444tmp')));
});

test('sin confirmación no instala', async () => {
  const t = await setup(), target = path.join(t.game, 'A.rpf'); await fsp.writeFile(target, 'X');
  await assert.rejects(install(nfs, t.data, 'p', target, enc('Y'), false), /confirmación/);
  assert.equal(await fsp.readFile(target, 'utf8'), 'X');
});

test('un backup original nunca se sobrescribe con una versión modificada', async () => {
  const t = await setup(), target = path.join(t.game, 'A.rpf'); await fsp.writeFile(target, 'ORIG');
  const m1 = await install(nfs, t.data, 'p', target, enc('V1'), true);
  const m2 = await install(nfs, t.data, 'p', target, enc('V2'), true); // el "original" ahora es V1
  assert.notEqual(m1.backupPath, m2.backupPath);
  assert.equal(await fsp.readFile(m1.backupPath!, 'utf8'), 'ORIG');
  assert.equal(await fsp.readFile(m2.backupPath!, 'utf8'), 'V1');
});

test('desinstalar detecta cambios externos y backup dañado', async () => {
  const t = await setup(), target = path.join(t.game, 'A.rpf'); await fsp.writeFile(target, 'ORIG');
  const m = await install(nfs, t.data, 'p', target, enc('NEW'), true);
  await fsp.writeFile(target, 'ACTUALIZADO-POR-EL-JUEGO');
  await assert.rejects(uninstall(nfs, t.data, m), /ha cambiado/);
  await fsp.writeFile(m.backupPath!, 'CORRUPTO');
  await assert.rejects(uninstall(nfs, t.data, m, true), /dañada/);
  assert.equal(await fsp.readFile(target, 'utf8'), 'ACTUALIZADO-POR-EL-JUEGO', 'no se pierde el archivo si falla');
});

test('archivo nuevo (no existía): desinstalar borra solo ese archivo', async () => {
  const t = await setup(), target = path.join(t.game, 'NUEVO.awc');
  const m = await install(nfs, t.data, 'p', target, enc('N'), true);
  assert.equal(m.existedBefore, false);
  await uninstall(nfs, t.data, m);
  assert.ok(!(await nfs.exists(target))); assert.ok(await nfs.exists(t.other));
});

test('planInstall informa hashes y createBackup reutiliza contenido idéntico', async () => {
  const t = await setup(), f = path.join(t.game, 'B.rpf'); await fsp.writeFile(f, 'Z');
  const p = await planInstall(nfs, f, enc('Z')); assert.equal(p.sameContent, true); assert.equal(p.originalSha256, await sha256(enc('Z')));
  const a = await createBackup(nfs, t.data, f), b = await createBackup(nfs, t.data, f); assert.equal(a.path, b.path);
});

test('clasificación solo con nombres reales; sin nombre → null', () => {
  const names = ['pistol_shot_01', 'ped_footstep_grass_02', 'ped_death_scream', 'sniper_reload_clip', 'xyz_unknown'];
  const dict = new NameDict(), wanted = new Set(names.map((n) => joaat(n) & 0x1fffffff));
  assert.equal(dict.addLines(names.join('\n') + '\n# c', wanted), 5);
  assert.deepEqual(classifyName(dict.get(joaat('pistol_shot_01') & 0x1fffffff)), { category: 'weapons', sub: 'PISTOLS', action: 'Disparo' });
  assert.equal(classifyName('ped_footstep_grass_02')?.sub, 'Hierba');
  assert.equal(classifyName('ped_death_scream')?.category, 'death');
  assert.equal(classifyName('sniper_reload_clip')?.sub, 'SNIPERS');
  assert.equal(classifyName('xyz_unknown'), null); assert.equal(classifyName(undefined), null);
});

test('proyecto: serializa y valida', () => {
  const p = newProject('444CFG_DEATH_PACK'); assert.equal(parseProject(JSON.stringify(p)).name, '444CFG_DEATH_PACK');
  assert.throws(() => parseProject('{"version":99}'), /no válido/);
});
