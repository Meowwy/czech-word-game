<script lang="ts">
  import { base } from '$app/paths';
  import CreateRoomDialog from '$lib/components/game/CreateRoomDialog.svelte';
  import JoinRoomDialog from '$lib/components/game/JoinRoomDialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let createOpen = $state(false);
  let joinOpen = $state(false);
</script>

<svelte:head>
  <title>Debuchánkovaná</title>
  <meta name="description" content="Česká slovní hra pro partu — napiš slovo, než bouchne bomba." />
</svelte:head>

<main
  class="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6"
>
  <div class="flex w-full max-w-md flex-col items-center gap-8 text-center">
    <div class="flex flex-col gap-3">
      <h1 class="text-5xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
        Debuchánkovaná
      </h1>
      <p class="text-lg text-neutral-600">
        Napiš české slovo, které obsahuje daná písmena — dřív, než bouchne bomba.
      </p>
      <p class="text-sm text-neutral-500">
        Nevíš, kolik času ti zbývá. To je na tom to nejlepší.
      </p>
    </div>

    <div class="flex w-full flex-col gap-3">
      <Button variant="cta" size="xl" onclick={() => (createOpen = true)}>
        Vytvořit místnost
      </Button>
      <Button variant="outline" size="xl" onclick={() => (joinOpen = true)}>
        Připojit se ke hře
      </Button>
    </div>

    <a class="text-sm text-neutral-500 underline-offset-4 hover:underline" href="{base}/test">
      hrát sám na zkoušku →
    </a>
  </div>
</main>

<CreateRoomDialog bind:open={createOpen} />
<JoinRoomDialog bind:open={joinOpen} />
