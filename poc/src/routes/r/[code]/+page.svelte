<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import BombIcon from '@lucide/svelte/icons/bomb';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import { api } from '$convex/_generated/api';
  import { DIFFICULTY_LABEL, MIN_PLAYERS, type Difficulty } from '$convex/rules';
  import { getDeviceId } from '$lib/device.ts';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import JoinRoomDialog from '$lib/components/game/JoinRoomDialog.svelte';
  import PlayerList from '$lib/components/game/PlayerList.svelte';
  import RoomSettings from '$lib/components/game/RoomSettings.svelte';
  import WordEntry from '$lib/components/game/WordEntry.svelte';

  const client = useConvexClient();

  const code = $derived(page.params.code?.toUpperCase() ?? '');
  const deviceId = getDeviceId();

  const roomQuery = useQuery(api.rooms.view, () => ({ code }));

  const view = $derived(roomQuery.data);
  const room = $derived(view?.room ?? null);
  const players = $derived(view?.players ?? []);
  const game = $derived(view?.game ?? null);

  const me = $derived(players.find((p) => p.deviceId === deviceId) ?? null);
  const isHost = $derived(room?.hostDeviceId === deviceId);
  const myTurn = $derived(!!me && game?.currentPlayerId === me._id);
  const currentPlayer = $derived(players.find((p) => p._id === game?.currentPlayerId) ?? null);
  const winner = $derived(players.find((p) => p._id === game?.winnerId) ?? null);
  const canStart = $derived(players.length >= MIN_PLAYERS);

  let joinOpen = $state(false);
  let copied = $state(false);
  let startError = $state('');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(page.url.href);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  async function start() {
    startError = '';
    const result = await client.mutation(api.rooms.startGame, { code, deviceId });
    if (!result.ok) {
      startError =
        result.reason === 'too-few'
          ? `Na hru musíte být aspoň ${MIN_PLAYERS}.`
          : 'Hru se nepodařilo spustit.';
    }
  }

  async function leave() {
    await client.mutation(api.rooms.leaveRoom, { code, deviceId });
    await goto(`${base}/`);
  }
</script>

<svelte:head>
  <title>{code} — Debuchánkovaná</title>
</svelte:head>

