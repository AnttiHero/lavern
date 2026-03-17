import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthGate } from './auth/AuthGate.js';
import { installApiInterceptor } from './hooks/useApiFetch.js';

// Install global fetch interceptor for API error handling (401/402/429/5xx)
installApiInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>
);
