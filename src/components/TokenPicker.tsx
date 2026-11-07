import { useSyncExternalStore } from 'react';
import { isTokenRef, tokenIdOf, tokenRef, tokenValue, type Project, type ThemeToken } from 'interactives-player';
import { maybeStore, store } from '../store/store';
import { isBrandLocked } from '../lib/branded/lock';
import { ensureThemes, shownColor, shownTheme, tokenById } from '../lib/themes';
import { Icons } from './icons';

const noop = () => () => undefined;

/** What the colour picker needs from the project: its themes and the theme the canvas shows. Null outside an editor. */
export function useThemeState(): { project: Project; canvasTheme: string | null } | null {
  const s = maybeStore();
  const get = () => s?.get();
  const st = useSyncExternalStore(s ? s.subscribe : noop, get, get);
  return st ? { project: st.project, canvasTheme: st.canvasTheme } : null;
}

/** True in a branded starter project whose lock is on: colour pickers offer the theme tokens only. */
export function useBrandLocked(): boolean {
  const s = maybeStore();
  const get = () => (s ? isBrandLocked(s.get().project) && !s.get().brandOverride : false);
  return useSyncExternalStore(s ? s.subscribe : noop, get, get);
}

/** A token colour as drawn in the theme being shown, and the token behind it. */
export function linked(ts: { project: Project; canvasTheme: string | null } | null, value: string): { token: ThemeToken | undefined; shown: string } | null {
  if (!ts || !isTokenRef(value)) return null;
  return { token: tokenById(ts.project.themes, tokenIdOf(value)), shown: shownColor(ts.project, ts.canvasTheme, value) };
}

/** Each theme's value of a token as one line of text (Gold #f5b800, Purple #7a4ca0, ...), for a tooltip. */
export function tokenSummary(project: Project, token: ThemeToken): string {
  const t = project.themes;
  if (!t) return '';
  return t.list.map((th) => `${th.name} ${tokenValue(t, token, th.id) ?? 'transparent'}`).join(', ');
}

/** Each theme's value of a token, as small swatches with the theme's name. */
export function TokenValues({ project, token }: { project: Project; token: ThemeToken }) {
  const t = project.themes!;
  return (
    <span className="token-values">
      {t.list.map((th) => {
        const v = tokenValue(t, token, th.id) ?? 'transparent';
        return (
          <span key={th.id} className="token-value" title={`${th.name}: ${v}`}>
            <i style={{ background: v }} />
            {th.name}
          </span>
        );
      })}
    </span>
  );
}

/** The Tokens tab of the colour picker: pick a token and the colour follows it. */
export function TokensTab({ ts, value, onPick }: { ts: { project: Project; canvasTheme: string | null }; value: string; onPick: (ref: string) => void }) {
  const { project, canvasTheme } = ts;
  const t = project.themes;
  const theme = shownTheme(project, canvasTheme);
  if (!t?.tokens.length || !theme) {
    return (
      <div className="token-empty">
        <p className="muted small">No theme tokens yet. A token is a colour with a value for each theme (Light, Dark, High contrast); a layer that uses one changes with the theme.</p>
        <button className="btn small-btn" title="Add Light, Dark and High contrast themes with starter colours (background, text, primary and so on)" onClick={() => store().update((d) => void ensureThemes(d))}>
          Add the starter themes
        </button>
        <button className="btn small-btn" title="Open the Themes panel under the canvas" onClick={() => store().set({ bottomTab: 'themes' })}>
          Open Themes
        </button>
      </div>
    );
  }
  return (
    <div className="token-list" role="listbox" aria-label="Theme tokens">
      {t.tokens.map((token) => {
        const on = value === tokenRef(token.id);
        const v = tokenValue(t, token, theme.id) ?? 'transparent';
        return (
          <button key={token.id} type="button" role="option" aria-selected={on} className={`token-row${on ? ' on' : ''}`} title={`${token.name}: ${t.list.map((th) => `${th.name} ${tokenValue(t, token, th.id) ?? ''}`).join(', ')}`} onClick={() => onPick(tokenRef(token.id))}>
            <i className="token-swatch" style={{ background: v }} />
            <span className="token-name">{token.name}</span>
            <TokenValues project={project} token={token} />
          </button>
        );
      })}
      <button type="button" className="token-row token-more" onClick={() => store().set({ bottomTab: 'themes' })} title="Add, rename and recolour tokens in the Themes panel under the canvas">
        <Icons.themes width={12} /> Edit tokens…
      </button>
    </div>
  );
}
