import { useEffect, useMemo, useState } from 'react';
import { store, useEditor } from '../store/store';
import { ICON_COLOURS, defaultIconColour, iconNode, iconPaints, loadStockIcons, searchIcons, type IconColour, type StockIcon } from '../lib/stock-icons';
import { track } from '../lib/analytics';
import type { Project } from 'interactives-player';

/**
 * The Icons tab: the Toolbox's own Icon Set (the 25 icons it puts on StudyDesk pages), searched by plain words and added to
 * the artboard as ordinary vector layers (a ring and a glyph, each takes its own colour). Pick a colour first: one of the
 * Toolbox's theme colours, or Follow theme, which paints them with the project's colour tokens so a theme change recolours them.
 */
export function IconsPanel() {
  const project = useEditor((st) => st.project);
  const [icons, setIcons] = useState<StockIcon[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<IconColour | null>(null);
  const colour = picked ?? defaultIconColour(project);
  useEffect(() => {
    let live = true;
    void loadStockIcons().then((l) => live && setIcons(l));
    return () => void (live = false);
  }, []);
  const shown = useMemo(() => (icons ? searchIcons(icons, query) : []), [icons, query]);
  const { ring, glyph } = iconPaints(colour, project);
  // a theme colour in the preview is the colour it would have in the shown theme
  const hasTheme = !!project.themes?.tokens?.length;

  const add = (icon: StockIcon) => {
    const st = store();
    const ab = st.artboard();
    if (!ab) return;
    const node = iconNode(icon, colour, project, {
      x: ab.width / 2,
      y: ab.height / 2,
    });
    st.addNodes([node], { artboardId: ab.id });
    st.set({ tool: 'select' });
    track('feature', 'stock-icon', { thing: icon.id, detail: { colour } });
    st.toast(`Added the ${icon.title} icon. Select its ring or its icon to change a colour.`);
  };

  return (
    <div className="icons-panel">
      <div className="icons-bar">
        <input
          type="search"
          className="icons-search"
          placeholder="Search icons: bell, tick, speech bubble…"
          aria-label="Search icons"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="icons-colours" role="radiogroup" aria-label="Icon colour">
          {ICON_COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={colour === c.id}
              aria-label={c.name}
              title={c.name}
              className={`icons-dot${colour === c.id ? ' on' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setPicked(c.id)}
            />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={colour === 'theme'}
            className={`icons-theme${colour === 'theme' ? ' on' : ''}`}
            title={
              hasTheme
                ? 'Paint the icon with the project’s colour tokens, so it follows the theme'
                : 'Paint the icon with the starter colours. Once the project has themes (the Themes tab) it follows them'
            }
            onClick={() => setPicked('theme')}
          >
            Follow theme
          </button>
        </div>
      </div>
      {!icons ? (
        <p className="hint" role="status">
          Loading the icons…
        </p>
      ) : shown.length === 0 ? (
        <p className="hint" role="status">
          No icon matches “{query}”. Try a plainer word, like arrow, clock, heart or speech.
        </p>
      ) : (
        <ul className="icons-grid" aria-label={`${shown.length} ${shown.length === 1 ? 'icon' : 'icons'}`}>
          {shown.map((icon) => (
            <li key={icon.id}>
              <button type="button" className="icons-item" onClick={() => add(icon)} title={`Add the ${icon.title} icon to the artboard`} aria-label={`Add the ${icon.title} icon`}>
                <span className="icons-preview" aria-hidden="true">
                  <svg viewBox="0 0 32 32" width="40" height="40" focusable="false">
                    {icon.ring.map((d, i) => (
                      <path key={`r${i}`} d={d} fill={previewColour(ring, project)} />
                    ))}
                    {icon.glyph.map((d, i) => (
                      <path key={`g${i}`} d={d} fill={previewColour(glyph, project)} />
                    ))}
                  </svg>
                </span>
                <span>{icon.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">The Toolbox’s own Icon Set. They arrive as vector layers: select the ring or the icon to give it another colour.</p>
    </div>
  );
}

/** A token reference can't be drawn in a plain svg, so the preview uses the colour the default theme gives it. */
function previewColour(c: string, project: Project): string {
  if (!c.startsWith('token:')) return c;
  const id = c.slice('token:'.length);
  const tk = project.themes?.tokens.find((t) => t.id === id);
  const themeId = project.themes?.default ?? project.themes?.list[0]?.id;
  return (tk && themeId ? tk.values[themeId] : undefined) ?? '#777777';
}
