import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

interface Props {
  data: Float32Array | null; sampleRate: number; height?: number; color?: string; label?: string;
  selection?: [number, number] | null; onSelect?: (s: [number, number] | null) => void; cursor?: number; onSeek?: (t: number) => void;
}
const fmt = (s: number) => (s < 1 ? `${(s * 1000).toFixed(0)} ms` : `${s.toFixed(2)} s`);

/** Forma de onda interactiva: zoom con rueda, desplazamiento con Shift+rueda, selección arrastrando, clic = posición. */
export function Waveform({ data, sampleRate, height = 120, color = '#a78bfa', label, selection, onSelect, cursor, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ start: 0, span: 1 }); // fracciones 0..1
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const dur = data ? data.length / sampleRate : 0;

  useEffect(() => setView({ start: 0, span: 1 }), [data]);
  useEffect(() => {
    const cv = ref.current, bx = box.current; if (!cv || !bx) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, w = bx.clientWidth, h = height;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      g.fillStyle = '#080b17'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#22283f'; g.beginPath(); g.moveTo(0, (h - 14) / 2); g.lineTo(w, (h - 14) / 2); g.stroke();
      if (!data || data.length === 0) { g.fillStyle = '#9ba5c3'; g.font = '12px Segoe UI, sans-serif'; g.fillText('Sin audio', 12, h / 2); return; }
      const n = data.length, s0 = Math.floor(view.start * n), s1 = Math.min(n, Math.ceil((view.start + view.span) * n)), per = (s1 - s0) / w, mid = (h - 14) / 2;
      if (selection) { const a = ((selection[0] * sampleRate - s0) / (s1 - s0)) * w, b = ((selection[1] * sampleRate - s0) / (s1 - s0)) * w; g.fillStyle = 'rgba(167,139,250,.18)'; g.fillRect(a, 0, b - a, h - 14); }
      g.fillStyle = color;
      for (let x = 0; x < w; x++) {
        const a = Math.floor(s0 + x * per), b = Math.max(a + 1, Math.floor(s0 + (x + 1) * per)); let mn = 1, mx = -1;
        for (let i = a; i < b && i < n; i++) { const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        if (mn <= mx) g.fillRect(x, mid - mx * mid, 1, Math.max(1, (mx - mn) * mid));
      }
      g.fillStyle = '#9ba5c3'; g.font = '10px Segoe UI, sans-serif';
      const tSpan = (s1 - s0) / sampleRate, step = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10].find((v) => tSpan / v < 10) ?? 20, t0 = s0 / sampleRate;
      for (let t = Math.ceil(t0 / step) * step; t < t0 + tSpan; t += step) { const x = ((t - t0) / tSpan) * w; g.fillRect(x, h - 14, 1, 4); g.fillText(fmt(t), x + 3, h - 3); }
      if (cursor !== undefined && cursor > 0) { const x = ((cursor * sampleRate - s0) / (s1 - s0)) * w; g.fillStyle = '#fff'; g.fillRect(x, 0, 1, h - 14); }
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(bx); return () => ro.disconnect();
  }, [data, sampleRate, height, color, selection, cursor, view]);

  const timeAt = (e: ReactMouseEvent) => { const r = ref.current!.getBoundingClientRect(); return (view.start + ((e.clientX - r.left) / r.width) * view.span) * dur; };
  return (
    <div className="wave" ref={box}>
      {label && <span className="wave-label">{label}{data ? ` · ${fmt(dur)}` : ''}</span>}
      <canvas ref={ref}
        onWheel={(e) => {
          if (!data) return; const r = ref.current!.getBoundingClientRect(), p = (e.clientX - r.left) / r.width;
          if (e.shiftKey) setView((v) => ({ ...v, start: Math.min(1 - v.span, Math.max(0, v.start + Math.sign(e.deltaY) * v.span * 0.1)) }));
          else setView((v) => { const span = Math.min(1, Math.max(0.002, v.span * (e.deltaY < 0 ? 0.8 : 1.25))); return { span, start: Math.min(1 - span, Math.max(0, v.start + (v.span - span) * p)) }; });
        }}
        onMouseDown={(e) => { if (data) drag.current = { x0: timeAt(e), moved: false }; }}
        onMouseMove={(e) => { if (drag.current && onSelect) { const t = timeAt(e); if (Math.abs(t - drag.current.x0) > dur * 0.002) { drag.current.moved = true; onSelect([Math.max(0, Math.min(t, drag.current.x0)), Math.min(dur, Math.max(t, drag.current.x0))]); } } }}
        onMouseUp={(e) => { if (drag.current && !drag.current.moved) { onSelect?.(null); onSeek?.(timeAt(e)); } drag.current = null; }}
        onMouseLeave={() => { drag.current = null; }} />
      {data && view.span < 1 && <button className="mini wave-reset" onClick={() => setView({ start: 0, span: 1 })}>Zoom 1:1</button>}
    </div>
  );
}
