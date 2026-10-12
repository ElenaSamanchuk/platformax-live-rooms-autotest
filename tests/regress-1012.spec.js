// Ретест 12.10 (Claude): новая форма комнаты (модератор/доступ по ссылке), L-9, L-14, M-11, ошибка avatar, D-3/L-10/L-12.
// Факты пишем в qa-out/facts.jsonl (или $QA_OUT), кадры — qa-out/shots/. Комнаты «QA-CL …» завершаются в конце.
const fs = require('fs');
const { test, expect, devices } = require('@playwright/test');
const h = require('./helpers');

test.describe.configure({ mode: 'serial' });
const DIR = process.env.QA_OUT || 'qa-out';
fs.mkdirSync(DIR + '/shots', { recursive: true });
const OUT = DIR + '/facts.jsonl', SH = DIR + '/shots/';
const fact = (id, data) => { fs.appendFileSync(OUT, JSON.stringify({ ...data, case: id, at: new Date().toISOString() }) + '\n'); console.log(id, JSON.stringify(data)); };
const props = (p) => p.evaluate(() => JSON.parse(document.getElementById('app').dataset.page).props);
const freshProps = (p, url) => p.evaluate(async (u) => { const t = await (await fetch(u)).text(); const d = new DOMParser().parseFromString(t, 'text/html'); return JSON.parse(d.querySelector('#app').dataset.page).props; }, url);

let owner, A, B;
const rooms = [];
test.beforeAll(async ({ browser }) => {
  owner = await h.as(browser, 'owner');
  A = await h.as(browser, 'studentA');
  B = await h.as(browser, 'studentB');
});
test.afterAll(async () => {
  for (const id of rooms) { await h.finish(owner.page, id).catch(() => {}); await h.api(owner.page, 'POST', `/admin/live-rooms/${id}/unpublish`).catch(() => {}); }
  fact('CLEANUP', { rooms });
  for (const r of [owner, A, B]) await r?.ctx.close().catch(() => {});
});

