// Ask MorphoDiTa which of our hunspell candidates are actually Czech words.
// This is the PRECISION stage. `guesser=no` is essential: it stops MorphoDiTa
// inventing an analysis for unknown forms, so unknown really means unknown.
//
// Output (TSV, resumable):  form <TAB> commonPOS <TAB> properPOS
//   commonPOS  POS chars from analyses whose lemma carries NO proper-name marker
//   properPOS  POS chars from analyses whose lemma DOES (Praha_;G, Novák_;S, …)
// Keeping both lets 04-filter.mjs re-decide policy without re-tagging.
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

const API = 'https://lindat.mff.cuni.cz/services/morphodita/api/analyze';
const IN = 'data/candidates.txt';
const OUT = 'data/tagged.tsv';
const BATCH = 20_000;   // 100k gets HTTP 413; 20k measured fastest (~82k words/s)
const CONCURRENCY = 3;  // polite: this is a free academic service
const RETRIES = 4;

// A lemma is a proper name if it carries a MorfFlex semantic-class marker `_;X`.
const PROPER = /_;/;

async function tagBatch(words, attempt = 0) {
  const body = new URLSearchParams({
    data: words.join('\n'), input: 'vertical', guesser: 'no', output: 'json',
  });
  try {
    const res = await fetch(API, { method: 'POST', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tokens = (await res.json()).result.flat();
    if (tokens.length !== words.length) throw new Error(`token mismatch ${tokens.length}/${words.length}`);
    return tokens.map((t) => {
      let common = '', proper = '';
      for (const a of t.analyses) {
        const pos = a.tag[0];
        const target = PROPER.test(a.lemma) ? 'proper' : 'common';
        if (target === 'proper') { if (!proper.includes(pos)) proper += pos; }
        else if (!common.includes(pos)) common += pos;
      }
      return `${t.token}\t${common}\t${proper}`;
    });
  } catch (err) {
    if (attempt >= RETRIES) throw err;
    const wait = 500 * 2 ** attempt;
    process.stderr.write(`\n  retry ${attempt + 1} after ${err.message} (${wait}ms)\n`);
    await new Promise((r) => setTimeout(r, wait));
    return tagBatch(words, attempt + 1);
  }
}

// --- resume: count lines already written -------------------------------------
let done = 0;
if (existsSync(OUT) && statSync(OUT).size > 0) {
  const rl = createInterface({ input: createReadStream(OUT), crlfDelay: Infinity });
  for await (const _ of rl) done++;
  console.log(`resuming: ${done.toLocaleString()} words already tagged`);
}

const all = readFileSync(IN, 'utf8').split('\n').filter(Boolean);
const todo = all.slice(done);
console.log(`tagging ${todo.length.toLocaleString()} of ${all.length.toLocaleString()} candidates`);

const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

const t0 = Date.now();
let written = 0;
// Results must land in order for the resume counter to stay meaningful, so we run
// CONCURRENCY batches in flight but append them as an ordered group.
for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const group = batches.slice(i, i + CONCURRENCY);
  const results = await Promise.all(group.map((b) => tagBatch(b)));
  for (const lines of results) {
    appendFileSync(OUT, lines.join('\n') + '\n');
    written += lines.length;
  }
  const el = (Date.now() - t0) / 1000;
  process.stdout.write(
    `  ${written.toLocaleString()}/${todo.length.toLocaleString()} ` +
    `(${Math.round(written / el).toLocaleString()} w/s, ${el.toFixed(0)}s elapsed)   \r`
  );
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
