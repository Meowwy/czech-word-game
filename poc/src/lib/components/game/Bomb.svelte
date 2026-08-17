<script lang="ts">
  import { BOMB_URL } from '$lib/avatars.ts';

  type Props = {
    /** The prompt printed on the bomb. Empty while nothing is being played. */
    substring: string;
    /**
     * A round is running. The bomb stops drifting and starts twitching: an
     * object that hangs in the air reads as an ornament, and the moment the fuse
     * is lit it has to read as a thing about to go off. See `debu-bomb-tick` —
     * the rate is constant either way, because a pulse that quickened with the
     * deadline would leak the hidden fuse.
     */
    playing?: boolean;
    /** Bumped by the parent on every pass; drives the handover hop. */
    passSeq: number;
    /** Bumped by the parent on every detonation; drives the blast. */
    blastSeq: number;
  };

  let { substring, playing = false, passSeq, blastSeq }: Props = $props();
</script>

<!-- One size, set once and inherited: the bomb, the shockwave ring, the twitch
     box and the image itself all have to agree, and four copies of the same two
     numbers is four places to miss when it changes. -->
<div class="relative grid size-[var(--bomb)] place-items-center [--bomb:104px] sm:[--bomb:120px]">
  <!-- The shockwave. Keyed so each detonation gets a fresh element and replays
       the animation; without the key the class is already applied and nothing
       moves on the second explosion. -->
  {#key blastSeq}
    {#if blastSeq > 0}
      <span
        class="debu-decor pointer-events-none absolute size-[var(--bomb)] rounded-full border-4 border-gold [animation:debu-blast-ring_0.7s_ease-out_forwards]"
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
          <!-- Two elements rather than one because the ambient motion and the
               one-shots run on different schedules and would overwrite each
               other's transform if they shared an element. The outer one is the
               idle drift and exists only before a round: once the fuse is lit
               the bomb is planted, and all that is left is the twitch below. -->
          <div
            class="debu-decor grid place-items-center"
            class:animate-[debu-bomb-float_3.6s_ease-in-out_infinite]={!playing}
          >
            <div
              class="debu-decor relative grid size-[var(--bomb)] place-items-center"
              class:animate-[debu-bomb-tick_0.42s_ease-in-out_infinite]={playing}
            >
              <img
                src={BOMB_URL}
                alt=""
                width="120"
                height="120"
                class="size-[var(--bomb)] drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
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
                      class="font-display text-xl leading-none font-bold tracking-wide text-ink uppercase [animation:debu-prompt-in_0.3s_ease-out] sm:text-2xl"
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
