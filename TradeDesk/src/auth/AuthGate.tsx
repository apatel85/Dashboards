import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Status = { kind: 'idle' | 'sending' | 'sent' | 'error'; message: string };

/**
 * Login gate: the whole app renders only after a Supabase session exists.
 * Supports Google OAuth and email magic-link. No passwords are stored.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<unknown | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setStatus({ kind: 'sending', message: 'Redirecting to Google…' });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Must be allow-listed under Supabase Auth → URL Configuration.
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) setStatus({ kind: 'error', message: error.message });
  };

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Enter an email address first.' });
      return;
    }
    setStatus({ kind: 'sending', message: 'Sending sign-in link…' });
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
    } else {
      setStatus({
        kind: 'sent',
        message: 'Check your inbox for the sign-in link. It expires in 1 hour.',
      });
    }
  };

  if (checking) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="muted">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="gate-sub">Stock research terminal. Sign in to continue.</p>

          <button className="btn btn-primary" onClick={signInWithGoogle}>
            Continue with Google
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={sendMagicLink} className="magic-form">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={status.kind === 'sending'}
            >
              Email me a sign-in link
            </button>
          </form>

          {status.message && (
            <p className={`status status-${status.kind}`} role="status">
              {status.message}
            </p>
          )}

          <p className="footnote">
            Research and education only — not financial advice.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
