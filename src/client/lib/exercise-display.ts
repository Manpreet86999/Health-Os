import type {Exercise} from './types';
import {displayText} from './display-text';

function labels(value:unknown):string[]{
  const values=Array.isArray(value)?value:value==null?[]:[value];
  return values.map(item=>displayText(item)).filter(Boolean);
}

/** Adapt old imported labels for the UI without rewriting the saved cloud payload. */
export function exerciseForDisplay(exercise:Exercise):Exercise{
  return {...exercise,name:displayText(exercise.name),equipment:labels(exercise.equipment).join(', '),
    aliases:labels(exercise.aliases),muscles:labels(exercise.muscles),substitutions:labels(exercise.substitutions),
    approvedAliases:exercise.approvedAliases?labels(exercise.approvedAliases):undefined,
    bodyPart:displayText(exercise.bodyPart),movementPattern:displayText(exercise.movementPattern),
    defaultCue:exercise.defaultCue?displayText(exercise.defaultCue):undefined,
    workoutSplit:exercise.workoutSplit?displayText(exercise.workoutSplit):undefined};
}
