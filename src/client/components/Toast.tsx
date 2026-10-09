import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type ToastKind = 'ok' | 'err' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3400);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  useEffect(() => {
    const receive = (event: Event) => { const detail = (event as CustomEvent<{ message: string; kind: ToastKind }>).detail; push(detail.message, detail.kind); };
    window.addEventListener('health-os-native-message', receive);
    return () => window.removeEventListener('health-os-native-message', receive);
  }, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite" aria-atomic="true">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'ok' ? 'ok' : t.kind === 'err' ? 'err' : 'info'}`}>
            <span aria-hidden>
              {t.kind === 'ok' ? '✓' : t.kind === 'err' ? '!' : '·'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
