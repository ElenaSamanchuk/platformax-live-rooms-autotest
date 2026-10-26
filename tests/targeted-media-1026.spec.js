// Narrow regression using existing Live helpers and native RTCPeerConnection stats.
// Synthetic devices only. Recording test is an availability gate, not a lifecycle test.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const h=require('./helpers');
const FLAGS=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio'];
test.use({trace:'off',video:'off',screenshot:'off',launchOptions:{args:FLAGS}});
function config(){
 if(createHash('sha256').update(h.BASE).digest('hex')!=='97e20ccde9e167697098f7e24a08a889bd2a6040186ac5d7559f6c75075d0db6')throw Error('BLOCKED_ORIGIN: approved Live test origin required');
 if(process.env.LIVE_MEDIA_RUN_APPROVED!=='1')throw Error('BLOCKED_APPROVAL: LIVE_MEDIA_RUN_APPROVED=1 required');
 const state=process.env.LIVE_OWNER_STORAGE_STATE,id=Number(process.env.LIVE_EXPECTED_OWNER_ID),out=process.env.QA_OUT;
 if(!state||!fs.existsSync(state)||!Number.isInteger(id)||id<=0||!out)throw Error('BLOCKED_FIXTURE: explicit LIVE_OWNER_STORAGE_STATE, LIVE_EXPECTED_OWNER_ID and QA_OUT required');
 return{state,id,out};
}
const clean=e=>String(e.message||e).replace(/(?:https?|wss?):[^\s)]+/g,'[URL]').replace(/eyJ[A-Za-z0-9_.-]{30,}/g,'[TOKEN]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]').slice(0,600);
function journal(cfg,entry){fs.mkdirSync(cfg.out,{recursive:true});fs.appendFileSync(path.join(cfg.out,'facts.jsonl'),JSON.stringify({at:new Date().toISOString(),...entry})+'\n');}
async function verifyOwner(p,cfg){
 await p.goto(h.BASE+'/profile',{waitUntil:'domcontentloaded'});
 await p.locator('#app[data-page]').waitFor({state:'attached'});
 const actual=await p.evaluate(()=>{const d=JSON.parse(document.querySelector('#app').dataset.page).props;return{id:d.user?.id??null,authId:d.auth?.user?.id??null,test:d.isProduction===false,impersonation:!!d.impersonation}});
 expect({id:actual.id,test:actual.test,impersonation:actual.impersonation},'BLOCKED_AUTH: exact owner/test/no impersonation required').toEqual({id:cfg.id,test:true,impersonation:false});if(actual.authId!==null)expect(actual.authId,'Contradicting auth.user ID must reject the fixture').toBe(cfg.id);
 await p.goto(h.BASE+'/admin/live-rooms',{waitUntil:'domcontentloaded'});
 expect(await p.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.schoolRbac?.isOwner),'BLOCKED_ROLE: owner permission required before mutations').toBe(true);
 return actual;
}
async function ensureUnpublished(p,id){
 await p.goto(`${h.BASE}/admin/live-rooms/${id}/edit`,{waitUntil:'domcontentloaded'});
 if(await p.evaluate(()=>!!JSON.parse(document.querySelector('#app').dataset.page).props.liveRoom.is_published)){
  // URI comes from the actual current client registry, not an invented endpoint.
  const uri=await p.evaluate(id=>route('admin.live-rooms.unpublish',id),id);expect(new URL(uri,h.BASE).origin).toBe(h.BASE);
  expect((await h.api(p,'POST',uri)).status,'Own fixture must be unpublished even if start failed').toBe(200);
  await p.reload({waitUntil:'domcontentloaded'});
 }
 expect(await p.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.liveRoom.is_published)).toBe(false);
}
async function withOwnRoom(browser,info,body){
 const cfg=config(),begun=Date.now();let owner,guest,id,pendingTitle,primary,cleanupError;
 try{
  owner=await browser.newContext({storageState:cfg.state,permissions:['camera','microphone'],locale:'ru-RU',viewport:{width:1440,height:900}});
  const p=await owner.newPage();const identity=await verifyOwner(p,cfg);
  const build=await p.locator('script[src]').evaluateAll(es=>es.map(e=>e.src.split('/').pop()).filter(n=>/^admin-/.test(n)));
  journal(cfg,{event:'preflight',test:info.title,identity,build});
  pendingTitle='QA-AT Live synthetic media '+randomUUID();journal(cfg,{event:'pending-create',title:pendingTitle,test:info.title});
  id=await h.createRoom(p,pendingTitle,{meeting_method:'platform',guest_mode:'anonymous',visibility:'unlisted',entry_mode:'free',hand_raise_enabled:'0',max_participants:'4'});
  journal(cfg,{event:'created-own-room',id,test:info.title}); // durable before publish/start
  guest=await browser.newContext({permissions:['camera','microphone'],locale:'ru-RU',viewport:{width:1440,height:900}});
  await body({cfg,p,owner,guest,id});
 }catch(e){primary=e;journal(cfg,{event:'test-exit',id,error:clean(e)});const page=owner?.pages()[0];if(page&&!page.isClosed()){journal(cfg,{event:'exit-media-snapshot',id,stats:await stats(page).catch(()=>[])});await page.screenshot({path:info.outputPath('failure.png')}).catch(()=>{});}}
 finally{
  info.setTimeout(Math.max(info.timeout,Date.now()-begun+60000));
  // Recover only a unique exact own title if the helper lost its successful redirect.
  if(!id&&pendingTitle){let recovery;try{recovery=await browser.newContext({storageState:cfg.state,locale:'ru-RU'});const page=await recovery.newPage();await verifyOwner(page,cfg);const ids=await page.evaluate(title=>{const ids=new Set();const props=JSON.parse(document.querySelector('#app').dataset.page).props;const visit=(v,n=0)=>{if(!v||typeof v!=='object'||n>12)return;if(v.title===title&&Number.isInteger(v.id)&&v.id>0)ids.add(v.id);for(const x of Object.values(v))visit(x,n+1)};visit(props);return[...ids]},pendingTitle);if(ids.length!==1)throw Error('Pending-create recovery unresolved: exact own title matches='+ids.length+'; manual review required, no broad cleanup');id=ids[0];journal(cfg,{event:'recovered-created-id',id,title:pendingTitle});}catch(e){cleanupError=e;journal(cfg,{event:'pending-create-unresolved',title:pendingTitle,error:clean(e)})}finally{if(recovery)await recovery.close().catch(()=>{})}}
  // A separate saved-owner context survives closed/crashed test pages. No impersonation.
  if(id){let cleanup;try{
   cleanup=await browser.newContext({storageState:cfg.state,locale:'ru-RU'});const p=await cleanup.newPage();await verifyOwner(p,cfg);
   const initial=await h.state(p,id);if(initial.status==='draft'){expect((initial.participants||[]).length).toBe(0);await ensureUnpublished(p,id);const retained=await h.state(p,id);expect({status:retained.status,participants:(retained.participants||[]).length}).toEqual({status:'draft',participants:0});journal(cfg,{event:'cleanup-unstarted-draft',id,status:'draft',published:false,participants:0});}else{const response=await h.finish(p,id);expect(response.status,'Own-room finish must succeed').toBe(200);
   await expect.poll(async()=>{const s=await h.state(p,id);return{status:s.status,participants:(s.participants||[]).length}},{timeout:30000}).toEqual({status:'finished',participants:0});
   await ensureUnpublished(p,id);const final=await h.state(p,id);expect({status:final.status,participants:(final.participants||[]).length}).toEqual({status:'finished',participants:0});journal(cfg,{event:'cleanup-pass',id,status:'finished',published:false,participants:0});}
  }catch(e){cleanupError=e;journal(cfg,{event:'cleanup-failed',id,error:clean(e)});}finally{if(cleanup)await cleanup.close().catch(()=>{});}}
  if(guest)await guest.close().catch(()=>{});if(owner)await owner.close().catch(()=>{});
 }
 if(cleanupError)throw new AggregateError([primary,cleanupError].filter(Boolean),'Cleanup failed; inspect durable own-room IDs/facts');
 if(primary)throw primary;
}
async function instrument(ctx){
 await ctx.addInitScript(()=>{const Native=window.RTCPeerConnection;window.__qaPeers=[];window.RTCPeerConnection=new Proxy(Native,{construct(target,args,newTarget){const pc=Reflect.construct(target,args,newTarget);window.__qaPeers.push(pc);return pc;}});});
}
async function stats(p){return p.evaluate(async()=>{
 const peers=[];for(let i=0;i<(window.__qaPeers||[]).length;i++){
  const pc=window.__qaPeers[i],reports=[];for(const s of(await pc.getStats()).values())if(s.type==='inbound-rtp'&&!s.isRemote)reports.push({id:s.id,ssrc:s.ssrc,kind:s.kind||s.mediaType,packets:s.packetsReceived||0,bytes:s.bytesReceived||0,energy:s.totalAudioEnergy||0,samples:s.totalSamplesReceived||0,frames:s.framesDecoded||0});
  peers.push({id:i,state:pc.connectionState,reports});
 }return peers;
});}
function reports(s,kind){return s.flatMap(p=>p.reports.filter(r=>r.kind===kind).map(r=>({...r,key:p.id+':'+r.id+':'+r.ssrc})));}
function total(s,kind,field){return reports(s,kind).reduce((n,r)=>n+r[field],0);}
function stable(a,b,kind){
 expect(b.map(p=>({id:p.id,state:p.state})),'Same native PCs stay connected').toEqual(a.map(p=>({id:p.id,state:'connected'})));
 const before=reports(a,kind),after=reports(b,kind);expect(before.length,'Expected real inbound '+kind).toBeGreaterThan(0);
 expect(after.map(r=>r.key).sort(),'No RTP report replacement/removal may masquerade as zero counters').toEqual(before.map(r=>r.key).sort());
 for(const r of before){const next=after.find(x=>x.key===r.key);for(const field of ['packets','bytes','energy','samples','frames'])expect(next[field],'No '+kind+' counter reset: '+field).toBeGreaterThanOrEqual(r[field]);}
}
async function join(p){await p.getByRole('button',{name:'Войти в комнату',exact:true}).click();await expect(p.getByRole('button',{name:'Выйти из встречи',includeHidden:true})).toBeAttached({timeout:30000});}
async function enable(p){await h.wake(p);for(const [on,off] of [['Включить микрофон','Выключить микрофон'],['Включить камеру','Выключить камеру']]){const b=p.getByRole('button',{name:on,exact:true});if(await b.count())await b.click();await expect(p.getByRole('button',{name:off,exact:true}),'Synthetic media toggle must finish before another toggle').toBeAttached();}}
async function connect(room){const{p,owner,guest,id}=room;
 await instrument(owner);await instrument(guest);
 expect((await h.publish(p,id)).status).toBe(200);expect((await h.start(p,id)).status).toBe(200);
 await p.goto(`${h.BASE}/admin/live-rooms/${id}/edit`,{waitUntil:'domcontentloaded'});
 const invite=await p.evaluate(()=>JSON.parse(document.querySelector('#app').dataset.page).props.invitationUrl);expect(invite).toBeTruthy();
 await p.goto(`${h.BASE}/admin/live-rooms/${id}/room`,{waitUntil:'domcontentloaded'});await join(p);
 const g=await guest.newPage();await g.goto(invite,{waitUntil:'domcontentloaded'});await g.getByText('Войти как гость',{exact:true}).click();await g.locator('input[autocomplete=name]').fill('QA-AT synthetic guest');await g.getByRole('button',{name:'Войти как гость',exact:true}).click();await expect(g.getByRole('button',{name:'Войти в комнату',exact:true})).toBeVisible();await join(g);
 await expect.poll(async()=>(await h.state(p,id)).participants?.length).toBe(2);await enable(p);await enable(g);return g;
}
test('Remote mute: two synthetic audio stops with stable PCs, RTP counters and live video',async({browser},info)=>{
 test.setTimeout(150000);
 await withOwnRoom(browser,info,async room=>{const{p,cfg,id}=room,g=await connect(room);
  for(let repeat=1;repeat<=2;repeat++){
   await enable(g);await expect.poll(async()=>{const s=await stats(p);return s.length>0&&s.every(x=>x.state==='connected')&&total(s,'audio','energy')>0&&total(s,'video','frames')>0},{timeout:20000}).toBe(true);const baseline=await stats(p);await g.waitForTimeout(2200);const active=await stats(p);journal(cfg,{event:'active-baseline',id,repeat,baseline,active});stable(baseline,active,'audio');stable(baseline,active,'video');expect(total(active,'audio','energy')-total(baseline,'audio','energy'),'Decoded synthetic audio baseline must be nonzero').toBeGreaterThan(0);expect(total(active,'audio','packets')-total(baseline,'audio','packets')).toBeGreaterThan(0);
   await h.wake(p);const panel=p.getByRole('button',{name:'Участники',exact:true});if(await panel.getAttribute('aria-pressed')!=='true')await panel.click();await p.getByRole('button',{name:'Действия: QA-AT synthetic guest',exact:true}).last().click();await p.getByText('Выключить микрофон',{exact:true}).click();await expect(g.getByRole('button',{name:'Включить микрофон',exact:true})).toBeAttached();
   await g.waitForTimeout(2000);const muted=await stats(p);await g.waitForTimeout(2500);const later=await stats(p);stable(active,muted,'audio');stable(muted,later,'audio');stable(muted,later,'video');
   const delta={energy:total(later,'audio','energy')-total(muted,'audio','energy'),packets:total(later,'audio','packets')-total(muted,'audio','packets'),samples:total(later,'audio','samples')-total(muted,'audio','samples'),videoFrames:total(later,'video','frames')-total(muted,'video','frames')};
   journal(cfg,{event:'remote-mute-sample',id,repeat,baseline,active,muted,later,delta});
   expect(delta.energy,'No decoded synthetic audio energy after remote mute').toBe(0);expect(delta.packets,'No new inbound audio packets').toBe(0);expect(delta.samples,'No new decoded audio samples').toBe(0);expect(delta.videoFrames,'Live video must continue: audio stop is not total disconnection').toBeGreaterThan(0);
   await g.screenshot({path:info.outputPath('remote-muted-'+repeat+'.png')});
  }
  journal(cfg,{event:'remote-mute-pass',id,repeats:2,physicalAudibility:false});
 });
});
test('Recording availability gate only; unavailable service blocks lifecycle acceptance',async({browser},info)=>{
 await withOwnRoom(browser,info,async({p,cfg,id})=>{
  expect((await h.publish(p,id)).status).toBe(200);expect((await h.start(p,id)).status).toBe(200);const s=await h.state(p,id);journal(cfg,{event:'recording-availability',id,available:s.recording_available,lifecycleExecuted:false});
  expect(typeof s.recording_available,'Server must explicitly describe recording availability').toBe('boolean');
  test.skip(!s.recording_available,'BLOCKED_ENV: recording service is not configured; start/stop/ready/playback lifecycle NOT RUN');
  expect(s.recording_available).toBe(true); // Gate PASS only; never a recording lifecycle PASS.
 });
});
