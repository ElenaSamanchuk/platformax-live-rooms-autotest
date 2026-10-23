// Актуальный smoke Live: реальные UI-переходы, независимые гости, только свои комнаты.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
if (!/\.test\./.test(new URL(h.BASE).hostname)) throw new Error('Разрешён только тестовый стенд');

test.use({ trace: 'off', video: 'off' }); // Не сохранять signed invite и медиатокены.
const out = process.env.QA_OUT || 'qa-out/current-smoke';
const record = (value) => {
  fs.mkdirSync(out, { recursive: true });
  fs.appendFileSync(path.join(out, 'facts.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
};
async function owner(browser) {
  const o = await h.as(browser, 'owner');
  await o.page.goto(h.BASE + '/admin/live-rooms');
  const props = await o.page.evaluate(() => JSON.parse(document.querySelector('#app').dataset.page).props);
  expect(props.auth?.user?.email, 'подтверждена учётная запись владельца').toBe(process.env.OWNER_EMAIL);
  expect(new URL(h.BASE).hostname, 'разрешён только тестовый стенд').toMatch(/\.test\./);
  const build = await o.page.locator('script[src]').evaluateAll(es => es.map(e => e.src.match(/admin-[^/]+\.js/)?.[0]).filter(Boolean));
  record({ event: 'build', assets: build });
  return o;
}
async function room(o, suffix, extra = {}) {
  const id = await h.createRoom(o.page, 'QA-AT Codex-1023 ' + suffix + ' ' + h.stamp(), {
    meeting_method: 'platform', guest_mode: 'anonymous', visibility: 'unlisted',
    join_mode: 'open', entry_mode: 'free', hand_raise_enabled: '1', ...extra,
  });
  expect((await h.publish(o.page, id)).status).toBe(200);
  expect((await h.start(o.page, id)).status).toBe(200);
  await o.page.goto(`${h.BASE}/admin/live-rooms/${id}/edit`);
  const invite = await o.page.evaluate(() => JSON.parse(document.querySelector('#app').dataset.page).props.invitationUrl);
  expect(invite, 'сохранено подписанное приглашение своей комнаты').toBeTruthy();
  record({ event: 'created', id, kind: suffix });
  return { id, invite };
}
async function join(page) {
  await page.getByRole('button', { name: 'Войти в комнату', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти из встречи', includeHidden: true })).toBeAttached();
}
async function guest(browser, invite, name) {
  const ctx = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(invite, { waitUntil: 'domcontentloaded' });
  await page.getByText('Войти как гость', { exact: true }).click();
  await page.locator('input[autocomplete=name]').fill(name);
  await page.getByRole('button', { name: 'Войти как гость', exact: true }).click();
  await page.waitForURL(/\/guest\/room/);
  return { ctx, page };
}
async function cleanup(o, id, guests = []) {
  try {
    if (id) {
      expect((await h.finish(o.page, id)).status, 'очистка собственной встречи').toBe(200);
      await expect.poll(async () => {
        const s = await h.state(o.page, id);
        return { status: s.status, participants: (s.participants || []).length };
      }, { timeout: 20000 }).toEqual({ status: 'finished', participants: 0 });
      record({ event: 'cleanup', id, status: 'finished', participants: 0 });
    }
  } finally {
    for (const g of guests) await g.ctx.close();
    await o.ctx.close();
  }
}
async function shot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(name + '.png') });
}

test('H-2: чистый гость получает только внешний адрес и действительно открывает его', async ({ browser }, info) => {
  const o = await owner(browser); let r; const guests = [];
  const external = 'https://example.com/';
  try {
    r = await room(o, 'external', { meeting_method: 'external', external_url: external });
    // Два независимых гостя: доступ не наследуется от владельца или первого гостя.
    for (let n = 1; n <= 2; n++) {
      const g = await guest(browser, r.invite, 'QA-AT внешний гость ' + n); guests.push(g);
      const button = g.page.getByRole('button', { name: 'Открыть внешнюю встречу', exact: true });
      await expect(button).toBeVisible();
      const result = await h.api(g.page, 'POST', `/live-rooms/${r.id}/guest/join`, {});
      expect(result.status).toBe(200);
      expect(result.data.externalUrl, 'H-2: внешний сервис вместо встроенной комнаты').toBe(external);
      expect(result.data.token, 'H-2: внешней встрече не нужен token').toBeUndefined();
      expect(result.data.wsUrl, 'H-2: внешней встрече не нужен wsUrl').toBeUndefined();
      expect(result.data.ws_url).toBeUndefined();
      let navigationStatus;
      g.ctx.on('response', response => {
        if (response.url() === external && response.request().isNavigationRequest()) navigationStatus = response.status();
      });
      const popup = g.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
      await button.click();
      const target = (await popup) || g.page;
      await expect(target).toHaveURL(external);
      await expect.poll(() => navigationStatus, { message: 'внешний адрес загружен HTTP-навигацией' }).toBeGreaterThanOrEqual(200);
      expect(navigationStatus).toBeLessThan(400);
      await shot(target, info, 'external-guest-' + n);
      record({ event: 'external-pass', id: r.id, guest: n, status: 200, external: true, token: false, ws: false, uiNavigation: true });
    }
  } finally { await cleanup(o, r?.id, guests); }
});

test('Гость: удалить и закрыть вход, затем вернуть доступ и войти по прежнему приглашению', async ({ browser }, info) => {
  const o = await owner(browser); let r; const guests = [];
  try {
    r = await room(o, 'remove-restore');
    await o.page.goto(`${h.BASE}/admin/live-rooms/${r.id}/room`, { waitUntil: 'domcontentloaded' }); await join(o.page);
    const name = 'QA-AT гость возврат';
    const g = await guest(browser, r.invite, name); guests.push(g); await join(g.page);
    await expect.poll(async () => (await h.state(o.page, r.id)).participants?.filter(p => p.guest_id).length).toBe(1);
    await h.wake(o.page); await o.page.getByRole('button', { name: 'Участники', exact: true }).click();
    await o.page.getByRole('button', { name: 'Действия: ' + name, exact: true }).last().click();
    await o.page.getByText('Удалить гостя и закрыть ему вход', { exact: true }).click();
    await o.page.getByRole('button', { name: /Удалить гостя|Закрыть вход|Отключить/ }).last().click();
    await expect(g.page.getByText(/Вас отключили/).first()).toBeVisible();
    // Измеряем естественное обновление лобби до любых новых join/API-запросов гостя.
    const started = Date.now(); const samples = [];
    while (Date.now() - started < 6000) {
      const button = g.page.getByRole('button', { name: /Войти в комнату|Вход закрыт/ }).first();
      samples.push({ ms: Date.now() - started, text: await button.innerText(), disabled: await button.isDisabled() });
      if (samples[samples.length - 1].disabled) break;
      await g.page.waitForTimeout(500);
    }
    record({ event: 'natural-lobby-after-remove', id: r.id, samples });
    const denied = await h.api(g.page, 'POST', `/live-rooms/${r.id}/guest/join`, {});
    expect(denied.status, 'L-17: закрытый вход подтверждён сервером').toBe(403);
    await expect(g.page.getByRole('button', { name: 'Вход закрыт', exact: true })).toBeDisabled();
    await shot(g.page, info, 'guest-access-closed');
    await h.wake(o.page); await o.page.getByRole('button', { name: 'Вернуть доступ', exact: true }).click();
    await g.page.goto(r.invite, { waitUntil: 'domcontentloaded' });
    const gate = g.page.getByText('Войти как гость', { exact: true });
    if (await gate.count()) await gate.click();
    const input = g.page.locator('input[autocomplete=name]');
    if (await input.count()) {
      await input.fill(name);
      await g.page.getByRole('button', { name: 'Войти как гость', exact: true }).click();
    }
    await join(g.page);
    await expect.poll(async () => (await h.state(o.page, r.id)).participants?.filter(p => p.guest_id).length).toBe(1);
    await shot(g.page, info, 'guest-restored');
    record({ event: 'restore-pass', id: r.id, blockedStatus: denied.status, restoredViaUI: true, sameInvitation: true });
  } finally { await cleanup(o, r?.id, guests); }
});

test('Основной сценарий: три участника, двусторонний чат, отмена и подтверждение завершения', async ({ browser }, info) => {
  const o = await owner(browser); let r; const guests = []; const dialogs = [];
  o.page.on('dialog', async d => { dialogs.push(d.type()); await d.dismiss(); });
  try {
    r = await room(o, 'main-smoke'); await o.page.goto(`${h.BASE}/admin/live-rooms/${r.id}/room`, { waitUntil: 'domcontentloaded' }); await join(o.page);
    for (let n = 1; n <= 2; n++) { const g = await guest(browser, r.invite, 'QA-AT смоук ' + n); guests.push(g); await join(g.page); }
    await expect(o.page.getByText('3 участника', { exact: true })).toBeVisible();
    const g = guests[0].page;
    await h.wake(g); await g.getByRole('button', { name: 'Чат', exact: true }).click();
    await g.locator('textarea').last().fill('QA-AT сообщение гостя'); await g.locator('textarea').last().press('Enter');
    await h.wake(o.page); await o.page.getByRole('button', { name: 'Чат', exact: true }).click();
    await expect(o.page.getByText('QA-AT сообщение гостя', { exact: true })).toBeVisible();
    await o.page.locator('textarea').last().fill('QA-AT ответ ведущего'); await o.page.locator('textarea').last().press('Enter');
    await expect(g.getByText('QA-AT ответ ведущего', { exact: true })).toBeVisible();
    await shot(o.page, info, 'host-chat'); await shot(g, info, 'guest-chat');
    await h.wake(o.page); await o.page.getByRole('button', { name: 'Ещё', exact: true }).click();
    await o.page.getByText('Завершить встречу для всех', { exact: true }).click();
    await o.page.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect((await h.state(o.page, r.id)).status, 'отмена не завершает встречу').toBe('live');
    await h.wake(o.page); await o.page.getByRole('button', { name: 'Ещё', exact: true }).click();
    await o.page.getByText('Завершить встречу для всех', { exact: true }).click();
    await o.page.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(g.getByText('Встреча завершена.', { exact: true }).first()).toBeVisible();
    await g.reload();
    // После завершения unlisted-комнаты гостевой доступ закрыт: оба понятных экрана допустимы.
    await expect(g.getByText(/^(Встреча завершена\.|Нет доступа к комнате)$/).first()).toBeVisible();
    await expect(g.getByRole('button', { name: 'Войти в комнату', exact: true })).toHaveCount(0);
    await expect(g.getByRole('button', { name: 'Выйти из встречи', includeHidden: true })).toHaveCount(0);
    expect(dialogs, 'завершение использует окно платформы').toEqual([]);
    record({ event: 'main-pass', id: r.id, participants: 3, guestToHost: true, hostToGuest: true, cancelKeepsLive: true, finishUI: true, reloadCannotReenter: true });
  } finally { await cleanup(o, r?.id, guests); }
});

test('L-21: список встреч не содержит медиатеку автора в каждой строке', async ({ browser }) => {
  const o = await owner(browser);
  try {
    for (let n = 1; n <= 2; n++) {
      await o.page.reload();
      const data = await o.page.evaluate(() => {
        const props = JSON.parse(document.querySelector('#app').dataset.page).props;
        const rows = [];
        const walk = v => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') {
            if ('creator' in v && 'title' in v && 'id' in v) rows.push({ hasMedia: !!v.creator && Object.hasOwn(v.creator, 'media') });
            Object.values(v).forEach(walk);
          }
        };
        walk(props); return { roomCount: rows.length, mediaCount: rows.filter(r => r.hasMedia).length };
      });
      expect(data.roomCount, 'проверены именно строки списка встреч').toBeGreaterThan(0);
      expect(data.mediaCount, 'L-21: в списке не нужна полная медиатека автора').toBe(0);
      record({ event: 'l21-pass', repeat: n, ...data });
    }
  } finally { await o.ctx.close(); }
});
