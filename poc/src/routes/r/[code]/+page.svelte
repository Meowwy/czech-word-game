<script lang="ts">
  import { untrack } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import {
    HEARTBEAT_MS,
    MAX_PLAYERS,
    MIN_PLAYERS,
    sameNickname,
    type Difficulty,
    type TurnRange,
  } from '$convex/rules';
  import { getAvatar, getDeviceId, getNickname, setAvatar, setNickname } from '$lib/device.ts';
  import * as cz from '$lib/czech.ts';
  import { SHAKE_MS } from '$lib/anim.ts';
  import Arena from '$lib/components/game/Arena.svelte';
  import BottomBar from '$lib/components/game/BottomBar.svelte';
  import ProfileTag from '$lib/components/game/ProfileTag.svelte';
  import RulesBar from '$lib/components/game/RulesBar.svelte';
  import TopBar from '$lib/components/game/TopBar.svelte';
  import WordEntry from '$lib/components/game/WordEntry.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  const client = useConvexClient();

  const code = $derived(page.params.code?.toUpperCase() ?? '');
  const deviceId = getDeviceId();

  let nickname = $state(getNickname());
  /** Why the room refused the last profile change, if it did. */
  let profileNote = $state('');
  let avatar = $state(getAvatar());

  // Two subscriptions, not one. `view` changes when the room does — someone
  // joins, a life is lost, a turn passes. `typingOf` changes several times a
  // second while anyone is typing. Keeping them apart is the whole reason the
  // live draft is affordable: a keystroke re-runs a two-field read, not the
  // room + players + game read behind `view`.
  const roomQuery = useQuery(api.rooms.view, () => ({ code, deviceId }));
  const typingQuery = useQuery(api.game.typingOf, () => ({ code }));

  const view = $derived(roomQuery.data);
  const room = $derived(view?.room ?? null);
  const players = $derived(view?.players ?? []);
  const game = $derived(view?.game ?? null);
  const me = $derived(view?.me ?? null);

  const playing = $derived(room?.state === 'playing' && !!game);

  // The results linger until enough people opt back in. Once the countdown for
  // the next round is armed the table reforms around the new line-up, so the
  // winner does not sit in the middle of a game that is about to start.
  const showingResults = $derived(room?.state === 'over' && room.countdownEndsAt === undefined);

  // Everyone stands up when a round ends, so `seated` cannot answer "who was at
  // the table?" between rounds — `playedRound` can.
  //
  // The union, and for the whole gap rather than only until the clock starts:
  // the table used to empty out one player at a time as people opted back in,
  // because the moment a countdown was armed this fell back to `seated` and
  // everyone who had not clicked yet vanished from around the winner. Whoever
  // just played stays drawn until the next round actually deals.
  const betweenRounds = $derived(room?.state === 'over');
  const seats = $derived(
    betweenRounds
      ? players.filter((p) => p.playedRound === room?.round || p.seated || p.seatNext)
      : players.filter((p) => p.seated),
  );

  // ...but drawn dim, because "still on screen" must not read as "playing the
  // next one". Lit means dealt in: seated now, or asked to be.
  const dimIds = $derived(
    betweenRounds ? seats.filter((p) => !p.seated && !p.seatNext).map((p) => p._id) : [],
  );

  const currentPlayer = $derived(seats.find((p) => p._id === game?.currentPlayerId) ?? null);
  const myTurn = $derived(!!me && !!game && game.currentPlayerId === me._id);
  const winner = $derived(
    showingResults ? (players.find((p) => p._id === game?.winnerId) ?? null) : null,
  );
  const tableFull = $derived(players.filter((p) => p.seated || p.seatNext).length >= MAX_PLAYERS);

  // Who is dealt into the NEXT round, which on the results screen is not who is
  // drawn at the table: everyone stands up when a round ends, so `seats` there
  // is the line-up that just played and this is the line-up waiting to play.
  // The start button and the status line both mean this one.
  const ready = $derived(players.filter((p) => p.seated || p.seatNext).length);

  // The room asks for a name before it deals you in, and nowhere else — see
  // BottomBar. Both sit buttons read the same flag so the round-end one cannot
  // become a way around it.
  const named = $derived(nickname.trim().length > 0);

  // ── walking in ─────────────────────────────────────────────────────────────
  // Always as a watcher, never as a player. That is what lets a shared link, a
  // click in the room browser and a refresh all be the same thing, and why there
  // is no name-entry modal in front of the game any more.
  let entered = $state('');
  $effect(() => {
    if (!code || entered === code) return;
    entered = code;
    void client.mutation(api.rooms.enterRoom, {
      code,
      deviceId,
      nickname,
      avatar: avatar || undefined,
    });
  });

  // The room may have adjusted the name on the way in: two people called Pavel
  // is not a table anyone can play at, so `enterRoom` seats the second one as
  // "Pavel 2" rather than refusing an entry that is never allowed to fail. The
  // box has to be told, or it would keep offering the name that was taken and
  // every attempt to sit down would be refused.
  //
  // Only ever adjusts a name its owner actually typed. An empty box stays empty:
  // the guest name behind it is a safety net for the database, not a suggestion,
  // and a box that has already written `Host4127` in itself is a box nobody edits.
  let synced = $state(false);
  $effect(() => {
    const server = me?.nickname;
    if (!server || synced) return;
    untrack(() => {
      synced = true;
      if (!nickname || sameNickname(server, nickname)) return;
      profileNote = `U stolu už jeden ${nickname} je — jsi ${server}.`;
      nickname = server;
      setNickname(server);
    });
  });

  // "Still here." Watchers who close the tab are pruned on the next write, so
  // the room browser does not fill up with ghosts.
  $effect(() => {
    if (!code) return;
    const id = setInterval(() => {
      void client.mutation(api.rooms.heartbeat, { code, deviceId });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  });

  // ── the visible countdown ──────────────────────────────────────────────────
  // A wall clock, so it has no reactive source to derive from. Unlike the fuse,
  // this end time is public on purpose: `countdownEndsAt` comes straight out of
  // `rooms.view`.
  let now = $state(Date.now());
  $effect(() => {
    if (room?.countdownEndsAt === undefined) return;
    const id = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(id);
  });

  const countdown = $derived.by(() => {
    const ends = room?.countdownEndsAt;
    if (ends === undefined || playing) return null;
    return Math.max(0, Math.ceil((ends - now) / 1000));
  });

  // ── the on-screen keyboard ─────────────────────────────────────────────────
  // The arena is a fixed `h-dvh` shell with nothing to scroll, so a phone
  // keyboard would simply be drawn on top of the word box at the bottom. `dvh`
  // does not shrink for it — the visual viewport does, and the difference
  // between the two is exactly how much of the shell is buried. Padding the
  // shell by that much makes the flex column lay itself out inside what is
  // still visible, which lifts the box and the footer clear of the keys.
  let keyboardInset = $state(0);
  $effect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () => {
      keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  });

  // ── the live draft ─────────────────────────────────────────────────────────
  // Your own keystrokes render from local state; everyone else's arrive over the
  // subscription. Waiting for your own text to come back from the server would
  // put a round trip between the key and the letter.
  let myDraft = $state('');
  let shake = $state(false);
  let message = $state('');

  const remote = $derived(typingQuery.data ?? null);

  // The one row says two different kinds of thing, and they are on screen at
  // different times. A *live* draft belongs to the turn in progress and vanishes
  // with it. A *verdict* — the word that won the turn, or the word the bomb went
  // off on — deliberately outlives its turn, and stays under the seat that
  // played it until the next player's first keystroke overwrites the row.
  const verdict = $derived(
    remote && (remote.accepted || remote.failed)
      ? {
          playerId: remote.playerId,
          text: remote.text,
          accepted: remote.accepted,
          failed: remote.failed,
        }
      : null,
  );
  const remoteLive = $derived(!!remote && !!game && !verdict && remote.turnSeq === game.turnSeq);

  // Splitting them is what lets the new bomb holder see the last word too: their
  // own box is empty and live, the previous player's word is settled, and both
  // belong on the table at once. Rolled into one pointer, whichever seat it named
  // was the only one that could show anything.
  const draftPlayerId = $derived(
    myTurn && me ? me._id : remoteLive && remote ? remote.playerId : null,
  );
  const draftText = $derived(myTurn ? myDraft : remoteLive && remote ? remote.text : '');

  // ── the bounce, for the rest of the table ──────────────────────────────────
  // Your own rejected word shakes from local state, the instant it happens.
  // Everyone else's arrives the only way it can: `typing.rejectSeq` goes up, and
  // the difference between two renders is the event. Same trick the heart break
  // in `Seat` plays, and for the same reason — the server reports state, never
  // events. `null` until the first render, so walking into a room where someone
  // has already bounced a word does not shake their seat on arrival.
  let remoteShake = $state(false);
  let lastRejectSeq = $state<number | null>(null);
  let bounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const seq = remote?.rejectSeq ?? 0;
    untrack(() => {
      if (lastRejectSeq !== null && seq > lastRejectSeq) {
        remoteShake = true;
        clearTimeout(bounceTimer);
        bounceTimer = setTimeout(() => (remoteShake = false), SHAKE_MS);
      }
      lastRejectSeq = seq;
    });
  });

  // Deliberately not the cleanup of the effect above: that one re-runs on every
  // keystroke anybody types, and tearing the timer down there would cut the
  // shake short the moment the next draft landed.
  $effect(() => () => clearTimeout(bounceTimer));

  // One seat shakes at a time — the one holding the bomb. Whose screen it is
  // only decides which of the two signals is the fresher one.
  const shakePlayerId = $derived(
    myTurn ? (shake && me ? me._id : null) : remoteShake ? draftPlayerId : null,
  );

  // ── bomb choreography ──────────────────────────────────────────────────────
  // The server never says "that was an explosion"; it says a turn ended and a
  // life is gone. Watching the total is enough to tell the two apart, and keeps
  // the animation trigger out of the schema.
  let passSeq = $state(0);
  let blastSeq = $state(0);
  let lastTurnSeq = $state(0);
  let lastTotalLives = $state(0);

  $effect(() => {
    const turn = game?.turnSeq ?? 0;
    const total = seats.reduce((sum, p) => sum + p.lives, 0);
    untrack(() => {
      if (turn !== lastTurnSeq) {
        // The word standing under a seat survives Enter, so it has to be cleared
        // by something — and the something is the next turn. Without this, the
        // word you last bounced would still be sitting there when the bomb came
        // back round to you.
        if (lastTurnSeq !== 0) {
          if (total < lastTotalLives) blastSeq += 1;
          else passSeq += 1;
        }
        myDraft = '';
        message = '';
      }
      lastTurnSeq = turn;
      lastTotalLives = total;
    });
  });

  // Every word the round produced, in the order they were played. The server
  // only ships the array once the round is over — during play it grows by one on
  // every correct answer, and `view` is the one big subscription every client in
  // the room holds.
  const playedWords = $derived(showingResults ? (game?.usedWords ?? []) : []);

  // ── actions ────────────────────────────────────────────────────────────────
  async function sit() {
    if (!named) return;
    // Before the seat, not after: the name box is across the screen from the
    // button now, and tapping a button on a phone does not reliably blur the box
    // first. Sitting down under the previous name is the one moment that shows.
    //
    // And if the name is refused, the seat is not taken: sitting down under a
    // name you did not agree to is exactly the confusion the check is for.
    if (!(await saveProfile(nickname, avatar))) return;
    await client.mutation(api.rooms.sitDown, { code, deviceId });
  }

  async function stand() {
    await client.mutation(api.rooms.standUp, { code, deviceId });
  }

  /**
   * The server has the last word on the name, so this reads the answer back.
   *
   * Two ways it can refuse: the name is somebody else's at this table, or a
   * round is running and you are in it. Either way the box is put back to the
   * name that is actually on your seat — a text box left showing a name the room
   * does not know you by is worse than the refusal.
   */
  async function saveProfile(name: string, pic: string): Promise<boolean> {
    setAvatar(pic);
    const result = await client.mutation(api.rooms.setProfile, {
      code,
      deviceId,
      nickname: name,
      avatar: pic || undefined,
    });

    if (result.ok) {
      profileNote = '';
      setNickname(result.nickname);
      nickname = result.nickname;
      return true;
    }

    profileNote =
      result.reason === 'name-taken'
        ? 'Tohle jméno už u stolu někdo má.'
        : result.reason === 'playing'
          ? 'Během kola se přejmenovat nedá.'
          : 'Jméno se nepodařilo uložit.';
    // Only the two refusals that know your name carry one back.
    if ('nickname' in result && result.nickname) nickname = result.nickname;
    return false;
  }

  async function leave() {
    await client.mutation(api.rooms.leaveRoom, { code, deviceId });
    await goto(`${base}/`);
  }

  // Nothing else in the app arms the clock. A room used to deal itself a round
  // the moment a second person sat down, which gave the host no way to fill a
  // table or finish reading the rules without racing a countdown they never
  // started.
  async function startNow() {
    await client.mutation(api.rooms.startGame, { code, deviceId });
  }

  async function cancelStart() {
    await client.mutation(api.rooms.cancelStart, { code, deviceId });
  }

  /** Clicking anywhere in the arena hands the caret back to the word box. */
  function refocus() {
    if (myTurn) document.querySelector<HTMLInputElement>('input[aria-label="tvoje slovo"]')?.focus();
  }

  const status = $derived.by(() => {
    if (!room) return '';
    if (message && myTurn) return message;
    if (playing) return myTurn ? 'Jsi na řadě — piš!' : `Na řadě je ${currentPlayer?.nickname ?? '…'}.`;
    if (countdown !== null) return `Hra začíná za ${countdown}…`;
    if (room.settingsOpen) return 'Zakladatel upravuje pravidla.';
    if (ready < MIN_PLAYERS) return `Čekáme na hráče — na start musíte být aspoň ${MIN_PLAYERS}.`;
    // Nobody is waiting on a clock any more, so the status line has to say who
    // everyone is waiting on instead.
    return me?.isHost ? 'Můžeš spustit hru.' : 'Čekáme, až zakladatel spustí hru.';
  });
