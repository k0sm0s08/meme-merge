import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { chromium } from 'playwright-core';

// Convert local cutouts to compact, genuine RGBA PNGs. Originals are never overwritten.
const input = resolve(process.argv[2] || 'artwork/cutouts');
const output = resolve(process.argv[3] || 'public/assets/memes');
if (input === output) throw new Error('Папки оригиналов и результата должны различаться.');
const files = (await readdir(input)).filter((name) => /^meme-(0[1-9]|1[01])\.(png|jpe?g)$/i.test(name)).sort();
if (!files.length) throw new Error(`Нет изображений в ${input}`);
let browser;
let logs = '';
const port = 4176;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--base', '/', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
vite.stdout.on('data', (chunk) => { logs += chunk.toString(); });
vite.stderr.on('data', (chunk) => { logs += chunk.toString(); });
const sources = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
    if (!files.includes(name) || basename(name) !== name) { res.writeHead(404).end(); return; }
    const data = await readFile(resolve(input, name));
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((accept) => sources.listen(0, '127.0.0.1', accept));
const sourcePort = sources.address().port;
try {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (vite.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
    if (attempt === 149) throw new Error('Vite не запустился');
    await new Promise((accept) => setTimeout(accept, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  const prepared = await page.evaluate(async ({ names, sourcePort }) => {
    const { prepareMemeSource } = await import('/src/ui/MemeArtwork.ts');
    const { LEVELS } = await import('/src/config/gameConfig.ts');
    const active = new Set(LEVELS.map(({ level }) => level));
    const activeNames = names.filter((name) => active.has(Number(name.match(/^meme-(\d+)/i)[1])));
    if (!activeNames.length) throw new Error('В исходниках нет активных уровней игры');
    const sprites = [];
    for (const name of activeNames) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = `http://127.0.0.1:${sourcePort}/${encodeURIComponent(name)}`;
      await image.decode();
      const cutout = prepareMemeSource(image).canvas;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = 496 / Math.max(cutout.width, cutout.height);
      const width = cutout.width * scale;
      const height = cutout.height * scale;
      ctx.drawImage(cutout, (512 - width) / 2, (512 - height) / 2, width, height);
      sprites.push({ name: name.replace(/\.(png|jpe?g)$/i, '.png'), data: canvas.toDataURL('image/png').split(',')[1] });
    }
    return sprites;
  }, { names: files, sourcePort });
  // Close the browser before writing public files, so HMR cannot interrupt preparation.
  await browser.close();
  browser = undefined;
  await mkdir(output, { recursive: true });
  for (const sprite of prepared) {
    const data = Buffer.from(sprite.data, 'base64');
    await writeFile(resolve(output, sprite.name), data);
    console.log(`${sprite.name}: RGBA PNG 512×512, ${Math.round(data.length / 1024)} КБ`);
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
  await new Promise((accept) => sources.close(accept));
}
