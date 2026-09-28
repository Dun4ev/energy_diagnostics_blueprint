import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const url=pathToFileURL(path.join(root,'index.html')).href;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url+'?f=0&w=1280');await page.waitForFunction(()=>window.__ready===true);
const info=await page.evaluate(()=>({total:RISO.total,plates:RISO.plates}));
let offset=0;const plates=info.plates.map(p=>{const value={...p,start:offset};offset+=p.len;return value;});
if(offset!==info.total)throw Error('Timeline mismatch');
for(let start=0;start<plates.length;start+=9){
 const batch=plates.slice(start,start+9);
 const data=await page.evaluate(async ({batch,start})=>{
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=Math.ceil(batch.length/3)*310;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#d6e2ec';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let j=0;j<batch.length;j++){const p=batch[j],img=new Image();img.src=RISO.frame(p.start+Math.floor(p.len*.72),480,7);await img.decode();const x=j%3*480,y=Math.floor(j/3)*310;ctx.drawImage(img,x,y,480,270);ctx.fillStyle='#17334d';ctx.font='15px sans-serif';ctx.fillText(`${start+j+1}. ${p.name}`,x+8,y+295,460);}
  return canvas.toDataURL();
 },{batch,start});
 fs.writeFileSync(path.join(root,`overview-${Math.floor(start/9)+1}.png`),Buffer.from(data.split(',')[1],'base64'));
}
const contact=await page.evaluate(()=>RISO.contact(24,320));fs.writeFileSync(path.join(root,'contact-sheet.png'),Buffer.from(contact.split(',')[1],'base64'));
await page.screenshot({path:path.join(root,'player.png'),fullPage:true});
await page.click('#next');await page.waitForTimeout(250);const nextMoved=Number(await page.locator('#seek').inputValue())>plates[1].start;
await page.selectOption('#scene','10');await page.waitForTimeout(100);const transcript=await page.locator('#fields').innerText();if(!transcript.includes('Наблюдение'))throw Error('Transcript failed');
await page.locator('#seek').fill(String(plates[10].start+plates[10].len-1));await page.locator('#seek').dispatchEvent('input');await page.click('#repeat');await page.waitForTimeout(250);const repeated=Number(await page.locator('#seek').inputValue())<plates[10].start+30;
await page.click('#play');await page.waitForTimeout(250);await page.click('#play');const paused=await page.locator('#seek').inputValue();await page.waitForTimeout(150);const pauseWorks=paused===await page.locator('#seek').inputValue();
await page.locator('#seek').fill(String(plates[10].start+Math.floor(plates[10].len*.72)));await page.locator('#seek').dispatchEvent('input');await page.screenshot({path:path.join(root,'evidence-player.png'),fullPage:true});
if(!nextMoved||!repeated||!pauseWorks)throw Error('Player controls failed');
const deterministic=await page.evaluate(()=>RISO.frame(100,640,7)===RISO.frame(100,640,7));
const framesChecked=await page.evaluate(()=>{for(let n=0;n<RISO.total;n+=30)RISO.frame(n,320,7);return Math.ceil(RISO.total/30);});
await page.setViewportSize({width:390,height:844});const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
await page.goto(url+'?grid=24');await page.waitForFunction(()=>window.__ready===true);
const result={...info,errors,deterministic,framesChecked,mobileOverflow,nextMoved,repeated,pauseWorks,gridReady:true};fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({total:info.total,scenes:plates.length,errors,deterministic,framesChecked,mobileOverflow}));
await browser.close();if(errors.length||!deterministic||mobileOverflow)process.exit(1);
