//Live sound lab: the microphone drives the screen and nothing is recorded. Two scenes after the hero page: a loudness meter with a target band
//(steady volume practice, or a workplace noise check worded as a rough guide) and eight frequency bars ("whistle higher, what changed?").
//The numbers are micLevel and micBands, which the player keeps up to date about 25 times a second while a Listen live node has the microphone on.
//Every display reads `listening ? micLevel : simLevel` (and the same for the bands), and a slider makes simLevel and simPitch, so each scene
//works with no microphone at all: denied, no device, blocked by the course page, switched off by the learner, or just a quiet room.
//Phone and laptop microphones tidy the sound themselves (automatic gain, noise removal), so the starter says "rough guide" wherever it shows a level.
//No pitch tracking: the bars show where the sound is, not which note it is.
import { createNode, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { Graph, addVar, announce, bind, go, heroPage, set, spreadPages } from '../games/common';

//The meter's width, and the bars' plot height, in page pixels
const W = 576;
const H = 248;

//The bands the page reports, low to high (the player's BAND_EDGES: 80 to 8000 Hz, log-spaced). What each is "roughly" is only a guide
const BANDS = [
  { label: '80-140', what: 'very low hum' },
  { label: '140-250', what: 'low voice' },
  { label: '250-450', what: 'voice' },
  { label: '450-800', what: 'voice and vowels' },
  { label: '0.8-1.4k', what: 'voice and whistling' },
  { label: '1.4-2.5k', what: 'whistling and "ee" vowels' },
  { label: '2.5-4.5k', what: 'high whistling and "sh" sounds' },
  { label: '4.5-8k', what: '"s" and "f" hiss' },
];

//What the displays read: the live microphone while listening, the slider otherwise
const LEVEL = '(listening ? micLevel : simLevel)';
const NOW = '(listening ? micBands : [0, 1, 2, 3, 4, 5, 6, 7].map(i => simLevel * Math.max(0, 1 - Math.abs(i - simPitch) / 1.8)))';
const IDLE = '(!listening && simLevel == 0)';

const noMic = 'microphone == "ready" ? "Nothing is recorded. The page only measures the sound." : (mediaMessage != "" ? mediaMessage : "There is no microphone here.") + " Use the slider instead."';

function build(colourway: Parameters<BrandedStarter['build']>[0]) {
  const ctx = brandedProject(colourway, 'Live sound lab');
  const { project, L } = ctx;
  //Listening only, and never recording: the page refuses every Start recording, and the consent screen says so
  project.settings.sensors = { microphone: true, listen: true, listenOnly: true, purpose: 'move a meter and some bars with the sound around you' };

  const use = addVar(project, 'use', 'string', 'steady');
  addVar(project, 'steadyLo', 'number', 0.35);
  addVar(project, 'steadyHi', 'number', 0.6);
  addVar(project, 'noiseLine', 'number', 0.7);
  const bandLo = addVar(project, 'bandLo', 'number', 0.35);
  const bandHi = addVar(project, 'bandHi', 'number', 0.6);
  const simLevel = addVar(project, 'simLevel', 'number', 0);
  const simPitch = addVar(project, 'simPitch', 'number', 3);
  const zone = addVar(project, 'zone', 'string', 'low');
  const steady = addVar(project, 'steady', 'number', 0);
  const best = addVar(project, 'best', 'number', 0);
  const peak = addVar(project, 'peak', 'number', -1);
  const shown = addVar(project, 'shown', 'boolean', false);
  addVar(project, 'bandLabels', 'list', BANDS);

  const hero = heroPage(ctx, 'Live sound lab', 'Watch your voice move a loudness meter and a set of sound bars. The microphone only measures, and nothing is recorded.');
  const meter = brandedPage(ctx, 'How loud am I?', { footer: 'Live sound lab. A rough guide, nothing is recorded' });
  const bars = brandedPage(ctx, 'Which sounds are high, which are low?', { footer: 'Live sound lab. A rough guide, nothing is recorded' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(meter));
  checklist.push(item('Write the title and the line under it on the first page. Keep the sentence that says nothing is recorded: it is true, and it is the reason a learner can say yes', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  const box = contentBox(meter);
  const rx = box.x + W + 32;
  const rw = box.width - W - 32;

  //A slider that writes a number variable, labelled for a screen reader
  const slider = (name: string, label: string, v: typeof simLevel, x: number, y: number, w: number, min: number, max: number, step: number, describe: string) =>
    bind(
      createNode('input', {
        name,
        ...lookDefaults(project, 'input'),
        inputType: 'range',
        variableId: v.id,
        min,
        max,
        step,
        value: String(min),
        x,
        y,
        width: w,
        height: 32,
        fontFamily: BRAND_FONT,
        color: L.button,
        ariaLabel: label,
      } as never),
      { visible: '!listening', ariaDescription: describe },
    );
  const small = (name: string, value: string, x: number, y: number, w: number, extra: Record<string, unknown> = {}) => text(ctx, name, value, x, y, w, { fontSize: 14, color: L.muted, lineHeight: 1.35, ...extra });

  //Start and Stop, the message under them and the slider's explanation: the same on both scenes
  const micControls = (page: typeof meter, g: Graph, y: number) => {
    const start = bind(button(ctx, 'Start listening', 'Start listening', rx, y, rw, true), { visible: '!listening && microphone != "unavailable" && microphone != "off"' });
    start.ariaLabel = 'Start listening with the microphone. Nothing is recorded';
    const stop = bind(button(ctx, 'Stop listening', 'Stop listening', rx, y, rw, true), { visible: 'listening' });
    const msg = small('Microphone message', `{${noMic}}`, rx, y + 54, rw, { autoSize: 'none', height: 52 });
    page.children.push(start, stop, msg);
    //A start that did not work leaves by Could not start: the slider is right there
    const on = g.add('action.listen', { op: 'start', stopOnLeave: true }, g.click(start, 'Start listening'));
    g.add('action.announce', { text: '"The microphone did not start. " + mediaMessage + " Use the slider instead."', politeness: 'polite' }, on, 'failed');
    g.run(g.click(stop, 'Stop listening'), ['action.listen', { op: 'stop' }]);
    return { start, stop, msg };
  };

  // ------------------------------------------------------------------ scene 1: the loudness meter

  //The status line and what it asks for
  const status = text(
    ctx,
    'Status',
    `{${IDLE} ? "Start listening, or move the slider to try it." : use == "steady" ? (zone == "in" ? "In the band. Hold it there." : zone == "low" ? "A little louder." : "A little softer.") : (zone == "high" ? "Loud, for a rough guide." : "Comfortable, for a rough guide.")}`,
    box.x,
    box.y + 4,
    W,
    { fontSize: 28, fontWeight: 700, lineHeight: 1.25, autoSize: 'none', height: 70 },
  );
  const track = createNode('rect', { name: 'Meter track', x: 0, y: 0, width: W, height: 64, cornerRadius: 12, fill: solid(L.surface), stroke: stroke(L.border, 1.5), decorative: true });
  const fill = bind(createNode('rect', { name: 'Meter fill', x: 0, y: 0, width: 0.01, height: 64, cornerRadius: 12, fill: solid(L.muted), stroke: null, decorative: true }), { width: `clamp(${W} * ${LEVEL}, 0.01, ${W})`, 'fill.color': `zone == "in" || (use == "noise" && zone != "high") ? "${L.button}" : "${L.muted}"` });
  //The target band is an outline, so it shows in every colourway and for a viewer who cannot tell the colours apart
  const band = bind(createNode('frame', { name: 'Target band', x: 0, y: -6, width: 100, height: 76, cornerRadius: 10, fill: null, stroke: stroke(L.text, 3), clip: false, decorative: true }), { x: `bandLo * ${W}`, width: `Math.max(8, (bandHi - bandLo) * ${W})` });
  const gauge = createNode('frame', { name: 'Meter', x: box.x, y: box.y + 84, width: W, height: 64, fill: null, stroke: null, clip: false, role: 'region', children: [track, fill, band] }) as FrameNode;
  bind(gauge, { ariaLabel: `"Loudness " + Math.round(${LEVEL} * 100) + " out of 100. " + (use == "steady" ? "Target band " + Math.round(steadyLo * 100) + " to " + Math.round(steadyHi * 100) + "." : "Rough guide line at " + Math.round(noiseLine * 100) + ".")` });
  const quiet = small('Scale quiet', 'Quiet', box.x, box.y + 156, 120);
  const loud = small('Scale loud', 'Loud', box.x + W - 120, box.y + 156, 120, { align: 'right' });
  const bandLabel = bind(small('Band label', '{use == "steady" ? "Target band" : "Rough comfort guide"}', box.x, box.y + 178, 220, { fontWeight: 700, color: L.text }), { x: `${box.x} + bandLo * ${W}` });
  const readout = text(ctx, 'Level readout', `Level: {Math.round(${LEVEL} * 100)} out of 100`, box.x, box.y + 214, W, { fontSize: 18, fontWeight: 600 });
  const stats = bind(text(ctx, 'Steady stats', 'Steady in the band: {steady} s. Best run: {best} s', box.x, box.y + 244, W, { fontSize: 18 }), { visible: 'use == "steady"' });
  const guide = text(
    ctx,
    'Guide',
    '{use == "steady" ? "Read a sentence aloud and keep the bar inside the outlined band. Try to hold it there for ten seconds. A steady voice is easier to listen to than a loud one." : "This is a rough guide only. Phone and laptop microphones adjust their own volume (automatic gain), so the bar shows louder or quieter, not decibels. For a real workplace noise check, use a sound level meter."}',
    box.x,
    box.y + 284,
    W,
    { fontSize: 16, lineHeight: 1.4, color: L.muted, autoSize: 'none', height: 92 },
  );
  meter.children.push(status, gauge, quiet, loud, bandLabel, readout, stats, guide);

  //The right column: what to check, the microphone, and the slider for when there is none
  const modeHead = heading(ctx, 'Mode heading', 'What do you want to check?', rx, box.y + 4, rw, { fontSize: 18 });
  const steadyBtn = button(ctx, 'Steady volume', 'Steady volume', rx, box.y + 34, rw, false);
  const noiseBtn = button(ctx, 'Noise check', 'Noise check', rx, box.y + 88, rw, false);
  bind(steadyBtn, { label: 'use == "steady" ? "Steady volume (selected)" : "Steady volume"', 'fill.color': `use == "steady" ? "${L.surfaceMuted}" : "${L.background}"` });
  bind(noiseBtn, { label: 'use == "noise" ? "Noise check (selected)" : "Noise check"', 'fill.color': `use == "noise" ? "${L.surfaceMuted}" : "${L.background}"` });
  meter.children.push(modeHead, steadyBtn, noiseBtn);
  const g1 = new Graph(meter);
  const mic1 = micControls(meter, g1, box.y + 152);
  const simHead = bind(heading(ctx, 'Slider heading', 'No microphone? Use the slider', rx, box.y + 270, rw, { fontSize: 18 }), { visible: '!listening' });
  const levelSlider = slider('Practice level slider', 'Practice loudness', simLevel, rx, box.y + 300, rw, 0, 1, 0.01, '"Practice loudness " + Math.round(simLevel * 100) + " out of 100"');
  const simRead = bind(small('Practice readout', 'Practice loudness: {Math.round(simLevel * 100)}', rx, box.y + 340, rw), { visible: '!listening' });
  meter.children.push(simHead, levelSlider, simRead);

  const next = button(ctx, 'Next scene', 'Next: sound bars', box.x, box.y + box.height - 46, 240, true);
  const back = button(ctx, 'Back to start', 'Back to the start', box.x + 256, box.y + box.height - 46, 220, false);
  meter.children.push(next, back);
  g1.run(g1.click(next, 'To the bars'), go(bars));
  g1.run(g1.click(back, 'To the start'), go(hero.page));

  g1.run(g1.click(steadyBtn, 'Steady volume'), set(use, '"steady"'), set(bandLo, 'steadyLo'), set(bandHi, 'steadyHi'), set(steady, '0'), set(best, '0'), announce('"Steady volume. Keep the bar inside the outlined band."'));
  g1.run(g1.click(noiseBtn, 'Noise check'), set(use, '"noise"'), set(bandLo, '0'), set(bandHi, 'noiseLine'), set(steady, '0'), set(best, '0'), announce('"Noise check, as a rough guide. This is not a decibel reading."'));
  g1.run(g1.start('Open on steady volume'), set(use, '"steady"'), set(bandLo, 'steadyLo'), set(bandHi, 'steadyHi'), set(steady, '0'), set(best, '0'));

  //Four times a second: which zone the level is in (with a little give so it does not flicker at the edge), and how long it has stayed in the band
  const tick1 = g1.add('event.timer', { ms: 250, repeat: true }, null, 'out', { note: 'Four times a second' });
  g1.run(
    tick1,
    set(zone, `zone == "in" ? (${LEVEL} < bandLo - 0.03 ? "low" : ${LEVEL} > bandHi + 0.03 ? "high" : "in") : (${LEVEL} < bandLo ? "low" : ${LEVEL} > bandHi ? "high" : "in")`),
    set(steady, `use == "steady" && zone == "in" && !${IDLE} ? Math.round((steady + 0.25) * 100) / 100 : 0`),
    set(best, 'Math.max(best, steady)'),
  );
  g1.gap(40);
  //Said once when the zone changes, and only while there is a sound to speak of
  const changed = g1.add('event.variable', { variable: zone.id }, null, 'out', { note: 'The zone changed' });
  const live = g1.add('logic.if', { condition: `!${IDLE}` }, changed);
  g1.add('action.announce', { text: 'use == "steady" ? (zone == "in" ? "In the band." : zone == "low" ? "A little louder." : "A little softer.") : (zone == "high" ? "Loud, for a rough guide." : "Comfortable, for a rough guide.")', politeness: 'polite' }, live, 'true');
  g1.gap(60);

  checklist.push(
    item('Set the target band: Project > Variables > "steadyLo" and "steadyHi" (0 to 1, the part of the meter to aim for) and "noiseLine" (where "loud" starts in the noise check). The sample is a comfortable speaking volume. Move the band to suit your task', byName(meter, 'Target band'), meter),
    item('Check the words around the noise check. It says "rough guide" because phones and laptops adjust the volume themselves (automatic gain), so the bar is not decibels. Do not use it as a safety measurement. For a real workplace noise check, point to a sound level meter and your own policy', guide, meter),
    item('Check the microphone setting: Project > Microphone and camera has Live listening ticked and "Only ever listen, never record", with a sentence for what it is used for. The learners\' consent screen is made from those. Update the Link for StudyDesk after any change, and make sure the StudyDesk page\'s iframe has allow="microphone; camera"', mic1.start, meter),
    item('Keep the slider. It makes the same numbers as the microphone (simLevel and simPitch), so the scenes work for a learner who cannot or would rather not use a microphone, and for a quiet room. If you remove it, add another way for them to finish', levelSlider, meter),
    item('Learners press Start listening on each scene: the microphone is let go when they leave a page. To keep it on across the scenes, untick "Stop when the learner leaves this page" on the Listen live nodes (Interactions tab). The Listening bar at the top of the page always has a Stop', mic1.start, meter),
  );

  // ------------------------------------------------------------------ scene 2: the frequency bars

  const peakText = text(
    ctx,
    'Loudest band',
    '{peak < 0 ? "Make a sound, or move the sliders." : "Loudest band: " + bandLabels[peak].label + " Hz (" + bandLabels[peak].what + ")"}',
    box.x,
    box.y + H + 52,
    W,
    { fontSize: 19, fontWeight: 700, autoSize: 'none', height: 30 },
  );
  const peakColour = `"${L.deep}"`;
  const bar = bind(createNode('rect', { name: 'Bar', x: 0, y: 0, width: 64, height: 3, cornerRadius: 8, fill: solid(L.button), stroke: null, decorative: true }), {
    height: `Math.max(3, ${H} * clamp(${NOW}[index], 0, 1))`,
    y: `${H} - Math.max(3, ${H} * clamp(${NOW}[index], 0, 1))`,
    'fill.color': `index == peak ? ${peakColour} : "${L.button}"`,
  });
  const ground = createNode('rect', { name: 'Bar baseline', x: 0, y: H, width: 64, height: 2, fill: solid(L.border), stroke: null, decorative: true });
  const tag = text(ctx, 'Band name', '{item.label}', 0, H + 6, 64, { fontSize: 12, color: L.muted, align: 'center', autoSize: 'none', height: 16 });
  const cell = createNode('frame', { name: 'Band', x: 0, y: 0, width: 64, height: H + 24, fill: null, stroke: null, clip: false, children: [bar, ground, tag] }) as FrameNode;
  const plot = createNode('frame', {
    name: 'Bars',
    x: box.x,
    y: box.y + 4,
    width: W,
    height: H + 24,
    fill: null,
    stroke: null,
    clip: false,
    role: 'img',
    repeat: { items: 'bandLabels', layout: 'grid', gap: 8, columns: 8 },
    children: [cell],
  } as never) as FrameNode;
  bind(plot, { ariaLabel: '"Eight bars from low sound on the left to high sound on the right. " + (peak < 0 ? "No sound yet." : "The loudest is " + bandLabels[peak].label + " hertz, " + bandLabels[peak].what + ".")' });
  const axis = small('Axis caption', 'Frequency in hertz (Hz), low to high', box.x, box.y + H + 34, W, { fontSize: 13 });
  const note2 = small('Bars note', 'Each bar is a band of sound, from low on the left to high on the right. The page measures the sound on your device and keeps none of it. Microphones tidy the sound themselves, so read the bars as a guide, not a measurement.', box.x, box.y + H + 90, W, { autoSize: 'none', height: 60 });
  bars.children.push(plot, axis, peakText, note2);

  const g2 = new Graph(bars);
  micControls(bars, g2, box.y + 4);
  const simHead2 = bind(heading(ctx, 'Slider heading', 'No microphone? Use the sliders', rx, box.y + 120, rw, { fontSize: 18 }), { visible: '!listening' });
  const loudSlider = slider('Practice loudness slider', 'Practice loudness', simLevel, rx, box.y + 150, rw, 0, 1, 0.01, '"Practice loudness " + Math.round(simLevel * 100) + " out of 100"');
  const pitchLabel = bind(small('Pitch label', 'Practice pitch, low to high', rx, box.y + 188, rw), { visible: '!listening' });
  const pitchSlider = slider('Practice pitch slider', 'Practice pitch, low to high', simPitch, rx, box.y + 210, rw, 0, 7, 0.1, '"Practice pitch: bar " + (Math.round(simPitch) + 1) + " of 8"');
  bars.children.push(simHead2, loudSlider, pitchLabel, pitchSlider);

  const askHead = heading(ctx, 'Challenge heading', 'Try this', rx, box.y + 262, rw, { fontSize: 18 });
  const ask = text(ctx, 'Challenge', '{shown ? "A higher whistle has a higher frequency, so the loudest bar moves to the right. A deeper hum moves it to the left. How loud you are changes how tall the bars are, not which one is loudest." : "Whistle or hum a low note, then a higher one. Which bar is loudest, and which way does it move?"}', rx, box.y + 292, rw, { fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 112 });
  const reveal = button(ctx, 'Show or hide', 'Show what to look for', rx, box.y + 410, rw, false);
  bind(reveal, { label: 'shown ? "Show the question again" : "Show what to look for"' });
  bars.children.push(askHead, ask, reveal);
  g2.run(g2.click(reveal, 'Show or hide the answer'), ['action.setVariable', { variable: shown.id, op: 'toggle' }]);

  const back2 = button(ctx, 'Back to meter', 'Back to the meter', box.x, box.y + box.height - 46, 240, false);
  const again = button(ctx, 'Start again', 'Start again', box.x + 256, box.y + box.height - 46, 200, true);
  bars.children.push(back2, again);
  g2.run(g2.click(back2, 'Back to the meter'), go(meter));
  g2.run(g2.click(again, 'Start again'), set(shown, 'false'), go(hero.page));

  const tick2 = g2.add('event.timer', { ms: 250, repeat: true }, null, 'out', { note: 'Four times a second' });
  g2.run(tick2, set(peak, `Math.max(...${NOW}) < 0.08 ? -1 : ${NOW}.indexOf(Math.max(...${NOW}))`));
  g2.gap(40);

  checklist.push(
    item('Check the eight band names in Project > Variables > "bandLabels": the label is the band in hertz and "what" is a rough guide to what lives there. The page\'s microphone reports eight log-spaced bands from 80 Hz to 8 kHz, so keep eight. It shows where the sound is, not which note, and there is no pitch tracking', byName(bars, 'Bars'), bars),
    item('Rewrite the challenge to suit your lesson (a physics question about frequency, a singing exercise, a speech sound to try) and its answer: the text on the right, which flips with the Show button', ask, bars),
    item('Check the slider route on this page: the loudness and pitch sliders make the same numbers as the microphone, so the bars move with no microphone. Try the real microphone from the Link for StudyDesk, not Preview, where a pretend microphone makes a moving bump of bands', pitchSlider, bars),
  );

  spreadPages(project);
  return { project, checklist };
}

export const liveSoundLab: BrandedStarter = {
  key: 'media/live-sound-lab',
  set: 'media',
  name: 'Live sound lab',
  description: 'The microphone as an input, with nothing recorded. Two scenes: a loudness meter with a target band (steady volume practice, or a noise check worded as a rough guide) and eight frequency bars (whistle higher, what changed?). The numbers move about 25 times a second while the learner listens, and a slider makes the same numbers for a learner with no microphone.',
  tags: ['microphone', 'sound', 'live', 'loudness', 'frequency', 'physics', 'voice', 'privacy'],
  build,
};
