#!/usr/bin/env npx tsx
/**
 * Seed Knowledge Base — Load CUAD + MAUD contract datasets.
 *
 * Downloads annotated contract data from the Atticus Project (HuggingFace)
 * and indexes it as global reference collections available to all users.
 *
 * Usage:
 *   npx tsx scripts/seed-knowledge-base.ts          # seed (skip if already done)
 *   npx tsx scripts/seed-knowledge-base.ts --force   # re-seed from scratch
 *   npx tsx scripts/seed-knowledge-base.ts --cuad     # seed CUAD only
 *   npx tsx scripts/seed-knowledge-base.ts --maud     # seed MAUD only
 *
 * Data sources:
 *   CUAD: theatticusproject/cuad-qa (510 contracts, 41 clause types, CC BY 4.0)
 *   MAUD: theatticusproject/maud   (152 merger agreements, 92 deal points, CC BY 4.0)
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { initDatabase, getDb } from '../src/db/database.js';

// ── Constants ────────────────────────────────────────────────────────────

const SYSTEM_USER_ID = '__system__';
const CUAD_COLLECTION_NAME = 'CUAD — Commercial Contract Clauses';
const MAUD_COLLECTION_NAME = 'MAUD — Merger Agreement Deal Points';
const CACHE_DIR = './data/seed-cache';
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const PAGE_SIZE = 100;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;
const PAGE_THROTTLE_MS = 500; // delay between HF API pages to avoid 429

// ── Helpers ──────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

async function fetchJson(url: string, retries = MAX_RETRIES): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate limited — use longer backoff (10s, 20s, 30s)
        const delay = 10_000 * attempt;
        console.log(`  Rate limited (429), waiting ${delay / 1000}s... (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        if (attempt === retries) throw new Error('Rate limited after max retries');
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = RETRY_DELAY_MS * attempt;
      console.log(`  Retry ${attempt}/${retries} after ${delay}ms: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ── Database Setup ───────────────────────────────────────────────────────

function ensureSystemUser(): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(SYSTEM_USER_ID);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, firm_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(SYSTEM_USER_ID, '__system__@marble.internal', 'NOLOGIN', 'Marble System', 'Marble', now, now);
    console.log('Created __system__ user.');
  }
}

function ensureGlobalCollection(name: string, description: string, docType: string): string {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM kb_collections WHERE user_id = ? AND name = ?',
  ).get(SYSTEM_USER_ID, name) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = uid('kbcol-global');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kb_collections (id, user_id, name, description, doc_type, is_global, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, '{}', ?, ?)
  `).run(id, SYSTEM_USER_ID, name, description, docType, now, now);
  console.log(`Created collection: ${name} (${id})`);
  return id;
}

function collectionHasData(name: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM kb_chunks c
    JOIN kb_collections col ON col.id = c.collection_id
    WHERE col.user_id = ? AND col.name = ?
  `).get(SYSTEM_USER_ID, name) as { cnt: number };
  return row.cnt > 0;
}

function deleteCollection(name: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM kb_collections WHERE user_id = ? AND name = ?',
  ).run(SYSTEM_USER_ID, name);
  console.log(`Deleted existing collection: ${name}`);
}

// ── CUAD Ingestion ───────────────────────────────────────────────────────

interface CuadRow {
  title: string;
  context: string;
  question: string;
  answers: { text: string[]; answer_start: number[] };
}

function extractClauseType(question: string): string {
  const match = question.match(/related to "([^"]+)"/);
  return match?.[1] ?? 'Unknown';
}

async function fetchAllCuadRows(): Promise<CuadRow[]> {
  // HF Datasets Server doesn't support CUAD (runs arbitrary Python code).
  // Download data.zip from the official GitHub repo instead.
  const CUAD_ZIP_URL = 'https://github.com/TheAtticusProject/cuad/raw/main/data.zip';
  const zipPath = path.join(CACHE_DIR, 'cuad-data.zip');
  const extractDir = path.join(CACHE_DIR, 'cuad-extracted');
  const jsonFile = path.join(extractDir, 'train_separate_questions.json');

  ensureCacheDir();

  // Download zip if not cached
  if (!fs.existsSync(zipPath)) {
    console.log('  Downloading CUAD from GitHub...');
    const res = await fetch(CUAD_ZIP_URL);
    if (!res.ok) throw new Error(`Failed to download CUAD: HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(arrayBuf));
    console.log(`  Downloaded ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)} MB`);
  } else {
    console.log('  Using cached CUAD zip...');
  }

  // Unzip if not already extracted
  if (!fs.existsSync(jsonFile)) {
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });
  }

  if (!fs.existsSync(jsonFile)) {
    throw new Error(`Expected train_separate_questions.json in CUAD zip, not found at ${jsonFile}`);
  }

  console.log('  Parsing SQuAD-format JSON...');
  const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as {
    data: Array<{
      title: string;
      paragraphs: Array<{
        context: string;
        qas: Array<{
          id: string;
          question: string;
          answers: Array<{ text: string; answer_start: number }>;
          is_impossible?: boolean;
        }>;
      }>;
    }>;
  };

  // Flatten nested SQuAD format into flat CuadRow[]
  // Note: we don't cache the flattened rows — they duplicate full contract
  // text per QA pair and exceed JSON.stringify limits. The zip is cached instead.
  const allRows: CuadRow[] = [];
  for (const doc of raw.data) {
    for (const para of doc.paragraphs) {
      for (const qa of para.qas) {
        allRows.push({
          title: doc.title,
          context: para.context,
          question: qa.question,
          answers: {
            text: qa.answers.map(a => a.text),
            answer_start: qa.answers.map(a => a.answer_start),
          },
        });
      }
    }
  }

  console.log(`  Parsed ${allRows.length} QA rows from ${raw.data.length} contracts`);
  return allRows;
}

async function seedCuad(force: boolean): Promise<number> {
  console.log('\n── CUAD ──────────────────────────────────────────────');

  if (!force && collectionHasData(CUAD_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(CUAD_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    CUAD_COLLECTION_NAME,
    '510 commercial contracts with 41 clause types from the Atticus Project CUAD dataset. CC BY 4.0.',
    'precedent',
  );

  const rows = await fetchAllCuadRows();

  // Group by contract title, collect annotations
  const contracts = new Map<string, { context: string; annotations: Array<{ clauseType: string; text: string }> }>();

  for (const row of rows) {
    if (!row.answers?.text?.length || !row.answers.text[0]) continue;

    let contract = contracts.get(row.title);
    if (!contract) {
      contract = { context: row.context, annotations: [] };
      contracts.set(row.title, contract);
    }

    const clauseType = extractClauseType(row.question);
    // CUAD can have multiple answer spans per annotation — take each
    for (const text of row.answers.text) {
      if (text.trim()) {
        contract.annotations.push({ clauseType, text: text.trim() });
      }
    }
  }

  console.log(`  ${contracts.size} contracts, indexing clause annotations...`);

  const db = getDb();
  const now = new Date().toISOString();
  const insertDoc = db.prepare(`
    INSERT INTO kb_documents (id, collection_id, user_id, filename, mime_type, file_size, word_count, page_count, doc_type, jurisdiction, metadata, created_at)
    VALUES (?, ?, ?, ?, 'text/plain', ?, ?, ?, 'precedent', '', '{}', ?)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO kb_chunks (id, document_id, collection_id, user_id, heading, content, chunk_index, level, word_count, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    for (const [title, contract] of contracts) {
      const docId = uid('kbdoc');
      const totalWords = contract.annotations.reduce((sum, a) => sum + wordCount(a.text), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `${title}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < contract.annotations.length; i++) {
        const ann = contract.annotations[i];
        const chunkId = uid('kbc');
        const wc = wordCount(ann.text);
        const metadata = JSON.stringify({
          clauseType: ann.clauseType,
          contractTitle: title,
          source: 'CUAD',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, ann.clauseType, ann.text, i, wc, metadata, now);
        totalChunks++;
      }
    }
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} clause annotations from ${contracts.size} contracts.`);
  return totalChunks;
}

// ── MAUD Ingestion ───────────────────────────────────────────────────────

interface MaudRow {
  contract_name: string;
  text: string;
  question: string;
  answer: string;
  category: string;
}

async function fetchAllMaudRows(): Promise<MaudRow[]> {
  const cachePath = path.join(CACHE_DIR, 'maud-rows.json');

  if (fs.existsSync(cachePath)) {
    console.log('  Using cached MAUD data...');
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  console.log('  Downloading MAUD from HuggingFace...');
  const allRows: MaudRow[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${HF_ROWS_URL}?dataset=theatticusproject/maud&config=default&split=train&offset=${offset}&length=${PAGE_SIZE}`;
    const data = await fetchJson(url) as {
      rows: Array<{ row: MaudRow }>;
      num_rows_total: number;
    };

    total = data.num_rows_total;
    for (const { row } of data.rows) {
      allRows.push(row);
    }

    offset += PAGE_SIZE;
    if (offset % 1000 === 0 || offset >= total) {
      console.log(`  ${Math.min(offset, total)}/${total} rows fetched`);
    }
    // Throttle to avoid HF rate limits
    if (offset < total) {
      await new Promise(r => setTimeout(r, PAGE_THROTTLE_MS));
    }
  }

  ensureCacheDir();
  fs.writeFileSync(cachePath, JSON.stringify(allRows));
  console.log(`  Cached ${allRows.length} rows to ${cachePath}`);
  return allRows;
}

async function seedMaud(force: boolean): Promise<number> {
  console.log('\n── MAUD ──────────────────────────────────────────────');

  if (!force && collectionHasData(MAUD_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(MAUD_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    MAUD_COLLECTION_NAME,
    '152 merger agreements with 92 deal point annotations from the Atticus Project MAUD dataset. CC BY 4.0.',
    'precedent',
  );

  const rows = await fetchAllMaudRows();

  // Group by contract, collect deal point annotations
  const contracts = new Map<string, Array<{ category: string; question: string; answer: string; text: string }>>();

  for (const row of rows) {
    if (!row.answer || row.answer === '<NONE>' || !row.text?.trim()) continue;

    let annotations = contracts.get(row.contract_name);
    if (!annotations) {
      annotations = [];
      contracts.set(row.contract_name, annotations);
    }
    annotations.push({
      category: row.category,
      question: row.question,
      answer: row.answer,
      text: row.text.trim(),
    });
  }

  console.log(`  ${contracts.size} contracts, indexing deal point annotations...`);

  const db = getDb();
  const now = new Date().toISOString();
  const insertDoc = db.prepare(`
    INSERT INTO kb_documents (id, collection_id, user_id, filename, mime_type, file_size, word_count, page_count, doc_type, jurisdiction, metadata, created_at)
    VALUES (?, ?, ?, ?, 'text/plain', ?, ?, ?, 'precedent', '', '{}', ?)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO kb_chunks (id, document_id, collection_id, user_id, heading, content, chunk_index, level, word_count, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    for (const [contractName, annotations] of contracts) {
      const docId = uid('kbdoc');
      const totalWords = annotations.reduce((sum, a) => sum + wordCount(a.text), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `${contractName}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        const chunkId = uid('kbc');
        const heading = `${ann.category} > ${ann.question}`;
        // Combine the contract excerpt with the annotated answer
        const content = `${ann.text}\n\n[Deal Point: ${ann.answer}]`;
        const wc = wordCount(content);
        const metadata = JSON.stringify({
          dealPoint: ann.question,
          category: ann.category,
          answer: ann.answer,
          source: 'MAUD',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, heading, content, i, wc, metadata, now);
        totalChunks++;
      }
    }
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} deal point annotations from ${contracts.size} contracts.`);
  return totalChunks;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const cuadOnly = args.includes('--cuad');
  const maudOnly = args.includes('--maud');
  const both = !cuadOnly && !maudOnly;

  console.log('Marble Knowledge Base Seeder');
  console.log('═══════════════════════════════════════════════════════');

  initDatabase();
  ensureSystemUser();

  let cuadChunks = 0;
  let maudChunks = 0;

  if (both || cuadOnly) {
    cuadChunks = await seedCuad(force);
  }
  if (both || maudOnly) {
    maudChunks = await seedMaud(force);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Done. CUAD: ${cuadChunks} chunks. MAUD: ${maudChunks} chunks.`);
  console.log('Agents can now search with: search_knowledge_base("liability cap SaaS")');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
