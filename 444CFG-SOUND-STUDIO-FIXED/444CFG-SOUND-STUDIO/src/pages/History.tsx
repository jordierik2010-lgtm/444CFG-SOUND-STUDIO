import { useEffect, useState } from 'react';
import { useApp } from '../store.tsx';
import { Btn, Card, Badge } from '../components/Controls.tsx';
import { createBackup, HistoryEntry, readHistory, appendHistory } from '../core/install.ts';
import { pickFiles, tauriFs, baseName } from '../lib/native.ts';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { pickSave } from '../lib/native.ts';

export function HistoryPage() {
  const { dir, notify, project } = useApp(); const [list, setList] = useState<HistoryEntry[]>([]);
  const load = () => { if (dir) readHistory(tauriFs, dir).then((l) => setList([...l].reverse())); };
  useEffect(load, [dir]); // eslint-disable-line
  return (
    <div className="page">
      <div className="toolbar">
        <Btn onClick={async () => { const f = (await pickFiles('Archivo para respaldar', ['rpf', 'awc', 'oac', 'dat', 'rel'], false))[0]; if (!f) return; try { const b = await createBackup(tauriFs, dir, f); await appendHistory(tauriFs, dir, { date: new Date().toISOString(), project: project.name, file: f, operation: 'backup', backup: b.path, result: 'ok' }); notify('ok', `Backup creado: ${b.path}`); load(); } catch (e) { notify('err', (e as Error).message); } }}>CREAR BACKUP</Btn>
        <Btn kind="ghost" onClick={async () => { const f = (await pickFiles('Elegir backup', ['rpf', 'awc', 'oac', 'dat', 'rel'], false))[0]; if (!f) return; const dst = await pickSave('Restaurar backup como…', baseName(f).replace(/^[0-9a-f]{12}_(\d+_)?/, ''), ['rpf', 'awc', 'oac', 'dat', 'rel']); if (!dst) return; try { await writeFile(dst, await readFile(f)); await appendHistory(tauriFs, dir, { date: new Date().toISOString(), project: project.name, file: dst, operation: 'restore-backup', backup: f, result: 'ok' }); notify('ok', `Backup restaurado en ${dst}`); load(); } catch (e) { notify('err', (e as Error).message); } }}>RESTAURAR BACKUP</Btn>
        <Btn kind="ghost" onClick={load}>VER HISTORIAL</Btn>
        <span className="muted">Para revertir una instalación usa «DESINSTALAR» en Exportar: restaura el original verificando su hash.</span>
      </div>
      <Card title="HISTORIAL Y BACKUPS">
        {!list.length && <p className="muted pad">Todavía no hay operaciones registradas.</p>}
        <table className="tbl"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Archivo</th><th>Operación</th><th>Backup</th><th>Resultado</th></tr></thead>
          <tbody>{list.map((h, i) => <tr key={i}><td>{h.date.slice(0, 19).replace('T', ' ')}</td><td>{h.project}</td><td title={h.file}>{baseName(h.file)}</td><td>{h.operation}</td><td title={h.backup ?? ''}>{h.backup ? baseName(h.backup) : '—'}</td><td><Badge kind={h.result === 'ok' ? 'ok' : 'err'}>{h.result}</Badge>{h.detail && <span className="muted"> {h.detail}</span>}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
