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
  DIFFICULTIES,
  MIN_TURN_MS,
  MIN_TURN_FLOOR_MS,
  MAX_TURN_FLOOR_MS,
  MAX_PROMPT_AGE,
  MIN_PROMPT_AGE,
  TURN_MAX_MS,
  TURN_MIN_MS,
  TURN_RANGES,
  clampPromptAge,
  clampTurnFloor,
  COUNTDOWN_MS,
  MAX_PLAYERS,
  guestNickname,
  isValidCode,
  livingSeats,
  makeCode,
  nextLivingSeat,
  MAX_NICKNAME,
  MAX_ROOM_NAME,
  normalizeNickname,
  normalizeRoomName,
  normalizeWord,
  roomTitle,
  sameNickname,
  uniqueNickname,
  seatAngle,
  shortestTurn,
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

// --- the host's timing rules ---------------------------------------------------
console.log("\nthe host's timing rules");

check(
  'a picked window is the window drawn from',
  turnDurationMs(0, () => 0, { range: 'long' }) === TURN_RANGES.long[0] &&
    turnDurationMs(0, () => 1, { range: 'long' }) === TURN_RANGES.long[1],
);
check(
  'the floor is what a long streak lands on',
  turnDurationMs(999, () => 0, { minMs: 2000, range: 'short' }) === 2000,
);
// A floor dragged above the window would make every turn identical and the
// window meaningless, so it is clamped into the range instead.
check(
  'a floor above the window cannot freeze the fuse at one value',
  turnDurationMs(0, () => 1, { minMs: 10_000, range: 'short' }) === TURN_RANGES.short[1],
);
check(
  'unset options time exactly as the game shipped',
  turnDurationMs(3, () => 0.5) === turnDurationMs(3, () => 0.5, {}),
);
check(
  'the floor clamps to whole seconds inside its bounds',
  clampTurnFloor(0) === MIN_TURN_FLOOR_MS &&
    clampTurnFloor(99_000) === MAX_TURN_FLOOR_MS &&
    clampTurnFloor(4400) === 4000,
);
check(
  'prompt age clamps to its bounds',
  clampPromptAge(0) === MIN_PROMPT_AGE && clampPromptAge(99) === MAX_PROMPT_AGE,
);

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

// One name per table: the bomb is handed on by name, so two Pavels is not a
// cosmetic problem. Case and padding do not make a different person.
check('the same name in different case is the same name', sameNickname('Pavel', ' pavel '));
check('different names are different', !sameNickname('Pavel', 'Pavla'));
check('a free name is left alone', uniqueNickname('Pavel', ['Katka']) === 'Pavel');
check('a taken name is numbered', uniqueNickname('Pavel', ['Pavel']) === 'Pavel 2');
check(
  'numbering keeps counting past the ones already there',
  uniqueNickname('Pavel', ['Pavel', 'Pavel 2', 'pavel 3']) === 'Pavel 4',
);
check(
  'a numbered name still fits the column',
  uniqueNickname('x'.repeat(MAX_NICKNAME), ['x'.repeat(MAX_NICKNAME)]).length <= MAX_NICKNAME,
);
check('nothing to make unique stays empty', uniqueNickname('   ', ['Pavel']) === '');

// A room name is not a nickname: it is never backfilled with a generated one,
// because the code is already a name every room has.
check('room names collapse whitespace', normalizeRoomName('  U   Nováků ') === 'U Nováků');
check(
  `room names are capped at ${MAX_ROOM_NAME} chars`,
  normalizeRoomName('x'.repeat(80)).length === MAX_ROOM_NAME,
);
check('an unnamed room is titled by its code', roomTitle(undefined, 'ABCD') === 'ABCD');
check('a blank name is titled by its code', roomTitle('   ', 'ABCD') === 'ABCD');
check('a named room keeps its name', roomTitle(' U Nováků ', 'ABCD') === 'U Nováků');

// --- seating geometry ---------------------------------------------------------
// The arena draws seats from these angles and swings the arrow to them, so a
// sign error here is a player standing in the wrong place, not a crash.
console.log('\nseating geometry');

