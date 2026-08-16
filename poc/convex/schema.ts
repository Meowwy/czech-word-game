import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const difficulty = v.union(v.literal('easy'), v.literal('medium'), v.literal('hard'));

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostDeviceId: v.string(),
    state: v.union(v.literal('lobby'), v.literal('playing'), v.literal('over')),
    difficulty,
    startingLives: v.number(),
    createdAt: v.number(),

    // Which round of this room we are on. Rooms are long-lived; games are not.
    round: v.number(),

    // Bumped every time the pre-game countdown is armed. The scheduled autoStart
    // carries the value it armed with and no-ops on mismatch — the same trick
    // `games.turnSeq` plays on the bomb, so nothing ever cancels a scheduled job.
    startSeq: v.number(),

    // Epoch ms, and deliberately PUBLIC — unlike `games.deadline`. See COUNTDOWN_MS.
    // Absent means no countdown is running.
    countdownEndsAt: v.optional(v.number()),

    // The host has the rules panel open. Holds the countdown off until they are
    // done, so nobody starts a round under settings that are mid-edit.
    settingsOpen: v.boolean(),

    // Who took the last round. Survives the game document being deleted.
    lastWinner: v.optional(v.string()),

    // Drives the public room browser's freshness cut-off and its ordering.
    lastActivityAt: v.number(),
  })
    .index('by_code', ['code'])
    .index('by_activity', ['lastActivityAt']),

  players: defineTable({
    roomId: v.id('rooms'),
    deviceId: v.string(),
    nickname: v.string(),
    // Filename from src/lib/avatars.ts. Unset renders the silhouette.
    avatar: v.optional(v.string()),

    // The spectator split. Everyone with a row is *in the room*; only `seated`
    // players are dealt into the rotation. `seatNext` is the mid-round intent —
    // "join the next round" — promoted to `seated` when the next game starts.
    seated: v.boolean(),
    seatNext: v.boolean(),
    // The round this player was last dealt into. Everyone stands up when a round
    // ends, so `seated` can no longer answer "who was at the table?" — and the
    // results screen still has to draw them, with the winner in the middle.
    playedRound: v.number(),

    order: v.number(),
    lives: v.number(),
    words: v.number(),

    // Refreshed by a client heartbeat; stale rows are pruned on the next write
    // so the room browser does not fill up with people who closed the tab.
    lastSeenAt: v.number(),
  })
    .index('by_room', ['roomId'])
    .index('by_room_device', ['roomId', 'deviceId']),

  games: defineTable({
    roomId: v.id('rooms'),
    // Bumped on every turn. A scheduled explosion carries the seq it was armed
    // with and no-ops if it no longer matches — that is how a correct answer
    // cancels the bomb without touching the scheduler.
    turnSeq: v.number(),
    currentPlayerId: v.id('players'),
    substring: v.string(),
    // Epoch ms. NEVER returned to clients: the hidden timer is the whole mechanic.
    deadline: v.number(),
    hitsSinceExplosion: v.number(),
    // Banned for everyone for the rest of the game. An array on one document is
    // fine here — the 1 MiB document cap is ~100k words.
    usedWords: v.array(v.string()),
    winnerId: v.optional(v.id('players')),
  }).index('by_room', ['roomId']),

  /**
   * What the bomb holder is typing, right now, for everyone to watch.
   *
   * One row per room, patched in place several times a second. It is a table of
   * its own rather than a field on `players` or `games` on purpose: `rooms.view`
   * returns the whole player array, so a keystroke written there would invalidate
   * that one big subscription for every client and re-run its room + players +
   * game reads ~8x a second. Here it has its own tiny query and costs nothing
   * else.
   */
  typing: defineTable({
    roomId: v.id('rooms'),
    playerId: v.id('players'),
    // The turn this draft belongs to. Clients ignore rows from a finished turn
    // rather than trusting delivery order.
    turnSeq: v.number(),
    text: v.string(),
    // Set when the text is a word that was just accepted — the green flash.
    accepted: v.boolean(),
  }).index('by_room', ['roomId']),
});
