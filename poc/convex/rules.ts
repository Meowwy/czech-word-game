// Pure game rules — no Convex imports, so this can be unit-tested directly by
// scripts/test.ts. Everything here is deterministic given an injected `rand`.

/** Shortest a turn may ever get, however long the streak. The room's default. */
export const MIN_TURN_MS = 5_000;
/** What the host may drag that floor to, in the rules panel. */
export const MIN_TURN_FLOOR_MS = 1_000;
export const MAX_TURN_FLOOR_MS = 10_000;

/**
 * The window a fresh fuse is drawn from, once the decay has been reset by an
 * explosion. Three named windows rather than two more sliders: the pair only
 * makes sense as a range, and a host who can set min above max has been handed
 * a way to break their own room.
 */
export const TURN_RANGES = {
  short: [5_000, 10_000],
  normal: [10_000, 20_000],
  long: [20_000, 30_000],
} as const satisfies Record<string, readonly [number, number]>;

export const TURN_RANGE_KEYS = ['short', 'normal', 'long'] as const;
export type TurnRange = (typeof TURN_RANGE_KEYS)[number];
export const DEFAULT_TURN_RANGE: TurnRange = 'normal';

export const TURN_RANGE_LABEL: Record<TurnRange, string> = {
  short: '5–10 s',
  normal: '10–20 s',
  long: '20–30 s',
};

/** Kept as the names the old two-constant version exported, for the tests. */
export const TURN_MIN_MS = TURN_RANGES[DEFAULT_TURN_RANGE][0];
export const TURN_MAX_MS = TURN_RANGES[DEFAULT_TURN_RANGE][1];

/** How much each correct answer shaves off, until the bomb goes off. */
export const DECAY_MS = 600;

/**
 * How long the current player gets. The timer is hidden, so the only thing the
 * players feel is that a long streak makes the bomb hair-trigger — the decay
 * accumulates across correct answers and resets when the bomb finally explodes.
 *
 * `opts` is the host's rules, and both halves default to the values the game
 * shipped with, so a room created before the panel existed times exactly as it
 * always did.
 */
export function turnDurationMs(
  hitsSinceExplosion: number,
  rand: () => number = Math.random,
  opts: { minMs?: number; range?: TurnRange } = {},
): number {
  const [lo, hi] = TURN_RANGES[opts.range ?? DEFAULT_TURN_RANGE];
  // A floor dragged above the window would otherwise make every turn identical
  // and the window meaningless; clamping keeps the draw inside the range the
  // host actually picked.
  const floor = Math.min(clampTurnFloor(opts.minMs ?? MIN_TURN_MS), hi);
  const base = lo + rand() * (hi - lo);
  return Math.max(floor, Math.round(base - hitsSinceExplosion * DECAY_MS));
}

export function clampTurnFloor(ms: number): number {
  return Math.min(MAX_TURN_FLOOR_MS, Math.max(MIN_TURN_FLOOR_MS, Math.round(ms / 1000) * 1000));
}

/**
 * How many players may blow up on one prompt before it is replaced.
 *
 * A prompt lives until somebody *solves* it: a correct answer draws the next
 * one, an explosion hands the same one on. That is what makes a hard prompt a
 * shared problem rather than one player's bad luck — and why it needs a ceiling,
 * or a prompt nobody can see an answer to would eat the whole table.
 */
export const MIN_PROMPT_AGE = 1;
export const MAX_PROMPT_AGE = 5;
export const DEFAULT_PROMPT_AGE = 2;

export function clampPromptAge(n: number): number {
  return Math.min(MAX_PROMPT_AGE, Math.max(MIN_PROMPT_AGE, Math.round(n)));
}

// I and O are omitted: they are indistinguishable from 1 and 0 when someone reads
// a room code out loud over a call, which is exactly how this code gets shared.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function makeCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

/** Submissions are compared lowercased; the word list is lowercase throughout. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

export const MAX_NICKNAME = 20;

export function normalizeNickname(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NICKNAME);
}

/**
 * Two names are the same name if they only differ by case or padding. The whole
 * point of unique names is that the table can call out who is up, and "Pavel"
 * and "pavel" are one person's worth of shouting.
 */
export function sameNickname(a: string, b: string): boolean {
  return normalizeNickname(a).toLocaleLowerCase('cs') === normalizeNickname(b).toLocaleLowerCase('cs');
}

/**
 * `desired`, or the first `desired 2`, `desired 3`… nobody in `taken` is using.
 *
 * For walking in, where refusing is not an option — `enterRoom` always succeeds,
 * so a clash has to be resolved rather than reported. A deliberate rename goes
 * the other way and is refused, because silently seating someone under a name
 * they did not choose is worse than telling them it is taken.
 */
export function uniqueNickname(desired: string, taken: string[]): string {
  const base = normalizeNickname(desired);
  if (!base) return base;
  if (!taken.some((t) => sameNickname(t, base))) return base;

  for (let n = 2; n < 100; n++) {
    const tail = ` ${n}`;
    const candidate = normalizeNickname(base.slice(0, MAX_NICKNAME - tail.length) + tail);
    if (!taken.some((t) => sameNickname(t, candidate))) return candidate;
  }
  // Ninety-nine people called the same thing in one room is not a problem this
  // game has to solve.
  return base;
}

