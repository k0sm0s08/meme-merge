import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

// Render the real production UI; no simulated gameplay or altered screenshots in the listing.
const root = resolve('dist');
const output = resolve('publishing/yandex');
const prefix = '/meme-merge/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
let browser;
try {
  await mkdir(output, { recursive: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, reducedMotion: 'reduce' });
  // Use the existing favicon at its vector resolution for the catalogue icon.
  await page.goto(origin + prefix + 'assets/ui/favicon.svg');
  await page.screenshot({ path: resolve(output, 'icon-512.png') });
  await page.setViewportSize({ width: 800, height: 470 });
  await page.goto(origin + prefix);
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'cover-800x470.png') });
  await page.setViewportSize({ width: 540, height: 960 });
  await page.reload();
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'screenshot-menu-540x960.png') });
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.locator('#score').waitFor();
  const field = await page.locator('canvas').boundingBox();
  if (!field) throw Error('No canvas');
  for (let i = 0; i < 18; i++) {
    await page.mouse.click(field.x + field.width * (.25 + (i % 5) * .12), field.y + field.height * .55);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(output, 'screenshot-game-540x960.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(output, 'screenshot-desktop-1280x720.png') });
  console.log('✓ Catalogue icon, cover and three actual production screenshots saved in publishing/yandex/.');
} finally { await browser?.close(); await new Promise((accept) => server.close(accept)); }
