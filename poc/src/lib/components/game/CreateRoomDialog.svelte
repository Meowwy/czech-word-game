<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { getDeviceId, getNickname, setNickname } from '$lib/device.ts';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const client = useConvexClient();

  let nickname = $state(getNickname());
  let error = $state('');
  let busy = $state(false);

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    const name = nickname.trim();
    if (!name) {
      error = 'Napiš svoji přezdívku.';
      return;
    }

    busy = true;
    error = '';
    try {
      const result = await client.mutation(api.rooms.createRoom, {
        deviceId: getDeviceId(),
        nickname: name,
      });
      if (!result.ok) {
        error = 'Místnost se nepodařilo vytvořit. Zkus to prosím znovu.';
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

<Dialog bind:open title="Nová místnost" description="Založ hru a pošli kód ostatním.">
  <form class="flex flex-col gap-4" onsubmit={create}>
    <div class="flex flex-col gap-1.5">
      <Label for="create-nickname">Tvoje přezdívka</Label>
      <Input
        id="create-nickname"
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
        {busy ? 'Zakládám…' : 'Vytvořit místnost'}
      </Button>
    </div>
  </form>
</Dialog>
