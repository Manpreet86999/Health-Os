import { useDraftState, useDraftFields } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';
import type { Exercise, LibraryMeta, Program, Week } from '../lib/types';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';

type LibraryTab = 'exercises' | 'splits' | 'plans';
type ImportKind = 'exercises' | 'splits' | 'plans';
type ImportStep = 'choose' | 'preview';

const BODY_PARTS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Biceps',
  'Triceps',
  'Core',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Legs',
  'Full body',
  'Other',
] as const;

const EXERCISE_TEMPLATE = {
  version: 1,
  type: 'exercises',
  exercises: [
    {
      name: 'Bench Press',
      aliases: ['BB Bench'],
      muscles: ['Chest', 'Triceps', 'Shoulders'],
      equipment: 'Barbell',
      movementPattern: 'horizontal_press',
      substitutions: ['DB Bench Press', 'Push-up'],
      bodyPart: 'Chest',
      workoutSplit: 'Push',
      tutorialLink: '',
      familyId: 'bench',
      defaultCue: 'Scapular retract, feet drive',
      defaultRestSec: 180,
      defaultTempo: '2-0-1-0',
    },
    {
      name: 'Romanian Deadlift',
      aliases: ['RDL'],
      muscles: ['Hamstrings', 'Glutes', 'Back'],
      equipment: 'Barbell',
      movementPattern: 'hinge',
      substitutions: ['Deadlift'],
      bodyPart: 'Hamstrings',
      workoutSplit: 'Pull',
      tutorialLink: '',
      familyId: 'deadlift',
      defaultCue: 'Soft knees, push hips back',
      defaultRestSec: 180,
      defaultTempo: '3-0-1-0',
    },
  ],
};

const SPLIT_TEMPLATE = {
  version: 1,
  type: 'splits',
  weeks: [
    {
      name: 'Push / Pull / Legs',
      weekNumber: 1,
      notes: 'Classic 6-day PPL split template.',
      days: [
        {
          key: 'Mon',
          type: 'push',
          title: 'Push A',
          subtitle: '',
          muscles: ['Chest', 'Shoulders', 'Triceps'],
          exercises: [
            { name: 'Bench Press', target: 'Chest', vol: '4 x 6-8', cue: 'Scapular retract' },
            { name: 'Overhead Press', target: 'Shoulders', vol: '3 x 8-10', cue: 'Brace core' },
            { name: 'Tricep Pushdown', target: 'Triceps', vol: '3 x 12-15', cue: 'Elbows pinned' },
          ],
        },
        {
          key: 'Tue',
          type: 'pull',
          title: 'Pull A',
          subtitle: '',
          muscles: ['Back', 'Biceps'],
          exercises: [
            { name: 'Barbell Row', target: 'Back', vol: '4 x 6-8', cue: 'Chest proud' },
            { name: 'Pull-up', target: 'Back', vol: '3 x 6-10', cue: 'Full stretch' },
            { name: 'Barbell Curl', target: 'Biceps', vol: '3 x 10-12', cue: 'No swing' },
          ],
        },
        {
          key: 'Wed',
          type: 'legs',
          title: 'Legs A',
          subtitle: '',
          muscles: ['Quads', 'Hamstrings', 'Glutes'],
          exercises: [
            { name: 'Back Squat', target: 'Quads', vol: '4 x 5-8', cue: 'Depth + brace' },
            { name: 'Romanian Deadlift', target: 'Hamstrings', vol: '3 x 8-10', cue: 'Soft knee' },
            { name: 'Calf Raise', target: 'Calves', vol: '3 x 12-15', cue: 'Full ROM' },
          ],
        },
        {
          key: 'Thu',
          type: 'push',
          title: 'Push B',
          subtitle: '',
          muscles: ['Chest', 'Shoulders', 'Triceps'],
          exercises: [
            { name: 'Incline Bench Press', target: 'Chest', vol: '4 x 6-8', cue: '' },
            { name: 'Lateral Raise', target: 'Shoulders', vol: '3 x 12-15', cue: '' },
          ],
        },
        {
          key: 'Fri',
          type: 'pull',
          title: 'Pull B',
          subtitle: '',
          muscles: ['Back', 'Biceps'],
          exercises: [
            { name: 'Lat Pulldown', target: 'Back', vol: '4 x 8-12', cue: '' },
            { name: 'Face Pull', target: 'Rear delts', vol: '3 x 15', cue: '' },
          ],
        },
        {
          key: 'Sat',
          type: 'legs',
          title: 'Legs B',
          subtitle: '',
          muscles: ['Quads', 'Glutes'],
          exercises: [
            { name: 'Hip Thrust', target: 'Glutes', vol: '3 x 8-12', cue: '' },
            { name: 'Walking Lunge', target: 'Quads', vol: '3 x 10/leg', cue: '' },
          ],
        },
        {
          key: 'Sun',
          type: 'rest',
          title: 'RECOVERY',
          subtitle: '',
          muscles: [],
          exercises: [{ name: 'Walk + Mobility', target: 'Systemic', vol: '20-40m', cue: 'Easy zone 2' }],
        },
      ],
    },
  ],
};

