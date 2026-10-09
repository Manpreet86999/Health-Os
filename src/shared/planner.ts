import type { PlannedExercise, Week } from './types';

function cloneExercises(exercises: PlannedExercise[]): PlannedExercise[] {
  return exercises.map((exercise) => ({ ...exercise }));
}

export function swapWeekDayExercises(
  week: Week,
  firstDayKey: string,
  secondDayKey: string,
  firstDayExercises: PlannedExercise[],
): Week {
  const firstDay = week.days.find((day) => day.key === firstDayKey);
  const secondDay = week.days.find((day) => day.key === secondDayKey);
  if (!firstDay || !secondDay || firstDayKey === secondDayKey) {
    throw new Error('Choose two different days in the active week.');
  }

  return {
    ...week,
    days: week.days.map((day) => {
      if (day.key === firstDayKey) return { ...day, exercises: cloneExercises(secondDay.exercises) };
      if (day.key === secondDayKey) return { ...day, exercises: cloneExercises(firstDayExercises) };
      return day;
    }),
  };
}
