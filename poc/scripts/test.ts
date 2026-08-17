// Guard rails for the word list. Runs offline (no network) so it is safe in CI.
// Fails the build if the list regresses on the properties the game depends on.
import { WordIndex } from '../src/lib/validators/offline.ts';
import { runBench } from '../src/lib/bench.ts';
import { offlineValidator } from '../src/lib/validators/offline.ts';
import { readFileSync } from 'node:fs';

const index = new WordIndex('data/words.txt');
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

console.log('word list contents');
for (const w of ['kočkami', 'žížala', 'strom', 'strč', 'krkovička', 'nejlepšímu', 'praha'])
  check(`accepts ${w}`, index.has(w));
for (const w of ['gfjzisjv', 'kocka', 'zzzz', 'blbouncita', 'adsl', 'aakjaerova', 'nemec'])
  check(`rejects ${w}`, !index.has(w));

console.log('\nprompt table');
// prompts.json is the v1 banding, prompts-v2.json the four-band split the game
// plays. Both are the same rating table, so both must pass the same sanity checks.
for (const file of ['data/prompts.json', 'data/prompts-v2.json']) {
  const prompts = JSON.parse(readFileSync(file, 'utf8'));
  check(`${file}: every prompt is solvable (>=1 word)`, prompts.every((p: any) => p.words >= 1));
  check(`${file}: every prompt is lowercase Czech letters`, prompts.every((p: any) => /^[a-záčďéěíňóřšťúůýž]+$/.test(p.substring)));
  check(`${file}: has easy prompts`, prompts.filter((p: any) => p.difficulty === 'easy').length > 100);
}
const v2 = JSON.parse(readFileSync('data/prompts-v2.json', 'utf8'));
// The floor the whole prompt table rests on: the worst prompt in the game's
// hardest band is still answerable by five Tier B words.
check('v2 nightmare band is rated 5..69', v2.filter((p: any) => p.difficulty === 'nightmare').every((p: any) => p.words >= 5 && p.words < 70));

console.log('\nbenchmark thresholds');
const r = await runBench(offlineValidator(index, 'offline'));
const n1 = r.classes.find((c) => c.klass === 'N1')!;
check('no gibberish accepted (N1 false-accept = 0)', n1.falseAccept === 0, `${n1.falseAccept} accepted`);
check('false-accept rate over all negatives = 0', r.falseAcceptRate === 0, `${(r.falseAcceptRate * 100).toFixed(1)}%`);
check('false-reject rate on real words <= 2%', r.falseRejectRate <= 0.02, `${(r.falseRejectRate * 100).toFixed(1)}%`);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