test('FORM: модератор и «По персональной ссылке» из новой формы', async ({ browser }) => {
  test.setTimeout(240000);
  const p = owner.page;
  const nameA = (await props(A.page)).auth.user.name;
  await p.goto(h.BASE + '/admin/live-rooms/create');
  await p.getByPlaceholder('Например, еженедельная встреча команды').fill(`QA-CL форма ${h.stamp()}`);
  await p.locator('button', { hasText: 'Кто может войти' }).first().click();
  await p.getByRole('option', { name: 'По персональной ссылке' }).click();
  await p.locator('button', { hasText: 'Модераторы' }).first().click();
  await p.getByText(nameA, { exact: true }).last().click();
  await p.screenshot({ path: SH + 'form-filled-desk.png', fullPage: true });
  await p.getByRole('button', { name: /Создать комнату/ }).click();
  await p.waitForURL(/live-rooms\/\d+\/edit/, { timeout: 20000 });
  const id = +p.url().match(/live-rooms\/(\d+)/)[1]; rooms.push(id);
  const r = (await freshProps(p, `/admin/live-rooms/${id}/edit`)).liveRoom;
  fact('FORM-SAVED', { id, hosts: (r.hosts || []).map((x) => ({ user: x.user_id, role: x.role })), rules: (r.access_rules || []).map((x) => x.type), join_mode: r.join_mode, visibility: r.visibility, duration: r.duration_minutes });
  expect((r.hosts || []).some((x) => x.role === 'moderator')).toBeTruthy();
  expect((await h.publish(p, id)).status).toBe(200);
  expect((await h.start(p, id)).status).toBe(200);
  await p.goto(`${h.BASE}/admin/live-rooms/${id}/room`);
  const invite = (await props(p)).invitationUrl;
  await h.enterMeeting(p, id, { admin: true });
  // B без ссылки, затем по ссылке
  const directB = await B.page.goto(`${h.BASE}/live-rooms/${id}`);
  const directText = (await B.page.locator('body').innerText()).slice(0, 200);
  await B.page.screenshot({ path: SH + 'form-link-B-direct.png' });
  await B.page.goto(invite);
  const viaLink = B.page.getByRole('button', { name: /Войти в комнату/ }).or(B.page.getByRole('link', { name: /Войти в комнату/ }));
  let joinedB = false;
  await viaLink.first().waitFor({ timeout: 20000 }).catch(() => {});
  const linkPage = (await B.page.locator('body').innerText()).slice(0, 160);
  await B.page.screenshot({ path: SH + 'form-link-B-invite-page.png' });
  if (await viaLink.count()) { await viaLink.first().click(); await B.page.waitForTimeout(3000); fact('FORM-LINK-AFTER-CLICK', { url: B.page.url().replace(/signature=[^&]+/, 'signature=…'), text: (await B.page.locator('body').innerText()).slice(0, 200) }); await B.page.screenshot({ path: SH + 'form-link-B-after-click.png' }); const b2 = B.page.getByRole('button', { name: /Войти в комнату/ }); await b2.first().waitFor({ timeout: 20000 }).catch(() => {}); if (await b2.count()) await b2.first().click(); joinedB = await B.page.getByRole('button', { name: 'Выйти из встречи' }).waitFor({ timeout: 30000 }).then(() => true, () => false); }
  fact('FORM-LINK', { id, directStatus: directB.status(), directText, invite: !!invite, joinedViaLink: joinedB, linkPage, url: B.page.url().replace(/signature=[^&]+/, 'signature=…') });
  // A — модератор из формы
  const directA = await A.page.goto(`${h.BASE}/live-rooms/${id}`);
  let joinedA = false;
  const btnA = A.page.getByRole('button', { name: /Войти в комнату/ });
  await btnA.first().waitFor({ timeout: 20000 }).catch(() => {});
  if (await btnA.count()) { await btnA.first().click(); joinedA = await A.page.getByRole('button', { name: 'Выйти из встречи' }).waitFor({ timeout: 30000 }).then(() => true, () => false); }
  const ctrl = joinedA ? await A.page.getByRole('button', { name: 'Управление встречей' }).count() : 0;
  await h.wake(A.page); await A.page.screenshot({ path: SH + 'form-moderator-A-in-room.png' });
  fact('FORM-MODERATOR', { id, directStatus: directA.status(), joined: joinedA, controlsButton: ctrl, roleState: ((await h.state(p, id)).moderators || []) });
  expect(joinedB, 'вход по персональной ссылке').toBeTruthy();
  expect(ctrl, 'модератор из формы видит «Управление встречей»').toBeGreaterThan(0);
});

test('L-9: после «Отключить и закрыть вход» кнопка входа в лобби', async () => {
  const p = owner.page;
  const id = await h.createRoom(p, `QA-CL L-9 ${h.stamp()}`); rooms.push(id);
  await h.publish(p, id); await h.start(p, id);
  await h.enterMeeting(p, id, { admin: true });
  await h.enterMeeting(B.page, id);
  const uidB = (await props(B.page)).auth.user.id;
  for (let i = 1; i <= 2; i++) {
    const ban = await h.api(p, 'POST', `/admin/live-rooms/${id}/participants/moderate`, { identity: `user_${uidB}`, action: 'ban' });
    await B.page.waitForTimeout(6000);
    await B.page.goto(`${h.BASE}/live-rooms/${id}`);
    const btn = B.page.getByRole('button', { name: /Войти в комнату/ }).first();
    const enabled = (await btn.count()) ? await btn.isEnabled() : null;
    const txt = (await B.page.locator('body').innerText()).match(/Доступ[^\n]{0,80}|закрыт[^\n]{0,80}/)?.[0] || '';
    const join = await h.api(B.page, 'POST', `/live-rooms/${id}/join`);
    if (i === 1) await B.page.screenshot({ path: SH + 'L9-лобби-после-бана.png' });
    fact('L-9', { try: i, ban: ban.status, buttonEnabled: enabled, lobbyText: txt, join: join.status, msg: join.data?.message });
    await h.api(p, 'DELETE', `/admin/live-rooms/${id}/bans/${uidB}`);
    await h.enterMeeting(B.page, id).catch(() => {});
  }
});

