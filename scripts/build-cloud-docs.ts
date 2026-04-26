/**
 * Read 3 cloud sessions from data/lavern.db, run the extractor on the
 * raw final_output (or use assembled_document if present), and write
 * 3 clean DOCX files to ~/Desktop.
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { extractCounselDocument } from '../src/assembly/extract-counsel.js';
import { convertToDocx } from '../src/assembly/format-converter.js';

async function main() {
const db = new Database(join(process.cwd(), 'data/lavern.db'), { readonly: true });

const sessions = [
  { id: 'shem-1777242099017-4f709e924f722d7cf6fce373264d5eeb', label: 'Counsel',   short: 'Lavern-Counsel-Cloud-Opus47' },
  { id: 'shem-1777242134995-3cd375b8e22550273941f2e2ca0bfdb1', label: 'Review',    short: 'Lavern-Review-Cloud-Opus47' },
  { id: 'shem-1777242175393-c1193112f8a28d8ec8d18a606685357a', label: 'FullForce', short: 'Lavern-FullForce-Cloud-Opus47' },
];

const today = '2026-04-26';
const desktop = join(homedir(), 'Desktop');

for (const s of sessions) {
  const row = db.prepare('SELECT assembled_document, final_output, cost_usd FROM session_archive WHERE id = ?').get(s.id) as any;
  if (!row) { console.log(`MISSING ${s.label}`); continue; }

  let md: string = row.assembled_document?.trim() || '';
  const source = md ? 'assembled_document' : 'extracted_from_final_output';
  if (!md) {
    md = extractCounselDocument(row.final_output || '');
  }
  if (!md || md.length < 500) {
    console.log(`${s.label}: extraction failed (have ${md.length} chars). Falling back to raw final_output.`);
    md = row.final_output || '';
  }

  // Write markdown sidecar
  const mdPath = join(desktop, `${s.short}-${today}.md`);
  writeFileSync(mdPath, md);

  // Write DOCX
  const docxPath = join(desktop, `${s.short}-${today}.docx`);
  const buf = await convertToDocx(md, `Cobaridge JV — ${s.label} (Cloud · Opus 4.7)`, 'traditional');
  writeFileSync(docxPath, buf);

  console.log(`${s.label.padEnd(10)} src=${source.padEnd(25)} chars=${md.length.toString().padStart(6)} cost=$${row.cost_usd.toFixed(2)} → ${docxPath}`);
}

db.close();
}
main().catch(err => { console.error(err); process.exit(1); });