/** Longest room name the lobby will store. Two or three words, not a sentence. */
export const MAX_ROOM_NAME = 24;

/**
 * Same shape as `normalizeNickname`, but an empty result is kept empty rather
 * than replaced: a room with no name is shown as its code, and there is nothing
 * a generated room name would tell anybody that the code does not.
 */
export function normalizeRoomName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_ROOM_NAME);
}

/** What to call a room on screen. The code is the fallback, never a blank. */
export function roomTitle(name: string | undefined, code: string): string {
  return normalizeRoomName(name ?? '') || code;
}

export type Seat = { _id: string; order: number; lives: number };

/**
 * The next player still holding a life, walking round the table from `currentId`.
 * Returns null when nobody else is left — the caller reads that as "game over".
 */
export function nextLivingSeat<T extends Seat>(seats: T[], currentId: string): T | null {
  const ordered = [...seats].sort((a, b) => a.order - b.order);
  const at = ordered.findIndex((s) => s._id === currentId);
  if (at === -1) return ordered.find((s) => s.lives > 0) ?? null;

  // Exclusive upper bound: stepping the full length would wrap back onto the
  // current holder, and "the bomb passes to you again" is not passing it on. A
  // lone survivor must come back as null so the caller ends the game.
  for (let step = 1; step < ordered.length; step++) {
    const seat = ordered[(at + step) % ordered.length];
    if (seat.lives > 0) return seat;
  }
  return null;
}

export function livingSeats<T extends Seat>(seats: T[]): T[] {
  return seats.filter((s) => s.lives > 0);
}

/**
 * The v2 banding: `hard` is a real step up from `medium` rather than the tail of
 * the distribution, and the tail is its own level. Ordered easiest first — every
 * picker in the UI renders them in this order.
 */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'nightmare'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'lehká',
  medium: 'střední',
  hard: 'těžká',
  nightmare: 'noční můra',
};

export const MIN_LIVES = 1;
export const MAX_LIVES = 5;
export const MIN_PLAYERS = 2;
/** Seats at the table. Spectators are not seats — see MAX_OCCUPANTS. */
export const MAX_PLAYERS = 8;
/**
 * People in the room at all, players and watchers together. Only a bound on how
 * much a single `rooms.view` read costs; the table itself never grows past
 * MAX_PLAYERS.
 */
export const MAX_OCCUPANTS = 30;

/** How often a client says it is still there. */
export const HEARTBEAT_MS = 25_000;
/**
 * Silence after which a *watcher* is dropped from the room. Generous enough to
 * survive a tab being backgrounded and a phone locking.
 *
 * Seated players are deliberately never pruned: someone who walks away mid-round
 * loses lives to the bomb until they are out, which is both the correct result
 * and code that already exists.
 */
export const GHOST_MS = 3 * HEARTBEAT_MS;

/** Rooms drop out of the public browser once nothing has happened for this long. */
export const ROOM_LIST_TTL_MS = 30 * 60_000;
/** ...and are deleted outright once they have been quiet for this long. */
export const ROOM_SWEEP_MS = 24 * 60 * 60_000;

/** Longest draft broadcast to the table while someone types. */
export const MAX_DRAFT = 40;

/**
 * How long the room waits after the host presses start.
 *
 * Nothing else arms it. A room used to deal itself a round the moment a second
 * person sat down, which meant the host could not fill a table or finish reading
 * the rules without racing a clock they never started. Now the clock is the
 * host's own click, and this is only how long everyone else gets to look up.
 *
 * The opposite of `turnDurationMs` in every way that matters: this one is fixed,
 * and the client is *told* when it ends. The fuse is hidden because not knowing
 * is the game; this countdown is shown because a start you cannot see coming is
 * just an ambush.
 */
export const COUNTDOWN_MS = 5_000;

/** Nobody should be stopped at a name prompt on the way into a game. */
export function guestNickname(rand: () => number = Math.random): string {
  return `Host${1000 + Math.floor(rand() * 9000)}`;
}

/**
 * Where seat `i` of `n` sits on the ring, in degrees, 0 = right and growing
 * clockwise (SVG/CSS convention, y points down).
 *
 * Two players face each other across the bomb rather than stacking vertically,
 * which is both what the reference does and the only arrangement that reads as
 * a duel. Three or more spread evenly from the top.
 *
 * The result is left unnormalised — seat 1 of 2 comes back as 360, not 0 — so
 * that consecutive seats always differ by exactly 360/n. Callers that care about
 * direction rather than magnitude go through `shortestTurn`, which is modular.
 */
export function seatAngle(i: number, n: number): number {
  if (n <= 1) return 180;
  if (n === 2) return 180 + i * 180;
  return -90 + (i * 360) / n;
}

/**
 * The signed shortest way round from one angle to another, in (-180, 180].
 *
 * The arrow's rotation is accumulated rather than set: feeding a raw seat angle
 * straight into `rotate()` makes it unwind the long way whenever the value wraps
 * (350° to 10° would spin 340° backwards). Adding this delta to the angle the
 * arrow is already at keeps it always taking the short path.
 */
export function shortestTurn(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}
