import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AppProvider, useApp, Page } from './store.tsx';
import { HomePage } from './pages/Home.tsx';
import { EditorPage } from './pages/Editor.tsx';
import { CategoryPage } from './pages/Category.tsx';
import { EffectsPage } from './pages/Effects.tsx';
import { MixerPage } from './pages/Mixer.tsx';
import { LibraryPage } from './pages/Library.tsx';
import { ExportPage } from './pages/Export.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { HistoryPage } from './pages/History.tsx';
import { openLink } from './lib/native.ts';

const NAV: { title: string; items: [Page, string, string][] }[] = [
  { title: 'PRINCIPAL', items: [['home', '01', 'Inicio'], ['editor', '02', 'Sound Pack Editor'], ['death', '03', 'Death Sounds'], ['footsteps', '04', 'Footsteps Editor'], ['weapons', '05', 'Weapon Sounds']] },
  { title: 'EDICIÓN', items: [['effects', '06', 'Audio Effects'], ['mixer', '07', 'Audio Mixer'], ['library', '08', 'Sound Library'], ['export', '09', 'Exportar']] },
  { title: 'SISTEMA', items: [['settings', '10', 'Configuración'], ['history', '11', 'Historial y Backups']] },
];

function TitleBar() {
  const { dirty, project } = useApp(); const w = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <img src="/logo.png" alt="" className="tb-logo" data-tauri-drag-region /><span className="tb-title" data-tauri-drag-region>444CFG SOUND STUDIO <em>· {project.name}{dirty ? ' •' : ''}</em></span>
      <div className="tb-btns"><button onClick={() => w.minimize()} aria-label="Minimizar">—</button><button onClick={() => w.toggleMaximize()} aria-label="Maximizar">▢</button><button className="x" onClick={() => w.close()} aria-label="Cerrar">✕</button></div>
    </div>);
}
function Sidebar() {
  const { page, setPage } = useApp();
  return (
    <aside className="sidebar">
      <div className="brand"><img src="/logo.png" alt="444" /><div><b>444CFG</b><span>SOUND STUDIO</span><small>GTA V / FIVEM AUDIO EDITOR</small></div></div>
      <nav>{NAV.map((g) => <div key={g.title}><h5>{g.title}</h5>{g.items.map(([id, n, label]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}><i>{n}</i>{label}</button>)}</div>)}</nav>
      <div className="side-foot"><button className="btn primary wide" onClick={() => openLink('https://discord.gg/444cfg')}>Discord</button><b>444CFG SOUND STUDIO</b><span>v1.0.0</span></div>
    </aside>);
}
function Toasts() { const { toasts } = useApp(); return <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>; }
function Router() {
  const { page } = useApp();
  const map: Record<Page, JSX.Element> = { home: <HomePage />, editor: <EditorPage />, death: <CategoryPage category="death" />, footsteps: <CategoryPage category="footsteps" />, weapons: <CategoryPage category="weapons" />, effects: <EffectsPage />, mixer: <MixerPage />, library: <LibraryPage />, export: <ExportPage />, settings: <SettingsPage />, history: <HistoryPage /> };
  return <main className="main" key={page}>{map[page]}</main>;
}
export default function App() {
  const [splash, setSplash] = useState(true);
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1800); return () => clearTimeout(t); }, []);
  return (
    <AppProvider>
      {splash && <div className="splash"><img src="/logo.png" alt="444CFG" /><h2>444CFG SOUND STUDIO</h2><p>GTA V / FIVEM AUDIO EDITOR</p><div className="bar"><i /></div></div>}
      <TitleBar /><div className="shell"><Sidebar /><Router /></div><Toasts />
    </AppProvider>);
}
