import type {
  AppDb,
  AppSettings,
  BodyDeltas,
  GoalProgress,
  Metrics,
  PersonalRecord,
  E1rmPoint,
  WeeklyVolumePoint,
  PeriodCompare,
  DeloadSuggestion,
  TrainingConfig,
} from './types.js';
import { readinessBand } from './readiness.js';
import { detectPlateaus, weeklySetsByMuscle } from './progression.js';
import {
  bestSetE1rm,
  buildProgressionRules,
  defaultTrainingConfig,
  epley1rm,
  isFinishedSession,
  isWarmupSet,
  logTonnage,
  sessionDurationMinutes,
  workSets,
} from './training.js';

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateKey(d);
}

function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return localDateKey(dt);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bodyDeltasFrom(data: AppDb): BodyDeltas {
  const sorted = [...(data.measurements || [])].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')),
  );
  if (!sorted.length) return {};
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  const cutoff = daysAgoKey(30);
  const old30 = [...sorted].reverse().find((m) => String(m.date || '') <= cutoff) || sorted[0];

  function pack(field: 'weight' | 'bodyFat' | 'waist') {
    const L = num(latest[field]);
    if (!L) return undefined;
    const P = prev ? num(prev[field]) : undefined;
    const O = old30 ? num(old30[field]) : undefined;
    return {
      latest: L,
      previous: P && P > 0 ? P : undefined,
      delta30d: O && O > 0 ? Math.round((L - O) * 10) / 10 : undefined,
    };
  }

  return { weight: pack('weight'), bodyFat: pack('bodyFat'), waist: pack('waist') };
}

