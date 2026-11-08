/**
 * The last pass over a built starter, for what is the same on every starter and so is not each one's to remember:
 *
 *   gradient pages   a button on a hero or end page (a gradient behind it) is a primary one: the button colour with a stroke in its label
 *                    colour. A white one with a grey outline stands off a dark gradient but not a gold one
 *   control edges    a button or clickable frame filled with a colour and no stroke gets one: in the label colour when it is filled with the
 *                    button (or primary) colour, in the border colour otherwise. A fill alone can be the page's own colour (gold on white in
 *                    Purple, the Blue hero's own blue), and the edge of a control is what tells someone it is one (WCAG 1.4.11, 3:1)
 *
 * Run by `projectFromBrandedStarter` before the layout is settled. Only the colours it writes are tokens, and only layers that have no
 * stroke of their own are touched.
 */
import { isContainer, tokenByName, type Artboard, type Project, type SceneNode } from 'interactives-player';

type Painted = SceneNode & { fill?: { type?: string; color?: string; opacity?: number } | null; stroke?: { paint: unknown; width: number } | null; color?: string; role?: string; focusable?: boolean };

export function finishControls(project: Project): void {
  const t = project.themes;
  if (!t) return;
  const ref = (name: string) => {
    const tk = tokenByName(t, name);
    return tk ? `token:${tk.id}` : null;
  };
  const button = ref('color/button');
  const primary = ref('color/primary');
  const onButton = ref('color/on-button');
  const background = ref('color/background');
  const border = ref('color/border');
  if (!button || !onButton || !border || !background) return;
  const line = (color: string) => ({ paint: { type: 'solid' as const, color }, width: 1.5 });
  const isControl = (n: Painted) => n.type === 'button' || ((n.type === 'frame' || n.type === 'group') && (n.role === 'button' || n.role === 'checkbox' || n.role === 'radio' || !!n.focusable));
  for (const page of project.artboards as Artboard[]) {
    if (page.isMaster) continue;
    const onGradient = page.background?.type === 'linear' || page.background?.type === 'radial';
    const visit = (list: SceneNode[]) => {
      for (const raw of list) {
        const n = raw as Painted;
        if (n.type === 'button' && onGradient && n.fill?.type === 'solid' && n.fill.color === background) {
          n.fill = { ...n.fill, color: button };
          n.color = onButton;
          n.stroke = line(onButton);
        }
        const solid = n.fill?.type === 'solid' && n.fill.color && !/^#[0-9a-f]{6}00$/i.test(n.fill.color) ? n.fill : null;
        if (isControl(n) && solid && (!n.stroke || n.stroke.width < 1)) n.stroke = line(solid.color === button || solid.color === primary ? onButton : border);
        if (isContainer(n)) visit(n.children);
      }
    };
    visit(page.children);
  }
}
