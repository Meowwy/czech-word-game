// End-to-end test of the multiplayer flow against a LIVE Convex dev deployment.
//
// Not part of `npm test` — it needs network and a provisioned deployment. Run it
// with `npm run test:convex` after `npx convex dev` has configured .env.local.
//
// Everything goes through the JS client rather than `npx convex run`, because
// Czech text passed as a shell argument gets mangled on Windows/Git Bash and
// produces false failures (see CLAUDE.md).
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).split('#')[0].trim()];
    }),
);

const url = env.PUBLIC_CONVEX_URL;
if (!url) {
  console.error('No PUBLIC_CONVEX_URL in .env.local — run `npx convex dev` first.');
  process.exit(1);
}
console.log(`deployment: ${url}\n`);

const client = new ConvexHttpClient(url);
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// A real word containing the prompt, found in the common list so it is certainly
// in the acceptance list too.
const common = readFileSync('data/words-common.txt', 'utf8').split('\n');
const wordContaining = (sub, exclude = new Set()) => {
  let best;
  for (const w of common) {
    if (w.length > sub.length && w.includes(sub) && !exclude.has(w)) {
      if (!best || w.length > best.length) best = w;
    }
  }
  return best;
};

const A = 'test-device-a';
const B = 'test-device-b';
let code;

