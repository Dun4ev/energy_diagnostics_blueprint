// Deterministic animation on the approved product frames.
function frameEase(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
function frameText(text,x,y,maxWidth,lineHeight){
 let line='',yy=y;
 for(const word of text.split(' ')){
  const next=line?line+' '+word:word;
  if(line&&ctx.measureText(next).width>maxWidth){ctx.fillText(line,x,yy);yy+=lineHeight;line=word;}else line=next;
 }
 if(line)ctx.fillText(line,x,yy);
 return yy;
}
function frameRound(x,y,w,h,r,fill){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
}
function framePhoto(name,crop,x,y,w,h,contain){
 const img=asset(name); if(!img)return null;
 let [sx,sy,sw,sh]=crop; sx=Math.max(0,Math.min(sx,img.naturalWidth-1));sy=Math.max(0,Math.min(sy,img.naturalHeight-1));
 sw=Math.min(sw,img.naturalWidth-sx);sh=Math.min(sh,img.naturalHeight-sy);
 if(contain){
  const scale=Math.min(w/sw,h/sh); const dw=sw*scale,dh=sh*scale;
  const dx=x+(w-dw)/2,dy=y+(h-dh)/2;
  ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);
  return {sx,sy,sw,sh,dx,dy,dw,dh};
 }else{
  const dest=w/h,src=sw/sh;
  if(src>dest){const keep=sh*dest;sx+=(sw-keep)/2;sw=keep;}else{const keep=sw/dest;sy+=(sh-keep)/2;sh=keep;}
  ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
  return {sx,sy,sw,sh,dx:x,dy:y,dw:w,dh:h};
 }
}
function framePointer(map,box,t){
 if(!map||!box||t<.42||t>2.35)return;
 const [fx,fy,fw,fh]=box,scaleX=map.dw/map.sw,scaleY=map.dh/map.sh;
 const x=map.dx+(fx-map.sx)*scaleX,y=map.dy+(fy-map.sy)*scaleY,w=fw*scaleX,h=fh*scaleY;
 if(x+w<map.dx||y+h<map.dy||x>map.dx+map.dw||y>map.dy+map.dh)return;
 const reveal=frameEase((t-.42)/.25),travel=frameEase((t-.5)/.8),fade=1-frameEase((t-1.95)/.4);
 ctx.save();ctx.globalAlpha*=reveal*fade;ctx.strokeStyle='#007bc4';ctx.lineWidth=3;
 ctx.strokeRect(x-4,y-4,w+8,h+8);
 const tx=x+w*.55,ty=y+h*.55,px=tx+110*(1-travel),py=ty+100*(1-travel);
 ctx.translate(px,py);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,30);ctx.lineTo(8,22);ctx.lineTo(14,36);ctx.lineTo(20,33);ctx.lineTo(14,19);ctx.lineTo(27,19);ctx.closePath();
 ctx.fillStyle='#fff';ctx.strokeStyle='#0b3654';ctx.lineWidth=2.5;ctx.fill();ctx.stroke();ctx.restore();
 if(t>1.26&&t<1.75){const k=(t-1.26)/.49;ctx.save();ctx.globalAlpha=1-k;ctx.strokeStyle='#007bc4';ctx.lineWidth=3;ctx.beginPath();ctx.arc(tx,ty,9+20*k,0,Math.PI*2);ctx.stroke();ctx.restore();}
}
function sceneStill(i){
 const s=STEPS[i],dark=s.dark,bg=dark?'#082b47':'#f2f7fb',ink=dark?'#ffffff':'#103450',muted=dark?'#b2c9da':'#526d82',accent=dark?'#f28c22':'#0075bd';
 const t=Math.max(0,TT-s.at),duration=(i+1<STEPS.length?STEPS[i+1].at:DURATION)-s.at;
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle=dark?'rgba(255,255,255,.035)':'rgba(17,62,96,.035)';
 for(let x=55;x<W;x+=86)ctx.fillRect(x,117,1,850);
 ctx.fillStyle=ink;ctx.font='700 21px '+HAND;ctx.fillText('ЭнергоДиагностика · DEMO',68,65);
 ctx.font='700 17px '+HAND;ctx.textAlign='right';ctx.fillText('SIMULATION  ·  24.07.2026 10:40 МСК',1850,65);ctx.textAlign='left';
 ctx.fillStyle=accent;ctx.fillRect(70,170,40,3);ctx.font='700 20px '+HAND;ctx.fillText(s.tag,126,178);
 const titleY=276,titleH=103;
 s.title.forEach((line,j)=>{
  const entry=frameEase((t-.04-j*.095)/.55);ctx.save();ctx.globalAlpha*=entry;ctx.translate(0,30*(1-entry));
  let size=96;ctx.font='800 '+size+'px '+HAND;
  while(ctx.measureText(line).width>795&&size>49){size-=2;ctx.font='800 '+size+'px '+HAND;}
  ctx.fillStyle=(j===s.title.length-1&&(i===0||i===3||i===7||i===14))?accent:ink;
  ctx.fillText(line,68,titleY+j*titleH);
  ctx.restore();
 });
 const descY=titleY+s.title.length*titleH+38;
 const wordsIn=frameEase((t-.35)/.55);ctx.save();ctx.globalAlpha*=wordsIn;ctx.translate(0,14*(1-wordsIn));
 ctx.fillStyle=muted;ctx.font='400 29px '+HAND;frameText(s.desc,71,descY,730,42);ctx.restore();
 if(i===0){ctx.font='700 18px '+HAND;ctx.fillStyle='#b2c9da';ctx.fillText('СОВЕТЧИК  ·  БЕЗ КОМАНД В СЕТЬ',72,862);}
 if(i===7){ctx.font='700 19px '+HAND;ctx.fillStyle='#b2c9da';ctx.fillText('НАБЛЮДЕНИЕ     МОДЕЛЬ     ПРОВЕРКА',72,848);}
 if(i===15){ctx.font='700 18px '+HAND;ctx.fillStyle='#b2c9da';ctx.fillText('НАБЛЮДАТЕЛЬ: ПРОСМОТР     ИНЖЕНЕР',72,830);ctx.fillText('СОГЛАСУЮЩИЙ     ИСПОЛНИТЕЛЬ',72,860);}
 const x=938,y=172,w=890,h=658;
 const screenIn=frameEase((t-.03)/.7),drift=frameEase(t/Math.max(1,duration));
 ctx.save();ctx.globalAlpha*=screenIn;ctx.translate(68*(1-screenIn)-5*drift,18*(1-screenIn));
 ctx.save();ctx.shadowColor=dark?'rgba(0,0,0,.28)':'rgba(24,53,79,.20)';ctx.shadowBlur=44;ctx.shadowOffsetY=20;
 frameRound(x,y,w,h,4,'#ffffff');ctx.restore();
 ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,4);ctx.clip();
 if(s.kind!=='output'){
  // A slow push keeps the real interface legible while drawing attention into the evidence.
  const zoom=1+.045*drift,cx=x+w*.5,cy=y+h*.5;
  ctx.translate(cx,cy);ctx.scale(zoom,zoom);ctx.translate(-cx,-cy);
 }
 const before=Boolean(s.beforeImg&&t<(s.beforeEnd||1.62));
 const middle=Boolean(s.middleImg&&t>=(s.middleStart||1.62)&&t<(s.middleEnd||4));
 const after=Boolean(s.afterImg&&t>=(s.afterDelay||1.62));
 if(s.kind==='output'&&!before){
  ctx.fillStyle='#e3ecf1';ctx.fillRect(x,y,w,h);
  framePhoto(s.img,s.crop,x+22,y+22,380,h-44,true);
  frameRound(x+424,y+42,425,510,4,'#0c2b44');
  ctx.fillStyle='#8fc8ee';ctx.font='700 20px '+HAND;ctx.fillText('ФРАГМЕНТ JSON',x+455,y+84);
  ctx.fillStyle='#e8f4fb';ctx.font='400 18px Consolas, monospace';
  const lines=['"schemaVersion": "0.1.0",','"mode": "simulation",','"calculationOrigin": "computed",','"modelVersion":','  "deterministic-thermal-0.1.0",','"policyVersion":','  "demo-policy-0.1.0"'];
  lines.forEach((line,n)=>ctx.fillText(line,x+454,y+142+n*38));
 }else{
  const name=before?s.beforeImg:middle?s.middleImg:after?s.afterImg:s.img,crop=before?s.beforeCrop:middle?s.middleCrop:after?s.afterCrop:s.crop,focus=before?s.beforeFocus:middle?s.middleFocus:after?s.afterFocus:s.focus;
  const map=framePhoto(name,crop,x,y,w,h,true);
  if(before&&s.beforeFocus2){if(t<1.5)framePointer(map,focus,t);else framePointer(map,s.beforeFocus2,t-1.18);}
  else framePointer(map,focus,middle?t-(s.middleStart||1.62):after?t-(s.afterDelay||1.62):t);
 }
 ctx.restore();
 if(s.badge){
  const bx=1404,by=736,bw=425,bh=138;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=22;ctx.shadowOffsetY=10;
  frameRound(bx,by,bw,bh,2,'#0b426a');ctx.restore();ctx.fillStyle='#f28c22';ctx.fillRect(bx,by,5,bh);
  ctx.fillStyle='#fff';ctx.font='800 52px '+HAND;ctx.fillText(s.badge,bx+29,by+60);
  ctx.fillStyle='#bfd7e9';ctx.font='500 16px '+HAND;frameText(s.badge2,bx+30,by+88,bw-55,21);
 }
 ctx.restore();
 if(s.action){
  const actionIn=frameEase((t-.45)/.45);ctx.save();ctx.globalAlpha*=actionIn;ctx.translate(0,14*(1-actionIn));
  const label=(s.kind==='output'&&before)?'ПЕЧАТЬ ИЛИ ЭКСПОРТ JSON':before&&s.beforeAction?s.beforeAction:middle&&s.middleAction?s.middleAction:after&&s.afterAction?s.afterAction:s.action;
  const size=label.length>30?16:19;ctx.font='700 '+size+'px '+HAND;
  const aw=Math.min(725,ctx.measureText(label).width+48),ax=Math.min(1090,1830-aw),ay=850;
  frameRound(ax,ay,aw,48,2,dark?'#12689f':'#006fb5');ctx.fillStyle='#fff';ctx.fillText(label,ax+24,ay+31);
  ctx.restore();
 }
 const sourceNote=before&&s.beforeSource?s.beforeSource:middle&&s.middleSource?s.middleSource:after&&s.afterSource?s.afterSource:s.source;
 if(sourceNote){ctx.fillStyle=muted;ctx.font='700 23px '+HAND;ctx.fillText(sourceNote,938,936);}
 ctx.fillStyle=dark?'#8aa9bf':'#6b8192';ctx.font='700 16px '+HAND;
 ctx.fillText('УЧЕБНЫЕ ДАННЫЕ  ·  ВИРТУАЛЬНОЕ ВРЕМЯ',70,995);
 ctx.fillStyle=dark?'#31526a':'#dbe8f0';ctx.fillRect(70,1017,1780,3);
 ctx.fillStyle=accent;ctx.fillRect(70,1017,1780*Math.min(1,TT/DURATION),3);
}
