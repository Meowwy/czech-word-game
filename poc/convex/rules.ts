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
export const MAX_PLAYERS = 8;
