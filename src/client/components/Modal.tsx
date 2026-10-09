import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { registerOverlay } from '../lib/overlays';

export function Modal({
  open,
  title,
  children,
  onClose,
  actions,
  className,
  ariaLabel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (ref.current) return registerOverlay(ref.current, () => onCloseRef.current());
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${className || ''}`} style={className?.includes('daily-readiness-modal') ? {minHeight:0,overflowY:'auto',touchAction:'pan-y pinch-zoom',overscrollBehaviorY:'contain'} : undefined} role="dialog" aria-modal="true" aria-label={ariaLabel || title || 'Dialog'} ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">{title ? <h3>{title}</h3> : <span/>}<button type="button" className="icon-btn" aria-label={`Close ${title || 'dialog'}`} onClick={onClose}>×</button></div>
        <div>{children}</div>
        {actions ? <div className="modal-actions mt-4">{actions}</div> : null}
      </div>
    </div>, document.body
  );
}
