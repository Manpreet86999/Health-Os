export const REPORT_ZONE = 'Asia/Kolkata';
export function istDate(at = new Date()): string {
  // IST is UTC+05:30. Avoid constructing Intl formatters in chart/aggregation hot paths.
  return new Date(at.getTime()+330*60*1000).toISOString().slice(0,10);
}
export function validReportDate(date:string):boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
}
export function reportDueAt(date:string):number { return validReportDate(date)?Date.parse(date+'T23:00:00+05:30'):Infinity; }
export function canSendDailyReport(date:string, at = new Date()):boolean { return validReportDate(date)&&at.getTime()>=reportDueAt(date); }
export const nutritionGoalFields = [
  ['calories','Calories','kcal',20000],['protein','Protein','g',1000],['carbs','Carbohydrates','g',3000],
  ['fat','Fat','g',1000],['fibre','Fiber','g',300],['water','Water','mL',20000],
] as const;
export type NutritionGoals = Record<typeof nutritionGoalFields[number][0],number>;
export function completeNutritionGoals(input:unknown):input is NutritionGoals {
  if(!input||typeof input!=='object')return false;
  const value=input as Record<string,unknown>;
  return nutritionGoalFields.every(([key,,,max])=>typeof value[key]==='number'&&Number.isFinite(value[key])&&Number(value[key])>0&&Number(value[key])<=max);
}
export function weekNeedsGoals(week:unknown):boolean {
  const value=week as {nutritionGoalsRequired?:boolean;nutritionGoals?:unknown}|undefined;
  return value?.nutritionGoalsRequired===true&&!completeNutritionGoals(value.nutritionGoals);
}
