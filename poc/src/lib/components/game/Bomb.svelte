<script lang="ts">
  import { BOMB_URL } from '$lib/avatars.ts';

  type Props = {
    /** The prompt printed on the bomb. Empty while nothing is being played. */
    substring: string;
    /** Bumped by the parent on every pass; drives the handover hop. */
    passSeq: number;
    /** Bumped by the parent on every detonation; drives the blast. */
    blastSeq: number;
  };

  let { substring, passSeq, blastSeq }: Props = $props();
</script>

<div class="relative grid size-[120px] place-items-center sm:size-[140px]">
  <!-- The shockwave. Keyed so each detonation gets a fresh element and replays
       the animation; without the key the class is already applied and nothing
       moves on the second explosion. -->
  {#key blastSeq}
    {#if blastSeq > 0}
      <span
        class="debu-decor pointer-events-none absolute size-[120px] rounded-full border-4 border-gold [animation:debu-blast-ring_0.7s_ease-out_forwards] sm:size-[140px]"
        aria-hidden="true"
      ></span>
    {/if}
  {/key}

  <!-- Two nested elements because two animations run at once on different
       schedules: the float never stops, the hop and the blast are one-shot.
       Sharing one element would mean the second transform overwriting the first. -->
  {#key blastSeq}
    <div
      class="debu-decor grid place-items-center"
      class:animate-[debu-bomb-blast_0.6s_ease-out]={blastSeq > 0}
    >
      {#key passSeq}
        <div
          class="debu-decor grid place-items-center"
          class:animate-[debu-bomb-pass_0.45s_cubic-bezier(0.34,1.56,0.64,1)]={passSeq > 0}
        >
          <!-- Float and beat are separate elements: they run at different
               tempos and would overwrite each other's transform if they shared
               one. -->
          <div
            class="debu-decor grid place-items-center [animation:debu-bomb-float_3.6s_ease-in-out_infinite]"
          >
            <div
              class="debu-decor relative grid size-[120px] place-items-center [animation:debu-bomb-beat_1.4s_ease-in-out_infinite] sm:size-[140px]"
            >
              <img
                src={BOMB_URL}
                alt=""
                width="120"
                height="120"
                class="size-[120px] drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)] sm:size-[140px]"
              />

              <!-- The sphere in bomb.png is not centred in its own box — the
                   fuse pushes it down and left — so the label is placed on the
                   ball, not on the image. -->
              <div
                class="pointer-events-none absolute top-[57%] left-[43%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              >
                {#if substring}
                  {#key substring}
                    <span
                      class="font-display text-2xl leading-none font-bold tracking-wide text-ink uppercase [animation:debu-prompt-in_0.3s_ease-out] sm:text-[28px]"
                    >
                      {substring}
                    </span>
                  {/key}
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/key}
    </div>
  {/key}
</div>
