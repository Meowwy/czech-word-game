<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.ts';

  type Props = { class?: string; value?: string; ref?: HTMLInputElement | null } & Omit<
    HTMLInputAttributes,
    'class' | 'value'
  >;

  let { class: className = '', value = $bindable(''), ref = $bindable(null), ...rest }: Props =
    $props();
</script>

<input
  bind:this={ref}
  bind:value
  class={cn(
    'flex h-10 w-full min-w-0 rounded-md border border-panel-line bg-black/25 px-3 py-1 text-base',
    'text-ink transition-[color,box-shadow] outline-none placeholder:text-ink-faint',
    'focus-visible:border-gold-dim focus-visible:ring-[3px] focus-visible:ring-gold/25',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
  {...rest}
/>
