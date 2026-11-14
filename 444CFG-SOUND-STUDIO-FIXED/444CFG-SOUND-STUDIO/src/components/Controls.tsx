import { ReactNode } from 'react';
export function Slider({ label, value, min, max, step = 0.1, unit = '', def, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; def?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider"><span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} onDoubleClick={() => onChange(def ?? (min < 0 ? 0 : min))} />
      <em>{value.toFixed(step < 0.1 ? 2 : 1)}{unit}</em></label>
  );
}
export const Card = ({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{title && <header><h3>{title}</h3>{right}</header>}{children}</section>
);
export const Btn = ({ children, onClick, kind = 'primary', disabled, title }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; title?: string }) => (
  <button className={`btn ${kind}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>
);
export const Badge = ({ kind, children }: { kind: 'ok' | 'warn' | 'err' | 'info'; children: ReactNode }) => <span className={`badge ${kind}`}>{children}</span>;
