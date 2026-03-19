/**
 * Shared API key lazy-loader — ensures ANTHROPIC_API_KEY is available.
 *
 * Checks process.env first, then falls back to reading .env file.
 * Caches the result after first successful load.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('API_KEY');

let _cachedKey: string | undefined;

/**
 * Load ANTHROPIC_API_KEY from environment or .env file.
 * Returns the key or empty string if not found.
 */
export function ensureApiKey(): string {
  if (_cachedKey) return _cachedKey;
  if (process.env.ANTHROPIC_API_KEY) {
    _cachedKey = process.env.ANTHROPIC_API_KEY;
    return _cachedKey;
  }

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^ANTHROPIC_API_KEY=(.+)/);
      if (match) {
        const key = match[1].trim();
        process.env.ANTHROPIC_API_KEY = key;
        _cachedKey = key;
        return key;
      }
    }
  } catch {
    logger.debug('env_file_not_found', 'Could not read .env file');
  }

  return '';
}

/** Lazy getter — throws if key not available. */
export function getApiKey(context: string): string {
  const key = ensureApiKey();
  if (!key) throw new Error(`ANTHROPIC_API_KEY is required for ${context}`);
  return key;
}

/** Lazy accessor object for backwards compat. */
export function createApiKeyAccessor(context: string) {
  return { get value() { return getApiKey(context); } };
}
