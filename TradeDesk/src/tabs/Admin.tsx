import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useInvite } from '../auth/AuthGate';
import '../mockb-tokens.css';
import '../mockb-admin.css';

interface InviteRow {
  email: string;
  role: 'admin' | 'member';
  invited_by: string | null;
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Nov 11, 2026" — short, readable, no time. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Admin — invite list. Rendered ONLY for admins (the tab itself is hidden
 * for everyone else). All reads/writes go through the Supabase client, so
 * Row Level Security enforces admin-only access; the UI just surfaces the
 * result in plain words.
 *
 * Guards: you can't remove your own row, and you can't remove or demote
 * the last admin — otherwise nobody could ever manage the list again.
 */
export default function AdminTab() {
  const invite = useInvite();
  const me = invite?.email ?? '';
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [formMsg, setFormMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('tradedesk_invites')
      .select('email, role, invited_by, created_at')
      .order('created_at', { ascending: false });
    if (err) {
      setError('Couldn\u2019t load the invite list. Check your connection and try again.');
    } else {
      setRows((data ?? []) as InviteRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adminCount = rows.filter((r) => r.role === 'admin').length;

  const addInvite = async (e: FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setFormMsg({ kind: 'err', text: 'That doesn\u2019t look like an email address — check it and try again.' });
      return;
    }
    setFormMsg(null);
    setBusy('add');
    const { error: err } = await supabase
      .from('tradedesk_invites')
      .insert({ email, role: 'member', invited_by: me });
    setBusy(null);
    if (err) {
      setFormMsg(
        err.code === '23505'
          ? { kind: 'err', text: 'That email is already on the list.' }
          : { kind: 'err', text: 'Couldn\u2019t add that email. Try again.' },
      );
      return;
    }
    setNewEmail('');
    setFormMsg({ kind: 'ok', text: `${email} can now sign in to TradeDesk.` });
    void load();
  };

  const removeInvite = async (row: InviteRow) => {
    if (row.email === me) {
      setFormMsg({ kind: 'err', text: 'You can\u2019t remove your own access.' });
      return;
    }
    if (row.role === 'admin' && adminCount <= 1) {
      setFormMsg({ kind: 'err', text: 'That\u2019s the last admin — add another admin first, or the list would have no one left to manage it.' });
      return;
    }
    if (!window.confirm(`Remove ${row.email} from TradeDesk? They won\u2019t be able to sign in any more.`)) return;
    setFormMsg(null);
    setBusy(`rm:${row.email}`);
    const { error: err } = await supabase.from('tradedesk_invites').delete().eq('email', row.email);
    setBusy(null);
    if (err) {
      setFormMsg({ kind: 'err', text: 'Couldn\u2019t remove that person. Try again.' });
      return;
    }
    setFormMsg({ kind: 'ok', text: `${row.email} was removed.` });
    void load();
  };

  const toggleRole = async (row: InviteRow) => {
    const next = row.role === 'admin' ? 'member' : 'admin';
    if (row.email === me) {
      setFormMsg({ kind: 'err', text: 'You can\u2019t change your own role.' });
      return;
    }
    if (row.role === 'admin' && next === 'member' && adminCount <= 1) {
      setFormMsg({ kind: 'err', text: 'That\u2019s the last admin — add another admin first.' });
      return;
    }
    setFormMsg(null);
    setBusy(`role:${row.email}`);
    const { error: err } = await supabase
      .from('tradedesk_invites')
      .update({ role: next })
      .eq('email', row.email);
    setBusy(null);
    if (err) {
      setFormMsg({ kind: 'err', text: 'Couldn\u2019t change that role. Try again.' });
      return;
    }
    setFormMsg({ kind: 'ok', text: `${row.email} is now ${next === 'admin' ? 'an admin' : 'a member'}.` });
    void load();
  };

  return (
    <div className="mb-admin">
      <div className="mb-card">
        <div className="mb-card-head">
          <span className="mb-card-num">01</span>
          <span className="mb-card-title">Who can use TradeDesk</span>
          <span className="mb-count-badge">
            {loading ? '…' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
          </span>
        </div>
        <div className="mb-admin-body">
          <p className="mb-lede">
            Only you can see this tab. Anyone on this list can sign in; anyone not
            on it sees &ldquo;Access not granted&rdquo; after signing in. Admins can
            add and remove people — members can only use the app.
          </p>
          <p className="mb-admin-note">
            Note: the raw data files behind the app are public web pages by design,
            so this list controls who can use the terminal and the live Schwab
            feed — not who can download the raw data files.
          </p>

          <form onSubmit={addInvite} className="mb-admin-add">
            <input
              className="mb-admin-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="person@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              aria-label="Email address to invite"
            />
            <button type="submit" className="mb-btn mb-btn-primary" disabled={busy === 'add'}>
              Add invite
            </button>
          </form>
          {formMsg && (
            <p
              className={`mb-admin-status mb-admin-status-${formMsg.kind === 'ok' ? 'ok' : 'err'}`}
              role="status"
            >
              {formMsg.text}
            </p>
          )}

          {loading ? (
            <p className="mb-admin-empty">Loading the invite list…</p>
          ) : error ? (
            <p className="mb-admin-status mb-admin-status-err" role="status">
              {error}{' '}
              <button className="mb-btn" onClick={() => void load()}>
                Try again
              </button>
            </p>
          ) : rows.length === 0 ? (
            <p className="mb-admin-empty">Nobody is on the list yet — add an email above.</p>
          ) : (
            <div className="mb-admin-list">
              {rows.map((row) => (
                <div key={row.email} className="mb-admin-row">
                  <div className="mb-admin-who">
                    <div className="mb-admin-email">{row.email}</div>
                    <div className="mb-admin-meta">
                      <span className={`mb-role${row.role === 'admin' ? ' mb-role-admin' : ''}`}>
                        {row.role === 'admin' ? 'Admin' : 'Member'}
                      </span>
                      {' · '}added {fmtDate(row.created_at)}
                      {row.invited_by ? ` · by ${row.invited_by}` : ''}
                      {row.email === me ? ' · that\u2019s you' : ''}
                    </div>
                  </div>
                  <div className="mb-admin-actions">
                    <button
                      className="mb-btn"
                      onClick={() => void toggleRole(row)}
                      disabled={busy === `role:${row.email}`}
                    >
                      {row.role === 'admin' ? 'Make member' : 'Make admin'}
                    </button>
                    <button
                      className="mb-btn mb-btn-danger"
                      onClick={() => void removeInvite(row)}
                      disabled={busy === `rm:${row.email}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
