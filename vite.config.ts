import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from './src/config/gameConfig.ts';

const availableMemes = LEVELS.map(({ level }) => level).filter((level) =>
  existsSync(fileURLToPath(new URL(`./public/assets/memes/meme-${String(level).padStart(2, '0')}.png`, import.meta.url))),
);

export default defineConfig(({ mode }) => ({
  // Project Pages uses /meme-merge/; root hosts can set VITE_BASE_PATH=/.
  base: mode === 'yandex' ? './' : process.env.VITE_BASE_PATH ?? '/meme-merge/',
  define: { __MEME_ASSETS__: JSON.stringify(availableMemes), __YANDEX_GAMES__: mode === 'yandex' },
  build: {
    outDir: mode === 'yandex' ? 'dist-yandex' : 'dist',
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: (id) => id.includes('node_modules/phaser') ? 'phaser' : undefined },
    },
    chunkSizeWarningLimit: 1600,
  },
}));
