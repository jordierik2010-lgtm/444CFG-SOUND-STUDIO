import { useEffect, useMemo, useState } from 'react';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import { useApp, Bank, Source } from '../store.tsx';
import { Btn, Card, Badge } from '../components/Controls.tsx';
import { carveAwc, patchAwcInPlace, verifyPatchedRpf } from '../core/rpf.ts';
import { encodeWavPcm16 } from '../core/wav.ts';
import { hex } from '../core/hash.ts';
import { install, joinPath, Manifest, planInstall, InstallPlan, uninstall } from '../core/install.ts';
import { pickFolder, pickSave, tauriFs, launchExternal, baseName } from '../lib/native.ts';

interface Check { label: string; ok: boolean; detail?: string }

export function ExportPage() {
  const { sources, edits, buildBankBytes, notify, settings, dir, project } = useApp();
  const modBanks = useMemo(() => sources.flatMap((s) => s.banks.filter((b) => Object.values(edits).some((e) => e.meta.sourceId === b.sourceId && e.meta.awcOffset === b.offset)).map((b) => ({ s, b }))), [sources, edits]);
  const [checks, setChecks] = useState<Check[]>([]);

  const runChecks = () => {
    const c: Check[] = [];
    c.push({ label: 'Hay cambios que exportar', ok: modBanks.length > 0, detail: `${Object.keys(edits).length} sustituciones en ${modBanks.length} bancos` });
    for (const { s, b } of modBanks) {
      try {
        const bytes = buildBankBytes(b);
        c.push({ label: `${s.name} · 0x${b.offset.toString(16)}: AWC reconstruido y re-validado`, ok: true, detail: `${bytes.length} B` });
        if (s.kind === 'rpf') c.push({ label: `…cabe en el hueco original del RPF`, ok: bytes.length <= b.size, detail: `${bytes.length} / ${b.size} B` });
      } catch (e) { c.push({ label: `${s.name} · 0x${b.offset.toString(16)}`, ok: false, detail: (e as Error).message }); }
    }
    for (const s of sources) {
      const files = Object.values(edits).filter((e) => e.meta.sourceId === s.id);
      const ids = files.every((e) => s.banks.find((b) => b.offset === e.meta.awcOffset)?.awc.streams[e.meta.streamIndex]?.id === e.meta.streamId);
      if (files.length) c.push({ label: `${s.name}: identificadores de stream conservados`, ok: ids });
    }
    setChecks(c); return c;
  };
  const allOk = (c: Check[]) => c.length > 0 && c.every((x) => x.ok);
  const guard = async (fn: () => Promise<void>) => { const c = runChecks(); if (!allOk(c)) { notify('err', 'La comprobación previa ha fallado: no se genera ningún archivo. Revisa la lista.'); return; } try { await fn(); } catch (e) { notify('err', (e as Error).message); } };

  const exportAwc = (s: Source, b: Bank) => guard(async () => {
    const f = await pickSave('Exportar AWC', `${s.name.replace(/\.[^.]+$/, '')}_${b.offset.toString(16)}.awc`, ['awc']); if (!f) return;
    await writeFile(f, buildBankBytes(b)); localStorage.setItem('lastExport', new Date().toLocaleString()); notify('ok', `AWC exportado y validado: ${f}`);
  });
  const exportRpf = (s: Source) => guard(async () => {
    if (s.kind !== 'rpf') return notify('err', 'La fuente no es un RPF');
    const rpf = new Uint8Array(s.bytes); const slots = carveAwc(rpf); const patched = [];
    for (const b of s.banks.filter((x) => modBanks.some((m) => m.b.key === x.key))) {
      const slot = slots.find((x) => x.offset === b.offset)!; patchAwcInPlace(rpf, slot, buildBankBytes(b)); patched.push(slot);
    }
    const rep = verifyPatchedRpf(s.bytes, rpf, patched); if (!rep.ok) throw new Error('Verificación fallida: ' + rep.errors.join('; '));
    const f = await pickSave('Exportar RPF', s.name, ['rpf']); if (!f) return; if (f === s.path) throw new Error('No sobrescribas el RPF de origen: elige otra ruta');
    await writeFile(f, rpf); localStorage.setItem('lastExport', new Date().toLocaleString()); notify('ok', `RPF exportado (${patched.length} bancos parcheados en sitio, TOC y tamaño intactos): ${f}`);
  });
  const exportPack = () => guard(async () => {
    const base = await pickFolder('Carpeta de destino del sound pack'); if (!base) return; const root = joinPath(base, project.name); await tauriFs.mkdirp(joinPath(root, 'awc')); await tauriFs.mkdirp(joinPath(root, 'wav'));
    const files: string[] = [];
    for (const { s, b } of modBanks) { const n = `${s.name.replace(/\.[^.]+$/, '')}_${b.offset.toString(16)}.awc`; await writeFile(joinPath(root, 'awc', n), buildBankBytes(b)); files.push(n); }
    for (const e of Object.values(edits)) await writeFile(joinPath(root, 'wav', e.meta.wavFile), encodeWavPcm16(e.pcm, e.meta.sampleRate));
    await writeFile(joinPath(root, 'soundpack.json'), new TextEncoder().encode(JSON.stringify({ tool: '444CFG Sound Studio 1.0.0', project: project.name, info: project.info, awc: files, replacements: Object.values(edits).map((e) => ({ source: e.meta.sourceId, awcOffset: e.meta.awcOffset, streamId: hex(e.meta.streamId), sampleRate: e.meta.sampleRate, wav: e.meta.wavFile })) }, null, 2)));
    localStorage.setItem('lastExport', new Date().toLocaleString()); notify('ok', `Sound pack exportado en ${root}`);
  });
  const exportFivem = () => guard(async () => {
    const base = await pickFolder('Carpeta donde crear el recurso FiveM'); if (!base) return; const root = joinPath(base, project.name.toLowerCase()); await tauriFs.mkdirp(joinPath(root, 'audio'));
    const names: string[] = [];
    for (const { s, b } of modBanks) { const n = `${s.name.replace(/\.[^.]+$/, '').toLowerCase()}_${b.offset.toString(16)}.awc`; await writeFile(joinPath(root, 'audio', n), buildBankBytes(b)); names.push(n); }
    const manifest = `fx_version 'cerulean'\ngame 'gta5'\n\nauthor '${project.info.author || '444CFG'}'\ndescription '${project.name} (444CFG Sound Studio)'\nversion '1.0.0'\n\nfiles {\n${names.map((n) => `  'audio/${n}',`).join('\n')}\n}\n\n-- AUDIO_WAVEPACK carga una carpeta de .awc, pero NO sustituye por sí sola los sonidos originales:\n-- para que el juego use estos bancos hacen falta además los REL (AUDIO_GAMEDATA / AUDIO_SOUNDDATA) que los referencien.\n-- data_file 'AUDIO_WAVEPACK' 'audio'\n`;
    await writeFile(joinPath(root, 'fxmanifest.lua'), new TextEncoder().encode(manifest));
    await writeFile(joinPath(root, 'LEEME.txt'), new TextEncoder().encode('Recurso generado por 444CFG Sound Studio.\nTipo: REEMPLAZO DE BANCOS EXISTENTES (instalación manual).\nNo está verificado dentro del juego. El data_file está comentado a propósito: sin REL correspondientes no sustituye sonidos.\n'));
    localStorage.setItem('lastExport', new Date().toLocaleString()); notify('info', `Recurso creado en ${root}. Tipo: instalación manual (sin verificar en el juego; la línea data_file está comentada a propósito).`);
  });

  // ---- Instalación ----
  const [target, setTarget] = useState<{ srcId: string; file: string }>({ srcId: '', file: '' }); const [plan, setPlan] = useState<InstallPlan | null>(null); const [ok, setOk] = useState(false); const [manifests, setManifests] = useState<Manifest[]>([]);
  const src = sources.find((s) => s.id === target.srcId && s.kind === 'rpf');
  const loadManifests = async () => { const d = joinPath(dir, 'manifests'); if (!dir || !(await tauriFs.exists(d))) return setManifests([]); const { readDir } = await import('@tauri-apps/plugin-fs'); const out: Manifest[] = []; for (const e of await readDir(d)) if (e.name.endsWith('.json')) out.push(JSON.parse(new TextDecoder().decode(await readFile(joinPath(d, e.name))))); setManifests(out.sort((a, b) => b.id.localeCompare(a.id))); };
  useEffect(() => { loadManifests().catch(() => {}); /* eslint-disable-next-line */ }, [dir]);
  const targetPath = settings.gta ? joinPath(settings.gta, 'x64/audio/sfx', target.file) : '';
  const buildPatched = (s: Source) => { const rpf = new Uint8Array(s.bytes); const slots = carveAwc(rpf); const patched = []; for (const b of s.banks.filter((x) => modBanks.some((m) => m.b.key === x.key))) { const slot = slots.find((x) => x.offset === b.offset)!; patchAwcInPlace(rpf, slot, buildBankBytes(b)); patched.push(slot); } const rep = verifyPatchedRpf(s.bytes, rpf, patched); if (!rep.ok) throw new Error(rep.errors.join('; ')); return rpf; };
  const preview = async () => { try { if (!src) throw new Error('Elige un RPF de origen'); if (!settings.gta) throw new Error('Configura la ruta de GTA V en Configuración'); if (!/^[\w\-. ]+\.rpf$/i.test(target.file)) throw new Error('Nombre de archivo de destino no válido'); setPlan(await planInstall(tauriFs, targetPath, buildPatched(src))); setOk(false); } catch (e) { setPlan(null); notify('err', (e as Error).message); } };
  const doInstall = async () => { try { if (!src || !plan) return; const m = await install(tauriFs, dir, project.name, targetPath, buildPatched(src), ok); notify('ok', `Instalado. Backup: ${m.backupPath ?? '(el archivo no existía)'} · manifiesto ${m.id}`); setPlan(null); loadManifests(); } catch (e) { notify('err', (e as Error).message); } };

  return (
    <div className="page">
      <Card title="COMPROBACIÓN PREVIA" right={<Btn kind="ghost" onClick={runChecks}>Comprobar ahora</Btn>}>
        {!checks.length && <p className="muted">Se ejecuta automáticamente antes de cada exportación.</p>}
        {checks.map((c, i) => <div key={i} className="check-row"><Badge kind={c.ok ? 'ok' : 'err'}>{c.ok ? 'OK' : 'ERROR'}</Badge> {c.label} {c.detail && <span className="muted">— {c.detail}</span>}</div>)}
      </Card>
      <div className="grid2">
        <Card title="EXPORTAR">
          <p className="muted small">Todas las exportaciones se generan desde los bytes reconstruidos y se re-validan; si algo falla no se crea ningún archivo.</p>
          {!modBanks.length && <p className="muted">No hay sustituciones guardadas todavía.</p>}
          {modBanks.map(({ s, b }) => <div key={b.key} className="exp-row"><span>{s.name} · {b.label}</span><Btn kind="ghost" onClick={() => exportAwc(s, b)}>EXPORT AWC</Btn></div>)}
          {[...new Set(modBanks.map((m) => m.s))].filter((s) => s.kind === 'rpf').map((s) => <div key={s.id} className="exp-row"><span>{s.name} (parche en sitio)</span><Btn onClick={() => exportRpf(s)}>EXPORT RPF</Btn></div>)}
          <div className="exp-row"><span>Paquete organizado (AWC + WAV + soundpack.json)</span><Btn kind="ghost" onClick={exportPack}>EXPORT SOUNDPACK</Btn></div>
          <div className="exp-row"><span>Recurso FiveM (instalación manual)</span><Btn kind="ghost" onClick={exportFivem}>EXPORT FIVEM RESOURCE</Btn></div>
          <p className="warn small">EXPORT RPF modifica solo los huecos de los AWC dentro del RPF; el índice cifrado y el tamaño no cambian. Si el audio nuevo hace crecer un banco por encima de su tamaño original se rechaza: exporta el AWC y súbelo con CodeWalker.</p>
          {settings.codewalker && <Btn kind="ghost" onClick={() => launchExternal(settings.codewalker).catch((e) => notify('err', String(e)))}>Abrir CodeWalker</Btn>}
        </Card>
        <Card title="INSTALL SOUNDPACK">
          <p className="muted small">Instalación en GTA V (x64\audio\sfx). Con FiveM no se instala automáticamente: usa «Export FiveM resource».</p>
          <label className="field">RPF modificado<select className="input" value={target.srcId} onChange={(e) => { const s = sources.find((x) => x.id === e.target.value); setTarget({ srcId: e.target.value, file: s ? s.name : '' }); setPlan(null); }}><option value="">—</option>{sources.filter((s) => s.kind === 'rpf').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field">Archivo de destino en x64\audio\sfx<input className="input" value={target.file} onChange={(e) => { setTarget({ ...target, file: e.target.value }); setPlan(null); }} /></label>
          <p className="muted small">Ruta: {targetPath || 'configura GTA V en Configuración'} · Si renombraste el RPF al subirlo, escribe aquí su nombre real.</p>
          <Btn kind="ghost" onClick={preview}>Vista previa de cambios</Btn>
          {plan && <div className="plan">
            <div>Archivo: <b>{plan.target}</b></div><div>Existe: {plan.exists ? 'sí' : 'no (se creará)'} · {plan.sizeBefore ?? '—'} B → {plan.sizeAfter} B</div>
            <div>SHA-256 actual: <code>{plan.originalSha256?.slice(0, 16) ?? '—'}…</code></div><div>SHA-256 nuevo: <code>{plan.newSha256.slice(0, 16)}…</code></div>
            {plan.sameContent && <p className="warn">El archivo instalado ya es idéntico.</p>}
            <p className="warn">Se creará una copia de seguridad antes de modificar. Modificar archivos del juego puede provocar errores o bloqueos online; úsalo bajo tu responsabilidad y nunca en GTA Online.</p>
            <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Entiendo los riesgos y confirmo instalar SOLO este archivo</label>
            <Btn disabled={!ok} onClick={doInstall}>INSTALAR</Btn></div>}
          <h4>UNINSTALL SOUNDPACK</h4>
          {!manifests.length && <p className="muted small">No hay instalaciones registradas.</p>}
          {manifests.map((m) => <div key={m.id} className="exp-row"><span title={m.target}>{baseName(m.target)} · {m.createdAt.slice(0, 16).replace('T', ' ')}</span>
            <Btn kind="danger" onClick={async () => { try { await uninstall(tauriFs, dir, m); await tauriFs.remove(joinPath(dir, 'manifests', `${m.id}.json`)); notify('ok', `Restaurado ${baseName(m.target)}`); loadManifests(); } catch (e) { const f = confirm(`${(e as Error).message}\n\n¿Forzar la restauración?`); if (f) { try { await uninstall(tauriFs, dir, m, true); await tauriFs.remove(joinPath(dir, 'manifests', `${m.id}.json`)); loadManifests(); } catch (e2) { notify('err', (e2 as Error).message); } } } }}>DESINSTALAR</Btn></div>)}
        </Card>
      </div>
    </div>
  );
}
