import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import {
  difficulty as difficultyValidator,
  turnRange as turnRangeValidator,
} from './schema';
import {
  beginCountdown,
  cancelCountdown,
  clearTyping,
  gameOf,
  holdCountdown,
  playersOf,
  roomByCode,
  roomRules,
  seatedOf,
  startTurn,
  typingRow,
} from './turns';
import {
  GHOST_MS,
  MAX_LIVES,
  MAX_OCCUPANTS,
  MAX_PLAYERS,
  MAX_PROMPT_AGE,
  MAX_TURN_FLOOR_MS,
  MIN_LIVES,
  MIN_PLAYERS,
  MIN_PROMPT_AGE,
  MIN_TURN_FLOOR_MS,
  ROOM_LIST_TTL_MS,
  ROOM_SWEEP_MS,
  guestNickname,
  isValidCode,
  makeCode,
  normalizeNickname,
  normalizeRoomName,
  sameNickname,
  uniqueNickname,
} from './rules';

const DEFAULT_LIVES = 3;

/**
 * Everything the room screen needs, in one reactive subscription.
 *
 * Two things are stripped here and nowhere else:
 *
 *  - `games.deadline`, because a visible fuse is no fuse at all;
 *  - every other player's `deviceId`. That string is the only credential this
 *    game has — `submitWord`, `startGame` and `updateSettings` all authorise on
 *    string equality against it — so shipping the whole player document, as this
 *    query used to, handed every client the ability to play as anyone else. What
 *    the UI actually needed from it was two booleans, so it gets two booleans.
 *
 * Anything new that returns a room, player or game document must do the same.
 */
export const view = query({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, { code, deviceId }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;

    const players = await playersOf(ctx, room._id);
    const game = await gameOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === deviceId) ?? null;

    return {
      room: {
        code: room.code,
        name: room.name,
        state: room.state,
        startingLives: room.startingLives,
        round: room.round,
        settingsOpen: room.settingsOpen,
        // `difficulty` is deliberately not listed here — `roomRules` carries it,
        // and naming it twice in one literal is a TS2783 error. Convex typechecks
        // this directory on `deploy`, so that lands as a failed build rather than
        // a failed request.
        // The host's rules, defaults already applied, so the panel and the
        // status line never have to know what an unset field meant.
        ...roomRules(room),
        // Public on purpose, unlike the fuse: a start you cannot see coming is
        // an ambush, and the host needs the same clock everyone else has.
        countdownEndsAt: room.countdownEndsAt,
        lastWinner: room.lastWinner,
      },
      players: players.map((p) => ({
        _id: p._id,
        nickname: p.nickname,
        avatar: p.avatar,
        seated: p.seated,
        seatNext: p.seatNext,
        playedRound: p.playedRound,
        order: p.order,
        lives: p.lives,
        words: p.words,
        isHost: p.deviceId === room.hostDeviceId,
        isMe: p.deviceId === deviceId,
      })),
      me: mine
        ? {
            _id: mine._id,
            nickname: mine.nickname,
            avatar: mine.avatar,
            seated: mine.seated,
            seatNext: mine.seatNext,
            isHost: mine.deviceId === room.hostDeviceId,
          }
        : null,
      game: game
        ? {
            _id: game._id,
            turnSeq: game.turnSeq,
            currentPlayerId: game.currentPlayerId,
            substring: game.substring,
            usedCount: game.usedWords.length,
            // Only once the round is over. During play this array grows by one
            // on every correct answer, and `view` is the one big subscription
            // every client in the room holds — shipping the whole list on each
            // word would put the round's history on the wire dozens of times.
            usedWords: room.state === 'over' ? game.usedWords : undefined,
            startedAt: game._creationTime,
            winnerId: game.winnerId,
          }
        : null,
    };
  },
});

