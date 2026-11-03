import { useEffect, useState } from 'react';
import { Home } from './Home';
import { Editor } from './Editor';
import { HelpHost, HelpPage } from './help/Help';
import { installTooltips } from './components/tooltips';
import { sessionUser } from './lib/session';
import { loadUserPrefs } from './lib/prefs'; // importing applies the cached theme before the first paint

type Route = { page: 'home' } | { page: 'editor'; id: string } | { page: 'help'; id: string; anchor?: string };

/** Hash routes: `#/` projects list, `#/p/<id>` editor, `#/help/<topic>[/<anchor>]` help. Hash routing keeps the server to one document. */
function parse(): Route {
  const m = /^#\/p\/([\w-]+)/.exec(location.hash);
  if (m) return { page: 'editor', id: m[1] };
  const h = /^#\/help(?:\/([\w-]+))?(?:\/([\w-]+))?/.exec(location.hash);
  if (h) return { page: 'help', id: h[1] ?? 'welcome', anchor: h[2] };
  return { page: 'home' };
}

installTooltips();
// Ask the toolbox session who this is early (it also stores the session id utilities.js sends with requests)
void sessionUser();
void loadUserPrefs();

export function App() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <>
      {route.page === 'editor' ? (
        <Editor key={route.id} projectId={route.id} home={() => (location.hash = '#/')} />
      ) : route.page === 'help' ? (
        <HelpPage id={route.id} anchor={route.anchor} />
      ) : (
        <Home open={(id) => (location.hash = `#/p/${id}`)} />
      )}
      <HelpHost />
    </>
  );
}