</script>

<svelte:head>
  <title>{code} — Debuchánkovaná</title>
</svelte:head>

<main
  class="debu-arena-bg flex h-dvh flex-col overflow-hidden"
  style="padding-bottom: {keyboardInset}px"
>
  <TopBar
    {code}
    round={room?.round ?? 0}
    startedAt={playing ? (game?.startedAt ?? null) : null}
    words={game?.usedCount ?? 0}
    onleave={leave}
  />

  {#if roomQuery.isLoading}
    <p class="m-auto text-ink-faint">Načítám místnost…</p>
  {:else if roomQuery.error}
    <div class="m-auto flex flex-col items-center gap-4 text-center">
      <p class="text-danger">Nepodařilo se načíst místnost.</p>
      <Button variant="outline" href="{base}/">Zpět na začátek</Button>
    </div>
  {:else if !room}
    <div class="m-auto flex flex-col items-center gap-4 text-center">
      <h1 class="font-display text-2xl font-bold">Místnost <b class="text-gold">{code}</b> neexistuje</h1>
      <p class="text-sm text-ink-faint">Možná už skončila, nebo je v kódu překlep.</p>
      <Button variant="cta" href="{base}/">Zpět na začátek</Button>
    </div>
  {:else}
    <RulesBar
      {code}
      name={room.name}
      {deviceId}
      difficulty={room.difficulty as Difficulty}
      startingLives={room.startingLives}
      minTurnMs={room.minTurnMs}
      turnRange={room.turnRange as TurnRange}
      maxPromptAge={room.maxPromptAge}
      isHost={me?.isHost ?? false}
      settingsOpen={room.settingsOpen}
    />

    <!-- The arena is a click target for the word box; the handler is a
         convenience for mouse users, and every path into it is also reachable by
         keyboard, since the box already holds focus on your turn. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="relative flex flex-1 flex-col px-3 py-2" onclick={refocus}>
      <!-- The tag is pinned to the foot of the *arena*, not of the column, so it
           lands above the word box and the results list instead of on top of
           them — on a phone the word box is nearly as wide as the screen, and
           the column's own bottom-left corner is inside it.

           One Arena in every state, empty table included: it is what draws the
           wordmark when nobody is seated, and swapping it for a message block
           there meant the room had two different middles. -->
      <div class="relative flex flex-1 flex-col">
        <!-- Over the table rather than in a bar of its own. The corner is empty
             at every table size, because the seats sit on a circle.
             `stopPropagation` because the arena it floats on sends every click
             to the word box, and reaching for your own name on your own turn
             should not bounce the caret away. `pointer-events-none` on the frame
             keeps the space beside the tag clickable — it is still arena. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="pointer-events-none absolute bottom-1 left-0 z-30 flex"
          onclick={(event) => event.stopPropagation()}
        >
          <div class="pointer-events-auto">
            <ProfileTag
              bind:nickname
              bind:avatar
              locked={playing && (me?.seated ?? false)}
              note={profileNote}
              onprofile={saveProfile}
            />
          </div>
        </div>

        <Arena
          {seats}
          currentPlayerId={game?.currentPlayerId ?? null}
          {playing}
          substring={playing ? (game?.substring ?? '') : ''}
          startingLives={room.startingLives}
          {countdown}
          emptyHint="Klikni dole na „Připojit se“ a pošli kamarádům kód {room.code}."
          {draftPlayerId}
          {draftText}
          {verdict}
          {winner}
          {shakePlayerId}
          {dimIds}
          {passSeq}
          {blastSeq}
        >
          {#snippet centre()}
            <!-- The round-end call to action, under the winner where everyone is
                 already looking. -->
            {#if showingResults && me && !me.seated && !me.seatNext}
              <Button variant="go" size="xl" disabled={tableFull || !named} onclick={sit}>
                {tableFull ? 'Plno' : !named ? 'Napiš si dole jméno' : 'Připojit se na další kolo'}
              </Button>
            {/if}

            <!-- The host's clock, and the way back out of it. Nothing else starts
                 a round, so this button is the room's primary action whenever
                 there is a table to deal to. -->
            {#if me?.isHost && !playing}
              {#if countdown !== null}
                <Button variant="outline" size="lg" onclick={cancelStart}>Zrušit start</Button>
              {:else if ready >= MIN_PLAYERS}
                <Button variant="cta" size="xl" onclick={startNow}>
                  {room.state === 'over' ? 'Hrát další kolo' : 'Spustit hru'}
                </Button>
              {/if}
            {/if}
          {/snippet}
        </Arena>
      </div>

      {#if showingResults && playedWords.length > 0}
        <!-- What the round produced, in the slot the word box occupies while one
             is running. Capped and scrollable rather than allowed to grow: a
             long round can produce a hundred words, and the arena above it is a
             fixed-height shell with nothing else to give. -->
        <section class="mt-auto flex shrink-0 flex-col items-center gap-2 pt-2 pb-1">
          <h2 class="text-sm text-ink-faint">
            {cz.words(playedWords.length)} za kolo
          </h2>
          <ul
            class="flex max-h-28 w-full max-w-2xl flex-wrap justify-center gap-1.5 overflow-y-auto overscroll-contain px-1"
          >
            {#each playedWords as word (word)}
              <li
                class="rounded-full border border-panel-line bg-panel/80 px-2.5 py-0.5 text-sm text-ink-dim"
              >
                {word}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if playing && game}
        <!-- Keyed on the turn: a new prompt remounts the input, which clears it. -->
        {#key game.turnSeq}
          <WordEntry
            {code}
            {deviceId}
            substring={game.substring}
            {myTurn}
            currentName={currentPlayer?.nickname ?? ''}
            bind:draft={myDraft}
            bind:rejected={shake}
            bind:message
          />
        {/key}
      {/if}
    </div>

    <BottomBar
      {nickname}
      seated={me?.seated ?? false}
      seatNext={me?.seatNext ?? false}
      full={tableFull}
      {playing}
      {status}
      onsit={sit}
      onstand={stand}
    />
  {/if}
</main>
