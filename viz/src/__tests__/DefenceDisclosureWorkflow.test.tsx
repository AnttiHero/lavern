import { describe, expect, it } from 'vitest';
import { renderWithSession, screen } from '../test-utils/render.js';
import { TabBar } from '../delivery/components/TabBar.js';
import { useWorkflows } from '../staffing/hooks/useWorkflows.js';

function WorkflowNames() {
  const { workflows } = useWorkflows();
  return (
    <ul>
      {workflows.map(workflow => (
        <li key={workflow.id}>{workflow.name}</li>
      ))}
    </ul>
  );
}

describe('defence disclosure workflow UI', () => {
  it('shows Defence Disclosure in workflow fallback copy', () => {
    renderWithSession(<WorkflowNames />, { withSessionData: false });

    expect(screen.getByText('Defence Disclosure')).toBeInTheDocument();
  });

  it('uses defence-specific delivery tab labels', () => {
    const DefenceTabBar = TabBar as any;

    renderWithSession(
      <DefenceTabBar
        activeTab="work"
        onTabChange={() => {}}
        workflowId="defence-disclosure"
      />,
      { withSessionData: false }
    );

    expect(screen.getByText('Disclosure Map')).toBeInTheDocument();
    expect(screen.getByText('Proof Matrix')).toBeInTheDocument();
    expect(screen.getByText('Forensic Accounting')).toBeInTheDocument();
    expect(screen.getByText('Counsel Questions')).toBeInTheDocument();
  });
});