/**
 * The public room browser.
 *
 * Every room is listed — there is no private flag — so the way a room stops
 * being advertised is by going quiet. `lastActivityAt` is bumped by joins,
 * leaves, settings changes and heartbeats, so an abandoned room falls off the
 * list within ROOM_LIST_TTL_MS without anything having to sweep it.
 *
 * This fans out over up to 30 rooms' player lists, which means a join anywhere
 * invalidates it for everyone on the lobby screen. That is affordable because
 * the one genuinely high-frequency write in this app — typing — lives in its own
 * table and touches nothing here.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ROOM_LIST_TTL_MS;
    const rooms = await ctx.db
      .query('rooms')
      .withIndex('by_activity', (q) => q.gt('lastActivityAt', cutoff))
      .order('desc')
      .take(30);

    const out = [];
    for (const room of rooms) {
      const players = await playersOf(ctx, room._id);
      if (players.length === 0) continue;
      out.push({
        code: room.code,
        name: room.name,
        state: room.state,
        difficulty: room.difficulty,
        startingLives: room.startingLives,
        round: room.round,
        seated: seatedOf(players).length,
        watching: players.length - seatedOf(players).length,
        countdownEndsAt: room.countdownEndsAt,
      });
    }
    return out;
  },
});

/**
 * Drop watchers who closed the tab.
 *
 * Only watchers, and never the host or the person holding the bomb: a seated
 * player who vanishes is already handled correctly by the bomb going off on
 * them until they are out of lives.
 */
async function pruneGhosts(ctx: MutationCtx, room: Doc<'rooms'>): Promise<void> {
  const cutoff = Date.now() - GHOST_MS;
  for (const p of await playersOf(ctx, room._id)) {
    if (p.seated || p.seatNext) continue;
    if (p.deviceId === room.hostDeviceId) continue;
    if (p.lastSeenAt >= cutoff) continue;
    await ctx.db.delete(p._id);
  }
}

export const createRoom = mutation({
  args: {
    deviceId: v.string(),
    /** The room's name, not the host's. Blank is fine — see `roomTitle`. */
    name: v.optional(v.string()),
    /** Whatever name this device already remembers. Blank means "not yet named". */
    nickname: v.optional(v.string()),
    avatar: v.optional(v.string()),
    difficulty: v.optional(difficultyValidator),
    startingLives: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // The lobby asks for the *room's* name now, so the host may arrive without
    // one of their own. A seat needs a name — that rule has not moved — so an
    // unnamed host walks in watching and sits from the bottom bar like anybody
    // else. Only a device that already remembers a name is seated on the spot.
    const named = normalizeNickname(args.nickname ?? '');
    const nickname = named || guestNickname();
    const roomName = normalizeRoomName(args.name ?? '');

    const lives = args.startingLives ?? DEFAULT_LIVES;
    if (lives < MIN_LIVES || lives > MAX_LIVES) return { ok: false as const, reason: 'lives' };

    // 24^4 = 331,776 codes, but rooms are never cleaned up eagerly, so check
    // rather than assume. Bounded retries so a pathological run cannot spin.
    let code: string | null = null;
    for (let i = 0; i < 20 && code === null; i++) {
      const candidate = makeCode();
      if (!(await roomByCode(ctx, candidate))) code = candidate;
    }
    if (code === null) return { ok: false as const, reason: 'code' };

    const now = Date.now();
    const roomId = await ctx.db.insert('rooms', {
      code,
      name: roomName || undefined,
      hostDeviceId: args.deviceId,
      state: 'lobby',
      difficulty: args.difficulty ?? 'medium',
      startingLives: lives,
      createdAt: now,
      round: 0,
      startSeq: 0,
      settingsOpen: false,
      lastActivityAt: now,
    });
    // Whoever opens a room means to play in it — but a watcher sits at `lives: 0`
    // and an unnamed host is a watcher, so the two fields move together.
    await ctx.db.insert('players', {
      roomId,
      deviceId: args.deviceId,
      nickname,
      avatar: args.avatar,
      seated: named !== '',
      seatNext: false,
      playedRound: 0,
      order: 0,
      lives: named !== '' ? lives : 0,
      words: 0,
      lastSeenAt: now,
    });

    return { ok: true as const, code };
  },
});

