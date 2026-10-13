import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';

const root=resolve('dist');
const output=resolve('publishing/gameplay');
const recordings=resolve('.cache/gameplay-recordings');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const prefix='/meme-merge/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(prefix)){res.writeHead(404).end();return;}
    const file=resolve(root,path.slice(prefix.length)||'index.html');
    if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
await mkdir(output,{recursive:true});await mkdir(recordings,{recursive:true});
let browser;
const report=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const format of [{name:'vertical',width:720,height:1280,mobile:true},{name:'horizontal',width:1280,height:720,mobile:false}]){
  const viewport={width:format.width,height:format.height};
  const context=await browser.newContext({viewport,hasTouch:format.mobile,isMobile:format.mobile,recordVideo:{dir:recordings,size:viewport}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.getByRole('button',{name:'Играть',exact:true}).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({path:resolve(output,`${format.name}-menu.png`)});
  await page.getByRole('button',{name:'Играть',exact:true}).click();
  await page.locator('#score').waitFor();
  const box=await page.locator('canvas').boundingBox();
  if(!box)throw Error('Canvas unavailable');
  let touch;
  if(format.mobile){touch=await context.newCDPSession(page);}
  // All bodies come from real pointer drops. No fixtures, SDK mocks or altered physics.
  for(let i=0;i<46;i++){
    if(await page.getByRole('heading',{name:'Игра окончена',exact:true}).count())break;
    const target=box.x+box.width*(.30+(i%5)*.10);
    const y=box.y+box.height*.48;
    if(touch){
      const start=box.x+box.width*.5;
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y,id:1}]});
      for(let n=1;n<=5;n++){
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(target-start)*n/5,y,id:1}]});
        await page.waitForTimeout(25);
      }
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await page.mouse.move(target,y,{steps:6});await page.waitForTimeout(100);await page.mouse.click(target,y);
    }
    await page.waitForTimeout(560);
    if(i===17)await page.screenshot({path:resolve(output,`${format.name}-gameplay.png`)});
    if(i===34)await page.screenshot({path:resolve(output,`${format.name}-merges.png`)});
  }
  await page.waitForTimeout(2000);
  const score=Number((await page.locator('#score').textContent()).replace(/\s/g,''));
  if(score<=0)throw Error('No actual merges recorded');
  if(!await page.getByRole('heading',{name:'Игра окончена',exact:true}).count()){
    await page.getByRole('button',{name:'Цепочка мемов'}).click();
    await page.waitForTimeout(1000);
    await page.screenshot({path:resolve(output,`${format.name}-collection.png`)});
    await page.getByRole('button',{name:'Вернуться',exact:true}).click();
    await page.waitForTimeout(1600);
  }
  await page.screenshot({path:resolve(output,`${format.name}-final.png`)});
  const video=page.video();await context.close();
  const source=await video.path();const destination=resolve(output,`gameplay-${format.name}.mp4`);
  const converted=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-an','-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',destination],{encoding:'utf8'});
  if(converted.status!==0)throw Error(converted.stderr);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate','-of','json',destination],{encoding:'utf8'});
  if(probe.status!==0)throw Error(probe.stderr);
  if(errors.length)throw Error(errors.join('\n'));
  report.push({orientation:format.name,score,errors,...JSON.parse(probe.stdout)});
  console.log(`✓ ${format.name}: real score ${score}; MP4 and screenshots saved.`);
 }
 await writeFile(resolve(output,'capture-report.json'),JSON.stringify({sourceCommit,capturedAt:new Date().toISOString(),audio:false,gameplay:'Real production input and physics; no fixtures',recordings:report},null,2)+'\n');
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
