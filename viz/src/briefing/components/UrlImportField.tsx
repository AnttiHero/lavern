/**
 * UrlImportField — Paste a URL to import content as a document.
 *
 * In demo mode: shows an informational message.
 * With backend: fetches via /api/utils/fetch-url proxy.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  onImport: (name: string, content: string, size: number) => void;
}

export function UrlImportField({ onImport }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!url.trim()) return;

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      setError('Invalid URL');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/utils/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: parsedUrl.href }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const content = data.text ?? data.content ?? '';
      const name = parsedUrl.hostname + parsedUrl.pathname.slice(0, 30);

      onImport(name, content, new Blob([content]).size);
      setSuccess(`Imported from ${parsedUrl.hostname}`);
      setUrl('');
    } catch {
      setError('URL import requires the backend server. Paste content directly instead.');
    } finally {
      setLoading(false);
    }
  }, [url, onImport]);

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleImport()}
          placeholder="Paste a URL to import..."
          style={styles.input}
          disabled={loading}
        />
        <button
          onClick={handleImport}
          disabled={loading || !url.trim()}
          style={{
            ...styles.button,
            opacity: loading || !url.trim() ? 0.5 : 1,
            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Importing...' : 'Import'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: spacing.sm,
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    padding: '8px 12px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  error: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.danger,
    marginTop: 4,
  },
  success: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.success,
    marginTop: 4,
  },
};
