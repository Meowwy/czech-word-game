// Assertions for the multiplayer game rules in convex/rules.ts.
//
// Those functions are deliberately Convex-free and take an injected `rand`, so
// the parts that are annoying to test through a live deployment — turn timing,
// seat rotation, elimination — are testable here with no network and no database.
import { readFileSync } from 'node:fs';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DECAY_MS,
  MIN_TURN_MS,
  TURN_MAX_MS,
  TURN_MIN_MS,
  isValidCode,
  livingSeats,
  makeCode,
  nextLivingSeat,
  normalizeNickname,
  normalizeWord,
  turnDurationMs,
} from '../convex/rules.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// --- turn timing --------------------------------------------------------------
console.log('turn timing');

// rand() = 0 and 1 pin the ends of the 10-20s window.
check('fresh turn floors at 10s', turnDurationMs(0, () => 0) === TURN_MIN_MS);
check('fresh turn caps at 20s', turnDurationMs(0, () => 1) === TURN_MAX_MS);

const streak = [0, 1, 2, 3, 5, 10].map((h) => turnDurationMs(h, () => 0.5));
check(
  'every correct answer shortens the fuse',
  streak.every((ms, i) => i === 0 || ms <= streak[i - 1]),
  streak.join(' > '),
);
check(
  'decay is DECAY_MS per hit while above the floor',
  turnDurationMs(1, () => 0.5) === turnDurationMs(0, () => 0.5) - DECAY_MS,
);

// A long streak must not produce an impossible or negative fuse.
check(
  'never drops below the floor, however long the streak',
  [50, 500, 5000].every((h) => turnDurationMs(h, () => 0) === MIN_TURN_MS),
);
let inRange = true;
for (let i = 0; i < 2000; i++) {
  const ms = turnDurationMs(Math.floor(Math.random() * 12));
  if (ms < MIN_TURN_MS || ms > TURN_MAX_MS) inRange = false;
}
check('random draws always land in [5s, 20s]', inRange);

// --- room codes ---------------------------------------------------------------
console.log('\nroom codes');
check('code is CODE_LENGTH chars', makeCode(() => 0).length === CODE_LENGTH);
check('generated codes validate', Array.from({ length: 500 }, () => makeCode()).every(isValidCode));
check(
  'alphabet excludes I and O (unreadable next to 1 and 0)',
  !CODE_ALPHABET.includes('I') && !CODE_ALPHABET.includes('O'),
);
check('rejects wrong length', !isValidCode('ABC') && !isValidCode('ABCDE'));
check('rejects excluded letters', !isValidCode('ABIO'));
check('rejects lowercase', !isValidCode('abcd'));

// --- seat rotation ------------------------------------------------------------
console.log('\nseat rotation');
const seats = (lives: number[]) =>
  lives.map((l, i) => ({ _id: `p${i}`, order: i, lives: l }));

check('passes to the next seat', nextLivingSeat(seats([3, 3, 3]), 'p0')?._id === 'p1');
check('wraps around the table', nextLivingSeat(seats([3, 3, 3]), 'p2')?._id === 'p0');
check('skips eliminated players', nextLivingSeat(seats([3, 0, 3]), 'p0')?._id === 'p2');
check('skips a run of eliminated players', nextLivingSeat(seats([3, 0, 0, 2]), 'p0')?._id === 'p3');
check(
  'a dead current player still passes the bomb on',
  nextLivingSeat(seats([0, 3, 3]), 'p0')?._id === 'p1',
);
check(
  'returns null when the holder is the only survivor',
  nextLivingSeat(seats([3, 0, 0]), 'p0') === null,
);
check('returns null when everyone is out', nextLivingSeat(seats([0, 0, 0]), 'p0') === null);
check(
  'order, not array position, decides who is next',
  nextLivingSeat(
    [
      { _id: 'b', order: 1, lives: 3 },
      { _id: 'a', order: 0, lives: 3 },
    ],
    'a',
  )?._id === 'b',
);
check('livingSeats drops the eliminated', livingSeats(seats([3, 0, 1])).length === 2);

// The elimination end condition the explode mutation relies on.
check(
  'two players left, one loses their last life -> single survivor',
  livingSeats(seats([0, 2])).length === 1,
);

// --- input normalisation ------------------------------------------------------
console.log('\ninput normalisation');
check('words are lowercased and trimmed', normalizeWord('  KoČKa \n') === 'kočka');
check('diacritics survive normalisation', normalizeWord('ŽÍŽALA') === 'žížala');
check('nicknames collapse whitespace', normalizeNickname('  Jan   Novák ') === 'Jan Novák');
check('nicknames are capped at 20 chars', normalizeNickname('x'.repeat(50)).length === 20);
check('blank nickname normalises to empty', normalizeNickname('   ') === '');

// --- prompt pools bundled into Convex -----------------------------------------
console.log('\nconvex prompt pools');
const generated = readFileSync('convex/prompts.data.ts', 'utf8');
const { PROMPTS } = (await import('../convex/prompts.data.ts')) as {
  PROMPTS: Record<string, string[]>;
};
const source = JSON.parse(readFileSync('data/prompts.json', 'utf8')) as {
  substring: string;
  difficulty: string;
}[];

check('generated file is marked generated', generated.startsWith('// GENERATED'));
for (const d of ['easy', 'medium', 'hard']) {
  const expected = source.filter((p) => p.difficulty === d).length;
  check(`${d} pool matches data/prompts.json`, PROMPTS[d].length === expected, `${PROMPTS[d].length}`);
}
check(
  'every bundled prompt is lowercase Czech letters',
  Object.values(PROMPTS)
    .flat()
    .every((s) => /^[a-záčďéěíňóřšťúůýž]{2,3}$/.test(s)),
);
check(
  'pools are disjoint (a prompt has exactly one difficulty)',
  new Set(Object.values(PROMPTS).flat()).size ===
    Object.values(PROMPTS).reduce((n, l) => n + l.length, 0),
);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall rule checks passed');
process.exit(failed ? 1 : 0);
