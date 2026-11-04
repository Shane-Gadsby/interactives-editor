/** What the accessibility checker hands back. Plain data, so the panel, the report and the tests all read the same thing. */

/** `issue`: a check found a problem. `warning`: probably a problem, a person decides. `review`: the checker could not tell, a person has to look. */
export type Severity = 'issue' | 'warning' | 'review';

export type CheckId = 'contrast' | 'small-text' | 'keyboard' | 'name' | 'description' | 'target-size' | 'autoplay-motion' | 'autoplay-media' | 'pause' | 'flashing' | 'captions' | 'title';

export interface CheckInfo {
  id: CheckId;
  title: string;
  /** The WCAG 2.2 success criteria it speaks to, with their level. */
  wcag: string;
  /** Plain language: why it matters to the person using the page. */
  why: string;
  /** Plain language: what to do about it. */
  how: string;
}

/** Where a fix lands: one layer of an artboard, or the project's settings. */
export type FixTarget = { scope: 'layer'; artboardId: string; nodeId: string } | { scope: 'project' };

/** A change the panel can make for you. `set` is property paths to values, applied like the inspector would. */
export interface Fix {
  label: string;
  target: FixTarget;
  set: Record<string, unknown>;
  /** The fix needs a word from you first: its text goes into `set[key]`. */
  input?: { key: string; label: string; placeholder: string; value: string };
}

export interface Finding {
  /** Stable across edits (check + artboard + layer), so "reviewed" survives them. */
  id: string;
  check: CheckId;
  severity: Severity;
  title: string;
  /** What exactly was found, with the numbers. */
  detail: string;
  artboardId: string | null;
  artboardName: string;
  nodeId: string | null;
  nodeName: string;
  nodeType: string;
  /** The artboard is from a library and read-only here, so there is no fix. */
  readOnly?: boolean;
  fix?: Fix;
}

export interface A11yReport {
  generated: string;
  projectId: string;
  projectName: string;
  artboards: { id: string; name: string }[];
  findings: Finding[];
  /** The checks that ran. */
  checks: CheckInfo[];
  /** What this checker can't see, so a sign-off never reads as "nothing else is wrong". */
  notChecked: string[];
}
