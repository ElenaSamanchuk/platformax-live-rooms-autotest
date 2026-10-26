// Read-only readiness and current own-editor navigation checks. No shared session/impersonation helpers.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
// Pin the approved brand/origin pair without publishing internal test URLs.
const approvedOriginFingerprints = {
  MEDVEDIVA: '1dc94c902af6420f5edbd2437e50ec8cf905bc634c1fd5f141e71fc25974e9ff',
  KOCHFIT: '3225f324401c840b0e0baa82a63eacce0a3d2a3c06a79e3574604b501b9f379a',
};

test.use({ trace: 'off', video: 'off', screenshot: 'off', locale: 'ru-RU', timezoneId: 'Europe/Minsk', actionTimeout: 15000, navigationTimeout: 30000 });
const brands = ['MEDVEDIVA', 'KOCHFIT'];
// Exact current per-brand contracts; do not accept unrelated pages by suffix.
const ownEditorContracts = {
  MEDVEDIVA: { component: 'Admin/Services/ServiceEditPage', userId: 58054, serviceId: 16, title: 'QA-Codex-MDV-1026 Доступный редактор', navigation: 'services-link' },
  KOCHFIT: { component: 'Admin/Services/ServicesView', userId: 25893, serviceId: 1, title: 'QA-Codex-PM-1023 Kochfit ретест', navigation: 'cancel' },
};
async function editorValues(page) {
  return page.locator('input,textarea').evaluateAll(es => es.filter(e => ['text', 'number', 'textarea'].includes(e.type)).map(e => ({ id: e.id, type: e.type, value: e.value })));
}

