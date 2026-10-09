/** Skincare workspace domain — sibling to training, same OS core. */

export const SKIN_TYPES = ['unknown', 'normal', 'dry', 'oily', 'combination', 'sensitive'] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

export const SKIN_CONCERNS = [
  'acne',
  'pigmentation',
  'barrier',
  'aging',
  'redness',
  'texture',
  'dryness',
  'oiliness',
  'pores',
  'sensitivity',
] as const;
export type SkinConcern = (typeof SKIN_CONCERNS)[number];

export const PRODUCT_CATEGORIES = [
  'cleanser',
  'toner',
  'serum',
  'moisturizer',
  'sunscreen',
  'treatment',
  'exfoliant',
  'mask',
  'eye',
  'shampoo',
  'conditioner',
  'scalp-treatment',
  'hair-treatment',
  'other',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductStatus = 'active' | 'paused' | 'finished' | 'wishlist';
export type RoutineSlot = 'am' | 'pm';

export interface SkinProfile {
  skinType: SkinType;
  concerns: string[];
  sensitivities: string[];
  goals: string[];
  climate: string;
  hairTexture: string;
  scalpNotes: string;
  bodyNotes: string;
  treatmentNotes: string;
  notes: string;
  updatedAt: string;
}

export type CareArea = 'face' | 'body' | 'hair' | 'scalp';
export interface CareGoal {
  id: string;
  area: CareArea;
  concern: string;
  desiredChange: string;
  baseline: string;
  reviewDate: string;
  status: 'active' | 'paused' | 'completed';
}
export interface CareCommitment {
  minutesPerDay: number;
  maxSteps: number;
  weeklyDays: number;
  budget: number | null;
  currency: string;
  useOwnedFirst: boolean;
  washDays: number[];
  reminders: boolean;
  photos: boolean;
}
export interface CareTask {
  order?: number;
  id: string;
  label: string;
  area: CareArea;
  productId: string;
  days: number[];
  time: 'morning' | 'evening' | 'wash' | 'anytime';
  minutes: number;
  notes: string;
  paused: boolean;
}
export interface CareEvent {
  id: string;
  date: string;
  taskId: string;
  status: 'done' | 'skipped';
  note: string;
  createdAt: string;
}
export interface CareCheckIn {
  id: string;
  date: string;
  area: CareArea;
  concern: string;
  severity: number | null;
  note: string;
  createdAt: string;
}
export interface CarePhoto {
  id: string;
  date: string;
  area: CareArea;
  dataUrl: string;
  note: string;
  aiObservation?: string;
  createdAt: string;
  original?: { name: string; mime: string; sha256: string; size: number; localPath?: string };
  preview?: { name: string; mime: string; sha256: string; size: number; localPath?: string };
  revision?: number;
}

export interface CareReview {
  id: string;
  goalId: string;
  date: string;
  decision: 'continue' | 'simplify' | 'investigate' | 'change';
  note: string;
}

export interface CarePlanVersion {
  id: string;
  createdAt: string;
  reason: string;
  tasks: CareTask[];
}
export interface CareProposal {
  reason: string;
  tasks: CareTask[];
  baseUpdatedAt: string;
  baseRevision: number;
}

export interface CareData {
  version: 1;
  revision: number;
  onboardingComplete: boolean;
  commitment: CareCommitment;
  goals: CareGoal[];
  tasks: CareTask[];
  events: CareEvent[];
  checkIns: CareCheckIn[];
  planHistory: CarePlanVersion[];
  reviews: CareReview[];
  updatedAt: string;
}
export function emptyCareData(): CareData {
  return {
    version: 1, revision: 0, onboardingComplete: false,
    commitment: { minutesPerDay: 5, maxSteps: 3, weeklyDays: 7, budget: null, currency: 'INR', useOwnedFirst: true, washDays: [], reminders: false, photos: false },
    goals: [], tasks: [], events: [], checkIns: [], planHistory: [], reviews: [], updatedAt: '1970-01-01T00:00:00.000Z',
  };
}
export function careTasksForDate(care: CareData, date: string, products?: SkinProduct[]): CareTask[] {
  const day = new Date(`${date}T12:00:00`).getDay();
  return care.tasks.filter(task => !task.paused && (!products || !task.productId || products.some(product => product.id === task.productId && product.status === 'active')) && (task.days.length === 0 || task.days.includes(day)) && (task.time !== 'wash' || care.commitment.washDays.includes(day)));
}

export interface SkinProduct {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  actives: string[];
  usedIn: RoutineSlot[];
  status: ProductStatus;
  openedAt: string;
  expiresAt: string;
  notes: string;
  sourceUrl?: string;
  sourceExcerpt?: string;
  researchedAt?: string;
  /** Decision context exposed to the local AI coach and product shelf. */
  pros: string[];
  cons: string[];
  useCase: string;
  bestFor: string[];
  createdAt: string;
}

export interface RoutineStep {
  id: string;
  productId: string;
  label: string;
  waitMin: number;
  notes: string;
  paused?: boolean;
}

export interface SkinRoutine {
  id: string;
  slot: RoutineSlot;
  name: string;
  steps: RoutineStep[];
  updatedAt: string;
}

export interface SkinLog {
  id: string;
  date: string;
  /** A routine can be logged without inventing an observation score. */
  barrier: number | null;
  hydration: number | null;
  oiliness: number | null;
  irritation: number | null;
  concerns: string[];
  notes: string;
  routineDone: { am: boolean; pm: boolean };
  createdAt: string;
  aiComment?: string;
  aiAdjustments?: string[];
}

export interface SkinState {
  profile: SkinProfile;
  products: SkinProduct[];
  routines: SkinRoutine[];
  logs: SkinLog[];
  care: CareData;
}

export function emptySkinProfile(): SkinProfile {
  return {
    skinType: 'unknown',
    concerns: [],
    sensitivities: [],
    goals: [],
    climate: '',
    hairTexture: '',
    scalpNotes: '',
    bodyNotes: '',
    treatmentNotes: '',
    notes: '',
    updatedAt: new Date().toISOString(),
  };
}

export function defaultSkinRoutines(now = new Date().toISOString()): SkinRoutine[] {
  return [
    {
      id: 'routine-am',
      slot: 'am',
      name: 'AM routine',
      updatedAt: now,
      steps: [
        { id: 'am-1', productId: '', label: 'Cleanser', waitMin: 0, notes: '' },
        { id: 'am-2', productId: '', label: 'Serum', waitMin: 1, notes: '' },
        { id: 'am-3', productId: '', label: 'Moisturizer', waitMin: 0, notes: '' },
        { id: 'am-4', productId: '', label: 'Sunscreen', waitMin: 0, notes: '' },
      ],
    },
    {
      id: 'routine-pm',
      slot: 'pm',
      name: 'PM routine',
      updatedAt: now,
      steps: [
        { id: 'pm-1', productId: '', label: 'Cleanser', waitMin: 0, notes: '' },
        { id: 'pm-2', productId: '', label: 'Treatment', waitMin: 2, notes: '' },
        { id: 'pm-3', productId: '', label: 'Moisturizer', waitMin: 0, notes: '' },
      ],
    },
  ];
}

export function emptySkinState(): SkinState {
  return {
    profile: emptySkinProfile(),
    products: [],
    routines: defaultSkinRoutines(),
    logs: [],
    care: emptyCareData(),
  };
}

export function clampScore(n: unknown, fallback = 5): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.min(10, Math.round(v)));
}

