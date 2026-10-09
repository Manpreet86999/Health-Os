type Overlay = { element: HTMLElement; close: () => void; previous: HTMLElement | null };
const stack: Overlay[] = [];
let overflow = '';
// WebKit does not focus buttons on pointer activation. Remember the invoker
// before a dialog's autofocus changes document.activeElement.
let pointerInvoker:HTMLElement|null=null,pointerAt=0;
if(typeof document!=='undefined'){
  document.addEventListener('pointerdown',event=>{
    pointerInvoker=event.target instanceof Element?event.target.closest<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'):null;
    pointerAt=performance.now();
  },true);
  document.addEventListener('keydown',()=>{pointerInvoker=null;},true);
}
function synchronize() {
  if(stack.length)document.body.dataset.uxOverlayOpen='true';else delete document.body.dataset.uxOverlayOpen;
  window.dispatchEvent(new Event('health-os-overlay-changed'));
  const root=document.getElementById('root');if(root)root.inert=!!stack.length && !root.contains(stack.at(-1)!.element);
  for (const entry of stack) { const hidden = entry !== stack.at(-1); entry.element.inert = hidden; if (hidden) entry.element.setAttribute('aria-hidden', 'true'); else entry.element.removeAttribute('aria-hidden'); }
}
function focusables(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled') && !el.closest('[inert]') && el.getClientRects().length);
}
function keydown(event: KeyboardEvent) {
  const active = stack.at(-1); if (!active) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); active.close(); }
  if (event.key !== 'Tab') return;
  const items = focusables(active.element), first = items[0], last = items.at(-1);
  if (!first) { event.preventDefault(); active.element.focus(); }
  else if (event.shiftKey && (document.activeElement === first || !active.element.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !active.element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
export function registerOverlay(element: HTMLElement, close: () => void) {
  const invoker=pointerInvoker?.isConnected&&performance.now()-pointerAt<1000&&!element.contains(pointerInvoker)?pointerInvoker:document.activeElement as HTMLElement|null;
  pointerInvoker=null;
  const entry = { element, close, previous: invoker };
  if (!stack.length) { overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', keydown, true); }
  stack.push(entry); synchronize(); (focusables(element)[0] || element).focus();
  return () => {
    const index = stack.indexOf(entry); if (index >= 0) stack.splice(index, 1);
    element.inert = false; synchronize();
    if (!stack.length) { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown, true); }
    if (entry.previous?.isConnected && !entry.previous.closest('[inert]')) entry.previous.focus();
  };
}
