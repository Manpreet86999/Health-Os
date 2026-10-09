import { useDraftState } from '../lib/use-draft';
import { isCompletedWorkout } from '../lib/completed-workout';
import { cloudFetch, invalidateCloudWorkspace } from '../lib/cloud-api';
import { ACCOUNT_EVENT, storedSession } from '../lib/cloud-session';
import { canonicalRoute, routeHref } from '../lib/os-navigation';
import { queryClient } from '../lib/query-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { setAuthToken, getAuthToken } from '../lib/api';
import type { WorkoutApiClient } from '../lib/api-client';
import type {
  AppDb,
  Bootstrap,
  CoachResult,
  Metrics,
  Page,
  PublicSettings,
  TrackerState,
} from '../lib/types';
import { localDayKey } from '../lib/utils';
import { useToast } from '../components/Toast';
import { emptySkinState, type SkinState } from '../../shared/skin';
import { homeOf, isPage, workspaceOf, type WorkspaceId } from '../../shared/workspaces';

const WS_KEY = 'body-os-workspace';
const LAST_WORKOUT_KEY = 'body-os-last-workout-page';
const LAST_SKIN_KEY = 'body-os-last-skin-page';

function readWorkspace(): WorkspaceId {
  return localStorage.getItem(WS_KEY) === 'skincare' ? 'skincare' : 'workout';
}

