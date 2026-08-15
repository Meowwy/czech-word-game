import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { difficulty as difficultyValidator } from './schema';
import { gameOf, playersOf, roomByCode, startTurn } from './turns';
import {
  MAX_LIVES,
  MAX_PLAYERS,
  MIN_LIVES,
  MIN_PLAYERS,
  isValidCode,
  makeCode,
  normalizeNickname,
} from './rules';

const DEFAULT_LIVES = 3;

/**
 * Everything the room screen needs, in one reactive subscription.
 *
 * `deadline` is stripped here and nowhere else — if it ever leaks into this
 * projection the hidden countdown becomes visible in devtools and the core
 * mechanic is gone.
 */
export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;

    const players = await playersOf(ctx, room._id);
    const game = await gameOf(ctx, room._id);

    return {
      room,
      players,
      game: game
        ? {
            _id: game._id,
            turnSeq: game.turnSeq,
            currentPlayerId: game.currentPlayerId,
            substring: game.substring,
            usedCount: game.usedWords.length,
            recentWords: game.usedWords.slice(-8),
            winnerId: game.winnerId,
          }
        : null,
    };
  },
});

export const createRoom = mutation({
  args: { deviceId: v.string(), nickname: v.string() },
  handler: async (ctx, args) => {
    const nickname = normalizeNickname(args.nickname);
    if (!nickname) return { ok: false as const, reason: 'nickname' };

    // 24^4 = 331,776 codes, but rooms are never cleaned up, so check rather than
    // assume. Bounded retries so a pathological run cannot spin.
    let code: string | null = null;
    for (let i = 0; i < 20 && code === null; i++) {
      const candidate = makeCode();
      if (!(await roomByCode(ctx, candidate))) code = candidate;
    }
    if (code === null) return { ok: false as const, reason: 'code' };

    const roomId = await ctx.db.insert('rooms', {
      code,
      hostDeviceId: args.deviceId,
      state: 'lobby',
      difficulty: 'medium',
      startingLives: DEFAULT_LIVES,
      createdAt: Date.now(),
    });
    await ctx.db.insert('players', {
      roomId,
      deviceId: args.deviceId,
      nickname,
      order: 0,
      lives: DEFAULT_LIVES,
      words: 0,
    });

    return { ok: true as const, code };
  },
});

export const joinRoom = mutation({
  args: { code: v.string(), deviceId: v.string(), nickname: v.string() },
  handler: async (ctx, args) => {
    if (!isValidCode(args.code.toUpperCase())) return { ok: false as const, reason: 'code' };

    const nickname = normalizeNickname(args.nickname);
    if (!nickname) return { ok: false as const, reason: 'nickname' };

    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };

    const players = await playersOf(ctx, room._id);

    // Rejoining from the same device is idempotent, so a refresh cannot strand
    // you outside your own room.
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (mine) return { ok: true as const, code: room.code };

    if (room.state !== 'lobby') return { ok: false as const, reason: 'in-progress' };
    if (players.length >= MAX_PLAYERS) return { ok: false as const, reason: 'full' };
    if (players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase()))
      return { ok: false as const, reason: 'nickname-taken' };

    await ctx.db.insert('players', {
      roomId: room._id,
      deviceId: args.deviceId,
      nickname,
      order: players.length,
      lives: room.startingLives,
      words: 0,
    });

    return { ok: true as const, code: room.code };
  },
});

export const updateSettings = mutation({
  args: {
    code: v.string(),
    deviceId: v.string(),
    difficulty: v.optional(difficultyValidator),
    startingLives: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    // Enforced in the mutation, not merely hidden in the UI.
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };
    if (room.state === 'playing') return { ok: false as const, reason: 'in-progress' };

    const patch: { difficulty?: typeof room.difficulty; startingLives?: number } = {};
    if (args.difficulty) patch.difficulty = args.difficulty;
    if (args.startingLives !== undefined) {
      if (args.startingLives < MIN_LIVES || args.startingLives > MAX_LIVES)
        return { ok: false as const, reason: 'lives' };
      patch.startingLives = args.startingLives;
    }
    await ctx.db.patch(room._id, patch);

    // Keep the lobby hearts honest while people are still choosing.
    if (patch.startingLives !== undefined) {
      for (const p of await playersOf(ctx, room._id)) {
        await ctx.db.patch(p._id, { lives: patch.startingLives });
      }
    }
    return { ok: true as const };
  },
});

export const startGame = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };
    if (room.state === 'playing') return { ok: false as const, reason: 'in-progress' };

    const players = await playersOf(ctx, room._id);
    if (players.length < MIN_PLAYERS) return { ok: false as const, reason: 'too-few' };

    // Reshuffle seating each game so the same person does not always open.
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (let i = 0; i < shuffled.length; i++) {
      await ctx.db.patch(shuffled[i]._id, { order: i, lives: room.startingLives, words: 0 });
    }

    // "Play again" reuses the room, so clear any finished game first.
    const previous = await gameOf(ctx, room._id);
    if (previous) await ctx.db.delete(previous._id);

    const first = shuffled[0];
    const gameId = await ctx.db.insert('games', {
      roomId: room._id,
      turnSeq: 0,
      currentPlayerId: first._id,
      substring: '',
      deadline: 0,
      hitsSinceExplosion: 0,
      usedWords: [],
    });
    await ctx.db.patch(room._id, { state: 'playing' });
    await startTurn(ctx, {
      gameId,
      turnSeq: 0,
      difficulty: room.difficulty,
      playerId: first._id,
      hits: 0,
    });

    return { ok: true as const };
  },
});

export const leaveRoom = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: true as const };

    const players = await playersOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (!mine) return { ok: true as const };

    const game = await gameOf(ctx, room._id);

    // Leaving mid-turn would strand the bomb, so hand it on before deleting.
    if (room.state === 'playing' && game && game.currentPlayerId === mine._id) {
      const others = players.filter((p) => p._id !== mine._id && p.lives > 0);
      if (others.length > 0) {
        await startTurn(ctx, {
          gameId: game._id,
          turnSeq: game.turnSeq,
          difficulty: room.difficulty,
          playerId: others[0]._id,
          hits: 0,
        });
      }
    }

    await ctx.db.delete(mine._id);

    const remaining = players.filter((p) => p._id !== mine._id);
    if (remaining.length === 0) {
      if (game) await ctx.db.delete(game._id);
      await ctx.db.delete(room._id);
      return { ok: true as const };
    }

    // Reseat so `order` stays contiguous, and pass the host role on if needed.
    for (let i = 0; i < remaining.length; i++) await ctx.db.patch(remaining[i]._id, { order: i });
    if (room.hostDeviceId === args.deviceId)
      await ctx.db.patch(room._id, { hostDeviceId: remaining[0].deviceId });

    return { ok: true as const };
  },
});
