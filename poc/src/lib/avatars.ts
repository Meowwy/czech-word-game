import { base } from '$app/paths';

/**
 * The profile-picture set.
 *
 * Filenames carry their extension on purpose, so the set can be photographs,
 * drawings or anything else without a second thing needing to know: adding a
 * picture is a square file in static/img/avatars/ plus a line below.
 *
 * The stored value on a player document is the filename itself, so an avatar
 * that is later removed from this list simply falls back to the silhouette
 * rather than breaking the seat. `isAvatar` is what the client uses to notice
 * that its remembered pick has gone stale.
 */
export const AVATARS = [
  '01.jpg',
  '02.jpg',
  '03.jpg',
  '04.jpg',
  '05.jpg',
  '06.jpg',
  '07.jpg',
  '08.jpg',
] as const;

export type AvatarId = (typeof AVATARS)[number];

/** Shown for spectators, for players who never picked, and for stale ids. */
export const FALLBACK_AVATAR = '_none.svg';

export function isAvatar(avatar: string | null | undefined): avatar is AvatarId {
  return !!avatar && (AVATARS as readonly string[]).includes(avatar);
}

/**
 * A picture for someone who has never chosen one.
 *
 * Everybody arrives already looking like somebody, because a table of identical
 * silhouettes is harder to read than a table of strangers — and picking your own
 * then becomes a change rather than a chore standing between you and the game.
 */
export function randomAvatar(rand: () => number = Math.random): AvatarId {
  return AVATARS[Math.floor(rand() * AVATARS.length)];
}

// `base` is mandatory — the site lives at pavel-koleckar.cz/slovni-hra, and a
// bare "/img/..." would 404 there while still resolving in dev.
export function avatarUrl(avatar: string | null | undefined): string {
  return `${base}/img/avatars/${isAvatar(avatar) ? avatar : FALLBACK_AVATAR}`;
}

export const BOMB_URL = `${base}/img/bomb.png`;
export const ARROW_URL = `${base}/img/arrow.png`;
