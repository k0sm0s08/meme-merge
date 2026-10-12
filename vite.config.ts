import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from './src/config/gameConfig.ts';

const availableMemes = LEVELS.map(({ level }) => level).filter((level) =>
  existsSync(fileURLToPath(new URL(`./public/assets/memes/meme-${String(level).padStart(2, '0')}.png`, import.meta.url))),
);

export default defineConfig({
  // Project Pages uses /meme-merge/; root hosts can set VITE_BASE_PATH=/.
  base: process.env.VITE_BASE_PATH ?? '/meme-merge/',
  define: { __MEME_ASSETS__: JSON.stringify(availableMemes) },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: (id) => id.includes('node_modules/phaser') ? 'phaser' : undefined },
    },
    chunkSizeWarningLimit: 1600,
  },
});
