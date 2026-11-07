import { useMemo } from 'react';
import { defaultTheme, tokenValue, type ProjectThemes, type ThemeDef, type ThemeToken } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { CheckField, ColorField, IconButton, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { ThemeFixedHint } from '../components/ThemeFixedHint';
import { linkColoursCommand } from '../lib/link-colours-action';
import { confirmDialog, promptDialog } from '../components/dialogs';
import { addTheme, addToken, checkThemePairs, convertStylesToTokens, ensureThemes, removeTheme, removeToken, setTokenValue, starterUpgrade, themeCounts, upgradeStarterTokens, type PairResult } from '../lib/themes';

/** The Themes tab: tokens down the side, themes across, a colour in each cell. */
export function ThemesPanel() {
  const project = useEditor((s) => s.project);
  const shown = useEditor((s) => s.canvasTheme);
  const themes = project.themes;
  const counts = useMemo(() => themeCounts(project), [project]);
  const pairs = useMemo(() => checkThemePairs(themes), [themes]);
  const edit = (fn: (d: typeof project) => void, coalesce?: string) => store().update((d) => fn(d), { coalesce });
  const styleCount = (project.styles?.colors ?? []).filter((s) => !s.token).length;
  const upgrade = useMemo(() => starterUpgrade(themes), [themes]);

  if (!themes?.list.length) {
    return (
      <div className="themes-panel">
        <div className="themes-empty">
          <p>
            <strong>Themes</strong> let one interactive look right in light, dark and high contrast. A colour token is a name (like <code>color/primary</code>) with a colour for each theme; a fill, stroke or text colour that uses it changes when the theme does.
          </p>
          <p className="muted small">Nothing changes until a layer uses a token. Imported files keep their own colours.</p>
          <button className="btn primary" title="Add Light, Dark and High contrast themes with starter tokens in the toolbox look: greys, gold buttons with black text, outlines, the focus ring and the right, wrong and missed colours" onClick={() => edit((d) => void ensureThemes(d))}>
            <Icons.plus width={13} /> Add Light, Dark and High contrast
          </button>
          {styleCount > 0 && (
            <button className="btn" title="Make a token from each colour style, and point the layers that follow a style at it" onClick={() => edit((d) => void convertStylesToTokens(d))}>
              Convert {styleCount} colour {styleCount === 1 ? 'style' : 'styles'} to tokens
            </button>
          )}
        </div>
      </div>
    );
  }

  const failing = (themeId: string, token: ThemeToken): PairResult[] => pairs.filter((p) => !p.pass && p.themeId === themeId && pairUses(p, token));
  const newTheme = async () => {
    const name = await promptDialog({ title: 'New theme', label: 'Name', placeholder: 'Sepia', message: 'It starts as a copy of the default theme.' });
    if (name?.trim()) edit((d) => void addTheme(d, name));
  };
  const newToken = async () => {
    const name = await promptDialog({ title: 'New token', label: 'Name', placeholder: 'color/accent', message: 'Names like color/primary keep the list tidy. The Moodle preset looks for the starter names.' });
    if (name?.trim()) edit((d) => void addToken(d, name));
  };
  const dropTheme = async (t: ThemeDef) => {
    if (!(await confirmDialog({ title: `Delete the ${t.name} theme?`, message: 'Its colours are lost. Layers that use tokens are not changed.', confirmLabel: 'Delete' }))) return;
    edit((d) => void removeTheme(d, t.id));
    if (shown === t.id) store().set({ canvasTheme: null });
  };
  const dropToken = async (t: ThemeToken) => {
    const n = counts.used.get(t.id) ?? 0;
    if (n && !(await confirmDialog({ title: `Delete ${t.name}?`, message: `${n} ${n === 1 ? 'place uses' : 'places use'} it. They keep the colour it has in the default theme, as plain colours.`, confirmLabel: 'Delete' }))) return;
    edit((d) => void removeToken(d, t.id));
  };
  const def = defaultTheme(themes);

  return (
    <div className="themes-panel">
      <div className="themes-toolbar">
        <SelectField
          label="Showing"
          title="The theme the canvas draws while you edit. It is not saved with the project"
          value={shown && themes.list.some((t) => t.id === shown) ? shown : def.id}
          options={themes.list.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => store().set({ canvasTheme: v })}
        />
        <button className="btn small-btn" onClick={newTheme} title="Add a theme: a new column of colours, copied from the default theme">
          <Icons.plus width={12} /> Theme
        </button>
        <button className="btn small-btn" onClick={newToken} title="Add a token: a named colour with a value in every theme">
          <Icons.plus width={12} /> Token
        </button>
        {styleCount > 0 && (
          <button
            className="btn small-btn"
            onClick={() => edit((d) => void convertStylesToTokens(d))}
            title="Make a token from each colour style (the same colour in every theme to start with) and point the layers that follow a style at it. Styles from libraries convert too, and a library update keeps the link"
          >
            Convert {styleCount} colour {styleCount === 1 ? 'style' : 'styles'} to tokens
          </button>
        )}
        {(upgrade.restyle.length > 0 || upgrade.missing.length > 0) && (
          <button
            className="btn small-btn"
            onClick={() => {
              edit((d) => void upgradeStarterTokens(d));
              store().toast('Starter colours updated. Layers that follow a token changed with it; plain colours and tokens you edited did not.');
            }}
            title={`Move the starter tokens to the toolbox look. ${upgrade.restyle.length ? `Starter tokens you never edited get the new colours (${upgrade.restyle.map((t) => t.name).join(', ')}). ` : ''}${upgrade.missing.length ? `Adds the ones this project lacks (${upgrade.missing.length}). ` : ''}Layers that follow a token change with it. Plain colours and tokens you edited stay as they are`}
          >
            Update starter colours
          </button>
        )}
        <div className="spacer" />
        {counts.raw > 0 && (
          <button className="btn small-btn" onClick={() => void linkColoursCommand()} title="Turn each plain colour that is the same as a token's colour in the default theme into that token, so it changes with the theme. It says what it will do first, lists the colours that match nothing, and is one undo">
            Link colours to tokens
          </button>
        )}
        <span className="themes-raw" title="Fills, strokes and text colours that are plain colours. They look the same in every theme. Imported files bring theirs in as plain colours, on purpose">
          {counts.raw} {counts.raw === 1 ? 'colour' : 'colours'} not following a theme
        </span>
      </div>
      <ThemeFixedHint />
      <div className="themes-body">
        <table className="themes-table">
          <thead>
            <tr>
              <th className="tk-name">Token</th>
              {themes.list.map((t) => (
                <th key={t.id} className={`tk-theme${shown === t.id || (!shown && t.id === def.id) ? ' shown' : ''}`}>
                  <div className="theme-head">
                    <TextField value={t.name} commitOnBlur title="The theme's name, as a page or script picks it" onChange={(v) => edit((d) => void (d.themes!.list.find((x) => x.id === t.id)!.name = v.trim() || t.name))} />
                    <IconButton icon={<Icons.eye />} title={`Show ${t.name} on the canvas`} active={shown === t.id || (!shown && t.id === def.id)} onClick={() => store().set({ canvasTheme: t.id })} />
                    <IconButton icon={<Icons.trash />} title={`Delete the ${t.name} theme`} disabled={themes.list.length < 2} onClick={() => dropTheme(t)} />
                  </div>
                  <div className="theme-opts">
                    <select
                      value={t.mode ?? ''}
                      title="Which colour scheme this theme answers to when the player follows the viewer's settings"
                      onChange={(e) => edit((d) => void setMode(d.themes!, t.id, e.target.value))}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <option value="">Any scheme</option>
                      <option value="light">Light scheme</option>
                      <option value="dark">Dark scheme</option>
                    </select>
                    <CheckField label="High contrast" title="Used for viewers who ask for more contrast or forced colours. Host page colours never replace it" value={!!t.highContrast} onChange={(v) => edit((d) => void setHighContrast(d.themes!, t.id, v))} />
                    <CheckField label="Default" title="The theme shown when the viewer's settings don't pick another" value={t.id === def.id} onChange={() => edit((d) => void (d.themes!.default = t.id))} />
                  </div>
                </th>
              ))}
              <th className="tk-used" title="How many fills, strokes and text colours use each token">
                Used
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {themes.tokens.map((token) => (
              <tr key={token.id}>
                <td className="tk-name">
                  <TextField value={token.name} commitOnBlur title="The token's name. Layers keep following it when it is renamed" onChange={(v) => edit((d) => void (d.themes!.tokens.find((x) => x.id === token.id)!.name = v.trim() || token.name))} />
                </td>
                {themes.list.map((t) => {
                  const bad = failing(t.id, token);
                  return (
                    <td key={t.id} className={`tk-cell${bad.length ? ' warn' : ''}`}>
                      <ColorField value={tokenValue(themes, token, t.id) ?? '#808080'} onChange={(c) => edit((d) => setTokenValue(d, token.id, t.id, c), `token-${token.id}-${t.id}`)} onCommit={() => store().commit()} />
                      {token.palette?.[t.id] && (
                        <span className="tk-link" title={`Follows ${token.palette[t.id]} in the shared StudyDesk palette, so it changes when the palette does. Changing the colour here unlinks it`}>
                          <Icons.link width={11} />
                        </span>
                      )}
                      {bad.length > 0 && (
                        <span className="tk-warn" title={bad.map((p) => `${p.label}: ${p.ratio.toFixed(2)}:1, needs ${p.need}:1`).join('\n')}>
                          {bad[0].ratio.toFixed(1)}:1
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="tk-used">{counts.used.get(token.id) ?? 0}</td>
                <td>
                  <IconButton icon={<Icons.trash />} title={`Delete ${token.name}`} onClick={() => dropToken(token)} />
                </td>
              </tr>
            ))}
            {!themes.tokens.length && (
              <tr>
                <td colSpan={themes.list.length + 3} className="muted small">
                  No tokens yet. Add one, or convert your colour styles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <aside className="themes-side">
          <div className="field-label block">When the interactive plays</div>
          <CheckField
            label="Follow the viewer's settings"
            title="Pick a theme from the viewer's colour scheme (prefers-color-scheme), their contrast setting (prefers-contrast) and forced colours, unless the page or a script chose one"
            value={themes.follow !== false}
            onChange={(v) => edit((d) => void (v ? delete d.themes!.follow : (d.themes!.follow = false)))}
          />
          <CheckField
            label="Map tokens from the page's CSS variables"
            title="A token can take its colour from a CSS variable on the page that holds the player (Moodle's --bs-primary and friends). A missing variable falls back to the theme's colour"
            value={!!themes.host?.enabled}
            onChange={(v) => edit((d) => void (d.themes!.host = { ...d.themes!.host, enabled: v }))}
          />
          {themes.host?.enabled && (
            <SelectField
              label="Preset"
              title="Moodle maps color/primary to --bs-primary, color/background to --bs-body-bg, color/text to --bs-body-color, and so on for the starter token names"
              value={themes.host.preset ?? ''}
              options={[
                { value: '', label: 'None (only your own map)' },
                { value: 'moodle', label: 'Moodle' },
              ]}
              onChange={(v) => edit((d) => void (v ? (d.themes!.host!.preset = 'moodle') : delete d.themes!.host!.preset))}
            />
          )}
          {themes.host?.enabled && themes.tokens.map((t) => (
            <TextField
              key={t.id}
              label={t.name}
              mono
              commitOnBlur
              placeholder="--my-variable"
              title={`CSS variable names (comma separated, tried in order) that supply ${t.name}. Leave empty to use the preset's, or the theme's colour`}
              value={themes.host?.map?.[t.id] ?? ''}
              onChange={(v) => edit((d) => void setHostVar(d.themes!, t.id, v))}
            />
          ))}
          <div className="field-label block">Contrast</div>
          <ContrastList themes={themes} pairs={pairs} />
        </aside>
      </div>
    </div>
  );
}

function setMode(t: ProjectThemes, id: string, mode: string): void {
  const th = t.list.find((x) => x.id === id);
  if (!th) return;
  if (mode === 'light' || mode === 'dark') th.mode = mode;
  else delete th.mode;
}

function setHighContrast(t: ProjectThemes, id: string, on: boolean): void {
  const th = t.list.find((x) => x.id === id);
  if (!th) return;
  if (on) th.highContrast = true;
  else delete th.highContrast;
}

function setHostVar(t: ProjectThemes, tokenId: string, text: string): void {
  t.host ??= { enabled: true };
  const v = text.trim();
  if (v) (t.host.map ??= {})[tokenId] = v;
  else if (t.host.map) delete t.host.map[tokenId];
}

/** Whether a failing pair is about this token (by name, so two tokens with one colour are told apart). */
function pairUses(p: PairResult, token: ThemeToken): boolean {
  const name = token.name.trim().toLowerCase();
  return p.fgName === name || p.bgName === name;
}

function ContrastList({ themes, pairs }: { themes: ProjectThemes; pairs: PairResult[] }) {
  if (!pairs.length) return <p className="muted small">Name tokens color/text, color/background, color/primary and so on to have the pairs checked in every theme.</p>;
  const bad = pairs.filter((p) => !p.pass);
  return (
    <div className="themes-contrast">
      <p className={bad.length ? 'tk-bad small' : 'muted small'} role="status">
        {bad.length ? `${bad.length} of ${pairs.length} pairs are too low.` : `All ${pairs.length} pairs pass.`}
      </p>
      {bad.map((p, i) => (
        <div key={i} className="contrast-row" title={`${p.foreground} on ${p.background}`}>
          <span className="contrast-sample" style={{ color: p.foreground, background: p.background }}>
            Aa
          </span>
          <span>
            {themes.list.find((t) => t.id === p.themeId)?.name}: {p.label} {p.ratio.toFixed(2)}:1 <span className="muted">(needs {p.need}:1)</span>
          </span>
        </div>
      ))}
    </div>
  );
}
