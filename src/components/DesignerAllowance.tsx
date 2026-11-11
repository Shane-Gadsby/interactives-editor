import { useEffect, useState } from 'react';
import { designerStatus, removeDesignerToken, setDesignerToken, type DesignerStatus } from '../lib/db';
import { designerChat } from '../lib/designer';
import { announce } from '../lib/announce';
import { confirmDialog } from './dialogs';

const COGNITI = 'https://cogniti.unisq.edu.au/';

//`utc`: a day with no time of its own (the day a token ends is kept as midnight UTC), so it reads the same wherever the browser is
const day = (iso: string | null | undefined, utc = false): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) });
};

/**
 * Preferences, General: "Use my own Cogniti allowance". Cogniti caps how many messages one person can send an hour, and everyone's
 * Activity Designer requests share one pilot token. A personal API token from Cogniti puts a person's requests on their own
 * allowance instead. The server checks it once, keeps it encrypted and never sends it back: all this ever shows is "Connected",
 * when it was added and (if they said) when it ends.
 */
export function DesignerAllowance() {
  const [status, setStatus] = useState<DesignerStatus | null>(null);
  const [token, setToken] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let live = true;
    designerStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus(null))
      .finally(() => live && setAsked(true));
    return () => void (live = false);
  }, []);

  const connect = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await setDesignerToken(token.trim(), ends);
      //the token is gone from the page the moment it has been handed over
      setToken('');
      setEnds('');
      setStatus((s) => ({ on: true, shared: null, ...(s ?? {}), mine: r.mine }));
      void designerChat().refreshStatus();
      announce('Your own Cogniti allowance is connected');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That did not work. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Stop using your own Cogniti allowance?', message: 'Your Activity Designer requests go back to the shared allowance. The token is deleted from the server. You can add one again any time.', confirmLabel: 'Remove it' }))) return;
    setBusy(true);
    setError('');
    try {
      await removeDesignerToken();
      setStatus((s) => (s ? { ...s, mine: null } : s));
      void designerChat().refreshStatus();
      announce('Your own Cogniti allowance was removed');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That did not work. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  if (!asked) return <p className="muted small">Checking…</p>;
  if (!status?.on) return <p className="muted small">The Activity Designer is not set up on this server, so there is nothing to connect.</p>;

  if (status.mine) {
    const added = day(status.mine.added);
    const endsOn = day(status.mine.ends, true);
    return (
      <div className="field">
        <span>Your own Cogniti allowance</span>
        <div className="row">
          <span role="status">
            Connected{added ? `, added ${added}` : ''}
            {endsOn ? `, ends ${endsOn}` : ''}
          </span>
          <button type="button" className="btn small-btn" disabled={busy} title="Delete your token from the server and go back to the shared allowance" onClick={() => void remove()}>
            Remove
          </button>
        </div>
        <p className="muted small">Your Activity Designer requests use your own Cogniti allowance, not the shared one. The token is kept encrypted on the server and is never shown again.</p>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="field"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <span>Use my own Cogniti allowance</span>
      <p className="muted small">
        Everyone's Activity Designer requests share one Cogniti allowance, so a request can be turned away when it runs low. With your own Cogniti token your requests use your allowance instead.
      </p>
      <ol className="small">
        <li>
          Open{' '}
          <a href={COGNITI} target="_blank" rel="noopener noreferrer">
            Cogniti
          </a>{' '}
          and sign in.
        </li>
        <li>Click your name at the top right, then User data, then API tokens.</li>
        <li>Make a new token (it can last up to 365 days) and copy it.</li>
        <li>Paste it here. It is checked once, then kept encrypted on the server.</li>
      </ol>
      <label className="row">
        <span>Cogniti API token</span>
        <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Cogniti API token" title="The token you copied from Cogniti. It is never shown again after you connect." />
      </label>
      <label className="row">
        <span>Ends on (if you know)</span>
        <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="The day the token ends (optional)" title="Optional: the day the token runs out, so Preferences can show it" />
      </label>
      <div className="row">
        <button type="submit" className="btn small-btn" disabled={!token.trim() || busy} title="Check the token with Cogniti and start using it">
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
