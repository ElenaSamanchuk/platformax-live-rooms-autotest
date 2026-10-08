// Общие помощники автотестов live-комнат. Вход — по логину/паролю из .env
// или (режим QA) через сохранённую сессию владельца + «Войти как».
const fs = require('fs');
const { expect } = require('@playwright/test');

const BASE = process.env.BASE_URL;
if (!BASE) throw new Error('Задайте BASE_URL тестового стенда в .env');
const MEDIA_ARGS = { permissions: ['camera', 'microphone'], locale: 'ru-RU', viewport: { width: 1440, height: 900 } };

const ROLES = {
  owner: { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD },
  studentA: { email: process.env.STUDENT_A_EMAIL, password: process.env.STUDENT_A_PASSWORD }, // БЕЗ продукта PRODUCT_ID
  studentB: { email: process.env.STUDENT_B_EMAIL, password: process.env.STUDENT_B_PASSWORD }, // С продуктом PRODUCT_ID
  staffView: { email: process.env.STAFF_VIEW_EMAIL, password: process.env.STAFF_VIEW_PASSWORD }, // сотрудник «только просмотр»
};

/** Новый изолированный браузерный контекст под ролью. Возвращает { ctx, page }. */
async function as(browser, role) {
  const r = ROLES[role];
  if (!r || !r.email) throw new Error(`В .env не задана почта для роли ${role}`);
  const ownerState = process.env.OWNER_STORAGE_STATE;
  if (!r.password && ownerState && fs.existsSync(ownerState)) return impersonate(browser, ownerState, r.email, role);
  if (!r.password) throw new Error(`В .env нет пароля для роли ${role} (или задайте OWNER_STORAGE_STATE для «Войти как»)`);
  const ctx = await browser.newContext(MEDIA_ARGS);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.getByPlaceholder('Введите email').fill(r.email);
  await page.getByPlaceholder('Введите пароль').fill(r.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  return { ctx, page };
}

/** QA-режим: сессия владельца → /admin/users → «Войти как» нужной почте. */
async function impersonate(browser, ownerState, email, role) {
  const ctx = await browser.newContext({ ...MEDIA_ARGS, storageState: ownerState });
  const page = await ctx.newPage();
  if (role === 'owner') { await page.goto(BASE + '/admin'); return { ctx, page }; }
  for (let attempt = 0; attempt < 2; attempt++) {
    for (let pg = 1; pg <= 6; pg++) {
      await page.goto(`${BASE}/admin/users?page=${pg}`);
      await page.waitForSelector('tbody tr', { timeout: 30000 });
      const row = page.locator('tbody tr', { hasText: email });
      if (await row.count()) {
        const [np] = await Promise.all([ctx.waitForEvent('page'), row.locator('button', { hasText: 'Войти как' }).first().evaluate((b) => b.click())]);
        await np.waitForLoadState('domcontentloaded');
        await page.close();
        if ((await whoami(np)) === email) return { ctx, page: np };
        break;
      }
    }
  }
  throw new Error('«Войти как» не сработало для ' + email);
}

async function whoami(page) {
  return page.evaluate(async () => {
    const ver = JSON.parse(document.getElementById('app').dataset.page).version;
    const r = await fetch('/live-rooms', { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': ver } });
    return (await r.json()).props.auth?.user?.email;
  });
}

/** Запрос от имени пользователя страницы (кука сессии + XSRF). */
async function api(page, method, url, body) {
  return page.evaluate(async ([m, u, b]) => {
    const x = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
    const r = await fetch(u, { method: m, headers: { 'X-XSRF-TOKEN': x, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    let data = await r.text(); try { data = JSON.parse(data); } catch (e) { /* html */ }
    return { status: r.status, data };
  }, [method, url, body]);
}

const state = async (ownerPage, id) => (await api(ownerPage, 'GET', `/admin/live-rooms/${id}/state`)).data;
const inside = async (ownerPage, id) => ((await state(ownerPage, id)).participants || []).map((p) => p.user_id);

/** Создать комнату QA-… (как форма «Новая встреча»). Возвращает id. */
async function createRoom(ownerPage, title, extra = {}) {
  await ownerPage.goto(BASE + '/admin/live-rooms');
  const id = await ownerPage.evaluate(async ([title, extra]) => {
    const x = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1]);
    const ver = JSON.parse(document.getElementById('app').dataset.page).version;
    const fd = new FormData();
    const f = Object.assign({ title, description: 'Автотест live-комнат', visibility: 'public', join_mode: 'open', is_permanent: '0', chat_enabled: '1', hand_raise_enabled: '0', video_enabled: '1', screen_share_enabled: '1' }, extra);
    for (const k in f) fd.append(k, f[k]);
    const r = await fetch('/admin/live-rooms', { method: 'POST', headers: { 'X-XSRF-TOKEN': x, 'X-Requested-With': 'XMLHttpRequest', 'X-Inertia': 'true', 'X-Inertia-Version': ver }, body: fd });
    return +((r.url.match(/live-rooms\/(\d+)/) || [])[1]);
  }, [title, extra]);
  expect(id, 'комната создана').toBeGreaterThan(0);
  return id;
}
const publish = (p, id) => api(p, 'POST', `/admin/live-rooms/${id}/publish`);
const start = (p, id) => api(p, 'POST', `/admin/live-rooms/${id}/start`);
const finish = (p, id) => api(p, 'POST', `/admin/live-rooms/${id}/finish`);

/** Войти во встречу через интерфейс (лобби → «Войти в комнату»). admin=true — комната ведущего. */
async function enterMeeting(page, id, { admin = false, password } = {}) {
  await page.goto(`${BASE}${admin ? '/admin' : ''}/live-rooms/${id}${admin ? '/room' : ''}`);
  const btn = page.getByRole('button', { name: /Войти в комнату/ }).first();
  await btn.click();
  if (password) {
    const pw = page.locator('input[type=password]').first();
    await pw.waitFor({ timeout: 10000 });
    await pw.fill(password);
    await btn.click();
  }
  await expect(page.getByRole('button', { name: 'Выйти из встречи' })).toBeAttached({ timeout: 30000 });
}

/** Показать панель встречи (она прячется без движения мыши). */
async function wake(page) { await page.mouse.move(700, 400); await page.mouse.move(720, 820); }

const stamp = () => new Date().toISOString().slice(5, 16).replace('T', ' ');

module.exports = { BASE, as, api, state, inside, createRoom, publish, start, finish, enterMeeting, wake, stamp, whoami };
