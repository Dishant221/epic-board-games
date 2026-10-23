import { useEffect, useState } from 'react';

const KEY = 'ebg:cookie-notice';

/**
 * Informational notice: we only set a strictly necessary session cookie, so no
 * consent is collected today. If advertising/analytics are ever added, this is
 * where a real consent manager (CMP) must replace the notice.
 */
export default function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== '1') setShow(true);
    } catch {
      /* storage unavailable: stay hidden rather than nag on every load */
    }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto max-w-xl md:bottom-4">
      <div className="card flex flex-col gap-3 p-4 text-sm shadow-2xl sm:flex-row sm:items-center">
        <p className="flex-1 text-slate-300">
          🍪 We use one strictly necessary cookie to keep you signed in, and no advertising or analytics cookies. <a className="text-violet-300 underline" href="/cookies">Cookie policy</a>
        </p>
        <button type="button" className="btn-primary px-4 py-2" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}
