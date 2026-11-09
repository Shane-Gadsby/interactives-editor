import { setPrefs, usePrefs } from '../lib/prefs';
import { CODE_THEMES } from '../lib/code-theme';

/** Code editor colours, as a small switch for the headers of the code boxes. The same preference as Preferences, so it reaches every code editor at once. */
export function CodeThemeSwitch() {
  const { codeTheme } = usePrefs();
  return (
    <div className="code-theme-switch" role="group" aria-label="Code editor colours" title="Colours of the code boxes (Scripts, raw data text and code fields). Follow the editor goes light or dark with the editor's theme">
      <span className="code-theme-label" aria-hidden="true">
        Code colours
      </span>
      <div className="seg">
        {CODE_THEMES.map((c) => (
          <button key={c.value} type="button" className={`seg-btn${codeTheme === c.value ? ' on' : ''}`} aria-pressed={codeTheme === c.value} title={c.tip} onClick={() => setPrefs({ codeTheme: c.value })}>
            {c.value === 'follow' ? 'Follow' : c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
