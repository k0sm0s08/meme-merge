import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const port = 4174;
const url = `http://127.0.0.1:${port}`;
const results = [];
let browser;
let page;
let output = '';
const errors = [];
await mkdir('test-results', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--base', '/', '--port', String(port), '--strictPort'], {
  env: { ...process.env, VITE_TEST_MODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (data) => { output += data.toString(); });
server.stderr.on('data', (data) => { output += data.toString(); });

const snapshot = () => page.evaluate(() => window.__MEME_TEST__.snapshot());
const fixture = (balls) => page.evaluate((data) => window.__MEME_TEST__.fixture(data), balls);
const wait = (condition, arg, timeout = 5000) => page.waitForFunction(condition, arg, { timeout });
const start = async () => {
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await wait(() => window.__MEME_TEST__.gameActive());
};
const restart = async () => {
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать заново', exact: true }).click();
  await wait(() => window.__MEME_TEST__.snapshot().balls.length === 0 && !window.__MEME_TEST__.snapshot().paused);
};
const point = async (x, y) => {
  const rect = await page.locator('#stage').boundingBox();
  return { x: rect.x + x * rect.width / 390, y: rect.y + y * rect.height / 844 };
};
const check = async (name, action) => {
  try {
    await action();
    results.push({ name, status: 'passed' });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: String(error) });
    await page?.screenshot({ path: 'test-results/failure.png' });
    throw error;
  }
};

