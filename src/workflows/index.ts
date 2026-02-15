/**
 * Workflow module — Registers all workflow templates on import.
 *
 * Import this module once at startup to populate the registry.
 * Each template file auto-registers itself when imported.
 */

// Import templates — each one auto-registers on import
import './templates/legal-design.js';
import './templates/simple-query.js';
import './templates/contract-review.js';
import './templates/research-memo.js';
// v8: Pre-engagement workflow
import './templates/pre-engagement.js';

// Re-export the registry for consumers
export { workflowRegistry } from './registry.js';
