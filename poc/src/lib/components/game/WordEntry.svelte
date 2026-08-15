<script lang="ts">
  import { base } from '$app/paths';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import Input from '$lib/components/ui/Input.svelte';

  type Props = {
    code: string;
    deviceId: string;
    substring: string;
    myTurn: boolean;
  };

  // The parent wraps this in {#key game.turnSeq}, so a new turn remounts the
  // component and `value`/`message` reset themselves. That is why there is no
  // effect here resetting state when the prompt changes.
  let { code, deviceId, substring, myTurn }: Props = $props();

  const client = useConvexClient();

  let value = $state('');
  let message = $state('');
  let shake = $state(false);
  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;

  const REASONS: Record<string, string> = {
    'no-substring': 'tohle tam není',
    'not-a-word': 'takové slovo neznám',
    used: 'to už padlo',
    'not-your-turn': 'teď je na řadě někdo jiný',
  };

  function reject(why: string) {
    message = why;
    shake = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (shake = false), 320);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const word = value.trim().toLowerCase();
    if (!word || busy || !myTurn) return;

    // Cheap local check first, so an obvious miss costs no round trip at all.
    if (!word.includes(substring)) {
      reject(`neobsahuje „${substring}“`);
      return;
    }

    busy = true;
    try {
      // The 48MB word list lives in the Netlify function; Convex cannot reach it.
      const res = await fetch(`${base}/api/game/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word, substring }),
      });
      const check = await res.json();

      if (!check.ok) {
        reject(REASONS[check.reason] ?? 'takové slovo neznám');
        value = '';
        return;
      }

      const result = await client.mutation(api.game.submitWord, { code, deviceId, word });
      if (result.ok) {
        value = '';
        message = '';
      } else {
        reject(REASONS[result.reason] ?? 'nešlo to');
        value = '';
      }
    } catch {
      reject('chyba spojení');
    } finally {
      busy = false;
    }
  }

  // Take the caret without the player ever reaching for the mouse. Reads state,
  // assigns none.
  $effect(() => {
    if (myTurn) inputEl?.focus();
  });
</script>

<form onsubmit={submit} class="flex flex-col items-center gap-2">
  <Input
    bind:ref={inputEl}
    bind:value
    disabled={!myTurn}
    autocomplete="off"
    autocapitalize="off"
    spellcheck={false}
    placeholder={myTurn ? 'piš sem…' : 'čekej, až na tebe přijde řada'}
    class={[
      'h-12 max-w-md text-center text-lg',
      shake && 'animate-[debu-shake_0.32s] border-red-500',
    ]
      .filter(Boolean)
      .join(' ')}
  />
  <p class="min-h-5 text-sm text-red-600" class:opacity-0={!message}>{message || ' '}</p>
</form>

