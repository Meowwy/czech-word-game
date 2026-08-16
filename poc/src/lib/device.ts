import { guestNickname } from '$convex/rules';

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
 * Remembered between visits, and never blank.
 *
 * A first-time visitor is given a guest name here rather than being stopped at a
 * name prompt on the way into a game — the name box in the bottom bar is where
 * you change it, not a gate you pass through. Generated once and persisted, so
 * it does not shuffle on every render.
 */
export function getNickname(): string {
  if (typeof localStorage === 'undefined') return '';
  let name = localStorage.getItem(NAME_KEY);
  if (!name) {
    name = guestNickname();
    localStorage.setItem(NAME_KEY, name);
  }
  return name;
}

export function setNickname(name: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(NAME_KEY, name);
}

/** A filename from src/lib/avatars.ts, or '' for the silhouette. */
export function getAvatar(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(AVATAR_KEY) ?? '';
}

export function setAvatar(avatar: string): void {
  if (typeof localStorage === 'undefined') return;
  if (avatar) localStorage.setItem(AVATAR_KEY, avatar);
  else localStorage.removeItem(AVATAR_KEY);
}
