import { helpSearch, helpTopics, helpViews } from '../src/help/lazy';
import { brandedStarters } from '../src/lib/branded-lazy';
import { codeMirror } from '../src/components/CodeEditor';
import { rawEditor } from '../src/panels/DataFileEditor';

// The editor loads help, the starter sets and CodeMirror in chunks of their own the first time they are wanted. A test that
// looks at what they draw has them in before it starts, the way the editor has after its warm-up.
export const warmHelp = () => Promise.all([helpViews.ensure(), helpTopics.ensure(), helpSearch.ensure()]);
export const warmStarters = () => brandedStarters.ensure();
export const warmCode = () => Promise.all([codeMirror.ensure(), rawEditor.ensure()]);
