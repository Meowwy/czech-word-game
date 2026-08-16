import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { PROMPTS } from './prompts.data';
import { COUNTDOWN_MS, MIN_PLAYERS, turnDurationMs, type Difficulty } from './rules';

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
  if (row) await ctx.db.patch(row._id, { text: '', accepted: false });
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
export async function armCountdown(ctx: MutationCtx, room: Doc<'rooms'>): Promise<void> {
  // A round is already running; the next countdown is the next round's problem.
  if (room.state === 'playing') return;

  const seated = seatedOf(await playersOf(ctx, room._id));
  const shouldRun = !room.settingsOpen && seated.length >= MIN_PLAYERS;

  if (!shouldRun) {
    if (room.countdownEndsAt !== undefined) {
      await ctx.db.patch(room._id, {
        countdownEndsAt: undefined,
        startSeq: room.startSeq + 1,
      });
    }
    return;
  }

  // Already ticking. A fourth player arriving must not push the start further
  // away for the three who were waiting.
  if (room.countdownEndsAt !== undefined) return;

  const startSeq = room.startSeq + 1;
  await ctx.db.patch(room._id, { startSeq, countdownEndsAt: Date.now() + COUNTDOWN_MS });
  await ctx.scheduler.runAfter(COUNTDOWN_MS, internal.rooms.autoStart, {
    roomId: room._id,
    startSeq,
  });
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
    roomId: Id<'rooms'>;
    gameId: Id<'games'>;
    turnSeq: number;
    difficulty: Difficulty;
    playerId: Id<'players'>;
    hits: number;
  },
): Promise<void> {
  const seq = opts.turnSeq + 1;
  const ms = turnDurationMs(opts.hits);
  const pool = PROMPTS[opts.difficulty];
  const substring = pool[Math.floor(Math.random() * pool.length)];

  await ctx.db.patch(opts.gameId, {
    turnSeq: seq,
    currentPlayerId: opts.playerId,
    substring,
    deadline: Date.now() + ms,
    hitsSinceExplosion: opts.hits,
  });

  // The previous player's draft belongs to the previous turn.
  await clearTyping(ctx, opts.roomId);

  await ctx.scheduler.runAfter(ms, internal.game.explode, { gameId: opts.gameId, turnSeq: seq });
}
