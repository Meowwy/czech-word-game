<script lang="ts">
  import { base } from '$app/paths';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import LogOutIcon from '@lucide/svelte/icons/log-out';

  type Props = {
    code: string;
    round: number;
    /** When the running game started, epoch ms. Null between rounds. */
    startedAt: number | null;
    words: number;
    onleave: () => void;
  };

  let { code, round, startedAt, words, onleave }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout>;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${base}/r/${code}`);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  // Elapsed time, on a wall clock. There is no reactive source to derive this
  // from — the server sends a start instant, not a ticking value — so an
  // interval is the honest implementation. This is safe to show, unlike the
  // fuse: it counts up from a public timestamp and reveals nothing about when
  // the bomb goes off.
  let now = $state(Date.now());
  $effect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const elapsed = $derived.by(() => {
    if (startedAt === null) return null;
    const total = Math.max(0, Math.floor((now - startedAt) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
</script>

<header
  class="flex h-11 shrink-0 items-center gap-3 bg-gradient-to-b from-bar to-bar-dark px-3 text-bar-fg shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
>
  <a
    href="{base}/"
    class="font-display shrink-0 text-sm font-bold tracking-wide uppercase transition-opacity hover:opacity-80 sm:text-base"
  >
    Debuchánkovaná
  </a>

  <button
    type="button"
    onclick={copyLink}
    class="font-display flex items-center gap-1.5 rounded px-2 py-0.5 text-sm font-bold tracking-[0.2em] transition-colors hover:bg-white/15"
    title="Zkopírovat odkaz na místnost"
  >
    {code}
    {#if copied}
      <CheckIcon class="size-3.5" aria-label="zkopírováno" />
    {:else}
      <CopyIcon class="size-3.5 opacity-60" aria-hidden="true" />
    {/if}
  </button>

  <p class="ml-auto flex items-center gap-3 text-xs text-white/70 sm:text-sm">
    {#if round > 0}<span>kolo {round}</span>{/if}
    {#if elapsed}<span class="tabular-nums">{elapsed}</span>{/if}
    {#if words > 0}<span>{words} slov</span>{/if}
  </p>

  <button
    type="button"
    onclick={onleave}
    class="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-white/15"
  >
    <LogOutIcon class="size-3.5" aria-hidden="true" />
    <span class="hidden sm:inline">Odejít</span>
  </button>
</header>
