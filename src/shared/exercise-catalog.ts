import type { Exercise, ExerciseTrackingMode } from './types.js';

type BaseExercise = Omit<Exercise, 'id' | 'aliases' | 'substitutions' | 'defaultRestSec' | 'defaultTempo'>;
type BaseRow = [string, string[], string, string, string, string, ExerciseTrackingMode];

const VARIATIONS = ['', 'Paused', 'Tempo', 'Slow Eccentric', 'High-Rep', 'Strict', 'Explosive', 'Deficit', 'Wide Grip', 'Close Grip', 'Neutral Grip', 'Unilateral', 'Isometric', 'Assisted'] as const;

/** v2.4 ships 826 offline entries: 59 core movements × 14 useful execution variations. */
const BASES: BaseRow[] = [
  ['Bench Press',['Chest','Triceps','Shoulders'],'Barbell','horizontal_press','Chest','Push','weight_reps'], ['Incline Bench Press',['Chest','Shoulders'],'Barbell','incline_press','Chest','Push','weight_reps'], ['Decline Bench Press',['Chest','Triceps'],'Barbell','horizontal_press','Chest','Push','weight_reps'], ['Dumbbell Bench Press',['Chest','Triceps'],'Dumbbell','horizontal_press','Chest','Push','weight_reps'], ['Dumbbell Fly',['Chest'],'Dumbbell','isolation','Chest','Push','weight_reps'], ['Push-up',['Chest','Triceps','Shoulders'],'Bodyweight','horizontal_press','Chest','Push','reps'], ['Dip',['Chest','Triceps'],'Bodyweight','vertical_press','Chest','Push','reps'], ['Cable Chest Fly',['Chest'],'Cable','isolation','Chest','Push','weight_reps'],
  ['Overhead Press',['Shoulders','Triceps'],'Barbell','vertical_press','Shoulders','Push','weight_reps'], ['Dumbbell Shoulder Press',['Shoulders','Triceps'],'Dumbbell','vertical_press','Shoulders','Push','weight_reps'], ['Arnold Press',['Shoulders'],'Dumbbell','vertical_press','Shoulders','Push','weight_reps'], ['Lateral Raise',['Shoulders'],'Dumbbell','isolation','Shoulders','Push','weight_reps'], ['Rear Delt Fly',['Rear delts','Upper back'],'Dumbbell','isolation','Shoulders','Pull','weight_reps'], ['Face Pull',['Rear delts','Upper back'],'Cable','horizontal_pull','Shoulders','Pull','weight_reps'], ['Upright Row',['Shoulders','Traps'],'Cable','vertical_pull','Shoulders','Push','weight_reps'],
  ['Pull-up',['Back','Biceps'],'Bodyweight','vertical_pull','Back','Pull','reps'], ['Chin-up',['Back','Biceps'],'Bodyweight','vertical_pull','Back','Pull','reps'], ['Lat Pulldown',['Back','Biceps'],'Cable','vertical_pull','Back','Pull','weight_reps'], ['Barbell Row',['Back','Biceps'],'Barbell','horizontal_pull','Back','Pull','weight_reps'], ['Dumbbell Row',['Back','Biceps'],'Dumbbell','horizontal_pull','Back','Pull','weight_reps'], ['Seated Cable Row',['Back','Biceps'],'Cable','horizontal_pull','Back','Pull','weight_reps'], ['Chest-Supported Row',['Back'],'Machine','horizontal_pull','Back','Pull','weight_reps'], ['Straight-Arm Pulldown',['Lats'],'Cable','vertical_pull','Back','Pull','weight_reps'],
  ['Back Squat',['Quads','Glutes'],'Barbell','squat','Quads','Legs','weight_reps'], ['Front Squat',['Quads','Core'],'Barbell','squat','Quads','Legs','weight_reps'], ['Goblet Squat',['Quads','Glutes'],'Dumbbell','squat','Quads','Legs','weight_reps'], ['Bodyweight Squat',['Quads','Glutes'],'Bodyweight','squat','Quads','Legs','reps'], ['Leg Press',['Quads','Glutes'],'Machine','squat','Quads','Legs','weight_reps'], ['Hack Squat',['Quads'],'Machine','squat','Quads','Legs','weight_reps'], ['Leg Extension',['Quads'],'Machine','isolation','Quads','Legs','weight_reps'],
  ['Romanian Deadlift',['Hamstrings','Glutes'],'Barbell','hinge','Hamstrings','Legs','weight_reps'], ['Deadlift',['Posterior','Back','Glutes'],'Barbell','hinge','Hamstrings','Legs','weight_reps'], ['Good Morning',['Hamstrings','Back'],'Barbell','hinge','Hamstrings','Legs','weight_reps'], ['Leg Curl',['Hamstrings'],'Machine','isolation','Hamstrings','Legs','weight_reps'], ['Nordic Curl',['Hamstrings'],'Bodyweight','hinge','Hamstrings','Legs','reps'], ['Hip Thrust',['Glutes'],'Barbell','hip_extension','Glutes','Legs','weight_reps'], ['Glute Bridge',['Glutes'],'Bodyweight','hip_extension','Glutes','Legs','reps'], ['Cable Kickback',['Glutes'],'Cable','hip_extension','Glutes','Legs','weight_reps'], ['Walking Lunge',['Quads','Glutes'],'Dumbbell','lunge','Legs','Legs','weight_reps'], ['Bulgarian Split Squat',['Quads','Glutes'],'Dumbbell','lunge','Legs','Legs','weight_reps'], ['Step-up',['Quads','Glutes'],'Dumbbell','lunge','Legs','Legs','weight_reps'], ['Calf Raise',['Calves'],'Machine','isolation','Calves','Legs','weight_reps'],
  ['Barbell Curl',['Biceps'],'Barbell','isolation','Biceps','Pull','weight_reps'], ['Dumbbell Curl',['Biceps'],'Dumbbell','isolation','Biceps','Pull','weight_reps'], ['Hammer Curl',['Biceps'],'Dumbbell','isolation','Biceps','Pull','weight_reps'], ['Preacher Curl',['Biceps'],'Machine','isolation','Biceps','Pull','weight_reps'], ['Tricep Pushdown',['Triceps'],'Cable','isolation','Triceps','Push','weight_reps'], ['Overhead Tricep Extension',['Triceps'],'Cable','isolation','Triceps','Push','weight_reps'], ['Skull Crusher',['Triceps'],'Barbell','isolation','Triceps','Push','weight_reps'],
  ['Plank',['Core'],'Bodyweight','core','Core','Core','time'], ['Side Plank',['Obliques','Core'],'Bodyweight','core','Core','Core','time'], ['Hollow Hold',['Core'],'Bodyweight','core','Core','Core','time'], ['Dead Bug',['Core'],'Bodyweight','core','Core','Core','reps'], ['Hanging Leg Raise',['Core','Hip flexors'],'Bodyweight','core','Core','Core','reps'], ['Cable Crunch',['Core'],'Cable','core','Core','Core','weight_reps'], ['Russian Twist',['Obliques'],'Bodyweight','core','Core','Core','reps'], ['Jumping Jack',['Cardio'],'Bodyweight','conditioning','Full body','Conditioning','time'], ['Mountain Climber',['Core','Cardio'],'Bodyweight','conditioning','Full body','Conditioning','time'], ['Burpee',['Full body','Cardio'],'Bodyweight','conditioning','Full body','Conditioning','time'],
];

function createBase([name, muscles, equipment, movementPattern, bodyPart, workoutSplit, trackingMode]: BaseRow): BaseExercise {
  return { name, muscles, equipment, movementPattern, bodyPart, workoutSplit, trackingMode, familyId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), defaultCue: 'Controlled range of motion, stable setup, and steady breathing.' };
}

function idFor(name: string, variation: number): string {
  return `builtin-v240-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${variation + 1}`;
}

export function defaultExerciseCatalog(): Exercise[] {
  return BASES.flatMap((row) => {
    const item = createBase(row);
    return VARIATIONS.map((variant, index) => ({
      ...item,
      id: idFor(item.name, index),
      name: variant ? `${item.name} — ${variant}` : item.name,
      aliases: index === 0 ? [item.name.replace('Dumbbell', 'DB')] : [item.name],
      substitutions: [],
      defaultRestSec: item.trackingMode === 'time' ? 45 : item.movementPattern === 'squat' || item.movementPattern === 'hinge' ? 180 : 90,
      defaultTempo: item.trackingMode === 'time' ? undefined : index === 3 ? '4-0-1-0' : '2-0-1-0',
    }));
  });
}
