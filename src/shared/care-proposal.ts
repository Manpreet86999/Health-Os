import type { CareProposal, CareTask, SkinState, CareArea } from './skin.js';

const areas = new Set<CareArea>(['face','body','hair','scalp']);
const times = new Set<CareTask['time']>(['morning','evening','wash','anytime']);

export function validateCareProposal(raw: unknown, skin: SkinState): CareProposal {
  if (!raw || typeof raw !== 'object') throw new Error('Expected a care proposal object.');
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.tasks) || input.tasks.length > 30 || input.tasks.length === 0) throw new Error('The proposal needs 1–30 care actions.');
  const products = new Set(skin.products.filter(p => p.status === 'active').map(p => p.id));
  const tasks = input.tasks.map((value, index): CareTask => {
    if (!value || typeof value !== 'object') throw new Error(`Action ${index+1} is invalid.`);
    const row = value as Record<string, unknown>;
    const label = String(row.label || '').trim().slice(0,120);
    const area = String(row.area || '') as CareArea;
    const time = String(row.time || '') as CareTask['time'];
    const productId = String(row.productId || '');
    const days = Array.isArray(row.days) ? [...new Set(row.days.map(Number))] : [];
    const minutes = Number(row.minutes);
    if (!label || !areas.has(area) || !times.has(time) || !days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error(`Action ${index+1} has invalid details.`);
    if (productId && !products.has(productId)) throw new Error(`Action ${index+1} refers to a product that is not on your active shelf.`);
    const notes = String(row.notes || '').slice(0,500);
    if (/(?:not|isn't|is not|doesn't|does not)\s+counted|(?:doesn't|does not)\s+count/i.test(notes))
      throw new Error(`Action ${index+1} hides an extra step from your daily limit. Ask Coach to count every action.`);
    return { id:crypto.randomUUID(), label, area, time, productId, days, minutes, notes, paused:false };
  });
  const limit = skin.care.commitment;
  const scheduledDays = Array.from({length:7},(_,day)=>day).filter(day=>tasks.some(t=>(t.days.length===0||t.days.includes(day))&&(t.time!=='wash'||limit.washDays.includes(day))));
  if (scheduledDays.length > limit.weeklyDays) throw new Error(`The proposal schedules ${scheduledDays.length} days, above your ${limit.weeklyDays}-day weekly commitment.`);
  for (let day=0; day<7; day++) {
    const scheduled = tasks.filter(t => (t.days.length === 0 || t.days.includes(day)) && (t.time !== 'wash' || limit.washDays.includes(day)));
    if (scheduled.length > limit.maxSteps || scheduled.reduce((sum,t) => sum+t.minutes,0) > limit.minutesPerDay) throw new Error(`The proposal exceeds your time or action limit on day ${day+1}. Ask Coach for a simpler plan or edit your commitment.`);
  }
  return { reason:String(input.reason || 'Care plan proposal').slice(0,500), tasks, baseUpdatedAt:skin.care.updatedAt, baseRevision:skin.care.revision };
}
