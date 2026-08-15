import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { PROMPTS } from './prompts.data';
import { turnDurationMs, type Difficulty } from './rules';

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

export async function gameOf(ctx: QueryCtx, roomId: Id<'rooms'>) {
  return await ctx.db
    .query('games')
    .withIndex('by_room', (q) => q.eq('roomId', roomId))
    .first();
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

  await ctx.scheduler.runAfter(ms, internal.game.explode, { gameId: opts.gameId, turnSeq: seq });
}
