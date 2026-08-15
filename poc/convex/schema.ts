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
  }).index('by_code', ['code']),

  players: defineTable({
    roomId: v.id('rooms'),
    deviceId: v.string(),
    nickname: v.string(),
    order: v.number(),
    lives: v.number(),
    words: v.number(),
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
});
