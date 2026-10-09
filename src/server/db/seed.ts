import type { Week } from '../types.js';

export function starterWeek(): Week {
  return {
    id: 'week-1',
    name: 'Week 1 - Shape & Strength',
    weekNumber: 1,
    startDate: '',
    notes: 'Health OS starter plan: glutes, thighs, shoulders, core, fat burn, and recovery.',
    active: true,
    days: [
      {
        key: 'Mon',
        type: 'lower',
        title: 'Lower Body',
        subtitle: 'Glutes & Thighs',
        muscles: ['Glutes', 'Quads', 'Thighs'],
        exercises: [
          { name: 'Bodyweight Squats', target: 'Lower Body', vol: '2 x 20', cue: 'Warm-up. Smooth reps, full foot pressure.' },
          { name: 'Dumbbell Sumo Squats', target: 'Glutes', vol: '3 x 12-15', cue: 'Wide stance, knees track out, squeeze glutes at the top.' },
          { name: 'Dumbbell Walking Lunges', target: 'Thighs', vol: '3 x 12 each leg', cue: 'Controlled steps, tall chest, push through front heel.' },
          { name: 'Glute Bridges', target: 'Glutes', vol: '3 x 20', cue: 'Bodyweight. Pause and squeeze at the top.' },
        ],
      },
      {
        key: 'Tue',
        type: 'upper',
        title: 'Upper Body',
        subtitle: 'Shoulders & Back',
        muscles: ['Shoulders', 'Back', 'Chest'],
        exercises: [
          { name: 'Dumbbell Overhead Press', target: 'Shoulders', vol: '3 x 12-15', cue: 'Brace core and press without leaning back.' },
          { name: 'Dumbbell Side Raises', target: 'Shoulders', vol: '3 x 12-15', cue: 'Soft elbows, raise to shoulder height.' },
          { name: 'Dumbbell Bent-Over Rows', target: 'Back', vol: '3 x 12-15', cue: 'Flat back, pull elbows toward hips.' },
          { name: 'Push-ups', target: 'Chest', vol: '3 x failure', cue: 'Use knees if needed. Stop with clean form.' },
        ],
      },
      {
        key: 'Wed',
        type: 'core',
        title: 'Core & Cardio',
        subtitle: 'Tiny Waist Focus',
        muscles: ['Core', 'Abs', 'Cardio'],
        exercises: [
          { name: 'Jumping Jacks', target: 'Cardio', vol: '3 x 1 min', cue: 'Keep a steady pace and breathe.' },
          { name: 'Planks', target: 'Core', vol: '3 x 60 sec', cue: 'Ribs down, glutes tight, no sagging.' },
          { name: 'Laying Leg Raises', target: 'Lower Abs', vol: '3 x 15-20', cue: 'Control the lower. Keep lower back stable.' },
          { name: 'Side Plank Twists', target: 'Obliques', vol: '3 x 15 each side', cue: 'Rotate under control, hips lifted.' },
        ],
      },
      {
        key: 'Thu',
        type: 'lower',
        title: 'Lower Body',
        subtitle: 'Hamstrings & Booty',
        muscles: ['Hamstrings', 'Glutes'],
        exercises: [
          { name: 'Dumbbell Stiff-Leg Deadlifts', target: 'Hamstrings', vol: '3 x 12-15', cue: 'Hinge at hips, soft knees, feel hamstring stretch.' },
          { name: 'Dumbbell Step-Ups', target: 'Glutes', vol: '3 x 10 each leg', cue: 'Use a sturdy chair. Drive through the working leg.' },
          { name: 'Donkey Kicks', target: 'Glutes', vol: '3 x 20 each leg', cue: 'Bodyweight. Keep hips square and squeeze.' },
        ],
      },
      {
        key: 'Fri',
        type: 'hiit',
        title: 'Full Body Fat Burn',
        subtitle: 'HIIT Circuit',
        muscles: ['Full Body', 'Cardio', 'Core'],
        exercises: [
          { name: 'Half Burpees', target: 'Full Body', vol: '3-4 rounds x 1 min', cue: 'Circuit style. Rest 1 minute between rounds.' },
          { name: 'Mountain Climbers', target: 'Core', vol: '3-4 rounds x 1 min', cue: 'Keep hips low and move quickly with control.' },
          { name: 'Chair Squats', target: 'Legs', vol: '3-4 rounds x 1 min', cue: 'Tap chair lightly and stand tall.' },
          { name: 'Bicycle Crunches', target: 'Abs', vol: '3-4 rounds x 1 min', cue: 'Rotate from ribs, not just elbows.' },
        ],
      },
      {
        key: 'Sat',
        type: 'core',
        title: 'Active Fat Burn & Abs',
        subtitle: 'Abs + Walk/Jog',
        muscles: ['Abs', 'Cardio'],
        exercises: [
          { name: 'Russian Twists', target: 'Obliques', vol: '3 x 20', cue: 'Hold a dumbbell if comfortable. Rotate under control.' },
          { name: 'Rope/Towel Crunches', target: 'Abs', vol: '3 x 20', cue: 'Use a towel if no rope. Crunch ribs toward hips.' },
          { name: 'Brisk Walk or Jogging', target: 'Cardio', vol: '30 min', cue: 'Outside or in place. Keep it sustainable.' },
        ],
      },
      {
        key: 'Sun',
        type: 'rest',
        title: 'Rest & Recover',
        subtitle: 'Recovery Day',
        muscles: ['Recovery'],
        exercises: [
          { name: 'Rest & Recover', target: 'Recovery', vol: 'All day', cue: 'Prioritize sleep, hydration, light mobility, and easy walking.' },
        ],
      },
    ],
  };
}

