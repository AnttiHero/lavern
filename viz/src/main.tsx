import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App.js';
import { AuthGate } from './auth/AuthGate.js';
import { installApiInterceptor } from './hooks/useApiFetch.js';

// Initialize Sentry error monitoring (if DSN configured)
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: 'lavern@0.12.0',
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
  });
}

// Install global fetch interceptor for API error handling (401/402/429/5xx)
installApiInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <AuthGate>
        <App />
      </AuthGate>
    </Sentry.ErrorBoundary>
  </StrictMode>
);

function SentryFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: "'Cormorant Garamond', Georgia, serif",
      backgroundColor: '#FAF9F6', color: '#1A1A1A', textAlign: 'center', padding: 40,
    }}>
      <h1 style={{ fontSize: 36, fontWeight: 300, fontStyle: 'italic', marginBottom: 16 }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, fontFamily: "'Inter', sans-serif", color: 'rgba(26,26,26,0.5)', marginBottom: 32, maxWidth: 400 }}>
        An unexpected error occurred. Our team has been notified.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 36px', fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
          letterSpacing: 2, textTransform: 'uppercase', color: '#fff', backgroundColor: '#1A1A1A',
          border: '2px solid #1A1A1A', borderRadius: 6, cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}
