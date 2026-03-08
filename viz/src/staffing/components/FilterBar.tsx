/**
 * FilterBar — Category tabs + sub-group pills + sort dropdown + search input.
 *
 * Warm editorial design — Inter font, paper-tone backgrounds, no neon.
 */

import { colors, fonts, radii, spacing, categoryColor } from '../styles/tokens.js';
import type { CategoryFilter, SortOption } from '../hooks/useAgentProfiles.js';

export type SubGroupFilter = string;

interface Props {
  category: CategoryFilter;
  onCategoryChange: (cat: CategoryFilter) => void;
  subGroup: SubGroupFilter;
  onSubGroupChange: (sg: SubGroupFilter) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  search: string;
  onSearchChange: (q: string) => void;
  summary: { total: number; lawyers: number; specialists: number; infrastructure: number; orchestrators: number };
  subGroupCounts: Record<string, number>;
}

const categories: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  // Orchestrators are shown in the OrchestratorPanel, not in the grid
  { key: 'lawyer', label: 'Lawyers' },
  { key: 'specialist', label: 'Specialists' },
  { key: 'infrastructure', label: 'Infrastructure' },
];

const lawyerSubGroups: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'partners', label: 'Partners' },
  { key: 'senior-associates', label: 'Senior Associates' },
  { key: 'associates', label: 'Associates' },
  { key: 'juniors', label: 'Juniors' },
];

const specialistSubGroups: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'design', label: 'Design' },
  { key: 'research', label: 'Research' },
  { key: 'ethics', label: 'Ethics' },
  { key: 'tech', label: 'Technology' },
  { key: 'industry', label: 'Industry' },
  { key: 'legacy', label: 'Legacy' },
];

const sortOptions: Array<{ key: SortOption; label: string }> = [
  { key: 'default', label: 'Default' },
  { key: 'billing-asc', label: 'Cost \u2191' },
  { key: 'billing-desc', label: 'Cost \u2193' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'name', label: 'A\u2013Z' },
];

function countFor(cat: CategoryFilter, summary: Props['summary']): number {
  if (cat === 'all') return summary.total;
  if (cat === 'lawyer') return summary.lawyers;
  if (cat === 'specialist') return summary.specialists;
  if (cat === 'infrastructure') return summary.infrastructure;
  if (cat === 'orchestrator') return summary.orchestrators;
  return 0;
}

export function FilterBar({
  category, onCategoryChange,
  subGroup, onSubGroupChange,
  sort, onSortChange,
  search, onSearchChange,
  summary,
  subGroupCounts,
}: Props) {
  const activeSubGroups = category === 'lawyer'
    ? lawyerSubGroups
    : category === 'specialist'
      ? specialistSubGroups
      : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
      padding: `${spacing.md}px 0`,
    }}>
      {/* Top row: category tabs + sort + search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        flexWrap: 'wrap',
      }}>
        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {categories.map(cat => {
            const active = category === cat.key;
            const color = cat.key === 'all' ? colors.text : categoryColor(cat.key);

            return (
              <button
                key={cat.key}
                onClick={() => {
                  onCategoryChange(cat.key);
                  onSubGroupChange('all');
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: radii.md,
                  border: `1px solid ${active ? color : 'transparent'}`,
                  backgroundColor: active ? `${color}10` : 'transparent',
                  color: active ? color : colors.textMuted,
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {cat.label}
                <span style={{
                  fontSize: 10,
                  color: active ? color : colors.textDim,
                }}>
                  {countFor(cat.key, summary)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Sort */}
        <select
          value={sort}
          onChange={e => onSortChange(e.target.value as SortOption)}
          style={{
            padding: '5px 10px',
            borderRadius: radii.md,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bgInput,
            color: colors.text,
            fontFamily: fonts.sans,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {sortOptions.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            padding: '5px 12px',
            borderRadius: radii.md,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.bgInput,
            color: colors.text,
            fontFamily: fonts.sans,
            fontSize: 12,
            width: 180,
          }}
        />
      </div>

      {/* Sub-group pills (when a category with sub-groups is selected) */}
      {activeSubGroups && (
        <div style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          paddingLeft: 2,
        }}>
          {activeSubGroups.map(sg => {
            const active = subGroup === sg.key;
            const count = sg.key === 'all'
              ? countFor(category, summary)
              : (subGroupCounts[sg.key] ?? 0);

            // Hide sub-groups with 0 agents (except "All")
            if (count === 0 && sg.key !== 'all') return null;

            return (
              <button
                key={sg.key}
                onClick={() => onSubGroupChange(sg.key)}
                style={{
                  padding: '3px 10px',
                  borderRadius: radii.pill,
                  border: `1px solid ${active ? colors.text : colors.border}`,
                  backgroundColor: active ? colors.text : 'transparent',
                  color: active ? '#fff' : colors.textMuted,
                  fontFamily: fonts.sans,
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {sg.label}
                <span style={{
                  fontSize: 9,
                  color: active ? 'rgba(255,255,255,0.7)' : colors.textDim,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
