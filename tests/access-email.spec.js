// Новая форма доступа: известный QA-пользователь по email и CSV, без рассылок.
const { test, expect } = require('@playwright/test');
const h = require('./helpers');
const fs = require('fs');
const path = require('path');
test.use({ trace: 'off', video: 'off' });

test('Доступ: email и CSV находят известного QA-пользователя, draft сохраняет персональное правило', async ({ browser }, info) => {
  test.skip(!process.env.QA_STUDENT_EMAIL, 'Нужен QA_STUDENT_EMAIL существующего тестового пользователя');
  expect(new URL(h.BASE).hostname).toMatch(/\.test\./);
  const email = process.env.QA_STUDENT_EMAIL;
  const o = await h.as(browser, 'owner'); const p = o.page; let id;
  try {
    await p.goto(h.BASE + '/admin/live-rooms/create', { waitUntil: 'domcontentloaded' });
    const guide = p.getByText('Сам разберусь'); if (await guide.count()) await guide.first().click();
    await p.locator('input:not([type=file]):not([type=checkbox]):visible').first().fill('QA-AT Codex-1023 доступ email ' + h.stamp());
    await p.locator('button', { hasText: 'Участники школы' }).first().click();
    await p.getByRole('option', { name: 'Ограниченный доступ' }).click();
    await p.getByText('Добавить из списка или по email').first().click();
    const dialog = p.locator('[role=dialog]').filter({ has: p.locator('textarea') });
    const area = dialog.locator('textarea').first();
    await area.fill(email); await p.getByRole('button', { name: 'Проверить список' }).click();
    await expect(dialog.getByText('Найдено пользователей: 1', { exact: true })).toBeVisible();
    await expect(dialog.getByText(email, { exact: false })).toBeVisible();
    await p.screenshot({ path: info.outputPath('email-preview.png') });
    const csv = info.outputPath('qa-emails.csv'); fs.writeFileSync(csv, email + '\n');
    await area.fill(''); await dialog.locator('input[type=file]').setInputFiles(csv);
    await expect(area).toHaveValue(email + '\n');
    await p.getByRole('button', { name: 'Проверить список' }).click();
    await expect(dialog.getByText('Найдено пользователей: 1', { exact: true })).toBeVisible();
    await p.screenshot({ path: info.outputPath('csv-preview.png') });
    await p.getByRole('button', { name: 'Добавить найденных' }).click();
    await p.getByRole('button', { name: 'Сохранить встречу' }).click();
    await p.waitForURL(/\/admin\/live-rooms\/\d+\/edit/);
    id = +(p.url().match(/live-rooms\/(\d+)/) || [])[1]; expect(id).toBeGreaterThan(0);
    await p.reload();
    const result = await p.evaluate(() => {
      const d = JSON.parse(document.querySelector('#app').dataset.page).props;
      return { room: { id: d.liveRoom.id, status: d.liveRoom.status, published: d.liveRoom.is_published }, users: d.accessUsers, rules: d.liveRoom.access_rules };
    });
    expect(result.room).toEqual({ id, status: 'draft', published: false });
    const user = result.users.find(u => u.email === email); expect(user, 'сохранён именно выбранный QA-пользователь').toBeTruthy();
    if (process.env.QA_STUDENT_ID) expect(user.id).toBe(+process.env.QA_STUDENT_ID);
    expect(result.rules.some(r => r.type === 'user' && String(r.value) === String(user.id)), 'сервер сохранил персональное правило доступа').toBe(true);
    await p.screenshot({ path: info.outputPath('saved-draft.png') });
    await info.attach('saved-access', { body: JSON.stringify({ id, status: 'draft', published: false, accessUserId: user.id }), contentType: 'application/json' });
  } finally {
    if (id) {
      const s = await h.state(p, id);
      await p.goto(`${h.BASE}/admin/live-rooms/${id}/edit`, { waitUntil: 'domcontentloaded' });
      const saved = await p.evaluate(() => {
        const r = JSON.parse(document.querySelector('#app').dataset.page).props.liveRoom;
        return { status: r.status, published: r.is_published, visibility: r.visibility };
      });
      expect(saved).toEqual({ status: 'draft', published: false, visibility: 'private' });
      expect((s.participants || []).length).toBe(0);
      const out = process.env.QA_OUT || 'qa-out/access-email'; fs.mkdirSync(out, { recursive: true });
      fs.appendFileSync(path.join(out, 'facts.jsonl'), JSON.stringify({ event: 'access-email-preserved', id, ...saved, participants: 0 }) + '\n');
      console.log('QA draft preserved', JSON.stringify({ id, ...saved, participants: 0 }));
    }
    await o.ctx.close();
  }
});
