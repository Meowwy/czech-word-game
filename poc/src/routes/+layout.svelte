<script lang="ts">
  import { base } from '$app/paths';
  import '../app.css';
  import { setupConvex } from 'convex-svelte';
  import { PUBLIC_CONVEX_URL } from '$env/static/public';

  let { children } = $props();

  // STATIC, not dynamic. `convex deploy --cmd 'npm run build'` injects this into
  // the build subprocess only — it is NOT in the serverless function's runtime
  // environment, so $env/dynamic/public would read it as empty in production.
  // Static inlines it into the bundle at build time, which is what that flag is for.
  const convexUrl = PUBLIC_CONVEX_URL;
  if (convexUrl) setupConvex(convexUrl);
</script>

{#if convexUrl}
  {@render children()}
{:else}
  <main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-6">
    <h1 class="text-xl font-semibold">Chybí připojení k Convexu</h1>
    <p class="text-sm text-neutral-600">
      Není nastavená proměnná <code class="rounded bg-neutral-100 px-1">PUBLIC_CONVEX_URL</code>.
      Spusť jednou <code class="rounded bg-neutral-100 px-1">npx convex dev</code>, které projekt
      založí a proměnnou zapíše do <code class="rounded bg-neutral-100 px-1">.env.local</code>.
    </p>
    <p class="text-sm text-neutral-600">
      Jednohráčský test funguje i bez toho: <a class="underline" href="{base}/test">/test</a>
    </p>
  </main>
{/if}
