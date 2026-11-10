//The accessibility tutorial's finished project. `planted()` is the page as the tutorial's first steps make it, with its
//problems in; `build()` is the same page after the steps fix them (the example). The test checks the checker finds the
//planted problems and nothing in the fixed one.
import type { Project } from 'interactives-player';
import { drawn, svgAsset, timeline, token, whenClickedShow } from './_design-helpers';
import { blankProject, type TutorialExample } from './kit';

const MARS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#0b0b1a"/><circle cx="100" cy="100" r="78" fill="#c1440e"/><circle cx="72" cy="78" r="14" fill="#a3380c"/><circle cx="128" cy="122" r="20" fill="#a3380c"/><circle cx="118" cy="66" r="8" fill="#d9662f"/><ellipse cx="100" cy="30" rx="26" ry="8" fill="#f4e9e1"/></svg>`;

export const FACT = 'Mars has the tallest volcano we know of: Olympus Mons, about 22 km high.';

/** The page before the fixes: muted heading, an undescribed picture, a tiny clickable dot, a looping fade, the Next button first in the Tab order. */
export function planted(): Project {
  const p = blankProject('Mars fact');
  const ab = p.artboards[0];
  const title = drawn(p, 'text', { name: 'Title', text: 'Mars, the red planet', x: 60, y: 48, width: 680, height: 44, fontSize: 32, fontWeight: 700, color: token(p, 'color/muted') });
  const photo = drawn(p, 'image', { name: 'Mars photo', x: 60, y: 130, width: 300, height: 300, assetId: svgAsset(p, 'mars.svg', MARS) });
  const fact = drawn(p, 'text', { name: 'Fact', text: FACT, x: 420, y: 200, width: 320, height: 84, fontSize: 20 });
  const next = drawn(p, 'button', { name: 'Next', label: 'Next', x: 600, y: 500 });
  const info = drawn(p, 'ellipse', { name: 'Info', x: 380, y: 150, width: 20, height: 20, fill: { type: 'solid', color: token(p, 'color/button') } });
  ab.children.push(title, photo, fact, next, info);
  whenClickedShow(ab, info.id, fact);
  timeline(ab, 'Timeline', { loop: 'loop', autoplay: true }, [{ nodeId: photo.id, prop: 'opacity', keys: [[0, 0], [1000, 1]] }]);
  return p;
}

/** The same page with every fix the tutorial makes. */
function build(): Project {
  const p = planted();
  const ab = p.artboards[0];
  const find = (name: string) => ab.children.find((n) => n.name === name)!;
  const title = find('Title') as { color: string; role?: string; headingLevel?: number };
  title.color = token(p, 'color/text');
  title.role = 'heading';
  title.headingLevel = 1;
  find('Mars photo').ariaLabel = 'Mars from space: a red, dusty planet with a white ice cap at the top';
  const info = find('Info');
  Object.assign(info, { role: 'button', focusable: true, ariaLabel: 'Show a fact about Mars', width: 32, height: 32, x: 374, y: 144 });
  info.tabOrder = 1;
  find('Next').tabOrder = 2;
  ab.timelines[0].loop = 'once';
  p.settings.reducedMotion = true;
  return p;
}

export const example: TutorialExample = {
  key: 'tut-accessible',
  topic: 'tutorial-accessible',
  title: 'Check and fix accessibility',
  description: 'A one-page Mars fact that passes the accessibility checks: a heading, a described picture, a clickable dot a keyboard can use, an animation that plays once, and a sensible Tab order. The Check and fix accessibility tutorial\'s project.',
  tags: ['accessibility', 'keyboard', 'screen reader', 'contrast'],
  build,
  notes: [
    { text: '**Open the Accessibility tab: nothing to fix.** The tutorial starts from this page with five problems planted in it and fixes each one. Read the steps to see what was wrong.' },
    { text: '**The round dot is a button now.** Select *Info* and look at its Accessibility section: Role is Button and the Text alternative says what it does, so Tab reaches it and Enter or Space clicks it.', colour: 'sky' },
  ],
};
