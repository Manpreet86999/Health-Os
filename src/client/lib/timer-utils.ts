/** Remaining workout rest time, recalculated after backgrounding the browser. */
export function restSecondsRemaining(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
