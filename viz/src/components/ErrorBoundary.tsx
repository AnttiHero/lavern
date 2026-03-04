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
          color: colors.text,
          backgroundColor: colors.bg,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center' as const,
        }}>
          <div style={{ fontFamily: fonts.serif, fontSize: 48, fontWeight: 300, marginBottom: 16, opacity: 0.3 }}>M</div>
          <h2 style={{ fontFamily: fonts.serif, fontWeight: 300, fontSize: 22, margin: '0 0 8px' }}>Something unexpected happened</h2>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 24px', maxWidth: 360 }}>
            Please reload the page. If the issue persists, check the browser console for details.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 32px',
              border: `2px solid ${colors.text}`,
              backgroundColor: colors.text,
              color: '#fff',
              fontFamily: fonts.sans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'background-color 0.25s ease, color 0.25s ease',
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