// Assert where a seat lands, not what number describes it: seatAngle is left
// unnormalised so that gaps stay uniform, which makes 360 and 0 both correct.
const wrap = (deg: number) => ((deg % 360) + 360) % 360;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const seatAt = (i: number, n: number) => {
  const r = (seatAngle(i, n) * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
};

check(
  'two players face each other across the bomb',
  near(seatAt(0, 2).x, -1) && near(seatAt(1, 2).x, 1) && near(seatAt(0, 2).y, 0),
);
check('a lone player sits on the left', near(seatAt(0, 1).x, -1));
check(
  'three or more open from the top',
  near(seatAt(0, 3).y, -1) && near(seatAt(0, 5).y, -1),
  'y points down, so the top is -1',
);
check(
  'seats are evenly spaced round the ring',
  [3, 4, 5, 6, 7, 8].every((n) => {
    const gaps = Array.from({ length: n - 1 }, (_, i) => seatAngle(i + 1, n) - seatAngle(i, n));
    return gaps.every((g) => near(g, 360 / n));
  }),
);
check(
  'no two seats share a heading, up to a full table',
  Array.from({ length: MAX_PLAYERS }, (_, k) => k + 1).every(
    (n) => new Set(Array.from({ length: n }, (_, i) => wrap(seatAngle(i, n)))).size === n,
  ),
);

// --- arrow rotation -----------------------------------------------------------
console.log('\narrow rotation');
check('takes the short way over the wrap', shortestTurn(350, 10) === 20);
check('and the short way back', shortestTurn(10, 350) === -20);
check('standing still is zero', shortestTurn(90, 90) === 0);
check('half a turn resolves forwards, not backwards', shortestTurn(0, 180) === 180);
check(
  'never asks for more than half a turn',
  Array.from({ length: 720 }, (_, i) => shortestTurn(i - 360, (i * 37) % 360)).every(
    (d) => d > -180 && d <= 180,
  ),
);
check(
  'accumulating deltas always lands on the right heading',
  [
    [0, 270],
    [270, 45],
    [45, 200],
    [-720, 30],
  ].every(([from, to]) => wrap(from + shortestTurn(from, to)) === wrap(to)),
);

// --- lobby countdown ----------------------------------------------------------
console.log('\nlobby countdown');
check('countdown is a whole number of seconds', COUNTDOWN_MS % 1000 === 0);
check('countdown is long enough to read and cancel', COUNTDOWN_MS >= 5_000);
check(
  'guest nicknames survive the nickname normaliser',
  Array.from({ length: 200 }, () => guestNickname()).every(
    (n) => normalizeNickname(n) === n && /^Host\d{4}$/.test(n),
  ),
);

// --- prompt pools bundled into Convex -----------------------------------------
console.log('\nconvex prompt pools');
const generated = readFileSync('convex/prompts.data.ts', 'utf8');
const { PROMPTS } = (await import('../convex/prompts.data.ts')) as {
  PROMPTS: Record<string, string[]>;
};
// The pools are the v2 banding; prompts.json is v1 and is checked below only to
// prove the two are the same substrings cut differently.
const source = JSON.parse(readFileSync('data/prompts-v2.json', 'utf8')) as {
  substring: string;
  words: number;
  difficulty: string;
}[];

check('generated file is marked generated', generated.startsWith('// GENERATED'));
check('every difficulty has a pool', DIFFICULTIES.every((d) => PROMPTS[d]?.length > 0));
for (const d of DIFFICULTIES) {
  const expected = source.filter((p) => p.difficulty === d).length;
  check(
    `${d} pool matches data/prompts-v2.json`,
    PROMPTS[d].length === expected,
    `${PROMPTS[d].length}`,
  );
}

// The bands are a cut on `words`, so they must be contiguous and ordered: every
// prompt in a harder band is rated below every prompt in an easier one.
const ratingOf = new Map(source.map((p) => [p.substring, p.words]));
const floors = DIFFICULTIES.map((d) => Math.min(...PROMPTS[d].map((s) => ratingOf.get(s)!)));
const ceilings = DIFFICULTIES.map((d) => Math.max(...PROMPTS[d].map((s) => ratingOf.get(s)!)));
check(
  'bands do not overlap, easiest first',
  DIFFICULTIES.every((_, i) => i === 0 || ceilings[i] < floors[i - 1]),
  floors.map((f, i) => `${DIFFICULTIES[i]} ${f}..${ceilings[i]}`).join('  '),
);
const v1 = JSON.parse(readFileSync('data/prompts.json', 'utf8')) as { substring: string }[];
const pooled = new Set(Object.values(PROMPTS).flat());
check(
  'v2 is v1 re-banded — same substrings, no additions or losses',
  v1.length === pooled.size && v1.every((p) => pooled.has(p.substring)),
  `v1 ${v1.length} / v2 ${pooled.size}`,
);
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
