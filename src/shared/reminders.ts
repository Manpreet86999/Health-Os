export function parseClock(value:string):number {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use a time between 00:00 and 23:59.');
  const [h,m]=value.split(':').map(Number);return h*60+m;
}
export function inQuietHours(minute:number,start:number,end:number):boolean {
  if(start===end) return false;
  return start<end ? minute>=start && minute<end : minute>=start || minute<end;
}
export function reminderMinute(time:string,quietStart:string,quietEnd:string):number {
  const minute=parseClock(time),start=parseClock(quietStart),end=parseClock(quietEnd);
  return inQuietHours(minute,start,end)?end:minute;
}
