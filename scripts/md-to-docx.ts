/**
 * Convert a markdown file to DOCX using Lavern's format-converter.
 * Usage: npx tsx scripts/md-to-docx.ts <input.md> <output.docx> [title]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { convertToDocx } from '../src/assembly/format-converter.js';

async function main() {
  const [inFile, outFile, ...titleParts] = process.argv.slice(2);
  if (!inFile || !outFile) {
    console.error('Usage: md-to-docx <input.md> <output.docx> [title]');
    process.exit(1);
  }
  const md = readFileSync(inFile, 'utf8');
  const title = titleParts.length > 0 ? titleParts.join(' ') : 'Document';
  const buf = await convertToDocx(md, title, 'traditional');
  writeFileSync(outFile, buf);
  console.log(`✓ ${outFile} (${buf.length} bytes)`);
}
main().catch(e => { console.error(e); process.exit(1); });
