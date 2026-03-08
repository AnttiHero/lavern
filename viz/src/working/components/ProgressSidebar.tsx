/**
 * ProgressSidebar — Claude Code-style workflow checklist.
 *
 * v19: Real thinking checklist — shows ACTUAL agent actions, not static
 *      descriptions. Every tool call, every finding, every challenge appears
 *      as a live checklist item under the agent that produced it.
 *
 * Layout:
 *   ✓ Analysis
 *     ✓ Design Reviewer — Analyzing document structure
 *       ✓ Reading document
 *       ✓ Checking heading structure
 *       ✓ Analyzing visual hierarchy
 *       ⚡ Found: Heading structure needs improvement
 *     ✓ Ethics Auditor — Reviewing ethical compliance
 *       ✓ Reading document
 *       ✓ Checking accessibility
 *   ● First Review  ← current, pulsing
 *     ◉ Ethics Auditor — Challenging liability analysis
 *       ✓ Comparing clauses
 *       ◉ Checking defined terms...
 *   ○ Transformation
 */

import { useMemo, useState } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import type { StreamCard, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { WORKFLOW_STEP_MAP, WORKFLOW_STEPS, STEP_LABELS } from '../../types/events.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';
import { formatToolName, INTERESTING_TOOLS } from '../utils/toolLabels.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface ProgressSidebarProps {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  streamCards?: StreamCard[];
  activeThinkingAgents?: Map<string, ActiveThinkingAgent>;
  team?: AgentProfile[];
  isMobile?: boolean;
  isTablet?: boolean;
}

