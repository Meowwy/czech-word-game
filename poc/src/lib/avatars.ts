import { base } from '$app/paths';

/**
 * The profile-picture set.
 *
 * Filenames carry their extension on purpose: the shipped set is placeholder
 * SVG, and swapping in real artwork is `01.svg` -> `01.png` on the line below
 * plus dropping the file into static/img/avatars/. Nothing else knows the type.
 *
 * The stored value on a player document is the filename itself, so an avatar
 * that is later removed from this list simply falls back to the silhouette
 * rather than breaking the seat.
 */
export const AVATARS = [
  '01.svg',
  '02.svg',
  '03.svg',
  '04.svg',
  '05.svg',
  '06.svg',
  '07.svg',
  '08.svg',
  '09.svg',
  '10.svg',
  '11.svg',
  '12.svg',
] as const;

export type AvatarId = (typeof AVATARS)[number];

/** Shown for spectators, for players who never picked, and for stale ids. */
export const FALLBACK_AVATAR = '_none.svg';

// `base` is mandatory — the site lives at pavel-koleckar.cz/slovni-hra, and a
// bare "/img/..." would 404 there while still resolving in dev.
export function avatarUrl(avatar: string | null | undefined): string {
  const file = avatar && (AVATARS as readonly string[]).includes(avatar) ? avatar : FALLBACK_AVATAR;
  return `${base}/img/avatars/${file}`;
}

export const BOMB_URL = `${base}/img/bomb.png`;
export const ARROW_URL = `${base}/img/arrow.png`;
