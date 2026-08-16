<script lang="ts">
  import CrownIcon from '@lucide/svelte/icons/crown';
  import { avatarUrl } from '$lib/avatars.ts';

  type Props = { nickname: string; avatar?: string; mine: boolean };

  let { nickname, avatar, mine }: Props = $props();
</script>

<!-- Takes the bomb's place at the centre when a round ends: the last thing that
     mattered belongs where everyone was already looking. -->
<div class="relative grid place-items-center">
  <span
    class="debu-decor pointer-events-none absolute size-40 rounded-full bg-[radial-gradient(circle,var(--color-gold)_0%,transparent_65%)] [animation:debu-winner-glow_2.4s_ease-in-out_infinite]"
    aria-hidden="true"
  ></span>

  <div
    class="debu-decor relative flex flex-col items-center gap-1.5 [animation:debu-winner-in_0.55s_cubic-bezier(0.34,1.56,0.64,1)]"
  >
    <CrownIcon class="size-8 text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" aria-hidden="true" />
    <img
      src={avatarUrl(avatar)}
      alt=""
      width="96"
      height="96"
      class="size-24 rounded-lg object-cover shadow-[0_0_36px_-4px_var(--color-gold)] ring-4 ring-gold"
    />
    <p class="font-display mt-1 text-2xl leading-tight font-bold text-ink">{nickname}</p>
    <p class="font-display text-sm font-semibold tracking-wide text-gold uppercase">
      {mine ? 'vyhráváš!' : 'vyhrává'}
    </p>
  </div>
</div>
