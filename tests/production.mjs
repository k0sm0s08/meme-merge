import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
await stat(resolve(root, 'index.html'));
const configuredBase = process.env.VITE_BASE_PATH ?? '/meme-merge/';
const prefix = configuredBase.startsWith('/') ? configuredBase : '/release/meme-merge/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = pathname.slice(prefix.length) || 'index.html';
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const errors = [];
const external = [];
const loadedMemes = new Set();
let browser;
const executedAt = new Date().toISOString();
await mkdir('test-results', { recursive: true });
await writeFile('test-results/production.json', JSON.stringify({ status: 'running', executedAt }));
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (req) => errors.push(`${req.url()} ${req.failure().errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && path.startsWith(prefix + 'assets/memes/')) loadedMemes.add(path);
  });
  page.on('request', (req) => {
    const destination = new URL(req.url());
    // Phaser decodes downloaded textures through blob URLs belonging to this origin.
    if (destination.protocol !== 'data:' && destination.origin !== origin) external.push(req.url());
  });
  await page.goto(origin + prefix);
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => '__MEME_TEST__' in window), false);
  assert.equal(await page.locator('#loading').count(), 0);
  assert.deepEqual([...loadedMemes].sort(), [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].map((level) => `${prefix}assets/memes/meme-${String(level).padStart(2, '0')}.png`));
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.locator('#score').waitFor();
  for (let i = 0; i < 20; i++) {
    await page.mouse.click(195, 460);
    await page.waitForTimeout(470);
    const score = Number((await page.locator('#score').innerText()).replace(/\s/g, ''));
    if (score > 0) break;
  }
  const score = Number((await page.locator('#score').innerText()).replace(/\s/g, ''));
  assert.ok(score > 0, 'В production происходят слияния и начисляются очки');
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/production-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(150);
  const stage = await page.locator('#stage').boundingBox();
  assert.ok(stage.width < 1440 && Math.abs(stage.x + stage.width / 2 - 720) < 2);
  await page.screenshot({ path: 'test-results/production-desktop.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile('test-results/production.json', JSON.stringify({ status: 'passed', executedAt, score, nestedPath: prefix, loadedMemes: [...loadedMemes].sort(), viewports: ['390x844', '1440x1000'], externalRequests: external, errors, testApiAbsent: true }, null, 2));
  console.log(`✓ Production: ${prefix}, все 10 PNG загружены, слияния и пауза работают, мобильный и desktop-размеры, нет внешних запросов и тестового API.`);
} catch (error) {
  console.error(error);
  await writeFile('test-results/production.json', JSON.stringify({ status: 'failed', executedAt, error: String(error), externalRequests: external, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