function readLastPage(key: string, fallback: Page): Page {
  try {
    const raw = localStorage.getItem(key);
    return isPage(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

interface AppState {
  page: Page;
  setPage: (p: Page, panel?: string, history?: 'push' | 'replace' | 'none') => void;
  workspace: WorkspaceId;
  setWorkspace: (w: WorkspaceId) => void;
  skin: SkinState;
  refreshSkin: () => Promise<void>;
  db: AppDb | null;
  settings: PublicSettings | null;
  analytics: Metrics | null;
  coach: CoachResult | null;
  setCoach: (c: CoachResult | null) => void;
  programming: Bootstrap['programming'];
  urls: Bootstrap['urls'] | null;
  activeDay: string;
  setActiveDay: (d: string) => void;
  manualDay: boolean;
  setManualDay: (v: boolean) => void;
  draftStatus: 'saved' | 'saving' | 'error' | 'empty';
  workoutDraftMessage:string;
  legacyWorkoutAvailable:boolean;
  importLegacyWorkout:()=>Promise<void>;
  tracker: TrackerState | null;
  setTracker: (t: TrackerState | null) => void;
  patchTracker: (patch: Partial<TrackerState>) => void;
  lastSessionId: string | null;
  setLastSessionId: (id: string | null) => void;
  theme: 'light' | 'dark';
  appearance: 'system' | 'light' | 'dark';
  setAppearance: (value: 'system' | 'light' | 'dark') => void;
  toggleTheme: () => void;
  refresh: () => Promise<void>;
  needsPin: boolean;
  unlocked: boolean;
  unlock: (pin: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  api: WorkoutApiClient;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children, apiClient }: { children: ReactNode; apiClient: WorkoutApiClient }) {
  const toast = useToast();
  const [workspace, setWorkspaceState] = useState<WorkspaceId>(readWorkspace);
  const [page, setPageState] = useState<Page>(() =>
    readWorkspace() === 'skincare'
      ? readLastPage(LAST_SKIN_KEY, 'SkinOverview')
      : readLastPage(LAST_WORKOUT_KEY, 'Today'),
  );
  const [skin, setSkin] = useState<SkinState>(emptySkinState);
  const [db, setDb] = useState<AppDb | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [analytics, setAnalytics] = useState<Metrics | null>(null);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [programming, setProgramming] = useState<Bootstrap['programming']>(null);
  const [urls, setUrls] = useState<Bootstrap['urls'] | null>(null);
  const [activeDay, setActiveDay] = useState(localDayKey());
  const [manualDay, setManualDay] = useState(false);
  const workoutDraft=useDraftState<TrackerState|null>('workout-tracker',null);
  const {value:tracker,setValue:setTrackerState}=workoutDraft;
  // Route changes keep this provider mounted; account teardown cancels its alert.
  
  const pendingServerDraft=useRef<TrackerState|null>(null),editedTracker=useRef(false);
  const [legacyWorkoutAvailable,setLegacyWorkoutAvailable]=useState(()=>{try{return !!localStorage.getItem(`body-os-tracker-draft:${storedSession()?.uid}`);}catch{return false;}});
  const setTracker=useCallback((value:TrackerState|null)=>{editedTracker.current=true;setTrackerState(value?{...value,id:value.id||crypto.randomUUID()}:null);if(!value)void workoutDraft.clear();},[setTrackerState,workoutDraft.clear]);
  const patchTracker=useCallback((patch:Partial<TrackerState>)=>{editedTracker.current=true;setTrackerState(previous=>previous?{...previous,...patch}:previous);},[setTrackerState]);
  const importLegacyWorkout=useCallback(async()=>{
    if(!workoutDraft.ready||tracker)return;
    const key=`body-os-tracker-draft:${storedSession()?.uid}`;
    try{const raw=localStorage.getItem(key);if(!raw)return;const parsed=JSON.parse(raw) as TrackerState;if(!Array.isArray(parsed.exercises)||!Array.isArray(parsed.logs))throw new Error('Older workout draft is not readable.');
      setTracker({...parsed,id:parsed.id||crypto.randomUUID()});if(!await workoutDraft.persist())throw new Error('The older draft is retained because device protection failed.');localStorage.removeItem(key);setLegacyWorkoutAvailable(false);
    }catch(error){toast.push((error as Error).message,'err');}
  },[workoutDraft.ready,workoutDraft.persist,setTracker,tracker,toast]);
  const [draftStatus, setDraftStatus] = useState<'saved' | 'saving' | 'error' | 'empty'>('empty');
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem('body-os-theme') || localStorage.getItem('powerpulse-theme');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : ('dark');
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [needsPin, setNeedsPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101311' : '#F7F8F6');
    localStorage.setItem('body-os-theme', appearance);
  }, [theme, appearance]);

  const hydratedDraft = useRef(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const reconciledClear=useRef(false);
  const completedTracker=isCompletedWorkout(tracker,db?.sessions||[]);
  useEffect(()=>{if(workoutDraft.ready&&completedTracker){reconciledClear.current=true;pendingServerDraft.current=null;editedTracker.current=false;setTrackerState(null);void workoutDraft.clear();setDraftStatus('empty');}},[completedTracker,workoutDraft.ready,setTrackerState,workoutDraft.clear]);
  useEffect(() => {
    if (!draftLoaded || !workoutDraft.ready || !storedSession() || completedTracker) return;
    if(!tracker&&reconciledClear.current){reconciledClear.current=false;setDraftStatus('empty');return;}
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      void cloudFetch('/api/workout-draft', { method: 'POST', body: JSON.stringify({ draft: tracker }) }).then(r => { if (!r.ok) throw new Error('Draft cloud save failed'); setDraftStatus(tracker ? 'saved' : 'empty'); }).catch(() => setDraftStatus('error'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [tracker, draftLoaded,workoutDraft.ready,completedTracker]);

  useEffect(()=>{if(!workoutDraft.ready||!draftLoaded||!pendingServerDraft.current)return;const saved=pendingServerDraft.current;pendingServerDraft.current=null;if(!tracker&&!editedTracker.current)setTrackerState(saved);},[workoutDraft.ready,draftLoaded,tracker,setTrackerState]);

  const applyBootstrap = useCallback((b: Bootstrap) => {
    if (!hydratedDraft.current) {
      hydratedDraft.current = true;
      const draft = (b as Bootstrap & { currentDraft?: TrackerState }).currentDraft;
      pendingServerDraft.current=isCompletedWorkout(draft,b.db.sessions)?null:draft||null;
      setDraftLoaded(true);
    }
    setError(null);
    setDb(b.db);
    if (b.skin) setSkin(b.skin);
    else if (b.db.skin) setSkin(b.db.skin);
    setSettings(b.settings);
    setAnalytics(b.analytics);
    setCoach(b.coach);
    setProgramming(b.programming);
    setUrls(b.urls);
    if (!manualDay) {
      const weeks = b?.db?.weeks ?? [];
      const metaActiveWeekId = b?.db?.meta?.activeWeekId;
      const week = Array.isArray(weeks) && weeks.length > 0 ? (weeks.find((w) => w.id === metaActiveWeekId) || weeks[0]) : null;
      const dayKey = week?.days?.find((d) => d.key === localDayKey())?.key || week?.days?.[0]?.key || localDayKey();
      setActiveDay(dayKey);
    }
  }, [manualDay]);

  const refreshing=useRef<Promise<void>|null>(null),refreshQueued=useRef(false);
  const refresh = useCallback(async () => {
    if(refreshing.current){refreshQueued.current=true;await refreshing.current;return;}
    const owner = storedSession()?.uid;
    const operation=(async()=>{
      invalidateCloudWorkspace();
      const b = await queryClient.fetchQuery({ queryKey: ['bootstrap', owner], queryFn: () => apiClient.bootstrap(), retry: false, networkMode: 'always' });
      if (storedSession()?.uid !== owner) return;
      applyBootstrap(b);
    })();
    refreshing.current=operation;
    try{await operation;}finally{if(refreshing.current===operation)refreshing.current=null;if(refreshQueued.current){refreshQueued.current=false;queueMicrotask(()=>void refresh().catch(e=>setError((e as Error).message)));}}
  }, [applyBootstrap, apiClient]);

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await apiClient.authStatus();
      if (status.hasPin && !getAuthToken()) {
        setNeedsPin(true);
        setUnlocked(false);
        setLoading(false);
        return;
      }
      if (!status.hasPin) setAuthToken('');
      await refresh();
      setUnlocked(true);
      setNeedsPin(status.hasPin);
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      setError(err.message);
      setNeedsPin(false);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void boot();
    const reset = () => {
      setDb(null); setSettings(null); setAnalytics(null); setCoach(null);
      // A session change is not a user discard: the scoped draft hook restores
      // the new account without deleting the departing account's workout.
      hydratedDraft.current=false; pendingServerDraft.current=null; editedTracker.current=false; setDraftLoaded(false);
      try { setLegacyWorkoutAvailable(!!localStorage.getItem(`body-os-tracker-draft:${storedSession()?.uid}`)); } catch { setLegacyWorkoutAvailable(false); }
      void boot();
    };
    const reload = () => { if (storedSession()) void refresh().catch(e => setError(e.message)); };
    window.addEventListener(ACCOUNT_EVENT, reset);
    window.addEventListener('body-os-cloud-refresh', reload);
    return () => { window.removeEventListener(ACCOUNT_EVENT, reset); window.removeEventListener('body-os-cloud-refresh', reload); };
  }, [boot, refresh]);

  const unlock = useCallback(
    async (pin: string) => {
      const res = await apiClient.authUnlock(pin);
      setAuthToken(res.token);
      await refresh();
      setUnlocked(true);
      setNeedsPin(true);
      toast.push('Unlocked', 'ok');
    },
    [refresh, toast],
  );

  const toggleTheme = useCallback(() => {
    setAppearance(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const refreshSkin = useCallback(async () => {
    const next = await apiClient.getSkin();
    queryClient.setQueryData(['skin'], next);
    setSkin(next);
  }, [apiClient]);

  const setPage = useCallback((p: Page, panel = '', history: 'push' | 'replace' | 'none' = 'push') => {
    const route = canonicalRoute(p, panel);
    p = route.page;
    if (history !== 'none') {
      const href = routeHref(p, route.panel);
      if (window.location.hash !== href) window.history[history === 'replace' ? 'replaceState' : 'pushState'](null, '', href);
      window.dispatchEvent(new Event('body-os-navigate'));
    }
    const ws = workspaceOf(p);
    if (ws !== 'system') {
      setWorkspaceState(ws);
      localStorage.setItem(WS_KEY, ws);
      if (ws === 'skincare') localStorage.setItem(LAST_SKIN_KEY, p);
      else localStorage.setItem(LAST_WORKOUT_KEY, p);
    }
    setPageState(p);
  }, []);

  const setWorkspace = useCallback((w: WorkspaceId) => {
    setWorkspaceState(w);
    localStorage.setItem(WS_KEY, w);
    const next =
      w === 'skincare'
        ? readLastPage(LAST_SKIN_KEY, homeOf('skincare'))
        : readLastPage(LAST_WORKOUT_KEY, homeOf('workout'));
    setPageState(next);
  }, []);

  const value = useMemo(
    () => ({
      page,
      setPage,
      workspace,
      setWorkspace,
      skin,
      refreshSkin,
      db,
      settings,
      analytics,
      coach,
      setCoach,
      programming,
      urls,
      activeDay,
      setActiveDay,
      manualDay,
      setManualDay,
      draftStatus,
      workoutDraftMessage:workoutDraft.status,legacyWorkoutAvailable,importLegacyWorkout,
      tracker,
      setTracker,
      patchTracker,
      lastSessionId,
      setLastSessionId,
      theme,
      appearance,
      setAppearance,
      toggleTheme,
      refresh,
      needsPin,
      unlocked,
      unlock,
      loading,
      error,
      api: apiClient,
    }),
    [
      page,
      setPage,
      workspace,
      setWorkspace,
      skin,
      refreshSkin,
      db,
      settings,
      analytics,
      coach,
      programming,
      urls,
      activeDay,
      manualDay,
      draftStatus,workoutDraft.status,legacyWorkoutAvailable,importLegacyWorkout,setTracker,patchTracker,
      tracker,
      lastSessionId,
      theme,
      appearance,
      toggleTheme,
      refresh,
      needsPin,
      unlocked,
      unlock,
      loading,
      error,
      apiClient,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}
