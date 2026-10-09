import type { ReactNode } from 'react';
import type { Readiness } from '../lib/types';
import { readyTone } from '../lib/utils';
import { StatePanel } from './DesignSystem';

const valueKind = (value: ReactNode) => typeof value === 'string' && value.length > 12 && !/^[-+\d.,%\s/]+$/.test(value) ? 'status' : 'number';

export function Stat({ label, value, sub = '', color = 'var(--accent)' }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <div className="metric-light" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ 
          width: 36, height: 36, borderRadius: 12, 
          background: color, color: '#111827', 
          display: 'grid', placeItems: 'center', fontWeight: 'bold' 
        }}>
          {label.charAt(0).toUpperCase()}
        </div>
        <div className="metric-label">{label}</div>
      </div>
      <div>
        <div className="metric-value" data-kind={valueKind(value)}>{value}</div>
        {sub ? <div className="metric-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function HeroStat({ label, value, sub = '', color = 'var(--accent)' }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  // Uses CSS variables from styles.css for dynamic dual-mode support
  return (
    <div className="metric" style={{ 
      display: 'flex', flexDirection: 'column', gap: 12,
      background: 'var(--hero-stat-bg)',
      color: 'var(--text-0)',
      boxShadow: `var(--hero-stat-shadow), 0 0 0 1px ${color}20`,
      border: `1px solid var(--hero-stat-border)`,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: 0, right: 0, width: 120, height: 120,
        background: `radial-gradient(circle at top right, ${color}30, transparent 70%)`,
        pointerEvents: 'none'
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, zIndex: 1 }}>
        <div style={{ 
          width: 36, height: 36, borderRadius: '50%', 
          background: 'var(--hero-stat-icon-bg)', 
          color: color, 
          display: 'grid', placeItems: 'center', fontWeight: '900',
          border: `1px solid ${color}40`,
          boxShadow: `0 4px 12px ${color}20`
        }}>
          {label.charAt(0).toUpperCase()}
        </div>
        <div className="metric-label" style={{ opacity: 0.8 }}>{label}</div>
      </div>
      <div style={{ zIndex: 1 }}>
        <div className="metric-value" data-kind={valueKind(value)} style={{ fontWeight: 800 }}>{value}</div>
        {sub ? <div className="metric-sub" style={{ opacity: 0.65 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

export function ScorePill({ r }: { r?: Readiness | null }) {
  if (!r) return <span className="pill pill-unknown">Readiness unavailable</span>;
  const tone = readyTone(r);
  return (
    <span className={`pill pill-${tone}`}>
      {r.score}/100 · {r.band}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-header toolbar">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="subtle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <StatePanel title={title} body={body} action={action}/>;
}

export function ScoreRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ ['--p' as string]: Math.max(0, Math.min(100, score)) }}>
      <span>{score}</span>
    </div>
  );
}
