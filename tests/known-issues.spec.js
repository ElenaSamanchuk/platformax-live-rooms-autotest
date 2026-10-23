// Продуктовое ожидание остаётся строгим: известная проблема даёт красный тест.
const { test, expect } = require('@playwright/test');
const h = require('./helpers');
test.use({ trace: 'off', video: 'off' });
test('L-22: внешняя встреча открывается в отдельной вкладке, комната остаётся доступной', async ({ browser }) => {
  expect(new URL(h.BASE).hostname).toMatch(/\.test\./);
  const o = await h.as(browser, 'owner'); let id; let g;
  try {
    id = await h.createRoom(o.page, 'QA-AT Codex-1023 known L-22 ' + h.stamp(), {
      visibility: 'unlisted', guest_mode: 'anonymous', meeting_method: 'external',
      external_url: 'https://example.com/qa-known-external',
    });
    expect((await h.publish(o.page, id)).status).toBe(200);
    expect((await h.start(o.page, id)).status).toBe(200);
    await o.page.goto(`${h.BASE}/admin/live-rooms/${id}/edit`);
    const invite = await o.page.evaluate(() => JSON.parse(document.querySelector('#app').dataset.page).props.invitationUrl);
    g = await browser.newContext({ locale: 'ru-RU' }); const p = await g.newPage();
    await p.goto(invite); await p.getByText('Войти как гость', { exact: true }).click();
    await p.locator('input[autocomplete=name]').fill('QA-AT отдельная вкладка');
    await p.getByRole('button', { name: 'Войти как гость', exact: true }).click();
    const button = p.getByRole('button', { name: 'Открыть внешнюю встречу', exact: true });
    await expect(button).toBeVisible();
    const popup = p.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await button.click();
    expect(await popup, 'L-22: внешняя встреча должна открываться в отдельной вкладке').not.toBeNull();
    await expect(button, 'страница комнаты осталась доступной').toBeVisible();
  } finally {
    if (id) {
      expect((await h.finish(o.page, id)).status).toBe(200);
      const s = await h.state(o.page, id);
      expect({ status: s.status, participants: (s.participants || []).length }).toEqual({ status: 'finished', participants: 0 });
      console.log('QA cleanup', JSON.stringify({ id, status: s.status, participants: 0 }));
    }
    await g?.close(); await o.ctx.close();
  }
});
