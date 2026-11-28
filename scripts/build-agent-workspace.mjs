// Writes agent-workspace/refs/: Ixia's own reference (the MCP bundle's read_reference, the design scale and the help),
// cut into small files an Ask Ixia agent on Antigravity reads one at a time instead of being handed all of it each turn.
// Usage: after the MCP bundle is built (npm run build does both), node scripts/build-agent-workspace.mjs
// The output is committed, like dist/, and is the same on Linux and Windows: no dates, sorted names, \n line ends.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'agent-workspace', 'refs');
const mcp = await import(pathToFileURL(path.join(root, 'mcp', 'dist', 'interactives-mcp.mjs')).href);

const files = new Map();
const put = (rel, text) => files.set(rel.split(path.sep).join('/'), text.replace(/\r\n?/g, '\n').trimEnd() + '\n');

// ---------------------------------------------------------------------------------------------------------------------
// layers: one long reference, cut into themes. The first paragraph is every field a layer can have, run together, so it
// is cut by sentence and each sentence goes with the theme it opens; a sentence that opens no theme stays with the last.
const LAYER_THEMES = [
  ['states', /^states \[/],
  ['overlays-dialogs-accordions', /^(A frame or group can be an accordion|Each child is a section|The clicking, the showing|overlay \{|The page is an artboard with overlay|When the overlay page holds|A modal, confirm or input|A frame can be a dialog|A dialog opens over)/],
  ['components', /^An instance \(a component\)/],
  ['repeaters-keynav', /^(A repeater|A frame or group can carry keyNav)/],
  ['layout-frames', /^An auto layout/],
  ['web-controls', /^Buttons and inputs/],
  ['common', /^Every layer has/],
];
const PARA_THEMES = [
  ['text', /^Text layers/],
  ['draw-script', /^(Script layers|\s+function |\s+g\.|\s+ix\.|Example: \{"type":"draw")/],
  ['shader', /^(Shader layers|Shader filter)/],
  ['charts-progress-connectors', /^(Progress bars|Charts|Connectors)/],
  ['images', /^Pictures/],
  ['bones', /^Bones/],
  ['paths', /^Paths/],
  ['defaults', /^(Defaults per type|- [a-z]+: \{)/],
];
const LAYER_TITLES = {
  common: 'Fields every layer has (position, accessibility, bindings, drag and drop)',
  states: 'Layer states (hover, pressed, focus, disabled, expression)',
  'overlays-dialogs-accordions': 'Accordions, tabs, overlays (tooltips, modals, confirms, prompts) and dialogs',
  components: 'Components (instance layers)',
  'repeaters-keynav': 'Repeaters, repeat.select and keyboard navigation (keyNav)',
  'layout-frames': 'Auto layout frames and their limits',
  'web-controls': 'Buttons and inputs',
  text: 'Text layers (rich text runs, per letter animation)',
  'draw-script': 'Script layers (type "draw") and the g drawing API',
  shader: 'Shader layers and shader filters',
  'charts-progress-connectors': 'Progress bars, charts and connectors',
  images: 'Pictures (image layers)',
  bones: 'Bones',
  paths: 'Paths and paints',
  defaults: 'Defaults per layer type (what add_layer fills in)',
};
{
  const groups = new Map();
  const add = (k, t) => groups.set(k, [...(groups.get(k) || []), t]);
  const paras = mcp.reference('layers').split('\n');
  const first = paras.shift();
  let theme = 'common';
  for (const s of first.split(/(?<=[.)])\s+(?=[A-Z]|states \[|overlay \{)/)) {
    theme = LAYER_THEMES.find(([, re]) => re.test(s))?.[0] || theme;
    add(theme, s);
  }
  theme = 'common';
  for (const p of paras) {
    if (!p.trim()) continue;
    theme = PARA_THEMES.find(([, re]) => re.test(p))?.[0] || theme;
    add(theme, p);
  }
  for (const [k, parts] of groups) {
    const joinWith = ['draw-script', 'defaults'].includes(k) ? '\n' : '\n\n';
    put(`layers/${k}.md`, `# ${LAYER_TITLES[k] || k}\n\n${parts.join(k === 'common' || LAYER_THEMES.some(([t]) => t === k) ? ' ' : joinWith)}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// interactions: every node in full, by category. A big category goes in parts of about 14 KB so one read stays small
{
  const all = mcp.reference('interactions-all');
  const nodes = all.split(/\n(?=### )/).filter((n) => n.startsWith('### '));
  const byCat = new Map();
  for (const n of nodes) {
    const cat = /^### \S+ — .*\((\w+)\)\s*$/m.exec(n)?.[1] || n.slice(4).split('.')[0];
    byCat.set(cat, [...(byCat.get(cat) || []), n.trim()]);
  }
  const index = [];
  for (const [cat, list] of [...byCat].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = [[]];
    let size = 0;
    for (const n of list) {
      if (size + n.length > 14000 && parts.at(-1).length) {
        parts.push([]);
        size = 0;
      }
      parts.at(-1).push(n);
      size += n.length;
    }
    parts.forEach((p, i) => {
      const file = parts.length === 1 ? `nodes/${cat}.md` : `nodes/${cat}-${i + 1}.md`;
      put(file, `# ${cat} nodes${parts.length > 1 ? `, part ${i + 1} of ${parts.length}` : ''}\n\n${p.join('\n\n')}`);
      for (const n of p) index.push(`- ${n.slice(4).split('\n')[0]}: ${file}`);
    });
  }
  put('nodes/INDEX.md', `# Interaction nodes, and the file each is in\n\n${mcp.reference('interactions').split('\n').slice(1, 2).join('\n')}\n\n${index.join('\n')}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// properties, colours and tokens, runtime
put('properties.md', `# Animatable and bindable property paths\n\nThe paths timelines, bindings, states and the Set/Animate property nodes take.\n\n${mcp.reference('properties')}`);
put('tokens.md', mcp.reference('colours'));
put('runtime.md', mcp.reference('runtime'));

// The design scale, read from its source so a change there reaches the agent on the next build
{
  const src = readFileSync(path.join(root, 'src', 'lib', 'design-scale.ts'), 'utf8');
  const consts = [...src.matchAll(/export const (\w+)\s*(?::[^=]+)?=\s*([^;]+);/g)].map(([, name, value]) => `- ${name}: ${value.replace(/\s+as const$/, '').replace(/\s+/g, ' ').trim()}`);
  put('design-scale.md', [
    '# The design scale',
    '',
    'Every kit the editor builds takes its numbers from here: spacing, corner radii, type sizes, control height and shadows. Use these, never numbers of your own.',
    '',
    ...consts,
    '',
    '- SPACE is for gaps and padding. RADIUS: small for little things on top (tooltip, tag), control for anything pressed or typed in, card for a box holding other things.',
    '- TYPE: small for hints and captions, body for reading and every control label, heading for a card heading, title for a page heading. Learner pages read best at 16 px or more for body text.',
    '- CONTROL_H is how tall anything pressed is (44 px: big enough for a finger).',
    '- StudyDesk embeds activities at about 800 px wide. Lay pages out for that width: one column of cards, or two at most, never a wide desktop layout.',
  ].join('\n'));
}

// ---------------------------------------------------------------------------------------------------------------------
// The help pages, one file each
const helpIds = mcp.reference('?').split('help pages: ')[1].split(', ').map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
for (const id of helpIds) put(`help/${id}.md`, mcp.reference(id));

// ---------------------------------------------------------------------------------------------------------------------
put('help/INDEX.md', ['# Help pages', '', ...[...files.keys()].filter((k) => k.startsWith('help/')).sort().map((k) => `- ${k.slice(5)}: ${files.get(k).split('\n')[0].replace(/^#+\s*/, '').slice(0, 110)}`)].join('\n'));

// INDEX.md: every file with its size, so the agent goes straight to the one it wants
{
  const lines = (rel) => files.get(rel).split('\n').length - 1;
  const row = (rel, what) => `- ${rel} (${lines(rel)} lines): ${what}`;
  const sorted = (prefix) => [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
  const firstLine = (rel) => files.get(rel).split('\n')[0].replace(/^#+\s*/, '').slice(0, 110);
  put('INDEX.md', [
    '# Ixia reference: where everything is',
    '',
    'Every file here is generated from the editor itself on each build. Read only the one you need. Paths are relative to refs/.',
    '',
    '## Layers',
    ...sorted('layers/').map((k) => row(k, LAYER_TITLES[path.basename(k, '.md')] || '')),
    '',
    '## Interaction nodes',
    row('nodes/INDEX.md', 'every node kind and the file it is in. Start here'),
    ...sorted('nodes/').filter((k) => k !== 'nodes/INDEX.md').map((k) => row(k, firstLine(k))),
    '',
    '## Looks and behaviour',
    row('design-scale.md', 'spacing, radii, type sizes, control height, shadows, the 800 px embed width'),
    row('tokens.md', 'colour values, theme tokens (token:<name>), text styles'),
    row('properties.md', 'animatable and bindable property paths'),
    row('runtime.md', 'script scope (globalThis), tokens at runtime, drag behaviour'),
    '',
    '## Help pages',
    row('help/INDEX.md', 'every help page (how-tos and tutorials) with its title. The file names are the help page ids'),
  ].join('\n'));
}

// Write it all, and take away anything a previous build left that this one didn't make
const want = new Set(files.keys());
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [path.relative(out, p).split(path.sep).join('/')];
});
mkdirSync(out, { recursive: true });
for (const old of walk(out)) if (!want.has(old)) rmSync(path.join(out, old));
for (const [rel, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  const p = path.join(out, ...rel.split('/'));
  mkdirSync(path.dirname(p), { recursive: true });
  let was = null;
  try {
    was = readFileSync(p, 'utf8');
  } catch {}
  if (was !== text) writeFileSync(p, text);
}
console.log(`agent-workspace/refs: ${files.size} files`);
//The MCP bundle can leave a timer running, and a build step must end
process.exit(0);
