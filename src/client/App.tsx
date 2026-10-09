import { CommandCenter } from './components/CommandCenter';
import { GlobalCapture, GlobalCaptureTriggers } from './components/GlobalCapture';
import { AutomationProvider } from './state/AutomationContext';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import type { WorkoutApiClient } from './lib/api-client';
import { ToastProvider } from './components/Toast';
const Dashboard=lazy(()=>import('./pages/Dashboard').then(module=>({default:module.Dashboard})));
const Tracker=lazy(()=>import('./pages/Tracker').then(module=>({default:module.Tracker})));
const AutomaticInsights=lazy(()=>import('./components/AutomaticReview').then(module=>({default:module.AutomaticInsights})));
const AutomaticProgress=lazy(()=>import('./components/AutomationCenter').then(module=>({default:module.AutomaticProgress})));
const LinkedRuleEditor=lazy(()=>import('./components/AutomationSettings').then(module=>({default:module.LinkedRuleEditor})));
const RecoveryAdaptation=lazy(()=>import('./components/RecoveryAdaptation').then(module=>({default:module.RecoveryAdaptation})));
const MedicalActionCenter=lazy(()=>import('./components/MedicalActionCenter').then(module=>({default:module.MedicalActionCenter})));

import { QueueModal } from './components/QueueModal';
import { Onboarding } from './components/Onboarding';
import { Modal } from './components/Modal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BottomDock, KeyDock } from './components/KeyDock';
import { today } from './lib/utils';
import type { Page } from './lib/types';
import { homeOf, pageLabel, isPage } from '../shared/workspaces';
import { careTasksForDate } from '../shared/skin';
import { APP_VERSION } from '../shared/version';
import { getEffectiveSupabaseConfig, isSupabaseConfigured } from '../shared/supabase-project';
import { CloudAccountProvider, useCloudAccount } from './state/CloudAccountContext';
import { OSNavigation } from './components/OSNavigation';
import { canonicalRoute, locationFor, readRoute, routeHref, sections } from './lib/os-navigation';

import { QuickLogProvider, useQuickLog } from './components/QuickLog';
import { AddFoodProvider } from './components/AddFood';
import { TodayWorkspace } from './pages/TodayWorkspace';

import { WebReminderRuntime } from './components/WebReminderRuntime';

import { BiologyProvider } from './state/BiologyContext';
import { BiologicalDataProvider, useBiologicalData } from './lib/use-biological-data';
import { AllPages } from './components/AllPages';
import { OSIcon } from './components/OSIcon';
import { HealthBrand } from './components/HealthBrand';
import { HealthLoader } from './components/HealthLoader';
import { PrimaryViews } from './components/PrimaryViews';
import { MobileNavigation } from './components/MobileNavigation';
import { UxProvider } from './state/UxContext';
import { RouteExperience } from './components/RouteExperience';

