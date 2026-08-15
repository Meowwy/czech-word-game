// Identity, such as it is: a UUID in localStorage, exactly as the pictionary
// project does it. No accounts, no auth — the deviceId is how a browser proves
// which player around the table it is.
const DEVICE_KEY = 'debu_device_id';
const NAME_KEY = 'debu_nickname';

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Remembered between visits, unlike pictionary, which makes you retype it. */
export function getNickname(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function setNickname(name: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(NAME_KEY, name);
}
