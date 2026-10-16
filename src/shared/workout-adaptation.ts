import type { PlannedExercise } from './types.js';
/** Recovery review prescription for the current workout; the saved program remains intact. */
export function adaptWorkoutExercises(exercises:PlannedExercise[]){return exercises.map(e=>({...e,vol:e.vol.replace(/^(\d+)\s*[×x]/i,(_match,n)=>`${Math.max(1,Number(n)-1)} x`),rirTarget:Math.min(5,Number(e.rirTarget||2)+1)}));}