const PLAN_TEMPLATE = {
  version: 1,
  type: 'plans',
  programs: [
    {
      name: 'Hypertrophy Block — 4 Weeks',
      notes: 'Accumulate volume, then intensify. Embedded weeks are imported with the plan.',
      active: false,
      weeks: [
        {
          name: 'Hypertrophy W1',
          weekNumber: 1,
          phase: 'accumulate',
          notes: 'Volume base',
          days: SPLIT_TEMPLATE.weeks[0].days,
        },
        {
          name: 'Hypertrophy W2',
          weekNumber: 2,
          phase: 'accumulate',
          notes: 'Volume progress',
          days: SPLIT_TEMPLATE.weeks[0].days,
        },
      ],
    },
  ],
};

interface ImportPreview {
  kind: ImportKind;
  fileName: string;
  items: unknown[];
  summary: string[];
  errors: string[];
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeLibraryMeta(value: unknown): LibraryMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const meta = value as Record<string, unknown>;
  return {
    tags: asArray(meta.tags).map(String).filter(Boolean),
    collectionIds: asArray(meta.collectionIds).map(String).filter(Boolean),
    favorite: Boolean(meta.favorite),
    archived: Boolean(meta.archived),
    lastUsedAt: meta.lastUsedAt ? String(meta.lastUsedAt) : undefined,
    useCount: meta.useCount == null ? undefined : Number(meta.useCount) || 0,
    notes: meta.notes ? String(meta.notes) : undefined,
    createdAt: meta.createdAt ? String(meta.createdAt) : undefined,
    updatedAt: meta.updatedAt ? String(meta.updatedAt) : undefined,
  };
}

function normalizeExercisesPayload(raw: unknown): { items: Partial<Exercise>[]; errors: string[] } {
  const errors: string[] = [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.exercises)) list = obj.exercises;
    else errors.push('Expected an array of exercises, or { "exercises": [...] }.');
  } else {
    errors.push('Invalid JSON structure for exercises.');
  }

  const items: Partial<Exercise>[] = [];
  list.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      errors.push(`Item ${i + 1}: not an object.`);
      return;
    }
    const e = row as Record<string, unknown>;
    const name = String(e.name || '').trim();
    if (!name) {
      errors.push(`Item ${i + 1}: name is required.`);
      return;
    }
    items.push({
      id: e.id ? String(e.id) : undefined,
      name,
      aliases: asArray(e.aliases).map(String),
      muscles: asArray(e.muscles).map(String),
      equipment: String(e.equipment || ''),
      movementPattern: String(e.movementPattern || ''),
      substitutions: asArray(e.substitutions).map(String),
      bodyPart: e.bodyPart ? String(e.bodyPart) : undefined,
      workoutSplit: e.workoutSplit ? String(e.workoutSplit) : undefined,
      tutorialLink: e.tutorialLink ? String(e.tutorialLink) : undefined,
      familyId: e.familyId ? String(e.familyId) : undefined,
      defaultCue: e.defaultCue ? String(e.defaultCue) : undefined,
      defaultRestSec: e.defaultRestSec != null ? Number(e.defaultRestSec) : undefined,
      defaultTempo: e.defaultTempo ? String(e.defaultTempo) : undefined,
      trackingMode: e.trackingMode === 'reps' || e.trackingMode === 'time' ? e.trackingMode : 'weight_reps',
      meta: normalizeLibraryMeta(e.meta),
    });
  });
  return { items, errors };
}

function normalizeSplitsPayload(raw: unknown): { items: Partial<Week>[]; errors: string[] } {
  const errors: string[] = [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.weeks)) list = obj.weeks;
    else if (obj.name || obj.days) list = [obj];
    else errors.push('Expected a week object, an array of weeks, or { "weeks": [...] }.');
  } else {
    errors.push('Invalid JSON structure for workout splits.');
  }

  const items: Partial<Week>[] = [];
  list.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      errors.push(`Split ${i + 1}: not an object.`);
      return;
    }
    const w = row as Record<string, unknown>;
    const name = String(w.name || '').trim();
    const days = asArray(w.days);
    if (!name) {
      errors.push(`Split ${i + 1}: name is required.`);
      return;
    }
    if (!days.length) {
      errors.push(`Split "${name}": at least one day is required.`);
      return;
    }
    items.push({
      id: w.id ? String(w.id) : undefined,
      name,
      weekNumber: (w.weekNumber as number | string) ?? 1,
      startDate: String(w.startDate || ''),
      notes: String(w.notes || ''),
      active: false,
      status: w.status ? String(w.status) : undefined,
      missionObjective: w.missionObjective ? String(w.missionObjective) : undefined,
      phase: w.phase as Week['phase'],
      days: days.map((d, di) => {
        const day = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
        return {
          key: String(day.key || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][di] || `D${di + 1}`),
          type: String(day.type || 'train'),
          title: String(day.title || `Day ${di + 1}`),
          subtitle: String(day.subtitle || ''),
          muscles: asArray(day.muscles).map(String),
          exercises: asArray(day.exercises).map((ex) => {
            const e = (ex && typeof ex === 'object' ? ex : {}) as Record<string, unknown>;
            return {
              name: String(e.name || 'Exercise'),
              target: String(e.target || ''),
              vol: String(e.vol || ''),
              cue: String(e.cue || ''),
              exerciseId: e.exerciseId ? String(e.exerciseId) : undefined,
              familyId: e.familyId ? String(e.familyId) : undefined,
              supersetGroup: e.supersetGroup ? String(e.supersetGroup) : undefined,
              percent1rm: e.percent1rm as number | string | undefined,
              rirTarget: e.rirTarget as number | string | undefined,
              rpeTarget: e.rpeTarget as number | string | undefined,
              tempo: e.tempo ? String(e.tempo) : undefined,
              restSec: e.restSec as number | string | undefined,
              notes: e.notes ? String(e.notes) : undefined,
            };
          }),
          scheduledDate: day.scheduledDate ? String(day.scheduledDate) : undefined,
        };
      }),
    });
  });
  return { items, errors };
}

