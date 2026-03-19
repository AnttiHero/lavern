/**
 * TemplatePicker — Grid of document template cards shown in the briefing documents phase.
 *
 * Fetches templates from GET /api/templates, displays as a compact grid.
 * When selected, fetches the full template content and calls onSelect.
 */

import { useState, useEffect } from 'react';

interface TemplateMeta {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface Props {
  onSelect: (content: string, name: string) => void;
}

export function TemplatePicker({ onSelect }: Props) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.templates) setTemplates(d.templates); })
      .catch(() => {});
  }, []);

  if (templates.length === 0) return null;

  const handleSelect = async (id: string, name: string) => {
    setLoading(id);
    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.content) {
        onSelect(data.content, name);
      }
    } catch { /* ignore */ }
    finally { setLoading(null); }
  };

  return (
    <div className="mb-5">
      <div className="text-[11px] font-sans text-text-dim uppercase tracking-[1px] mb-3">
        Or start from a template
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => handleSelect(t.id, t.name)}
            disabled={loading !== null}
            aria-label={`Start from ${t.name} template — ${t.description}`}
            className="text-left p-3 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="text-[10px] font-sans text-text-dim uppercase tracking-[0.5px] mb-1">
              {t.category}
            </div>
            <div className="text-[13px] font-serif text-text font-normal leading-tight">
              {loading === t.id ? 'Loading...' : t.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
