/**
 * TeamBench — Fixed bottom bar showing selected agents, budget, and confirm button.
 * Warm editorial — frosted paper background, clean layout.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { BenchAgent } from './BenchAgent.js';
import { BudgetMeter } from './BudgetMeter.js';
import { ConfirmButton } from './ConfirmButton.js';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

const INTENSITY_COLORS: Record<string, string> = {
  quick: colors.success,
  standard: colors.lawyer,
  thorough: colors.specialist,
  maximal: colors.text,
};

interface Props {
  selectedProfiles: AgentProfile[];
  teamSize: number;
  totalCost: number;
  confirming: boolean;
  onRemove: (role: string) => void;
  onConfirm: () => void;
  onClear: () => void;
  intensity?: string;
  yoloMode?: boolean;
  atCapFlash?: boolean;
  maxTeamSize?: number;
}

export function TeamBench({
  selectedProfiles,
  teamSize,
  totalCost,
  confirming,
  onRemove,
  onConfirm,
  onClear,
  intensity,
  yoloMode,
  atCapFlash,
  maxTeamSize = 14,
}: Props) {
  const intensityColor = intensity ? INTENSITY_COLORS[intensity] ?? colors.textMuted : undefined;

  // Scroll shadow: detect if chips container can scroll right
  const chipsRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth > el.clientWidth + 8 && el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  // Re-check scroll when team changes
  useEffect(() => { checkScroll(); }, [teamSize, checkScroll]);

  // Auto-scroll to end when new agent added
  useEffect(() => {
    const el = chipsRef.current;
    if (el && teamSize > 0) {
      el.scrollLeft = el.scrollWidth;
      // Re-check after scroll completes
      setTimeout(checkScroll, 100);
    }
  }, [teamSize, checkScroll]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(250, 249, 246, 0.92)',
      backdropFilter: 'blur(12px)',
      borderTop: `1px solid ${yoloMode ? colors.warning : colors.border}`,
      padding: `${spacing.lg}px ${spacing.xxl}px`,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.lg,
      zIndex: 100,
      minHeight: 88,
    }}>
      {/* Agent chips */}
      <div
        ref={chipsRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '4px 0',
          scrollBehavior: 'smooth',
          maskImage: canScrollRight ? 'linear-gradient(to right, black 85%, transparent)' : undefined,
          WebkitMaskImage: canScrollRight ? 'linear-gradient(to right, black 85%, transparent)' : undefined,
        }}>
        {teamSize === 0 ? (
          <span style={{
            fontSize: 13,
            fontFamily: fonts.sans,
            color: colors.textDim,
            fontStyle: 'italic',
          }}>
            Select agents or choose a preset...
          </span>
        ) : (
          <AnimatePresence mode="popLayout">
            {selectedProfiles.map(p => (
              <BenchAgent key={p.role} profile={p} onRemove={onRemove} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Cap flash message */}
      {atCapFlash && (
        <span style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: colors.warning,
          backgroundColor: colors.warningBg,
          border: '1px solid rgba(184, 134, 11, 0.2)',
          borderRadius: radii.sm,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}>
          Team full ({maxTeamSize} max)
        </span>
      )}

      {/* Intensity badge */}
      {intensity && (
        <span style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: intensityColor,
          backgroundColor: `${intensityColor}10`,
          border: `1px solid ${intensityColor}30`,
          borderRadius: radii.sm,
          padding: '3px 8px',
          textTransform: 'capitalize',
          whiteSpace: 'nowrap',
        }}>
          {intensity}
        </span>
      )}

      {/* YOLO indicator */}
      {yoloMode && (
        <span style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: colors.warning,
          backgroundColor: colors.warningBg,
          border: `1px solid rgba(184, 134, 11, 0.2)`,
          borderRadius: radii.sm,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}>
          {'\u26A1'} Yolo
        </span>
      )}

      {/* Budget meter */}
      <BudgetMeter teamSize={teamSize} totalCost={totalCost} />

      {/* Clear button */}
      {teamSize > 0 && (
        <button
          onClick={onClear}
          style={{
            padding: '5px 12px',
            borderRadius: radii.md,
            border: `1px solid ${colors.border}`,
            backgroundColor: 'transparent',
            color: colors.textMuted,
            fontFamily: fonts.sans,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      )}

      {/* Confirm button */}
      <ConfirmButton
        disabled={teamSize === 0}
        confirming={confirming}
        teamSize={teamSize}
        onConfirm={onConfirm}
      />
    </div>
  );
}