/**
 * Walk into a room. This always succeeds if the room exists.
 *
 * You arrive watching, never playing, which is what makes a shared link and a
 * click in the room browser the same thing and removes the name-entry modal from
 * the front of the game entirely. Sitting down is a separate, deliberate act.
 */
export const enterRoom = mutation({
  args: {
    code: v.string(),
    deviceId: v.string(),
    nickname: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isValidCode(args.code.toUpperCase())) return { ok: false as const, reason: 'code' };

    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };

    await pruneGhosts(ctx, room);

    const now = Date.now();
    const players = await playersOf(ctx, room._id);

    const mine = players.find((p) => p.deviceId === args.deviceId);
    // Walking in cannot fail, so a name already at this table is resolved rather
    // than refused: you arrive as "Pavel 2". Renaming yourself on purpose is the
    // opposite — see `setProfile`.
    const taken = players.filter((p) => p._id !== mine?._id).map((p) => p.nickname);
    const nickname = uniqueNickname(normalizeNickname(args.nickname) || guestNickname(), taken);

    if (mine) {
      // Re-entering is idempotent, but it does carry the current profile in —
      // the old join silently ignored a changed nickname, so renaming yourself
      // and re-opening the link left you under the old name forever.
      await ctx.db.patch(mine._id, { nickname, avatar: args.avatar, lastSeenAt: now });
      await ctx.db.patch(room._id, { lastActivityAt: now });
      return { ok: true as const, code: room.code };
    }

    if (players.length >= MAX_OCCUPANTS) return { ok: false as const, reason: 'full' };

    await ctx.db.insert('players', {
      roomId: room._id,
      deviceId: args.deviceId,
      nickname,
      avatar: args.avatar,
      seated: false,
      seatNext: false,
      playedRound: 0,
      order: players.length,
      lives: 0,
      words: 0,
      lastSeenAt: now,
    });
    await ctx.db.patch(room._id, { lastActivityAt: now });

    return { ok: true as const, code: room.code };
  },
});

/**
 * Take a seat.
 *
 * Between rounds this seats you immediately and may start the countdown. During
 * a round it records the intent instead — `beginRound` promotes it — which is
 * what "připojit se na další kolo" means.
 */
export const sitDown = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };

    const players = await playersOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (!mine) return { ok: false as const, reason: 'not-in-room' };
    if (mine.seated) return { ok: true as const, waiting: false };

    const pending = seatedOf(players).length + players.filter((p) => p.seatNext).length;
    if (pending >= MAX_PLAYERS) return { ok: false as const, reason: 'full' };

    if (room.state === 'playing') {
      await ctx.db.patch(mine._id, { seatNext: true });
      await ctx.db.patch(room._id, { lastActivityAt: Date.now() });
      return { ok: true as const, waiting: true };
    }

    await ctx.db.patch(mine._id, {
      seated: true,
      seatNext: false,
      lives: room.startingLives,
      words: 0,
    });
    await ctx.db.patch(room._id, { lastActivityAt: Date.now() });
    return { ok: true as const, waiting: false };
  },
});

