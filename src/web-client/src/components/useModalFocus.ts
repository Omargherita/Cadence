import { useEffect, useRef } from 'react';

/** Keep focus in floating dialogs and restore it to the opening control. */
export function useModalFocus(open: boolean, onClose: () => void, modal = true) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const candidates = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    candidates()[0]?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (modal && e.key === 'Tab') {
        const elements = candidates(); const first = elements[0]; const last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !root?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    }
    const overflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (modal) document.body.style.overflow = overflow; previous?.focus(); };
  }, [open, modal]);
  return ref;
}
