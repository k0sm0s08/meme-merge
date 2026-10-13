import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const root = resolve('dist-yandex');
let bytes = 0;
let files = 0;
let sdkIncluded = false;
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    assert.match(relative(root, path), /^[a-zA-Z0-9_./-]+$/, 'Имена файлов должны быть без пробелов и кириллицы');
    if (entry.isDirectory()) await walk(path);
    else {
      bytes += (await stat(path)).size; files++;
      if (entry.name.endsWith('.js')) {
        const source = await readFile(path, 'utf8');
        sdkIncluded ||= source.includes('/sdk.js') && source.includes('showRewardedVideo');
        assert.ok(!source.includes('__MEME_TEST__'), 'Тестовый API не должен попадать в релиз');
        assert.ok(!source.includes('/meme-merge/assets/'), 'Пути GitHub Pages не должны попадать в Яндекс-сборку');
      }
    }
  }
}
await walk(root);
assert.ok(sdkIncluded, 'В Яндекс-сборке требуется SDK и rewarded video');
assert.ok(bytes < 100 * 1024 * 1024, 'Распакованная сборка должна быть меньше 100 МБ');
assert.ok(!(await readdir(root)).includes('artwork'), 'Исходные архивы не входят в игру');
console.log(`✓ Yandex Games: index.html в корне, SDK, относительные пути, ${files} файлов, ${(bytes / 1024 / 1024).toFixed(2)} МБ до сжатия.`);