const PodsWorkspace=lazy(()=>import('./pages/PodsWorkspace').then(module=>({default:module.PodsWorkspace})));
const AutomationsWorkspace=lazy(()=>import('./pages/AutomationsWorkspace').then(module=>({default:module.AutomationsWorkspace})));
const ReportStudio=lazy(()=>import('./pages/ReportStudio').then(module=>({default:module.ReportStudio})));
const Planner=lazy(()=>import('./pages/Planner').then(module=>({default:module.Planner})));
const Records=lazy(()=>import('./pages/Records').then(module=>({default:module.Records})));
const Analyzer=lazy(()=>import('./pages/Analyzer').then(module=>({default:module.Analyzer})));
const Coach=lazy(()=>import('./pages/Coach').then(module=>({default:module.Coach})));
const Targets=lazy(()=>import('./pages/Targets').then(module=>({default:module.Targets})));
const Body=lazy(()=>import('./pages/Body').then(module=>({default:module.Body})));
const Library=lazy(()=>import('./pages/Library').then(module=>({default:module.Library})));
const Reports=lazy(()=>import('./pages/Reports').then(module=>({default:module.Reports})));
const Settings=lazy(()=>import('./pages/WebSettings').then(module=>({default:module.WebSettings})));
const ExerciseHistory=lazy(()=>import('./pages/ExerciseHistory').then(module=>({default:module.ExerciseHistory})));
const CalendarPage=lazy(()=>import('./pages/CalendarPage').then(module=>({default:module.CalendarPage})));
const Programs=lazy(()=>import('./pages/Programs').then(module=>({default:module.Programs})));
const SkinProfilePage=lazy(()=>import('./pages/skin/MySkin').then(module=>({default:module.SkinProfilePage})));
const SkinProducts=lazy(()=>import('./pages/skin/Products').then(module=>({default:module.SkinProducts})));
const SkinAi=lazy(()=>import('./pages/skin/AiCoach').then(module=>({default:module.SkinAi})));
const CareToday=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareToday})));
const CareGoals=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareGoals})));
const CarePlan=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CarePlan})));
const CareCalendar=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareCalendar})));
const CareCheckInPage=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareCheckInPage})));
const CareProgressPage=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareProgressPage})));
const CareReviews=lazy(()=>import('./pages/skin/CarePages').then(module=>({default:module.CareReviews})));
const BiologicalOS=lazy(()=>import('./pages/BiologicalOS').then(module=>({default:module.BiologicalOS})));
const BioEditor=lazy(()=>import('./pages/BiologicalOS').then(module=>({default:module.BioEditor})));
const UnifiedTimeline=lazy(()=>import('./pages/UnifiedTimeline').then(module=>({default:module.UnifiedTimeline})));
const NutritionWorkspace=lazy(()=>import('./pages/NutritionWorkspace').then(module=>({default:module.NutritionWorkspace})));
const RecoveryWorkspace=lazy(()=>import('./pages/RecoveryWorkspace').then(module=>({default:module.RecoveryWorkspace})));
const SectionOverview=lazy(()=>import('./pages/SectionOverview').then(module=>({default:module.SectionOverview})));
const InsightsWorkspace=lazy(()=>import('./pages/InsightsWorkspace').then(module=>({default:module.InsightsWorkspace})));
const WeeklyReview=lazy(()=>import('./pages/WeeklyReview').then(module=>({default:module.WeeklyReview})));
const AppointmentsWorkspace=lazy(()=>import('./pages/AppointmentsWorkspace').then(module=>({default:module.AppointmentsWorkspace})));

const V510_ANNOUNCEMENT_KEY = 'body-os-release-announcement-v510';

function BrandMark() {
  return <div className="mark brand-mark" aria-label="Health OS"><HealthBrand symbolOnly/></div>;
}

function CloudLoadingScreen() {
  const cloud=useCloudAccount();
  const [progress,setProgress]=useState('Connecting to Supabase…');
  useEffect(()=>{
    const update=(event:Event)=>setProgress((event as CustomEvent<string>).detail);
    window.addEventListener('health-os-workspace-progress',update);
    return()=>window.removeEventListener('health-os-workspace-progress',update);
  },[]);
  return <div className="unlock-screen"><div className="glass card unlock-card text-center">
    <HealthLoader/><h2 style={{margin:'12px 0 6px',fontWeight:800}}>Health OS</h2>
    <p className="subtle">Loading your cloud workspace…</p>
    <p className="subtle" role="status" aria-live="polite">{progress}</p>
    <button className="btn btn-soft" onClick={()=>window.location.reload()}>Retry loading</button>
    <button className="btn btn-soft" onClick={()=>void cloud.signOut()}>Sign out</button>
  </div></div>;
}

function UnlockGate() {
  const { unlock, loading, error } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  if (loading) {
    return (
      <div className="unlock-screen">
        <div className="glass card unlock-card text-center">
          <BrandMark />
          <h2 style={{ margin: '12px 0 6px', fontWeight: 800, letterSpacing: '-0.03em' }}>Health OS</h2>
          <HealthLoader/>
          <p className="subtle">Loading your health workspace…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="unlock-screen">
      <form
        className="glass card unlock-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await unlock(pin);
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}
      >
        <BrandMark />
        <h2 className="unlock-title text-center">
          Health OS
        </h2>
        <p className="unlock-subtitle text-center">Enter your local PIN. Online integrations are optional.</p>
        <input
          className="input unlock-pin"
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="PIN"
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, '')); setErr(''); }}
          onFocus={() => setErr('')}
          maxLength={12}
          autoComplete="current-password"
        />
        <p className="pin-help" aria-live="polite">{pin ? `${pin.length} digit${pin.length === 1 ? '' : 's'} entered` : 'Your PIN stays only on this device.'}</p>
        {(err || error) && (
          <p style={{ color: 'var(--danger)', fontWeight: 700, margin: 0, fontSize: 13 }}>{err || error}</p>
        )}
        <button className="btn btn-hot w-full unlock-submit" type="submit" disabled={!pin}>
          Unlock
        </button>
      </form>
    </div>
  );
}

