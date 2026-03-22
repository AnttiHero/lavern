/**
 * Claw Init — Client onboarding.
 *
 * Interactive flow that creates the client profile at
 * `~/.lavern/profile.json`. The firm's understanding of who you are.
 *
 * "Welcome to Lavern. Let's get to know you."
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { ensureDir, writeJsonFileAtomic } from '../utils/fs-helpers.js';
import { config } from '../config.js';
import type { ClawProfile } from './types.js';
import type { IntensityLevel } from '../types/engagement.js';
import { DEFAULT_SENSITIVITY_PATTERNS } from './planner.js';

// ── Init Flow ────────────────────────────────────────────────────────────

export async function initClaw(dir?: string, force = false): Promise<ClawProfile> {
  const baseDir = dir ?? config.claw.dir;
  const profilePath = path.join(baseDir, 'profile.json');

  // Check for existing profile
  if (fs.existsSync(profilePath) && !force) {
    console.log(`\nProfile already exists at ${profilePath}`);
    console.log('Use --force to overwrite.\n');

    // Return existing profile
    try {
      const existing = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      return existing;
    } catch {
      throw new Error(`Existing profile at ${profilePath} is corrupted. Use --force to create a new one.`);
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });

  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  LAVERN — CLAW MODE SETUP');
    console.log('  Welcome to the firm. Let\'s get to know you.');
    console.log('═══════════════════════════════════════════════════════\n');

    // Company info
    const company = await ask('Company name: ');
    const jurisdiction = await ask('Primary jurisdiction (e.g., Delaware, California, UK): ') || 'Delaware';
    const industry = await ask('Industry (e.g., SaaS, Healthcare, Finance): ') || 'Technology';
    const size = await ask('Company size (e.g., "Series A, 12 employees"): ') || 'Startup';

    // Concerns
    console.log('\nWhat legal concerns matter most? (comma-separated)');
    console.log('Examples: IP protection, customer contracts, employment, privacy, compliance');
    const concernsStr = await ask('Concerns: ');
    const concerns = concernsStr
      ? concernsStr.split(',').map(c => c.trim()).filter(c => c)
      : ['general legal review'];

    // Style preference
    console.log('\nDocument style preference:');
    console.log('  1) plain-language  — Clear, accessible, modern');
    console.log('  2) traditional     — Formal, Times New Roman, numbered headings');
    console.log('  3) accessible      — WCAG compliant, high contrast, generous spacing');
    const styleChoice = await ask('Style (1/2/3): ');
    const style: ClawProfile['preferences']['style'] =
      styleChoice === '2' ? 'traditional' :
      styleChoice === '3' ? 'accessible' :
      'plain-language';

    // Risk appetite
    console.log('\nRisk appetite for legal positions:');
    console.log('  1) conservative — Flag everything, maximum caution');
    console.log('  2) balanced     — Standard risk tolerance');
    console.log('  3) aggressive   — Business-first, accept reasonable risk');
    const riskChoice = await ask('Risk appetite (1/2/3): ');
    const riskAppetite: ClawProfile['preferences']['riskAppetite'] =
      riskChoice === '1' ? 'conservative' :
      riskChoice === '3' ? 'aggressive' :
      'balanced';

    // Watch paths
    console.log('\nWhich directories should the firm watch? (comma-separated)');
    console.log('Examples: ~/Documents/Legal, ~/Dropbox/Contracts, ./agreements');
    const watchStr = await ask('Watch paths: ');
    const watchPaths = watchStr
      ? watchStr.split(',').map(p => p.trim()).filter(p => p)
      : ['~/Documents/Legal'];

    // Validate watch paths
    for (const wp of watchPaths) {
      const resolved = path.resolve(wp.replace(/^~/, os.homedir()));
      if (!fs.existsSync(resolved)) {
        console.warn(`  \u26A0 Path does not exist: ${wp} — will be created or skipped at startup`);
      }
    }

    // Budget
    const budgetStr = await ask(`\nTotal budget in USD (default: $${config.claw.defaultBudget.toFixed(0)}): `);
    const _parsedBudget = budgetStr ? parseFloat(budgetStr) : config.claw.defaultBudget;
    const totalUsd = Number.isFinite(_parsedBudget) && _parsedBudget > 0 ? _parsedBudget : config.claw.defaultBudget;

    const perDocStr = await ask(`Per-document max in USD (default: $${config.claw.defaultPerDocBudget.toFixed(0)}): `);
    const _parsedPerDoc = perDocStr ? parseFloat(perDocStr) : config.claw.defaultPerDocBudget;
    const perDocumentMaxUsd = Number.isFinite(_parsedPerDoc) && _parsedPerDoc > 0 ? _parsedPerDoc : config.claw.defaultPerDocBudget;

    // Sensitivity patterns (privilege preservation)
    console.log('\nSensitivity patterns — filenames matching these are processed locally');
    console.log('(on-device only, preserving attorney-client privilege):');
    console.log(`Default: ${DEFAULT_SENSITIVITY_PATTERNS.join(', ')}`);
    const patternsStr = await ask('Additional patterns (comma-separated, or Enter for defaults): ');
    const sensitivityPatterns = patternsStr
      ? [...DEFAULT_SENSITIVITY_PATTERNS, ...patternsStr.split(',').map(p => p.trim()).filter(p => p)]
      : [...DEFAULT_SENSITIVITY_PATTERNS];

    // Ethical mode — one toggle, maximum protection
    console.log('\nMaximum Ethical Mode \u2014 one setting, full protection:');
    console.log('  \u2022 All documents treated as confidential (local analysis when possible)');
    console.log('  \u2022 EU-only processing via Mistral (no data to US servers)');
    console.log('  \u2022 Conservative risk appetite (flag everything)');
    const ethicalChoice = await ask('Enable ethical mode? (y/N): ');
    const ethicalMode = ethicalChoice.toLowerCase().startsWith('y');

    // Build profile
    const profile: ClawProfile = {
      company,
      jurisdiction,
      industry,
      size,
      concerns,
      preferences: {
        style,
        intensity: 'standard' as IntensityLevel,
        riskAppetite: ethicalMode ? 'conservative' : riskAppetite,
      },
      watchPaths,
      budget: {
        totalUsd,
        perDocumentMaxUsd,
      },
      sensitivityPatterns,
      ethicalMode,
      createdAt: new Date().toISOString(),
    };

    // Persist
    ensureDir(baseDir);
    writeJsonFileAtomic(profilePath, profile);

    console.log('\n───────────────────────────────────────────────────────');
    console.log(`  Profile saved to ${profilePath}`);
    console.log(`  Watching: ${watchPaths.join(', ')}`);
    console.log(`  Budget: $${totalUsd.toFixed(2)} ($${perDocumentMaxUsd.toFixed(2)} per document)`);
    if (ethicalMode) console.log('  \uD83D\uDEE1\uFE0F  Ethical Mode: ON');
    console.log('───────────────────────────────────────────────────────');
    console.log('\n  Next steps:\n');
    console.log('    lavern claw validate     — Verify your configuration');
    console.log('    lavern claw start        — Start processing documents');
    console.log('    lavern claw start --once  — Process once, then exit');
    console.log('    lavern claw daemon install — Run as background service');
    console.log('');

    return profile;
  } finally {
    rl.close();
  }
}

/**
 * Load an existing profile from disk.
 */
export function loadProfile(dir?: string): ClawProfile | null {
  const baseDir = dir ?? config.claw.dir;
  const profilePath = path.join(baseDir, 'profile.json');

  if (!fs.existsSync(profilePath)) return null;

  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as ClawProfile;

    // Auto-migrate old profiles (add missing fields with defaults)
    let migrated = false;
    if (!profile.preferences) {
      profile.preferences = { style: 'plain-language', intensity: 'standard', riskAppetite: 'balanced' };
      migrated = true;
    }
    if (profile.budget === undefined) {
      (profile as any).budget = { totalUsd: 50, perDocumentMaxUsd: 10 };
      migrated = true;
    }
    if (migrated) {
      writeJsonFileAtomic(profilePath, profile);
    }

    return profile;
  } catch {
    console.error(`Failed to load profile from ${profilePath}`);
    return null;
  }
}
