import { useEffect, useRef, useState } from 'react';
import { restSecondsRemaining } from '../lib/timer-utils';

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, 180);
  } catch {
    /* ignore */
  }
}

export function RestTimer({
  defaultSeconds = 90,
  autoStart = false,
  kick = 0,
}: {
  defaultSeconds?: number;
  autoStart?: boolean;
  kick?: number;
}) {
  const [seconds, setSeconds] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(defaultSeconds);
  const doneOnce = useRef(false);
  const deadline = useRef<number | null>(null);
  const leftRef = useRef(left);
  leftRef.current = left;

  const start = (duration: number) => {
    deadline.current = Date.now() + duration * 1000;
    setLeft(duration); doneOnce.current = false; setRunning(true);
    
  };

  useEffect(() => {
    setSeconds(defaultSeconds);
    setLeft(defaultSeconds);
    doneOnce.current = false;
    if (autoStart || kick > 0) {
      start(defaultSeconds);
    }
  }, [defaultSeconds, kick, autoStart]);

  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      setRunning(false);
      if (!doneOnce.current) {
        doneOnce.current = true;
        if (navigator.vibrate) navigator.vibrate([140, 80, 140, 80, 200]);
        beep();
      }
      return;
    }
    const update = () => { if (deadline.current !== null) setLeft(restSecondsRemaining(deadline.current)); };
    const t = setInterval(update, 250);
    window.addEventListener('health-os-resume', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(t); window.removeEventListener('health-os-resume', update); document.removeEventListener('visibilitychange', update); };
  }, [running, left]);

  const mm = String(Math.floor(Math.max(0, left) / 60)).padStart(2, '0');
  const ss = String(Math.max(0, left) % 60).padStart(2, '0');
  const done = left <= 0 && !running;

  return (
    <div className={`rest-timer ${done ? 'done' : ''}`}>
      <div>
        <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: '0.08em' }}>REST TIMER</div>
        <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {mm}:{ss}
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {[60, 90, 120, 180].map((s) => (
          <button
            key={s}
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => {
              setSeconds(s);
              start(s);
            }}
          >
            {s}s
          </button>
        ))}
        <button
          type="button"
          className="btn btn-hot btn-sm"
          onClick={() => {
            if (running) {
              setLeft(deadline.current === null ? leftRef.current : restSecondsRemaining(deadline.current));
              deadline.current = null; setRunning(false);
              
            } else start(left <= 0 ? seconds : left);
          }}
        >
          {running ? 'Pause' : left <= 0 ? 'Restart' : 'Start'}
        </button>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          onClick={() => {
            setLeft(seconds);
            setRunning(false);
            deadline.current = null;
            
            doneOnce.current = false;
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
