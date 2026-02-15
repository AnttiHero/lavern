/**
 * Matter Types — Pre-engagement workflow artifacts.
 *
 * A "matter" in law-firm terminology is the unit of work.
 * Before substantive legal work begins, the firm runs a pre-engagement
 * process: conflict check → KYC → engagement letter → team staffing.
 *
 * The MatterRecord holds all artifacts from this process and links
 * to the session(s) that perform the actual work.
 */

// ── Status ──────────────────────────────────────────────────────────────

export type MatterStatus =
  | 'pre-engagement'   // Pre-engagement workflow in progress
  | 'engaged'          // Engagement accepted, team selected, ready for work
  | 'active'           // Substantive work session(s) in progress
  | 'completed'        // All deliverables produced
  | 'closed';          // Matter archived

export type FeeStructure = 'fixed' | 'hourly' | 'outcome-based' | 'subscription';

// ── Pre-Engagement Artifacts ────────────────────────────────────────────

export interface ConflictCheckResult {
  /** Whether any conflict was found */
  conflictFound: boolean;
  /** Matter IDs of conflicting matters (if any) */
  conflictingMatters: string[];
  /** Type of conflict */
  conflictType?: 'direct' | 'positional' | 'related-party';
  /** How the conflict was resolved (waiver, wall, declined) */
  resolution?: string;
  /** When the check was performed */
  checkedAt: string;
}

export interface KycResult {
  /** Whether the client was successfully verified */
  clientVerified: boolean;
  /** Assessed risk level */
  riskLevel: 'low' | 'medium' | 'high';
  /** Any flags raised during screening */
  flags: string[];
  /** When KYC was completed */
  completedAt: string;
}

export interface EngagementLetter {
  /** Description of scope of work */
  scope: string;
  /** Fee arrangement type */
  feeStructure: FeeStructure;
  /** Estimated budget range */
  estimatedBudget: { min: number; max: number; currency: string };
  /** Key liability terms summary */
  liabilityTerms: string;
  /** Data handling and confidentiality terms */
  dataHandling: string;
  /** Proposed team composition (role IDs) */
  teamComposition: string[];
  /** When the letter was generated */
  generatedAt: string;
  /** When the client accepted (if they did) */
  acceptedAt?: string;
  /** Whether the client has accepted */
  accepted: boolean;
}

// ── Matter Record ───────────────────────────────────────────────────────

export interface MatterRecord {
  /** Unique matter identifier */
  matterId: string;

  /** Client who engaged the firm */
  clientId: string;

  /** Human-readable matter number (e.g., "SHEM-2026-001") */
  matterNumber: string;

  /** Brief title describing the matter */
  title: string;

  /** Detailed description of the work requested */
  description: string;

  /** Current matter status */
  status: MatterStatus;

  // ── Pre-engagement artifacts ──

  /** Conflict check results (null if not yet run) */
  conflictCheck: ConflictCheckResult | null;

  /** KYC screening results (null if not yet run) */
  kyc: KycResult | null;

  /** Generated engagement letter (null if not yet generated) */
  engagementLetter: EngagementLetter | null;

  /** Whether an NDA is required for this matter */
  ndaRequired: boolean;

  /** Whether the NDA has been accepted by the client */
  ndaAccepted: boolean;

  // ── Team ──

  /** Agent roles assigned to this matter (selected by client) */
  assignedTeam: string[];

  // ── Billing ──

  /** Internal billing code */
  billingCode: string;

  /** Estimated budget in USD */
  estimatedBudget: number;

  /** Actual spend so far in USD */
  actualSpend: number;

  // ── Metadata ──

  /** When the matter was opened */
  openedAt: string;

  /** When the matter was closed (if closed) */
  closedAt?: string;

  /** Primary jurisdiction */
  jurisdiction: string;

  /** Primary practice area */
  practiceArea: string;

  /** Session IDs linked to this matter */
  sessionIds: string[];
}

// ── Factory ─────────────────────────────────────────────────────────────

let matterSequence = 0;

/**
 * Generate the next matter number in sequence.
 * Format: SHEM-{YEAR}-{NNN}
 */
export function generateMatterNumber(): string {
  matterSequence++;
  const year = new Date().getFullYear();
  const seq = String(matterSequence).padStart(3, '0');
  return `SHEM-${year}-${seq}`;
}

/**
 * Create a new MatterRecord with defaults.
 */
export function createMatterRecord(
  clientId: string,
  title: string,
  description: string,
  options?: {
    jurisdiction?: string;
    practiceArea?: string;
    ndaRequired?: boolean;
  },
): MatterRecord {
  const matterId = `matter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    matterId,
    clientId,
    matterNumber: generateMatterNumber(),
    title,
    description,
    status: 'pre-engagement',
    conflictCheck: null,
    kyc: null,
    engagementLetter: null,
    ndaRequired: options?.ndaRequired ?? false,
    ndaAccepted: false,
    assignedTeam: [],
    billingCode: matterId.toUpperCase().slice(0, 12),
    estimatedBudget: 0,
    actualSpend: 0,
    openedAt: new Date().toISOString(),
    jurisdiction: options?.jurisdiction ?? 'US',
    practiceArea: options?.practiceArea ?? 'general',
    sessionIds: [],
  };
}
