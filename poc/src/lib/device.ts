import { isAvatar, randomAvatar } from '$lib/avatars.ts';

// Identity, such as it is: a UUID in localStorage, exactly as the pictionary
// project does it. No accounts, no auth — the deviceId is how a browser proves
// which player around the table it is.
const DEVICE_KEY = 'debu_device_id';
const NAME_KEY = 'debu_nickname';
const AVATAR_KEY = 'debu_avatar';

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Remembered between visits, and blank until its owner types one.
 *
 * Deliberately *not* backfilled with a guest name: naming yourself is the one
 * thing the game asks before it deals you in, and a box that has already filled
 * itself in with `Host4127` is a box nobody edits. Watching costs nothing, so
 * the name is required to sit down rather than to walk in — see the sit button
 * in BottomBar.
 */
export function getNickname(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function setNickname(name: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
  else localStorage.removeItem(NAME_KEY);
}

/**
 * "No picture" is a choice, and has to be storable as one — otherwise the next
 * call to `getAvatar` would read the empty string as "never picked" and hand out
 * a random face again.
 */
const FALLBACK_CHOICE = 'none';

/**
 * A filename from src/lib/avatars.ts, chosen at random on first visit.
 *
 * The pick is persisted the moment it is made, so it does not reshuffle on every
 * render or every room. A remembered value that is no longer in `AVATARS` — the
 * set was renumbered, a picture was retired — is treated as no pick at all and
 * quietly replaced, which is what keeps an old browser from showing the
 * silhouette forever after the artwork changes.
 */
export function getAvatar(): string {
  if (typeof localStorage === 'undefined') return '';
  const stored = localStorage.getItem(AVATAR_KEY);
  if (isAvatar(stored)) return stored;
  if (stored === FALLBACK_CHOICE) return '';
  const picked = randomAvatar();
  localStorage.setItem(AVATAR_KEY, picked);
  return picked;
}

export function setAvatar(avatar: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AVATAR_KEY, isAvatar(avatar) ? avatar : FALLBACK_CHOICE);
}
