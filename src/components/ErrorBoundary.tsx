import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/analytics';

interface Props {
  /** What to tell the person when it fails. */
  message: string;
  /** Which part this is, for the fault report (a short lowercase name; defaults to the start of the message). */
  name?: string;
  /** Class of the element shown instead (the failed part's own class keeps it in its place in the grid). */
  className?: string;
  /** When this changes after a failure, the part is tried again (a new document revision, a different artboard). */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one part of the editor failing from taking the whole page down. A render error (a document with a value no
 * code expected) shows a short message with a Reload button that tries the part again, instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info?: ErrorInfo): void {
    console.error('[interactives-editor]', this.props.message, error);
    // For triage: which part, and the first component names of the React stack (code names, nothing of the person's)
    const where = this.props.name ?? this.props.message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const comps = (info?.componentStack ?? '')
      .split('\n')
      .map((l) => /^\s*at ([A-Z][\w$]*)/.exec(l)?.[1])
      .filter(Boolean)
      .slice(0, 3)
      .join('.');
    reportError({ kind: 'boundary', error, where, detail: { in: comps || undefined } });
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`crash-box ${this.props.className ?? ''}`} role="alert">
        <p>{this.props.message}</p>
        <p className="muted crash-detail">{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Reload
        </button>
      </div>
    );
  }
}
