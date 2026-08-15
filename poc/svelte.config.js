import adapter from '@sveltejs/adapter-netlify';

export default {
  kit: {
    // edge:false -> Node-based Netlify Functions. Edge Functions are Deno, cannot
    // use node:fs, and cap total memory at 512MB — the 48MB word index needs Node.
    adapter: adapter({ edge: false, split: false }),

    // The game is served from pavel-koleckar.cz/slovni-hra, not a domain root, so
    // every internal link, asset URL and fetch has to carry this prefix. Import
    // `base` from '$app/paths' rather than writing absolute paths by hand — a bare
    // "/api/game/check" would escape the prefix and 404 in production while still
    // working in dev if this were empty.
    paths: { base: '/slovni-hra' },

    // convex/ sits outside src/, so give it an alias rather than ../../../../.
    alias: { $convex: './convex' },
  },
};
