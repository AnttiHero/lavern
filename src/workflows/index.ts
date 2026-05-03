/**
 * Workflow module — Registers all workflow templates on import.
 *
 * Import this module once at startup to populate the registry.
 * Each template file auto-registers itself when imported.
 *
 * v11: Five engagement patterns + pre-engagement.
 * Old template files kept for reference but no longer imported.
 */

// v11: Import new engagement patterns (each auto-registers under its v11 name)
import './templates/counsel.js';       // v11 name: 'counsel'
import './templates/review.js';        // v11 name: 'review'
import './templates/adversarial.js';   // v11 name: 'adversarial'
import './templates/roundtable.js';    // v11 name: 'roundtable'
import './templates/full-bench.js';    // v11 name: 'full-bench'
import './templates/tabulate.js';      // v0.14.x: structured tabular extraction
// Pre-engagement workflow (unchanged)
import './templates/pre-engagement.js';
// v16: Verification pipeline (standalone + post-production)
import './templates/verification.js';

// Original legal-design template (10-step flagship pipeline, distinct from roundtable)
import './templates/legal-design.js';

// Re-export the registry for consumers
export { workflowRegistry } from './registry.js';
