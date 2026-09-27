import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(path.join(dir,'index.html')).href+'?f=0');await page.waitForFunction(()=>window.__ready);
const metadata=await page.evaluate(()=>({total:RISO.total,plates:RISO.plates}));
for(let i=0;i<metadata.plates.length;i++){
 const p=metadata.plates[i];
 const data=await page.evaluate(({p})=>{const canvas=document.createElement('canvas');canvas.width=720;canvas.height=6*348;const c=canvas.getContext('2d');c.fillStyle='#d6e2ec';c.fillRect(0,0,720,2088);return Promise.all(Array.from({length:24},async(_,j)=>{const f=p.start+Math.round(j*(p.len-1)/23);const img=new Image();img.src=RISO.frame(f,180,7);await img.decode();const x=j%4*180,y=Math.floor(j/4)*348;c.drawImage(img,x,y);c.fillStyle='#17334d';c.font='12px monospace';c.fillText(`f=${f}`,x+8,y+338);})).then(()=>canvas.toDataURL());},{p});
 fs.writeFileSync(path.join(dir,`scene-${String(i+1).padStart(2,'0')}-contact.png`),Buffer.from(data.split(',')[1],'base64'));
}
const all=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=900;c.height=3*428;const x=c.getContext('2d');x.fillStyle='#d6e2ec';x.fillRect(0,0,c.width,c.height);for(let i=0;i<RISO.plates.length;i++){const p=RISO.plates[i],im=new Image();im.src=RISO.frame(p.start+Math.floor(p.len*.7),225,7);await im.decode();x.drawImage(im,i%4*225,Math.floor(i/4)*428);x.fillStyle='#17334d';x.font='12px sans-serif';x.fillText(`${i+1}. ${p.name.length>26?p.name.slice(0,25)+'…':p.name}`,i%4*225+6,Math.floor(i/4)*428+419);}return c.toDataURL();});
fs.writeFileSync(path.join(dir,'overview.png'),Buffer.from(all.split(',')[1],'base64'));
const contact=await page.evaluate(()=>RISO.contact(24,225));fs.writeFileSync(path.join(dir,'contact-sheet.png'),Buffer.from(contact.split(',')[1],'base64'));
await page.selectOption('#scene','11');const selected=await page.locator('#seek').inputValue();await page.click('#play');await page.waitForTimeout(400);const advanced=await page.locator('#seek').inputValue();await page.locator('#seek').fill('4499');await page.locator('#seek').dispatchEvent('input');await page.click('#play');await page.waitForTimeout(150);const restarted=Number(await page.locator('#seek').inputValue())<30;
const checks=await page.evaluate(()=>({same:RISO.frame(1700,360,7)===RISO.frame(1700,360,7),seed:RISO.frame(1700,360,7)!==RISO.frame(1700,360,12),overflow:document.documentElement.scrollWidth>innerWidth}));
await page.goto(pathToFileURL(path.join(dir,'index.html')).href+'?grid=24');await page.waitForFunction(()=>window.__ready);
const result={...metadata,errors,selected,advanced,restarted,...checks,gridReady:true};fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();if(errors.length||!checks.same||!checks.seed||checks.overflow||!restarted||Number(advanced)<=Number(selected))process.exit(1);
