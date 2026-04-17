import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: 'https://forjalabs.cl',
  output: "hybrid",
  adapter: cloudflare()
});