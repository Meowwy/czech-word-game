<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { BOMB_URL } from '$lib/avatars.ts';
  import { CODE_LENGTH, isValidCode } from '$convex/rules';
  import CreateRoomPanel from '$lib/components/game/CreateRoomPanel.svelte';
  import RoomBrowser from '$lib/components/game/RoomBrowser.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  let joinCode = $state('');
  const normalized = $derived(joinCode.trim().toUpperCase());

  // No lookup and no error state: an unknown code lands on the room page, which
  // already knows how to say the room does not exist.
  async function join(event: SubmitEvent) {
    event.preventDefault();
    if (!isValidCode(normalized)) return;
    await goto(`${base}/r/${normalized}`);
  }
</script>

<svelte:head>
  <title>Debuchánkovaná</title>
  <meta
    name="description"
    content="Napiš české slovo, které obsahuje daná písmena, dřív než bouchne bomba."
  />
</svelte:head>

<main class="debu-arena-bg min-h-dvh px-4 py-10">
  <div class="mx-auto flex w-full max-w-2xl flex-col items-center gap-8">
    <header class="flex flex-col items-center gap-3 text-center">
      <img
        src={BOMB_URL}
        alt=""
        width="120"
        height="120"
        class="debu-decor size-[120px] drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)] [animation:debu-bomb-float_3.6s_ease-in-out_infinite]"
      />
      <h1 class="font-display text-5xl leading-none font-bold text-ink sm:text-6xl">
        deBUCHánkovaná
      </h1>
      <p class="max-w-md text-ink-dim">
        Napiš české slovo, které obsahuje daná písmena — dřív, než bouchne bomba.
      </p>
      <p class="text-sm text-ink-faint">Nevíš, kolik času ti zbývá. To je na tom to nejlepší.</p>
    </header>

    <!-- Creation sits at the top and is inline rather than behind a modal: on the
         old lobby, starting a game was a button that opened a dialog that asked
         for a name you had already given. -->
    <CreateRoomPanel />

    <RoomBrowser />

    <form class="flex w-full items-end justify-center gap-2" onsubmit={join}>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-ink-dim">Znáš kód?</span>
        <Input
          bind:value={joinCode}
          maxlength={CODE_LENGTH}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck={false}
          placeholder="ABCD"
          class="w-32 text-center font-display text-lg tracking-[0.3em] uppercase"
        />
      </label>
      <Button type="submit" variant="outline" size="default" disabled={!isValidCode(normalized)}>
        Připojit se
      </Button>
    </form>

    <a
      class="text-sm text-ink-faint underline-offset-4 hover:text-ink-dim hover:underline"
      href="{base}/test"
    >
      hrát sám na zkoušku →
    </a>
  </div>
</main>
