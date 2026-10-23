// Узкий PM-ретест: отдельный файл, без зависимости от изменяемых helpers.
// BASE_URL, OWNER_STORAGE_STATE, QA_OWNER_ID задаются окружением. Только *.test.*.
const {test, expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.BASE_URL;
if(!base || !/\.test\./.test(new URL(base).hostname)) throw new Error('PM: нужен разрешённый тестовый BASE_URL');
const out=process.env.QA_OUT || 'qa-out/pm-followup-1023';
const record=value=>{fs.mkdirSync(out,{recursive:true});fs.appendFileSync(path.join(out,'facts.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');};
test.use({storageState:process.env.OWNER_STORAGE_STATE,timezoneId:'Europe/Minsk',locale:'ru-RU',trace:'off',video:'off',screenshot:'off',actionTimeout:20000,navigationTimeout:30000});
async function props(page){return page.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props);}
async function goto(page, pathname){
 // Readiness is the rendered page/role, not completion of unrelated external assets.
 await page.goto(base+pathname,{waitUntil:'domcontentloaded'});
 await page.locator('#app[data-page]').waitFor({state:'attached'});
}
async function requireOwner(page){
 await goto(page,'/admin/live-rooms');
 const p=await props(page);
 const expected=Number(process.env.QA_OWNER_ID);
 expect(expected,'QA_OWNER_ID должен быть явно задан').toBeGreaterThan(0);
 expect(p.auth?.user?.id,'BLOCKED_AUTH: owner-сессия должна быть подтверждена до записи').toBe(expected);
 expect(p.schoolRbac?.isOwner,'только владелец QA-школы').toBe(true);
 record({event:'owner',id:expected,build:await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src.split('/').pop()).filter(x=>/^admin-/.test(x)))});
}
test('PM preflight: подтверждённый владелец до мутаций',async({page})=>{await requireOwner(page);});
test('H-PM-1: время не сдвигается после двух сохранений',async({page})=>{
 await requireOwner(page);await goto(page,'/admin/live-rooms/create');
 await page.getByLabel('Название',{exact:true}).fill('QA-AT PM время '+Date.now());
 await page.getByRole('button',{name:'Дата и время',exact:true}).click();
 await page.getByRole('button',{name:'Следующий месяц',exact:true}).click();
 await page.getByRole('button',{name:'15',exact:true}).click();
 await page.locator('#room-date_time').fill('18:00');
 await page.getByRole('button',{name:'Готово',exact:true}).click();
 const ui=await page.locator('#room-date').innerText();
 await page.getByRole('button',{name:'Сохранить встречу',exact:true}).click();
 await page.waitForURL(/\/admin\/live-rooms\/\d+\/edit$/,{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'domcontentloaded'});
 const before=(await props(page)).liveRoom;
 expect(before.is_published,'собственная встреча остаётся скрытой').toBe(false);
 for(let repeat=1;repeat<=2;repeat++){
  await Promise.all([page.waitForResponse(r=>r.url().includes('/admin/live-rooms/'+before.id)&&['POST','PUT','PATCH'].includes(r.request().method())),page.getByRole('button',{name:'Сохранить',exact:true}).click()]);
  await expect(page.getByRole('button',{name:'Сохранить',exact:true})).toBeEnabled();
  await page.reload({waitUntil:'domcontentloaded'});const after=(await props(page)).liveRoom;
  expect(after.scheduled_at,'H-PM-1: серверное время не изменилось').toBe(before.scheduled_at);
  await expect(page.locator('#room-date'),'H-PM-1: локальное время не изменилось').toHaveText(ui);
  expect(after.is_published).toBe(false);record({event:'H-PM-1',id:after.id,repeat,scheduled_at:after.scheduled_at,published:false,status:after.status});
 }
});
test('H-PM-3: две новые неактивные услуги с пустой длительностью сохраняются как 60',async({page})=>{
 await requireOwner(page);
 for(let repeat=1;repeat<=2;repeat++){
  const title='QA-AT PM пустая длительность '+Date.now()+'-'+repeat;
  await goto(page,'/admin/services');await page.getByRole('button',{name:'Добавить услугу',exact:true}).click();
  await page.getByLabel('Название',{exact:true}).fill(title);
  // The native input is covered by its decorative span; use the visible label.
  await page.getByText('Услуга активна',{exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Услуга активна',exact:true})).not.toBeChecked();
  await page.getByRole('tab',{name:'Запись',exact:true}).click();
  await expect(page.locator('#service-duration')).toHaveValue('');
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForURL(/\/admin\/services$/,{waitUntil:'domcontentloaded'});
  // The current list opens an editor by clicking the service name; actions are collapsed.
  await page.getByRole('cell',{name:title,exact:true}).click();
  await page.waitForURL(/\/admin\/services\/\d+\/edit$/,{waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'Запись',exact:true}).click();
  await expect(page.locator('#service-duration'),'H-PM-3: пустая длительность стала 60').toHaveValue('60');
  record({event:'H-PM-3',id:Number(page.url().match(/services\/(\d+)/)[1]),repeat,inactive:true,duration:60});
 }
});
test('L-PM-3: календарь показывает русские дни недели после повторной загрузки',async({page})=>{
 await requireOwner(page);
 for(let repeat=1;repeat<=2;repeat++){
  await goto(page,'/admin/service-sessions');
  const dismissGuide=page.getByRole('button',{name:'Сам разберусь',exact:true});
  if(await dismissGuide.isVisible()) await dismissGuide.click();
  // Each weekday is a separate node; require all seven localized labels.
  for(const day of ['пн','вт','ср','чт','пт','сб','вс']){
   await expect(page.getByText(new RegExp('^'+day+',\\s*\\d{2}\\.\\d{2}$')),'L-PM-3: русская подпись '+day).toBeVisible();
  }
  record({event:'L-PM-3',repeat});
 }
});
