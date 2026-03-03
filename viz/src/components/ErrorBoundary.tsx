import { Component } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          fontFamily: fonts.sans,
          color: colors.danger,
          backgroundColor: colors.bg,
          minHeight: '100vh',
        }}>
          <h2 style={{ fontFamily: fonts.serif, fontWeight: 300 }}>Something went wrong</h2>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: colors.text }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 24px',
              border: `1px solid ${colors.text}`,
              backgroundColor: 'transparent',
              color: colors.text,
              fontFamily: fonts.sans,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