/** Step back out of the rotation, mid-round or not. */
export const standUp = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };

    const players = await playersOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (!mine) return { ok: false as const, reason: 'not-in-room' };

    const game = await gameOf(ctx, room._id);

    // Standing up while holding the bomb would strand it, so hand it on first.
    if (room.state === 'playing' && game && game.currentPlayerId === mine._id) {
      const others = seatedOf(players).filter((p) => p._id !== mine._id && p.lives > 0);
      if (others.length > 0) {
        // Walking away is not solving it, so the prompt goes on with the bomb.
        await startTurn(ctx, {
          room,
          gameId: game._id,
          turnSeq: game.turnSeq,
          playerId: others[0]._id,
          hits: 0,
          keepPrompt: game.substring,
          promptFails: game.promptFails ?? 0,
        });
      }
    }

    await ctx.db.patch(mine._id, { seated: false, seatNext: false, lives: 0 });
    await ctx.db.patch(room._id, { lastActivityAt: Date.now() });
    // Nothing here ever starts the clock; standing up can only stop one that no
    // longer has a table under it.
    await holdCountdown(ctx, (await ctx.db.get(room._id))!);
    return { ok: true as const };
  },
});

/** Rename / re-avatar in place. No rejoin, no reload, works mid-round. */
export const setProfile = mutation({
  args: {
    code: v.string(),
    deviceId: v.string(),
    nickname: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };

    const players = await playersOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (!mine) return { ok: false as const, reason: 'not-in-room' };

    // The picture is never refused: two identical faces at a table are a joke,
    // two identical names are a broken game — the bomb is passed by name.
    await ctx.db.patch(mine._id, { avatar: args.avatar, lastSeenAt: Date.now() });

    const wanted = normalizeNickname(args.nickname);
    if (!wanted || sameNickname(wanted, mine.nickname)) {
      return { ok: true as const, nickname: mine.nickname };
    }

    // Nobody changes who they are mid-round. The table calls out whose turn it
    // is by name, and a name that moves while the bomb is in the air is the one
    // rename that costs somebody a life.
    if (room.state === 'playing' && mine.seated) {
      return { ok: false as const, reason: 'playing', nickname: mine.nickname };
    }

    if (players.some((p) => p._id !== mine._id && sameNickname(p.nickname, wanted))) {
      return { ok: false as const, reason: 'name-taken', nickname: mine.nickname };
    }

    await ctx.db.patch(mine._id, { nickname: wanted });
    return { ok: true as const, nickname: wanted };
  },
});

/** "Still here." Cheap enough to run every HEARTBEAT_MS from every open tab. */
export const heartbeat = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const };

    const players = await playersOf(ctx, room._id);
    const mine = players.find((p) => p.deviceId === args.deviceId);
    if (!mine) return { ok: false as const };

    const now = Date.now();
    await ctx.db.patch(mine._id, { lastSeenAt: now });
    await ctx.db.patch(room._id, { lastActivityAt: now });
    return { ok: true as const };
  },
});

/**
 * The host opened the rules panel.
 *
 * It calls off a countdown that is already running, so nobody is dealt a round
 * under settings that are mid-edit. What it deliberately no longer does is the
 * reverse: closing the panel starts nothing. Confirming rules and starting a
 * game are two different intentions, and tying them together meant the host
 * could not look at the difficulty without committing the room to a round.
 */
export const openSettings = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };

    await ctx.db.patch(room._id, { settingsOpen: true });
    await cancelCountdown(ctx, (await ctx.db.get(room._id))!);
    return { ok: true as const };
  },
});

/**
 * Apply the rules.
 *
 * Every field is optional and applied only if present, because the panel now
 * writes on each change rather than on a confirm button — the host drags the
 * lives slider and the hearts on the table move while they watch. `close` is
 * separate for the same reason: a settings write is not a decision to play.
 *
 * Starting a round is `startGame` and nothing else.
 */
