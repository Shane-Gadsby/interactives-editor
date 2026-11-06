import { defaultTheme, type Project } from 'interactives-player';
import { addLearnerSwitcher, colourwayThemes, hasLearnerSwitcher, removeLearnerSwitcher, setColourway } from '../lib/branded/colourway';
import { COLOURWAYS } from '../lib/branded/looks';
import { ColourwaySwatches } from '../components/ColourwaySwatches';
import { CheckField } from '../components/ui';
import { store } from '../store/store';

/** Switch a branded project's colourway (the theme it opens in) and say whether learners get a switcher, in the Project settings. */
export function ColourwayRow({ project }: { project: Project }) {
  const ways = colourwayThemes(project);
  if (!project.brandLook || !ways.length) return null;
  const current = defaultTheme(project.themes!);
  const value = ways.find((w) => w.theme.id === current?.id)?.way.id ?? '';
  const pick = (id: string) => {
    const hit = ways.find((w) => w.way.id === id);
    if (!hit) return;
    store().update((d) => void setColourway(d as Project, hit.theme.id));
    //The canvas shows the default theme unless one was picked in its own switch, which would hide this change
    store().set({ canvasTheme: null });
  };
  return (
    <div className="colourway-row">
      <span className="field-label" title="The theme this project opens in. Every colour in it follows the colourway, and you can undo the change">
        Colourway
      </span>
      <ColourwaySwatches ways={COLOURWAYS.filter((c) => ways.some((w) => w.way.id === c.id))} value={value} onPick={pick} />
      <CheckField
        label="Let learners switch colourway"
        title="Adds a small row of colour swatches to the start page. Learners pick one and the whole activity changes colour. They are brand layers, so they stay as they are"
        value={hasLearnerSwitcher(project)}
        onChange={(on) => store().update((d) => void (on ? addLearnerSwitcher(d as Project) : removeLearnerSwitcher(d as Project)), { brand: true })}
      />
    </div>
  );
}
