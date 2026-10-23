import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  /** Bottom sheet on phones, compact centred dialog otherwise. */
  mobile: boolean;
  onClose(): void;
  children: ReactNode;
}

/** Native <dialog> for focus trapping and Escape handling. Sized to the game, never full-screen. */
export function Dialog({ open, title, mobile, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shape = mobile
    ? 'm-0 mt-auto max-h-[65dvh] w-full max-w-none rounded-t-3xl'
    : 'm-auto max-h-[70dvh] w-[min(92vw,24rem)] rounded-2xl';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`${shape} bg-ink-900 p-0 text-slate-100 ring-1 ring-white/10 backdrop:bg-black/50 open:animate-[pop_0.25s_ease-out]`}
      aria-label={title}
    >
      <div className="flex max-h-[inherit] flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {mobile && <span className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <button type="button" className="btn-ghost min-h-11 min-w-11 px-2.5 py-1 text-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{open && children}</div>
      </div>
    </dialog>
  );
}

interface PopoverProps {
  title: string;
  onClose(): void;
  children: ReactNode;
}

/**
 * Desktop popover drawn over the board's centre (so it is always proportional
 * to the board). Escape and the close button dismiss it; focus moves to the
 * close button on open and back to the previously focused element on close.
 */
export function Popover({ title, onClose, children }: PopoverProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div
      className="eb-panel"
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <h2 className="truncate font-display text-base font-semibold">{title}</h2>
        <button ref={closeRef} type="button" className="btn-ghost min-h-9 min-w-9 px-2 py-1 text-xs" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
    </div>
  );
}
