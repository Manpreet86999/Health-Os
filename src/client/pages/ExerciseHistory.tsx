import { ChartDataTable } from '../components/ChartDataTable';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { money } from '../lib/utils';

export function ExerciseHistory() {
  const app = useApp();
  const toast = useToast();
  const { db, settings, setPage } = app;
  const [name, setName] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);

  const names = Array.from(
    new Set([
      ...(db?.exercises || []).map((e) => e.name),
      ...(db?.sessions || []).flatMap((s) => (s.logs || []).map((l) => l.name)),
    ]),
  )
    .filter(Boolean)
    .sort();

  async function load(n: string) {
    if (!n.trim()) return;
    setBusy(true);
    try {
      const res = await app.api.exerciseHistory(n.trim());
      setHistory(res.history || []);
      setFamilyId(res.familyId);
      setName(n.trim());
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let chart: { destroy: () => void } | null = null;
    void (async () => {
      if (!chartRef.current || !history.length) return;
      try {
        const mod = await import('chart.js/auto');
        const Chart = mod.default;
        Chart.defaults.animation = false;
        chart = new Chart(chartRef.current, {
          type: 'line',
          data: {
            labels: history.map((h) => h.date),
            datasets: [
              {
                label: 'e1RM',
                data: history.map((h) => h.bestE1rm),
                borderColor: '#f59e0b',
                tension: 0.25,
                fill: false,
              },
              {
                label: 'Tonnage',
                data: history.map((h) => h.tonnage),
                borderColor: '#6366f1',
                tension: 0.25,
                yAxisID: 'y1',
                fill: false,
              },
            ],
          },
          options: {
            responsive: true,
            scales: {
              y: { position: 'left' },
              y1: { position: 'right', grid: { drawOnChartArea: false } },
            },
          },
        });
      } catch {
        /* */
      }
    })();
    return () => chart?.destroy();
  }, [history]);

  if (!db || !settings) return null;

  return (
    <div className="fade page-shell">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Performance</span>
          <h1 className="page-title">Exercise history</h1>
          <p className="page-sub">
            Deep per-lift log, e1RM &amp; tonnage (work sets only). Family merges variants.
          </p>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="btn btn-soft" onClick={() => setPage('Analyzer')}>
            Analyzer
          </button>
        </div>
      </header>

      <div className="page-panel">
        <div className="page-panel-head">
          <div>
            <p className="page-section-label">Lookup</p>
            <h3>Select lift</h3>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <label className="form-field"><span>Name</span><select className="input" style={{ maxWidth: 320 }} value={name} onChange={(e) => void load(e.target.value)}>
            <option value="">Select exercise…</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select></label>
          <label className="form-field"><span>Or type name</span><input
            className="input"
            style={{ maxWidth: 240 }}
            placeholder="Or type name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(name);
            }}
          /></label>
          <button type="button" className="btn btn-hot" disabled={busy || !name} onClick={() => void load(name)}>
            {busy ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {familyId ? (
        <div className="page-ai-strip">
          <span className="pill pill-slate">Family</span>
          <span>
            <b>{familyId}</b> — history includes linked variants
          </span>
        </div>
      ) : null}

      {history.length > 0 ? (
        <>
          <div className="page-panel">
            <div className="page-panel-head">
              <div>
                <p className="page-section-label">Trend</p>
                <h3>e1RM &amp; tonnage</h3>
              </div>
            </div>
            <canvas ref={chartRef} height={140} role="img" aria-label={`${name}: estimated strength and training volume. See dated values below.`}/><ChartDataTable label="Exercise history" columns={["Date",`Estimated 1RM (${db?.profile.units})`,`Volume (${db?.profile.units} × reps)`]} rows={history.map(h=>[h.date,h.bestE1rm,h.tonnage])}/>
          </div>
          <div className="page-list">
            {[...history].reverse().map((h, i) => (
              <div key={`${h.sessionId}-${i}`} className="page-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div className="toolbar">
                  <div>
                    <span className="pill pill-green">{h.date}</span>{' '}
                    <span className="pill pill-slate">{h.name}</span>
                    <div style={{ fontWeight: 800, marginTop: 8 }}>{h.dayTitle}</div>
                  </div>
                  <div className="subtle" style={{ textAlign: 'right' }}>
                    e1RM {h.bestE1rm} · {money(h.tonnage, settings.units)}
                  </div>
                </div>
                <div className="subtle" style={{ fontSize: 13 }}>
                  {(h.sets || [])
                    .map((s: any) => `${s.w}×${s.r}${s.type && s.type !== 'work' ? ` (${s.type})` : ''}${s.side && s.side !== 'both' ? ` ${s.side}` : ''}`)
                    .join(' · ') || 'No work sets'}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="page-empty">Pick an exercise to see session-by-session history.</div>
      )}
    </div>
  );
}