function normalizePlansPayload(raw: unknown): {
  items: Array<Partial<Program> & { embeddedWeeks?: Partial<Week>[] }>;
  errors: string[];
} {
  const errors: string[] = [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.programs)) list = obj.programs;
    else if (obj.name) list = [obj];
    else errors.push('Expected a program object, an array of programs, or { "programs": [...] }.');
  } else {
    errors.push('Invalid JSON structure for workout plans.');
  }

  const items: Array<Partial<Program> & { embeddedWeeks?: Partial<Week>[] }> = [];
  list.forEach((row, i) => {
    if (!row || typeof row !== 'object') {
      errors.push(`Plan ${i + 1}: not an object.`);
      return;
    }
    const p = row as Record<string, unknown>;
    const name = String(p.name || '').trim();
    if (!name) {
      errors.push(`Plan ${i + 1}: name is required.`);
      return;
    }
    const weeksRaw = asArray(p.weeks);
    if (!weeksRaw.length) {
      errors.push(`Plan "${name}": at least one week reference or embedded week is required.`);
      return;
    }

    const embeddedWeeks: Partial<Week>[] = [];
    const weekRefs: Program['weeks'] = [];

    weeksRaw.forEach((wr, wi) => {
      if (!wr || typeof wr !== 'object') {
        errors.push(`Plan "${name}" week ${wi + 1}: not an object.`);
        return;
      }
      const w = wr as Record<string, unknown>;
      // Embedded full week (has days)
      if (Array.isArray(w.days)) {
        const { items: splitItems, errors: splitErrs } = normalizeSplitsPayload(w);
        errors.push(...splitErrs.map((e) => `Plan "${name}": ${e}`));
        if (splitItems[0]) {
          embeddedWeeks.push(splitItems[0]);
          weekRefs.push({
            weekId: '', // filled after import
            weekNumber: Number(w.weekNumber || wi + 1),
            phase: (w.phase as Program['weeks'][0]['phase']) || 'accumulate',
            name: String(w.name || `Week ${wi + 1}`),
          });
        }
      } else if (w.weekId) {
        weekRefs.push({
          weekId: String(w.weekId),
          weekNumber: Number(w.weekNumber || wi + 1),
          phase: (w.phase as Program['weeks'][0]['phase']) || 'accumulate',
          name: w.name ? String(w.name) : undefined,
        });
      } else {
        errors.push(`Plan "${name}" week ${wi + 1}: provide weekId or embedded days[].`);
      }
    });

    items.push({
      id: p.id ? String(p.id) : undefined,
      name,
      notes: String(p.notes || ''),
      active: Boolean(p.active),
      createdAt: p.createdAt ? String(p.createdAt) : undefined,
      weeks: weekRefs,
      embeddedWeeks,
    });
  });
  return { items, errors };
}

function exerciseBodyPart(e: Exercise): string {
  if (e.bodyPart) return e.bodyPart;
  const m = (e.muscles || [])[0];
  return m || 'Other';
}

function matchesBodyPart(e: Exercise, filter: string): boolean {
  if (filter === 'All') return true;
  const bp = exerciseBodyPart(e).toLowerCase();
  const muscles = (e.muscles || []).map((x) => x.toLowerCase());
  const f = filter.toLowerCase();
  if (bp === f || muscles.includes(f)) return true;
  if (f === 'arms') return muscles.some((m) => m.includes('bicep') || m.includes('tricep') || m === 'arms');
  if (f === 'legs') {
    return (
      bp === 'legs' ||
      muscles.some((m) =>
        ['quads', 'hamstrings', 'glutes', 'calves', 'legs', 'posterior'].some((x) => m.includes(x)),
      )
    );
  }
  return false;
}

function countTrainingDays(week: Week): number {
  return (week.days || []).filter((d) => d.type !== 'rest').length;
}

function countExercisesInWeek(week: Week): number {
  return (week.days || []).reduce((n, d) => n + (d.exercises?.length || 0), 0);
}

