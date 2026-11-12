import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  tabName: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render crashes in a tab and shows the error instead of a blank page.
 * This is how we diagnose "tab not loading" — the message names the culprit.
 */
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[TradeDesk] ${this.props.tabName} tab crashed:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-panel" style={{ margin: '16px', padding: '16px' }}>
          <h3>⚠ {this.props.tabName} tab failed to render</h3>
          <p className="muted small">
            {this.state.error.message || String(this.state.error)}
          </p>
          <button
            className="btn"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
