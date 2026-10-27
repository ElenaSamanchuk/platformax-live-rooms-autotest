// L-34: текст ошибки имени гостя и повторная отправка формы.
const {test,expect}=require('@playwright/test');
const h=require('./helpers');
test.use({trace:'off',video:'off'});
for(const mobile of [false,true]) test(`L-34: имя гостя ${mobile?'мобильная эмуляция390':'компьютер1440'}`,async({browser},info)=>{
 expect(new URL(h.BASE).hostname).toMatch(/\.test\.nn99\.ru$/);
 const owner=await browser.newContext({storageState:process.env.OWNER_STORAGE_STATE});
 const page=await owner.newPage();let id;let guest;
 try {
  await page.goto(h.BASE+'/profile',{waitUntil:'domcontentloaded'});
  const me=await page.evaluate(()=>{const p=JSON.parse(document.querySelector('#app').dataset.page).props;return {test:p.isProduction===false,id:p.user?.id,imp:!!p.impersonation}});
  expect(me.test&&!!me.id&&!me.imp,'тестовый сеанс владельца без подмены').toBe(true);
  await page.goto(h.BASE+'/admin/live-rooms',{waitUntil:'domcontentloaded'});
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.schoolRbac?.isOwner)).toBe(true);
  id=await h.createRoom(page,'QA-AT L34 имя гостя '+Date.now(),{meeting_method:'platform',guest_mode:'anonymous',visibility:'unlisted',entry_mode:'free'});
  expect(id).toBeGreaterThan(0);expect((await h.publish(page,id)).status).toBe(200);
  await page.goto(`${h.BASE}/admin/live-rooms/${id}/edit`,{waitUntil:'domcontentloaded'});
  const invite=await page.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.invitationUrl);
  guest=await browser.newContext({locale:'ru-RU',viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1});
  const g=await guest.newPage();await g.goto(invite,{waitUntil:'domcontentloaded'});
  await g.getByText('Войти как гость',{exact:true}).click();
  const input=g.locator('input[autocomplete=name]');await expect(input).toBeVisible();
  const submit=g.getByRole('button',{name:'Войти как гость',exact:true});
  for(const value of ['', '   ', '']){
   await input.fill(value);await submit.click();
   await expect(g.getByText('Введите имя',{exact:true}),'L-34: понятная ошибка под именем').toBeVisible();
   await expect(g.getByText('Поле Название необходимо заполнить.',{exact:true})).toHaveCount(0);
   await expect(submit).toBeEnabled();
  }
  await g.screenshot({path:info.outputPath('invalid-name.png')});
  await input.fill('QA-AT Гость');await submit.click();
  await expect(g).toHaveURL(new RegExp(`/live-rooms/${id}/guest/room$`));
  await expect(g.getByText('Ожидает начала',{exact:true})).toBeVisible();
  await expect(g.getByText('Введите имя',{exact:true})).toHaveCount(0);
  await g.screenshot({path:info.outputPath('valid-name-lobby.png')});
 } finally {
  if(guest)await guest.close();
  try {
   if(id){expect((await h.api(page,'POST',`/admin/live-rooms/${id}/unpublish`,{})).status).toBe(200);
    await page.goto(`${h.BASE}/admin/live-rooms/${id}/edit`,{waitUntil:'domcontentloaded'});
    const room=await page.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.liveRoom);const state=await h.state(page,id);
    expect({published:room.is_published,status:state.status,count:state.participants.length}).toEqual({published:false,status:'draft',count:0});
    console.log(`L-34 fixture ${id}: draft/unpublished/0`);
   }
  } finally {await owner.close();}
 }
});
