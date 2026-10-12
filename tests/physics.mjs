import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = 'http://127.0.0.1:4177';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--base', '/', '--port', '4177', '--strictPort'], { env: { ...process.env, VITE_TEST_MODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', (data) => { output += data; });
server.stderr.on('data', (data) => { output += data; });
const results = [];
const errors = [];
let browser;
let page;
let geometry;
let stress;
let floors;
let mixed;
await mkdir('test-results', { recursive: true });
const check = async (name, action) => {
  try { await action(); results.push({ name, status: 'passed' }); console.log(`✓ ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: String(error) }); await page?.screenshot({ path: 'test-results/physics-failure.png' }); throw error; }
};
const snap = () => page.evaluate(() => window.__MEME_TEST__.snapshot());
const fixture = (data) => page.evaluate((data) => window.__MEME_TEST__.fixture(data), data);
const advance = (count) => page.evaluate((count) => { for (let i = 0; i < count; i++) window.__MEME_TEST__.manualStep(1000 / 60); }, count);
const visible = () => page.evaluate(async () => {
  const state = window.__MEME_TEST__.snapshot();
  const bounds = [];
  for (const ball of state.balls) {
    const image = new Image(); image.src = window.__MEME_TEST__.textureData(ball.level); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = image.width;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const cosine = Math.cos(ball.visualAngle), sine = Math.sin(ball.visualAngle);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 64) continue;
      const dx = ((x + 0.5) / canvas.width - ball.originX) * ball.visualDiameter;
      const dy = ((y + 0.5) / canvas.height - ball.originY) * ball.visualDiameter;
      const wx = ball.visualX + dx * cosine - dy * sine;
      const wy = ball.visualY + dx * sine + dy * cosine;
      minX = Math.min(minX, wx); minY = Math.min(minY, wy); maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy);
    }
    bounds.push({ level: ball.level, id: ball.id, minX, minY, maxX, maxY });
  }
  return bounds;
});

try {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i === 149) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.waitForFunction(() => window.__MEME_TEST__?.gameActive());
  await check('Отладка физики выключена по умолчанию', async () => assert.equal((await snap()).debugPhysics, false));
  await check('Альфа-контур всех 10 фото совпадает с составным хитбоксом', async () => {
    geometry = await page.evaluate(async () => {
      const state = window.__MEME_TEST__.snapshot();
      const report = [];
      const distance = (x, y, a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
      };
      for (const shape of state.shapes) {
        const image = new Image(); image.src = window.__MEME_TEST__.textureData(shape.level); await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = image.width;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const mask = document.createElement('canvas'); mask.width = mask.height = canvas.width;
        const physics = mask.getContext('2d', { willReadFrequently: true });
        const parts = shape.parts.map((part) => part.map((point) => ({ x: (point.x / shape.diameter + shape.originX) * canvas.width, y: (point.y / shape.diameter + shape.originY) * canvas.height })));
        for (const part of parts) { physics.beginPath(); part.forEach((p, i) => i ? physics.lineTo(p.x, p.y) : physics.moveTo(p.x, p.y)); physics.closePath(); physics.fill(); }
        const collider = physics.getImageData(0, 0, mask.width, mask.height).data;
        let visibleCount = 0, colliderCount = 0, intersection = 0, edgeError = 0;
        let left = 256, top = 256, right = 0, bottom = 0;
        for (let y = 1; y < 255; y++) for (let x = 1; x < 255; x++) {
          const p = y * 256 + x;
          const occupied = alpha[p * 4 + 3] >= 64;
          const solid = collider[p * 4 + 3] >= 128;
          if (solid) colliderCount++;
          if (!occupied) continue;
          visibleCount++;
          if (solid) intersection++;
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          if ([p - 1, p + 1, p - 256, p + 256].some((p) => alpha[p * 4 + 3] < 64)) {
            let nearest = Infinity;
            for (const part of parts) for (let i = 0; i < part.length; i++) nearest = Math.min(nearest, distance(x + 0.5, y + 0.5, part[i], part[(i + 1) % part.length]));
            edgeError = Math.max(edgeError, nearest * shape.diameter / 256);
          }
        }
        report.push({ level: shape.level, diameter: shape.diameter, visibleWidth: (right - left) * shape.diameter / 256, visibleHeight: (bottom - top) * shape.diameter / 256, colliderWidth: shape.bounds.maxX - shape.bounds.minX, colliderHeight: shape.bounds.maxY - shape.bounds.minY, precision: intersection / colliderCount, recall: intersection / visibleCount, maxEdgeError: edgeError, parts: shape.parts.length, contourVertices: shape.contour.length, tolerance: shape.tolerance });
      }
      return report;
    });
    assert.equal(geometry.length, 10);
    for (const item of geometry) {
      assert.ok(item.precision > 0.95 && item.recall > 0.95, JSON.stringify(item));
      assert.ok(item.maxEdgeError < 2.6, JSON.stringify(item));
      assert.ok(Math.abs(item.visibleWidth - item.colliderWidth) < 2 && Math.abs(item.visibleHeight - item.colliderHeight) < 2, JSON.stringify(item));
      assert.ok(item.parts <= 18 && item.contourVertices <= 48);
    }
  });
  await check('Origin и преобразование всех частей совпадают со спрайтом при 0°, 26° и 90°', async () => {
    for (const shape of (await snap()).shapes) for (const angle of [0, Math.PI / 7, Math.PI / 2]) {
      await fixture([{ level: shape.level, x: 195, y: 480, static: true, angle }]);
      await advance(2);
      const ball = (await snap()).balls[0];
      assert.ok(Math.abs(ball.visualX - ball.x) < 1e-7 && Math.abs(ball.visualY - ball.y) < 1e-7);
      assert.ok(Math.abs(ball.visualAngle - ball.angle) < 1e-7);
      for (const [i, part] of shape.parts.entries()) for (const [j, point] of part.entries()) {
        const expected = { x: ball.x + point.x * Math.cos(angle) - point.y * Math.sin(angle), y: ball.y + point.x * Math.sin(angle) + point.y * Math.cos(angle) };
        assert.ok(Math.hypot(ball.parts[i][j].x - expected.x, ball.parts[i][j].y - expected.y) < 1e-6);
      }
    }
  });
  await check('Силуэты не сливаются через пустое место прежнего круглого хитбокса', async () => {
    await fixture([{ level: 1, x: 180, y: 500 }, { level: 1, x: 207, y: 500 }]);
    const score = (await snap()).score;
    await advance(10);
    assert.equal((await snap()).balls.length, 2);
    assert.equal((await snap()).score, score);
    await fixture([{ level: 1, x: 190, y: 600 }, { level: 1, x: 202, y: 600 }]);
    await advance(30);
    assert.equal((await snap()).balls.length, 1);
    assert.equal((await snap()).balls[0].level, 2);
    assert.equal((await snap()).score, score + 4);
    assert.equal((await snap()).bodies, 4);
  });
  await check('Все 10 силуэтов касаются пола видимым краем без проваливания', async () => {
    floors = [];
    for (const shape of (await snap()).shapes) {
      await fixture([{ level: shape.level, x: 195, y: 500 }]);
      await advance(210);
      const ball = (await snap()).balls[0];
      const image = (await visible())[0];
      const physicsBottom = Math.max(...ball.vertices.map((point) => point.y));
      const item = { level: shape.level, physicsBottom, visibleBottom: image.maxY, speed: ball.speed };
      floors.push(item);
      assert.ok(physicsBottom <= 718.8, JSON.stringify(item));
      assert.ok(Math.abs(718 - image.maxY) < 2.8, JSON.stringify(item));
      assert.ok(ball.speed < 0.12, JSON.stringify(item));
    }
  });
  await check('Маленький и большой мемы укладываются вместе и создают реальные контакты', async () => {
    await fixture([{ level: 11, x: 195, y: 620 }, { level: 1, x: 90, y: 420 }, { level: 2, x: 130, y: 420 }, { level: 3, x: 175, y: 420 }, { level: 4, x: 220, y: 420 }, { level: 5, x: 280, y: 420 }]);
    await advance(240);
    const state = await snap();
    assert.equal(state.balls.length, 6);
    assert.equal(state.ended, false);
    for (const ball of state.balls) assert.ok(ball.speed < 0.25);
    const contacts = await page.evaluate(() => window.__MEME_TEST__.contacts());
    assert.ok(contacts.some((pair) => pair.aLabel !== 'wall' && pair.bLabel !== 'wall'));
    mixed = { maxPenetration: Math.max(...contacts.map((pair) => pair.depth)), contacts: contacts.length };
    assert.ok(mixed.maxPenetration < 1, JSON.stringify(mixed));
    const images = await visible();
    assert.ok(images.every((image) => image.minX >= 26 && image.maxX <= 364 && image.maxY <= 720));
    await page.screenshot({ path: 'test-results/physics-normal-desktop.png' });
  });
  await check('45 объектов: ограниченная нагрузка, конечные координаты и отсутствие невидимых тел', async () => {
    await fixture(Array.from({ length: 45 }, (_, i) => ({ level: i % 5 + 1, x: 55 + i % 7 * 43, y: 675 - Math.floor(i / 7) * 54 })));
    stress = await page.evaluate(() => {
      const timings = [];
      for (let i = 0; i < 180; i++) { const start = performance.now(); window.__MEME_TEST__.manualStep(1000 / 60); timings.push(performance.now() - start); }
      timings.sort((a, b) => a - b);
      const state = window.__MEME_TEST__.snapshot();
      return { initialObjects: 45, finalObjects: state.balls.length, bodies: state.bodies, score: state.score, ended: state.ended, p95FrameMs: timings[Math.floor(timings.length * .95)], maxFrameMs: Math.max(...timings), allFinite: state.balls.every((ball) => Number.isFinite(ball.x) && Number.isFinite(ball.y) && Math.abs(ball.angularVelocity) <= .066) };
    });
    assert.ok(stress.allFinite && !stress.ended, JSON.stringify(stress));
    assert.equal(stress.bodies, stress.finalObjects + 3);
    assert.ok(stress.p95FrameMs < 30, JSON.stringify(stress));
    await advance(150);
    assert.ok((await snap()).balls.every((ball) => ball.speed < 0.25));
  });
  await check('Коллекция скрывает шапку, цепочку и canvas; повторные открытия восстанавливают игру', async () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      for (let i = 0; i < 3; i++) {
        const before = await snap();
        await page.getByRole('button', { name: 'Цепочка мемов' }).click();
        assert.equal(await page.locator('.game-screen').isVisible(), false);
        assert.equal(await page.locator('.header-actions').isVisible(), false);
        assert.equal(await page.locator('#evolution-preview').isVisible(), false);
        assert.equal(await page.locator('#game').evaluate((element) => getComputedStyle(element).visibility), 'hidden');
        assert.equal(await page.locator('.collection-item').count(), 10);
        assert.equal(await page.locator('.modal-overlay').count(), 1);
        await page.waitForTimeout(50);
        const paused = await snap();
        assert.equal(paused.paused, true);
        assert.equal(paused.balls.length, before.balls.length);
        assert.equal(paused.score, before.score);
        const dialog = await page.getByRole('dialog').boundingBox();
        assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= viewport.width + 1 && dialog.y + dialog.height <= viewport.height + 1);
        await page.screenshot({ path: `test-results/collection-${viewport.width}.png` });
        await page.getByRole('button', { name: 'Вернуться', exact: true }).click();
        assert.equal(await page.locator('.modal-overlay').count(), 0);
        assert.equal(await page.locator('.game-screen').isVisible(), true);
        assert.equal(await page.locator('#game').evaluate((element) => getComputedStyle(element).visibility), 'visible');
        assert.equal((await snap()).paused, false);
        assert.equal((await snap()).saves.gamesPlayed, before.saves.gamesPlayed);
      }
    }
  });
  await check('Изменение размера экрана при открытой коллекции сохраняет canvas и управление', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Цепочка мемов' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#game').evaluate((element) => getComputedStyle(element).visibility), 'hidden');
    await page.getByRole('button', { name: 'Вернуться', exact: true }).click();
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box.width > 389 && box.width < 391);
    await fixture([]);
    const x = box.x + 100 * box.width / 390, y = box.y + 450 * box.height / 844;
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__MEME_TEST__.snapshot().balls.length === 1);
    assert.ok(Math.abs((await snap()).balls[0].x - 100) < 1);
  });
  await check('Отладка по ?debugPhysics=1 видна на компьютере и телефоне', async () => {
    await page.goto(url + '/?debugPhysics=1');
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
    await page.waitForFunction(() => window.__MEME_TEST__?.gameActive());
    assert.equal((await snap()).debugPhysics, true);
    await fixture([1, 2, 3, 4, 5, 7, 8, 9, 10, 11].map((level, i) => ({ level, x: [60, 100, 150, 210, 300, 95, 270, 110, 280, 195][i], y: i < 5 ? 360 : i < 7 ? 475 : 620 })));
    await advance(240);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `test-results/physics-debug-${viewport.width}.png` });
    }
    await page.goto(url);
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
    await page.waitForFunction(() => window.__MEME_TEST__?.gameActive());
    assert.equal((await snap()).debugPhysics, false);
    await fixture([1, 2, 3, 4, 5, 7, 8, 9, 10, 11].map((level, i) => ({ level, x: [60, 100, 150, 210, 300, 95, 270, 110, 280, 195][i], y: i < 5 ? 360 : i < 7 ? 475 : 620 })));
    await advance(240);
    await page.screenshot({ path: 'test-results/physics-normal-mobile.png' });
  });
  await check('Нет ошибок браузера при новых телах и модальных состояниях', async () => assert.deepEqual(errors, []));
  console.log(`\n${results.length} проверок физики пройдено.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  await writeFile('test-results/physics.json', JSON.stringify({ results, errors, geometry, floors, mixed, stress }, null, 2));
  await browser?.close(); server.kill('SIGTERM');
}
