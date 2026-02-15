/**
 * Test render wrapper — seeds sessionStorage before rendering.
 */

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { seedSessionStorage } from './fixtures.js';

interface TestRenderOptions extends RenderOptions {
  /** Pre-populate sessionStorage with demo data */
  withSessionData?: boolean;
  /** Override sessionStorage values */
  sessionOverrides?: Parameters<typeof seedSessionStorage>[0];
}

/**
 * Render a component with optional sessionStorage pre-population.
 */
export function renderWithSession(
  ui: ReactElement,
  options: TestRenderOptions = {}
) {
  const { withSessionData = true, sessionOverrides, ...renderOptions } = options;

  if (withSessionData) {
    seedSessionStorage(sessionOverrides);
  }

  return render(ui, renderOptions);
}

// Re-export everything from testing-library
export { screen, within, waitFor, act } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
