import { useEffect, useState } from 'react';
import { ShortcutsHost } from './components/ShortcutsModal';
import { Home } from './Home';
import { UsagePage } from './UsagePage';
import { AdminPage } from './AdminPage';
import { Editor } from './Editor';
import { Review } from './Review';
import { HelpHost, HelpPage } from './help/Help';
import { DialogHost } from './components/dialogs';
import { BehaviourHost } from './components/BehaviourDialog';
import { installTooltips } from './components/tooltips';
import { sessionUser } from './lib/session';
import { installStaleBuildNotice } from './lib/stale-build';
import { installAnalytics, track } from './lib/analytics';
import { rememberLeft } from './lib/home-return';
import { loadUserPrefs } from './lib/prefs'; // importing applies the cached theme before the first paint

type Route = { page: 'home' } | { page: 'usage' } | { page: 'admin' } | { page: 'review'; token: string } | { page: 'editor'; id: string } | { page: 'help'; id: string; anchor?: string };

/** Hash routes: `#/` projects list, `#/p/<id>` editor, `#/help/<topic>[/<anchor>]` help. Hash routing keeps the server to one document. */
function parse(): Route {
  const r = /^#\/review\/([\w-]{16,64})/.exec(location.hash);
  if (r) return { page: 'review', token: r[1] };
  const m = /^#\/p\/([\w-]+)/.exec(location.hash);
  if (m) return { page: 'editor', id: m[1] };
  if (/^#\/usage\b/.test(location.hash)) return { page: 'usage' };
  if (/^#\/admin\b/.test(location.hash)) return { page: 'admin' };
  const h = /^#\/help(?:\/([\w-]+))?(?:\/([\w-]+))?/.exec(location.hash);
  if (h) return { page: 'help', id: h[1] ?? 'welcome', anchor: h[2] };
  return { page: 'home' };
}

installAnalytics();
installTooltips();
installStaleBuildNotice();
// Ask the toolbox session who this is early (it also stores the session id utilities.js sends with requests)
void sessionUser();
void loadUserPrefs();

export function App() {
  const [route, setRoute] = useState(parse);
  // Which page: the projects list and the help pages (the editor says it opened a project itself)
  useEffect(() => {
    if (route.page === 'home') track('project', 'list');
    else if (route.page === 'help') track('help', 'page', { thing: /^[\w-]{1,40}$/.test(route.id) ? route.id : 'other' });
  }, [route.page, route.page === 'help' ? route.id : '']);
  useEffect(() => {
    const on = () =>
      setRoute((was) => {
        const next = parse();
        //leaving a project for the list by any road (Home button, browser Back) remembers which one
        if (was.page === 'editor' && next.page === 'home') rememberLeft(was.id);
        return next;
      });
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <>
      {route.page === 'review' ? (
        <Review key={route.token} token={route.token} />
      ) : route.page === 'editor' ? (
        <Editor key={route.id} projectId={route.id} home={() => (location.hash = '#/')} />
      ) : route.page === 'usage' ? (
        <UsagePage />
      ) : route.page === 'admin' ? (
        <AdminPage />
      ) : route.page === 'help' ? (
        <HelpPage id={route.id} anchor={route.anchor} />
      ) : (
        <Home open={(id) => (location.hash = `#/p/${id}`)} />
      )}
      <HelpHost />
      <ShortcutsHost />
      <DialogHost />
      <BehaviourHost />
    </>
  );
}
