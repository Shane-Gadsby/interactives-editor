import { useEffect, useState } from 'react';
import { Home } from './Home';
import { Editor } from './Editor';

/** Hash routes: `#/` projects list, `#/p/<id>` editor. Hash routing keeps the server to one document. */
function parse(): { page: 'home' } | { page: 'editor'; id: string } {
  const m = /^#\/p\/([\w-]+)/.exec(location.hash);
  return m ? { page: 'editor', id: m[1] } : { page: 'home' };
}

export function App() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (route.page === 'editor') return <Editor key={route.id} projectId={route.id} home={() => (location.hash = '#/')} />;
  return <Home open={(id) => (location.hash = `#/p/${id}`)} />;
}
