//Sign practice with self-review, for learners of a signed language (Auslan or any other). Two halves.
//
//Part 1, Watch and choose, needs no camera: a model clip that can be slowed, looped and stepped a frame at a time, then a pick-the-meaning
//question for each sign. It can stand alone (Finish here goes straight to the summary), and it is the no-camera route the sensors rule asks for.
//
//Part 2, Sign and compare, is the expressive half. Try the sign: the learner's live camera sits beside the model, and Record keeps a short take in
//memory (camera only, no sound, so no microphone is asked for). Review your take: the take plays back beside the model (or both together), the
//author's self-review list is ticked, and the take can be downloaded to send to a tutor. Nothing leaves the learner's device unless they download it.
//Practising without the camera skips the recording and keeps the self-review.
//
//The summary says "You practised n signs", counts the questions and ticks, and downloads a text note for the tutor. It says plainly, on the first
//pages and again here, that this supports practice and is not feedback from a Deaf teacher.
//
//How it is built: the model clips live on one artboard ("Model clips", a component) with one Video layer per sign, shown by the shared variable
//"current". Every page that shows the model places that artboard as an instance, so the author picks each clip once. Speed, play and position are
//shared variables bound to the video layers, so the page's own buttons (Half speed, Loop, Play both together) drive the clip inside the instance.
//Every page has a portrait variant (a responsive set, shown under 560 px wide) with the same layer names, so a phone stacks the model above the camera.
import { createArtboard, createNode, type Artboard, type FrameNode, type InstanceNode, type SceneNode, type TemplateChecklistItem, type TextNode, type VideoNode } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, solid, stroke, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, darkButton, go, set, spreadPages } from '../games/common';

//The signs. meaning is the answer, wrong the two other choices, look what to notice. These are placeholders: the clips have to be the author's own,
//and nothing here claims what a real sign looks like.
const SIGNS = [
  { meaning: 'Thank you', wrong: ['Please', 'Sorry'], look: 'Look at where the hands start and where they finish.' },
  { meaning: 'Please', wrong: ['Thank you', 'Help'], look: 'Look at the shape of the hand, then at how big the movement is.' },
  { meaning: 'Sorry', wrong: ['Please', 'Water'], look: 'Look at the face and the head as well as the hands.' },
  { meaning: 'Help', wrong: ['Water', 'Thank you'], look: 'Look at how the two hands work together.' },
  { meaning: 'Water', wrong: ['Help', 'Sorry'], look: 'Look at the speed and the rhythm of the movement.' },
];

//What a learner checks in their own take. Up to five show.
const SELF_REVIEW = [
  'My hand shape matched the model',
  'My movement had the same direction and size',
  'I signed at about the same speed and rhythm',
  'My face and head matched the model',
  'I started and finished in the same places',
];

const SHOWN_CHECKS = 5;
const SUBTITLE = 'Practise {language}: watch a model, slow it down and step through it, then try the signs yourself and review how it went. Use it with or without a camera.';
const FOOTER = 'Sign practice. Practice only, nothing is marked.';

//The portrait variants are shown when the box the player is in is narrower than this
const BREAKPOINT = 560;
const LAND = { portrait: false, width: 1024, height: 640 };
const PORT = { portrait: true, width: 480, height: 960 };
type Geo = typeof LAND | typeof PORT;
const nameFor = (geo: Geo, n: string) => (geo.portrait ? `${n} (portrait)` : n);

//The model clips artboard is 16:9
const CLIP_W = 480;
const CLIP_H = 270;

//Everything a page's graph needs from the other pages and the variables
interface Vars {
  [k: string]: ReturnType<typeof addVar>;
}
interface Pages {
  hero: Artboard;
  about: Artboard;
  watch: Artboard;
  tryIt: Artboard;
  review: Artboard;
  summary: Artboard;
}