test('L-14: битая ссылка-приглашение', async () => {
  const p = owner.page;
  const id = rooms[rooms.length - 1];
  await p.goto(`${h.BASE}/admin/live-rooms/${id}/room`);
  const invite = (await props(p)).invitationUrl;
  for (let i = 1; i <= 2; i++) {
    const bad = invite.replace(/signature=[0-9a-f]{6}/, 'signature=000000');
    const r = await B.page.goto(bad);
    const text = (await B.page.locator('body').innerText()).slice(0, 300);
    const back = await B.page.getByRole('link', { name: /К комнатам|На главную|Назад/ }).count();
    if (i === 1) await B.page.screenshot({ path: SH + 'L14-битая-ссылка.png' });
    fact('L-14', { try: i, status: r.status(), text, backLinks: back });
  }
});

test('M-11: лобби в альбомной (эмуляция DPR 3)', async ({ browser }) => {
  const id = rooms[rooms.length - 1];
  const st = await B.ctx.storageState();
  for (const [name, w, hgt] of [['844x390', 844, 390], ['915x412', 915, 412], ['390x844', 390, 844]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: hgt }, deviceScaleFactor: 3, storageState: st });
    const pg = await ctx.newPage();
    await pg.goto(`${h.BASE}/live-rooms/${id}`);
    await pg.waitForTimeout(2500);
    const m = await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Войти в комнату/.test(x.innerText)); const r = b?.getBoundingClientRect(); return { btnTop: r && Math.round(r.top), btnBottom: r && Math.round(r.bottom), docH: document.documentElement.scrollHeight, vh: innerHeight }; });
    await pg.mouse.wheel(0, 2000); await pg.waitForTimeout(500);
    const after = await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Войти в комнату/.test(x.innerText)); return b && Math.round(b.getBoundingClientRect().bottom); });
    await pg.screenshot({ path: SH + `M11-лобби-${name}.png` });
    fact('M-11', { size: name, ...m, btnBottomAfterScroll: after, reachable: after != null && after <= m.vh });
    await ctx.close();
  }
});

test('Консоль мобильной админки: avatar у null', async ({ browser }) => {
  const st = await owner.ctx.storageState();
  for (const path of ['/admin/live-rooms', '/admin/live-rooms/create']) for (let i = 1; i <= 2; i++) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 3, storageState: st });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message.slice(0, 90)));
    await pg.goto(h.BASE + path, { waitUntil: 'networkidle' });
    const header = await pg.evaluate(() => ({ user: !!JSON.parse(document.getElementById('app').dataset.page).props.auth?.user, avatarImgs: document.querySelectorAll('header img, header [class*="avatar"]').length }));
    fact('AVATAR', { path, try: i, errs, ...header });
    await ctx.close();
  }
});

test('D-3 / L-10 / L-12: баннер, ✦ во встрече, реакция «Начать встречу»', async () => {
  const p = owner.page;
  const id = await h.createRoom(p, `QA-CL старт ${h.stamp()}`); rooms.push(id);
  await h.publish(p, id);
  await p.goto(`${h.BASE}/admin/live-rooms/${id}/room`);
  const startBtn = p.getByRole('button', { name: /Начать встречу/ }).first();
  const t0 = Date.now(); await startBtn.click();
  let feedback = null;
  for (let i = 0; i < 40; i++) { const s = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Начать встречу|Запускаем/.test(x.innerText)); return b ? { dis: b.disabled, txt: b.innerText.trim() } : { gone: true }; }); if (s.gone || s.dis || /Запускаем/.test(s.txt || '')) { feedback = { ms: Date.now() - t0, ...s }; break; } await p.waitForTimeout(100); }
  fact('L-12', { id, feedback });
  await h.enterMeeting(p, id, { admin: true });
  await h.wake(p);
  const m = await p.evaluate(() => { const send = [...document.querySelectorAll('button')].find((b) => /Отправить/.test(b.getAttribute('aria-label') || b.innerText)); const r = send?.getBoundingClientRect(); const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return { docH: document.documentElement.scrollHeight, vh: innerHeight, banner: /Выставлен сч/.test(document.body.innerText), sendCovered: r ? !send.contains(top) : null, coveredBy: top && !send?.contains(top) ? (top.getAttribute('aria-label') || top.innerText || top.tagName).slice(0, 40) : null, aiBtn: [...document.querySelectorAll('button')].filter((b) => /AI|ассистент/i.test(b.getAttribute('aria-label') || '')).length }; });
  await p.screenshot({ path: SH + 'D3-L10-ведущий-во-встрече.png' });
  fact('D-3/L-10', { id, ...m });
});
