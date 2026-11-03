import { Component, type ReactNode } from 'react';

interface Props {
  /** What to tell the person when it fails. */
  message: string;
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

  componentDidCatch(error: Error): void {
    console.error('[interactives-editor]', this.props.message, error);
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
