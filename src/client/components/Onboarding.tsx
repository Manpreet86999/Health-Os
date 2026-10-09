import { useDraftState } from '../lib/use-draft';
import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { useToast } from './Toast';
import { useCloudAccount } from '../state/CloudAccountContext';
import { getEffectiveSupabaseConfig, isSupabaseConfigured } from '../../shared/supabase-project';

const TOTAL_STEPS = 4;

export function Onboarding() {
  const app = useApp();
  const toast = useToast();
  const cloud = useCloudAccount();

  const setup=useDraftState('onboarding', {step:1,profileName:app.settings?.profileName || '',units:app.settings?.units || 'kg',height:String(app.settings?.height || '')});
  const {step,profileName,units,height}=setup.value;
  const setStep=(value:number)=>setup.setValue(previous=>({...previous,step:value}));
  const setProfileName=(value:string)=>setup.setValue(previous=>({...previous,profileName:value}));
  const setUnits=(value:'kg'|'lb')=>setup.setValue(previous=>({...previous,units:value}));
  const setHeight=(value:string)=>setup.setValue(previous=>({...previous,height:value}));

  // Supabase Auth state
  const effectiveConfig = getEffectiveSupabaseConfig(cloud.savedConfig);
  const isPreconfigured = isSupabaseConfigured(cloud.savedConfig);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showAdvancedSupabase, setShowAdvancedSupabase] = useState(!isPreconfigured);
  const [customUrl, setCustomUrl] = useState(effectiveConfig.url);
  const [customKey, setCustomKey] = useState(effectiveConfig.publishableKey);

  // AI Key state
  const [openRouterApiKey, setOpenRouterApiKey] = useState((app.settings as any)?.openRouterApiKey || '');

  const [busy, setBusy] = useState(false);

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.035)',
    border: '1px solid var(--line)',
    padding: 20,
    borderRadius: 14,
  };

  const handleCloudAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const targetUrl = (customUrl || effectiveConfig.url).trim();
    const targetKey = (customKey || effectiveConfig.publishableKey).trim();
    if (!targetUrl || !targetKey) {
      setAuthError('Supabase project URL and key are required.');
      return;
    }
    if (!email || password.length < 6) {
      setAuthError('Enter a valid email and a password of at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      await cloud.connect({ url: targetUrl, publishableKey: targetKey }, email.trim(), password, isSignUp);
      toast.push(isSignUp ? 'Account created and connected!' : 'Signed in successfully!', 'ok');
      setStep(3);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const completeOnboarding = async () => {
    setBusy(true);
    try {
      await app.api.saveSettings({
        profileName: profileName.trim(),
        units,
        height,
        isActivated: true,
        hasSeenFeatureGuide: true,
        ...(openRouterApiKey ? { openRouterApiKey: openRouterApiKey.trim(), aiProvider: 'openrouter' } : {}),
      });
      await setup.clear().catch(()=>{});localStorage.removeItem('body-os-owner-setup-step');
      await app.refresh();
      toast.push('Welcome to Health OS! Your workspace is ready.', 'ok');
    } catch (err: any) {
      toast.push(err.message || 'Failed to save setup', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 9999,
        background: 'rgba(7, 8, 11, 0.96)',
        padding: 18,
        overflowY: 'auto',
      }}
    >
      <main className={("glass card")} style={{ width: 620, maxWidth: '96vw', margin: 'auto' }}>
        <div
          style={{
            height: 4,
            width: `${(step / TOTAL_STEPS) * 100}%`,
            background: 'linear-gradient(90deg, #a3e635, #38bdf8)',
            margin: '-18px -18px 20px',
            borderRadius: '4px 4px 0 0',
            transition: 'width 0.3s ease',
          }}
        />

        <div className="stack" style={{ gap: 20 }}>
          <div>
            <span className="page-eyebrow">
              HEALTH OS ONBOARDING · STEP {step} OF {TOTAL_STEPS}
            </span>
            <h1 style={{ margin: '6px 0 4px', fontSize: '1.75rem', letterSpacing: '-0.02em' }}>
              {step === 1 && (('A few details to get started'))}
              {step === 2 && 'Connect your private account'}
              {step === 3 && 'Enable AI coaching (Optional)'}
              {step === 4 && 'Your rhythm starts now'}
            </h1>
            <p className="subtle" style={{ margin: 0, fontSize: 13 }}>
              {step === 1 && 'Customize your metrics and training profile.'}
              {step === 2 && 'Sync your workouts and habits securely across your signed-in devices.'}
              {step === 3 && 'Generate tailored morning briefings and progressive overload recommendations.'}
              {step === 4 && 'Review how readiness and daily habits keep your progress effortless.'}
            </p>
          </div>

          <p className="subtle" role="status">{setup.status}</p>
          {step===1&&<button type="button" className="btn btn-hot" disabled={busy || !setup.ready} onClick={()=>void completeOnboarding()}>Start with essentials</button>}
          {/* STEP 1: Profile */}
          {step === 1 && (
            <>
              <div style={{ ...cardStyle, gap: 14 }} className="stack">
                <label className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Your name or athlete handle</span>
                  <input
                    className="input"
                    autoFocus
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g. Alex"
                  />
                </label>
                <div className="row" style={{ gap: 12 }}>
                  <label className="stack" style={{ flex: 1, gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Weight units</span>
                    <select
                      className="input"
                      value={units}
                      onChange={(e) => setUnits(e.target.value as 'kg' | 'lb')}
                    >
                      <option value="kg">Kilograms (kg)</option>
                      <option value="lb">Pounds (lb)</option>
                    </select>
                  </label>
                  <label className="stack" style={{ flex: 1, gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Height (cm or in)</span>
                    <input
                      className="input"
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="e.g. 178"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-hot"
                onClick={() => {
                  if (!profileName.trim()) {
                    toast.push('Please enter your name.', 'err');
                    return;
                  }
                  setStep(2);
                }}
              >
                Continue to Cloud Account
              </button>
            </>
          )}

          {/* STEP 2: Supabase Account */}
          {step === 2 && (
            <>
              <div style={{ ...cardStyle, gap: 14 }} className="stack">
                {cloud.user ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <div style={{ padding: '12px 14px', background: 'rgba(163, 230, 53, 0.1)', borderRadius: 10, border: '1px solid rgba(163, 230, 53, 0.3)' }}>
                      <strong style={{ color: '#a3e635' }}>✓ Cloud Account Connected</strong>
                      <p className="subtle" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        Logged in as: <strong>{cloud.user.email}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => void cloud.signOut()}
                    >
                      Switch account
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCloudAuth} className="stack" style={{ gap: 12 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isSignUp ? 'btn-hot' : 'btn-soft'}`}
                        style={{ flex: 1 }}
                        onClick={() => setIsSignUp(true)}
                      >
                        Create account
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${!isSignUp ? 'btn-hot' : 'btn-soft'}`}
                        style={{ flex: 1 }}
                        onClick={() => setIsSignUp(false)}
                      >
                        I already have a login
                      </button>
                    </div>

                    {showAdvancedSupabase && (
                      <div className="stack" style={{ background: 'var(--bg-inset)', padding: 10, borderRadius: 8, gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                          Custom Supabase Project
                        </span>
                        <input
                          className="input"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          placeholder="https://your-project.supabase.co"
                          autoCapitalize="none"
                        />
                        <input
                          className="input"
                          value={customKey}
                          onChange={(e) => setCustomKey(e.target.value)}
                          placeholder="Publishable key"
                          type="password"
                          autoCapitalize="none"
                        />
                      </div>
                    )}

                    <input
                      className="input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      autoComplete="email"
                      required
                      autoFocus
                    />
                    <input
                      className="input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (minimum 6 characters)"
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      required
                    />

                    {authError && (
                      <p style={{ color: 'var(--danger)', margin: 0, fontSize: 13, fontWeight: 600 }}>
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      className="btn btn-hot"
                      disabled={busy || !email || password.length < 6}
                    >
                      {busy ? 'Authenticating…' : isSignUp ? 'Create account' : 'Sign in'}
                    </button>

                    {isPreconfigured && (
                      <div style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="link-btn subtle"
                          style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
                          onClick={() => setShowAdvancedSupabase((v) => !v)}
                        >
                          {showAdvancedSupabase ? 'Hide custom URL' : 'Use custom Supabase project'}
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-soft" onClick={() => setStep(1)}>
                  Back
                </button>
                {cloud.user && (
                  <button type="button" className="btn btn-hot" style={{ flex: 1 }} onClick={() => setStep(3)}>
                    Continue
                  </button>
                )}
              </div>
            </>
          )}

          {/* STEP 3: AI Coaching */}
          {step === 3 && (
            <>
              <div style={{ ...cardStyle, gap: 14 }} className="stack">
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>AI Morning Briefing & Coach</h3>
                  <p className="subtle" style={{ margin: 0, fontSize: 13 }}>
                    Health OS uses your readiness check-in and workout volume to deliver coaching advice tailored directly to how you recover.
                  </p>
                </div>

                <label className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>OpenRouter API Key (Optional)</span>
                  <input
                    className="input"
                    type="password"
                    value={openRouterApiKey}
                    onChange={(e) => setOpenRouterApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                  />
                  <span className="subtle" style={{ fontSize: 12 }}>
                    Get a key with free models at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>openrouter.ai</a>. You can always add or change this in Settings.
                  </span>
                </label>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-soft" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-hot"
                  style={{ flex: 1 }}
                  onClick={() => setStep(4)}
                >
                  {openRouterApiKey ? 'Save & Continue' : 'Skip for now'}
                </button>
              </div>
            </>
          )}

          {/* STEP 4: Ready to Train */}
          {step === 4 && (
            <>
              <div style={{ ...cardStyle, gap: 16 }} className="stack">
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 24 }}>◉</span>
                  <div>
                    <strong>Morning Readiness Check-in</strong>
                    <p className="subtle" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      Log sleep, soreness, and energy in 30 seconds. Your training plan automatically adjusts to keep you progressing without injury.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 24, color: '#a3e635' }}>✓</span>
                  <div>
                    <strong>Daily Habits on Dashboard</strong>
                    <p className="subtle" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      Log daily hydration, sleep, and steps with a single tap directly below readiness.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 24, color: '#38bdf8' }}>☁</span>
                  <div>
                    <strong>Real-time Mobile Sync</strong>
                    <p className="subtle" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      Log on your phone at the gym or on your desktop at home. Everything stays in lockstep.
                    </p>
                  </div>
                </div>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-soft" onClick={() => setStep(3)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-hot"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => void completeOnboarding()}
                >
                  {busy ? 'Setting up workspace…' : 'Launch Health OS'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
