/**
 * Runtime accessor for the tier → model map. Reads config.anthropicTierModels
 * (env-overridable) and falls back to the built-in defaults when a test has
 * mocked `config` with a partial object — several integration suites do, and
 * the Hivemind pool reads the map at module load.
 */
import { config } from '../config.js';
import { DEFAULT_ANTHROPIC_TIER_MODELS, type AnthropicTierModels } from './tier-defaults.js';

export function anthropicTierModels(): AnthropicTierModels {
  return (config as { anthropicTierModels?: AnthropicTierModels }).anthropicTierModels
    ?? DEFAULT_ANTHROPIC_TIER_MODELS;
}
