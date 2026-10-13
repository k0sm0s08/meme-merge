import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const base = process.argv[3] ?? process.env.VITE_BASE_PATH ?? '/meme-merge/';
const prefix = base.startsWith('/') ? base : '/release/meme-merge/';
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]*src="([^"]+)"/);
assert.ok(entry, 'В dist/index.html должен быть скрипт игры');
assert.ok(entry[1].startsWith(base), `Неверный base path: ${entry[1]}`);
for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = new URL(reference, `https://build.invalid${prefix}`);
  assert.equal(url.origin, 'https://build.invalid', `Внешний ресурс: ${reference}`);
  assert.ok(url.pathname.startsWith(prefix), `Ресурс вне base path: ${reference}`);
  const path = resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
  assert.ok(path.startsWith(root + '/'));
  assert.ok((await stat(path)).isFile(), `Ресурс отсутствует: ${reference}`);
}
const levels = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
const assets = [
  ...levels.map((level) => `assets/memes/meme-${String(level).padStart(2, '0')}.png`),
  'assets/backgrounds/left-overlay.webp', 'assets/backgrounds/right-overlay.webp',
  ...['01', '02', '03'].map((id) => `assets/audio/video-audio-${id}.mp3`),
];
for (const relative of assets) {
  const source = await readFile(resolve('public', relative));
  const built = await readFile(resolve(root, relative));
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
  assert.equal(hash(built), hash(source), `Ресурс повреждён или не соответствует исходнику: ${relative}`);
}
assert.ok(html.includes('Мелстрой мерж'), 'Название игры должно быть обновлено');
console.log(`✓ ${root}/index.html, base ${base}, JS/CSS/иконки, 10 мемов, 2 фотографии и 3 MP3 проверены.`);
