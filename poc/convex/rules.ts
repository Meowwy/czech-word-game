// Pure game rules — no Convex imports, so this can be unit-tested directly by
// scripts/test.ts. Everything here is deterministic given an injected `rand`.

/** Shortest a turn may ever get, however long the streak. */
export const MIN_TURN_MS = 5_000;
/** The bomb is armed somewhere in this range at the start of every turn. */
export const TURN_MIN_MS = 10_000;
export const TURN_MAX_MS = 20_000;
/** How much each correct answer shaves off, until the bomb goes off. */
export const DECAY_MS = 600;

/**
 * How long the current player gets. The timer is hidden, so the only thing the
 * players feel is that a long streak makes the bomb hair-trigger — the decay
 * accumulates across correct answers and resets when the bomb finally explodes.
 */
export function turnDurationMs(hitsSinceExplosion: number, rand: () => number = Math.random): number {
  const base = TURN_MIN_MS + rand() * (TURN_MAX_MS - TURN_MIN_MS);
  return Math.max(MIN_TURN_MS, Math.round(base - hitsSinceExplosion * DECAY_MS));
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

export function normalizeNickname(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 20);
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

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'lehká',
  medium: 'střední',
  hard: 'těžká',
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
 * How long the room waits once enough people have sat down.
 *
 * The opposite of `turnDurationMs` in every way that matters: this one is fixed,
 * and the client is *told* when it ends. The fuse is hidden because not knowing
 * is the game; this countdown is shown because a start you cannot see coming is
 * just an ambush.
 */
export const COUNTDOWN_MS = 10_000;

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
