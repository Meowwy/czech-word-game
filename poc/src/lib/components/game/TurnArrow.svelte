<script lang="ts">
  import { untrack } from 'svelte';
  import { shortestTurn } from '$convex/rules';
  import { ARROW_URL } from '$lib/avatars.ts';

  type Props = {
    /** Where the current player sits, in seatAngle degrees. Null hides the arrow. */
    heading: number | null;
  };

  let { heading }: Props = $props();

  /** arrow.png is drawn pointing left, so an unrotated arrow already means 180°. */
  const ARROW_REST_DEG = 180;

  // The rotation is *accumulated*, never assigned from the heading directly.
  // Writing the raw angle into rotate() makes the arrow unwind the long way
  // whenever the value wraps — a hand-off from 350° to 10° would spin 340°
  // backwards through every other seat. Adding the shortest signed delta keeps
  // it taking the short path and lets the number run past 360 forever.
  let angle = $state(0);

  $effect(() => {
    if (heading === null) return;
    const target = heading - ARROW_REST_DEG;
    untrack(() => {
      angle += shortestTurn(angle, target);
    });
  });
</script>

<!-- Behind the bomb, centred on it, so the shaft crosses the middle and only the
     head reaches out towards whoever is up.

     Between rounds there is nobody to point at, so rather than disappear it
     turns on the spot — the table reads as waiting for the bomb to pick someone,
     and the moment a round starts the spin resolves into a heading. -->
{#if heading === null}
  <img
    src={ARROW_URL}
    alt=""
    aria-hidden="true"
    class="debu-decor pointer-events-none absolute top-1/2 left-1/2 w-[min(46%,340px)] origin-center opacity-70 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] [animation:debu-arrow-idle_5s_linear_infinite]"
  />
{:else}
  <img
    src={ARROW_URL}
    alt=""
    aria-hidden="true"
    class="pointer-events-none absolute top-1/2 left-1/2 w-[min(46%,340px)] origin-center drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-transform duration-[420ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]"
    style="transform: translate(-50%, -50%) rotate({angle}deg)"
  />
{/if}
