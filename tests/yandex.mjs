import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';

const port = 4178;
const dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'yandex', '--host', '127.0.0.1', '--base', '/', '--port', String(port), '--strictPort'], { env: { ...process.env, VITE_TEST_MODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
dev.stdout.on('data', (chunk) => { logs += chunk; }); dev.stderr.on('data', (chunk) => { logs += chunk; });
const prefix = '/games/12345/';
const root = resolve('dist-yandex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const production = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((accept) => production.listen(0, '127.0.0.1', accept));
const mockSDK = `
window.__SDK__={events:[],listeners:{},ad:null,fail:false,throwAd:false};
const state=window.__SDK__;
window.YaGames={init:async()=>{
 state.events.push('init');
 if(state.fail)throw Error('init failed');
 return {features:{LoadingAPI:{ready:()=>state.events.push('ready')},GameplayAPI:{start:()=>state.events.push('start'),stop:()=>state.events.push('stop')}},
 on:(event,cb)=>state.listeners[event]=cb,
 adv:{showRewardedVideo:({callbacks})=>{if(state.throwAd)throw Error('ad failed');state.ad=callbacks;state.events.push('ad');callbacks.onOpen();}}
};}};`;
let browser;
let page;
const results = [];
const errors = [];
const check = async (name, action) => {
  try { await action(); results.push({name,status:'passed'}); console.log(`✓ ${name}`); }
  catch (error) { results.push({name,status:'failed',error:String(error)}); await page?.screenshot({path:'test-results/yandex-failure.png'}); throw error; }
};
const snapshot = () => page.evaluate(() => window.__MEME_TEST__.snapshot());
const start = async () => {
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', {name:'Играть',exact:true}).click();
  await page.waitForFunction(() => window.__MEME_TEST__?.gameActive());
};
const end = async () => {
  await page.evaluate(() => {
    window.__MEME_TEST__.fixture([{level:1,x:195,y:270,age:5000,static:true},{level:5,x:195,y:650,age:5000,static:true}]);
    for(let i=0;i<150;i++)window.__MEME_TEST__.manualStep(1000/60);
  });
  await page.getByRole('heading',{name:'Игра окончена',exact:true}).waitFor();
};
const rewardButton = () => page.getByRole('button',{name:'Второй шанс · за рекламу',exact:true});
try {
  await mkdir('test-results',{recursive:true});
  for(let i=0;i<150;i++){
    if(dev.exitCode!==null)throw Error(logs);
    try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}
    if(i===149)throw Error(logs);
    await new Promise((accept)=>setTimeout(accept,100));
  }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',(error)=>errors.push(String(error)));
  await page.route('**/sdk.js',(route)=>route.fulfill({contentType:'text/javascript',body:mockSDK}));
  await check('SDK ready вызывается после появления меню; GameplayAPI следует паузам',async()=>{
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole('button',{name:'Играть',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__SDK__?.events.includes('ready'));
    assert.deepEqual(await page.evaluate(()=>window.__SDK__.events),['init','ready']);
    await page.getByRole('button',{name:'Играть',exact:true}).click();
    await page.waitForFunction(()=>window.__MEME_TEST__?.gameActive());
    await page.getByRole('button',{name:'Пауза',exact:true}).click();
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__SDK__.events),['init','ready','start','stop','start']);
  });
  await check('Все десять мемов показаны в исходном разрешении 512×512',async()=>{
    const sizes=await page.evaluate(async()=>Promise.all(window.__MEME_TEST__.snapshot().sourceLevels.map(async(level)=>{
      const image=new Image();image.src=window.__MEME_TEST__.textureData(level);await image.decode();return [image.width,image.height];
    })));
    assert.equal(sizes.length,10);sizes.forEach((size)=>assert.deepEqual(size,[512,512]));
    await page.evaluate(()=>{
      window.__MEME_TEST__.fixture([{level:1,x:190,y:600},{level:1,x:202,y:600}]);
      for(let i=0;i<30;i++)window.__MEME_TEST__.manualStep(1000/60);
    });
    assert.equal((await snapshot()).score,4);
  });
  await check('Закрытие без награды, ошибка, поздние и повторные callbacks не дают второй шанс',async()=>{
    await end();
    const before=await snapshot();
    await rewardButton().click();
    await page.waitForFunction(()=>window.__SDK__.ad!==null);
    assert.equal(await rewardButton().isDisabled(),true);
    assert.equal((await snapshot()).audio.musicPaused,true);
    assert.equal((await snapshot()).audio.suspensions.includes('ad'),true);
    await page.evaluate(()=>{window.__SDK__.ad.onClose();window.__SDK__.ad.onRewarded();window.__SDK__.ad.onClose();});
    await rewardButton().waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('[data-reward-pending]'));
    assert.equal((await snapshot()).ended,true);
    assert.equal((await snapshot()).balls.length,before.balls.length);
    assert.equal((await snapshot()).score,before.score);
    await rewardButton().click();
    await page.evaluate(()=>{window.__SDK__.ad.onError(Error('unavailable'));window.__SDK__.ad.onRewarded();window.__SDK__.ad.onClose();});
    await page.waitForFunction(()=>!document.querySelector('[data-reward-pending]'));
    assert.equal((await snapshot()).ended,true);
    assert.equal((await snapshot()).audio.suspensions.includes('ad'),false);
    await page.evaluate(()=>window.__SDK__.throwAd=true);
    await rewardButton().click();
    await page.waitForFunction(()=>!document.querySelector('[data-reward-pending]'));
    assert.equal((await snapshot()).ended,true);
    assert.equal(await rewardButton().isEnabled(),true);
    await page.evaluate(()=>window.__SDK__.throwAd=false);
  });
  await check('Награда действует только после закрытия рекламы; счёт и партия сохранены; верхние мемы удалены',async()=>{
    const before=await snapshot();
    await page.screenshot({path:'test-results/yandex-second-chance-mobile.png'});
    await rewardButton().click();
    await page.waitForFunction(()=>document.querySelector('[data-reward-pending]'));
    const count=await page.evaluate(()=>window.__SDK__.events.filter(e=>e==='ad').length);
    await page.locator('.dialog button').first().dispatchEvent('click');
    assert.equal(await page.evaluate(()=>window.__SDK__.events.filter(e=>e==='ad').length),count);
    await page.evaluate(()=>{window.__SDK__.ad.onRewarded();window.__SDK__.ad.onRewarded();});
    assert.equal((await snapshot()).ended,true);
    assert.equal((await snapshot()).balls.length,2);
    await page.evaluate(()=>{window.__SDK__.ad.onClose();window.__SDK__.ad.onClose();});
    await page.waitForFunction(()=>!window.__MEME_TEST__.snapshot().ended);
    const after=await snapshot();
    assert.equal(after.score,before.score);
    assert.equal(after.saves.gamesPlayed,before.saves.gamesPlayed);
    assert.equal(after.balls.length,1);assert.equal(after.balls[0].level,5);
    assert.equal(after.audio.suspensions.includes('ad'),false);
    assert.equal(await page.locator('.modal-overlay').count(),0);
    await end();assert.equal(await rewardButton().count(),0);
    const games=(await snapshot()).saves.gamesPlayed;
    await page.getByRole('button',{name:'Играть снова',exact:true}).click();
    await page.waitForFunction((games)=>window.__MEME_TEST__.snapshot().saves.gamesPlayed===games+1,games);
    await end();assert.equal(await rewardButton().count(),1);
  });
  await check('Пауза SDK блокирует физику и звук; после возврата продолжение требует действия игрока',async()=>{
    await start();
    await page.evaluate(()=>window.__SDK__.listeners.game_api_pause());
    assert.equal((await snapshot()).paused,true);
    assert.equal((await snapshot()).audio.musicPaused,true);
    const time=(await snapshot()).gameTime;
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    assert.equal((await snapshot()).paused,true);assert.equal((await snapshot()).gameTime,time);
    await page.evaluate(()=>window.__SDK__.listeners.game_api_resume());
    assert.equal((await snapshot()).paused,true);
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    assert.equal((await snapshot()).paused,false);
  });
  await check('Награда из старой сцены не возобновляет новую партию',async()=>{
    await end();await rewardButton().click();
    await page.waitForFunction(()=>window.__SDK__.ad!==null);
    await page.evaluate(async()=>{
      window.__OLD_AD__=window.__SDK__.ad;
      const {ui}=await import('/src/ui/GameUI.ts');ui.closeModal();
      document.querySelector('[data-action="restart"]').click();
    });
    await page.getByRole('button',{name:'Начать заново',exact:true}).click();
    await page.waitForFunction(()=>window.__MEME_TEST__.gameActive()&&!window.__MEME_TEST__.snapshot().ended);
    await page.evaluate(()=>{window.__OLD_AD__.onRewarded();window.__OLD_AD__.onClose();});
    assert.equal((await snapshot()).balls.length,0);
    await end();assert.equal(await rewardButton().count(),1);
  });
  await check('Сбой инициализации не блокирует игру; повторная попытка подключает SDK и рекламу',async()=>{
    await page.unroute('**/sdk.js');
    await page.route('**/sdk.js',(route)=>route.fulfill({contentType:'text/javascript',body:mockSDK.replace('fail:false','fail:true')}));
    await start();await end();
    await rewardButton().click();
    await page.waitForFunction(()=>!document.querySelector('[data-reward-pending]'));
    assert.equal((await snapshot()).ended,true);
    assert.equal(await rewardButton().isEnabled(),true);
    await page.evaluate(()=>window.__SDK__.fail=false);
    await rewardButton().click();
    await page.waitForFunction(()=>window.__SDK__.ad!==null);
    await page.evaluate(()=>{window.__SDK__.ad.onRewarded();window.__SDK__.ad.onClose();});
    await page.waitForFunction(()=>!window.__MEME_TEST__.snapshot().ended);
    assert.equal(await page.evaluate(()=>window.__SDK__.events.filter(e=>e==='ready').length),1);
    await page.unroute('**/sdk.js');
    await page.route('**/sdk.js',(route)=>route.fulfill({contentType:'text/javascript',body:mockSDK}));
  });
  await check('Награда в скрытой вкладке сохраняется; физика и музыка ждут явного продолжения',async()=>{
    await start();await end();await rewardButton().click();
    await page.waitForFunction(()=>window.__SDK__.ad!==null);
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
      window.__SDK__.ad.onRewarded();window.__SDK__.ad.onClose();
    });
    await page.getByRole('heading',{name:'Пауза',exact:true}).waitFor();
    const after=await snapshot();
    assert.equal(after.ended,false);assert.equal(after.paused,true);
    assert.equal(after.balls.length,1);assert.equal(after.audio.musicPaused,true);
    await page.evaluate(()=>{
      delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal((await snapshot()).paused,true);
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    assert.equal((await snapshot()).paused,false);
  });
  await check('Готовая Яндекс-сборка работает по вложенному URL, загружает все ресурсы и не содержит тестового API',async()=>{
    const origin=`http://127.0.0.1:${production.address().port}`;
    const loaded=new Set();const failures=[];
    const response=(r)=>{const u=new URL(r.url());if(r.status()>=400)failures.push(r.url());if(u.pathname.includes('/assets/memes/')&&r.status()===200)loaded.add(u.pathname);};
    page.on('response',response);
    await page.goto(origin+prefix);
    await page.getByRole('button',{name:'Играть',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__SDK__?.events.includes('ready'));
    assert.equal(await page.evaluate(()=>'__MEME_TEST__'in window),false);
    assert.equal(loaded.size,10);assert.deepEqual(failures,[]);
    for(const path of ['assets/backgrounds/left-overlay.webp','assets/backgrounds/right-overlay.webp',...['01','02','03'].map(id=>`assets/audio/video-audio-${id}.mp3`)])assert.equal((await page.request.get(origin+prefix+path)).status(),200);
    await page.getByRole('button',{name:'Играть',exact:true}).click();
    for(let i=0;i<22;i++){
      await page.mouse.click(195,470);await page.waitForTimeout(470);
      if(Number((await page.locator('#score').innerText()).replace(/\s/g,''))>0)break;
    }
    assert.ok(Number((await page.locator('#score').innerText()).replace(/\s/g,''))>0);
    await page.getByRole('button',{name:'Пауза',exact:true}).click();
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    page.off('response',response);
    assert.equal((await page.evaluate(()=>window.__SDK__.events)).filter(e=>e==='ready').length,1);
  });
  await check('Отсутствие SDK не мешает открыть игру, начать партию и посмотреть коллекцию',async()=>{
    await page.unroute('**/sdk.js');await page.route('**/sdk.js',(route)=>route.abort());
    await page.goto(`http://127.0.0.1:${production.address().port}${prefix}`);
    await page.getByRole('button',{name:'Играть',exact:true}).click();
    await page.getByRole('button',{name:'Цепочка мемов'}).click();
    assert.equal(await page.locator('.collection-item').count(),10);
    await page.getByRole('button',{name:'Вернуться',exact:true}).click();
  });
  assert.deepEqual(errors,[]);
  await writeFile('test-results/yandex.json',JSON.stringify({status:'passed',results,errors,realAdsVerified:false},null,2));
  console.log(`✓ ${results.length} сценариев Яндекс SDK в Chromium. Реальная реклама требует черновика на платформе.`);
}finally{
  await browser?.close();dev.kill('SIGTERM');await new Promise(accept=>production.close(accept));
}
