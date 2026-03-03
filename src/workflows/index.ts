/**
 * Workflow module — Registers all workflow templates on import.
 *
 * Import this module once at startup to populate the registry.
 * Each template file auto-registers itself when imported.
 *
 * v11: Five engagement patterns + pre-engagement.
 * Old template files kept for reference but no longer imported.
 */

// v11: Import new engagement patterns — each auto-registers + backward compat aliases
import './templates/counsel.js';       // was simple-query
import './templates/review.js';        // was contract-review
import './templates/adversarial.js';   // was research-memo
import './templates/roundtable.js';    // was legal-design
import './templates/full-bench.js';    // NEW — hierarchical pattern
// Pre-engagement workflow (unchanged)
import './templates/pre-engagement.js';
// v16: Verification pipeline (standalone + post-production)
import './templates/verification.js';

// Import original templates AFTER v11 — they override backward compat aliases
// with correct step definitions (contract_analysis vs specialist_analysis, etc.)
import './templates/simple-query.js';
import './templates/contract-review.js';
import './templates/research-memo.js';
import './templates/legal-design.js';

// Re-export the registry for consumers
export { workflowRegistry } from './registry.js';
