// Product presentation animated from the approved storyboard.
const P={night:'#06182a',navy:'#0a2c47',blue:'#007ac3',sky:'#8dd1f8',orange:'#f28c22',paper:'#f2f7fa',ink:'#12354f',muted:'#5e7689'};
function pEase(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
function pReveal(delay,draw){const u=pEase((TT-E0-delay)/.55);ctx.save();ctx.globalAlpha*=u;ctx.translate(0,16*(1-u));draw();ctx.restore();}
function pText(s,x,y,size,color,weight=700){ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${HAND}`;ctx.fillText(s,x,y);}
function pLine(x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function pRect(x,y,w,h,fill,r=0){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function pCrop(name,source,x,y,w,h,contain=true){
 const a=asset(name);if(!a)return;
 let [sx,sy,sw,sh]=source;sx=Math.max(0,Math.min(sx,a.naturalWidth-1));sy=Math.max(0,Math.min(sy,a.naturalHeight-1));sw=Math.min(sw,a.naturalWidth-sx);sh=Math.min(sh,a.naturalHeight-sy);
 if(contain){const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(a,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
 else {const target=w/h;if(sw/sh>target){const keep=sh*target;sx+=(sw-keep)/2;sw=keep;}else{const keep=sw/target;sy+=(sh-keep)/2;sh=keep;}ctx.drawImage(a,sx,sy,sw,sh,x,y,w,h);}
}
function pShot(name,crop,x,y,w,h){
 const delay=name==='05-evidence.png'?.65:.15,enter=pEase((TT-E0-delay)/.7),drift=pEase((TT-E0)/5);
 ctx.save();ctx.globalAlpha*=enter;ctx.translate(58*(1-enter)-5*drift,20*(1-enter));
 ctx.save();ctx.shadowColor='rgba(0,19,38,.28)';ctx.shadowBlur=42;ctx.shadowOffsetY=18;pRect(x,y,w,h,'#fff',4);ctx.restore();
 ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,4);ctx.clip();pCrop(name,crop,x,y,w,h,true);ctx.restore();
 ctx.restore();
}
function pHead(light,number){
 const ink=light?P.ink:'#f2f8fc',muted=light?'#506c80':'#aac5d7';
 pText('ЭНЕРГОДИАГНОСТИКА  /  ПРОТОТИП',72,62,20,ink,750);
 ctx.textAlign='right';pText('SIMULATION  ·  УЧЕБНЫЕ ДАННЫЕ  ·  24.07.2026 10:40 МСК',1848,62,17,muted,700);ctx.textAlign='left';
 pLine(72,1000,1848,1000,light?'#d5e4ee':'#33536c',2);
 pRect(72,1000,1776*Math.min(1,TT/DURATION),3,light?P.blue:P.orange);
 pText('СИНТЕТИЧЕСКИЙ ПРИМЕР  ·  СОВЕТЧИК БЕЗ КОМАНД В СЕТЬ',72,976,15,muted,700);
}
function pTitle(lines,x,y,size,light=false,accent=-1){
 const main=light?P.ink:'#f5f9fc';lines.forEach((s,i)=>{const u=pEase((TT-E0-.05-i*.11)/.56);ctx.save();ctx.globalAlpha*=u;ctx.translate(-24*(1-u),26*(1-u));pText(s,x,y+i*size*1.03,size,i===accent?(light?P.blue:P.orange):main,800);ctx.restore();});
}
function pGrid(){const shift=((TT-E0)*9)%100;ctx.strokeStyle='rgba(140,201,235,.07)';ctx.lineWidth=1;for(let x=80-shift;x<1900;x+=100)pLine(x,105,x,952,'rgba(140,201,235,.07)');for(let y=180;y<950;y+=100)pLine(70,y,1850,y,'rgba(140,201,235,.05)');}
function pChart(x,y,w,h){
 const lo=30,hi=85;ctx.save();
 for(let tick=40;tick<=80;tick+=10){let yy=y+h-(tick-lo)/(hi-lo)*h;pLine(x,yy,x+w,yy,'rgba(174,208,229,.22)',1);pText(String(tick),x-38,yy+6,18,'#a6c4d7',500);}
 const stroke=(field,color,dashed,delay)=>{const u=pEase((TT-E0-delay)/2.4),last=Math.max(1,Math.round((PRODUCT_SERIES.length-1)*u));ctx.strokeStyle=color;ctx.lineWidth=5;ctx.setLineDash(dashed?[12,10]:[]);ctx.lineJoin='round';ctx.beginPath();PRODUCT_SERIES.slice(0,last+1).forEach((v,i)=>{const px=x+i/(PRODUCT_SERIES.length-1)*w,py=y+h-(v[field]-lo)/(hi-lo)*h;if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();ctx.setLineDash([]);const v=PRODUCT_SERIES[last],px=x+last/(PRODUCT_SERIES.length-1)*w,py=y+h-(v[field]-lo)/(hi-lo)*h;ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill();};
 stroke('expectedC','#51b9f4',true,.25);stroke('observedC','#f58b24',false,.6);
 pText('21.07',x,y+h+38,18,'#a6c4d7',600);pText('22.07',x+w/3,y+h+38,18,'#a6c4d7',600);pText('23.07',x+2*w/3,y+h+38,18,'#a6c4d7',600);ctx.textAlign='right';pText('24.07',x+w,y+h+38,18,'#a6c4d7',600);ctx.textAlign='left';ctx.restore();
}
function productScene(i){
 const light=SHOTS[i].light,local=Math.max(0,TT-E0),dur=(i+1<SHOTS.length?SHOTS[i+1].at:DURATION)-SHOTS[i].at;ctx.fillStyle=light?P.paper:P.night;ctx.fillRect(0,0,W,H);
 if(i===0||i===11){
  const z=1.025+.035*pEase(local/Math.max(1,dur));ctx.save();ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-W/2,-H/2);pCrop('transformer-cgi.png',[0,0,1680,941],0,0,W,H,false);ctx.restore();
  const g=ctx.createLinearGradient(0,0,1300,0);g.addColorStop(0,'rgba(3,15,29,.92)');g.addColorStop(.55,'rgba(3,15,29,.72)');g.addColorStop(1,'rgba(3,15,29,0)');ctx.fillStyle=g;ctx.fillRect(0,0,1400,H);
  if(i===0){pText('СОСТОЯНИЕ ОБОРУДОВАНИЯ',78,212,22,P.sky,700);pTitle(['В ФОКУСЕ','ИНЖЕНЕРНОГО','РЕШЕНИЯ.'],75,315,91,false,2);pText('ЭнергоДиагностика',80,675,36,'#d5e7f2',650);pText('Данные. Анализ. Обоснование.',80,727,27,'#a9c3d3',400);}
  else {pText('ЭНЕРГОДИАГНОСТИКА',78,222,23,P.sky,700);pTitle(['БОЛЬШЕ','КОНТЕКСТА','ДЛЯ РЕШЕНИЯ.'],75,325,92,false,2);pText('Советчик. Решение принимает человек.',80,745,29,'#d6e8f2',500);}
  ctx.textAlign='right';pText('ИЛЛЮСТРАЦИЯ ОБОРУДОВАНИЯ',1848,935,22,'#d3e2ed',700);ctx.textAlign='left';
 }else if(i===1){
  pGrid();pText('ЦЕННОСТЬ ПРОДУКТА',76,198,22,P.sky,700);pTitle(['ДАННЫЕ.','КОНТЕКСТ.','РЕШЕНИЕ.'],73,318,116,false,2);
  pLine(1210,175,1210,817,'#42677f',2);pReveal(.25,()=>{pText('01',1280,340,70,'#89c8ec',750);pText('НАБЛЮДЕНИЯ',1380,333,30,'#e9f5fb',700);});pReveal(.95,()=>{pText('02',1280,490,70,'#89c8ec',750);pText('АНАЛИЗ',1380,483,30,'#e9f5fb',700);});pReveal(1.65,()=>{pText('03',1280,640,70,P.orange,750);pText('ОБОСНОВАНИЕ',1380,633,30,'#e9f5fb',700);});
  pText('От сигнала к понятной основе для инженерного решения.',78,796,29,'#afc9d9',400);
 }else if(i===2){
  pText('01  /  ОБОРУДОВАНИЕ',74,188,21,P.blue,700);pTitle(['ЕДИНАЯ','КАРТИНА','СОСТОЯНИЯ.'],72,295,91,true,2);
  pText('Активы, сигналы и диагностические случаи',76,674,28,P.muted,400);pText('в одном рабочем пространстве.',76,716,28,P.muted,400);
  pShot('assets-overview.png',[235,225,1345,665],940,196,900,610);pReveal(1.2,()=>{pRect(1340,747,500,120,P.navy,3);pText('9 АКТИВОВ',1370,805,47,'#fff',800);pText('В УЧЕБНОМ НАБОРЕ',1370,840,17,'#a8cada',700);});
 }else if(i===3){
  pGrid();pText('02  /  АНАЛИЗ НАБЛЮДЕНИЙ',74,181,21,P.sky,700);pTitle(['ОТКЛОНЕНИЕ','В КОНТЕКСТЕ.'],73,282,91,false,1);pText('С учетом нагрузки и температуры',78,449,27,'#bed6e5',400);pText('окружающей среды.',78,490,27,'#bed6e5',400);
  pChart(950,260,800,430);pText('ТЕМПЕРАТУРА, °C  ·  72 ЧАСА',950,217,18,'#9bbbd0',700);
  pLine(950,754,1002,754,P.orange,5);pText('ИЗМЕРЕНО',1015,763,20,'#dcecf5',700);pLine(1390,754,1442,754,'#51b9f4',5);pText('ОЖИДАЛОСЬ',1455,763,20,'#dcecf5',700);
  pReveal(3.0,()=>{pText('58,9 °C',1150,763,20,'#dcecf5',700);pText('47,1 °C',1610,763,20,'#dcecf5',700);pRect(73,585,470,150,'#0d466a',3);pText('+11,8 °C',102,656,61,'#fff',800);pText('УЧЕБНОЕ ОТКЛОНЕНИЕ',103,698,18,'#a9c8d9',700);});
 }else if(i===4){
  pText('03  /  ПРИОРИТЕТ',74,184,21,P.blue,700);pTitle(['ПРИОРИТЕТ','ДЛЯ РАЗБОРА.'],72,285,91,true,1);pText('Сигнал, приоритет и качество данных',76,667,28,P.muted,400);pText('в одной очереди.',76,709,28,P.muted,400);
  pShot('09-queue.png',[245,458,1325,432],920,200,920,555);pReveal(1.45,()=>{pRect(1115,740,725,115,P.navy,3);pText('5,4 / 10',1145,802,53,'#fff',800);pText('УЧЕБНЫЙ ИНДЕКС  ·  НЕ ВЕРОЯТНОСТЬ ОТКАЗА',1395,791,16,'#bfd8e7',700);});
 }else if(i===5){
  pGrid();pText('04  /  КАЧЕСТВО ДАННЫХ',74,190,21,P.sky,700);pTitle(['НЕДОСТАТОЧНО','ДАННЫХ?'],72,305,91,false,1);pText('Оценка остается неизвестной.',78,520,35,'#c4dbe8',500);pText('Недостаток данных не превращается в безопасный ноль.',78,578,25,'#a1bfd0',400);
  {const u=pEase((local-.35)/.7);ctx.save();ctx.globalAlpha*=u;ctx.translate(55*(1-u),0);pRect(1090,226,690,452,'#e9f1f6',4);pText('УЧЕБНЫЙ ПРИМЕР',1135,287,20,P.muted,700);pText('ТП-307 / Т-1',1135,390,49,P.ink,800);pLine(1135,425,1735,425,'#c3d6e1',2);pText('ОЦЕНКА',1135,494,20,P.muted,700);pReveal(1.35,()=>pText('НЕИЗВЕСТНО',1135,558,46,'#5d7180',800));pText('КАЧЕСТВО: НЕДОСТАТОЧНО',1135,614,20,P.muted,700);ctx.restore();}
 }else if(i===6){
  pGrid();pText('05  /  ОБОСНОВАНИЕ',74,185,21,P.sky,700);pTitle(['ПРИЗНАКИ.','ГИПОТЕЗА.','ДОКАЗАТЕЛЬСТВА.'],72,285,79,false,1);pText('Инженер видит, что известно и что требует проверки.',78,704,26,'#b2cbd9',400);
  pShot('04-hypothesis.png',[795,115,755,560],920,166,610,590);pShot('05-evidence.png',[795,115,755,560],1290,300,550,470);
  pReveal(1.7,()=>{pRect(1160,790,680,66,'#124e73',3);pText('ГИПОТЕЗА НЕ ЯВЛЯЕТСЯ ПОДТВЕРЖДЕННЫМ ДЕФЕКТОМ',1185,832,17,'#d9edf7',700);});
 }else if(i===7){
  pText('06  /  ПРОЦЕСС',74,188,21,P.blue,700);pTitle(['ОТ АНАЛИЗА','К ПЛАНУ.'],72,301,98,true,1);pText('Основание, шаги проверки и согласование',76,518,29,P.muted,400);pText('связаны с диагностическим случаем.',76,560,29,P.muted,400);
  pLine(190,765,1725,765,'#b1cfdf',5);const boxes=[{x:190,n:'01',s:'СИГНАЛ'},{x:740,n:'02',s:'ПРОЕКТ ПЛАНА'},{x:1330,n:'03',s:'СОГЛАСОВАНИЕ'}];
  boxes.forEach((b,j)=>{const u=pEase((local-.25-j*.32)/.6);ctx.save();ctx.globalAlpha*=u;ctx.translate(0,24*(1-u));pRect(b.x,700,420,136,j===1?'#e3f3fc':'#fff',4);pText(b.n,b.x+25,746,23,j===1?P.blue:P.muted,700);pText(b.s,b.x+25,800,27,P.ink,800);ctx.restore();});
  {const x=190+1535*pEase((local-.7)/3);ctx.fillStyle=P.blue;ctx.beginPath();ctx.arc(x,765,6,0,Math.PI*2);ctx.fill();}
 }else if(i===8){
  pText('07  /  КОМАНДА',74,186,21,P.sky,700);pTitle(['ОДИН ПРОЦЕСС.','РАЗНЫЕ РОЛИ.'],72,287,84,false,1);pText('Ответственность и решения сохраняются по участникам.',78,515,27,'#b2cbd9',400);
  const roles=[['ИНЖЕНЕР','АНАЛИЗ И ПЛАН'],['СОГЛАСУЮЩИЙ','РЕШЕНИЕ ПО ПЛАНУ'],['ИСПОЛНИТЕЛЬ','РЕЗУЛЬТАТ ПРОВЕРКИ'],['НАБЛЮДАТЕЛЬ','ПРОСМОТР']];
  roles.forEach((v,j)=>{let x=78+j*438,u=pEase((local-.2-j*.48)/.6);ctx.save();ctx.globalAlpha*=u;ctx.translate(0,24*(1-u));pRect(x,650,405,160,j===1?'#11577e':'#10364f',4);pText(v[0],x+24,716,23,'#fff',800);pText(v[1],x+24,763,17,'#a9cbdc',700);ctx.restore();});
 }else if(i===9){
  pText('08  /  ПРОСЛЕЖИВАЕМОСТЬ',74,188,21,P.blue,700);pTitle(['ИСТОРИЯ','РЕШЕНИЙ','СОХРАНЯЕТСЯ.'],72,290,83,true,2);pText('Автор, время, основание и ревизии',76,672,28,P.muted,400);pText('остаются доступны для проверки.',76,714,28,P.muted,400);
  pShot('case-history.png',[215,110,1380,760],940,202,900,590);pReveal(1.2,()=>{pRect(1130,777,710,75,P.navy,3);pText('УЧЕБНАЯ ИСТОРИЯ РЕШЕНИЙ',1156,825,20,'#edf8fc',750);});
  ['АВТОР','ВРЕМЯ','РЕВИЗИЯ'].forEach((s,j)=>pReveal(1.45+j*.45,()=>{const x=76+j*225;pRect(x,788,202,54,'#e1edf4',3);pText(s,x+19,824,18,P.ink,750);}));
 }else if(i===10){
  pText('09  /  РЕЗУЛЬТАТ',74,184,21,P.sky,700);pTitle(['ЧТО ПОЛУЧАЕТ','КОМАНДА.'],72,280,93,false,1);pText('План проверки  ·  история  ·  печатный вид  ·  JSON',78,476,26,'#b4cede',500);
  pShot('case-print-conclusion.png',[0,0,1224,1584],1030,163,360,645);
  {const u=pEase((local-.6)/.7);ctx.save();ctx.globalAlpha*=u;ctx.translate(50*(1-u),0);pRect(1435,205,408,510,'#103b59',4);pText('ФРАГМЕНТ JSON',1460,257,20,'#8dc9ec',700);ctx.font='400 18px Consolas, monospace';ctx.fillStyle='#e5f4fb';['"mode": "simulation",','"calculationOrigin": "computed",','"modelVersion":','  "deterministic-thermal-0.1.0",','"policyVersion":','  "demo-policy-0.1.0"'].forEach((s,j)=>{const a=pEase((local-1-j*.18)/.35);ctx.save();ctx.globalAlpha*=a;ctx.fillText(s,1460,315+j*48);ctx.restore();});ctx.restore();}
  pText('ФРАГМЕНТ ПЕЧАТНОГО ВИДА',1030,860,18,'#a9cada',700);pText('ФРАГМЕНТ УЧЕБНОГО ПРИМЕРА',1435,860,18,'#a9cada',700);
 }
 if(i>0&&local<.5){const x=-80+2080*pEase(local/.5);pRect(x,105,4,850,light?'rgba(0,122,195,.35)':'rgba(141,209,248,.4)');}
 pHead(light,i);
}