export function Library({ initialView = '' }: { initialView?: string }) {
  const app = useApp();
  const toast = useToast();
  const { db, setPage } = app;
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<LibraryTab>(initialView === 'Splits' ? 'splits' : initialView === 'Plans' ? 'plans' : 'exercises');
  const [search, setSearch] = useState('');
  const [bodyPart, setBodyPart] = useState<string>('All');
  const [favoritesOnly, setFavoritesOnly] = useState(initialView === 'Favorites');

  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind>('exercises');
  const [importStep, setImportStep] = useState<ImportStep>('choose');
  const importDraft=useDraftState<ImportPreview|null>('library-import-preview',null);
  const preview=importDraft.value,setPreview=importDraft.setValue;
  const [importing, setImporting] = useState(false);

  const [detail, setDetail] = useState<Exercise | null>(null);
  const exerciseDraft=useDraftState<Partial<Exercise>|null>('exercise-card:'+(detail?.id||'closed'),()=>detail?{...detail}:null);const {value:editForm,setValue:setEditForm}=exerciseDraft;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inspectExercise, setInspectExercise] = useState<Exercise | null>(null);

  const [visualLimit,setVisualLimit]=useState(48);
  const exercises = db?.exercises || [];
  const weeks = db?.librarySplits || [];
  const programs = db?.programs || [];
  const flexibleMode = db?.trainingConfig?.preplannedWeekMode === false;

  const bodyPartCounts = useMemo(() => {
    const counts: Record<string, number> = { All: exercises.length };
    for (const part of BODY_PARTS) {
      if (part === 'All') continue;
      counts[part] = exercises.filter((e) => matchesBodyPart(e, part)).length;
    }
    return counts;
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises
      .filter((e) => !e.meta?.archived)
      .filter((e) => matchesBodyPart(e, bodyPart))
      .filter((e) => !favoritesOnly || e.meta?.favorite)
      .filter((e) => {
        if (!q) return true;
        const hay = [
          e.name,
          e.equipment,
          e.bodyPart,
          e.workoutSplit,
          e.movementPattern,
          e.defaultCue,
          ...(e.muscles || []),
          ...(e.aliases || []),
          ...(e.substitutions || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, bodyPart, favoritesOnly, search]);

  const filteredSplits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return weeks
      .filter((w) => {
        if (!q) return true;
        const dayText = (w.days || [])
          .flatMap((d) => [d.title, d.type, ...(d.muscles || []), ...(d.exercises || []).map((e) => e.name)])
          .join(' ');
        return `${w.name} ${w.notes || ''} ${dayText}`.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [weeks, search]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return programs
      .filter((p) => {
        if (!q) return true;
        return `${p.name} ${p.notes || ''}`.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [programs, search]);

  if (!db) return null;

  function openImport() {
    if(!importDraft.ready)return;
    setImportOpen(true);
    setImportStep(preview?'preview':'choose');
    setImportKind(preview?.kind||(tab === 'splits' ? 'splits' : tab === 'plans' ? 'plans' : 'exercises'));
  }

  function closeImport() {
    setImportOpen(false);
    setImportStep('choose');
    if (fileRef.current) fileRef.current.value = '';
  }

  function downloadTemplate(kind: ImportKind) {
    if (kind === 'exercises') downloadJson('workout-os-exercises-template.json', EXERCISE_TEMPLATE);
    else if (kind === 'splits') downloadJson('workout-os-splits-template.json', SPLIT_TEMPLATE);
    else downloadJson('workout-os-plans-template.json', PLAN_TEMPLATE);
    toast.push('Template downloaded', 'ok');
  }

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if(preview&&!confirm('Replace the protected import preview with this file?'))return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      if (importKind === 'exercises') {
        const { items, errors } = normalizeExercisesPayload(raw);
        setPreview({
          kind: 'exercises',
          fileName: file.name,
          items:items.map(item=>({...item,id:item.id||crypto.randomUUID()})),
          summary: [
            `${items.length} exercise(s) ready to import`,
            `${items.filter((x) => x.tutorialLink).length} with tutorial links`,
            `${items.filter((x) => x.bodyPart).length} with body part tags`,
          ],
          errors,
        });
      } else if (importKind === 'splits') {
        const { items, errors } = normalizeSplitsPayload(raw);
        setPreview({
          kind: 'splits',
          fileName: file.name,
          items:items.map(item=>({...item,id:item.id||crypto.randomUUID()})),
          summary: [
            `${items.length} workout split(s) ready to import`,
            `${items.reduce((n, w) => n + (w.days?.length || 0), 0)} total day rows`,
            `${items.reduce(
              (n, w) => n + (w.days || []).reduce((m, d) => m + (d.exercises?.length || 0), 0),
              0,
            )} planned exercises across all days`,
          ],
          errors,
        });
      } else {
        const { items, errors } = normalizePlansPayload(raw);
        const embedded = items.reduce((n, p) => n + (p.embeddedWeeks?.length || 0), 0);
        setPreview({
          kind: 'plans',
          fileName: file.name,
          items:items.map(item=>({...item,id:item.id||crypto.randomUUID(),embeddedWeeks:item.embeddedWeeks?.map(week=>({...week,id:week.id||crypto.randomUUID()}))})),
          summary: [
            `${items.length} workout plan(s) ready to import`,
            `${embedded} embedded week(s) will be created`,
            `${items.reduce((n, p) => n + (p.weeks?.length || 0), 0)} week slot(s) in plans`,
          ],
          errors,
        });
      }
      setImportStep('preview');
    } catch (err) {
      toast.push((err as Error).message || 'Could not parse JSON', 'err');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!importDraft.ready||importing||!preview || preview.errors.length) return;
    setImporting(true);
    try {
      if (preview.kind === 'exercises') {
        const payload = (preview.items as Partial<Exercise>[]).map((e) => ({
          ...e,
          id: e.id || crypto.randomUUID(),
          aliases: e.aliases || [],
          muscles: e.muscles || [],
          substitutions: e.substitutions || [],
          equipment: e.equipment || '',
          movementPattern: e.movementPattern || '',
        }));
        const res = await app.api.importExercises(payload);
        await app.refresh();
        toast.push(`Imported ${res.imported} exercise(s)`, 'ok');
        setTab('exercises');
      } else if (preview.kind === 'splits') {
        let count = 0;
        for (const week of preview.items as Partial<Week>[]) {
          await app.api.saveLibrarySplit({
            ...week,
            id: week.id || crypto.randomUUID(),
            active: false,
          });
          count++;
        }
        await app.refresh();
        toast.push(`Imported ${count} workout split(s)`, 'ok');
        setTab('splits');
      } else {
        let count = 0;
        for (const plan of preview.items as Array<Partial<Program> & { embeddedWeeks?: Partial<Week>[] }>) {
          const weekRefs = [...(plan.weeks || [])];
          const embedded = plan.embeddedWeeks || [];
          let embIdx = 0;
          for (let i = 0; i < weekRefs.length; i++) {
            if (!weekRefs[i].weekId && embIdx < embedded.length) {
              const emb = embedded[embIdx++];
              const saved = await app.api.importWeek({
                ...emb,
                id: emb.id || crypto.randomUUID(),
                active: false,
              });
              weekRefs[i] = {
                ...weekRefs[i],
                weekId: saved.id,
                name: weekRefs[i].name || saved.name,
              };
            }
          }
          await app.api.saveProgram({
            id: plan.id || crypto.randomUUID(),
            name: plan.name,
            notes: plan.notes || '',
            active: Boolean(plan.active),
            weeks: weekRefs.filter((w) => w.weekId),
            createdAt: plan.createdAt || new Date().toISOString(),
          });
          count++;
        }
        await app.refresh();
        toast.push(`Imported ${count} workout plan(s)`, 'ok');
        setTab('plans');
      }
      setPreview(null);await importDraft.clear();closeImport();
    } catch (err) {
      toast.push((err as Error).message, 'err');
    } finally {
      setImporting(false);
    }
  }

  function openDetail(ex: Exercise) {
    setDetail(ex);

  }

  async function saveDetail() {
    if (!editForm || !editForm.name?.trim()) {
      toast.push('Name is required', 'err');
      return;
    }
    try {
      await app.api.saveExercise({
        ...editForm,
        id: editForm.id || crypto.randomUUID(),
        name: editForm.name.trim(),
        aliases: editForm.aliases || [],
        muscles: editForm.muscles || [],
        substitutions: editForm.substitutions || [],
        equipment: editForm.equipment || '',
        movementPattern: editForm.movementPattern || '',
      });
      await exerciseDraft.clear();
      await app.refresh();
      toast.push('Exercise saved', 'ok');
      setDetail(null);
      
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  async function addCustomExercise() {
    openDetail({ id: crypto.randomUUID(), name: '', aliases: [], muscles: [], equipment: '', movementPattern: '', substitutions: [], bodyPart: '', tutorialLink: '' });
  }

  async function toggleFavorite(exercise: Exercise) {
    try {
      await app.api.saveExercise({
        id: exercise.id, name: exercise.name,
        meta: { ...exercise.meta, favorite: !exercise.meta?.favorite, updatedAt: new Date().toISOString() },
      });
      await app.refresh();
      toast.push(exercise.meta?.favorite ? 'Removed from favorites' : 'Added to favorites', 'ok');
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await app.api.deleteExercise(deleteId);
      await app.refresh();
      toast.push('Exercise deleted', 'ok');
      setDeleteId(null);
      if (detail?.id === deleteId) {
        setDetail(null);
        
      }
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  async function addSplitToPrograms(split: Week) {
    if (flexibleMode) {
      toast.push('Preplanned Week is off. Library weeks cannot be moved to Planner while flexible training is active.', 'info');
      return;
    }
    try {
      const moved = await app.api.importWeek({ ...split, id: crypto.randomUUID(), active: true, status: 'active', mode: 'planned' });
      await app.api.activateWeek(moved.id);
      await app.refresh();
      toast.push(`${split.name} moved to Planner and activated`, 'ok');
      setPage('Planner');
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  async function deleteSplit(weekId: string) {
    try {
      await app.api.deleteLibrarySplit(weekId);
      await app.refresh();
      toast.push('Split removed', 'ok');
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  async function deletePlan(id: string) {
    try {
      await app.api.deleteProgram(id);
      await app.refresh();
      toast.push('Plan removed', 'ok');
    } catch (err) {
      toast.push((err as Error).message, 'err');
    }
  }

  const searchPlaceholder =
    tab === 'exercises'
      ? 'Search exercises, muscles, equipment…'
      : tab === 'splits'
        ? 'Search splits, day titles, exercise names…'
        : 'Search workout plans…';

  return (
    <div className="fade page-shell library-page">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Master catalog</span>
          <h2 className="page-title">{tab==='splits'?'Workout splits':tab==='plans'?'Saved plans':'Exercise library'}</h2>
          <p className="page-sub">
            Your exercise vault, workout splits, and multi-week plans — searchable, filterable, and importable from
            JSON.
          </p>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="btn btn-hot" onClick={openImport}>
            Import
          </button>
          {tab === 'exercises' ? (
            <button type="button" className="btn btn-soft" onClick={() => void addCustomExercise()}>
              + Exercise
            </button>
          ) : null}
        </div>
      </header>

      <div hidden={tab!=='exercises'} className="page-signals">
        <div className="page-signal">
          <span className="page-signal-label">Exercises</span>
          <span className="page-signal-value">{exercises.length}</span>
        </div>
        <div className="page-signal">
          <span className="page-signal-label">Splits</span>
          <span className="page-signal-value">{weeks.length}</span>
        </div>
        <div className="page-signal">
          <span className="page-signal-label">Plans</span>
          <span className="page-signal-value">{programs.length}</span>
        </div>
        <div className="page-signal">
          <span className="page-signal-label">With video</span>
          <span className="page-signal-value">{exercises.filter((e) => e.tutorialLink).length}</span>
        </div>
      </div>

      <section className="page-panel library-toolbar-panel">
        <div className="library-toolbar">

          <input
            className="input library-search"
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search library"
          />
        </div>

        {tab === 'exercises' ? (
          <div className="library-filters" role="group" aria-label="Filter by body part">
            <button
              type="button"
              className={`library-filter-chip ${favoritesOnly ? 'active' : ''}`}
              onClick={() => setFavoritesOnly((value) => !value)}
              aria-pressed={favoritesOnly}
            >
              ★ Favorites
              <span className="library-filter-count">{exercises.filter((e) => e.meta?.favorite && !e.meta?.archived).length}</span>
            </button>
            {BODY_PARTS.map((part) => {
              const count = bodyPartCounts[part] ?? 0;
              if (part !== 'All' && count === 0) return null;
              return (
                <button
                  key={part}
                  type="button"
                  className={`library-filter-chip ${bodyPart === part ? 'active' : ''}`}
                  onClick={() => setBodyPart(part)}
                >
                  {part}
                  <span className="library-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* —— Exercises flashcards —— */}
      {tab === 'exercises' ? (
        <section className="library-section">
          <div className="library-section-head">
            <span className="page-section-label">Exercise vault</span>
            <h3>
              {filteredExercises.length} flashcard{filteredExercises.length === 1 ? '' : 's'}
              {bodyPart !== 'All' ? ` · ${bodyPart}` : ''}
            </h3>
          </div>

          {filteredExercises.length ? (<>
            {filteredExercises.length>visualLimit&&<button className="btn btn-soft" onClick={()=>setVisualLimit(n=>n+48)}>Show more exercises</button>}
            <div className="library-flash-grid">
              {filteredExercises.slice(0,visualLimit).map((ex) => {
                const bp = exerciseBodyPart(ex);
                return <article key={ex.id} className="page-panel stack" style={{cursor:'pointer'}} onClick={() => setInspectExercise(ex)}>
                  <div className="row"><span className="pill pill-orange">{bp}</span>{ex.equipment && <span className="pill pill-slate">{ex.equipment}</span>}</div>
                  <button type="button" className="btn btn-ghost" style={{textAlign:'left',fontSize:18}} onClick={e => { e.stopPropagation(); setInspectExercise(ex); }}>{ex.name}</button>
                  <p className="subtle">{(ex.muscles || []).join(' · ')}</p>
                  <div className="row" onClick={e => e.stopPropagation()}>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => void toggleFavorite(ex)}>{ex.meta?.favorite ? '★ Saved' : '☆ Save'}</button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => openDetail(ex)}>Edit</button>
                    <span className="subtle">{ex.tutorialLink ? 'Video guide' : 'Add a shared guide'}</span>
                  </div>
                </article>;
              })}
            </div></>
          ) : (
            <div className="page-empty">
              No exercises match your filters.
              <div className="mt-3 row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-hot" onClick={openImport}>
                  Import exercises
                </button>
                <button type="button" className="btn btn-soft" onClick={() => void addCustomExercise()}>
                  Add custom
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* —— Splits (weeks) —— */}
      {tab === 'splits' ? (
        <section className="library-section">
          <div className="library-section-head">
            <span className="page-section-label">Workout splits</span>
            <h3>
              {filteredSplits.length} split{filteredSplits.length === 1 ? '' : 's'}
            </h3>
            <p className="subtle">Weekly templates (PPL, upper/lower, custom). Add a copy to Programs when you want to use one.</p>
          </div>

          {filteredSplits.length ? (
            <div className="library-card-grid">
              {filteredSplits.map((week) => {
                const trainDays = countTrainingDays(week);
                const exCount = countExercisesInWeek(week);
                return (
                  <article key={week.id} className="library-entity-card">
                    <div className="library-entity-top">
                      <div>
                        <span className="pill pill-slate">Split</span>
                        <h4>{week.name}</h4>
                        <p className="subtle">{week.notes || 'No notes'}</p>
                      </div>
                      <div className="library-entity-stats">
                        <span>
                          <b>{trainDays}</b> train days
                        </span>
                        <span>
                          <b>{exCount}</b> exercises
                        </span>
                        {week.weekNumber != null && week.weekNumber !== '' ? (
                          <span>
                            W<b>{week.weekNumber}</b>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="library-day-strip">
                      {(week.days || []).map((d) => (
                        <div key={d.key} className={`library-day-pill type-${(d.type || 'train').toLowerCase()}`}>
                          <span className="library-day-key">{d.key}</span>
                          <span className="library-day-title">{d.title || d.type}</span>
                          <span className="library-day-count">{d.exercises?.length || 0} lifts</span>
                        </div>
                      ))}
                    </div>
                    <div className="library-entity-actions">
                      <button
                        type="button"
                        className="btn btn-hot btn-sm"
                        onClick={() => void addSplitToPrograms(week)}
                      >
                        Move to Planner
                      </button>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => void deleteSplit(week.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="page-empty">
              No workout splits yet — import a JSON split or create weeks in Programs / Planner.
              <div className="mt-3" style={{ display: 'flex', justifyContent: 'center' }}>
                <button type="button" className="btn btn-hot" onClick={openImport}>
                  Import split
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* —— Plans (programs) —— */}
      {tab === 'plans' ? (
        <section className="library-section">
          <div className="library-section-head">
            <span className="page-section-label">Workout plans</span>
            <h3>
              {filteredPlans.length} plan{filteredPlans.length === 1 ? '' : 's'}
            </h3>
            <p className="subtle">Multi-week mesocycles fed into your library (import JSON or build in Programs).</p>
          </div>

          {filteredPlans.length ? (
            <div className="library-card-grid">
              {filteredPlans.map((plan) => (
                <article key={plan.id} className={`library-entity-card ${plan.active ? 'is-active' : ''}`}>
                  <div className="library-entity-top">
                    <div>
                      <span className={`pill ${plan.active ? 'pill-green' : 'pill-slate'}`}>
                        {plan.active ? 'Active plan' : 'Plan'}
                      </span>
                      <h4>{plan.name}</h4>
                      <p className="subtle">{plan.notes || 'No notes'}</p>
                    </div>
                    <div className="library-entity-stats">
                      <span>
                        <b>{plan.weeks?.length || 0}</b> weeks
                      </span>
                    </div>
                  </div>
                  <div className="page-list">
                    {(plan.weeks || []).map((w) => {
                      const week = weeks.find((x) => x.id === w.weekId);
                      return (
                        <div key={`${plan.id}-${w.weekId}-${w.weekNumber}`} className="page-list-item">
                          <span>
                            W{w.weekNumber}: {week?.name || w.name || w.weekId}
                          </span>
                          <span className="pill pill-orange">{w.phase}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="library-entity-actions">
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('Programs')}>
                      Manage in Programs
                    </button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => void deletePlan(plan.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="page-empty">
              No workout plans yet — import a multi-week plan JSON or compose one in Programs.
              <div className="mt-3 row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-hot" onClick={openImport}>
                  Import plan
                </button>
                <button type="button" className="btn btn-soft" onClick={() => setPage('Programs')}>
                  Open Programs
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* —— Import dialog —— */}
      <Modal
        open={importOpen}
        title={importStep === 'preview' ? 'Preview import' : 'Import into library'}
        onClose={closeImport}
        actions={
          importStep === 'preview' ? (
            <>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => {
                  setImportStep('choose');
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Back
              </button>
              <button type="button" className="btn btn-soft" onClick={closeImport}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-hot"
                disabled={!importDraft.ready||importing || !preview || preview.errors.length > 0 || preview.items.length === 0}
                onClick={() => void confirmImport()}
              >
                {importing ? 'Importing…' : 'Accept & import'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-soft" onClick={closeImport}>
              Close
            </button>
          )
        }
      >
        <DraftFeedback draft={importDraft}/>
        <p className="subtle">The normalized preview stays on this device until imported or discarded. Retry uses the same record identifiers.</p>
        {preview&&!importing&&<div className="row"><button className="btn btn-soft" onClick={()=>setImportStep('preview')}>Resume protected preview</button><button className="btn btn-soft" onClick={()=>{if(confirm('Discard this import preview?')){setPreview(null);void importDraft.clear();setImportStep('choose');}}}>Discard preview</button></div>}
        {importStep === 'choose' ? (
          <div className="library-import stack">
            <p className="subtle" style={{ margin: 0 }}>
              Choose what to import, download a JSON template if you need the schema, then select a file. You will
              always see a preview before anything is written.
            </p>

            <div className="library-import-kinds">
              {(
                [
                  {
                    id: 'exercises' as const,
                    title: 'Exercises',
                    desc: 'Flashcards with muscles, equipment, body part, and video tutorial links.',
                  },
                  {
                    id: 'splits' as const,
                    title: 'Workout splits',
                    desc: 'Weekly day layouts (PPL, upper/lower, custom) with planned exercises.',
                  },
                  {
                    id: 'plans' as const,
                    title: 'Workout plans',
                    desc: 'Multi-week programs. Can embed full weeks or reference existing week IDs.',
                  },
                ] as const
              ).map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`library-import-kind ${importKind === k.id ? 'active' : ''}`}
                  onClick={() => setImportKind(k.id)}
                >
                  <b>{k.title}</b>
                  <span className="subtle">{k.desc}</span>
                </button>
              ))}
            </div>

            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-soft" onClick={() => downloadTemplate(importKind)}>
                Download {importKind} template
              </button>
              <label className="btn btn-hot" style={{ cursor: 'pointer' }}>
                Select JSON file
                <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFileSelected} />
              </label>
            </div>
          </div>
        ) : preview ? (
          <div className="library-import stack">
            <div className="library-import-file">
              <span className="pill pill-slate">{preview.kind}</span>
              <b>{preview.fileName}</b>
            </div>

            {preview.errors.length ? (
              <div className="library-import-errors">
                <b>Fix these before import</b>
                <ul>
                  {preview.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="library-import-ok">
                <b>Looks good</b>
                <ul>
                  {preview.summary.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="library-import-preview">
              <span className="page-section-label">Preview</span>
              {preview.kind === 'exercises'
                ? (preview.items as Partial<Exercise>[]).slice(0, 12).map((e, i) => (
                    <div key={`${e.name}-${i}`} className="library-import-row">
                      <div>
                        <b>{e.name}</b>
                        <div className="subtle">
                          {(e.muscles || []).join(', ') || '—'} · {e.equipment || '—'}
                          {e.bodyPart ? ` · ${e.bodyPart}` : ''}
                        </div>
                      </div>
                      {e.tutorialLink ? <span className="library-video-badge">Tutorial link</span> : null}
                    </div>
                  ))
                : null}

              {preview.kind === 'splits'
                ? (preview.items as Partial<Week>[]).slice(0, 8).map((w, i) => (
                    <div key={`${w.name}-${i}`} className="library-import-row">
                      <div>
                        <b>{w.name}</b>
                        <div className="subtle">
                          {(w.days || []).length} days ·{' '}
                          {(w.days || []).reduce((n, d) => n + (d.exercises?.length || 0), 0)} exercises
                        </div>
                      </div>
                    </div>
                  ))
                : null}

              {preview.kind === 'plans'
                ? (
                    preview.items as Array<Partial<Program> & { embeddedWeeks?: Partial<Week>[] }>
                  )
                    .slice(0, 8)
                    .map((p, i) => (
                      <div key={`${p.name}-${i}`} className="library-import-row">
                        <div>
                          <b>{p.name}</b>
                          <div className="subtle">
                            {p.weeks?.length || 0} week slots
                            {p.embeddedWeeks?.length ? ` · ${p.embeddedWeeks.length} embedded` : ''}
                          </div>
                        </div>
                      </div>
                    ))
                : null}

              {preview.items.length > 12 ? (
                <p className="subtle">…and {preview.items.length - 12} more</p>
              ) : null}
            </div>

            <p className="subtle" style={{ margin: 0 }}>
              Accept to write these into your local library. Cancel leaves your data unchanged.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* —— Exercise edit detail —— */}
      <Modal
        open={Boolean(detail && editForm)}
        title="Exercise card"
        onClose={() => {
          setDetail(null);
          
        }}
        actions={
          <>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => detail && setDeleteId(detail.id)}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setDetail(null);
                
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-hot" disabled={!exerciseDraft.ready} onClick={() => void saveDetail()}>
              Save
            </button>
          </>
        }
      >
        {editForm ? (
          <div className="library-edit-form stack"><DraftFeedback draft={exerciseDraft}/>
            <label className="library-field">
              <span>Name</span>
              <input
                className="input"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </label>
            <div className="library-edit-grid">
              <label className="library-field">
                <span>Body part</span>
                <input
                  className="input"
                  list="library-body-parts"
                  value={editForm.bodyPart || ''}
                  onChange={(e) => setEditForm({ ...editForm, bodyPart: e.target.value })}
                  placeholder="Chest"
                />
                <datalist id="library-body-parts">
                  {BODY_PARTS.filter((p) => p !== 'All').map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="library-field">
                <span>Equipment</span>
                <input
                  className="input"
                  value={editForm.equipment || ''}
                  onChange={(e) => setEditForm({ ...editForm, equipment: e.target.value })}
                  placeholder="Barbell"
                />
              </label>
              <label className="library-field">
                <span>Workout split tag</span>
                <input
                  className="input"
                  value={editForm.workoutSplit || ''}
                  onChange={(e) => setEditForm({ ...editForm, workoutSplit: e.target.value })}
                  placeholder="Push / Pull / Legs"
                />
              </label>
              <label className="library-field">
                <span>Movement pattern</span>
                <input
                  className="input"
                  value={editForm.movementPattern || ''}
                  onChange={(e) => setEditForm({ ...editForm, movementPattern: e.target.value })}
                  placeholder="horizontal_press"
                />
              </label>
            </div>
            <label className="library-field">
              <span>Muscles (comma-separated)</span>
              <input
                className="input"
                value={(editForm.muscles || []).join(', ')}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    muscles: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="library-field">
              <span>Video tutorial link</span>
              <input
                className="input"
                type="url"
                value={editForm.tutorialLink || ''}
                onChange={(e) => setEditForm({ ...editForm, tutorialLink: e.target.value })}
                placeholder="https://youtube.com/watch?v=…"
              />
            </label>
            {editForm.tutorialLink ? (
              <a href={editForm.tutorialLink} target="_blank" rel="noreferrer" className="library-video-preview-link">
                Open tutorial ↗
              </a>
            ) : null}
            <label className="library-field">
              <span>Default cue</span>
              <textarea
                className="input"
                rows={2}
                value={editForm.defaultCue || ''}
                onChange={(e) => setEditForm({ ...editForm, defaultCue: e.target.value })}
              />
            </label>
            <div className="library-edit-grid">
              <label className="library-field">
                <span>Rest (sec)</span>
                <input
                  className="input"
                  type="number"
                  value={editForm.defaultRestSec ?? ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      defaultRestSec: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="library-field">
                <span>Tempo</span>
                <input
                  className="input"
                  value={editForm.defaultTempo || ''}
                  onChange={(e) => setEditForm({ ...editForm, defaultTempo: e.target.value })}
                  placeholder="2-0-1-0"
                />
              </label>
              <label className="library-field">
                <span>Family ID</span>
                <input
                  className="input"
                  value={editForm.familyId || ''}
                  onChange={(e) => setEditForm({ ...editForm, familyId: e.target.value })}
                  placeholder="bench"
                />
              </label>
            </div>
            <label className="library-field">
              <span>Substitutions (comma-separated)</span>
              <input
                className="input"
                value={(editForm.substitutions || []).join(', ')}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    substitutions: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteId)}
        title="Delete exercise?"
        onClose={() => setDeleteId(null)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-hot" onClick={() => void confirmDelete()}>
              Delete
            </button>
          </>
        }
      >
        <p className="subtle" style={{ margin: 0 }}>
          This removes the exercise from your library. Past session logs are kept.
        </p>
      </Modal>

      {inspectExercise ? (
        <ExerciseDetailModal
          exerciseName={inspectExercise.name}
          exerciseId={inspectExercise.id}
          onClose={() => setInspectExercise(null)}
        />
      ) : null}
    </div>
  );
}
