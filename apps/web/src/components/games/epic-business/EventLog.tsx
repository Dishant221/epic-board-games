import { useEffect, useRef } from 'react';
import { expandLog, logIcon, relativeTime } from './format';
import { useLogTimes, useNow } from './hooks';

interface Props {
  log: string[];
  nameOf(seat: number): string;
  maxHeight?: number;
}

/** Engine log lines with an icon per event and a relative timestamp; auto-scrolls to the newest. */
export function EventLog({ log, nameOf, maxHeight = 220 }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const times = useLogTimes(log);
  const now = useNow(5000);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, log[log.length - 1]]);

  return (
    <div className="card p-2">
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
        <span>Events</span>
        <span className="font-normal normal-case">{log.length} shown</span>
      </div>
      <ol ref={ref} className="eb-log overflow-y-auto text-xs text-slate-300" style={{ maxHeight }} aria-live="polite" aria-label="Game events">
        {log.map((line, i) => (
          <li key={`${i}-${line}`} className="flex items-start gap-2 py-1">
            <span className="w-4 shrink-0 text-center" aria-hidden="true">
              {logIcon(line)}
            </span>
            <span className="min-w-0 flex-1">{expandLog(line, nameOf)}</span>
            <span className="shrink-0 text-[10px] text-slate-500 tabular-nums">{relativeTime(times[i] ?? null, now)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
