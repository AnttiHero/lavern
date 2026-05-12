import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from '../src/documents/parser.js';
async function main() {
  const b = readFileSync(join(homedir(),'Desktop/Bellrock_JV_Agreement.docx'));
  const p = await parseDocument(b,'jv.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  writeFileSync('/tmp/jv-text.txt', p.fullText);
  console.log('extracted', p.fullText.length, 'chars');
}
main().catch(e=>{console.error(e);process.exit(1);});
