import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}

/** Slide-up panel for mobile chat / emotes / details. Uses <dialog> for focus trapping and Esc. */
export function BottomSheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto h-[70dvh] max-h-none w-full max-w-none rounded-t-3xl bg-ink-900 p-0 text-slate-100 ring-1 ring-white/10 backdrop:bg-black/60 open:animate-[pop_0.25s_ease-out]"
      aria-label={title}
    >
      <div className="flex h-full flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
        </div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" className="btn-ghost px-2.5 py-1 text-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1">{open && children}</div>
      </div>
    </dialog>
  );
}