//A formula only runs at the start, so every step that changes current sets choices again with this
const SPOT = 'current % (signs[current].wrong.length + 1)';
const CHOICES = `signs[current] ? signs[current].wrong.slice(0, ${SPOT}).concat([signs[current].meaning], signs[current].wrong.slice(${SPOT})) : []`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Sign practice');
  const { project, L } = ctx;
  const v: Vars = {};
  const add = (name: string, type: Parameters<typeof addVar>[2], initial: Parameters<typeof addVar>[3], formula?: string) => (v[name] = addVar(project, name, type, initial, formula));
  add('language', 'string', 'Auslan');
  add('clipsCredit', 'string', 'Model clips: (name the signer here), shown with their written permission.');
  add('signs', 'list', SIGNS);
  add('selfReview', 'list', SELF_REVIEW);
  //The ones the model clips instance reads too are shared with it
  for (const [name, type, initial] of [['current', 'number', 0], ['clipPlaying', 'boolean', false], ['clipTime', 'number', 0], ['clipRate', 'number', 1], ['clipLoop', 'boolean', false]] as const) {
    add(name, type, initial).shared = true;
  }
  add('picked', 'string', '');
  add('answered', 'boolean', false);
  add('rightCount', 'number', 0);
  add('answeredCount', 'number', 0);
  //The three choices for the sign in view, with the right one moved to a different place each time
  add('choices', 'list', [], CHOICES);
  add('stage', 'string', 'off');
  add('ticked', 'list', []);
  add('practised', 'list', []);
  add('reviewLog', 'list', []);

  //One camera only, no microphone: signing has no sound, so nothing asks for one. The take stays in memory.
  project.settings.sensors = { camera: true, purpose: 'show your camera next to the model clip and record short practice takes to review yourself', maxSeconds: 30 };

  //The model clips: one artboard, one Video layer per sign, the right one shown by "current"
  const clips = createArtboard({ name: 'Model clips', width: CLIP_W, height: CLIP_H });
  clips.background = solid(L.surfaceMuted);
  SIGNS.forEach((_, i) => {
    const clip = createNode('video', {
      name: `Clip ${i + 1}`,
      x: 0,
      y: 0,
      width: CLIP_W,
      height: CLIP_H,
      autoplay: false,
      loop: false,
      muted: true,
      controls: true,
      speedControl: true,
      frameStepControl: true,
      frameRate: 30,
      fit: 'contain',
      ariaLabel: `Model clip, sign ${i + 1}`,
      bindings: { visible: `current == ${i}`, loop: 'clipLoop', 'media.rate': 'clipRate', 'media.playing': 'clipPlaying', 'media.time': 'clipTime' },
      bindingModes: { 'media.rate': 'both', 'media.playing': 'both', 'media.time': 'both' },
    } as Partial<VideoNode>);
    //Until a video is chosen the layer says what goes there, then hides itself
    const holder = createNode('frame', {
      name: `Clip ${i + 1} placeholder`,
      x: 0,
      y: 0,
      width: CLIP_W,
      height: CLIP_H,
      clip: true,
      fill: solid(L.surfaceMuted),
      stroke: null,
      role: 'region',
      ariaLabel: 'No model clip chosen yet',
      bindings: { visible: `current == ${i} && !layer("Clip ${i + 1}").src && !layer("Clip ${i + 1}").assetId` },
      children: [
        heading(ctx, 'Placeholder title', `Model clip ${i + 1} goes here`, 20, 80, CLIP_W - 40, { align: 'center', fontSize: 26 }),
        text(ctx, 'Placeholder text', `Open the Model clips page, select the Video layer named Clip ${i + 1} and pick a video. This note hides itself once one is chosen.`, 40, 130, CLIP_W - 80, { align: 'center', fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 90 }),
      ],
    }) as FrameNode;
    clips.children.push(clip, holder);
  });

  //Pages: landscape first (the base of each responsive set), then the portrait variants built the same way
  const built: Record<'land' | 'port', Pages & { nodes: ReturnType<typeof makePages> }> = {} as never;
  for (const geo of [LAND, PORT]) {
    const nodes = makePages(ctx, geo, clips);
    const pages: Pages = { hero: nodes.hero.page, about: nodes.about.page, watch: nodes.watch.page, tryIt: nodes.tryIt.page, review: nodes.review.page, summary: nodes.summary.page };
    built[geo.portrait ? 'port' : 'land'] = { ...pages, nodes };
  }
  //Go to artboard names the base of a set and the player shows the member that fits, so both geometries aim at the landscape pages
  const targets: Pages = built.land;
  wirePages(v, built.land.nodes, targets);
  wirePages(v, built.port.nodes, targets);
  for (const key of Object.keys(targets) as (keyof Pages)[]) {
    built.port[key].variantOf = built.land[key].id;
    built.port[key].minWidth = 0;
    built.land[key].minWidth = BREAKPOINT;
  }
  //Not a page anyone walks to, so after the pages
  project.artboards.push(clips);
  spreadPages(project);
  project.settings.reporting = { completion: 'artboard', completionArtboard: targets.summary.id };

  // ---------------------------------------------------------------- checklist
  const checklist: TemplateChecklistItem[] = [
    item('Write the title and the line under it on the first page, and set the language in Project > Variables > "language" (Auslan is the sample). Keep it clear that this is practice and not feedback from a teacher', byName(targets.hero, 'Subtitle'), targets.hero),
    item('MODEL CLIPS: open the Model clips page and pick a video in each Video layer (Clip 1 to Clip 5). Every page that shows the model uses this one page, so you choose each clip once. Use short clips of one sign each, filmed front on, with the hands and face in view, in good light', clips.children[0], clips),
    item('CONSENT AND RIGHTS: before a clip goes in, hold the signer\'s written consent to use their image for teaching and a clear licence for the clip. Say who signs and the permission you hold in Project > Variables > "clipsCredit" (it shows on the How this works page), and list the clips in Project > Credits', byName(targets.about, 'Clips credit'), targets.about),
    item('Write your signs: Project > Variables > "signs". One row per Video layer, in the same order. meaning is the answer, wrong is the two other choices (the right one moves to a different place each time), look is what the learner is told to notice. The five samples only stand in: with the placeholder clips the questions cannot be answered', byName(targets.watch, 'Choices'), targets.watch),
    item('More or fewer than five signs: duplicate a Video layer on the Model clips page, rename it Clip 6 and so on, change its Visible binding to "current == 5", then duplicate its "placeholder" frame the same way. Add the row to "signs". The summary and every page count from the list', clips.children[0], clips),
    item('Write the self-review list: Project > Variables > "selfReview" (up to five lines, each one a thing a learner can check in their own take). The sample is general. A line a Deaf teacher would write for your signs is better', byName(targets.review, 'Self-review'), targets.review),
    item('Read How this works and make it true for your course. It says plainly that nothing here can tell a learner whether they are signing correctly, and that only a Deaf teacher or tutor can. Do not soften that. Say who the tutor is and how to send a recording', byName(targets.about, 'Not feedback'), targets.about),
    item('PRIVACY: the camera shows only on the page and the take stays in memory; UniSQ receives nothing. Tell learners they can sit against a plain wall, that nobody else sees their camera, and that they can skip the camera. A learner can also choose "I will not use my camera" on How this works. Check the wording suits your course', byName(targets.about, 'Camera privacy'), targets.about),
    item('Camera setup is already declared in Project > Microphone and camera (camera only, no microphone, 30 seconds a take). The course page iframe that holds the Link for StudyDesk needs allow="camera" (and update the link after any change here). Without it the learner is told, and the no-camera route still works', byName(targets.tryIt, 'Camera area'), targets.tryIt),
    item('The no-camera route is real: Part 1 needs no camera, and "Practise without the camera" gives the model, the self-review list and the summary. Check that it is as good as the other. Some learners cannot see video at all: say what they should do instead, because this activity is visual', byName(targets.tryIt, 'No camera button'), targets.tryIt),
    item('Tutor route: Download my take (on Review your take) and Download my practice notes (on the summary) are the only ways anything leaves the page. Say on the summary who to send them to and what to ask for', byName(targets.summary, 'Tutor note'), targets.summary),
    item('Portrait phones: every page has a portrait variant (shown under 560 px wide) with the same layer names, stacking the model above the camera. When you change wording or layout on a page, change its portrait copy too. The clips need choosing only once, since both share the Model clips page', undefined, built.port.hero),
    item('Not a marked task: nothing is scored or sent, and there is no pass mark. Reaching the summary reports completion only. Keep any assessed signing for a live conversation or an assessed recording with a teacher', byName(targets.summary, 'Headline'), targets.summary),
  ];
  return { project, checklist };
}

