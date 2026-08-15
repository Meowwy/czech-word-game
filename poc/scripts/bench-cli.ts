import { runBench, measureLocalThroughput, type BenchResult } from '../src/lib/bench.ts';
import { korektor } from '../src/lib/validators/korektor.ts';
import { morphodita } from '../src/lib/validators/morphodita.ts';
import { WordIndex, WordSet, offlineValidator } from '../src/lib/validators/offline.ts';
import { stats } from '../src/lib/validators/lindat.ts';
import { writeFileSync } from 'node:fs';

const only = process.argv[2];               // e.g. `offline` to skip the network
const index = new WordIndex('data/words.txt');
console.log(`word index: ${index.size.toLocaleString()} forms, ${(index.bytes / 1e6).toFixed(1)} MB, loaded in ${index.loadMs.toFixed(0)} ms`);

const validators = [
  offlineValidator(index, 'Offline list (binary search)'),
  morphodita,
  korektor,
].filter((v) => !only || v.name.toLowerCase().includes(only.toLowerCase()));

const results: BenchResult[] = [];
for (const v of validators) {
  process.stdout.write(`\nrunning ${v.name} … `);
  const r = await runBench(v, (d, t) => process.stdout.write(`${d}/${t} \r`));
  results.push(r);
  console.log('done');
}

// --- correctness table ---------------------------------------------------------
console.log('\n=== CORRECTNESS (false-accept = junk let through, false-reject = real word refused) ===');
const klasses = results[0].classes.map((c) => c.klass);
console.log(['validator'.padEnd(32), ...klasses.map((k) => k.padStart(9)), 'FA%'.padStart(8), 'FR%'.padStart(8), 'acc%'.padStart(8)].join(''));
for (const r of results) {
  const cells = r.classes.map((c) => `${c.correct}/${c.total}`.padStart(9));
  console.log([
    r.name.slice(0, 31).padEnd(32), ...cells,
    (r.falseAcceptRate * 100).toFixed(1).padStart(8),
    (r.falseRejectRate * 100).toFixed(1).padStart(8),
    (r.accuracy * 100).toFixed(1).padStart(8),
  ].join(''));
}

// --- latency table -------------------------------------------------------------
console.log('\n=== LATENCY per single-word check (ms) ===');
console.log(['validator'.padEnd(32), 'p50'.padStart(10), 'p95'.padStart(10), 'p99'.padStart(10), 'max'.padStart(10), 'words/s'.padStart(12)].join(''));
for (const r of results) {
  const f = (n: number) => (n < 0.01 ? n.toExponential(1) : n.toFixed(2));
  console.log([
    r.name.slice(0, 31).padEnd(32),
    f(r.latency.p50).padStart(10), f(r.latency.p95).padStart(10),
    f(r.latency.p99).padStart(10), f(r.latency.max).padStart(10),
    Math.round(r.throughput).toLocaleString().padStart(12),
  ].join(''));
}

// --- offline: real throughput + Set comparison ---------------------------------
console.log('\n=== OFFLINE LOOKUP THROUGHPUT (timed in bulk; a single lookup is below clock resolution) ===');
const bin = measureLocalThroughput((w) => index.has(w));
console.log(`  binary search : ${bin.msPerLookup.toExponential(2)} ms/lookup  (${Math.round(bin.perSecond).toLocaleString()}/s)`);
if (!only) {
  const set = new WordSet('data/words.txt');
  const s = measureLocalThroughput((w) => set.has(w));
  console.log(`  Set<string>   : ${s.msPerLookup.toExponential(2)} ms/lookup  (${Math.round(s.perSecond).toLocaleString()}/s), load ${set.loadMs.toFixed(0)} ms`);
  console.log(`  heap after Set: ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
}

// --- disagreements, for label adjudication -------------------------------------
for (const r of results) {
  if (!r.disagreements.length) continue;
  console.log(`\n--- ${r.name}: ${r.disagreements.length} disagreements with my labels ---`);
  for (const d of r.disagreements.slice(0, 60)) {
    console.log(`  [${d.klass}] ${d.word.padEnd(34)} labeled ${d.expected ? 'REAL' : 'not-a-word'}, got ${d.got ? 'REAL' : 'not-a-word'}  ${d.detail.slice(0, 60)}`);
  }
  if (r.disagreements.length > 60) console.log(`  … ${r.disagreements.length - 60} more`);
}

writeFileSync('data/bench-results.json', JSON.stringify(results, null, 2));
console.log('\nwrote data/bench-results.json');