function goalProgressFrom(data: AppDb): GoalProgress[] {
  const checkIns = data.goalCheckIns || [];
  return (data.targets || []).map((t) => {
    const target = num(t.target);
    const related = checkIns
      .filter((c) => c.goalId === t.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
    const latest = related[0];
    const current = num(latest?.value ?? t.current);
    const lowerIsBetter=String(t.type||'').toLowerCase().includes('loss')||String(t.type||'').toLowerCase()==='body-fat';
    let percent=0;
    if(target>0) percent=lowerIsBetter
      ? (current>0&&current<=target?100:current>target?Math.min(99,Math.round(target/current*100)):0)
      : Math.min(100,Math.max(0,Math.round(current/target*100)));
    let status = latest?'active':t.status || 'active';
    if (percent >= 100) status = 'completed';
    else if (t.deadline && t.deadline < localDateKey(new Date()) && percent < 100) status = 'overdue';

    return {
      id: t.id,
      name: t.name,
      type: t.type || '',
      current,
      target,
      unit: t.unit || '',
      percent,
      status,
      deadline: t.deadline,
      linkedExercise: t.linkedExercise,
      latestCheckIn: latest
        ? { date: latest.date, value: num(latest.value), note: latest.note }
        : undefined,
      checkInCount: related.length,
    };
  });
}

function periodStats(
  data: AppDb,
  from: string,
  to: string,
  label: string,
  prDates: Set<string>,
): PeriodCompare {
  const sessions = data.sessions.filter(
    (s) => isFinishedSession(s) && s.date >= from && s.date <= to,
  );
  let tonnage = 0;
  let sets = 0;
  for (const s of sessions) {
    for (const log of s.logs || []) {
      if (log.status === 'skipped') continue;
      tonnage += logTonnage(log, true);
      sets += workSets(log.sets).filter((x) => Number(x.w) || Number(x.r)).length;
    }
  }
  const ready = (data.readiness || []).filter((r) => r.date >= from && r.date <= to);
  const avgReadiness = ready.length
    ? Math.round(ready.reduce((a, r) => a + (r.score || 0), 0) / ready.length)
    : null;
  let prs = 0;
  for (const d of prDates) {
    if (d >= from && d <= to) prs++;
  }
  return { label, sessions: sessions.length, tonnage, sets, avgReadiness, prs };
}

function deloadSuggestion(
  data: AppDb,
  plateaus: Metrics['plateaus'],
  weekSets: number,
): DeloadSuggestion {
  const last7 = daysAgoKey(7);
  const ready = (data.readiness || []).filter((r) => (r.date || '') >= last7);
  const avgR = ready.length
    ? ready.reduce((a, r) => a + (r.score || 0), 0) / ready.length
    : 70;
  const recentPain = (data.painLogs || []).some((p) => {
    if ((p.date || '') < last7) return false;
    return Boolean((p as { affectsTraining?: boolean }).affectsTraining);
  });
  const pain = ready.some((r) => r.painFlag) || recentPain;
  const plateauHeavy = plateaus.length >= 2;
  const highVolume = weekSets > 50;
  const lowReady = avgR < 55;

  const reasons: string[] = [];
  if (lowReady) reasons.push('Avg readiness ' + Math.round(avgR) + ' (low)');
  if (pain) reasons.push('Pain / injury flags this week');
  if (plateauHeavy) reasons.push(plateaus.length + ' lifts plateaued');
  if (highVolume) reasons.push('High weekly set count (~' + weekSets + ')');

  const recommended = reasons.length >= 2 || (lowReady && highVolume) || pain;
  return {
    recommended,
    reason: recommended
      ? reasons.join(' | ')
      : 'No strong deload signal - keep progressing or auto-regulate by readiness.',
    volumeMultiplier: recommended ? 0.6 : 1,
    actions: recommended
      ? [
          'Cut sets ~40% for 1 week',
          'Keep intensity moderate (RIR 3-4)',
          'Use Library / Programs deload builder or Planner progression rules',
          'Prioritize sleep and pain regions',
        ]
      : ['Continue planned progression', 'Watch readiness and PR board'],
  };
}
export function computeMetrics(data: AppDb, appSettings: AppSettings = {} as AppSettings): Metrics {
  const config: TrainingConfig = data.trainingConfig || defaultTrainingConfig();
  const sessions = data.sessions
    .filter(isFinishedSession)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  let tonnage = 0;
  let completed = 0;
  let skipped = 0;
  let totalDuration = 0;
  const exerciseMap: Record<string, { name: string; sessions: number; tonnage: number; best1rm: number }> =
    {};
  const muscleMap: Record<string, number> = {};
  const days: Record<string, boolean> = {};
  const trainingCalendar: Record<string, number> = {};
  const weeklyMap: Record<string, WeeklyVolumePoint> = {};
  const bestE1rm: Record<string, number> = {};
  const bestWeight: Record<string, number> = {};
  const bestRepMax: Record<string, { reps: number; weight: number; date: string }> = {};
  const allTimePr: Record<string, PersonalRecord> = {};
  const recentPrs: PersonalRecord[] = [];
  const e1rmSeriesRaw: Record<string, E1rmPoint[]> = {};
  const cutoff30 = daysAgoKey(30);
  const prDates = new Set<string>();
  const sideLoad: Record<string, { L: number; R: number }> = {};

  for (const s of sessions) {
    if (s.date) {
      days[s.date] = true;
      trainingCalendar[s.date] = (trainingCalendar[s.date] || 0) + 1;
    }
    totalDuration += sessionDurationMinutes(s);
    const wStart = s.date ? weekStartKey(s.date) : '';
    if (wStart && !weeklyMap[wStart]) {
      weeklyMap[wStart] = { weekStart: wStart, tonnage: 0, sets: 0, sessions: 0 };
    }
    if (wStart) weeklyMap[wStart].sessions += 1;

    for (const log of s.logs || []) {
      if (log.status === 'skipped') {
        skipped++;
        continue;
      }
      completed++;
      const lift = logTonnage(log, true);
      tonnage += lift;
      muscleMap[log.target || 'Other'] = (muscleMap[log.target || 'Other'] || 0) + lift;

      let sessionBestE1 = 0;
      let sessionBestW = 0;
      let sessionBestR = 0;
      let setCount = 0;

      const sets = workSets(log.sets);
      for (const set of log.sets || []) {
        if (isWarmupSet(set)) continue;
        const side = String(set.side || 'both');
        if (side === 'L' || side === 'R') {
          const key = log.name;
          if (!sideLoad[key]) sideLoad[key] = { L: 0, R: 0 };
          sideLoad[key][side as 'L' | 'R'] += setTonnageSafe(set);
        }
      }

      for (const set of sets) {
        const w = Number(set.w) || 0;
        const r = Number(set.r) || 0;
        if (w || r) setCount++;
        const e1 = epley1rm(w, r);
        if (e1 > sessionBestE1) {
          sessionBestE1 = e1;
          sessionBestW = w;
          sessionBestR = r;
        }
        // Same-rep max
        if (r > 0 && w > 0) {
          const rmKey = `${log.name}::${r}`;
          const prev = bestRepMax[rmKey];
          if (!prev || w > prev.weight) {
            bestRepMax[rmKey] = { reps: r, weight: w, date: s.date };
          }
        }
        if (w > (bestWeight[log.name] || 0)) {
          bestWeight[log.name] = w;
          const pr: PersonalRecord = {
            exercise: log.name,
            bestWeight: w,
            bestReps: r,
            bestE1rm: e1,
            date: s.date,
            sessionId: s.id,
            workSetsOnly: true,
            familyId: log.familyId,
          };
          if (s.date && s.date >= cutoff30) {
            recentPrs.push(pr);
            prDates.add(s.date);
          }
        }
        if (e1 > (bestE1rm[log.name] || 0)) {
          bestE1rm[log.name] = e1;
          const pr: PersonalRecord = {
            exercise: log.name,
            bestWeight: w,
            bestReps: r,
            bestE1rm: e1,
            date: s.date,
            sessionId: s.id,
            workSetsOnly: true,
            familyId: log.familyId,
          };
          allTimePr[log.name] = pr;
          if (s.date && s.date >= cutoff30) {
            recentPrs.push(pr);
            prDates.add(s.date);
          }
        }
      }

      if (wStart) {
        weeklyMap[wStart].tonnage += lift;
        weeklyMap[wStart].sets += setCount || 1;
      }

      if (sessionBestE1 > 0) {
        if (!e1rmSeriesRaw[log.name]) e1rmSeriesRaw[log.name] = [];
        e1rmSeriesRaw[log.name].push({
          date: s.date,
          e1rm: Math.round(sessionBestE1 * 10) / 10,
          weight: sessionBestW,
          reps: sessionBestR,
        });
      }

      const ex = exerciseMap[log.name] || { name: log.name, sessions: 0, tonnage: 0, best1rm: 0 };
      ex.sessions++;
      ex.tonnage += lift;
      ex.best1rm = Math.max(ex.best1rm, sessionBestE1, bestE1rm[log.name] || 0, bestSetE1rm(log));
      exerciseMap[log.name] = ex;
    }
  }

  let streak = 0;
  const today = new Date();
  const start = appSettings.streakStartDate || '';
  for (let i = 0; i < 730; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateKey(d);
    if (start && key < start) break;
    if (days[key]) streak++;
    else if (i > 0) break;
  }

  const readiness = (
    data.readiness?.length
      ? data.readiness
      : sessions.map((s) => {
          const score = Math.max(
            0,
            Math.min(
              100,
              Math.round(((Number(s.sleep) || 6) / 8) * 50 + (10 - (Number(s.soreness) || 5)) * 5),
            ),
          );
          return { date: s.date, score, band: readinessBand(score).label };
        })
  ).map((r) => ({
    date: r.date,
    score: r.score,
    band: r.band || readinessBand(r.score).label,
  }));

  const leaders = Object.values(exerciseMap)
    .sort((a, b) => b.tonnage - a.tonnage)
    .slice(0, 20);

  const topNames = new Set(leaders.slice(0, 8).map((e) => e.name));
  const e1rmSeries: Record<string, E1rmPoint[]> = {};
  for (const name of topNames) {
    if (e1rmSeriesRaw[name]?.length) e1rmSeries[name] = e1rmSeriesRaw[name];
  }

  const personalRecords = Object.values(allTimePr).sort((a, b) => b.bestE1rm - a.bestE1rm);
  const recentKey = new Set<string>();
  const recentPrsDedup: PersonalRecord[] = [];
  for (const pr of [...recentPrs].reverse()) {
    const k = `${pr.exercise}|${pr.date}|${pr.bestE1rm}`;
    if (recentKey.has(k)) continue;
    recentKey.add(k);
    recentPrsDedup.push(pr);
  }
  recentPrsDedup.reverse();

  const weeklyVolume = Object.values(weeklyMap)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-12);

  const plateaus = detectPlateaus(data);
  const rawLandmarks = weeklySetsByMuscle(data);
  const volumeLandmarks = rawLandmarks.map((v) => {
    const cfg =
      config.volumeLandmarks.find(
        (c) => c.muscle.toLowerCase() === v.muscle.toLowerCase(),
      ) ||
      config.volumeLandmarks.find((c) => c.muscle === 'Other') || {
        muscle: v.muscle,
        mev: 6,
        mav: 12,
        mrv: 20,
      };
    let status = 'Productive range';
    if (v.weeklySets < cfg.mev) status = `Low (below MEV ${cfg.mev})`;
    else if (v.weeklySets > cfg.mrv) status = `High (over MRV ${cfg.mrv})`;
    else if (v.weeklySets >= cfg.mav) status = `High productive (MAV ${cfg.mav}+)`;
    return {
      muscle: v.muscle,
      weeklySets: v.weeklySets,
      status,
      mev: cfg.mev,
      mav: cfg.mav,
      mrv: cfg.mrv,
    };
  });

  const thisWeekStart = weekStartKey(localDateKey(new Date()));
  const prevWeekDate = new Date();
  prevWeekDate.setDate(prevWeekDate.getDate() - 7);
  const prevWeekStart = weekStartKey(localDateKey(prevWeekDate));
  const thisWeekEnd = localDateKey(new Date());
  const prevWeekEnd = (() => {
    const d = new Date(thisWeekStart + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return localDateKey(d);
  })();

  const weekCompare = {
    current: periodStats(data, thisWeekStart, thisWeekEnd, 'This week', prDates),
    previous: periodStats(data, prevWeekStart, prevWeekEnd, 'Last week', prDates),
  };

  const weekSetTotal = volumeLandmarks.reduce((a, v) => a + v.weeklySets, 0);
  const deload = deloadSuggestion(data, plateaus, weekSetTotal);
  const progressionRules = buildProgressionRules(data);

  const repMaxes = Object.entries(bestRepMax)
    .map(([k, v]) => {
      const exercise = k.split('::')[0];
      return { exercise, reps: v.reps, weight: v.weight, date: v.date };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);

  const imbalanceFlags = Object.entries(sideLoad)
    .map(([exercise, sides]) => {
      const max = Math.max(sides.L, sides.R, 1);
      const min = Math.min(sides.L || 0, sides.R || 0);
      const ratio = min / max;
      if (sides.L > 0 && sides.R > 0 && ratio < 0.85) {
        return {
          exercise,
          left: Math.round(sides.L),
          right: Math.round(sides.R),
          note: `${exercise}: L/R volume imbalance (${Math.round(ratio * 100)}% of stronger side)`,
        };
      }
      return null;
    })
    .filter(Boolean) as Metrics['imbalanceFlags'];

  const sessionsWithDuration = sessions.filter((s) => sessionDurationMinutes(s) > 0);
  const avgSessionMinutes = sessionsWithDuration.length
    ? Math.round(totalDuration / sessionsWithDuration.length)
    : 0;

  return {
    totals: {
      sessions: sessions.length,
      tonnage,
      completed,
      skipped,
      completion: completed + skipped ? Math.round((completed / (completed + skipped)) * 100) : 0,
      streak,
      totalDurationMinutes: totalDuration,
      avgSessionMinutes: Number.isFinite(avgSessionMinutes) ? avgSessionMinutes : 0,
    },
    exerciseLeaders: leaders.map((e) => ({
      ...e,
      best1rm: Math.round(e.best1rm * 10) / 10,
    })),
    muscleVolume: muscleMap,
    readiness,
    measurementTrend: data.measurements,
    targetProgress: data.targets,
    dates: Object.keys(days).sort(),
    volumeLandmarks,
    plateaus,
    personalRecords: personalRecords.map((p) => ({
      ...p,
      bestE1rm: Math.round(p.bestE1rm * 10) / 10,
    })),
    recentPrs: recentPrsDedup.map((p) => ({
      ...p,
      bestE1rm: Math.round(p.bestE1rm * 10) / 10,
    })),
    e1rmSeries,
    trainingCalendar,
    weeklyVolume,
    goalProgress: goalProgressFrom(data),
    bodyDeltas: bodyDeltasFrom(data),
    weekCompare,
    deload,
    progressionRules,
    repMaxes,
    imbalanceFlags,
  };
}

function setTonnageSafe(set: { w?: number | string; r?: number | string }): number {
  return (Number(set.w) || 0) * (Number(set.r) || 0);
}
