import { useState } from 'react';
import { useApp } from '../store.tsx';
import { Btn, Badge } from '../components/Controls.tsx';

export function HomePage() {
  const { sources, edits, project, setPage, openDialog, newProj, settings, dir, saveProj, openProj, namesCount } = useApp(); const [naming, setNaming] = useState(false); const [name, setName] = useState('444CFG_SOUND_PACK');
  const awc = sources.reduce((a, s) => a + s.banks.length, 0); const streams = sources.reduce((a, s) => a + s.banks.reduce((x, b) => x + b.awc.streams.length, 0), 0);
  const ok = (v: string) => <Badge kind={v ? 'ok' : 'warn'}>{v ? 'OK' : 'no configurado'}</Badge>;
  return (
    <div className="page home">
      <div className="hero"><img src="/logo.png" alt="444CFG" className="hero-logo" />
        <div><h1>Bienvenido a 444CFG Sound Studio</h1><p>Crea y personaliza tus propios sound packs para GTA V y FiveM.</p></div></div>
      <div className="cards">
        <div className="stat"><span>Sound packs importados</span><b>{sources.length}</b></div>
        <div className="stat"><span>Bancos AWC · sonidos detectados</span><b>{awc} · {streams}</b></div>
        <div className="stat"><span>Sonidos modificados</span><b>{Object.keys(edits).length}</b></div>
        <div className="stat"><span>Proyecto actual</span><b className="sm">{project.name}</b></div>
        <div className="stat"><span>Última exportación</span><b className="sm">{localStorage.getItem('lastExport') ?? '—'}</b></div>
        <div className="stat"><span>Estado del sistema</span><div className="sys">GTA V {ok(settings.gta)} · CodeWalker {ok(settings.codewalker)} · FFmpeg {ok(settings.ffmpeg)} · Datos {ok(dir)} · Nombres: {namesCount}</div></div>
      </div>
      <h3 className="sec">ACCESOS RÁPIDOS</h3>
      <div className="quick">
        <Btn onClick={openDialog}>ABRIR SOUND PACK</Btn><Btn onClick={() => setNaming(true)}>CREAR SOUND PACK</Btn>
        <Btn onClick={() => setPage('death')}>DEATH SOUNDS</Btn><Btn onClick={() => setPage('footsteps')}>FOOTSTEPS</Btn><Btn onClick={() => setPage('weapons')}>WEAPON SOUNDS</Btn><Btn onClick={() => setPage('mixer')}>AUDIO MIXER</Btn>
      </div>
      <div className="toolbar"><Btn kind="ghost" onClick={openProj}>Abrir proyecto</Btn><Btn kind="ghost" onClick={saveProj}>Guardar proyecto</Btn></div>
      {naming && <div className="modal"><div className="dialog"><h3>Nuevo proyecto</h3><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="toolbar"><Btn onClick={() => { newProj(name); setNaming(false); setPage('editor'); }}>Crear</Btn><Btn kind="ghost" onClick={() => setNaming(false)}>Cancelar</Btn></div>
        <p className="muted small">Un proyecto guarda las fuentes (ruta + hash), tus sustituciones, ajustes de efectos y configuración. Se guarda como carpeta con project.json y audio/.</p></div></div>}
    </div>
  );
}