<main class="min-h-dvh bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-6">
  <div class="mx-auto flex w-full max-w-xl flex-col gap-4">
    {#if roomQuery.isLoading}
      <p class="mt-24 text-center text-neutral-500">Načítám místnost…</p>
    {:else if roomQuery.error}
      <Card class="p-6 text-center">
        <p class="text-red-600">Nepodařilo se načíst místnost.</p>
        <Button class="mt-4" variant="outline" href="{base}/">Zpět na začátek</Button>
      </Card>
    {:else if !room}
      <Card class="flex flex-col items-center gap-4 p-8 text-center">
        <h1 class="text-xl font-semibold">Místnost <b>{code}</b> neexistuje</h1>
        <p class="text-sm text-neutral-500">Možná už skončila, nebo je v kódu překlep.</p>
        <Button variant="cta" href="{base}/">Zpět na začátek</Button>
      </Card>

      <!-- ────────────── arrived on a shared link, not in the room yet ────────────── -->
    {:else if !me}
      <Card class="flex flex-col items-center gap-4 p-8 text-center">
        <p class="text-sm text-neutral-500">Místnost</p>
        <p class="text-4xl font-bold tracking-[0.3em] text-neutral-900">{room.code}</p>
        {#if room.state === 'lobby'}
          <p class="text-sm text-neutral-500">
            {players.length}
            {players.length === 1 ? 'hráč čeká' : players.length < 5 ? 'hráči čekají' : 'hráčů čeká'}
            na start.
          </p>
          <Button variant="cta" size="lg" onclick={() => (joinOpen = true)}>Připojit se</Button>
        {:else}
          <p class="text-sm text-neutral-500">
            Tady už se hraje. Počkej, až hra skončí, nebo si založ vlastní místnost.
          </p>
          <Button variant="outline" href="{base}/">Zpět na začátek</Button>
        {/if}
      </Card>

      <!-- ─────────────────────────────── lobby ─────────────────────────────── -->
    {:else if room.state === 'lobby'}
      <Card class="flex flex-col items-center gap-3 p-6 text-center">
        <p class="text-sm text-neutral-500">Kód místnosti</p>
        <p class="text-5xl font-bold tracking-[0.3em] text-neutral-900">{room.code}</p>
        <Button variant="outline" size="sm" onclick={copyLink}>
          {#if copied}
            <CheckIcon class="size-4" /> Zkopírováno
          {:else}
            <CopyIcon class="size-4" /> Zkopírovat odkaz
          {/if}
        </Button>
      </Card>

      <Card class="overflow-hidden">
        <h2 class="border-b border-neutral-200 px-4 py-3 font-semibold">
          Hráči ({players.length})
        </h2>
        <PlayerList
          {players}
          myDeviceId={deviceId}
          hostDeviceId={room.hostDeviceId}
          startingLives={room.startingLives}
        />
      </Card>

      <Card class="p-4">
        <RoomSettings
          {code}
          {deviceId}
          difficulty={room.difficulty as Difficulty}
          startingLives={room.startingLives}
          {isHost}
        />
      </Card>

      {#if isHost}
        <Button variant="cta" size="xl" disabled={!canStart} onclick={start}>
          {canStart ? 'Spustit hru' : `Čekáme aspoň na ${MIN_PLAYERS} hráče`}
        </Button>
        {#if startError}<p class="text-center text-sm text-red-600">{startError}</p>{/if}
      {:else if me}
        <p class="text-center text-sm text-neutral-500">
          Čekáme, až hru spustí zakladatel místnosti…
        </p>
      {/if}

      {#if me}
        <Button variant="ghost" size="sm" onclick={leave}>Odejít z místnosti</Button>
      {/if}

      <!-- ────────────────────────────── playing ────────────────────────────── -->
    {:else if room.state === 'playing' && game}
      <Card class="flex flex-col items-center gap-5 p-6 sm:p-8">
        <BombIcon
          class="size-10 text-orange-500 [animation:debu-pulse_1.6s_ease-in-out_infinite]"
          aria-hidden="true"
        />

        <p class="text-sm text-neutral-500">
          {#if myTurn}
            <b class="text-neutral-900">Jsi na řadě!</b>
          {:else}
            Hraje <b class="text-neutral-900">{currentPlayer?.nickname ?? '…'}</b>
          {/if}
        </p>

        <p class="text-6xl font-bold tracking-[0.15em] text-neutral-900 uppercase sm:text-7xl">
          {game.substring}
        </p>

        <!-- Keyed on the turn: a new prompt remounts the input, which clears it. -->
        {#key game.turnSeq}
          <WordEntry {code} {deviceId} substring={game.substring} {myTurn} />
        {/key}
      </Card>

      <Card class="overflow-hidden">
        <PlayerList
          {players}
          myDeviceId={deviceId}
          hostDeviceId={room.hostDeviceId}
          currentPlayerId={game.currentPlayerId}
          startingLives={room.startingLives}
        />
      </Card>

      {#if game.recentWords.length}
        <div class="flex flex-wrap justify-center gap-1.5">
          {#each game.recentWords as word (word)}
            <span
              class="rounded-full border border-neutral-200 bg-white/70 px-2.5 py-0.5 text-xs text-neutral-600"
            >
              {word}
            </span>
          {/each}
        </div>
      {/if}

      <!-- ─────────────────────────────── over ──────────────────────────────── -->
    {:else}
      <Card class="flex flex-col items-center gap-3 p-8 text-center">
        <h1 class="text-3xl font-bold">Konec hry</h1>
        {#if winner}
          <p class="text-lg">
            Vyhrává <b>{winner.nickname}</b>{winner.deviceId === deviceId ? ' — to jsi ty!' : ''}
          </p>
        {/if}
        <p class="text-sm text-neutral-500">
          Obtížnost: {DIFFICULTY_LABEL[room.difficulty as Difficulty]} · celkem
          {game?.usedCount ?? 0} slov
        </p>
      </Card>

      <Card class="overflow-hidden">
        <PlayerList
          {players}
          myDeviceId={deviceId}
          hostDeviceId={room.hostDeviceId}
          startingLives={room.startingLives}
          showScore
        />
      </Card>

      {#if isHost}
        <Button variant="cta" size="xl" disabled={!canStart} onclick={start}>Hrát znovu</Button>
      {:else}
        <p class="text-center text-sm text-neutral-500">
          Čekáme, jestli zakladatel spustí další hru…
        </p>
      {/if}
      <Button variant="ghost" size="sm" onclick={leave}>Odejít z místnosti</Button>
    {/if}
  </div>
</main>

<JoinRoomDialog bind:open={joinOpen} initialCode={code} />
