<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLLabelAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.ts';

  type Props = { class?: string; children?: Snippet } & Omit<HTMLLabelAttributes, 'class'>;
  let { class: className = '', children, ...rest }: Props = $props();
</script>

<label class={cn('text-sm font-medium text-neutral-700 select-none', className)} {...rest}>
  {@render children?.()}
</label>