/** Composite 0–100 skin status from the latest log. */
export function skinStatusScore(log?: SkinLog | null): number | null {
  if (!log) return null;
  if (![log.barrier,log.hydration,log.irritation,log.oiliness].every(value=>typeof value==='number'&&Number.isFinite(value))) return null;
  const barrier = clampScore(log.barrier);
  const hydration = clampScore(log.hydration);
  const irritation = clampScore(log.irritation);
  const oiliness = clampScore(log.oiliness);
  const oilBalance = 10 - Math.abs(oiliness - 5);
  const raw = (barrier * 1.2 + hydration * 1.1 + oilBalance * 0.7 + (11 - irritation) * 1.2) / 4.2;
  return Math.max(0, Math.min(100, Math.round(raw * 10)));
}

export function latestSkinLog(logs: SkinLog[]): SkinLog | null {
  if (!logs.length) return null;
  return [...logs].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

export function logForDate(logs: SkinLog[], date: string): SkinLog | null {
  return logs.find((l) => l.date === date) || null;
}

export function skinRoutineStreak(logs: SkinLog[], slot: RoutineSlot): number {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const log = byDate.get(key);
    if (log?.routineDone?.[slot]) streak += 1;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export interface PlannedStep {
  product: string;
  waitMin?: number;
}

export const SKIN_PRODUCT_TEMPLATE = {
  products: [
    {
      name: 'CeraVe Hydrating Cleanser',
      brand: 'CeraVe',
      category: 'cleanser',
      actives: ['ceramides', 'hyaluronic acid'],
      usedIn: ['am', 'pm'],
      status: 'active',
      notes: '',
      pros: ['Gentle non-foaming cleanse', 'Supports the moisture barrier'],
      cons: ['May feel too mild for heavy makeup'],
      useCase: 'Daily first cleanse for normal-to-dry skin.',
      bestFor: ['dry', 'sensitive', 'barrier support'],
    },
    {
      name: 'The Ordinary Niacinamide 10%',
      brand: 'The Ordinary',
      category: 'serum',
      actives: ['niacinamide'],
      usedIn: ['am', 'pm'],
      status: 'active',
      notes: '',
      pros: ['Helps balance visible oil', 'Lightweight layering serum'],
      cons: ['10% formulas can sting reactive skin'],
      useCase: 'Oil and pore-support serum after cleansing.',
      bestFor: ['oily', 'combination', 'post-acne marks'],
    },
    {
      name: 'CeraVe PM Facial Moisturizing Lotion',
      brand: 'CeraVe',
      category: 'moisturizer',
      actives: ['ceramides', 'niacinamide'],
      usedIn: ['pm'],
      status: 'active',
      notes: '',
      pros: ['Ceramide-focused hydration', 'Easy PM layering'],
      cons: ['May be light for very dry climates'],
      useCase: 'Night moisturizer to support barrier recovery.',
      bestFor: ['normal', 'dry', 'barrier support'],
    },
    {
      name: 'La Roche-Posay Anthelios UVMune 400',
      brand: 'La Roche-Posay',
      category: 'sunscreen',
      actives: [],
      usedIn: ['am'],
      status: 'active',
      notes: '',
      pros: ['High UVA protection', 'Everyday final AM step'],
      cons: ['Finish may not suit every skin tone or climate'],
      useCase: 'Daily broad-spectrum UV protection.',
      bestFor: ['all skin types', 'pigmentation prevention', 'aging prevention'],
    },
  ],
} as const;

export function matchProduct(query: string, products: SkinProduct[]): SkinProduct | null {
  const q = String(query || '')
    .toLowerCase()
    .trim();
  if (!q) return null;
  const pool = products.filter((p) => p.status === 'active' || p.status === 'paused');
  const scored = pool
    .map((p) => {
      const name = p.name.toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const hay = `${brand} ${name}`.trim();
      let score = 0;
      if (name === q || hay === q) score = 100;
      else if (name.startsWith(q) || hay.startsWith(q)) score = 80;
      else if (name.includes(q) || hay.includes(q) || q.includes(name)) score = 60;
      else {
        const tokens = q.split(/\s+/).filter((t) => t.length > 2);
        const hits = tokens.filter((t) => hay.includes(t)).length;
        if (hits) score = 25 + hits * 12;
      }
      return { p, score };
    })
    .filter((x) => x.score >= 37)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p || null;
}

export function stepsFromPlan(
  plan: PlannedStep[],
  products: SkinProduct[],
  prefix: string,
): RoutineStep[] {
  return plan.map((item, i) => {
    const hit = matchProduct(item.product, products);
    return {
      id: `${prefix}-${Date.now()}-${i + 1}`,
      productId: hit?.id || '',
      label: hit?.name || String(item.product || `Step ${i + 1}`),
      waitMin: Number(item.waitMin) || 0,
      notes: hit ? '' : 'Not on shelf — add this product',
      paused: false,
    };
  });
}

const ACTIVE_RE = /retinol|retin|tretinoin|adapalene|aha|bha|pha|acid|peel|exfol|benzoyl|salicylic/i;

export function stepLooksActive(step: RoutineStep, products: SkinProduct[]): boolean {
  const p = products.find((x) => x.id === step.productId);
  if (p?.category === 'treatment' || p?.category === 'exfoliant') return true;
  const text = `${step.label} ${p?.category || ''} ${(p?.actives || []).join(' ')}`;
  return ACTIVE_RE.test(text);
}

export function pauseActivesInRoutines(
  routines: SkinRoutine[],
  products: SkinProduct[],
): { routines: SkinRoutine[]; paused: string[] } {
  const paused: string[] = [];
  const next = routines.map((r) => ({
    ...r,
    steps: r.steps.map((s) => {
      if (!s.paused && stepLooksActive(s, products)) {
        paused.push(`${r.slot.toUpperCase()} · ${s.label}`);
        return { ...s, paused: true };
      }
      return s;
    }),
    updatedAt: new Date().toISOString(),
  }));
  return { routines: next, paused };
}

export function resumeActivesInRoutines(routines: SkinRoutine[]): { routines: SkinRoutine[]; resumed: string[] } {
  const resumed: string[] = [];
  const next = routines.map((r) => ({
    ...r,
    steps: r.steps.map((s) => {
      if (s.paused) {
        resumed.push(`${r.slot.toUpperCase()} · ${s.label}`);
        return { ...s, paused: false };
      }
      return s;
    }),
    updatedAt: new Date().toISOString(),
  }));
  return { routines: next, resumed };
}

const AM_ORDER: ProductCategory[] = ['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen'];
const PM_ORDER: ProductCategory[] = ['cleanser', 'toner', 'treatment', 'serum', 'moisturizer', 'eye'];

export function localBuildRoutine(products: SkinProduct[]): { am: PlannedStep[]; pm: PlannedStep[] } {
  const active = products.filter((p) => p.status === 'active');
  const pick = (cats: ProductCategory[], slot: RoutineSlot) => {
    const used = new Set<string>();
    const out: PlannedStep[] = [];
    for (const cat of cats) {
      const hit = active.find(
        (p) => p.category === cat && !used.has(p.id) && (p.usedIn.length === 0 || p.usedIn.includes(slot)),
      );
      if (hit) {
        used.add(hit.id);
        out.push({ product: hit.name, waitMin: cat === 'serum' || cat === 'treatment' ? 1 : 0 });
      }
    }
    return out;
  };
  return { am: pick(AM_ORDER, 'am'), pm: pick(PM_ORDER, 'pm') };
}

export function localLogReview(skin: SkinState, log: SkinLog): { comment: string; pauseActives: boolean; adjustments: string[] } {
  const adjustments: string[] = [];
  let pauseActives = false;
  const bits: string[] = [];
  if (typeof log.irritation!=='number'||typeof log.barrier!=='number'||typeof log.hydration!=='number'||!Number.isFinite(log.irritation)||!Number.isFinite(log.barrier)||!Number.isFinite(log.hydration)) {
    bits.push('Routine completion was recorded without skin observations. Add a check-in when you want guidance from your own scores.');
  } else if (log.irritation >= 7) {
    pauseActives = true;
    bits.push(`Irritation is ${log.irritation}/10. Pause acids and retinoids for 48 hours.`);
    adjustments.push('Pause actives until irritation drops below 5');
  } else if (log.barrier <= 4) {
    pauseActives = true;
    bits.push(`Barrier is ${log.barrier}/10. Run cleanser + moisturizer + SPF only.`);
    adjustments.push('Pause actives to repair barrier');
  } else if (log.hydration <= 4) {
    bits.push(`Hydration is ${log.hydration}/10. Keep a humectant serum under moisturizer and do not add new actives.`);
  } else {
    bits.push(`Status is usable (barrier ${log.barrier}, hydration ${log.hydration}, irritation ${log.irritation}). Keep the current plan.`);
  }
  if (log.concerns.length) bits.push(`Today’s flags: ${log.concerns.join(', ')}.`);
  if (!skin.products.filter((p) => p.status === 'active').length) {
    bits.push('Shelf is empty — add products so the coach can build a real routine.');
  }
  return { comment: bits.join(' '), pauseActives, adjustments };
}

export function localCareAdvice(skin: SkinState, date: string): string[] {
  const care = skin.care;
  const due = careTasksForDate(care,date);
  const completed = due.filter(task=>care.events.some(event=>event.taskId===task.id&&event.date===date&&event.status==='done')).length;
  const tips:string[]=[];
  if(!care.onboardingComplete) tips.push('Set your goals and realistic time commitment to start your Care plan.');
  if(!skin.products.length) tips.push('Add the products you actually own to your shelf.');
  if(care.tasks.length===0) tips.push('No Care Plan actions are saved yet. Ask Coach to build a plan or add actions in Care Plan.');
  if(due.length) tips.push(`${completed} of ${due.length} planned care actions recorded today.`);
  if(care.checkIns.length===0) tips.push('Record what you notice when you have an observation; you do not need to rate every day.');
  if(!tips.length) tips.push('Your Care plan is ready. Tell Coach what changed or open Reviews to reflect on your observations.');
  return tips;
}

export function localSkinAdvice(skin: SkinState, today: string): string[] {
  const tips: string[] = [];
  const last = latestSkinLog(skin.logs);
  const todayLog = logForDate(skin.logs, today);
  const am = skin.routines.find((r) => r.slot === 'am');
  const pm = skin.routines.find((r) => r.slot === 'pm');
  const hour = new Date().getHours();

  if (skin.profile.skinType === 'unknown') {
    tips.push('Set your skin type in My Skin so routines and coaching can target the right barrier strategy.');
  }
  if (!skin.products.filter((p) => p.status === 'active').length) {
    tips.push('Add the products you actually use. Routine steps get more useful once they map to real bottles.');
  }
  if (!todayLog?.routineDone.am && hour >= 5 && hour < 16) {
    tips.push(am?.steps.length ? 'AM routine is still open. Cleanse, treat, moisturize, then sunscreen.' : 'Build an AM routine — sunscreen is the non-negotiable last step.');
  }
  if (!todayLog?.routineDone.pm && hour >= 18) {
    tips.push('PM routine still pending. Keep tonight simple if irritation is up.');
  }
  if (typeof last?.irritation==='number' && last.irritation >= 7) {
    tips.push('Irritation is elevated. Pause acids/retinoids for 48h and run cleanser + moisturizer + SPF only.');
  } else if (typeof last?.barrier==='number' && last.barrier <= 4) {
    tips.push('Barrier looks compromised. Favor ceramide/occlusive moisturizer and skip physical exfoliation.');
  } else if (typeof last?.hydration==='number' && last.hydration <= 4) {
    tips.push('Hydration is low. Layer a humectant serum under moisturizer and check indoor humidity.');
  }
  if (skin.profile.concerns.includes('acne') && typeof last?.oiliness==='number' && last.oiliness >= 8) {
    tips.push('Oil is high with acne as a concern. Keep actives to one leave-on and do not stack new treatments this week.');
  }
  if (!tips.length) {
    tips.push('Skin system is steady. Repeat the current routine and log how the barrier feels tomorrow.');
  }
  return tips.slice(0, 5);
}

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  cleanser: 'Cleanser',
  toner: 'Toner',
  serum: 'Serum',
  moisturizer: 'Moisturizer',
  sunscreen: 'Sunscreen',
  treatment: 'Treatment',
  exfoliant: 'Exfoliant',
  mask: 'Mask',
  eye: 'Eye',
  shampoo: 'Shampoo',
  conditioner: 'Conditioner',
  'scalp-treatment': 'Scalp treatment',
  'hair-treatment': 'Hair treatment',
  other: 'Other',
};

export const SKIN_TYPE_LABEL: Record<SkinType, string> = {
  unknown: 'Not set',
  normal: 'Normal',
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
};
