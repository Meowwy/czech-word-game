<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { getDeviceId, getNickname, setNickname } from '$lib/device.ts';
  import { CODE_LENGTH, isValidCode } from '$convex/rules';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';

  let { open = $bindable(false), initialCode = '' }: { open?: boolean; initialCode?: string } =
    $props();

  const client = useConvexClient();

  // `initialCode` is prefilled from the URL when you arrive on a shared link.
  // Kept as a null-until-typed override rather than $state(initialCode), which
  // would capture only the first value and go stale if the prop changed.
  let typedCode = $state<string | null>(null);
  const code = $derived(typedCode ?? initialCode);

  let nickname = $state(getNickname());
  let error = $state('');
  let busy = $state(false);

  const REASONS: Record<string, string> = {
    'not-found': 'Místnost s tímto kódem neexistuje.',
    'in-progress': 'V této místnosti už se hraje.',
    full: 'Místnost je plná.',
    'nickname-taken': 'Tuhle přezdívku už někdo v místnosti má.',
    nickname: 'Napiš svoji přezdívku.',
    code: 'Kód má čtyři písmena.',
  };

  async function join(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    const roomCode = code.trim().toUpperCase();
    const name = nickname.trim();

    if (!isValidCode(roomCode)) {
      error = REASONS.code;
      return;
    }
    if (!name) {
      error = REASONS.nickname;
      return;
    }

    busy = true;
    error = '';
    try {
      const result = await client.mutation(api.rooms.joinRoom, {
        code: roomCode,
        deviceId: getDeviceId(),
        nickname: name,
      });
      if (!result.ok) {
        error = REASONS[result.reason] ?? 'Připojení se nezdařilo.';
        return;
      }
      setNickname(name);
      open = false;
      await goto(`${base}/r/${result.code}`);
    } catch {
      error = 'Nepodařilo se spojit se serverem.';
    } finally {
      busy = false;
    }
  }
</script>

<Dialog bind:open title="Připojit se ke hře" description="Zadej kód místnosti od kamaráda.">
  <form class="flex flex-col gap-4" onsubmit={join}>
    <div class="flex flex-col gap-1.5">
      <Label for="join-code">Kód místnosti</Label>
      <Input
        id="join-code"
        bind:value={() => code, (v) => (typedCode = v)}
        maxlength={CODE_LENGTH}
        autocapitalize="characters"
        autocomplete="off"
        spellcheck={false}
        placeholder="ABCD"
        class="text-center text-2xl font-bold tracking-[0.4em] uppercase"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <Label for="join-nickname">Tvoje přezdívka</Label>
      <Input
        id="join-nickname"
        bind:value={nickname}
        maxlength={20}
        autocomplete="nickname"
        placeholder="např. Katka"
      />
    </div>

    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onclick={() => (open = false)}>Zrušit</Button>
      <Button type="submit" variant="cta" disabled={busy}>
        {busy ? 'Připojuji…' : 'Připojit se'}
      </Button>
    </div>
  </form>
</Dialog>
