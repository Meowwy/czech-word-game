import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { PROMPTS } from './prompts.data';
import {
  COUNTDOWN_MS,
  DEFAULT_PROMPT_AGE,
  DEFAULT_TURN_RANGE,
  MIN_PLAYERS,
  MIN_TURN_MS,
  clampPromptAge,
  clampTurnFloor,
  turnDurationMs,
  type TurnRange,
} from './rules';

/**
 * The host's rules, with the defaults filled in.
 *
 * Every setting on `rooms` is optional so that rooms created before the panel
 * existed still validate. This is the single place that decides what an unset
 * field means, so "the old default" is written down once rather than at each
 * of the four call sites that need a fuse length.
 */
export function roomRules(room: Doc<'rooms'>) {
  return {
    difficulty: room.difficulty,
    minTurnMs: clampTurnFloor(room.minTurnMs ?? MIN_TURN_MS),
    turnRange: (room.turnRange ?? DEFAULT_TURN_RANGE) as TurnRange,
    maxPromptAge: clampPromptAge(room.maxPromptAge ?? DEFAULT_PROMPT_AGE),
  };
}

export async function roomByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query('rooms')
    .withIndex('by_code', (q) => q.eq('code', code.toUpperCase()))
    .first();
}

export async function playersOf(ctx: QueryCtx, roomId: Id<'rooms'>) {
  const players = await ctx.db
    .query('players')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .collect();
  return players.sort((a, b) => a.order - b.order);
}

/**
 * The rotation. Everyone else in `players` is watching.
 *
 * Every caller of `nextLivingSeat` / `livingSeats` must go through this first:
 * spectators are parked at `lives: 0`, so an unfiltered list would read them as
 * eliminated players and quietly end the game early.
 */
export function seatedOf<T extends { seated: boolean }>(players: T[]): T[] {
  return players.filter((p) => p.seated);
}

export async function gameOf(ctx: QueryCtx, roomId: Id<'rooms'>) {
  return await ctx.db
    .query('games')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .first();
}

/** One row per room, or none yet. */
export async function typingRow(ctx: QueryCtx, roomId: Id<'rooms'>) {
  return await ctx.db
    .query('typing')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .first();
}

export async function clearTyping(ctx: MutationCtx, roomId: Id<'rooms'>): Promise<void> {
  const row = await typingRow(ctx, roomId);
  if (row) await ctx.db.patch(row._id, { text: '', accepted: false, failed: false });
}

/** Keeps the room in the public browser and orders it by how live it is. */
export async function touchRoom(ctx: MutationCtx, roomId: Id<'rooms'>): Promise<void> {
  await ctx.db.patch(roomId, { lastActivityAt: Date.now() });
}

/**
 * Start, restart, or call off the pre-game countdown.
 *
 * Safe to call after anything that could change the answer — someone sitting
 * down, standing up, leaving, or the host finishing with the rules panel. It
 * works out for itself whether a countdown should be running.
 *
 * The `startSeq` guard is the same one `games.turnSeq` uses on the bomb: the
 * scheduled `autoStart` carries the sequence it was armed with and no-ops when
 * it no longer matches, so calling this off is a field write rather than an
 * attempt to reach into the scheduler.
 */
export async function beginCountdown(ctx: MutationCtx, room: Doc<'rooms'>): Promise<boolean> {
  if (room.state === 'playing') return false;
  if (room.countdownEndsAt !== undefined) return true; // already ticking

  const seated = seatedOf(await playersOf(ctx, room._id));
  if (seated.length < MIN_PLAYERS) return false;

  const startSeq = room.startSeq + 1;
  await ctx.db.patch(room._id, {
    startSeq,
    settingsOpen: false,
    countdownEndsAt: Date.now() + COUNTDOWN_MS,
  });
  await ctx.scheduler.runAfter(COUNTDOWN_MS, internal.rooms.autoStart, {
    roomId: room._id,
    startSeq,
  });
  return true;
}

/**
 * Call the countdown off.
 *
 * Same `startSeq` guard from the other side: bumping it is what makes the
 * scheduled `autoStart` arrive to a mismatch and do nothing. Safe to call when
 * no countdown is running.
 */
export async function cancelCountdown(ctx: MutationCtx, room: Doc<'rooms'>): Promise<void> {
  if (room.countdownEndsAt === undefined) return;
  await ctx.db.patch(room._id, {
    countdownEndsAt: undefined,
    startSeq: room.startSeq + 1,
  });
}

/**
 * Call it off if it can no longer be honoured — somebody stood up, left, or the
 * host opened the rules. Run after anything that changes who is seated.
 *
 * Note what this does *not* do: it never starts a countdown. A room that deals
 * itself a round the moment a second person sits down gives the host no way to
 * fill a table, and that is the whole reason `beginCountdown` is a separate,
 * host-only call.
 */
export async function holdCountdown(ctx: MutationCtx, room: Doc<'rooms'>): Promise<void> {
  if (room.countdownEndsAt === undefined) return;
  const seated = seatedOf(await playersOf(ctx, room._id));
  if (!room.settingsOpen && seated.length >= MIN_PLAYERS) return;
  await cancelCountdown(ctx, room);
}

/**
 * Hand the bomb to `playerId`, draw a fresh prompt, and arm the fuse.
 *
 * The fuse is a scheduled `explode` carrying this turn's sequence number. When a
 * player answers correctly we simply start the next turn, which bumps the sequence
 * — the pending explosion then finds a mismatch and does nothing. That is why
 * nothing ever needs to cancel a scheduled job.
 */
export async function startTurn(
  ctx: MutationCtx,
  opts: {
    room: Doc<'rooms'>;
    gameId: Id<'games'>;
    turnSeq: number;
    playerId: Id<'players'>;
    hits: number;
    /** Hand the same prompt on rather than drawing one. See `promptFails`. */
    keepPrompt?: string;
    /** How many players have already blown up on the prompt being handed on. */
    promptFails?: number;
  },
): Promise<void> {
  const rules = roomRules(opts.room);
  const seq = opts.turnSeq + 1;
  const ms = turnDurationMs(opts.hits, Math.random, {
    minMs: rules.minTurnMs,
    range: rules.turnRange,
  });
  const pool = PROMPTS[rules.difficulty];
  const substring = opts.keepPrompt || pool[Math.floor(Math.random() * pool.length)];

  await ctx.db.patch(opts.gameId, {
    turnSeq: seq,
    currentPlayerId: opts.playerId,
    substring,
    deadline: Date.now() + ms,
    hitsSinceExplosion: opts.hits,
    promptFails: opts.keepPrompt ? (opts.promptFails ?? 0) : 0,
  });

  // The previous player's draft belongs to the previous turn.
  await clearTyping(ctx, opts.room._id);

  await ctx.scheduler.runAfter(ms, internal.game.explode, { gameId: opts.gameId, turnSeq: seq });
}
