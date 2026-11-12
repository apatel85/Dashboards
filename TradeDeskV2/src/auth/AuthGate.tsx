import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type Status = { kind: 'idle' | 'sending' | 'sent' | 'error'; message: string };

/** What the login gate learned about the signed-in user. */
export interface InviteInfo {
  email: string;
  role: 'admin' | 'member';
  isAdmin: boolean;
}

const InviteContext = createContext<InviteInfo | null>(null);

/** Inside <AuthGate>, the signed-in user's invite (role, admin or not). */
export function useInvite(): InviteInfo | null {
  return useContext(InviteContext);
}

/**
 * Login gate: the whole app renders only after a Supabase session exists
 * AND the signed-in email is on the invite list (public.tradedesk_invites).
 * Supports Google OAuth and email magic-link. No passwords are stored.
 *
 * Invite states after sign-in:
 *   allowed — row exists: the app renders, with the role attached.
 *   denied  — signed in but no row: no app content, "ask Ankit for an invite".
 *   setup   — the invites table is missing/unreadable: no app content, the
 *             admin is told to run the setup SQL. Fails closed on purpose.
 *   error   — anything else (e.g. network): retry, no app content.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<unknown | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteState, setInviteState] = useState<'checking' | 'allowed' | 'denied' | 'setup' | 'error'>('checking');

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

  // Check the invite list whenever the session changes (sign-in, sign-out,
  // token refresh). Runs on every app load.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const sess = session as { user?: { email?: string } } | null;
      const userEmail = sess?.user?.email?.trim().toLowerCase() ?? '';
      if (!sess || !userEmail) {
        if (!cancelled) {
          setInvite(null);
          setInviteState('checking');
        }
        return;
      }
      setInviteState('checking');
      const { data, error } = await supabase
        .from('tradedesk_invites')
        .select('role')
        .eq('email', userEmail)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Table missing (not yet set up) — PostgREST reports it as
        // PGRST205 / "Could not find the table". Fail closed to setup.
        const msg = `${error.code ?? ''} ${error.message ?? ''}`;
        if (error.code === 'PGRST205' || /could not find the table/i.test(msg) || error.code === '42P01') {
          setInvite(null);
          setInviteState('setup');
        } else {
          setInvite(null);
          setInviteState('error');
        }
        return;
      }
      if (!data) {
        setInvite(null);
        setInviteState('denied');
        return;
      }
      const role = data.role === 'admin' ? 'admin' : 'member';
      setInvite({ email: userEmail, role, isAdmin: role === 'admin' });
      setInviteState('allowed');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [session]);

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

  const signOut = async () => {
    await supabase.auth.signOut();
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

  if (inviteState === 'checking') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="muted">Checking your invite…</p>
        </div>
      </div>
    );
  }

  if (inviteState === 'setup') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="gate-sub">Setup needed</p>
          <p className="muted" style={{ textAlign: 'left' }}>
            The invite list hasn&apos;t been set up yet. Ankit: run the file{' '}
            <code>TradeDesk/supabase/tradedesk-invites-table.sql</code> in the
            Supabase SQL editor, with your own sign-in email on the seed line,
            then reload this page.
          </p>
          <button className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
          <p className="footnote">
            Research and education only — not financial advice.
          </p>
        </div>
      </div>
    );
  }

  if (inviteState === 'denied') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="gate-sub">Access not granted</p>
          <p className="muted" style={{ textAlign: 'left' }}>
            You&apos;re signed in, but this email isn&apos;t on the TradeDesk
            invite list. Ask Ankit to add it, then sign in again.
          </p>
          <button className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
          <p className="footnote">
            Research and education only — not financial advice.
          </p>
        </div>
      </div>
    );
  }

  if (inviteState === 'error') {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">TradeDesk</div>
          <p className="gate-sub">Couldn&apos;t check your invite</p>
          <p className="muted" style={{ textAlign: 'left' }}>
            Something went wrong checking the invite list. Check your
            connection and try again.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>{' '}
          <button className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
          <p className="footnote">
            Research and education only — not financial advice.
          </p>
        </div>
      </div>
    );
  }

  return <InviteContext.Provider value={invite}>{children}</InviteContext.Provider>;
}
