<script lang="ts">
  import { untrack } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { HEARTBEAT_MS, MAX_PLAYERS, MIN_PLAYERS, type Difficulty } from '$convex/rules';
  import { getAvatar, getDeviceId, getNickname, setAvatar, setNickname } from '$lib/device.ts';
  import Arena from '$lib/components/game/Arena.svelte';
  import BottomBar from '$lib/components/game/BottomBar.svelte';
  import RulesBar from '$lib/components/game/RulesBar.svelte';
  import TopBar from '$lib/components/game/TopBar.svelte';
  import WordEntry from '$lib/components/game/WordEntry.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  const client = useConvexClient();

  const code = $derived(page.params.code?.toUpperCase() ?? '');
  const deviceId = getDeviceId();

  let nickname = $state(getNickname());
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
  // the table?" on the results screen — `playedRound` can.
  const seats = $derived(
    showingResults
      ? players.filter((p) => p.playedRound === room?.round)
      : players.filter((p) => p.seated),
  );

  const currentPlayer = $derived(seats.find((p) => p._id === game?.currentPlayerId) ?? null);
  const myTurn = $derived(!!me && !!game && game.currentPlayerId === me._id);
  const winner = $derived(
    showingResults ? (players.find((p) => p._id === game?.winnerId) ?? null) : null,
  );
  const tableFull = $derived(players.filter((p) => p.seated || p.seatNext).length >= MAX_PLAYERS);

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
  const remoteFresh = $derived(
    !!remote && !!game && (remote.turnSeq === game.turnSeq || remote.accepted),
  );

  const draftPlayerId = $derived(
    myTurn && me ? me._id : remoteFresh && remote ? remote.playerId : null,
  );
  const draftText = $derived(myTurn ? myDraft : remoteFresh && remote ? remote.text : '');
  const draftAccepted = $derived(!myTurn && remoteFresh && !!remote?.accepted);

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

  // ── actions ────────────────────────────────────────────────────────────────
  async function sit() {
    await client.mutation(api.rooms.sitDown, { code, deviceId });
  }

  async function stand() {
    await client.mutation(api.rooms.standUp, { code, deviceId });
  }

  async function saveProfile(name: string, pic: string) {
    setNickname(name);
    setAvatar(pic);
    await client.mutation(api.rooms.setProfile, {
      code,
      deviceId,
      nickname: name,
      avatar: pic || undefined,
    });
  }

  async function leave() {
    await client.mutation(api.rooms.leaveRoom, { code, deviceId });
    await goto(`${base}/`);
  }

  async function startNow() {
    await client.mutation(api.rooms.startGame, { code, deviceId });
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
    if (seats.length < MIN_PLAYERS)
      return `Čekáme na hráče — na start musíte být aspoň ${MIN_PLAYERS}.`;
    return 'Připraveno.';
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
      {deviceId}
      difficulty={room.difficulty as Difficulty}
      startingLives={room.startingLives}
      isHost={me?.isHost ?? false}
      settingsOpen={room.settingsOpen}
    />

    <!-- The arena is a click target for the word box; the handler is a
         convenience for mouse users, and every path into it is also reachable by
         keyboard, since the box already holds focus on your turn. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="relative flex flex-1 flex-col px-3 py-2" onclick={refocus}>
      {#if seats.length === 0}
        <div class="m-auto flex flex-col items-center gap-3 text-center">
          <p class="font-display text-xl text-ink-dim">U stolu zatím nikdo nesedí.</p>
          <p class="max-w-xs text-sm text-ink-faint">
            Klikni dole na „Připojit se“ a pošli kamarádům kód {room.code}.
          </p>
        </div>
      {:else}
        <Arena
          {seats}
          currentPlayerId={game?.currentPlayerId ?? null}
          {playing}
          substring={playing ? (game?.substring ?? '') : ''}
          startingLives={room.startingLives}
          {countdown}
          {draftPlayerId}
          {draftText}
          {draftAccepted}
          {winner}
          {shake}
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
            {:else if me?.isHost && !playing && seats.length >= MIN_PLAYERS}
              <Button variant="cta" size="lg" onclick={startNow}>Spustit hned</Button>
            {/if}
          {/snippet}
        </Arena>
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
      bind:nickname
      bind:avatar
      seated={me?.seated ?? false}
      seatNext={me?.seatNext ?? false}
      full={tableFull}
      {playing}
      {status}
      onsit={sit}
      onstand={stand}
      onprofile={saveProfile}
    />
  {/if}
</main>