export const updateSettings = mutation({
  args: {
    code: v.string(),
    deviceId: v.string(),
    difficulty: v.optional(difficultyValidator),
    startingLives: v.optional(v.number()),
    minTurnMs: v.optional(v.number()),
    turnRange: v.optional(turnRangeValidator),
    maxPromptAge: v.optional(v.number()),
    /** Shut the panel as part of the same write. */
    close: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    // Enforced in the mutation, not merely hidden in the UI.
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };
    if (room.state === 'playing') return { ok: false as const, reason: 'in-progress' };

    const patch: Partial<Doc<'rooms'>> = { lastActivityAt: Date.now() };
    if (args.close) patch.settingsOpen = false;
    if (args.difficulty) patch.difficulty = args.difficulty;
    if (args.turnRange) patch.turnRange = args.turnRange;
    if (args.startingLives !== undefined) {
      if (args.startingLives < MIN_LIVES || args.startingLives > MAX_LIVES)
        return { ok: false as const, reason: 'lives' };
      patch.startingLives = args.startingLives;
    }
    if (args.minTurnMs !== undefined) {
      if (args.minTurnMs < MIN_TURN_FLOOR_MS || args.minTurnMs > MAX_TURN_FLOOR_MS)
        return { ok: false as const, reason: 'turn' };
      patch.minTurnMs = args.minTurnMs;
    }
    if (args.maxPromptAge !== undefined) {
      if (args.maxPromptAge < MIN_PROMPT_AGE || args.maxPromptAge > MAX_PROMPT_AGE)
        return { ok: false as const, reason: 'prompt-age' };
      patch.maxPromptAge = args.maxPromptAge;
    }
    await ctx.db.patch(room._id, patch);

    // Keep the hearts on the waiting seats honest while people are still choosing.
    if (patch.startingLives !== undefined) {
      for (const p of seatedOf(await playersOf(ctx, room._id))) {
        await ctx.db.patch(p._id, { lives: patch.startingLives });
      }
    }
    return { ok: true as const };
  },
});

/**
 * Deal a round. Shared by the host's "start now" button and the countdown firing,
 * so there is exactly one description of what starting a game means.
 */
async function beginRound(ctx: MutationCtx, room: Doc<'rooms'>) {
  const players = await playersOf(ctx, room._id);

  // Everyone who asked to join mid-round gets in now.
  for (const p of players) {
    if (p.seatNext && !p.seated) {
      await ctx.db.patch(p._id, { seated: true, seatNext: false });
      p.seated = true;
      p.seatNext = false;
    }
  }

  const seated = seatedOf(players);
  if (seated.length < MIN_PLAYERS) return { ok: false as const, reason: 'too-few' };

  // Reshuffle seating each round so the same person does not always open.
  const shuffled = [...seated];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const round = room.round + 1;
  for (let i = 0; i < shuffled.length; i++) {
    await ctx.db.patch(shuffled[i]._id, {
      order: i,
      lives: room.startingLives,
      words: 0,
      playedRound: round,
    });
  }
  // Watchers keep contiguous orders after the seats, so `playersOf` stays stable
  // and a spectator can never be mistaken for seat 0.
  const watching = players.filter((p) => !p.seated);
  for (let i = 0; i < watching.length; i++) {
    await ctx.db.patch(watching[i]._id, { order: shuffled.length + i, lives: 0, words: 0 });
  }

  // A new round reuses the room, so clear the finished game first.
  const previous = await gameOf(ctx, room._id);
  if (previous) await ctx.db.delete(previous._id);
  await clearTyping(ctx, room._id);

  const first = shuffled[0];
  const gameId = await ctx.db.insert('games', {
    roomId: room._id,
    turnSeq: 0,
    currentPlayerId: first._id,
    substring: '',
    deadline: 0,
    hitsSinceExplosion: 0,
    promptFails: 0,
    usedWords: [],
  });

  await ctx.db.patch(room._id, {
    state: 'playing',
    round,
    countdownEndsAt: undefined,
    settingsOpen: false,
    // Voids any other countdown still in flight for this room.
    startSeq: room.startSeq + 1,
    lastActivityAt: Date.now(),
  });

  await startTurn(ctx, {
    room,
    gameId,
    turnSeq: 0,
    playerId: first._id,
    hits: 0,
  });

  return { ok: true as const };
}