//The six pages in one geometry: landscape is the page a desktop shows, portrait the stacked copy for a phone
function makePages(ctx: BrandedCtx, geo: Geo, clips: Artboard) {
  const { L } = ctx;
  const P = geo.portrait;
  const mk = (title: string, name = title) => brandedPage(ctx, title, { name: nameFor(geo, name), footer: FOOTER, width: geo.width, height: geo.height });
  const model = (x: number, y: number, w: number, h: number) =>
    createNode('instance', { name: 'Model clip', x, y, width: w, height: h, artboardId: clips.id, fit: 'contain', role: 'region', ariaLabel: 'Model clip' } as Partial<InstanceNode>);
  const counter = (box: { x: number; y: number }, value: string, width: number) =>
    text(ctx, 'Sign counter', value, box.x, box.y, width, { fontSize: 17, fontWeight: 700, autoSize: 'none', height: 24 });

  // ---- hero
  const hero = brandedPage(ctx, 'Sign practice', { kind: 'hero', name: nameFor(geo, 'Sign practice'), subtitle: SUBTITLE, width: geo.width, height: geo.height });
  const heroStart = darkButton(ctx, 'Start', 'Begin', 48, geo.height * 0.42 + 190, 200);
  if (P) {
    const title = byName(hero, 'Page title') as TextNode;
    const sub = byName(hero, 'Subtitle') as TextNode;
    title.fontSize = 40;
    title.width = geo.width - 96;
    title.y = 280;
    sub.width = geo.width - 96;
    sub.y = 344;
    heroStart.y = 344 + 150;
  }
  hero.children.push(heroStart);

  // ---- how this works
  const about = mk('How this works');
  const ab = contentBox(about);
  const cardH = P ? 230 : 270;
  const cardW = P ? ab.width : (ab.width - 32) / 2;
  const secondX = P ? ab.x : ab.x + cardW + 32;
  const secondY = P ? ab.y + cardH + 12 : ab.y;
  const infoCard = (name: string, x: number, y: number, h: number, head: string, body: string) => {
    const bodyH = h - 64;
    return [card(ctx, `${name} card`, x, y, cardW, h), heading(ctx, name, head, x + 20, y + 16, cardW - 40, { fontSize: 20 }), text(ctx, `${name} text`, body, x + 20, y + 52, cardW - 40, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: bodyH })];
  };
  const notFeedback = infoCard('Not feedback', ab.x, ab.y, cardH, 'This is practice, not feedback', 'Nothing in this activity can tell you whether your signing is correct. It helps you watch closely and compare yourself with a model. Only a Deaf teacher or your tutor can give you real feedback, so share your practice with them and ask what to work on.');
  const privacyH = P ? 300 : cardH;
  const privacy = infoCard('Camera privacy', secondX, secondY, privacyH, 'Your camera is optional', 'Part 1 needs no camera. In Part 2 your camera can show beside the model, and you can record short takes. Skip the camera any time and still do the self-review. Your camera and recordings stay in this page on your device. UniSQ does not receive or store them, and closing the page deletes them. Press Download only to send a take to your tutor yourself.');
  about.children.push(...notFeedback, ...privacy);
  const rowY = P ? secondY + privacyH + 12 : ab.y + cardH + 12;
  const credit = text(ctx, 'Clips credit', '{clipsCredit}', ab.x, rowY, ab.width, { fontSize: 14, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: 40 });
  const btnY = rowY + 52;
  const startWatch = button(ctx, 'Start watching', 'Start with Part 1: watch and choose', ab.x, btnY, P ? ab.width : 360);
  const skipSign = button(ctx, 'Skip to signing', 'Go straight to Part 2: sign', P ? ab.x : ab.x + 372, P ? btnY + 56 : btnY, P ? ab.width : 300, false);
  const noCamera = button(ctx, 'I will not use my camera', 'I will not use my camera', P ? ab.x : ab.x + 684, P ? btnY + 112 : btnY, P ? ab.width : 244, false);
  noCamera.ariaLabel = 'I will not use my camera. This is remembered and the camera is never asked for.';
  about.children.push(credit, startWatch, skipSign, noCamera);

  // ---- watch and choose (receptive)
  const watch = mk('Watch and choose');
  const wb = contentBox(watch);
  const wClipW = P ? wb.width : CLIP_W;
  const wClipH = P ? 216 : CLIP_H;
  const colX = wb.x + 512;
  const colW = wb.width - 512;
  const wX = P ? wb.x : colX;
  const wW = P ? wb.width : colW;
  const wY = (landscapeY: number, portraitY: number) => wb.y + (P ? portraitY : landscapeY);
  const wCounter = counter(wb, 'Sign {current + 1} of {signs.length}', P ? wb.width : 480);
  const wModel = model(wb.x, wb.y + 30, wClipW, wClipH);
  const rowTop = wb.y + 30 + wClipH + 10;
  const sw = P ? 112 : 150;
  const sgap = P ? 24 : 15;
  const slow = button(ctx, 'Half speed', 'Half speed', wb.x, rowTop, sw, false);
  const normal = button(ctx, 'Normal speed', 'Normal speed', wb.x + sw + sgap, rowTop, sw, false);
  const loop = bind(button(ctx, 'Loop', 'Loop: off', wb.x + (sw + sgap) * 2, rowTop, sw, false), { label: 'clipLoop ? "Loop: on" : "Loop: off"' });
  loop.ariaLabel = 'Loop the clip';
  bind(loop, { ariaLabel: 'clipLoop ? "Loop the clip, on" : "Loop the clip, off"' });
  const hint = text(ctx, 'Clip hint', 'The buttons over the clip step one frame back or forward and change the speed. With the clip focused, comma and full stop step a frame.', wb.x, rowTop + 54, P ? wb.width : 480, { fontSize: 14, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: P ? 40 : 60 });
  const question = heading(ctx, 'Question', 'What does this sign mean?', wX, wY(0, P ? 362 : 0), wW, { fontSize: 22, autoSize: 'none', height: 30 } as Partial<TextNode>);
  const choice = button(ctx, 'Choice', '{item}', 0, 0, wW, true);
  choice.height = 48;
  choice.cornerRadius = 12;
  const right = 'item == signs[current].meaning';
  bind(choice, {
    label: `item + (answered && ${right} ? "  (correct)" : answered && item == picked ? "  (not this one)" : "")`,
    ariaLabel: `"Choice " + (index + 1) + ": " + item + (answered && ${right} ? ", correct" : answered && item == picked ? ", not this one" : "")`,
    'fill.color': `answered && ${right} ? "${L.success}" : answered && item == picked ? "${L.error}" : "${L.button}"`,
    color: `answered && (${right} || item == picked) ? "${L.background}" : "${L.onButton}"`,
  });
  const choices = createNode('frame', {
    name: 'Choices',
    x: wX,
    y: wY(40, P ? 398 : 40),
    width: wW,
    height: 3 * 48 + 2 * 10,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Choices',
    repeat: { items: 'choices', layout: 'vertical', gap: 10, columns: 1 },
    children: [choice],
  }) as FrameNode;
  const fbY = wY(218, P ? 574 : 218);
  const fbH = P ? 92 : 120;
  const feedbackCard = card(ctx, 'Feedback card', wX, fbY, wW, fbH);
  const feedback = text(ctx, 'Feedback', '', wX + 16, fbY + 12, wW - 32, {
    fontSize: 15,
    lineHeight: 1.35,
    autoSize: 'none',
    height: fbH - 24,
    bindings: {
      text: 'answered ? (picked == signs[current].meaning ? "Yes, that is right. " : "Not this time. The meaning is " + signs[current].meaning + ". ") + "Watch it again at half speed. " + signs[current].look : "Choose the meaning, then you will see how you did. Right so far: " + rightCount + " of " + answeredCount + "."',
    },
  } as never);
  const next = bind(button(ctx, 'Next', 'Next sign', wX, wY(350, P ? 676 : 350), P ? wb.width : 200, true), { visible: 'answered', label: 'current + 1 < signs.length ? "Next sign" : "Go to Part 2: sign"' });
  const finish = bind(button(ctx, 'Finish here', 'Finish here, see my summary', P ? wX : wX + 210, wY(350, P ? 730 : 350), P ? 184 : 206, false), { visible: 'answered && current + 1 >= signs.length' });
  const skip = button(ctx, 'Skip to signing', 'Skip to signing', P ? wX + 200 : wX, wY(406, P ? 730 : 406), P ? 184 : 260, false);
  watch.children.push(wCounter, wModel, slow, normal, loop, hint, question, choices, feedbackCard, feedback, next, finish, skip);

  // ---- try the sign (expressive, camera beside the model)
  const tryIt = mk('Try the sign');
  const tb = contentBox(tryIt);
  const vw = P ? 336 : 440;
  const vh = P ? 189 : 248;
  const vx = P ? tb.x + 24 : tb.x;
  const camX = P ? vx : tb.x + 488;
  const camY = tb.y + (P ? 329 : 30);
  const tCounter = counter(tb, 'Sign {current + 1} of {signs.length}: try it yourself', tb.width);
  const tModel = model(vx, tb.y + 30, vw, vh);
  const camNote = bind(text(ctx, 'Camera off note', 'Your camera is off. Press Turn on camera, or practise without it.', 24, 80, vw - 48, { align: 'center', fontSize: 17, color: L.muted, lineHeight: 1.4, autoSize: 'none', height: 80 }), { visible: 'stage == "off"' });
  const camFrame = createNode('frame', {
    name: 'Camera area',
    x: camX,
    y: camY,
    width: vw,
    height: vh,
    cornerRadius: 16,
    clip: true,
    fill: solid(L.surface),
    stroke: stroke(L.border, 2),
    role: 'region',
    ariaLabel: 'Your camera',
    children: [camNote],
  }) as FrameNode;
  const rY = tb.y + (P ? 229 : 288);
  const tslow = button(ctx, 'Half speed', 'Half speed', tb.x, rY, sw, false);
  const tnormal = button(ctx, 'Normal speed', 'Normal speed', tb.x + sw + sgap, rY, sw, false);
  const tloop = bind(button(ctx, 'Loop', 'Loop: off', tb.x + (sw + sgap) * 2, rY, sw, false), { label: 'clipLoop ? "Loop: on" : "Loop: off"', ariaLabel: 'clipLoop ? "Loop the clip, on" : "Loop the clip, off"' });
  const look = text(ctx, 'Look closely', 'Look closely: {signs[current].look}', tb.x, P ? tb.y + 283 : tb.y + 346, P ? tb.width : 440, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: P ? 38 : 60 });
  const mainY = P ? camY + vh + 10 : rY;
  const mainX = P ? tb.x : camX;
  const mainW = P ? tb.width : 220;
  const camOn = bind(button(ctx, 'Turn on camera', 'Turn on camera', mainX, mainY, P ? tb.width : 440, true), { visible: 'stage == "off"', disabled: 'camera == "off" || camera == "unavailable"', opacity: 'camera == "off" || camera == "unavailable" ? 0.5 : 1' });
  const startRec = bind(button(ctx, 'Start recording', 'Start recording', mainX, mainY, P ? 184 : mainW, true), { visible: 'stage == "live"' });
  const camOff = bind(button(ctx, 'Turn off camera', 'Turn off camera', P ? mainX + 200 : mainX + mainW + 12, mainY, P ? 184 : 208, false), { visible: 'stage == "live"' });
  const stop = bind(button(ctx, 'Stop recording', 'Stop recording', mainX, mainY, P ? tb.width : 440, true), { visible: 'stage == "rec"' });
  const noCam = button(ctx, 'No camera button', 'Practise without the camera', mainX, mainY + 56, P ? tb.width : 300, false);
  noCam.ariaLabel = 'Practise without the camera: go to the review with the model and no recording';
  noCam.bindings = { visible: 'stage != "rec"' };
  const status = text(ctx, 'Status', '', mainX, P ? mainY + 112 : mainY + 108, P ? tb.width : 440, {
    fontSize: P ? 14 : 15,
    color: L.muted,
    lineHeight: 1.35,
    autoSize: 'none',
    height: P ? 44 : 50,
    bindings: {
      text: 'stage == "rec" ? "Recording: " + Math.round(recordingSeconds) + " seconds. Press Stop recording when you have finished the sign." : stage == "live" ? "Camera on. Press Start recording when you are ready to sign." : camera == "off" ? "You chose not to use your camera, so this part works without it." : camera == "ready" ? "Your camera shows only on this page. Nothing is uploaded or stored." : mediaMessage != "" ? mediaMessage : "The camera is not available here. You can still practise without it."',
    },
  } as never);
  tryIt.children.push(tCounter, tModel, camFrame, tslow, tnormal, tloop, look, camOn, startRec, camOff, stop, noCam, status);

  // ---- review your take
  const review = mk('Review your take');
  const rb = contentBox(review);
  const rCounter = counter(rb, 'Sign {current + 1} of {signs.length}: compare and review', rb.width);
  const rModelY = rb.y + (P ? 30 : 26);
  const rModel = model(vx, rModelY, vw, vh);
  const takeY = P ? rModelY + vh + 8 : rModelY;
  const takeNote = bind(text(ctx, 'Take note', '', 24, 70, vw - 48, { align: 'center', fontSize: 16, color: L.muted, lineHeight: 1.4, autoSize: 'none', height: 110 }), {
    text: 'recordings.take.state == "empty" ? "No recording for this sign. Sign along with the model, then use the self-review list." : "Your take is ready. Press Play my take, or Play both together."',
    visible: 'recordings.take.state != "playing"',
  });
  const takeFrame = createNode('frame', {
    name: 'Take area',
    x: P ? vx : rb.x + 488,
    y: takeY,
    width: vw,
    height: vh,
    cornerRadius: 16,
    clip: true,
    fill: solid(L.surface),
    stroke: stroke(L.border, 2),
    role: 'region',
    ariaLabel: 'Your take',
    children: [takeNote],
  }) as FrameNode;
  const bw = P ? 184 : 214;
  const bgap = P ? 16 : 12;
  const btnTop = P ? takeY + vh + 12 : rModelY + vh + 10;
  const noTake = 'recordings.take.state == "empty"';
  const dim = { disabled: noTake, opacity: `${noTake} ? 0.5 : 1` };
  const playBoth = bind(button(ctx, 'Play both together', 'Play both together', rb.x, btnTop, bw, true), dim);
  const playTake = bind(button(ctx, 'Play my take', 'Play my take', rb.x + bw + bgap, btnTop, bw, false), dim);
  const again = button(ctx, 'Record again', 'Record again', rb.x, btnTop + 52, bw, false);
  const download = bind(button(ctx, 'Download my take', 'Download my take', rb.x + bw + bgap, btnTop + 52, bw, false), dim);
  const done = button(ctx, 'Done with this sign', 'Done, next', rb.x, P ? 0 : btnTop + 104, P ? rb.width : 440, true);
  bind(done, { label: 'current + 1 < signs.length ? "Done with this sign, next" : "Done, see my summary"' });
  const checksX = P ? rb.x : rb.x + 488;
  const checksHeadY = P ? btnTop + 52 + 52 + 6 : btnTop;
  const checksHead = heading(ctx, 'Self-review heading', 'Self-review: tick what you saw in your take', checksX, checksHeadY, P ? rb.width : 440, { fontSize: 17, autoSize: 'none', height: 26 } as Partial<TextNode>);
  const tick = createNode('rect', { name: 'Tick box', x: 6, y: 4, width: 20, height: 20, cornerRadius: 6, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true });
  //The filled box sits under the tick, so the tick is always on the button colour
  const tickFill = bind(createNode('rect', { name: 'Tick fill', x: 6, y: 4, width: 20, height: 20, cornerRadius: 6, fill: solid(L.button), stroke: null, decorative: true }), { visible: 'ticked.includes(index)' });
  const tickMark = bind(text(ctx, 'Tick mark', '✓', 9, 3, 18, { fontSize: 15, fontWeight: 700, color: L.onButton, decorative: true }), { visible: 'ticked.includes(index)' });
  const checkText = text(ctx, 'Check', '{item}', 36, 3, (P ? rb.width : 440) - 44, { fontSize: 15, decorative: true, autoSize: 'none', height: 22, overflow: 'ellipsis' });
  const checkRow = createNode('frame', { name: 'Check row', x: 0, y: 0, width: P ? rb.width : 440, height: 28, cornerRadius: 8, fill: solid(L.background), stroke: null, clip: false, role: 'checkbox', focusable: true, cursor: 'pointer', children: [tick, tickFill, tickMark, checkText] }) as FrameNode;
  bind(checkRow, { ariaChecked: 'ticked.includes(index)', ariaLabel: 'item', 'fill.color': `ticked.includes(index) ? "${L.surface}" : "${L.background}"` });
  const checks = createNode('frame', {
    name: 'Self-review',
    x: checksX,
    y: checksHeadY + 28,
    width: P ? rb.width : 440,
    height: SHOWN_CHECKS * 30,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Self-review list',
    repeat: { items: `selfReview.slice(0, ${SHOWN_CHECKS})`, layout: 'grid', gap: 2, columns: 1 },
    children: [checkRow],
  }) as FrameNode;
  if (P) done.y = checks.y + SHOWN_CHECKS * 30 + 8;
  review.children.push(rCounter, rModel, takeFrame, playBoth, playTake, again, download, checksHead, checks, done);

  // ---- summary
  const summary = mk('Your practice');
  const sb = contentBox(summary);
  const headline = heading(ctx, 'Headline', '', sb.x, sb.y, sb.width, { fontSize: P ? 28 : 36, autoSize: 'none', height: P ? 40 : 48, bindings: { text: '"You practised " + practised.length + (practised.length == 1 ? " sign." : " signs.")' } } as never);
  const tutor = text(ctx, 'Tutor note', 'This was practice. It supports your learning but it is not feedback from a Deaf teacher, and it cannot tell you whether your signing is right. Share your practice notes and a recording with your tutor, and ask what to work on next.', sb.x, sb.y + (P ? 52 : 56), sb.width, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: P ? 128 : 60 });
  const tileW = P ? (sb.width - 16) / 2 : (sb.width - 48) / 4;
  const tileTop = sb.y + (P ? 190 : 124);
  const tiles: [string, string, string][] = [
    ['Questions right', 'rightCount + " of " + answeredCount', 'Meaning questions right'],
    ['Signs reviewed', 'reviewLog.length + " of " + signs.length', 'Signs reviewed with the model'],
    ['Takes', 'reviewLog.filter(r => r.take).length', 'Takes recorded'],
    ['Ticks', 'reviewLog.reduce((s, r) => s + r.ticked, 0) + " of " + reviewLog.reduce((s, r) => s + r.of, 0)', 'Self-review lines ticked'],
  ];
  tiles.forEach(([name, value, label], i) => {
    const x = sb.x + (P ? (i % 2) * (tileW + 16) : i * (tileW + 16));
    const y = tileTop + (P ? Math.floor(i / 2) * 96 : 0);
    summary.children.push(
      card(ctx, `${name} tile`, x, y, tileW, 84),
      text(ctx, name, '', x + 14, y + 10, tileW - 28, { fontSize: 26, fontWeight: 700, autoSize: 'none', height: 34, bindings: { text: `"" + (${value})` } } as never),
      text(ctx, `${name} label`, label, x + 14, y + 48, tileW - 28, { fontSize: 13, color: L.muted, autoSize: 'none', height: 30 }),
    );
  });
  const tableTop = tileTop + (P ? 196 : 94);
  const COLS: [string, string, number, number][] = P
    ? [['Sign', 'item.n + ". " + item.sign', 12, 190], ['Ticked', 'item.ticked + " of " + item.of + (item.take ? ", take" : "")', 210, 164]]
    : [['Sign', 'item.n + ". " + item.sign', 12, 300], ['Self-review', 'item.ticked + " of " + item.of + " ticked"', 330, 220], ['Take', 'item.take ? "Recorded" : "No recording"', 570, 160], ['Look again', 'item.ticked < item.of ? "Look again" : ""', 750, 160]];
  COLS.forEach(([label, , x, w]) => summary.children.push(text(ctx, `Header ${label}`, label, sb.x + x, tableTop, w, { fontSize: 14, fontWeight: 700, color: L.muted })));
  const cell = (label: string, value: string, x: number, w: number) => text(ctx, `Cell ${label}`, `{${value}}`, x, 7, w, { fontSize: 15, autoSize: 'none', height: 22, overflow: 'ellipsis' });
  const rowFrame = createNode('frame', { name: 'Practice row', x: 0, y: 0, width: sb.width, height: 36, cornerRadius: 10, fill: solid(L.surface), stroke: null, clip: false, role: 'region', children: COLS.map(([label, value, x, w]) => cell(label, value, x, w)) }) as FrameNode;
  bind(rowFrame, { ariaLabel: '"Sign " + item.n + ", " + item.sign + ": " + item.ticked + " of " + item.of + " self-review lines ticked, " + (item.take ? "a take recorded" : "no recording")' });
  const rows = createNode('frame', { name: 'Practice rows', x: sb.x, y: tableTop + 24, width: sb.width, height: 4 * 40, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your last four signs', repeat: { items: 'reviewLog.slice(-4)', layout: 'grid', gap: 4, columns: 1 }, children: [rowFrame] }) as FrameNode;
  const btnsY = P ? tableTop + 24 + 4 * 40 + 12 : sb.y + sb.height - 46;
  const notes = button(ctx, 'Download my practice notes', 'Download my practice notes', sb.x, btnsY, P ? sb.width : 320, true);
  const redo = button(ctx, 'Practise again', 'Practise again', P ? sb.x : sb.x + 332, P ? btnsY + 56 : btnsY, P ? sb.width : 220, false);
  summary.children.push(headline, tutor, rows, notes, redo);

  return {
    hero: { page: hero, start: heroStart },
    about: { page: about, startWatch, skipSign, noCamera },
    watch: { page: watch, slow, normal, loop, choice, next, finish, skip },
    tryIt: { page: tryIt, slow: tslow, normal: tnormal, loop: tloop, camFrame, camOn, startRec, camOff, stop, noCam },
    review: { page: review, takeFrame, playBoth, playTake, again, download, done, checkRow },
    summary: { page: summary, notes, redo },
  };
}

//The interactions of one geometry's pages. Each page's graph is its own, the variables and the destinations are shared.
function wirePages(v: Vars, n: ReturnType<typeof makePages>, T: Pages): void {
  const { hero, about, watch, tryIt, review, summary } = n;

  //Start a fresh walk through the signs
  const rewind = [set(v.current, '0'), set(v.choices, CHOICES), set(v.answered, 'false'), set(v.picked, '""'), set(v.clipPlaying, 'false'), set(v.clipTime, '0'), set(v.stage, '"off"')] as [string, Record<string, unknown>][];
  const nextSign = [set(v.current, 'current + 1'), set(v.choices, CHOICES), set(v.answered, 'false'), set(v.picked, '""'), set(v.clipPlaying, 'false'), set(v.clipTime, '0'), set(v.stage, '"off"')] as [string, Record<string, unknown>][];
  const cameraDown = (): [string, Record<string, unknown>] => ['action.cameraPreview', { op: 'off' }];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(T.about));

  const ag = new Graph(about.page);
  ag.run(ag.click(about.startWatch, 'Part 1, no camera'), ...rewind, go(T.watch));
  ag.run(ag.click(about.skipSign, 'Straight to Part 2'), ...rewind, go(T.tryIt));
  //The learner's own choice, kept by the page around the project, then on to the part that needs no camera
  ag.run(ag.click(about.noCamera, 'Never use my camera'), ['action.sensorsOff', {}], ...rewind, go(T.watch));

  //Speed and loop: the page's buttons set the shared variables the clip's video layers are bound to
  const clipButtons = (g: Graph, b: { slow: SceneNode; normal: SceneNode; loop: SceneNode }) => {
    g.run(g.click(b.slow, 'Half speed'), set(v.clipRate, '0.5'));
    g.run(g.click(b.normal, 'Normal speed'), set(v.clipRate, '1'));
    g.run(g.click(b.loop, 'Loop on or off'), set(v.clipLoop, '!clipLoop'), announce('clipLoop ? "Looping on." : "Looping off."'));
  };

  // ---- watch and choose
  const wg = new Graph(watch.page);
  wg.run(wg.start('Fresh page'), set(v.clipPlaying, 'false'));
  clipButtons(wg, watch);
  //A choice counts once. Right or wrong it is shown, and the sign is marked as practised
  const onChoice = wg.click(watch.choice, 'A choice');
  const open = wg.add('logic.if', { condition: '!answered' }, onChoice);
  wg.run(
    wg.add('action.setVariable', { variable: v.picked.id, op: 'set', value: 'choices[event.index]' }, open, 'true'),
    set(v.answered, 'true'),
    set(v.answeredCount, 'answeredCount + 1'),
    set(v.rightCount, 'rightCount + (picked == signs[current].meaning ? 1 : 0)'),
    set(v.practised, 'practised.includes(current) ? practised : [...practised, current]'),
    announce('(picked == signs[current].meaning ? "Correct. " : "Not this time. The meaning is " + signs[current].meaning + ". ") + signs[current].look'),
  );
  wg.gap(60);
  const onNext = wg.click(watch.next, 'Next sign');
  const more = wg.add('logic.if', { condition: 'current + 1 < signs.length' }, onNext);
  wg.runFrom(more, 'true', ...nextSign, announce('"Sign " + (current + 1) + " of " + signs.length + "."'));
  const last = wg.add('action.setVariable', { variable: v.current.id, op: 'set', value: '0' }, more, 'false', { dy: 90 });
  wg.run(last, set(v.choices, CHOICES), set(v.answered, 'false'), set(v.picked, '""'), set(v.clipPlaying, 'false'), set(v.clipTime, '0'), set(v.stage, '"off"'), go(T.tryIt));
  wg.gap(60);
  wg.run(wg.click(watch.finish, 'Finish here'), set(v.clipPlaying, 'false'), go(T.summary));
  wg.run(wg.click(watch.skip, 'Skip to signing'), ...rewind, go(T.tryIt));

  // ---- try the sign
  const tg = new Graph(tryIt.page);
  tg.run(tg.start('Fresh page, camera off'), cameraDown(), set(v.stage, '"off"'), set(v.clipPlaying, 'false'));
  clipButtons(tg, tryIt);
  const camOnEv = tg.click(tryIt.camOn, 'Turn on the camera');
  const preview = tg.add('action.cameraPreview', { op: 'on', target: tryIt.camFrame.id, mirror: true, facing: 'user' }, camOnEv);
  tg.runFrom(preview, 'out', set(v.stage, '"live"'), announce('"Camera on. Press Start recording when you are ready."'));
  tg.add('action.announce', { text: 'mediaMessage != "" ? mediaMessage : "The camera could not start. You can practise without it."', politeness: 'polite' }, preview, 'failed', { dy: 90 });
  tg.gap(100);
  const startEv = tg.click(tryIt.startRec, 'Start recording');
  const rec = tg.add('action.recordStart', { slot: 'take', source: 'camera', maxSeconds: 0 }, startEv);
  tg.runFrom(rec, 'out', set(v.stage, '"rec"'), announce('"Recording. Press Stop recording when you have finished the sign."'));
  tg.add('action.announce', { text: 'mediaMessage != "" ? mediaMessage : "The recording could not start. You can practise without it."', politeness: 'polite' }, rec, 'failed', { dy: 90 });
  tg.gap(100);
  //Stop on the page, or Stop on the recording bar the page itself draws: both end up on the review page
  const stopEv = tg.click(tryIt.stop, 'Stop recording');
  const stopped = tg.add('action.recordStop', { slot: 'take' }, stopEv);
  tg.runFrom(stopped, 'out', cameraDown(), set(v.stage, '"off"'), announce('"Recording kept on this device. Review your take."'), go(T.review));
  tg.add('action.setVariable', { variable: v.stage.id, op: 'set', value: '"live"' }, stopped, 'failed', { dy: 90 });
  tg.gap(100);
  const readyEv = tg.add('event.media', { when: 'ready', slot: 'take' }, null, 'out', { note: 'Stopped from the recording bar' });
  tg.run(readyEv, cameraDown(), set(v.stage, '"off"'), announce('"Recording kept on this device. Review your take."'), go(T.review));
  tg.gap(20);
  tg.run(tg.click(tryIt.camOff, 'Turn off the camera'), cameraDown(), set(v.stage, '"off"'));
  tg.run(tg.click(tryIt.noCam, 'Practise without the camera'), cameraDown(), set(v.stage, '"off"'), set(v.clipPlaying, 'false'), go(T.review));

  // ---- review your take
  const rg = new Graph(review.page);
  rg.run(rg.start('Fresh page'), set(v.clipPlaying, 'false'));
  rg.run(rg.click(review.playTake, 'Play my take'), ['action.recordPlay', { op: 'play', slot: 'take', volume: 1, target: review.takeFrame.id }]);
  rg.run(rg.click(review.playBoth, 'Play both together'), set(v.clipTime, '0'), set(v.clipPlaying, 'true'), ['action.recordPlay', { op: 'play', slot: 'take', volume: 1, target: review.takeFrame.id }]);
  rg.run(rg.click(review.again, 'Record again'), ['action.recordDiscard', { slot: 'take' }], set(v.clipPlaying, 'false'), set(v.clipTime, '0'), go(T.tryIt));
  rg.run(rg.click(review.download, 'Download my take'), ['action.recordDownload', { slot: 'take', name: '"sign-" + (current + 1) + "-take"' }]);
  const onCheck = rg.click(review.checkRow, 'Tick or untick a line');
  const has = rg.add('logic.if', { condition: 'ticked.includes(event.index)' }, onCheck);
  rg.add('action.setVariable', { variable: v.ticked.id, op: 'remove', value: 'ticked.indexOf(event.index)' }, has, 'true');
  rg.add('action.setVariable', { variable: v.ticked.id, op: 'push', value: 'event.index' }, has, 'false', { dy: 70 });
  rg.gap(80);
  //One row in the log for this sign, the take thrown away, then the next sign or the summary
  const onDone = rg.click(review.done, 'Done with this sign');
  const logged = rg.run(
    onDone,
    set(v.reviewLog, '[...reviewLog.filter(r => r.n != current + 1), {n: current + 1, sign: signs[current].meaning, ticked: ticked.length, of: Math.min(' + SHOWN_CHECKS + ', selfReview.length), take: recordings.take.state != "empty"}]'),
    set(v.practised, 'practised.includes(current) ? practised : [...practised, current]'),
    ['action.recordDiscard', { slot: 'take' }],
    set(v.ticked, '[]'),
    set(v.clipPlaying, 'false'),
    set(v.clipTime, '0'),
  );
  const more2 = rg.add('logic.if', { condition: 'current + 1 < signs.length' }, logged);
  rg.runFrom(more2, 'true', set(v.current, 'current + 1'), set(v.choices, CHOICES), set(v.stage, '"off"'), announce('"Sign " + (current + 1) + " of " + signs.length + "."'), go(T.tryIt));
  rg.add('action.artboard', { artboard: T.summary.id, transition: 'fade', duration: 250 }, more2, 'false', { dy: 90 });

  // ---- summary
  const sg = new Graph(summary.page);
  sg.run(sg.start('Say how it went'), announce('"You practised " + practised.length + (practised.length == 1 ? " sign." : " signs.")'));
  sg.run(
    sg.click(summary.notes, 'Download my practice notes'),
    ['action.saveFile', {
      name: '"sign-practice-notes"',
      mime: 'text/plain',
      text: '"Sign practice notes (" + language + ")\\n\\nSigns practised: " + practised.length + " of " + signs.length + "\\nMeaning questions right: " + rightCount + " of " + answeredCount + "\\n\\n" + reviewLog.map(r => r.n + ". " + r.sign + ": " + r.ticked + " of " + r.of + " self-review lines ticked, " + (r.take ? "a take recorded" : "no recording")).join("\\n") + "\\n\\nThis is my own practice record. It is not feedback from a teacher. What I would like to ask my tutor: "',
    }],
  );
  sg.run(sg.click(summary.redo, 'Practise again'), set(v.rightCount, '0'), set(v.answeredCount, '0'), set(v.practised, '[]'), set(v.reviewLog, '[]'), set(v.ticked, '[]'), ...rewind, go(T.watch));
}

export const signPractice: BrandedStarter = {
  key: 'practice/sign-practice',
  set: 'practice',
  name: 'Sign practice with self-review',
  description: 'For learners of a signed language (Auslan or another). Part 1 needs no camera: a model clip that can be slowed, looped and stepped a frame at a time, then a pick-the-meaning question for each sign. Part 2 shows the learner\'s camera beside the model, records a short take that stays on their device, plays it back beside the model, and gives your self-review list to tick, with a download for a tutor. It says plainly that it is practice and not feedback from a Deaf teacher, works without the camera, and has a phone layout that stacks the pictures. Choose your clips and signs; you need the signer\'s consent and the rights to each clip.',
  tags: ['sign language', 'Auslan', 'camera', 'video', 'self-review', 'responsive'],
  build,
};
