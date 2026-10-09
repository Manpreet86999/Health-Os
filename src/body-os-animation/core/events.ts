/**
 * Health OS Animation System v1 — Event System
 */

export type AnimationEventType =
  | 'loadstart'
  | 'loaded'
  | 'play'
  | 'pause'
  | 'timeupdate'
  | 'loop'
  | 'phasechange'
  | 'cuetrigger'
  | 'camerachange'
  | 'modechange'
  | 'error';

export interface AnimationEventMap {
  loadstart: { exerciseId: string; characterId: string };
  loaded: { exerciseId: string; duration: number };
  play: void;
  pause: void;
  timeupdate: { currentTime: number; progress: number };
  loop: { loopCount: number };
  phasechange: { phase: string; progress: number };
  cuetrigger: { cue: string; time: number };
  camerachange: { camera: string };
  modechange: { mode: string };
  error: { message: string; originalError?: unknown };
}

export type EventCallback<T> = (data: T) => void;

export class AnimationEventEmitter {
  private listeners: Map<AnimationEventType, Set<EventCallback<any>>> = new Map();

  on<K extends AnimationEventType>(event: K, callback: EventCallback<AnimationEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off<K extends AnimationEventType>(event: K, callback: EventCallback<AnimationEventMap[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  emit<K extends AnimationEventType>(event: K, data: AnimationEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[AnimationEventEmitter] Error in listener for ${event}:`, err);
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