try {
  console.log('room lifecycle');
  const created = await client.mutation('rooms:createRoom', { deviceId: A, nickname: 'Pavel' });
  check('createRoom returns a code', created.ok && /^[A-Z]{4}$/.test(created.code), created.code);
  code = created.code;

  const joined = await client.mutation('rooms:joinRoom', { code, deviceId: B, nickname: 'Katka' });
  check('second player joins', joined.ok === true);

  const dup = await client.mutation('rooms:joinRoom', { code, deviceId: 'c', nickname: 'pavel' });
  check('duplicate nickname is rejected', !dup.ok && dup.reason === 'nickname-taken');

  const rejoin = await client.mutation('rooms:joinRoom', { code, deviceId: B, nickname: 'Katka' });
  check('rejoining from the same device is idempotent', rejoin.ok === true);

  console.log('\nhost-only settings (enforced server-side, not just hidden in the UI)');
  const notHost = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: B,
    difficulty: 'easy',
  });
  check('non-host cannot change settings', !notHost.ok && notHost.reason === 'not-host');

  const setDiff = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: A,
    difficulty: 'hard',
    startingLives: 2,
  });
  check('host can change settings', setDiff.ok === true);

  const badLives = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: A,
    startingLives: 99,
  });
  check('lives outside 1-5 are rejected', !badLives.ok && badLives.reason === 'lives');

  let v = await client.query('rooms:view', { code });
  check('settings landed', v.room.difficulty === 'hard' && v.room.startingLives === 2);
  check('lobby has 2 players', v.players.length === 2);
  check('everyone starts with the configured lives', v.players.every((p) => p.lives === 2));

  await client.mutation('rooms:updateSettings', {
    code,
    deviceId: A,
    difficulty: 'easy',
    startingLives: 5,
  });

  const notHostStart = await client.mutation('rooms:startGame', { code, deviceId: B });
  check('non-host cannot start the game', !notHostStart.ok && notHostStart.reason === 'not-host');

  console.log('\nstarting the game');
  const started = await client.mutation('rooms:startGame', { code, deviceId: A });
  check('host starts the game', started.ok === true);

  v = await client.query('rooms:view', { code });
  check('room is playing', v.room.state === 'playing');
  check('a prompt was drawn', typeof v.game.substring === 'string' && v.game.substring.length >= 2);
  check('turnSeq advanced past the placeholder', v.game.turnSeq === 1);

  // The whole mechanic depends on this.
  check(
    'deadline is NOT exposed to clients',
    !('deadline' in v.game),
    `game keys: ${Object.keys(v.game).join(',')}`,
  );

  console.log('\nsubmitting words');
  const current = v.players.find((p) => p._id === v.game.currentPlayerId);
  const other = v.players.find((p) => p._id !== v.game.currentPlayerId);
  check('a current player is set', !!current, current?.nickname);

  const wrongTurn = await client.mutation('game:submitWord', {
    code,
    deviceId: other.deviceId,
    word: wordContaining(v.game.substring),
  });
  check('the wrong player cannot submit', !wrongTurn.ok && wrongTurn.reason === 'not-your-turn');

  const noSub = await client.mutation('game:submitWord', {
    code,
    deviceId: current.deviceId,
    word: 'xxxxxxxx',
  });
  check('a word without the prompt is rejected', !noSub.ok && noSub.reason === 'no-substring');

  const word = wordContaining(v.game.substring);
  check(`found a real word for "${v.game.substring}"`, !!word, word);
  const good = await client.mutation('game:submitWord', {
    code,
    deviceId: current.deviceId,
    word,
  });
  check('valid word is accepted', good.ok === true, good.reason);

  const afterHit = await client.query('rooms:view', { code });
  check('the bomb passed to the other player', afterHit.game.currentPlayerId === other._id);
  check('turnSeq advanced', afterHit.game.turnSeq === 2);
  check(
    'a fresh prompt was drawn',
    /^[a-záčďéěíňóřšťúůýž]{2,3}$/.test(afterHit.game.substring),
    afterHit.game.substring,
  );
  check('the score went up', afterHit.players.find((p) => p._id === current._id).words === 1);
  check('the played word is listed as recent', afterHit.game.recentWords.includes(word));

  // The used-word ban only shows itself when an already-played word happens to be
  // valid for a later prompt. Rather than assert it on a prompt where the
  // substring check fires first — which would pass for the wrong reason — play on
  // until that case actually arises.
  const used = new Set([word]);
  let banProven = false;
  let stopped = 'ran out of turns';
  for (let turn = 0; turn < 20 && !banProven; turn++) {
    const now = await client.query('rooms:view', { code });
    if (now.room.state !== 'playing') {
      stopped = 'the game ended (bomb exploded through everyone)';
      break;
    }
    const sub = now.game.substring;
    const holder = now.players.find((p) => p._id === now.game.currentPlayerId);

    const alreadyPlayed = [...used].find((w) => w.includes(sub));
    if (alreadyPlayed) {
      const banned = await client.mutation('game:submitWord', {
        code,
        deviceId: holder.deviceId,
        word: alreadyPlayed,
      });
      check(
        `a used word is refused for everyone ("${alreadyPlayed}" on "${sub}")`,
        !banned.ok && banned.reason === 'used',
        banned.reason,
      );
      banProven = true;
      break;
    }

    const fresh = wordContaining(sub, used);
    if (!fresh) {
      stopped = `no unused common word contains "${sub}"`;
      break;
    }
    const res = await client.mutation('game:submitWord', {
      code,
      deviceId: holder.deviceId,
      word: fresh,
    });
    if (!res.ok) {
      stopped = `submit of "${fresh}" for "${sub}" failed: ${res.reason}`;
      break;
    }
    used.add(fresh);
  }
  if (!banProven) check('the used-word ban was exercised', false, stopped);

  console.log('\nthe scheduled bomb (waiting up to 25s for an explosion)');
  const livesBefore = afterHit.players.reduce((n, p) => n + p.lives, 0);
  const startedAt = Date.now();
  let exploded = false;
  while (Date.now() - startedAt < 25_000) {
    await new Promise((r) => setTimeout(r, 1000));
    const now = await client.query('rooms:view', { code });
    const lives = now.players.reduce((n, p) => n + p.lives, 0);
    if (lives < livesBefore || now.room.state === 'over') {
      exploded = true;
      check(
        'the bomb fired on its own, with no client involved',
        true,
        `after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
      break;
    }
  }
  if (!exploded) check('the bomb fired within 25s', false, 'scheduler may not be running');
} finally {
  if (code) {
    await client.mutation('rooms:leaveRoom', { code, deviceId: A });
    await client.mutation('rooms:leaveRoom', { code, deviceId: B });
    await client.mutation('rooms:leaveRoom', { code, deviceId: 'c' });
    const gone = await client.query('rooms:view', { code });
    check('\ncleanup: empty room deletes itself', gone === null);
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall Convex checks passed');
process.exit(failed ? 1 : 0);
