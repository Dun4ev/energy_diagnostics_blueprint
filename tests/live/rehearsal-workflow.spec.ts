import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const credentials = Object.fromEntries(fs.readFileSync('infra/.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
test('rehearsal: new unverified notes support step results without bypassing human verification', async ({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const note='Учебное доказательство: синтетическая независимая проверка. Не реальные измерения.';
 const resultNote='Учебный результат исполнителя. Не реальные работы. Требуется проверка согласующим.';
 async function login(role:string,url?:string){
  if(url)await page.goto(url);
  await expect(page.getByRole('button',{name:'Выйти',exact:true}).or(page.getByLabel('Пользователь',{exact:true}))).toBeVisible();
  if(await page.getByRole('button',{name:'Выйти',exact:true}).isVisible())await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await page.getByLabel('Пользователь',{exact:true}).fill(role);await page.getByLabel('Пароль',{exact:true}).fill(credentials[`DEMO_${role.toUpperCase()}_PASSWORD`]);await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('button',{name:'Выйти',exact:true})).toBeVisible();
 }
 async function decision(state:string,proof?:string){
  console.log('Состояние случая:',state);
  if(state==='На рассмотрении') { await page.getByRole('button',{name:'Взять на рассмотрение',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.feature-case-meta')).toContainText(state); return; }
  if(state==='Ожидает доказательств') { await page.getByRole('button',{name:'Указать недостающие материалы',exact:true}).click(); const d=page.getByRole('dialog',{name:'Указать недостающие материалы'}); await d.getByLabel('Какие материалы нужны и зачем').fill('Нужна термография для проверки дополнительного нагрева.'); await d.getByRole('button',{name:'Перевести в ожидание'}).click(); await expect(d).not.toBeVisible(); await expect(page.locator('.feature-case-meta')).toContainText(state); return; }

  await page.getByRole('button',{name:'Решение по случаю',exact:true}).click();const d=page.getByRole('dialog',{name:'Решение по случаю',exact:true});
  await d.getByLabel('Новое состояние').selectOption({label:state});await d.getByLabel('Основание',{exact:true}).fill('Явное решение человека в учебной репетиции: '+state);
  if(proof)await d.locator('label').filter({hasText:proof}).getByRole('checkbox').check();
  await d.getByRole('button',{name:'Записать решение',exact:true}).click();await expect(d).not.toBeVisible();await expect(page.locator('.feature-case-meta')).toContainText(state);
 }
 async function evidence(text:string){await page.getByRole('button',{name:'Открыть записи',exact:true}).click();const d=page.getByRole('dialog',{name:'Доказательства',exact:true});await d.getByLabel('Наблюдение',{exact:true}).fill(text);await d.getByLabel('Основание добавления').fill('Репетиция интерфейса на синтетических данных');await d.getByRole('button',{name:'Сохранить запись'}).click();await expect(d).not.toBeVisible();}
 async function planAction(name:string){console.log('План:',name);await page.getByRole('button',{name,exact:true}).click();const d=page.getByRole('dialog',{name,exact:true});await d.getByLabel('Основание',{exact:true}).fill('Учебная репетиция: '+name);await d.getByRole('button',{name:'Записать решение',exact:true}).click();await expect(d).not.toBeVisible();}
 await page.goto('/?choose=1');await login('engineer');
 const card=page.locator('.panel').filter({has:page.getByLabel('Время среза')});await card.getByLabel('Время среза').selectOption('last');await card.getByRole('button',{name:'Открыть сценарий'}).click();
 await expect(page.getByRole('link',{name:/ТП-177/})).toBeVisible({timeout:90000});await page.getByRole('link',{name:/ТП-177/}).click();await expect(page.getByRole('button',{name:'Взять на рассмотрение'})).toBeVisible();const caseUrl=page.url();
 await decision('На рассмотрении');await decision('Ожидает доказательств');await evidence(note);await decision('Подтвержден человеком',note);
 await page.getByRole('button',{name:'Создать проект проверки'}).click();const create=page.getByRole('dialog',{name:'Проект проверочных мероприятий'});await create.getByLabel('Основание проекта').fill('Учебный план: реальных работ не выполняем');await create.getByRole('button',{name:'Создать проект',exact:true}).click();await expect(page.getByRole('heading',{name:/План проверки/})).toBeVisible();const planUrl=page.url();
 await planAction('Передать на согласование');await login('viewer');await expect(page.getByRole('button',{name:'Согласовать',exact:true})).toHaveCount(0);await login('approver');await planAction('Согласовать');
 await login('engineer',caseUrl);await decision('Мероприятия запланированы');
 await login('technician',planUrl);await planAction('Начать выполнение');await page.goto(caseUrl);await evidence(resultNote);await page.goto(planUrl);
 await expect(page.getByRole('button',{name:'Результат шага 1',exact:true})).toBeVisible();
 const count=await page.getByRole('button',{name:/^Результат шага /}).count();expect(count).toBeGreaterThan(0);
 for(let i=1;i<=count;i++){
  await page.getByRole('button',{name:`Результат шага ${i}`,exact:true}).click();const d=page.getByRole('dialog',{name:'Записать результат проверки'});await d.getByLabel('Заключение').fill(`Учебный результат шага ${i}. Нужна независимая проверка; реальных работ не выполнялось.`);
  const choice=d.locator('label').filter({hasText:resultNote}).getByRole('checkbox');await expect(choice).toBeEnabled();await choice.check();await expect(d.locator('label').filter({hasText:resultNote})).toContainText('не проверено');
  if(i===1)await page.screenshot({path:'verification/rehearsal-result-dialog.png',fullPage:true});
  await d.getByRole('button',{name:'Сохранить результат'}).click();await expect(d).not.toBeVisible();
 }
 await planAction('Передать на проверку');await login('approver');await planAction('Записать завершение');await expect(page.locator('.feature-plan-meta')).toContainText('Выполнен');
 await login('engineer',caseUrl);await decision('Проверка результата');await login('approver');await decision('Закрыт',resultNote);
 await page.screenshot({path:'verification/rehearsal-closed.png',fullPage:true});await expect(page.getByRole('button',{name:'Экспорт JSON'})).toBeVisible();expect(errors).toEqual([]);
 fs.writeFileSync('verification/rehearsal-ui.json',JSON.stringify({caseUrl,planUrl,steps:count,caseState:'Закрыт',planState:'Выполнен',unverifiedEvidenceSelectable:true,independentApproval:true,errors},null,2));
});