/**
 * The host starting the room. The only thing in the app that arms the clock.
 *
 * It does not deal the round itself — it puts COUNTDOWN_MS on the board and lets
 * `autoStart` do it — so that everyone at the table gets the same visible warning
 * whether the host clicked or the clock ran out, and so the host can take it
 * back with `cancelStart` while it runs.
 */
export const startGame = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };
    if (room.state === 'playing') return { ok: false as const, reason: 'in-progress' };

    const armed = await beginCountdown(ctx, room);
    if (!armed) return { ok: false as const, reason: 'too-few' };
    await ctx.db.patch(room._id, { lastActivityAt: Date.now() });
    return { ok: true as const };
  },
});

/** ...and taking it back. Host only, and a no-op if nothing is running. */
export const cancelStart = mutation({
  args: { code: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const room = await roomByCode(ctx, args.code);
    if (!room) return { ok: false as const, reason: 'not-found' };
    if (room.hostDeviceId !== args.deviceId) return { ok: false as const, reason: 'not-host' };
    if (room.state === 'playing') return { ok: false as const, reason: 'in-progress' };

    await cancelCountdown(ctx, room);
    return { ok: true as const };
  },
});

/**
 * The countdown reaching zero.
 *
 * `startSeq` is what makes this safe to leave scheduled: anything that calls the
 * countdown off bumps the sequence, so this arrives, finds a mismatch, and does
 * nothing.
 */
export const autoStart = internalMutation({
  args: { roomId: v.id('rooms'), startSeq: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.startSeq !== args.startSeq) return;
    if (room.state === 'playing' || room.settingsOpen) return;
    await beginRound(ctx, room);
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
      const others = seatedOf(players).filter((p) => p._id !== mine._id && p.lives > 0);
      if (others.length > 0) {
        // Walking away is not solving it, so the prompt goes on with the bomb.
        await startTurn(ctx, {
          room,
          gameId: game._id,
          turnSeq: game.turnSeq,
          playerId: others[0]._id,
          hits: 0,
          keepPrompt: game.substring,
          promptFails: game.promptFails ?? 0,
        });
      }
    }

    await ctx.db.delete(mine._id);

    const remaining = players.filter((p) => p._id !== mine._id);
    if (remaining.length === 0) {
      if (game) await ctx.db.delete(game._id);
      const draft = await typingRow(ctx, room._id);
      if (draft) await ctx.db.delete(draft._id);
      await ctx.db.delete(room._id);
      return { ok: true as const };
    }

    // Reseat so `order` stays contiguous, and pass the host role on if needed.
    for (let i = 0; i < remaining.length; i++) await ctx.db.patch(remaining[i]._id, { order: i });
    if (room.hostDeviceId === args.deviceId)
      await ctx.db.patch(room._id, { hostDeviceId: remaining[0].deviceId });

    await ctx.db.patch(room._id, { lastActivityAt: Date.now() });
    await holdCountdown(ctx, (await ctx.db.get(room._id))!);
    return { ok: true as const };
  },
});

/**
 * Delete rooms nobody has touched for a day, and everything hanging off them.
 *
 * `leaveRoom` already deletes a room the moment the last person walks out, so
 * this only catches the rooms everybody closed the tab on. That used to be
 * harmless — nothing listed them — but a public browser makes abandoned rooms
 * visible, and a room code space of 24^4 makes them worth reclaiming.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ROOM_SWEEP_MS;
    const dead = await ctx.db
      .query('rooms')
      .withIndex('by_activity', (q) => q.lt('lastActivityAt', cutoff))
      .take(200);

    for (const room of dead) {
      for (const p of await playersOf(ctx, room._id)) await ctx.db.delete(p._id);
      const game = await gameOf(ctx, room._id);
      if (game) await ctx.db.delete(game._id);
      const draft = await typingRow(ctx, room._id);
      if (draft) await ctx.db.delete(draft._id);
      await ctx.db.delete(room._id);
    }
    return { swept: dead.length };
  },
});