function planned(name: string, target: string, vol: string) {
  return { name, target, vol, cue: 'Use a controlled range of motion and stop before form breaks.' };
}

function trainingDay(key: string, title: string, type: string, muscles: string[], exercises: Array<[string, string, string]>) {
  return { key, title, type, subtitle: muscles.join(' · '), muscles, exercises: exercises.map(([name, target, vol]) => planned(name, target, vol)) };
}

/** Built-in split library. Existing weeks are never changed; missing built-ins are inserted by migration. */
export function defaultWorkoutSplits(): Week[] {
  const day = trainingDay;
  const push = (key = 'Mon') => day(key, 'Push', 'push', ['Chest', 'Shoulders', 'Triceps'], [['Bench Press','Chest','4 x 6-8'], ['Overhead Press','Shoulders','3 x 8-10'], ['Lateral Raise','Shoulders','3 x 12-15'], ['Tricep Pushdown','Triceps','3 x 10-15']]);
  const pull = (key = 'Tue') => day(key, 'Pull', 'pull', ['Back', 'Biceps'], [['Pull-up','Back','3 x 6-10'], ['Barbell Row','Back','4 x 6-8'], ['Lat Pulldown','Back','3 x 8-12'], ['Dumbbell Curl','Biceps','3 x 10-12']]);
  const legs = (key = 'Wed') => day(key, 'Legs', 'legs', ['Quads', 'Hamstrings', 'Glutes'], [['Back Squat','Quads','4 x 5-8'], ['Romanian Deadlift','Hamstrings','3 x 8-10'], ['Walking Lunge','Glutes','3 x 10/leg'], ['Calf Raise','Calves','3 x 12-15']]);
  const upper = (key = 'Mon') => day(key, 'Upper', 'upper', ['Chest', 'Back', 'Shoulders', 'Arms'], [['Dumbbell Bench Press','Chest','3 x 8-12'], ['Seated Cable Row','Back','3 x 8-12'], ['Dumbbell Shoulder Press','Shoulders','3 x 8-12'], ['Hammer Curl','Biceps','2 x 12-15']]);
  const lower = (key = 'Tue') => day(key, 'Lower', 'lower', ['Quads', 'Hamstrings', 'Glutes'], [['Leg Press','Quads','4 x 8-12'], ['Leg Curl','Hamstrings','3 x 10-15'], ['Hip Thrust','Glutes','3 x 8-12'], ['Calf Raise','Calves','3 x 12-15']]);
  const full = (key = 'Mon') => day(key, 'Full Body', 'full', ['Full body'], [['Goblet Squat','Legs','3 x 10-12'], ['Push-up','Chest','3 x 8-15'], ['Dumbbell Row','Back','3 x 10-12'], ['Plank','Core','3 x 45 sec']]);
  const core = (key = 'Wed') => day(key, 'Core + Conditioning', 'core', ['Core', 'Cardio'], [['Plank','Core','3 x 45 sec'], ['Dead Bug','Core','3 x 12'], ['Mountain Climber','Cardio','4 x 30 sec'], ['Jumping Jack','Cardio','4 x 45 sec']]);
  const make = (id: string, name: string, notes: string, days: Week['days']): Week => ({ id, name, weekNumber: '', startDate: '', notes, active: false, days });
  return [
    starterWeek(),
    make('builtin-v240-split-ppl-3', 'Push / Pull / Legs — 3 Day', 'Classic three-day strength and hypertrophy rotation.', [push(), pull(), legs()]),
    make('builtin-v240-split-ppl-6', 'Push / Pull / Legs — 6 Day', 'Higher-frequency PPL with two rotations.', [push('Mon'), pull('Tue'), legs('Wed'), push('Thu'), pull('Fri'), legs('Sat')]),
    make('builtin-v240-split-upper-lower-4', 'Upper / Lower — 4 Day', 'Balanced four-day upper/lower split.', [upper('Mon'), lower('Tue'), upper('Thu'), lower('Fri')]),
    make('builtin-v240-split-upper-lower-3', 'Upper / Lower — 3 Day', 'Alternating upper/lower for a three-day schedule.', [upper('Mon'), lower('Wed'), upper('Fri')]),
    make('builtin-v240-split-full-3', 'Full Body — 3 Day', 'Simple full-body training on nonconsecutive days.', [full('Mon'), full('Wed'), full('Fri')]),
    make('builtin-v240-split-full-2', 'Full Body — 2 Day', 'Minimum-effective-dose full-body plan.', [full('Tue'), full('Fri')]),
    make('builtin-v240-split-bro-5', 'Body Part — 5 Day', 'One primary body region per session.', [day('Mon','Chest','push',['Chest'],[['Bench Press','Chest','4 x 6-8'],['Cable Chest Fly','Chest','3 x 12-15']]), day('Tue','Back','pull',['Back'],[['Barbell Row','Back','4 x 6-8'],['Lat Pulldown','Back','3 x 10-12']]), day('Wed','Legs','legs',['Legs'],[['Back Squat','Quads','4 x 6-8'],['Leg Curl','Hamstrings','3 x 10-15']]), day('Thu','Shoulders','push',['Shoulders'],[['Overhead Press','Shoulders','4 x 6-10'],['Lateral Raise','Shoulders','4 x 12-15']]), day('Fri','Arms','arms',['Biceps','Triceps'],[['Dumbbell Curl','Biceps','4 x 10-12'],['Tricep Pushdown','Triceps','4 x 10-12']])]),
    make('builtin-v240-split-powerbuilding-4', 'Powerbuilding — 4 Day', 'Heavy compounds plus hypertrophy accessories.', [upper('Mon'), lower('Tue'), push('Thu'), legs('Fri')]),
    make('builtin-v240-split-strength-3', 'Strength — 3 Day', 'Compound-focused full body strength progression.', [full('Mon'), full('Wed'), full('Fri')]),
    make('builtin-v240-split-hypertrophy-5', 'Hypertrophy — 5 Day', 'Volume-driven physique development.', [push('Mon'), pull('Tue'), legs('Wed'), upper('Fri'), lower('Sat')]),
    make('builtin-v240-split-beginner-3', 'Beginner Foundation — 3 Day', 'Approachable full-body plan with reps, load, and timed core work.', [full('Mon'), full('Wed'), full('Fri')]),
    make('builtin-v240-split-home-4', 'Home Bodyweight — 4 Day', 'Equipment-light strength and conditioning.', [full('Mon'), core('Tue'), full('Thu'), core('Sat')]),
    make('builtin-v240-split-glutes-4', 'Glutes + Lower Focus — 4 Day', 'Extra lower-body frequency while retaining upper work.', [lower('Mon'), upper('Tue'), legs('Thu'), lower('Sat')]),
    make('builtin-v240-split-athletic-4', 'Athletic Conditioning — 4 Day', 'Strength sessions paired with time-based conditioning.', [full('Mon'), core('Tue'), upper('Thu'), core('Sat')]),
    make('builtin-v240-split-cut-4', 'Fat-Loss Strength — 4 Day', 'Strength retention with concise conditioning finishers.', [upper('Mon'), lower('Tue'), full('Thu'), core('Sat')]),
    make('builtin-v240-split-recovery-3', 'Recovery + Mobility — 3 Day', 'Low-impact return-to-training split.', [day('Mon','Mobility + Core','recovery',['Core','Recovery'],[['Dead Bug','Core','3 x 10'],['Plank','Core','3 x 30 sec']]), full('Wed'), core('Sat')]),
  ];
}