function FeatureGuide() {
  const app = useApp();
  const [step, setStep] = useState(0);

  const features = [
    { title: 'Health OS', desc: 'One operating system. Today, Train, Eat, Recover, Health, Body, Care and Insights share a permanent domain rail.', icon: 'B', color: '#a3e635' },
    { title: 'Train', desc: 'Your daily hub. Check readiness, view your mission, and start today’s workout.', icon: '◎', color: '#3b82f6' },
    { title: 'Start a workout', desc: 'Use Start Workout from Home. Log each set in Tracker and finish the session to save your progress.', icon: '▶', color: '#f59e0b' },
    { title: 'Care', desc: 'Overview, routine, shelf, and barrier logs live in their own workspace. Same OS. Different desk.', icon: '◎', color: '#34d399' },
    { title: 'Planner', desc: 'Build and organize training weeks, days, exercises, volume, and progression targets.', icon: '▦', color: '#f59e0b' },
    { title: 'Progress analytics', desc: 'Analyzer tracks PRs, e1RM, volume, consistency, plateaus, and trends over time.', icon: '◈', color: '#8b5cf6' },
    { title: 'Settings & help', desc: 'Theme, profile, AI, and backup live in the shared OS core — available from the rail footer.', icon: '⚙', color: '#38bdf8' },
    { title: 'Protect your data', desc: 'Backup Health in Settings is where you export local data, manage Google Drive, and restore safely.', icon: '☁', color: '#10b981' },
  ];

  const next = () => {
    if (step === features.length - 1) {
      app.api.saveSettings({ hasSeenFeatureGuide: true } as any).then(() => app.refresh());
      return;
    }
    setStep((s) => s + 1);
  };

  const f = features[step];

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999, background: 'rgba(7,8,11,0.95)', display: 'flex' }}>
      <div className="glass card" style={{ width: 500, maxWidth: '90vw', margin: 'auto', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 16, color: f.color }}>{f.icon}</div>
          <h2 style={{ fontSize: 28, margin: '0 0 12px' }}>{f.title}</h2>
          <p className="subtle" style={{ fontSize: 16, lineHeight: 1.5, minHeight: 72 }}>{f.desc}</p>
        </div>
        <div className="row" style={{ marginTop: 32, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {features.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i === step ? 'var(--brand, var(--accent))' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
          <button className="btn btn-hot" onClick={next}>
            {step === features.length - 1 ? 'Enter Health OS' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupabaseAccountGate() {
  const cloud = useCloudAccount();
  const effectiveConfig = getEffectiveSupabaseConfig(cloud.savedConfig);
  const isPreconfigured = isSupabaseConfigured(cloud.savedConfig);
  const [showAdvanced, setShowAdvanced] = useState(!isPreconfigured);
  const [url, setUrl] = useState(effectiveConfig.url);
  const [publishableKey, setPublishableKey] = useState(effectiveConfig.publishableKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!url && effectiveConfig.url) setUrl(effectiveConfig.url);
    if (!publishableKey && effectiveConfig.publishableKey) setPublishableKey(effectiveConfig.publishableKey);
  }, [effectiveConfig.url, effectiveConfig.publishableKey]);

  if (cloud.status === 'loading') {
    return <div className="unlock-screen"><div className="glass card unlock-card text-center"><HealthLoader/><h2>Health OS</h2><p className="subtle">Checking your cloud connection…</p></div></div>;
  }
  if (cloud.user) return null;

  return (
    <div className="unlock-screen">
      <form
        className="glass card unlock-card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const targetUrl = (url || effectiveConfig.url).trim();
          const targetKey = (publishableKey || effectiveConfig.publishableKey).trim();
          if (!targetUrl || !targetKey) return;
          setBusy(true);
          void cloud
            .connect({ url: targetUrl, publishableKey: targetKey }, email.trim(), password, create)
            .catch(() => { })
            .finally(() => setBusy(false));
        }}
      >
        <BrandMark />
        <h2 style={{ margin: 0 }} className="text-center">
          {create ? 'Create your Health OS account' : 'Sign in to Health OS'}
        </h2>
        <p className="subtle text-center" style={{ fontSize: 13, margin: '4px 0 10px' }}>
          {create
            ? 'Set up your private account to sync workouts, habits, and progress securely across all devices.'
            : 'Enter your email and password to sync your workouts, habits, and progress.'}
        </p>

        {showAdvanced && (
          <div className="stack" style={{ background: 'var(--bg-inset)', padding: 12, borderRadius: 10, gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>
              Supabase Project (Advanced)
            </span>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              autoCapitalize="none"
            />
            <input
              className="input"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              placeholder="Supabase publishable key"
              type="password"
              autoCapitalize="none"
            />
          </div>
        )}

        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          type="email"
          autoComplete="email"
          autoFocus
          required
        />
        <input
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 characters)"
          type="password"
          autoComplete={create ? 'new-password' : 'current-password'}
          required
        />

        {cloud.error && (
          <p style={{ color: 'var(--danger)', fontWeight: 700, margin: 0, fontSize: 13 }}>
            {cloud.error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-hot w-full"
          disabled={busy || !email || password.length < 6 || (!url && !effectiveConfig.url)}
        >
          {busy ? 'Connecting…' : create ? 'Create account & continue' : 'Sign in to Health OS'}
        </button>

        <button
          type="button"
          className="btn btn-soft w-full"
          onClick={() => setCreate((v) => !v)}
        >
          {create ? 'Already have an account? Sign in' : 'First time? Create an account'}
        </button>

        {isPreconfigured && (
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <button
              type="button"
              className="link-btn subtle"
              style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? 'Hide custom project settings' : 'Custom project settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function MigrationGate() {
  const cloud = useCloudAccount();
  if (!cloud.migrationRequired) return null;
  const preview = cloud.migrationPreview;
  return <div className="unlock-screen"><div className="glass card unlock-card stack text-center"><BrandMark /><h2 style={{ margin: 0 }}>Review your first sync</h2><p className="subtle">Health OS found {preview?.localRecords ?? 'your'} local record{preview?.localRecords === 1 ? '' : 's'} and {preview?.remoteRecords ?? 'your'} cloud record{preview?.remoteRecords === 1 ? '' : 's'}. It will compare them before making any change.</p><p className="subtle">Conflicting edits are shown for your decision. Your data is never silently replaced.</p><button type="button" className="btn btn-hot w-full" disabled={!preview} onClick={() => void cloud.approveMigration()}>Review & start secure sync</button></div></div>;
}

function Shell() {
  const { app } = useBiologicalData();
  const readinessLog = useQuickLog();
  const cloud = useCloudAccount();
  const {
    page,
    setPage,
    workspace,
    setWorkspace,
    db,
    analytics,
    skin,
    activeDay,
    theme,
    toggleTheme,
    unlocked,
    needsPin,
    loading,
    error,
    setTracker,
    settings,
  } = app;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [pagePanel, setPagePanel] = useState<{page: Page; detail: string} | null>(null);
  const panel = pagePanel?.page === page ? pagePanel.detail : '';
  const [connectCloud, setConnectCloud] = useState(false);
  const [allPagesOpen, setAllPagesOpen] = useState(false);
  const choosePage = (next: Page, detail = '') => {
    const route=canonicalRoute(next,detail);
    setPage(route.page,route.panel);
    setPagePanel({page:route.page,detail:route.panel});
    setSectionOpen(false);
  };
  useEffect(() => {
    const read = () => {
      const route=readRoute(window.location.hash);
      if (!route) return;
      setPage(route.page,route.panel,'none');
      setPagePanel({page:route.page,detail:route.panel});
      const href=routeHref(route.page,route.panel);
      if(window.location.hash!==href) window.history.replaceState(null,'',href);
    };
    read();
    window.addEventListener('hashchange',read);
    window.addEventListener('popstate',read);
    window.addEventListener('body-os-navigate',read);
    return () => {
      window.removeEventListener('hashchange',read);
      window.removeEventListener('popstate',read);
      window.removeEventListener('body-os-navigate',read);
    };
  }, [setPage]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.dispatchEvent(new Event('health-os-open-command'));
        setSectionOpen(false);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [setPage]);
  const [dockHover, setDockHover] = useState(false);
  const [dockPinned, setDockPinned] = useState(() => localStorage.getItem('body-os-dock-pinned') === '1');
  const [showReleaseAnnouncement, setShowReleaseAnnouncement] = useState(() => localStorage.getItem(V510_ANNOUNCEMENT_KEY) !== '1');

  const dockOpen = dockPinned || dockHover;

  useEffect(() => {
    localStorage.setItem('body-os-dock-pinned', dockPinned ? '1' : '0');
  }, [dockPinned]);

  if (
    typeof window !== 'undefined' &&
    (window.location.pathname.includes('/dev/animation-studio') ||
      window.location.hash.includes('/dev/animation-studio') ||
      window.location.search.includes('studio=1'))
  ) {
    return (
      <div className="unlock-screen">
        <div className="glass card unlock-card text-center">
          <BrandMark />
          <h1>3D exercise library</h1>
          <strong>IN DEVELOPMENT</strong>
          <p className="subtle">Exercise previews are paused.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <CloudLoadingScreen/>;
  }
  if (needsPin && !unlocked) return <UnlockGate />;
  if (unlocked && connectCloud && !cloud.user) return <><button className="btn btn-soft" style={{position:'fixed',top:16,left:16,zIndex:10001}} onClick={() => setConnectCloud(false)}>Continue locally</button><SupabaseAccountGate /></>;
  // Cloud migration is reviewed in the optional Sync panel; local usage stays available.
  if (error || !db || !analytics) {
    return (
      <div className="shell">
        <div className="glass card">
          <h2 style={{ color: 'var(--danger)', marginTop: 0 }}>Couldn’t load Health OS</h2>
          <p className="subtle">{error || 'Unknown error'}</p>
          <button className="btn btn-hot" onClick={()=>window.location.reload()}>Retry loading</button>
          <button className="btn btn-soft" onClick={()=>void cloud.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  const week = (db.weeks && db.weeks.length > 0) ? (db.weeks.find((w) => w.id === db.meta.activeWeekId) || db.weeks[0]) : null;
  const day = week?.days?.find((d) => d.key === activeDay) || week?.days?.[0] || { key: 'Mon', title: 'Day 1', exercises: [] };
  const ready = db.readiness.find((r) => r.date === today());
  const record = db.sessions.find((s) => (s.status === 'finished' || s.status === 'completed') && ((week && s.weekId === week.id && s.dayKey === day.key) || s.date === today()));
  const todayCare = careTasksForDate(skin.care, today(), skin.products);
  const doneCare = todayCare.filter(task => skin.care.events.some(event => event.taskId === task.id && event.date === today() && event.status === 'done')).length;

  const pages: Partial<Record<Page, ReactNode>> = {
    Today: panel==='Pods'?<PodsWorkspace/>:(<TodayWorkspace />),
    Timeline: <UnifiedTimeline />,
    Nudges: <AutomationsWorkspace />,
    Eat: <NutritionWorkspace panel={panel} />,
    Recover: panel==='Cardio'?<Records initialView="cardio"/>:<RecoveryWorkspace panel={panel} />,
    Health: panel === 'Appointments' || panel.startsWith('Appointment:') ? <AppointmentsWorkspace appointmentId={panel.startsWith('Appointment:') ? panel.slice(12) : undefined}/> : panel === 'Follow-ups' ? <MedicalActionCenter initialTab="Follow-ups"/> : !panel ? <SectionOverview section="Health" choose={choosePage}/> : <BiologicalOS page="Health" panel={panel}/>,
    Insights: !panel ? (<><SectionOverview section="Insights" choose={choosePage}/><AutomaticInsights/></>) : <InsightsWorkspace panel={panel.startsWith('Analytics ')?'Trends':panel} domain={panel.startsWith('Analytics ')?panel.slice(10):''}/>,
    Dashboard: <Dashboard view={panel} />,
    Planner: <Planner />,
    Tracker: <><RecoveryAdaptation /><Tracker /></>,
    Records: <Records />,
    Analyzer: <Analyzer view={panel} />,
    Coach: <Coach />,
    Targets: <Targets />,
    Habits: panel==='Weekly Review'?<WeeklyReview/>:<><AutomaticProgress kind="habit"/><BiologicalOS page="Habits"/><details className="glass card"><summary>Link a habit to evidence</summary><LinkedRuleEditor kind="habit"/></details></>,
    Body: !panel ? <SectionOverview section="Body" choose={choosePage}/> : <Body initialView={panel} />,
    Library: <Library initialView={panel} />,
    Reports: panel==='Workout Reports' ? <Reports /> : (<ReportStudio/>),
    Settings: <Settings initialTab={panel} />,
    Profile: <Settings profileOnly />,
    ExerciseHistory: <ExerciseHistory />,
    Calendar: <CalendarPage />,
    Programs: <Programs />,
    SkinOverview: <CareToday />,
    SkinRoutine: <CarePlan />,
    SkinProfile: <SkinProfilePage />,
    SkinProducts: <SkinProducts />,
    SkinProgress: <CareProgressPage photosOnly={panel==='Photos'} />,
    SkinAi: <SkinAi research={panel==='Research'} />,
    SkinGoals: <CareGoals />,
    SkinCalendar: <CareCalendar />,
    SkinCheckIn: <CareCheckInPage />,
    SkinReviews: <CareReviews />,
  };

  function startFab() {
    if (record) {
      setPage('Records');
      return;
    }
    if (!ready) {
      readinessLog.open('checkIn');
      return;
    }
    if (!week || !day.exercises?.length) {
      setPage('Planner');
      return;
    }
    setTracker({
      weekId: week.id,
      weekName: week.name,
      weekNumber: week.weekNumber,
      dayKey: day.key,
      dayTitle: day.title,
      date: today(),
      name: settings?.profileName || db!.profile?.displayName || 'Athlete',
      sleep: ready.sleepHours,
      soreness: ready.soreness,
      readiness: ready,
      index: 0,
      logs: [],
      exercises: JSON.parse(JSON.stringify(day.exercises)),
      startedAt: new Date().toISOString(),
      gymMode: localStorage.getItem('workout-os-gym-mode') === '1',
    });
    setPage('Tracker');
  }

  const title = page === 'Dashboard' ? 'Home' : pageLabel(page);
  const subtitle =
    page === 'Settings'
      ? 'Shared OS core · profile, theme, AI, backup'
      : workspace === 'skincare'
        ? `${doneCare} of ${todayCare.length} care actions done today · ${skin.care.goals.filter(goal => goal.status === 'active').length} active goals`
        : (week ? `${day.key} · ${day.title} · ${week.name}` : `${day.key} · ${day.title}`);

  const location = locationFor(page,panel);
  const section = location.section;
  const sectionInfo = sections.find(s => s.name === section)!;
  return (
    <div data-section={section} className={`os-frame stitch-frame ${('')} ${sectionOpen ? 'os-sidebar-open' : ''}`}>
      <a className="stitch-skip-link" href="#health-main-content" onClick={event => { event.preventDefault(); document.getElementById('health-main-content')?.focus(); }}>Skip to content</a>
      {!settings?.isActivated && <Onboarding />}
      {settings?.isActivated && !settings?.hasSeenFeatureGuide && <FeatureGuide />}
      <QueueModal />
      {<GlobalCapture hideTriggers/>}{(<CommandCenter/>)}
      {(<><AllPages open={allPagesOpen} onClose={() => setAllPagesOpen(false)} choose={choosePage} /><OSNavigation section={section} page={page} panel={panel} open={sectionOpen} choose={choosePage} close={() => setSectionOpen(false)} /></>)}
      <div className="os-main">
        {(<header className="os-topbar">
          <div className="os-header-left"><button type="button" className="icon-btn os-menu-toggle" aria-label="Toggle section navigation" aria-expanded={sectionOpen} onClick={() => setSectionOpen(v => !v)}><OSIcon name="Menu" size={20}/></button><button className="os-search-control" onClick={()=>window.dispatchEvent(new Event('health-os-open-command'))}><OSIcon name="Search" size={18}/><span>Search your workspace…</span><kbd>Ctrl K</kbd></button><span className="os-breadcrumb">{section} <span>/</span> {location.primary.label}</span></div>
          <div className="row os-header-actions"><span className="os-header-date"><OSIcon name="Calendar" size={16}/>{new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</span>{<GlobalCaptureTriggers/>}<button className="os-all-pages-button" onClick={() => setAllPagesOpen(true)}>All pages <OSIcon name="Menu" size={16}/></button><button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}><OSIcon name={theme==='dark'?'Sleep':'Sun'} size={19}/></button><button className="os-avatar" aria-label="Profile" onClick={() => choosePage('Profile')}>{(db.profile.displayName || 'M').slice(0,1)}</button></div>
        </header>)}
        <main id="health-main-content" tabIndex={-1} className={`os-content ${['Search','Sync','Settings','Profile'].includes(section)?'utility-workspace':''}`}>
          <RouteExperience identity={`${page}:${panel}`} label={`${section} · ${location.view.label}`}/>
          {app.legacyWorkoutAvailable&&!app.tracker&&page==='Today'&&<section className="glass card stack"><h2>Older workout draft found</h2><p>This device has a draft without a project identifier. Import it only if it belongs to this account.</p><button className="btn btn-soft" onClick={()=>void app.importLegacyWorkout()}>Import older workout draft</button></section>}
          <PrimaryViews location={location} choose={choosePage} viewKey={`${page}-${panel}`}>
          <Suspense fallback={<div className="glass card health-loading-view" role="status"><HealthLoader compact/>Loading view…</div>}>{pages[page] || <BiologicalOS page={page} panel={panel} />}</Suspense>
          </PrimaryViews>
          {page === 'Sync' && !cloud.user && <button className="btn btn-soft" onClick={() => setConnectCloud(true)}>Connect Supabase account</button>}
        </main>
        {app.tracker && page !== 'Tracker' ? <aside className="os-workout-region" aria-label="Workout controls"><span className="subtle">Workout saved in progress</span><button className="os-resume btn btn-hot" onClick={() => choosePage('Tracker')}>▶ Resume saved workout</button></aside> : section === 'Train' && page !== 'Tracker' ? <aside className="os-workout-region" aria-label="Workout controls"><button className="os-resume btn btn-soft" onClick={startFab}>▶ {record ? 'View record' : ready ? 'Start workout' : 'Log readiness'}</button></aside> : null}
      </div>
      {(<MobileNavigation focusedLogging={page==='Tracker'&&Boolean(app.tracker)} page={page} choose={choosePage} more={() => setAllPagesOpen(true)} moreOpen={allPagesOpen}/>)}
    </div>
  );
}

export default function App({ apiClient }: { apiClient: WorkoutApiClient }) {
  return <ErrorBoundary><ToastProvider><CloudAccountProvider><CloudApplication apiClient={apiClient}/></CloudAccountProvider></ToastProvider></ErrorBoundary>;
}
function CloudApplication({apiClient}:{apiClient:WorkoutApiClient}) {
  const cloud=useCloudAccount();
  if(cloud.status==='loading'||!cloud.user)return <SupabaseAccountGate/>;
  return <AppProvider key={`${cloud.savedConfig?.url}|${cloud.user.id}`} apiClient={apiClient}><BiologyProvider><BiologicalDataProvider><AutomationProvider><QuickLogProvider advanced={(request,close)=><Suspense fallback={<div role="status">Loading editor…</div>}><BioEditor kind={request.kind} initial={request.initial} defaults={request.defaults} onSaved={request.onSaved} onClose={close}/></Suspense>}><AddFoodProvider><UxProvider><WebReminderRuntime/><Shell/></UxProvider></AddFoodProvider></QuickLogProvider></AutomationProvider></BiologicalDataProvider></BiologyProvider></AppProvider>;
}
