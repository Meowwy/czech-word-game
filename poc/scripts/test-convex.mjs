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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sumLives = (players) => players.reduce((n, p) => n + p.lives, 0);

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
const C = 'test-device-c';

// `view` no longer ships anyone else's deviceId — it is the only credential the
// game has — so the test resolves its own player ids the same way the UI does:
// by asking as itself.
const viewAs = (code, deviceId) => client.query('rooms:view', { code, deviceId });
const idOf = async (code, deviceId) => (await viewAs(code, deviceId)).me._id;
const deviceOf = (playerId, ids) => Object.keys(ids).find((d) => ids[d] === playerId);

let code;

try {
  console.log('room lifecycle');
  const created = await client.mutation('rooms:createRoom', {
    deviceId: A,
    name: '  U   Nováků  ',
    nickname: 'Pavel',
    startingLives: 1,
  });
  check('createRoom returns a code', created.ok && /^[A-Z]{4}$/.test(created.code), created.code);
  code = created.code;

  const named = await viewAs(code, A);
  check('the room keeps the name it was given, normalised', named.room.name === 'U Nováků', named.room.name);

  const entered = await client.mutation('rooms:enterRoom', { code, deviceId: B, nickname: 'Katka' });
  check('a second person walks in', entered.ok === true);

  let v = await viewAs(code, B);
  check('the host is seated, the newcomer is watching', v.players.length === 2 && v.me.seated === false);
  check('only the host is at the table', v.players.filter((p) => p.seated).length === 1);

  const rejoin = await client.mutation('rooms:enterRoom', { code, deviceId: B, nickname: 'Katka2' });
  check('re-entering is idempotent', rejoin.ok === true);
  v = await viewAs(code, B);
  check('...and carries the current nickname in', v.me.nickname === 'Katka2');

  check(
    'other players’ deviceIds never reach a client',
    v.players.every((p) => !('deviceId' in p)),
    `player keys: ${Object.keys(v.players[0]).join(',')}`,
  );
  check('the host is flagged instead', v.players.some((p) => p.isHost) && v.me.isHost === false);

  console.log('\nthe public room browser');
  const listed = await client.query('rooms:list', {});
  const mine = listed.find((r) => r.code === code);
  check('the new room is advertised', !!mine);
  check('it counts players and watchers apart', mine?.seated === 1 && mine?.watching === 1);

  console.log('\none name per table');
  // Walking in cannot fail, so a clash is renamed rather than refused; asking
  // for a taken name on purpose is refused rather than renamed.
  const clash = await client.mutation('rooms:enterRoom', { code, deviceId: C, nickname: 'Pavel' });
  check('a third person walks in under a taken name', clash.ok === true);
  let asC = await viewAs(code, C);
  check('...and is numbered instead of doubled', asC.me.nickname === 'Pavel 2', asC.me.nickname);

  const stolen = await client.mutation('rooms:setProfile', {
    code,
    deviceId: C,
    nickname: 'pavel',
  });
  check(
    'renaming onto a taken name is refused, case and all',
    !stolen.ok && stolen.reason === 'name-taken',
  );
  asC = await viewAs(code, C);
  check('...and the name on the seat does not move', asC.me.nickname === 'Pavel 2');

  const renamed = await client.mutation('rooms:setProfile', { code, deviceId: C, nickname: 'Bára' });
  check('a free name is taken', renamed.ok && renamed.nickname === 'Bára');

  console.log('\nhost-only settings (enforced server-side, not just hidden in the UI)');
  const notHost = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: B,
    difficulty: 'easy',
  });
  check('non-host cannot change settings', !notHost.ok && notHost.reason === 'not-host');

  const badLives = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: A,
    startingLives: 99,
  });
  check('lives outside 1-5 are rejected', !badLives.ok && badLives.reason === 'lives');

  const notHostStart = await client.mutation('rooms:startGame', { code, deviceId: B });
  check('non-host cannot start the game', !notHostStart.ok && notHostStart.reason === 'not-host');

  console.log('\nnothing starts a round except the host');
  v = await viewAs(code, A);
  check('one player is not enough to start a clock', v.room.countdownEndsAt === undefined);

  const tooFew = await client.mutation('rooms:startGame', { code, deviceId: A });
  check('the host cannot start a one-player room', !tooFew.ok && tooFew.reason === 'too-few');

  const sat = await client.mutation('rooms:sitDown', { code, deviceId: B });
  check('the watcher takes a seat', sat.ok === true && sat.waiting === false);

  v = await viewAs(code, A);
  check(
    'a second player does NOT arm the countdown on its own',
    v.room.countdownEndsAt === undefined,
  );

  console.log('\nthe rules panel');
  await client.mutation('rooms:openSettings', { code, deviceId: A });
  v = await viewAs(code, A);
  check('the panel says it is open, to everyone', v.room.settingsOpen === true);

  const confirmed = await client.mutation('rooms:updateSettings', {
    code,
    deviceId: A,
    difficulty: 'easy',
    startingLives: 2,
    minTurnMs: 3000,
    turnRange: 'short',
    // High enough that nothing retires a prompt inside this run except a
    // correct answer — which is what the survival check below relies on.
    maxPromptAge: 5,
    close: true,
  });
  check('the host confirms', confirmed.ok === true);
  v = await viewAs(code, A);
  check('settings landed', v.room.difficulty === 'easy' && v.room.startingLives === 2);
  check(
    'the timing rules landed too',
    v.room.minTurnMs === 3000 && v.room.turnRange === 'short' && v.room.maxPromptAge === 5,
  );
  check('the panel closed itself', v.room.settingsOpen === false);
  check('...and closing it started nothing', v.room.countdownEndsAt === undefined);

  console.log('\nthe host arming the clock, taking it back, and arming it again');
  const armed = await client.mutation('rooms:startGame', { code, deviceId: A });
  check('the host arms the countdown', armed.ok === true);
  v = await viewAs(code, A);
  check('the countdown is running', typeof v.room.countdownEndsAt === 'number');
  check('the countdown end time IS public, unlike the fuse', v.room.countdownEndsAt > Date.now());

  await client.mutation('rooms:cancelStart', { code, deviceId: A });
  v = await viewAs(code, A);
  check('the host can take it back', v.room.countdownEndsAt === undefined);

  await client.mutation('rooms:startGame', { code, deviceId: A });
  await client.mutation('rooms:openSettings', { code, deviceId: A });
  v = await viewAs(code, A);
  check('opening the rules calls the countdown off', v.room.countdownEndsAt === undefined);
  await client.mutation('rooms:updateSettings', { code, deviceId: A, close: true });

  await client.mutation('rooms:startGame', { code, deviceId: A });

  console.log('\nthe countdown dealing the round (waiting up to 20s)');
  const waitStart = Date.now();
  let autoStarted = false;
  while (Date.now() - waitStart < 20_000) {
    await sleep(1000);
    v = await viewAs(code, A);
    if (v.room.state === 'playing') {
      autoStarted = true;
      check(
        'the countdown dealt the round the host asked for',
        true,
        `after ${((Date.now() - waitStart) / 1000).toFixed(1)}s`,
      );
      break;
    }
  }
  if (!autoStarted) check('autoStart fired within 20s', false, 'scheduler may not be running');

  check('the round counter advanced', v.room.round === 1);
  check('a prompt was drawn', typeof v.game.substring === 'string' && v.game.substring.length >= 2);
  check('turnSeq advanced past the placeholder', v.game.turnSeq === 1);

  // The whole mechanic depends on this.
  check(
    'deadline is NOT exposed to clients',
    !('deadline' in v.game),
    `game keys: ${Object.keys(v.game).join(',')}`,
  );

  const ids = { [A]: await idOf(code, A), [B]: await idOf(code, B) };
  const holderDevice = deviceOf(v.game.currentPlayerId, ids);
  const otherDevice = holderDevice === A ? B : A;
  check('a current player is set', !!holderDevice);

  console.log('\nthe live typing channel');
  await client.mutation('game:setTyping', { code, deviceId: otherDevice, text: 'podvod' });
  let draft = await client.query('game:typingOf', { code });
  check(
    'only the bomb holder may broadcast a draft',
    !draft || draft.text !== 'podvod',
    draft?.text,
  );

  await client.mutation('game:setTyping', { code, deviceId: holderDevice, text: 'kočk' });
  draft = await client.query('game:typingOf', { code });
  check('the holder’s draft reaches the table', draft?.text === 'kočk', draft?.text);
  check('diacritics survive the round trip', draft?.text.includes('č'));
  check('the draft is tagged with its turn', draft?.turnSeq === v.game.turnSeq);
  check('and with who is typing it', draft?.playerId === ids[holderDevice]);

  const longDraft = 'a'.repeat(200);
  await client.mutation('game:setTyping', { code, deviceId: holderDevice, text: longDraft });
  draft = await client.query('game:typingOf', { code });
  check('an oversized draft is clamped', draft.text.length === 40, `${draft.text.length} chars`);

  console.log('\nsubmitting words');
  const wrongTurn = await client.mutation('game:submitWord', {
    code,
    deviceId: otherDevice,
    word: wordContaining(v.game.substring),
  });
  check('the wrong player cannot submit', !wrongTurn.ok && wrongTurn.reason === 'not-your-turn');

  const noSub = await client.mutation('game:submitWord', {
    code,
    deviceId: holderDevice,
    word: 'xxxxxxxx',
  });
  check('a word without the prompt is rejected', !noSub.ok && noSub.reason === 'no-substring');

  const word = wordContaining(v.game.substring);
  check(`found a real word for "${v.game.substring}"`, !!word, word);
  const good = await client.mutation('game:submitWord', { code, deviceId: holderDevice, word });
  check('valid word is accepted', good.ok === true, good.reason);

  const afterHit = await viewAs(code, A);
  check('the bomb passed to the other player', afterHit.game.currentPlayerId === ids[otherDevice]);
  check('turnSeq advanced', afterHit.game.turnSeq === 2);
  check(
    'a fresh prompt was drawn',
    /^[a-záčďéěíňóřšťúůýž]{2,3}$/.test(afterHit.game.substring),
    afterHit.game.substring,
  );
  check(
    'the score went up',
    afterHit.players.find((p) => p._id === ids[holderDevice]).words === 1,
  );

  draft = await client.query('game:typingOf', { code });
  check('the accepted word is left standing for the green flash', draft?.accepted === true);
  check('...and it is the word that was played', draft?.text === word, draft?.text);
  check('...tagged with the turn it won, not the new one', draft?.turnSeq === 1);

  console.log('\njoining mid-round');
  await client.mutation('rooms:enterRoom', { code, deviceId: C, nickname: 'Divák' });
  const sitLate = await client.mutation('rooms:sitDown', { code, deviceId: C });
  check('a watcher can join while a round runs', sitLate.ok === true);
  check('...but only for the NEXT round', sitLate.waiting === true);
  const lateView = await viewAs(code, C);
  check('they are queued, not dealt in', lateView.me.seated === false && lateView.me.seatNext === true);

  console.log('\nthe used-word ban');
  // The ban only shows itself when an already-played word happens to be valid
  // for a later prompt. Rather than assert it on a prompt where the substring
  // check fires first — which would pass for the wrong reason — play on until
  // that case actually arises.
  const used = new Set([word]);
  let banProven = false;
  let stopped = 'ran out of turns';
  let turn = 0;
  for (; turn < 40 && !banProven; turn++) {
    const now = await viewAs(code, A);
    if (now.room.state !== 'playing') {
      stopped = 'the game ended (bomb exploded through everyone)';
      break;
    }
    const sub = now.game.substring;
    const holderId = now.game.currentPlayerId;
    const device = deviceOf(holderId, ids);
    if (!device) {
      stopped = 'the bomb is held by someone this test does not control';
      break;
    }

    const alreadyPlayed = [...used].find((w) => w.includes(sub));
    if (alreadyPlayed) {
      const banned = await client.mutation('game:submitWord', {
        code,
        deviceId: device,
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
    const res = await client.mutation('game:submitWord', { code, deviceId: device, word: fresh });
    if (!res.ok) {
      stopped = `submit of "${fresh}" for "${sub}" failed: ${res.reason}`;
      break;
    }
    used.add(fresh);
  }
  if (!banProven)
    check(
      'the used-word ban was exercised',
      false,
      `${stopped} (after ${turn} turns, ${used.size} words played: ${[...used].join(', ')})`,
    );

  console.log('\nthe scheduled bomb and the end of the round (waiting up to 60s)');
  // Two lives each, so the round outlives its first explosion — which is the
  // only way to watch what an explosion does to the prompt.
  const startedAt = Date.now();
  let over = false;
  // The bomb going off is not the same event as a word being solved, and only
  // one of them is allowed to change the prompt. Poll pairs: when the table
  // loses a life and the round carries on, the prompt must be the one that just
  // killed somebody. Nobody answered it, so it has not finished with the table.
  let before = await viewAs(code, A);
  let survived = false;
  while (Date.now() - startedAt < 60_000) {
    await sleep(1000);
    const now = await viewAs(code, A);
    const lost =
      sumLives(now.players) < sumLives(before.players) && now.room.state === 'playing';
    if (lost && !survived) {
      survived = true;
      check(
        'an explosion hands the SAME prompt on — a prompt lives until it is solved',
        now.game.substring === before.game.substring,
        `${before.game.substring} -> ${now.game.substring}`,
      );
    }
    before = now;
    if (now.room.state === 'over') {
      over = true;
      check(
        'the bomb fired on its own, with no client involved',
        true,
        `after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
      check('a winner was recorded on the room', typeof now.room.lastWinner === 'string', now.room.lastWinner);
      // Only now: during play this array grows on every correct answer and
      // `view` is the one subscription every client in the room holds.
      check(
        "the round's words arrive for the results screen",
        Array.isArray(now.game.usedWords) && now.game.usedWords.length > 0,
        String(now.game.usedWords?.length),
      );
      check('the game names the winner too', !!now.game.winnerId);
      check(
        'the players who played stand up again',
        now.players.filter((p) => p.playedRound === now.room.round).every((p) => !p.seated),
      );
      check(
        'the results screen can still find who was at the table',
        now.players.filter((p) => p.playedRound === now.room.round).length === 2,
      );
      check(
        'someone who asked for the next round is seated for it',
        !!now.players.find((p) => p.nickname === 'Divák' && p.seated && !p.seatNext),
      );
      check(
        'one seated player is not enough to restart the clock',
        now.room.countdownEndsAt === undefined,
      );
      break;
    }
  }
  if (!over) check('the round ended within 60s', false, 'scheduler may not be running');
  if (!survived)
    check(
      'a mid-round explosion was observed',
      false,
      'every poll landed between the blast and the next one — the prompt survival check never ran',
    );
} finally {
  if (code) {
    for (const d of [A, B, C]) await client.mutation('rooms:leaveRoom', { code, deviceId: d });
    const gone = await viewAs(code, A);
    check('\ncleanup: empty room deletes itself', gone === null);
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall Convex checks passed');
process.exit(failed ? 1 : 0);
