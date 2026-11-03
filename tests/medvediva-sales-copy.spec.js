// Read-only, independently authenticated regression. No purchases or impersonation.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { advertisedCarryOver } = require('../lib/medvediva-sales-copy.cjs');

test.use({ trace: 'off', video: 'off', screenshot: 'off', locale: 'ru-RU', timezoneId: 'Europe/Minsk' });

test('L-MDV-22: Medvediva sales copy omits the exact sentence removed on 2026-10-30', async ({ browser }) => {
  const base = process.env.MEDVEDIVA_BASE_URL;
  const state = process.env.MEDVEDIVA_STUDENT_STORAGE_STATE;
  const userId = process.env.MEDVEDIVA_STUDENT_USER_ID;
  const checkoutPath = process.env.MEDVEDIVA_QA_CHECKOUT_PATH;
  const packageName = process.env.MEDVEDIVA_QA_PACKAGE_NAME;
  test.skip(!base || !state || !userId || !checkoutPath || !packageName,
    'SKIP_AUTH_OR_FIXTURE: configure an independent student state and the documented own checkout');
  const origin = new URL(base);
  expect(origin.protocol).toBe('https:');
  expect(origin.username + origin.password + origin.search + origin.hash).toBe('');
  expect(origin.pathname).toBe('/');
  expect((process.env.BRAND_QA_ALLOWED_ORIGINS || '').split(',').map(x => x.trim())).toContain(origin.origin);
  // Exact approved test-brand origins; a user-provided allowlist alone is insufficient.
  expect([
    '1dc94c902af6420f5edbd2437e50ec8cf905bc634c1fd5f141e71fc25974e9ff',
    '2379e7cbe0a569eb287a26ed398d4a13a730a35679f24e2ede6b03adf0fa4705',
  ], 'Exact approved Medvediva test-brand origin required')
    .toContain(createHash('sha256').update(origin.origin).digest('hex'));
  expect(Number.isSafeInteger(Number(userId)) && Number(userId) > 0).toBe(true);
  expect(fs.existsSync(state), 'Independent student state must exist; never substitute an owner state').toBe(true);
  expect(packageName, 'Only a documented own QA package is allowed').toMatch(/^QA[- ]/);
  expect(checkoutPath, 'Same-origin service checkout only, with an optional numeric product context')
    .toMatch(/^\/services\/packages\/service_package_[A-Za-z0-9]+\/checkout(?:\?product_id=\d+)?$/);

  const context = await browser.newContext({ storageState: state, permissions: [], locale: 'ru-RU' });
  try {
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
      ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    const response = await page.goto(origin.origin + checkoutPath, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).origin).toBe(origin.origin);
    expect(response.status(), 'Required checkout must load; login/error/empty pages are not PASS').toBe(200);
    const data = await page.locator('#app[data-page]').evaluate(el => {
      const page = JSON.parse(el.getAttribute('data-page'));
      const p = page.props;
      const u = p.user || p.auth?.user;
      return { component: page.component, uid: u?.id, authUid: p.auth?.user?.id, production: p.isProduction,
        impersonation: !!p.impersonation, admin: u?.is_admin === true, student: u?.is_student === true,
        packageName: p.servicePackage?.name };
    });
    expect(data.component, 'Real service checkout required').toMatch(/ServiceCheckoutPage$/);
    expect(data.uid).toBe(Number(userId));
    if (data.authUid != null) expect(data.authUid).toBe(Number(userId));
    expect(data.production).toBe(false);
    expect(data.impersonation, 'Shared impersonation must not run in this suite').toBe(false);
    expect(data.admin).toBe(false);
    expect(data.student, 'An explicit student identity is required').toBe(true);
    expect(data.packageName, 'Configured own package must match the real checkout').toBe(packageName);
    await expect(page.getByRole('button', { name: 'Оплатить', exact: true })).toBeVisible();
    const visible = await page.locator('body').innerText();
    expect(visible.trim().length, 'An empty checkout is not PASS').toBeGreaterThan(50);
    expect(advertisedCarryOver(visible), 'L-MDV-22: exact sentence removed by the Medvediva decision of 2026-10-30 must be absent').toBe(false);
  } finally {
    await context.close();
  }
});
