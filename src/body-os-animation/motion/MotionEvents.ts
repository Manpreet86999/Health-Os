export type RepPhaseName =
  | 'rep:start'
  | 'phase:descent'
  | 'rep:bottom'
  | 'phase:ascent'
  | 'rep:top'
  | 'rep:end'
  | string;

export interface MotionEventTrigger {
  time: number; // 0..1 normalized
  name: RepPhaseName;
  cue?: string;
}

export class MotionEvents {
  private events: MotionEventTrigger[] = [];
  private lastTriggeredIndex = -1;
  private currentPhase: RepPhaseName = 'rep:start';
  private loopCount = 0;

  setEvents(events: MotionEventTrigger[]): void {
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.lastTriggeredIndex = -1;
    this.currentPhase = this.events[0]?.name || 'rep:start';
  }

  evaluate(
    currentProgress: number,
    onTrigger: (event: MotionEventTrigger, loopCount: number) => void
  ): void {
    if (this.events.length === 0) return;

    for (let i = 0; i < this.events.length; i++) {
      const evt = this.events[i];
      if (currentProgress >= evt.time && this.lastTriggeredIndex < i) {
        this.lastTriggeredIndex = i;
        this.currentPhase = evt.name;
        onTrigger(evt, this.loopCount);
      }
    }

    // Reset when looping back to beginning
    if (currentProgress < 0.05 && this.lastTriggeredIndex >= this.events.length - 1) {
      this.lastTriggeredIndex = -1;
    }
  }

  onLoop(onTrigger?: (event: MotionEventTrigger, loopCount: number) => void): void {
    this.loopCount++;
    this.lastTriggeredIndex = -1;
    if (onTrigger) {
      onTrigger({ time: 1.0, name: 'rep:end', cue: 'Rep complete' }, this.loopCount);
      onTrigger({ time: 0.0, name: 'rep:start', cue: 'Start next rep' }, this.loopCount);
    }
  }

  getCurrentPhase(progress: number): RepPhaseName {
    if (this.events.length === 0) return 'rep:start';
    let phase = this.events[0].name;
    for (const evt of this.events) {
      if (progress >= evt.time) {
        phase = evt.name;
      } else {
        break;
      }
    }
    return phase;
  }

  getLoopCount(): number {
    return this.loopCount;
  }

  reset(): void {
    this.lastTriggeredIndex = -1;
    this.loopCount = 0;
    this.currentPhase = this.events[0]?.name || 'rep:start';
  }
}
