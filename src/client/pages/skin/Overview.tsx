import { useMemo } from 'react';
import { HeroStat } from '../../components/ui';
import { useApp } from '../../state/AppContext';
import { greeting, today } from '../../lib/utils';
import {
  CATEGORY_LABEL,
  SKIN_TYPE_LABEL,
  latestSkinLog,
  localSkinAdvice,
  logForDate,
  skinRoutineStreak,
  skinStatusScore,
} from '../../../shared/skin';

export function SkinOverview() {
  const { skin, setPage, settings } = useApp();
  const name = settings?.profileName || 'athlete';
  const date = today();
  const last = latestSkinLog(skin.logs);
  const todayLog = logForDate(skin.logs, date);
  const status = skinStatusScore(last);
  const am = skin.routines.find((r) => r.slot === 'am');
  const pm = skin.routines.find((r) => r.slot === 'pm');
  const amDone = Boolean(todayLog?.routineDone.am);
  const pmDone = Boolean(todayLog?.routineDone.pm);
  const hour = new Date().getHours();
  const slot: 'am' | 'pm' = hour < 16 ? 'am' : 'pm';
  const advice = useMemo(() => localSkinAdvice(skin, date), [skin, date]);
  const activeProducts = skin.products.filter((p) => p.status === 'active');
  const configured = skin.profile.skinType !== 'unknown';

  return (
    <div className="fade dash skin-os">
      <section className="dash-hero">
        <div className="dash-hero-orbs" aria-hidden>
          <span className="dash-orb dash-orb-a" />
          <span className="dash-orb dash-orb-b" />
          <span className="dash-orb dash-orb-c" />
        </div>
        <div className="dash-hero-grid" aria-hidden />
        <div className="dash-hero-top">
          <div className="dash-status-row">
            <span className="dash-live">
              <span className="dash-live-dot" />
              Skin system online
            </span>
            <span className={`dash-chip ${configured ? 'tone-green' : 'warn'}`}>
              {configured ? SKIN_TYPE_LABEL[skin.profile.skinType] : 'Skin type pending'}
            </span>
            {status != null ? (
              <span className={`dash-chip ${status >= 70 ? 'tone-green' : status >= 50 ? '' : 'warn'}`}>
                Status {status}
              </span>
            ) : (
              <span className="dash-chip muted">No log yet</span>
            )}
          </div>
          <div className="dash-hero-actions">
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('SkinRoutine')}>
              Routine
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('SkinProducts')}>
              Products
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('SkinAi')}>
              AI Coach
            </button>
          </div>
        </div>
        <div className="dash-hero-body">
          <div className="dash-hero-copy">
            <p className="dash-kicker">{greeting()}</p>
            <h2 className="dash-title">
              Skin desk, <span className="dash-name">{name}</span>
            </h2>
            <p className="dash-sub">
              {slot === 'am' ? 'AM window is open.' : 'PM window is open.'}{' '}
              {amDone && pmDone
                ? 'Both routines are logged.'
                : !todayLog
                  ? 'Log how the barrier feels, then run the routine.'
                  : slot === 'am' && !amDone
                    ? 'AM still waiting.'
                    : !pmDone
                      ? 'PM still waiting.'
                      : 'System is current.'}
            </p>
            <div className="dash-cta-row">
              <button type="button" className="btn btn-hot btn-xl dash-cta-primary" onClick={() => setPage('SkinAi')}>
                Talk to coach
              </button>
              <button type="button" className="btn btn-soft btn-lg" onClick={() => setPage('SkinProgress')}>
                {todayLog ? 'Update log' : 'Log today'}
              </button>
            </div>
          </div>
          <div className="dash-hero-panel">
            <div className="dash-ring-wrap">
              <div className="dash-week-ring" style={{ ['--p' as string]: status ?? 0 }}>
                <div className="dash-week-ring-inner">
                  <span className="dash-week-pct">{status ?? '—'}</span>
                  <span className="dash-week-label">skin</span>
                </div>
              </div>
            </div>
            <div className="dash-hero-panel-meta">
              <div>
                <span className="subtle">AM</span>
                <strong>{amDone ? 'Logged' : 'Open'}</strong>
              </div>
              <div>
                <span className="subtle">PM</span>
                <strong>{pmDone ? 'Logged' : 'Open'}</strong>
              </div>
              <div>
                <span className="subtle">Type</span>
                <strong>{SKIN_TYPE_LABEL[skin.profile.skinType]}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid-3">
        <HeroStat
          label="Barrier"
          value={last ? last.barrier : '—'}
          sub={last ? `${last.date}` : 'Log to unlock'}
          color="#60a5fa"
        />
        <HeroStat
          label="Hydration"
          value={last ? last.hydration : '—'}
          sub={last ? `${last.date}` : 'Log to unlock'}
          color="#34d399"
        />
        <HeroStat
          label="AM streak"
          value={skinRoutineStreak(skin.logs, 'am')}
          sub={`PM streak ${skinRoutineStreak(skin.logs, 'pm')}`}
          color="var(--accent)"
        />
      </div>

      <div className="grid-2">
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="page-eyebrow">Routine ready</p>
              <h3 style={{ margin: 0 }}>Today</h3>
            </div>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('SkinRoutine')}>
              Edit
            </button>
          </div>
          <RoutineStrip title="AM routine" steps={am?.steps.map((s) => s.label) || []} done={amDone} />
          <RoutineStrip title="PM routine" steps={pm?.steps.map((s) => s.label) || []} done={pmDone} />
        </div>

        <div className="card stack">
          <div>
            <p className="page-eyebrow">Skin status</p>
            <h3 style={{ margin: 0 }}>Desk notes</h3>
          </div>
          {skin.profile.concerns.length ? (
            <div className="skin-chips">
              {skin.profile.concerns.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="subtle" style={{ margin: 0 }}>
              No concerns set. Open My Skin to name what you are actually training the barrier for.
            </p>
          )}
          {last?.aiComment ? <p style={{ margin: 0, fontWeight: 550 }}>{last.aiComment}</p> : null}
          <ul className="skin-advice">
            {(last?.aiAdjustments?.length ? last.aiAdjustments : advice).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p className="page-eyebrow">Inventory</p>
            <h3 style={{ margin: 0 }}>Active products</h3>
          </div>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('SkinProducts')}>
            Manage
          </button>
        </div>
        {activeProducts.length ? (
          <div className="skin-product-row">
            {activeProducts.slice(0, 8).map((p) => (
              <div key={p.id} className="skin-product-pill">
                <strong>{p.name}</strong>
                <span className="subtle">
                  {p.brand ? `${p.brand} · ` : ''}
                  {CATEGORY_LABEL[p.category]}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="subtle" style={{ margin: 0 }}>
            Shelf is empty. Add what you own so AM/PM steps can point at real products.
          </p>
        )}
      </div>
    </div>
  );
}

function RoutineStrip({ title, steps, done }: { title: string; steps: string[]; done: boolean }) {
  return (
    <div className={`skin-strip ${done ? 'done' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{title}</strong>
        <span className={`pill ${done ? 'pill-green' : 'pill-orange'}`}>{done ? 'Logged' : 'Open'}</span>
      </div>
      <p className="subtle" style={{ margin: '6px 0 0' }}>
        {steps.length ? steps.join(' → ') : 'No steps yet'}
      </p>
    </div>
  );
}