function configuration(brand, role) {
  const base = process.env[`${brand}_BASE_URL`];
  const state = process.env[`${brand}_${role}_STORAGE_STATE`];
  const userId = process.env[`${brand}_${role}_USER_ID`];
  test.skip(!base || !state || !userId, `NOTRUN_AUTH: set ${brand}_BASE_URL, ${brand}_${role}_STORAGE_STATE and ${brand}_${role}_USER_ID`);
  const url = new URL(base);
  const approved = (process.env.BRAND_QA_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  expect(url.protocol, 'QA guard: HTTPS test origin required').toBe('https:');
  expect(url.username || url.password || url.search || url.hash, 'QA guard: no credentials, query or hash in base URL').toBe('');
  expect(url.pathname, 'QA guard: base URL must be an origin').toBe('/');
  expect(approved, 'QA guard: origin must be explicitly approved in BRAND_QA_ALLOWED_ORIGINS').toContain(url.origin);
  expect(createHash('sha256').update(url.origin).digest('hex'), 'QA guard: exact approved brand/origin pair required; arbitrary allowlist entries are insufficient').toBe(approvedOriginFingerprints[brand]);
  expect(Number.isSafeInteger(Number(userId)) && Number(userId) > 0, 'QA guard: expected user ID required').toBe(true);
  expect(fs.existsSync(state), 'AUTH BLOCKED: configured storageState file must exist; never use another account as fallback').toBe(true);
  return { origin: url.origin, state, userId: Number(userId), brand, role };
}
async function open(page, config, pathname) {
  const response = await page.goto(config.origin + pathname, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).origin, 'QA guard: cross-origin redirect is forbidden').toBe(config.origin);
  expect(response, 'Expected an HTTP navigation response').toBeTruthy();
  expect(response.status(), `DEPLOYMENT BLOCK: required ${pathname} must be available, never accept 404/403 as PASS`).toBe(200);
  await page.locator('#app[data-page]').waitFor({ state: 'attached' });
  return page.evaluate(() => {
    const q = JSON.parse(document.querySelector('#app').dataset.page);
    const p = q.props;
    const user = p.user || p.auth?.user;
    return {
      component: q.component, uid: user?.id, authUid: p.auth?.user?.id,
      production: p.isProduction, impersonation: !!p.impersonation,
      role: p.schoolRbac?.role, owner: p.schoolRbac?.isOwner,
      admin: user?.is_admin === true || p.auth?.user?.is_admin === true,
      student: user?.is_student === true || p.auth?.user?.is_student === true,
      canManageContent: p.adminCanManageContent,
      build: [...document.scripts].map(s => s.src.match(/(?:admin|app)-[^/]+\.js$/)?.[0]).filter(Boolean),
    };
  });
}
function identity(data, config) {
  expect(data.uid, 'AUTH BLOCKED: actual current user must match the explicitly configured role account').toBe(config.userId);
  if (data.authUid != null) expect(data.authUid, 'QA guard: user and auth.user must agree').toBe(config.userId);
  expect(data.production, 'QA guard: backend must explicitly report isProduction=false').toBe(false);
  expect(data.impersonation, 'QA guard: independent brand state only; shared impersonation is forbidden').toBe(false);
}
async function guarded(browser, config, run) {
  const context = await browser.newContext({ storageState: config.state, permissions: [], locale: 'ru-RU', viewport: { width: 1440, height: 1000 } });
  try {
    // Prevent every write, including background app writes. No data cleanup can be needed.
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    const profile = await open(page, config, '/profile');
    identity(profile, config);
    expect(profile.component.toLowerCase(), 'QA guard: actual brand profile must match this test, not another school layout').toContain(config.brand.toLowerCase());
    if (config.role === 'ADMIN') {
      const admin = await open(page, config, '/admin/live-rooms');
      identity(admin, config);
      expect(/(?:^|\/)Admin\//.test(admin.component), 'ROLE BLOCKED: expected an actual admin page').toBe(true);
      expect(admin.owner === true || admin.admin === true || ['owner', 'admin', 'administrator'].includes(admin.role) || admin.canManageContent === true,
        'ROLE BLOCKED: explicit admin permission required; a name or expected ID alone is insufficient').toBe(true);
    }
    await run(page);
  } finally {
    await context.close();
  }
}
async function evidence(info, name, value) {
  // Allowlisted metadata only. Never save raw props, URLs, cookies, signed invites or tokens.
  await info.attach(name, { body: JSON.stringify(value), contentType: 'application/json' });
}
for (const brand of brands) {
  test(`${brand}: mandatory admin personal-session routes are deployed`, async ({ browser }, info) => {
    const config = configuration(brand, 'ADMIN');
    await guarded(browser, config, async page => {
      for (const [pathname, component] of [['/admin/services', /ServicesView$/], ['/admin/service-sessions', /ServiceSessions/]]) {
        const data = await open(page, config, pathname);
        identity(data, config);
        expect(data.component, `DEPLOYMENT BLOCK: ${pathname} must render its real module`).toMatch(component);
        await evidence(info, pathname.split('/').pop(), data);
      }
    });
  });
  test(`${brand}: independently authenticated student can open personal-session module`, async ({ browser }, info) => {
    const config = configuration(brand, 'STUDENT');
    await guarded(browser, config, async page => {
      const data = await open(page, config, '/service-sessions');
      identity(data, config);
      expect(data.owner === true || data.admin === true || ['owner', 'admin', 'administrator'].includes(data.role), 'ROLE BLOCKED: owner/admin state must not stand in for a student').toBe(false);
      expect(data.student === true || data.role === 'student', 'ROLE BLOCKED: explicit student role required; unknown role is not a student PASS').toBe(true);
      expect(data.component, 'DEPLOYMENT BLOCK: real student sessions module required').toMatch(/StudentSessions/);
      await evidence(info, 'student-personal-module', data);
    });
  });
  test(`${brand}: current own editor read-navigation preserves values`, async ({ browser }, info) => {
    const config = configuration(brand, 'ADMIN');
    const contract = ownEditorContracts[brand];
    const id = process.env[`${brand}_QA_SERVICE_ID`];
    const title = process.env[`${brand}_QA_SERVICE_TITLE`];
    test.skip(!id || !title, `NOTRUN_FIXTURE: set ${brand}_QA_SERVICE_ID and ${brand}_QA_SERVICE_TITLE to the documented own fixture`);
    expect(config.userId, 'Editor fixture belongs only to the explicitly approved brand admin').toBe(contract.userId);
    expect(Number(id), 'Only the pinned own editor fixture is permitted').toBe(contract.serviceId);
    expect(title, 'Exact own service title must match the approved fixture').toBe(contract.title);
    await guarded(browser, config, async page => {
      const pathname = `/admin/services/${contract.serviceId}/edit`;
      const data = await open(page, config, pathname);
      identity(data, config);
      expect(data.component, 'Current brand editor contract must match exactly; a stale wrapper expectation is not a product failure').toBe(contract.component);
      await expect(page.locator('#name')).toHaveValue(contract.title);
      const initial = await editorValues(page);
      if (contract.navigation === 'services-link') {
        // Captured from current Medvediva own16: no Cancel; visible Services breadcrumb.
        const services = page.getByRole('link', { name: 'Услуги', exact: true });
        await expect(services).toBeVisible();
        const href = await services.getAttribute('href');
        expect(new URL(href, config.origin).href, 'Only the actual same-origin Services list link may be followed').toBe(config.origin + '/admin/services');
        await services.click();
      } else {
        const cancel = page.getByRole('button', { name: 'Отмена', exact: true });
        await expect(cancel).toBeVisible();
        await cancel.click();
      }
      await expect(page).toHaveURL(config.origin + '/admin/services');
      const again = await open(page, config, pathname);
      identity(again, config);
      expect(again.component).toBe(contract.component);
      await expect(page.locator('#name')).toHaveValue(contract.title);
      const after = await editorValues(page);
      expect(after, 'Read-only navigation and reopening must preserve server-rendered values').toEqual(initial);
      await evidence(info, 'current-editor-read-navigation', { uid: again.uid, component: again.component, production: again.production, serviceId: contract.serviceId, navigation: contract.navigation, preserved: true, fieldsCompared: after.length, build: again.build });
    });
  });
}
