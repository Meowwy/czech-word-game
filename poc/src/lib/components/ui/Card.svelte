<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.ts';

  type Props = { class?: string; children?: Snippet } & Omit<
    HTMLAttributes<HTMLDivElement>,
    'class'
  >;
  let { class: className = '', children, ...rest }: Props = $props();
</script>

<div class={cn('rounded-card border border-panel-line bg-panel/70 shadow-[0_6px_24px_rgba(0,0,0,0.35)]', className)} {...rest}>
  {@render children?.()}
</div>
