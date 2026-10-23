import { useState, type SubmitEvent } from 'react';
import { api, useAuth } from '../../lib/api';

const TOPICS = [
  ['bug', 'Report a bug'],
  ['feature', 'Request a game or feature'],
  ['account', 'Account or sign-in help'],
  ['privacy', 'Privacy or data request'],
  ['business', 'Partnerships & press'],
  ['other', 'Something else'],
] as const;

export default function ContactForm() {
  const auth = useAuth();
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'error'; text: string }>({ kind: 'idle' });

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState({ kind: 'busy' });
    try {
      await api('/api/contact', { body: data });
      setState({ kind: 'done' });
    } catch (err) {
      setState({ kind: 'error', text: err instanceof Error ? err.message : 'Could not send your message' });
    }
  };

  if (state.kind === 'done') {
    return (
      <div className="card p-6" role="status">
        <p className="text-4xl" aria-hidden="true">📬</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Thanks — we got it.</h2>
        <p className="mt-1 text-slate-300">We'll reply to the email address you gave us, usually within two working days.</p>
        <a href="/" className="btn-primary mt-5">Back to the games</a>
      </div>
    );
  }

  const user = auth.status === 'ready' ? auth.user : null;
  return (
    <form onSubmit={submit} className="card space-y-4 p-6" aria-labelledby="contact-title">
      <h2 id="contact-title" className="font-display text-xl font-semibold">Send a message</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Your name</span>
          <input className="input" name="name" required maxLength={60} autoComplete="name" defaultValue={user?.displayName ?? ''} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Email</span>
          <input className="input" name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Topic</span>
        <select className="input" name="topic" defaultValue="bug">
          {TOPICS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Message</span>
        <textarea className="input min-h-36" name="message" required minLength={10} maxLength={2000} placeholder="What happened, which game, which device and browser?" />
      </label>
      {/* Honeypot: real people never see or fill this. */}
      <div className="hidden" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <p className="text-xs text-slate-500">We use what you send only to answer you. See the <a className="underline" href="/privacy">Privacy Policy</a>.</p>
      {state.kind === 'error' && <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{state.text}</p>}
      <button type="submit" className="btn-primary" disabled={state.kind === 'busy'}>{state.kind === 'busy' ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
