import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { gameOf, playersOf, roomByCode, startTurn } from './turns';
import { livingSeats, nextLivingSeat, normalizeWord } from './rules';

/**
 * Record a correct answer and pass the bomb.
 *
 * The caller has already checked the word against /api/game/check (the 48MB list
 * lives in the Netlify function and cannot be reached from here). Everything that
 * does NOT need the dictionary is re-checked below, so the only claim this trusts
 * is "that string is a real Czech word".
 *
 * To make this fully authoritative later: convert to an action, fetch the check
 * endpoint here, and call an internalMutation with the verdict.
 */
export const submitWord = mutation({
  args: { code: v.string(), deviceId: v.string(), word: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room || room.state !== 'playing') return { ok: false as const, reason: 'not-playing' };

    const game = await gameOf(ctx, room._id);
    if (!game) return { ok: false as const, reason: 'not-playing' };

    const players = await playersOf(ctx, room._id);
    const me = players.find((p) => p.deviceId === args.deviceId);
    if (!me) return { ok: false as const, reason: 'not-in-room' };
    if (game.currentPlayerId !== me._id) return { ok: false as const, reason: 'not-your-turn' };

    const word = normalizeWord(args.word);
    if (!word) return { ok: false as const, reason: 'empty' };
    if (!word.includes(game.substring)) return { ok: false as const, reason: 'no-substring' };
    if (game.usedWords.includes(word)) return { ok: false as const, reason: 'used' };

    const hits = game.hitsSinceExplosion + 1;
    await ctx.db.patch(game._id, { usedWords: [...game.usedWords, word] });
    await ctx.db.patch(me._id, { words: me.words + 1 });

    const next = nextLivingSeat(players, me._id) ?? me;
    await startTurn(ctx, {
      gameId: game._id,
      turnSeq: game.turnSeq,
      difficulty: room.difficulty,
      playerId: next._id,
      hits,
    });

    return { ok: true as const, word };
  },
});

/**
 * The fuse. Armed by `startTurn` via ctx.scheduler; fires whether or not the
 * player whose turn it is still has the tab open.
 *
 * `turnSeq` is what makes this safe: a correct answer starts the next turn and
 * bumps the sequence, so the explosion armed for the finished turn arrives, sees
 * a mismatch, and does nothing.
 */
export const explode = internalMutation({
  args: { gameId: v.id('games'), turnSeq: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.turnSeq !== args.turnSeq) return;

    const room = await ctx.db.get(game.roomId);
    if (!room || room.state !== 'playing') return;

    const holder = await ctx.db.get(game.currentPlayerId);
    if (!holder) return;

    const lives = Math.max(0, holder.lives - 1);
    await ctx.db.patch(holder._id, { lives });

    const players = (await playersOf(ctx, room._id)).map((p) =>
      p._id === holder._id ? { ...p, lives } : p,
    );
    const alive = livingSeats(players);

    if (alive.length <= 1) {
      await ctx.db.patch(room._id, { state: 'over' });
      // Bump the sequence so any other in-flight fuse for this game is void too.
      await ctx.db.patch(game._id, {
        turnSeq: game.turnSeq + 1,
        winnerId: alive[0]?._id,
      });
      return;
    }

    // The decay resets with the explosion: the next player gets a full fuse again.
    const next = nextLivingSeat(players, holder._id);
    if (!next) return;
    await startTurn(ctx, {
      gameId: game._id,
      turnSeq: game.turnSeq,
      difficulty: room.difficulty,
      playerId: next._id,
      hits: 0,
    });
  },
});
