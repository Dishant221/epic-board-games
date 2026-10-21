import type { PublicUser } from '@ebg/game-core/protocol';
import { useState, type SubmitEvent } from 'react';
import { api, safeNext, setCurrentUser } from '../../lib/api';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (isSignup && body.password !== body.confirm) {
      setError('Passwords do not match');
      return;
    }
    delete body.confirm;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: PublicUser }>(`/api/auth/${mode}`, { body });
      setCurrentUser(user);
      location.href = safeNext(new URLSearchParams(location.search).get('next'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-sm space-y-4 p-6" noValidate={false}>
      <h1 className="font-display text-3xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
      {isSignup && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Username</span>
            <input className="input" name="username" required minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" autoComplete="username" placeholder="lowercase, numbers, _" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Display name</span>
            <input className="input" name="displayName" required maxLength={32} autoComplete="nickname" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Email</span>
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
        </>
      )}
      {!isSignup && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Username or email</span>
          <input className="input" name="username" required autoComplete="username" />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Password</span>
        <input className="input" name="password" type="password" required minLength={isSignup ? 10 : 1} maxLength={128} autoComplete={isSignup ? 'new-password' : 'current-password'} />
        {isSignup && <span className="mt-1 block text-xs text-slate-500">At least 10 characters.</span>}
      </label>
      {isSignup && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Confirm password</span>
          <input className="input" name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
        </label>
      )}
      {isSignup && (
        <label className="flex items-start gap-2 text-xs text-slate-400">
          <input type="checkbox" name="acceptTerms" value="true" required className="mt-0.5 accent-violet-500" />
          <span>I agree to the <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy">Privacy Policy</a>, and I am at least 13 years old.</span>
        </label>
      )}
      {error && <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}</button>
      <p className="text-center text-sm text-slate-400">
        {isSignup ? <>Already have an account? <a className="text-violet-300 underline" href="/login">Sign in</a></> : <>New here? <a className="text-violet-300 underline" href="/signup">Create an account</a></>}
      </p>
    </form>
  );
}