/** Format a role string for display. */
function displayRole(role: string, team?: AgentProfile[]): string {
  if (team) {
    const profile = team.find(p => p.role === role);
    if (profile) return profile.displayName;
  }
  return role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** A single checklist sub-item under an agent. */
interface ChecklistItem {
  kind: 'tool' | 'finding' | 'challenge';
  label: string;
  completed: boolean;
}

interface StepAgentInfo {
  role: string;
  task: string;
  completed: boolean;
  items: ChecklistItem[];
}

/**
 * Walk stream cards and group agent activity by workflow step.
 * Collects ACTUAL tool calls and findings per agent — the real thinking.
 */
function buildStepAgents(streamCards: StreamCard[]): Map<string, StepAgentInfo[]> {
  const result = new Map<string, StepAgentInfo[]>();
  let currentStep = 'intake';

  // Helper: find or create agent entry in a step
  function getAgent(step: string, role: string, task?: string): StepAgentInfo {
    if (!result.has(step)) result.set(step, []);
    const agents = result.get(step)!;
    let agent = agents.find(a => a.role === role && !a.completed);
    if (!agent) {
      agent = { role, task: task ?? '', completed: false, items: [] };
      agents.push(agent);
    }
    return agent;
  }

  for (const card of streamCards) {
    if (card.kind === 'workflow_step') {
      currentStep = card.step;
    } else if (card.kind === 'agent_start') {
      getAgent(currentStep, card.role, card.task);
    } else if (card.kind === 'tool_used') {
      const agentRole = card.agent;
      if (!agentRole) continue;
      // Only track interesting tools (skip infrastructure)
      if (!INTERESTING_TOOLS.has(card.tool)) continue;
      const agent = getAgent(currentStep, agentRole);
      // Avoid duplicate consecutive tools
      const label = formatToolName(card.tool);
      const lastItem = agent.items[agent.items.length - 1];
      if (lastItem?.kind === 'tool' && lastItem.label === label) continue;
      agent.items.push({ kind: 'tool', label, completed: false });
    } else if (card.kind === 'finding') {
      const agentRole = card.agent;
      if (!agentRole) continue;
      const agent = getAgent(currentStep, agentRole);
      // Truncate finding to fit sidebar
      const summary = card.content.length > 50
        ? card.content.slice(0, 47) + '...'
        : card.content;
      agent.items.push({ kind: 'finding', label: summary, completed: true });
    } else if (card.kind === 'challenge') {
      const agentRole = card.challenger;
      if (!agentRole) continue;
      const agent = getAgent(currentStep, agentRole);
      const summary = card.challengeText.length > 50
        ? card.challengeText.slice(0, 47) + '...'
        : card.challengeText;
      agent.items.push({ kind: 'challenge', label: summary, completed: true });
    } else if (card.kind === 'agent_stop') {
      // Mark the agent and all their items as completed.
      // Search in REVERSE step order so we match the most recent step first
      // (an agent can appear in multiple steps — e.g. Ethics Auditor in Analysis + First Review)
      const entries = Array.from(result.entries());
      for (let j = entries.length - 1; j >= 0; j--) {
        const agent = entries[j][1].find(a => a.role === card.role && !a.completed);
        if (agent) {
          agent.completed = true;
          for (const item of agent.items) item.completed = true;
          break;
        }
      }
    }
  }

  return result;
}

/** Renders a single agent with its real checklist items. */
function AgentChecklist({
  agent,
  team,
  status,
  currentTool,
}: {
  agent: StepAgentInfo;
  team?: AgentProfile[];
  status: 'active' | 'completed';
  currentTool?: string;
}) {
  const name = displayRole(agent.role, team);
  const isActive = status === 'active';
  // Truncate task for display
  const task = agent.task.length > 40
    ? agent.task.slice(0, 37) + '...'
    : agent.task;

  return (
    <div style={styles.agentBlock}>
      {/* Agent header: name + task */}
      <div style={isActive ? styles.activeAgentItem : styles.agentItem}>
        {isActive
          ? <span style={styles.activeAgentDot} />
          : <span style={styles.agentCheck}>{'\u2713'}</span>
        }
        <span style={isActive ? styles.activeAgentText : styles.agentText}>
          {name}
        </span>
      </div>
      {/* Task description */}
      {task && (
        <div style={styles.taskLine}>
          <span style={styles.taskText}>{task}</span>
        </div>
      )}

      {/* Real checklist items — actual tools used, findings, challenges */}
      {agent.items.length > 0 && (
        <div style={styles.itemList}>
          {agent.items.map((item, i) => (
            <div key={i} style={styles.itemRow}>
              {item.kind === 'finding' ? (
                <span style={styles.findingIcon}>{'\u26A1'}</span>
              ) : item.kind === 'challenge' ? (
                <span style={styles.challengeIcon}>{'\u2694'}</span>
              ) : item.completed ? (
                <span style={styles.itemCheck}>{'\u2713'}</span>
              ) : (
                <span style={styles.itemSpinner} />
              )}
              <span
                style={{
                  ...styles.itemText,
                  ...(item.kind === 'finding' ? styles.itemTextFinding : {}),
                  ...(item.kind === 'challenge' ? styles.itemTextChallenge : {}),
                }}
              >
                {item.kind === 'finding' ? `Found: ${item.label}` :
                 item.kind === 'challenge' ? `Challenge: ${item.label}` :
                 item.label}
              </span>
            </div>
          ))}

          {/* Show current tool as in-progress for active agents */}
          {isActive && currentTool && INTERESTING_TOOLS.has(currentTool) && (
            <div style={styles.itemRow}>
              <span style={styles.itemSpinner} />
              <span style={{ ...styles.itemText, ...styles.itemTextActive }}>
                {formatToolName(currentTool)}...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Active with no items yet — show pulsing placeholder */}
      {isActive && agent.items.length === 0 && !currentTool && (
        <div style={styles.taskLine}>
          <span style={{ ...styles.taskText, fontStyle: 'italic' }}>Starting up...</span>
        </div>
      )}
    </div>
  );
}

export function ProgressSidebar({
  currentStep,
  completedSteps,
  streamCards,
  activeThinkingAgents,
  team,
  isMobile,
  isTablet,
}: ProgressSidebarProps) {
  // Resolve the correct pipeline for this workflow
  const [workflowId] = useState<string>(() => {
    try {
      const configStr = sessionStorage.getItem('shem-briefing-config');
      if (configStr) {
        const config = JSON.parse(configStr);
        return config.workflowId ?? '';
      }
    } catch { /* ignore */ }
    return '';
  });

  const pipelineSteps = useMemo(() => {
    if (workflowId && WORKFLOW_STEP_MAP[workflowId]) {
      return WORKFLOW_STEP_MAP[workflowId];
    }
    if (currentStep && !WORKFLOW_STEPS.includes(currentStep)) {
      const seen = new Set<WorkflowStep>();
      const ordered: WorkflowStep[] = [];
      for (const s of completedSteps) {
        if (!seen.has(s)) { seen.add(s); ordered.push(s); }
      }
      if (!seen.has(currentStep)) {
        seen.add(currentStep);
        ordered.push(currentStep);
      }
      if (!seen.has('delivered')) ordered.push('delivered');
      return ordered;
    }
    return WORKFLOW_STEPS;
  }, [workflowId, currentStep, completedSteps]);

  // Estimated time remaining
  const estMinutes = useMemo(() => {
    let total = 0;
    let pastCurrent = false;
    for (const step of pipelineSteps) {
      const isCurrent = step === currentStep;
      const isCompleted = completedSteps.includes(step);
      if (isCurrent) pastCurrent = true;
      if (!isCompleted || isCurrent) {
        if (pastCurrent || isCurrent) {
          total += PHASE_DESCRIPTIONS[step]?.estimatedMinutes ?? 1;
        }
      }
    }
    return total;
  }, [pipelineSteps, currentStep, completedSteps]);

  // Progress label
  const currentIndex = pipelineSteps.indexOf(currentStep);
  const totalSteps = pipelineSteps.length;
  const progressLabel = currentIndex >= 0
    ? `${Math.min(currentIndex + 1, totalSteps)} of ${totalSteps}`
    : '';

  // Build agent-level task map from stream cards
  const stepAgents = useMemo(
    () => buildStepAgents(streamCards ?? []),
    [streamCards],
  );

  // Active thinking agents for the current step
  const activeAgents = useMemo(() => {
    if (!activeThinkingAgents) return [];
    return Array.from(activeThinkingAgents.values());
  }, [activeThinkingAgents]);

  return (
    <aside style={{
      ...styles.container,
      ...(isMobile ? {
        width: '100%',
        maxHeight: '40vh',
        borderRight: 'none',
        borderBottom: `1px solid ${colors.border}`,
      } : isTablet ? {
        width: 200,
      } : {}),
    }} id="progress-sidebar" aria-label="Workflow progress">
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Checklist</span>
        {progressLabel && (
          <span style={styles.headerCount}>{progressLabel}</span>
        )}
      </div>

      {/* Steps */}
      <div style={styles.stepList}>
        {pipelineSteps.map((step, idx) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;
          const isLast = idx === pipelineSteps.length - 1;
          const phase = PHASE_DESCRIPTIONS[step];
          const label = STEP_LABELS[step] ?? step.replace(/_/g, ' ');
          const agents = stepAgents.get(step) ?? [];

          return (
            <div key={step} style={styles.stepRow}>
              {/* Indicator column: dot + connecting line */}
              <div style={styles.indicatorCol}>
                <div
                  style={{
                    ...styles.dot,
                    ...(isCompleted ? styles.dotDone : {}),
                    ...(isCurrent ? styles.dotCurrent : {}),
                    ...(isUpcoming ? styles.dotUpcoming : {}),
                  }}
                >
                  {isCompleted && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {!isLast && (
                  <div
                    style={{
                      ...styles.line,
                      backgroundColor: isCompleted ? colors.success : colors.border,
                    }}
                  />
                )}
              </div>

              {/* Content column */}
              <div style={styles.contentCol}>
                <span
                  style={{
                    ...styles.stepLabel,
                    ...(isCurrent ? styles.stepLabelCurrent : {}),
                    ...(isCompleted ? styles.stepLabelDone : {}),
                    ...(isUpcoming ? styles.stepLabelUpcoming : {}),
                  }}
                >
                  {label}
                </span>

                {/* Agent checklist — completed steps show real work done */}
                {isCompleted && agents.length > 0 && (
                  <div style={styles.agentList}>
                    {agents.map((agent, ai) => (
                      <AgentChecklist
                        key={`${agent.role}-${ai}`}
                        agent={agent}
                        team={team}
                        status="completed"
                      />
                    ))}
                  </div>
                )}

                {/* Current step: active agents with live tool progress */}
                {isCurrent && (
                  <>
                    {/* Active agents — show their real-time tool progress */}
                    {activeAgents.length > 0 && (
                      <div style={styles.agentList}>
                        {activeAgents.map((agent) => {
                          // Find this agent's data in stepAgents for tool history
                          const agentData = agents.find(a => a.role === agent.role && !a.completed);
                          return (
                            <AgentChecklist
                              key={agent.role}
                              agent={agentData ?? { role: agent.role, task: agent.task, completed: false, items: [] }}
                              team={team}
                              status="active"
                              currentTool={agent.toolsUsed[agent.toolsUsed.length - 1]}
                            />
                          );
                        })}
                      </div>
                    )}
                    {/* Agents that finished in this step */}
                    {agents.filter(a => a.completed).length > 0 && (
                      <div style={styles.agentList}>
                        {agents.filter(a => a.completed).map((agent, ai) => (
                          <AgentChecklist
                            key={`done-${agent.role}-${ai}`}
                            agent={agent}
                            team={team}
                            status="completed"
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Upcoming step: description */}
                {isUpcoming && phase?.description && (
                  <span style={styles.stepDesc}>
                    {phase.description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: estimated time + reassurance */}
      {estMinutes > 0 && currentStep !== 'delivered' && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            ~{estMinutes} min remaining
          </span>
          <span style={styles.footerReassurance}>
            Everything is working normally {'\u2714'}
          </span>
        </div>
      )}
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 260,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
  },
  header: {
    padding: '14px 16px 10px',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  headerCount: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
  stepList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
  },
  stepRow: {
    display: 'flex',
    gap: 10,
    minHeight: 28,
  },
  indicatorCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: 16,
    flexShrink: 0,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.4s ease',
  },
  dotDone: {
    backgroundColor: colors.success,
    animation: 'stepDotPop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
  },
  dotCurrent: {
    backgroundColor: colors.warning,
    boxShadow: `0 0 0 3px rgba(184, 134, 11, 0.15)`,
    animation: 'activeThinkingPulse 2s ease-in-out infinite',
  },
  dotUpcoming: {
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.border}`,
  },
  line: {
    width: 1.5,
    flex: 1,
    minHeight: 8,
    transition: 'background-color 0.4s ease',
  },
  contentCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    paddingBottom: 12,
    minWidth: 0,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    lineHeight: '16px',
    transition: 'color 0.3s ease',
  },
  stepLabelCurrent: {
    color: colors.text,
    fontWeight: 600,
  },
  stepLabelDone: {
    color: colors.textMuted,
  },
  stepLabelUpcoming: {
    color: colors.textDim,
  },
  stepDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    lineHeight: 1.35,
  },
  // Agent blocks with real checklist
  agentList: {
    marginTop: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  agentBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
  },
  agentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  agentCheck: {
    fontSize: 9,
    color: colors.success,
    fontWeight: 700,
    flexShrink: 0,
    width: 12,
    textAlign: 'center' as const,
  },
  agentText: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  activeAgentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  activeAgentDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.warning,
    flexShrink: 0,
    marginLeft: 3,
    animation: 'activeThinkingPulse 2s ease-in-out infinite',
  },
  activeAgentText: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },

  // Task description line
  taskLine: {
    paddingLeft: 17,
  },
  taskText: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: colors.textDim,
    lineHeight: 1.3,
  },

  // Real checklist sub-items (tools, findings, challenges)
  itemList: {
    paddingLeft: 17,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    marginTop: 1,
  },
  itemRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    minHeight: 14,
  },
  itemCheck: {
    fontSize: 7,
    color: colors.success,
    fontWeight: 700,
    flexShrink: 0,
    width: 10,
    textAlign: 'center' as const,
    lineHeight: '14px',
    opacity: 0.6,
  },
  itemSpinner: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: colors.warning,
    flexShrink: 0,
    marginTop: 4,
    marginLeft: 2.5,
    marginRight: 2.5,
    animation: 'activeThinkingPulse 1.5s ease-in-out infinite',
  },
  itemText: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: colors.textDim,
    lineHeight: '14px',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  itemTextActive: {
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  itemTextFinding: {
    color: colors.warning,
    fontWeight: 500,
  },
  itemTextChallenge: {
    color: '#8B5CF6',
    fontWeight: 500,
  },
  findingIcon: {
    fontSize: 8,
    flexShrink: 0,
    width: 10,
    textAlign: 'center' as const,
    lineHeight: '14px',
  },
  challengeIcon: {
    fontSize: 8,
    flexShrink: 0,
    width: 10,
    textAlign: 'center' as const,
    lineHeight: '14px',
  },

  footer: {
    padding: '10px 16px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  footerText: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
  footerReassurance: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.success,
    opacity: 0.7,
  },
};
