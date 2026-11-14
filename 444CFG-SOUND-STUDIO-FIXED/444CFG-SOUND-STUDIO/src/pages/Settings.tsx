import { useState } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { useApp } from '../store.tsx';
import { Btn, Card, Badge } from '../components/Controls.tsx';
import { detectEnvironment, pickFiles, pickFolder, openLink, tauriFs } from '../lib/native.ts';
import { joinPath } from '../core/install.ts';

export function SettingsPage() {
  const { settings, setSettings, notify, loadDictionary, namesCount, project, setProject, sources } = useApp(); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof settings>) => setSettings({ ...settings, ...p });
  const detect = async () => { setBusy(true); try { const d = await detectEnvironment(); set({ gta: d.gta_paths[0] ?? settings.gta, fivem: d.fivem_paths[0] ?? settings.fivem, codewalker: d.codewalker ?? settings.codewalker, ffmpeg: d.ffmpeg ?? settings.ffmpeg }); notify('info', `GTA V: ${d.gta_paths.length ? d.gta_paths.join(' | ') : 'no encontrado'} · FiveM: ${d.fivem_paths[0] ?? 'no encontrado'} · CodeWalker: ${d.codewalker ?? 'no encontrado'} · FFmpeg: ${d.ffmpeg ?? 'no encontrado'}`); } catch (e) { notify('err', String(e)); } setBusy(false); };
  const dict = async () => { const f = await pickFiles('Diccionario de nombres (.txt, un nombre por línea)', ['txt'], false); if (!f[0]) return; const n = loadDictionary(new TextDecoder().decode(await readFile(f[0]))); notify(n ? 'ok' : 'info', n ? `${n} nombres resueltos en los bancos cargados` : 'Ningún nombre del diccionario coincide con los streams cargados'); };
  const cwDict = async () => { if (!settings.codewalker) return notify('err', 'Configura primero CodeWalker'); const base = settings.codewalker.replace(/[\\/][^\\/]+$/, ''); for (const rel of ['Strings/allstrings.txt', 'allstrings.txt', 'strings/allstrings.txt']) { const p = joinPath(base, rel); if (await tauriFs.exists(p)) { const n = loadDictionary(new TextDecoder().decode(await readFile(p))); return notify(n ? 'ok' : 'info', `${rel}: ${n} nombres resueltos`); } } notify('info', 'No encontré un archivo de cadenas en la carpeta de CodeWalker; carga un .txt manualmente.'); };
  const field = (label: string, key: keyof typeof settings, folder: boolean, ext?: string[]) => (
    <label className="field">{label}<div className="inline"><input className="input" value={settings[key]} onChange={(e) => set({ [key]: e.target.value })} />
      <Btn kind="ghost" onClick={async () => { const p = folder ? await pickFolder(label) : (await pickFiles(label, ext ?? ['exe'], false))[0]; if (p) set({ [key]: p }); }}>Examinar</Btn>
      <Badge kind={settings[key] ? 'ok' : 'warn'}>{settings[key] ? 'configurado' : 'sin configurar'}</Badge></div></label>);
  return (
    <div className="page"><div className="grid2">
      <Card title="RUTAS Y HERRAMIENTAS" right={<Btn kind="ghost" onClick={detect} disabled={busy}>Detectar automáticamente</Btn>}>
        {field('GTA V (carpeta con GTA5.exe)', 'gta', true)}{field('FiveM (FiveM.app)', 'fivem', true)}{field('CodeWalker.exe (herramienta externa opcional)', 'codewalker', false)}{field('FFmpeg (opcional: formatos que el sistema no decodifica)', 'ffmpeg', false)}
        <p className="muted small">CodeWalker se usa como herramienta externa para lo que esta app no hace sola (p. ej. añadir un AWC más grande dentro de un RPF). No se incluyen ni se piden claves NG.</p>
      </Card>
      <Card title="DICCIONARIO DE NOMBRES">
        <p className="muted small">Los AWC identifican sus sonidos por hash. Con un diccionario (un nombre por línea) la app muestra nombres reales y clasifica Death/Footsteps/Weapons. Ahora: <b>{namesCount}</b> nombres resueltos en {sources.length} fuentes.</p>
        <div className="toolbar"><Btn onClick={dict}>Cargar diccionario .txt</Btn><Btn kind="ghost" onClick={cwDict}>Buscar en CodeWalker</Btn></div>
      </Card>
      <Card title="PROYECTO">
        <label className="field">Descripción<input className="input" value={project.info.description} onChange={(e) => setProject({ ...project, info: { ...project.info, description: e.target.value } })} /></label>
        <label className="field">Autor<input className="input" value={project.info.author} onChange={(e) => setProject({ ...project, info: { ...project.info, author: e.target.value } })} /></label>
        <label className="field">Frecuencia al sustituir<select className="input" value={String(project.exportConfig.targetRate)} onChange={(e) => setProject({ ...project, exportConfig: { ...project.exportConfig, targetRate: e.target.value === 'original' ? 'original' : parseInt(e.target.value) } })}><option value="original">La del sonido original</option><option value="32000">32000 Hz</option><option value="44100">44100 Hz</option><option value="48000">48000 Hz</option></select></label>
      </Card>
      <Card title="INFORMACIÓN">
        <div className="about"><img src="/logo.png" alt="444" /><div><h3>444CFG SOUND STUDIO</h3><p>GTA V / FIVEM AUDIO EDITOR</p><p className="muted">v1.0.0</p><Btn kind="ghost" onClick={() => openLink('https://discord.gg/444cfg')}>Discord 444CFG</Btn></div></div>
      </Card>
    </div></div>
  );
}