try {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i === 149) throw new Error(`Vite не запустился: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await wait(() => !!window.__MEME_TEST__ && !!document.querySelector('[data-action="play"]'));

  await check('Загрузка 10 текстур мемов; удалённый уровень 06 отсутствует', async () => {
    assert.equal((await snapshot()).textures.filter(Boolean).length, 10);
    assert.equal((await snapshot()).removedTextureExists, false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'test-results/menu-desktop.png' });
  });
  await check('Все фото из архива загружены как прозрачные PNG без зелёного фона', async () => {
    const expected = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
    const sourceLevels = (await snapshot()).sourceLevels;
    assert.deepEqual(sourceLevels, expected);
    const stats = await page.evaluate(async (levels) => {
      const items = [];
      for (const level of levels) {
        const url = `/assets/memes/meme-${String(level).padStart(2, '0')}.png`;
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let green = 0;
        let greenAtEdge = 0;
        let opaque = 0;
        let feathered = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 8) opaque++;
          if (pixels[i + 3] > 8 && pixels[i + 3] < 240) feathered++;
          if (pixels[i + 3] > 80 && pixels[i + 1] > pixels[i] + 40 && pixels[i + 1] > pixels[i + 2] + 40) {
            green++;
            const x = i / 4 % canvas.width;
            const y = Math.floor(i / 4 / canvas.width);
            let nearTransparency = false;
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height && pixels[(ny * canvas.width + nx) * 4 + 3] < 8) nearTransparency = true;
              }
            }
            if (nearTransparency) greenAtEdge++;
          }
        }
        items.push({ level, width: img.width, height: img.height, signature: [...bytes.slice(0, 8)], cornerAlpha: pixels[3], coverage: opaque / (pixels.length / 4), green, greenAtEdge, feathered });
      }
      return items;
    }, sourceLevels);
    for (const item of stats) {
      assert.deepEqual(item.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(item.width, 512);
      assert.equal(item.height, 512);
      assert.equal(item.cornerAlpha, 0);
      assert.ok(item.coverage > 0.1 && item.coverage < 0.95, JSON.stringify(item));
      // The original jersey has a green bird; check background/fringe, not clothing colors.
      assert.ok(item.green < 262144 * 0.01, JSON.stringify(item));
      assert.ok(item.greenAtEdge < 30, JSON.stringify(item));
      assert.ok(item.feathered > 100, JSON.stringify(item));
    }
  });
  await check('Инструкция и коллекция 10 уровней: номера и изображения совпадают', async () => {
    await page.getByRole('button', { name: 'Как играть', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Понятно, погнали' }).click();
    await page.getByRole('button', { name: 'Все 10 мемов' }).click();
    assert.equal(await page.locator('.collection-item').count(), 10);
    const items = await page.locator('.collection-item img').evaluateAll((images) => images.map((img) => ({ level: Number(img.dataset.level), source: img.src })));
    assert.deepEqual(items.map(({ level }) => level), [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
    for (const item of items) {
      assert.equal(item.source, await page.evaluate((level) => window.__MEME_TEST__.textureData(level), item.level));
    }
    await page.getByRole('button', { name: 'Вернуться', exact: true }).click();
  });
  await check('Настроенные вероятности выпадения 30/25/20/15/10', async () => {
    const levels = await page.evaluate(async () => {
      const { randomLevel } = await import('/src/config/gameConfig.ts');
      return [0, .299, .30, .549, .55, .749, .75, .899, .90, .999].map((pick) => randomLevel(() => pick));
    });
    assert.deepEqual(levels, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  await check('Обработка зелёного фона: удалены панели, сохранён объект, край мягкий', async () => {
    const result = await page.evaluate(async () => {
      const { prepareMemeSource, drawMemeCutout } = await import('/src/ui/MemeArtwork.ts');
      const input = document.createElement('canvas');
      input.width = 120;
      input.height = 240;
      const ctx = input.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 120, 240);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 60, 120, 120);
      ctx.fillStyle = '#b64232';
      ctx.fillRect(35, 85, 50, 70);
      ctx.fillStyle = '#edc8af';
      ctx.fillRect(40, 95, 40, 30);
      const prepared = prepareMemeSource(input);
      const pixels = prepared.canvas.getContext('2d').getImageData(0, 0, prepared.canvas.width, prepared.canvas.height).data;
      const center = (Math.floor(prepared.canvas.height / 2) * prepared.canvas.width + Math.floor(prepared.canvas.width / 2)) * 4;
      const output = document.createElement('canvas');
      output.width = output.height = 256;
      drawMemeCutout(output.getContext('2d'), input, '#b7a1ff', 256);
      const corner = [...output.getContext('2d').getImageData(0, 0, 1, 1).data];
      return {
        removed: prepared.backgroundRemoved, width: prepared.canvas.width, height: prepared.canvas.height,
        centerAlpha: pixels[center + 3], softEdge: pixels[3], cornerAlpha: corner[3],
        opaqueGreen: Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4 + 1] > 180 && pixels[i * 4] < 80 && pixels[i * 4 + 3] > 32).some(Boolean),
      };
    });
    assert.equal(result.removed, true);
    assert.equal(result.width, 50);
    assert.equal(result.height, 70);
    assert.equal(result.centerAlpha, 255);
    assert.ok(result.softEdge > 0 && result.softEdge < 255);
    assert.equal(result.cornerAlpha, 0);
    assert.equal(result.opaqueGreen, false);
  });
  await check('Готовые прозрачные PNG сохраняют пропорции и прозрачность', async () => {
    const result = await page.evaluate(async () => {
      const { prepareMemeSource } = await import('/src/ui/MemeArtwork.ts');
      const input = document.createElement('canvas');
      input.width = input.height = 100;
      const ctx = input.getContext('2d');
      ctx.fillStyle = '#edc8af';
      ctx.fillRect(35, 20, 30, 60);
      ctx.clearRect(35, 20, 5, 5);
      const prepared = prepareMemeSource(input);
      const corner = prepared.canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
      return { removed: prepared.backgroundRemoved, width: prepared.canvas.width, height: prepared.canvas.height, alpha: corner[3] };
    });
    assert.equal(result.removed, false);
    assert.equal(result.width, 30);
    assert.equal(result.height, 60);
    assert.equal(result.alpha, 0);
  });
  await check('Старое сохранение с уровнем 06 переносится на 07 без потери рекорда', async () => {
    const legacy = await browser.newContext();
    await legacy.addInitScript(() => {
      if (!localStorage.getItem('meme-merge.save.v1')) {
        localStorage.setItem('meme-merge.save.v1', JSON.stringify({ version: 1, bestScore: 4321, gamesPlayed: 12, maxLevel: 6 }));
      }
    });
    const legacyPage = await legacy.newPage();
    legacyPage.on('pageerror', (error) => errors.push(String(error)));
    await legacyPage.goto(url);
    await legacyPage.waitForFunction(() => !!window.__MEME_TEST__ && !!document.querySelector('[data-action="play"]'));
    const expected = { version: 1, bestScore: 4321, gamesPlayed: 12, maxLevel: 7 };
    assert.deepEqual(await legacyPage.evaluate(() => window.__MEME_TEST__.snapshot().saves), expected);
    assert.deepEqual(await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('meme-merge.save.v1'))), expected);
    await legacyPage.reload();
    await legacyPage.waitForFunction(() => !!window.__MEME_TEST__ && !!document.querySelector('[data-action="play"]'));
    assert.deepEqual(await legacyPage.evaluate(() => window.__MEME_TEST__.snapshot().saves), expected);
    await legacy.close();
  });
  await start();
  await check('Прицел плавно следует за мышью, затем сходится к точной позиции', async () => {
    const before = await snapshot();
    const from = before.previewX;
    const p = await point(90, 450);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(30);
    const moving = (await snapshot()).previewX;
    assert.ok(moving > 89 && moving < from);
    await wait(() => Math.abs(window.__MEME_TEST__.snapshot().previewX - 90) < 2, null, 3000);
    assert.ok((await snapshot()).gameTime - before.gameTime < 600);
  });
  await check('Мышь: прицел, один сброс, задержка, совпадение размера тела', async () => {
    const p = await point(100, 450);
    await page.mouse.move(p.x, p.y);
    assert.equal((await snapshot()).balls.length, 0);
    const currentLevel = (await snapshot()).current;
    await page.mouse.click(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await wait(() => window.__MEME_TEST__.snapshot().balls.length === 1);
    const ball = (await snapshot()).balls[0];
    assert.equal(ball.level, currentLevel);
    assert.ok(Math.abs(ball.x - 100) < 1);
    assert.equal(ball.radius, [15, 19, 23.5, 28.5, 34.5][currentLevel - 1]);
    await wait(() => window.__MEME_TEST__.snapshot().balls[0].y > 670, null, 4000);
    const settled = (await snapshot()).balls[0];
    assert.ok(settled.y + settled.radius <= 720);
  });
  await check('Пауза полностью останавливает физику; кнопки не сбрасывают мемы', async () => {
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const before = await snapshot();
    await page.waitForTimeout(600);
    const after = await snapshot();
    assert.equal(after.paused, true);
    assert.equal(after.gameTime, before.gameTime);
    assert.deepEqual(after.balls, before.balls);
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    assert.equal((await snapshot()).balls.length, 1);
  });
  await check('Потеря фокуса автоматически ставит игру на паузу', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wait(() => window.__MEME_TEST__.snapshot().paused);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await snapshot()).paused, true);
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  });
  await check('Подтверждение перезапуска и чистое новое поле', async () => {
    await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить партию', exact: true }).click();
    assert.equal((await snapshot()).balls.length, 1);
    await restart();
    const state = await snapshot();
    assert.equal(state.score, 0);
    assert.equal(state.bodies, 3);
    assert.equal(state.listeners, 1);
  });
  await check('Реальное столкновение: 1 + 1 → 2 и ровно 4 очка', async () => {
    await fixture([{ level: 1, x: 180, y: 650 }, { level: 1, x: 207, y: 650 }]);
    await wait(() => window.__MEME_TEST__.snapshot().score === 4);
    const state = await snapshot();
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].level, 2);
    assert.equal(state.bodies, 4);
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).score, 4);
  });
  await restart();
  await check('Одновременные контакты трёх мемов не дают двойного слияния', async () => {
    await fixture([{ level: 1, x: 174, y: 650 }, { level: 1, x: 199, y: 650 }, { level: 1, x: 224, y: 650 }]);
    await wait(() => window.__MEME_TEST__.snapshot().score === 4);
    await page.waitForTimeout(300);
    const state = await snapshot();
    assert.equal(state.score, 4);
    assert.deepEqual(state.balls.map((ball) => ball.level).sort(), [1, 2]);
    assert.equal(state.balls.some((ball) => ball.merging), false);
  });
  await restart();
  await check('Цепное слияние четырёх мемов, комбо, 16 очков', async () => {
    await fixture([
      { level: 1, x: 181, y: 640 }, { level: 1, x: 208, y: 640 },
      { level: 1, x: 181, y: 667 }, { level: 1, x: 208, y: 667 },
    ]);
    await wait(() => window.__MEME_TEST__.snapshot().score === 16);
    const state = await snapshot();
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].level, 3);
    assert.equal(state.combo, 3);
    await page.screenshot({ path: 'test-results/game-desktop.png' });
  });
  await restart();
  await check('5 + 5 → 7: правильная фотография, размер и ровно 128 очков', async () => {
    await fixture([{ level: 5, x: 161, y: 570 }, { level: 5, x: 229, y: 570 }]);
    await wait(() => window.__MEME_TEST__.snapshot().score === 128);
    const state = await snapshot();
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].level, 7);
    assert.equal(state.balls[0].radius, 48);
    assert.equal(state.balls[0].texture, 'meme-circle-7');
    assert.equal(state.removedTextureExists, false);
    await page.waitForTimeout(250);
    assert.equal((await snapshot()).score, 128);
  });
  await restart();
  await check('Цепное слияние через пропуск: 5 + 5 → 7, затем 7 + 7 → 8', async () => {
    await fixture([{ level: 5, x: 165, y: 580 }, { level: 5, x: 225, y: 580 }, { level: 7, x: 195, y: 650 }]);
    await wait(() => window.__MEME_TEST__.snapshot().score === 384);
    const state = await snapshot();
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].level, 8);
    assert.equal(state.balls[0].texture, 'meme-circle-8');
    assert.equal(state.combo, 2);
    assert.equal(state.bodies, 4);
  });
  await restart();
  await check('Все переходы новой цепочки дают правильные изображения, размеры и очки', async () => {
    const transitions = [
      [2, 3, 19, 47, 8], [3, 4, 23.5, 57, 16], [4, 5, 28.5, 69, 32],
      [5, 7, 34.5, 96, 128], [7, 8, 48, 112, 256], [8, 9, 56, 130, 512],
      [9, 10, 65, 150, 1024], [10, 11, 75, 172, 2048],
    ];
    for (const [source, target, radius, diameter, points] of transitions) {
      const before = (await snapshot()).score;
      await fixture([{ level: source, x: 195 - radius + 1, y: 540 }, { level: source, x: 195 + radius - 1, y: 540 }]);
      await wait((total) => window.__MEME_TEST__.snapshot().score === total, before + points);
      const state = await snapshot();
      assert.equal(state.balls.length, 1);
      assert.equal(state.balls[0].level, target);
      assert.equal(state.balls[0].texture, `meme-circle-${target}`);
      assert.equal(state.balls[0].radius * 2, diameter);
      assert.equal(state.removedTextureExists, false);
      assert.equal(state.bodies, 4);
    }
  });
  await check('11 + 11 исчезают, добавляют 2048 очков; партия продолжается', async () => {
    const before = (await snapshot()).score;
    await fixture([{ level: 11, x: 114, y: 540 }, { level: 11, x: 276, y: 540 }]);
    await wait((points) => window.__MEME_TEST__.snapshot().score === points, before + 2048);
    assert.equal((await snapshot()).balls.length, 0);
    assert.equal((await snapshot()).ended, false);
  });
  await check('Рекорд и максимальный уровень сохраняются после перезагрузки', async () => {
    const before = (await snapshot()).saves;
    assert.ok(before.bestScore >= 2048);
    assert.equal(before.maxLevel, 11);
    await page.reload();
    await wait(() => !!document.querySelector('[data-action="play"]') && !!window.__MEME_TEST__);
    assert.deepEqual((await snapshot()).saves, before);
  });
  await start();
  await check('Границы контейнера удерживают быстрые и крупные тела', async () => {
    await fixture([
      { level: 1, x: 45, y: 480, vx: -30, vy: 30 },
      { level: 7, x: 320, y: 550, vx: 30, vy: 30 },
      { level: 10, x: 200, y: 620, vy: 40 },
    ]);
    await page.waitForTimeout(900);
    const state = await snapshot();
    assert.equal(state.balls.length, 3);
    for (const ball of state.balls) {
      assert.ok(ball.x - ball.radius >= 26 && ball.x + ball.radius <= 364, JSON.stringify(ball));
      assert.ok(ball.y + ball.radius <= 720, JSON.stringify(ball));
    }
  });
  await restart();
  await check('Плотная стопка из 20 мемов успокаивается без дрожания и лишних тел', async () => {
    await fixture(Array.from({ length: 20 }, (_, i) => ({ level: i % 5 + 1, x: 54 + i % 6 * 55, y: 665 - Math.floor(i / 6) * 65 })));
    await page.waitForTimeout(4000);
    const state = await snapshot();
    assert.equal(state.ended, false);
    assert.equal(state.bodies, state.balls.length + 3);
    assert.ok(state.balls.length > 0);
    const meanSpeed = state.balls.reduce((sum, ball) => sum + ball.speed, 0) / state.balls.length;
    assert.ok(meanSpeed < 0.25, `Стопка не успокоилась: ${meanSpeed}`);
    for (const ball of state.balls) {
      assert.ok(ball.x - ball.radius >= 26 && ball.x + ball.radius <= 364);
      assert.ok(ball.y + ball.radius <= 720);
      assert.ok(Math.abs(ball.angularVelocity) <= 0.066);
      assert.ok(Number.isFinite(ball.visualX) && Number.isFinite(ball.visualY));
    }
  });
  await restart();
  await check('Долгий кадр ограничен; скорость симуляции не взрывается', async () => {
    const advanced = await page.evaluate(() => {
      const before = window.__MEME_TEST__.snapshot().gameTime;
      window.__MEME_TEST__.manualStep(10000);
      return window.__MEME_TEST__.snapshot().gameTime - before;
    });
    assert.ok(advanced <= 84);
  });
  await check('Недавний сброс не считается переполнением; опасность сбрасывается', async () => {
    await fixture([{ level: 1, x: 195, y: 270, static: true }]);
    await page.waitForTimeout(1000);
    assert.equal((await snapshot()).balls[0].overflowMs, 0);
    await wait(() => window.__MEME_TEST__.snapshot().balls[0].overflowMs > 100, null, 3000);
    await fixture([{ level: 2, x: 195, y: 500, static: true, age: 10000 }]);
    await page.waitForTimeout(250);
    assert.equal((await snapshot()).ended, false);
    assert.equal((await snapshot()).balls[0].overflowMs, 0);
  });
  await check('Переполнение >2 секунд завершает игру, блокирует сброс и допускает рестарт', async () => {
    const before = await fixture([{ level: 3, x: 195, y: 270, static: true, age: 10000 }]);
    await page.waitForTimeout(1200);
    assert.equal((await snapshot()).ended, false);
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 3000 });
    const ended = await snapshot();
    assert.equal(ended.ended, true);
    assert.ok(ended.gameTime - before >= 1980);
    const p = await point(100, 450);
    await page.mouse.click(p.x, p.y);
    assert.equal((await snapshot()).balls.length, 1);
    await page.getByRole('button', { name: 'Играть снова', exact: true }).click();
    await wait(() => window.__MEME_TEST__.snapshot().balls.length === 0 && !window.__MEME_TEST__.snapshot().ended);
  });
  await check('10 рестартов не накапливают тела и обработчики', async () => {
    for (let i = 0; i < 10; i++) {
      await restart();
      const state = await snapshot();
      assert.equal(state.bodies, 3);
      assert.equal(state.listeners, 1);
      assert.equal(state.score, 0);
    }
  });
  await check('Адаптивность: телефон, планшет, компьютер, горизонтальный экран', async () => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => {
        const stage = document.getElementById('stage').getBoundingClientRect();
        const canvas = document.querySelector('canvas').getBoundingClientRect();
        return { x: stage.x, y: stage.y, width: stage.width, height: stage.height, canvasWidth: canvas.width, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.ok(Math.abs(geometry.width / geometry.height - 390 / 844) < 0.002);
      assert.ok(geometry.width <= viewport.width && geometry.height <= viewport.height);
      assert.ok(Math.abs(geometry.canvasWidth - geometry.width) < 2);
      assert.equal(geometry.scrollWidth, viewport.width);
      for (const button of await page.locator('.game-screen button').all()) {
        const box = await button.boundingBox();
        assert.ok(box.height >= 43.5, `Маленькая область нажатия: ${box.height}`);
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/game-mobile.png' });
  });
  await check('Мобильное касание: движение без сброса, отпускание и один объект', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', (error) => errors.push(String(error)));
    await mobilePage.goto(url);
    await mobilePage.getByRole('button', { name: 'Играть', exact: true }).click();
    await mobilePage.waitForFunction(() => !!window.__MEME_TEST__ && window.__MEME_TEST__.gameActive());
    const client = await mobile.newCDPSession(mobilePage);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 430, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 310, y: 430, id: 1 }] });
    assert.equal(await mobilePage.evaluate(() => window.__MEME_TEST__.snapshot().balls.length), 0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobilePage.waitForFunction(() => window.__MEME_TEST__.snapshot().balls.length === 1);
    const ball = await mobilePage.evaluate(() => window.__MEME_TEST__.snapshot().balls[0]);
    assert.ok(Math.abs(ball.x - 310) < 4);
    await mobilePage.waitForTimeout(500);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 450, id: 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await mobilePage.evaluate(() => window.__MEME_TEST__.snapshot().balls.length), 1);
    await mobilePage.screenshot({ path: 'test-results/touch-mobile.png' });
    await mobile.close();
  });
  await check('Недоступный localStorage не препятствует игре', async () => {
    const restricted = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await restricted.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
    });
    const restrictedPage = await restricted.newPage();
    restrictedPage.on('pageerror', (error) => errors.push(String(error)));
    await restrictedPage.goto(url);
    await restrictedPage.getByRole('button', { name: 'Играть', exact: true }).click();
    await restrictedPage.waitForFunction(() => !!window.__MEME_TEST__ && window.__MEME_TEST__.gameActive());
    await restrictedPage.evaluate(() => window.__MEME_TEST__.fixture([{ level: 1, x: 180, y: 650 }, { level: 1, x: 207, y: 650 }]));
    await restrictedPage.waitForFunction(() => window.__MEME_TEST__.snapshot().score === 4);
    assert.equal(await restrictedPage.evaluate(() => window.__MEME_TEST__.snapshot().saves.bestScore), 4);
    await restricted.close();
  });
  await check('Нет необработанных ошибок браузера', async () => { assert.deepEqual(errors, []); });
  console.log(`\n${results.length} проверок пройдено.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('test-results/results.json', JSON.stringify({ results, errors }, null, 2));
  await browser?.close();
  server.kill('SIGTERM');
}
