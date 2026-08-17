<script lang="ts">
  /**
   * The wordmark, shown in the middle of an empty table.
   *
   * The joke is in the middle of the name — *buch* is the bang — so the
   * typography puts it there: the syllable is set larger, in gold, on a lit
   * disc, arriving with a recoil while the quiet halves of the word slide in
   * around it. Everything is one line and sized in `clamp`, so it holds its
   * proportions from a narrow phone to a widescreen without wrapping.
   */
  type Props = {
    /** Sits under the wordmark — the room code hint. */
    subtitle?: string;
  };

  let { subtitle = '' }: Props = $props();
</script>

<div class="pointer-events-none flex flex-col items-center gap-3 text-center select-none">
  <h1
    class="debu-decor font-display flex items-baseline leading-none font-bold whitespace-nowrap [animation:debu-logo-sway_6s_ease-in-out_infinite]"
    style="font-size: clamp(2.1rem, 10.5vw, 4.5rem)"
  >
    <!-- The quiet halves. They arrive first and stay put; the bang lands on top
         of them a beat later. -->
    <span
      class="text-ink [animation:debu-logo-in_0.45s_ease-out_both] [text-shadow:0_3px_0_rgba(0,0,0,0.35)]"
      >de</span
    >

    <span class="relative inline-grid place-items-center">
      <!-- The lit disc behind the syllable. Blurred and behind, so the gold
           reads as light coming off the word rather than as a shape drawn
           around it. -->
      <span
        class="debu-decor pointer-events-none absolute size-[1.5em] rounded-full bg-gold/35 blur-xl [animation:debu-logo-glow_3.2s_ease-in-out_infinite]"
        aria-hidden="true"
      ></span>
      <span
        class="relative text-gold [animation:debu-logo-bang_0.62s_cubic-bezier(0.34,1.56,0.64,1)_0.18s_both] [text-shadow:0_4px_0_var(--color-gold-dim),0_0_28px_rgba(255,201,60,0.45)]"
        style="font-size: 1.28em">BUCH</span
      >
    </span>

    <span
      class="text-ink [animation:debu-logo-in_0.45s_ease-out_0.08s_both] [text-shadow:0_3px_0_rgba(0,0,0,0.35)]"
      >ánkovaná</span
    >
  </h1>

  {#if subtitle}
    <p
      class="max-w-xs text-sm text-ink-faint [animation:debu-logo-in_0.45s_ease-out_0.5s_both] sm:text-base"
    >
      {subtitle}
    </p>
  {/if}
</div>
