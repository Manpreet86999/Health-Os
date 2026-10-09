import { Router } from 'express';
import * as repo from '../db/repository.js';
import { id } from '../lib/ids.js';
import type { Session } from '../../shared/types.js';
import { requestCatalog, resolveWeekExercises } from '../services/exercise-catalog.js';

/** Week lifecycle and plan-editing endpoints. Mounted after API authentication. */
export const programmingRouter = Router();

/** Accept a Health OS week as well as the common wrappers used by exported plans. */
function importableWeek(value: unknown): Record<string, unknown> {
  let source: any = value;
  if (Array.isArray(source)) source = source.length === 1 ? source[0] : null;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    if (source.week && typeof source.week === 'object') source = source.week;
    else if (Array.isArray(source.weeks) && source.weeks.length === 1) source = source.weeks[0];
    else if (source.plan && typeof source.plan === 'object') source = source.plan;
    else if (source.data && typeof source.data === 'object') source = source.data;
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Choose a JSON file containing one training week.');

  const rawDays = Array.isArray(source.days) ? source.days : source.days && typeof source.days === 'object' ? Object.entries(source.days).map(([key, day]) => ({ key, ...(day as object) })) : Array.isArray(source.schedule) ? source.schedule : [];
  if (!rawDays.length) throw new Error('The imported plan has no days. Expected a "days" array or an exported single-week plan.');
  const days = rawDays.map((raw: any, index: number) => {
    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : Array.isArray(raw.workout) ? raw.workout : Array.isArray(raw.movements) ? raw.movements : [];
    const muscles = Array.isArray(raw.muscles) ? raw.muscles : typeof raw.muscles === 'string' ? raw.muscles.split(',').map((item: string) => item.trim()).filter(Boolean) : [];
    return {
      ...raw,
      key: raw.key || raw.dayKey || raw.day || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
      type: raw.type || raw.workoutType || raw.category || '',
      title: raw.title || raw.name || raw.dayName || '',
      subtitle: raw.subtitle || raw.description || '',
      muscles,
      exercises: rawExercises.map((exercise: any) => ({
        ...exercise,
        name: exercise.name || exercise.exerciseName || exercise.exercise || exercise.title || 'New Exercise',
        target: exercise.target || exercise.muscle || exercise.primaryMuscle || 'Other',
        vol: exercise.vol || exercise.volume || (exercise.sets && exercise.reps ? `${exercise.sets} x ${exercise.reps}` : '3 x 8-12'),
        cue: exercise.cue || exercise.notes || exercise.instructions || '',
      })),
    };
  });
  return { ...source, name: source.name || source.weekName || source.title || source.planName || 'Imported Week', days };
}

programmingRouter.get('/weeks', (_req, res) => {
  const data = repo.loadAppDb();
  res.json({ activeWeekId: data.meta.activeWeekId, weeks: data.weeks });
});

programmingRouter.post('/weeks/import', async (req, res) => {
  try {
    const imported = importableWeek(req.body);
    const input = await resolveWeekExercises(imported,requestCatalog(req));
    const week = repo.upsertWeek({ ...input, id: String(imported.id || id('week')) });
    repo.logEvent('week.import', { id: week.id });
    res.json(week);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed' });
  }
});

programmingRouter.post('/weeks/:weekId/activate', (req, res) => {
  const week = repo.getWeek(req.params.weekId);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  if (repo.getTrainingConfig().preplannedWeekMode === false && week.mode !== 'flexible') {
    return res.status(409).json({ error: 'Preplanned Week is off. Only the current flexible training week can be active.' });
  }
  repo.setActiveWeekId(week.id);
  res.json({ ok: true });
});

programmingRouter.post('/weeks/:weekId/duplicate', (req, res) => {
  const week = repo.getWeek(req.params.weekId);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  const copy = JSON.parse(JSON.stringify(week));
  copy.id = id('week');
  copy.name += ' Copy';
  copy.active = false;
  res.json(repo.upsertWeek(copy));
});

programmingRouter.put('/weeks/:weekId', async (req, res) => {
  try {
    const existing = repo.getWeek(req.params.weekId);
    if (!existing) return res.status(404).json({ error: 'Week not found.' });
    const merged=repo.mergeWeekUpdate(existing,req.body || {});
    res.json(repo.upsertWeek(req.body?.days ? await resolveWeekExercises(merged,requestCatalog(req)) : merged));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Update failed' });
  }
});

programmingRouter.delete('/weeks/:weekId', (req, res) => {
  try {
    repo.deleteWeek(req.params.weekId);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Delete failed' });
  }
});

programmingRouter.post('/weeks/:weekId/complete', (req, res) => {
  const data = repo.loadAppDb();
  const week = data.weeks.find((item) => item.id === req.params.weekId);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  const completedDays = new Set(
    data.sessions.filter((session) => session.weekId === week.id && (session.status === 'finished' || session.status === 'completed')).map((session) => session.dayKey),
  );
  const profile = repo.getProfile();
  const createdAt = new Date().toISOString();
  const date = createdAt.slice(0, 10);
  for (const day of week.days.filter((item) => item.type !== 'rest')) {
    if (completedDays.has(day.key)) continue;
    const session: Session = {
      id: id('session'), status: 'finished', createdAt, weekId: week.id, weekName: week.name || '',
      weekNumber: week.weekNumber || '', dayKey: day.key, dayTitle: day.title || '', date,
      name: String(req.body?.name || profile.displayName), sleep: '', soreness: '', logs: [], completedByLibrary: true,
    };
    repo.saveSession(session);
  }
  res.json({ ok: true });
});
