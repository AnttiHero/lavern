#!/usr/bin/env npx tsx
/**
 * Seed Knowledge Base — Load legal reference datasets.
 *
 * Downloads annotated contract/legal data from HuggingFace and the Atticus Project,
 * then indexes it as global reference collections available to all users.
 *
 * Usage:
 *   npx tsx scripts/seed-knowledge-base.ts              # seed all (skip if already done)
 *   npx tsx scripts/seed-knowledge-base.ts --force       # re-seed from scratch
 *   npx tsx scripts/seed-knowledge-base.ts --cuad        # seed CUAD only
 *   npx tsx scripts/seed-knowledge-base.ts --maud        # seed MAUD only
 *   npx tsx scripts/seed-knowledge-base.ts --acord       # seed ACORD only
 *   npx tsx scripts/seed-knowledge-base.ts --unfair-tos  # seed UNFAIR-ToS only
 *   npx tsx scripts/seed-knowledge-base.ts --contractnli # seed ContractNLI only
 *   npx tsx scripts/seed-knowledge-base.ts --ledgar      # seed LEDGAR only
 *
 * Data sources:
 *   CUAD:        theatticusproject/cuad-qa        (510 contracts, 41 clause types, CC BY 4.0)
 *   MAUD:        theatticusproject/maud           (152 merger agreements, 92 deal points, CC BY 4.0)
 *   ACORD:       theatticusproject/acord          (114 queries, 126K+ clause pairs, CC BY 4.0)
 *   UNFAIR-ToS:  coastalcph/lex_glue/unfair_tos  (5.5K sentences, 8 unfair clause types, CC BY-SA 4.0)
 *   ContractNLI: kiddothe2b/contract-nli          (10K+ premise/hypothesis pairs, CC BY-NC-SA 4.0)
 *   LEDGAR:      coastalcph/lex_glue/ledgar       (60K provisions, 98 clause types, CC BY-SA 4.0)
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
const ACORD_COLLECTION_NAME = 'ACORD — Clause Retrieval Pairs';
const UNFAIR_TOS_COLLECTION_NAME = 'UNFAIR-ToS — Unfair Terms of Service Clauses';
const CONTRACTNLI_COLLECTION_NAME = 'ContractNLI — Contract Natural Language Inference';
const LEDGAR_COLLECTION_NAME = 'LEDGAR — SEC Contract Provisions';
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

/** Fetch all rows from an HF Datasets Server endpoint with pagination. */
async function fetchAllHfRows<T>(dataset: string, config: string, split: string, cacheName: string): Promise<T[]> {
  const cachePath = path.join(CACHE_DIR, `${cacheName}-rows.json`);

  if (fs.existsSync(cachePath)) {
    console.log(`  Using cached ${cacheName} data...`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  console.log(`  Downloading ${cacheName} from HuggingFace...`);
  const allRows: T[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${HF_ROWS_URL}?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${PAGE_SIZE}`;
    const data = await fetchJson(url) as {
      rows: Array<{ row: T }>;
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

/** Prepared statements for bulk insert — shared across all seeders. */
function prepareInsertStatements() {
  const db = getDb();
  return {
    insertDoc: db.prepare(`
      INSERT INTO kb_documents (id, collection_id, user_id, filename, mime_type, file_size, word_count, page_count, doc_type, jurisdiction, metadata, created_at)
      VALUES (?, ?, ?, ?, 'text/plain', ?, ?, ?, 'precedent', '', '{}', ?)
    `),
    insertChunk: db.prepare(`
      INSERT INTO kb_chunks (id, document_id, collection_id, user_id, heading, content, chunk_index, level, word_count, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `),
  };
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
  const { insertDoc, insertChunk } = prepareInsertStatements();

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

  const rows = await fetchAllHfRows<MaudRow>('theatticusproject/maud', 'default', 'train', 'maud');

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
  const { insertDoc, insertChunk } = prepareInsertStatements();

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

// ── ACORD Ingestion ──────────────────────────────────────────────────────

interface AcordCorpusEntry {
  _id: string;
  title: string;
  text: string;
}

interface AcordQuery {
  _id: string;
  text: string;
}

interface AcordQrel {
  queryId: string;
  corpusId: string;
  score: number;
}

async function fetchAcordData(): Promise<{ corpus: AcordCorpusEntry[]; queries: AcordQuery[]; qrels: AcordQrel[] }> {
  // ACORD is in BEIR format (corpus.jsonl, queries.jsonl, qrels TSV).
  // HF Datasets Server doesn't support it — download the zip directly.
  const ACORD_ZIP_URL = 'https://huggingface.co/datasets/theatticusproject/acord/resolve/main/ACORD%20Dataset%20%26%20ReadMe.zip';
  const zipPath = path.join(CACHE_DIR, 'acord-data.zip');
  const extractDir = path.join(CACHE_DIR, 'acord-extracted');

  ensureCacheDir();

  // Download zip if not cached
  if (!fs.existsSync(zipPath)) {
    console.log('  Downloading ACORD from HuggingFace...');
    const res = await fetch(ACORD_ZIP_URL);
    if (!res.ok) throw new Error(`Failed to download ACORD: HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(arrayBuf));
    console.log(`  Downloaded ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)} MB`);
  } else {
    console.log('  Using cached ACORD zip...');
  }

  // Unzip if not already extracted
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });
  }

  // Find the BEIR-format files (may be nested in a subdirectory)
  let corpusFile = '';
  let queriesFile = '';
  let qrelsDir = '';

  const findFiles = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'qrels') qrelsDir = fullPath;
        else findFiles(fullPath);
      } else if (entry.name === 'corpus.jsonl') corpusFile = fullPath;
      else if (entry.name === 'queries.jsonl') queriesFile = fullPath;
    }
  };
  findFiles(extractDir);

  // Parse corpus
  const corpus: AcordCorpusEntry[] = [];
  if (corpusFile) {
    const lines = fs.readFileSync(corpusFile, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { corpus.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }

  // Parse queries
  const queries: AcordQuery[] = [];
  if (queriesFile) {
    const lines = fs.readFileSync(queriesFile, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { queries.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }

  // Parse qrels (TSV: query_id, 0, corpus_id, score)
  const qrels: AcordQrel[] = [];
  if (qrelsDir) {
    for (const split of ['train', 'valid', 'test']) {
      const tsvPath = path.join(qrelsDir, `${split}.tsv`);
      if (!fs.existsSync(tsvPath)) continue;
      const lines = fs.readFileSync(tsvPath, 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 4 && parts[0] !== 'query-id') {
          qrels.push({
            queryId: parts[0],
            corpusId: parts[2],
            score: parseInt(parts[3], 10),
          });
        }
      }
    }
  }

  console.log(`  Parsed ${corpus.length} clauses, ${queries.length} queries, ${qrels.length} relevance judgments`);
  return { corpus, queries, qrels };
}

async function seedAcord(force: boolean): Promise<number> {
  console.log('\n── ACORD ─────────────────────────────────────────────');

  if (!force && collectionHasData(ACORD_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(ACORD_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    ACORD_COLLECTION_NAME,
    '114 queries with 126K+ expert-rated clause retrieval pairs from the Atticus Project ACORD dataset. CC BY 4.0.',
    'precedent',
  );

  const { corpus, queries, qrels } = await fetchAcordData();

  // Build lookup maps
  const corpusMap = new Map(corpus.map(c => [c._id, c]));
  const queryMap = new Map(queries.map(q => [q._id, q]));

  // Group relevant clauses (score >= 2) by query for richer context
  const queryGroups = new Map<string, Array<{ clause: AcordCorpusEntry; query: AcordQuery; score: number }>>();
  for (const qrel of qrels) {
    if (qrel.score < 2) continue; // Only index relevant clauses (2+ stars)
    const clause = corpusMap.get(qrel.corpusId);
    const query = queryMap.get(qrel.queryId);
    if (!clause || !query) continue;

    let group = queryGroups.get(qrel.queryId);
    if (!group) {
      group = [];
      queryGroups.set(qrel.queryId, group);
    }
    group.push({ clause, query, score: qrel.score });
  }

  // Also index ALL corpus clauses as standalone chunks (for FTS search)
  console.log(`  ${corpus.length} clauses, ${queryGroups.size} queries with relevant pairs, indexing...`);

  const db = getDb();
  const now = new Date().toISOString();
  const { insertDoc, insertChunk } = prepareInsertStatements();

  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    // Group corpus entries by their title (clause category)
    const byCategory = new Map<string, AcordCorpusEntry[]>();
    for (const entry of corpus) {
      const cat = entry.title || 'Uncategorized';
      let arr = byCategory.get(cat);
      if (!arr) { arr = []; byCategory.set(cat, arr); }
      arr.push(entry);
    }

    for (const [category, entries] of byCategory) {
      const docId = uid('kbdoc');
      const totalWords = entries.reduce((sum, e) => sum + wordCount(e.text), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `ACORD-${category}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const chunkId = uid('kbc');
        const wc = wordCount(entry.text);

        // Find associated queries for this clause
        const associatedQueries: string[] = [];
        for (const qrel of qrels) {
          if (qrel.corpusId === entry._id && qrel.score >= 2) {
            const q = queryMap.get(qrel.queryId);
            if (q) associatedQueries.push(q.text);
          }
        }

        const metadata = JSON.stringify({
          clauseCategory: category,
          clauseId: entry._id,
          associatedQueries: associatedQueries.slice(0, 5), // top 5 queries
          source: 'ACORD',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, category, entry.text, i, wc, metadata, now);
        totalChunks++;
      }
    }
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} clause chunks across ${corpus.length} clauses.`);
  return totalChunks;
}

// ── UNFAIR-ToS Ingestion ─────────────────────────────────────────────────

const UNFAIR_TOS_LABELS = [
  'Limitation of liability',
  'Unilateral termination',
  'Unilateral change',
  'Content removal',
  'Contract by using',
  'Choice of law',
  'Jurisdiction',
  'Arbitration',
];

interface UnfairTosRow {
  text: string;
  labels: number[];
}

async function seedUnfairTos(force: boolean): Promise<number> {
  console.log('\n── UNFAIR-ToS ────────────────────────────────────────');

  if (!force && collectionHasData(UNFAIR_TOS_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(UNFAIR_TOS_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    UNFAIR_TOS_COLLECTION_NAME,
    'Terms of Service clauses annotated with 8 types of unfair terms under EU consumer law. From LexGLUE. CC BY-SA 4.0.',
    'regulation',
  );

  // Fetch train + test + validation splits
  const trainRows = await fetchAllHfRows<UnfairTosRow>('coastalcph/lex_glue', 'unfair_tos', 'train', 'unfair-tos-train');
  const testRows = await fetchAllHfRows<UnfairTosRow>('coastalcph/lex_glue', 'unfair_tos', 'test', 'unfair-tos-test');
  const valRows = await fetchAllHfRows<UnfairTosRow>('coastalcph/lex_glue', 'unfair_tos', 'validation', 'unfair-tos-val');
  const allRows = [...trainRows, ...testRows, ...valRows];

  // Only index sentences that have at least one unfair label
  const unfairRows = allRows.filter(r => r.labels && r.labels.length > 0);
  console.log(`  ${allRows.length} total sentences, ${unfairRows.length} with unfair labels, indexing...`);

  // Group by label type for organized indexing
  const byLabel = new Map<string, Array<{ text: string; allLabels: string[] }>>();
  for (const row of unfairRows) {
    const labelNames = row.labels.map(idx => UNFAIR_TOS_LABELS[idx] ?? `Label-${idx}`);
    for (const labelName of labelNames) {
      let arr = byLabel.get(labelName);
      if (!arr) { arr = []; byLabel.set(labelName, arr); }
      arr.push({ text: row.text, allLabels: labelNames });
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  const { insertDoc, insertChunk } = prepareInsertStatements();

  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    for (const [labelName, entries] of byLabel) {
      const docId = uid('kbdoc');
      const totalWords = entries.reduce((sum, e) => sum + wordCount(e.text), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `UNFAIR-ToS-${labelName}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const chunkId = uid('kbc');
        const wc = wordCount(entry.text);
        const metadata = JSON.stringify({
          unfairType: labelName,
          allLabels: entry.allLabels,
          source: 'UNFAIR-ToS',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, `Unfair: ${labelName}`, entry.text, i, wc, metadata, now);
        totalChunks++;
      }
    }
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} unfair clause chunks across ${byLabel.size} categories.`);
  return totalChunks;
}

// ── ContractNLI Ingestion ────────────────────────────────────────────────

const NLI_LABELS = ['contradiction', 'entailment', 'neutral'];

interface ContractNliRow {
  premise: string;
  hypothesis: string;
  label: number;
}

async function seedContractNli(force: boolean): Promise<number> {
  console.log('\n── ContractNLI ───────────────────────────────────────');

  if (!force && collectionHasData(CONTRACTNLI_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(CONTRACTNLI_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    CONTRACTNLI_COLLECTION_NAME,
    'Contract NLI dataset with premise/hypothesis pairs labeled for entailment, contradiction, and neutral. CC BY-NC-SA 4.0.',
    'precedent',
  );

  // Fetch from both configs
  const rowsA = await fetchAllHfRows<ContractNliRow>('kiddothe2b/contract-nli', 'contractnli_a', 'train', 'contractnli-a-train');
  const rowsATest = await fetchAllHfRows<ContractNliRow>('kiddothe2b/contract-nli', 'contractnli_a', 'test', 'contractnli-a-test');
  const rowsAVal = await fetchAllHfRows<ContractNliRow>('kiddothe2b/contract-nli', 'contractnli_a', 'validation', 'contractnli-a-val');
  const allRows = [...rowsA, ...rowsATest, ...rowsAVal];

  // Deduplicate by premise (many hypotheses share the same premise text)
  const premiseMap = new Map<string, Array<{ hypothesis: string; label: string }>>();
  for (const row of allRows) {
    if (!row.premise?.trim()) continue;
    const premiseKey = row.premise.trim().slice(0, 200); // Use first 200 chars as key
    let hypotheses = premiseMap.get(premiseKey);
    if (!hypotheses) {
      hypotheses = [];
      premiseMap.set(premiseKey, hypotheses);
    }
    const labelName = NLI_LABELS[row.label] ?? 'unknown';
    // Avoid duplicate hypothesis entries
    if (!hypotheses.some(h => h.hypothesis === row.hypothesis)) {
      hypotheses.push({ hypothesis: row.hypothesis, label: labelName });
    }
  }

  console.log(`  ${allRows.length} total pairs, ${premiseMap.size} unique premises, indexing...`);

  const db = getDb();
  const now = new Date().toISOString();
  const { insertDoc, insertChunk } = prepareInsertStatements();

  let totalChunks = 0;

  // Group by NLI label for organized browsing
  const insertAll = db.transaction(() => {
    // Create one doc per batch of ~100 premises
    let batchIdx = 0;
    let batchPremises: Array<{ premise: string; hypotheses: Array<{ hypothesis: string; label: string }> }> = [];

    const flushBatch = () => {
      if (batchPremises.length === 0) return;
      const docId = uid('kbdoc');
      const totalWords = batchPremises.reduce((sum, p) => sum + wordCount(p.premise), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `ContractNLI-batch-${batchIdx}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < batchPremises.length; i++) {
        const { premise, hypotheses } = batchPremises[i];
        const chunkId = uid('kbc');
        // Include top hypotheses in the content for searchability
        const topHypotheses = hypotheses.slice(0, 3);
        const content = `${premise}\n\n${topHypotheses.map(h => `[${h.label.toUpperCase()}] ${h.hypothesis}`).join('\n')}`;
        const wc = wordCount(content);
        const metadata = JSON.stringify({
          hypotheses: hypotheses.slice(0, 5),
          source: 'ContractNLI',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, 'Contract NLI', content, i, wc, metadata, now);
        totalChunks++;
      }

      batchIdx++;
      batchPremises = [];
    };

    for (const [premiseKey, hypotheses] of premiseMap) {
      // Find the full premise text (premiseKey is truncated)
      const fullPremise = allRows.find(r => r.premise?.trim().startsWith(premiseKey))?.premise?.trim() ?? premiseKey;
      batchPremises.push({ premise: fullPremise, hypotheses });
      if (batchPremises.length >= 100) flushBatch();
    }
    flushBatch();
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} premise chunks.`);
  return totalChunks;
}

// ── LEDGAR Ingestion ─────────────────────────────────────────────────────

const LEDGAR_LABELS = [
  'Adjustments', 'Agreements', 'Amendments', 'Anti-Corruption Laws', 'Applicable Laws',
  'Approvals', 'Arbitration', 'Assignments', 'Assigns', 'Authority', 'Authorizations',
  'Base Salary', 'Benefits', 'Binding Effects', 'Books', 'Brokers', 'Capitalization',
  'Change In Control', 'Closings', 'Compliance With Laws', 'Confidentiality',
  'Consent To Jurisdiction', 'Consents', 'Construction', 'Cooperation', 'Costs',
  'Counterparts', 'Death', 'Defined Terms', 'Definitions', 'Disability', 'Disclosures',
  'Duties', 'Effective Dates', 'Effectiveness', 'Employment', 'Enforceability',
  'Enforcements', 'Entire Agreements', 'Erisa', 'Existence', 'Expenses', 'Fees',
  'Financial Statements', 'Forfeitures', 'Further Assurances', 'General', 'Governing Laws',
  'Headings', 'Indemnifications', 'Indemnity', 'Insurances', 'Integration',
  'Intellectual Property', 'Interests', 'Interpretations', 'Jurisdictions', 'Liens',
  'Litigations', 'Miscellaneous', 'Modifications', 'No Conflicts', 'No Defaults',
  'No Waivers', 'Non-Disparagement', 'Notices', 'Organizations', 'Participations',
  'Payments', 'Positions', 'Powers', 'Publicity', 'Qualifications', 'Records', 'Releases',
  'Remedies', 'Representations', 'Sales', 'Sanctions', 'Severability', 'Solvency',
  'Specific Performance', 'Submission To Jurisdiction', 'Subsidiaries', 'Successors',
  'Survival', 'Tax Withholdings', 'Taxes', 'Terminations', 'Terms', 'Titles',
  'Transactions With Affiliates', 'Use Of Proceeds', 'Vacations', 'Venues', 'Vesting',
  'Waiver Of Jury Trials', 'Waivers', 'Warranties', 'Withholdings',
];

interface LedgarRow {
  text: string;
  label: number;
}

async function seedLedgar(force: boolean): Promise<number> {
  console.log('\n── LEDGAR ────────────────────────────────────────────');

  if (!force && collectionHasData(LEDGAR_COLLECTION_NAME)) {
    console.log('Already seeded. Use --force to re-seed.');
    return 0;
  }

  if (force) deleteCollection(LEDGAR_COLLECTION_NAME);

  const collectionId = ensureGlobalCollection(
    LEDGAR_COLLECTION_NAME,
    '60,000 labeled SEC contract provisions across 98 clause types from the LEDGAR dataset (LexGLUE). CC BY-SA 4.0.',
    'precedent',
  );

  const rows = await fetchAllHfRows<LedgarRow>('coastalcph/lex_glue', 'ledgar', 'train', 'ledgar-train');

  // Group by provision type
  const byType = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.text?.trim()) continue;
    const typeName = LEDGAR_LABELS[row.label] ?? `Type-${row.label}`;
    let arr = byType.get(typeName);
    if (!arr) { arr = []; byType.set(typeName, arr); }
    arr.push(row.text.trim());
  }

  console.log(`  ${rows.length} provisions across ${byType.size} types, indexing...`);

  const db = getDb();
  const now = new Date().toISOString();
  const { insertDoc, insertChunk } = prepareInsertStatements();

  let totalChunks = 0;

  const insertAll = db.transaction(() => {
    for (const [typeName, provisions] of byType) {
      const docId = uid('kbdoc');
      const totalWords = provisions.reduce((sum, p) => sum + wordCount(p), 0);
      insertDoc.run(docId, collectionId, SYSTEM_USER_ID, `LEDGAR-${typeName}.txt`, totalWords * 6, totalWords, Math.ceil(totalWords / 250), now);

      for (let i = 0; i < provisions.length; i++) {
        const text = provisions[i];
        const chunkId = uid('kbc');
        const wc = wordCount(text);
        const metadata = JSON.stringify({
          provisionType: typeName,
          source: 'LEDGAR',
        });
        insertChunk.run(chunkId, docId, collectionId, SYSTEM_USER_ID, typeName, text, i, wc, metadata, now);
        totalChunks++;
      }
    }
  });

  insertAll();
  console.log(`  Indexed ${totalChunks} provision chunks across ${byType.size} types.`);
  return totalChunks;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  // Per-dataset flags
  const flags = {
    cuad: args.includes('--cuad'),
    maud: args.includes('--maud'),
    acord: args.includes('--acord'),
    unfairTos: args.includes('--unfair-tos'),
    contractNli: args.includes('--contractnli'),
    ledgar: args.includes('--ledgar'),
  };
  const anySpecific = Object.values(flags).some(Boolean);
  const all = !anySpecific; // No specific flag = seed everything

  console.log('Marble Knowledge Base Seeder');
  console.log('═══════════════════════════════════════════════════════');

  initDatabase();
  ensureSystemUser();

  const results: Record<string, number> = {};

  if (all || flags.cuad) results.CUAD = await seedCuad(force);
  if (all || flags.maud) results.MAUD = await seedMaud(force);
  if (all || flags.acord) results.ACORD = await seedAcord(force);
  if (all || flags.unfairTos) results['UNFAIR-ToS'] = await seedUnfairTos(force);
  if (all || flags.contractNli) results.ContractNLI = await seedContractNli(force);
  if (all || flags.ledgar) results.LEDGAR = await seedLedgar(force);

  console.log('\n═══════════════════════════════════════════════════════');
  const summary = Object.entries(results).map(([name, count]) => `${name}: ${count}`).join('. ');
  console.log(`Done. ${summary}`);
  console.log('Agents can now search with: search_knowledge_base("limitation of liability SaaS")');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
