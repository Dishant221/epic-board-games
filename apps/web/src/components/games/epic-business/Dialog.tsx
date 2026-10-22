import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  /** Bottom sheet on phones, centred dialog otherwise. */
  mobile: boolean;
  onClose(): void;
  children: ReactNode;
}

/** Native <dialog> for focus trapping and Escape handling. */
export function Dialog({ open, title, mobile, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shape = mobile
    ? 'm-0 mt-auto h-[78dvh] max-h-none w-full max-w-none rounded-t-3xl'
    : 'm-auto max-h-[85dvh] w-[min(92vw,34rem)] rounded-3xl';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`${shape} bg-ink-900 p-0 text-slate-100 ring-1 ring-white/10 backdrop:bg-black/60 open:animate-[pop_0.25s_ease-out]`}
      aria-label={title}
    >
      <div className="flex h-full max-h-[inherit] flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {mobile && <span className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" className="btn-ghost min-h-11 min-w-11 px-2.5 py-1 text-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{open && children}</div>
      </div>
    </dialog>
  );
}
