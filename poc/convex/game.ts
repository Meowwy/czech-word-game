import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import {
  armCountdown,
  gameOf,
  playersOf,
  roomByCode,
  seatedOf,
  startTurn,
  typingRow,
} from './turns';
import { MAX_DRAFT, livingSeats, nextLivingSeat, normalizeWord } from './rules';

/**
 * What the bomb holder is typing, right now.
 *
 * A query of its own rather than a field on `rooms.view`: this one is written
 * several times a second, and folding it into the big subscription would re-run
 * every client's room + players + game reads on every keystroke. Subscribing to
 * it separately costs one extra websocket subscription and nothing else.
 */
export const typingOf = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;
    const row = await typingRow(ctx, room._id);
    if (!row) return null;
    return {
      playerId: row.playerId,
      turnSeq: row.turnSeq,
      text: row.text,
      accepted: row.accepted,
    };
  },
});

/**
 * Broadcast a draft to the table.
 *
 * Only the player actually holding the bomb may write, which is both the
 * correctness rule and the whole rate-limit story: at most one client in a room
 * can be sending, and the client paces itself at one call per 120 ms.
 *
 * Deliberately returns nothing. The caller fires and forgets — a dropped draft
 * is a frame nobody saw, and making the typist wait on a round trip per
 * keystroke would be worse than the thing it was fixing.
 */
export const setTyping = mutation({
  args: { code: v.string(), deviceId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room || room.state !== 'playing') return;

    const game = await gameOf(ctx, room._id);
    if (!game) return;

    const players = await playersOf(ctx, room._id);
    const me = players.find((p) => p.deviceId === args.deviceId);
    if (!me || game.currentPlayerId !== me._id) return;

    const text = args.text.slice(0, MAX_DRAFT);
    const row = await typingRow(ctx, room._id);
    if (row) {
      await ctx.db.patch(row._id, {
        playerId: me._id,
        turnSeq: game.turnSeq,
        text,
        accepted: false,
      });
    } else {
      await ctx.db.insert('typing', {
        roomId: room._id,
        playerId: me._id,
        turnSeq: game.turnSeq,
        text,
        accepted: false,
      });
    }
  },
});

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
    const playedSeq = game.turnSeq;
    await ctx.db.patch(game._id, { usedWords: [...game.usedWords, word] });
    await ctx.db.patch(me._id, { words: me.words + 1 });

    const next = nextLivingSeat(seatedOf(players), me._id) ?? me;
    await startTurn(ctx, {
      roomId: room._id,
      gameId: game._id,
      turnSeq: game.turnSeq,
      difficulty: room.difficulty,
      playerId: next._id,
      hits,
    });

    // After startTurn, which clears the draft: leave the accepted word standing
    // under the seat that played it, tagged with the turn it won. The client
    // shows it green for a beat and then drops it; the next keystroke from the
    // next player overwrites it either way.
    const row = await typingRow(ctx, room._id);
    if (row) {
      await ctx.db.patch(row._id, {
        playerId: me._id,
        turnSeq: playedSeq,
        text: word,
        accepted: true,
      });
    } else {
      await ctx.db.insert('typing', {
        roomId: room._id,
        playerId: me._id,
        turnSeq: playedSeq,
        text: word,
        accepted: true,
      });
    }

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

    // Spectators sit at lives: 0, so the rotation has to be taken before the
    // elimination test — otherwise everyone watching counts as eliminated and
    // the round ends the moment anybody opens the page.
    const seated = seatedOf(await playersOf(ctx, room._id)).map((p) =>
      p._id === holder._id ? { ...p, lives } : p,
    );
    const alive = livingSeats(seated);

    if (alive.length <= 1) {
      const winner = alive[0];
      // Everyone stands up at the end of a round: the next one is opted into,
      // not defaulted into, so a room that empties out does not keep dealing
      // games to nobody. `playedRound` is what still lets the results screen
      // draw the table they just played at.
      //
      // Anyone who asked to join mid-round is doing the opposite — they opted in
      // already, and this is the next round they meant — so they sit down now.
      for (const p of await playersOf(ctx, room._id)) {
        if (p.seatNext) {
          await ctx.db.patch(p._id, {
            seated: true,
            seatNext: false,
            lives: room.startingLives,
            words: 0,
          });
        } else if (p.seated) {
          await ctx.db.patch(p._id, { seated: false });
        }
      }
      await ctx.db.patch(room._id, {
        state: 'over',
        lastWinner: winner?.nickname,
        countdownEndsAt: undefined,
        // Void any countdown still in flight, and stop the one this would arm.
        startSeq: room.startSeq + 1,
        lastActivityAt: Date.now(),
      });
      // Bump the sequence so any other in-flight fuse for this game is void too.
      await ctx.db.patch(game._id, {
        turnSeq: game.turnSeq + 1,
        winnerId: winner?._id,
      });
      const row = await typingRow(ctx, room._id);
      if (row) await ctx.db.patch(row._id, { text: '', accepted: false });

      // If two or more people had already asked for the next round, they are
      // seated now and the clock should start without anyone clicking again.
      await armCountdown(ctx, (await ctx.db.get(room._id))!);
      return;
    }

    // The decay resets with the explosion: the next player gets a full fuse again.
    const next = nextLivingSeat(seated, holder._id);
    if (!next) return;
    await startTurn(ctx, {
      roomId: room._id,
      gameId: game._id,
      turnSeq: game.turnSeq,
      difficulty: room.difficulty,
      playerId: next._id,
      hits: 0,
    });
  },
});
