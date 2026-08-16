<script lang="ts">
  type Props = {
    lives: number;
    max: number;
    /** Replays the break animation; the parent flips this when a life is spent. */
    breaking?: boolean;
  };

  let { lives, max, breaking = false }: Props = $props();
</script>

<!-- Hearts ride the top edge of the avatar rather than sitting under the name,
     so a full row still reads at a glance when eight seats are on screen. -->
<span class="flex items-center justify-center gap-0.5" aria-label="životy: {lives} z {max}">
  {#each { length: max } as _, i (i)}
    {@const full = i < lives}
    <svg
      viewBox="0 0 24 24"
      class="size-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
      class:animate-[debu-heart-break_0.45s_ease-out]={breaking && i === lives}
      aria-hidden="true"
    >
      <path
        d="M12 21s-7.5-4.7-9.4-9.1C1.1 8.4 3 5 6.4 5c2 0 3.4 1.1 4.3 2.3l1.3 1.6 1.3-1.6C14.2 6.1 15.6 5 17.6 5 21 5 22.9 8.4 21.4 11.9 19.5 16.3 12 21 12 21z"
        fill={full ? 'var(--color-heart)' : 'var(--color-heart-out)'}
        stroke="rgba(0,0,0,0.35)"
        stroke-width="1"
      />
    </svg>
  {/each}
</span>
