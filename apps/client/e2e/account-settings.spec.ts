import { expect, test } from '@playwright/test';
import { encode } from 'next-auth/jwt';

test('notification settings save explicitly, survive reload, and keep edits after failure', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const token = await encode({
    secret: 'playwright-local-only-not-a-production-secret',
    token: { id: 'settings-test-user', email: 'buyer@example.test', firstName: 'Test', lastName: 'Buyer', role: 'CUSTOMER', accessToken: 'test-api-token' },
  });
  await context.addCookies([{ name: 'next-auth.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  let preferences = { pushEnabled: true, emailMessages: true, emailReviewReminders: true, emailOffers: false };
  let writes = 0;
  let failSave = false;
  await page.route('https://api.ezihubb.test/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/users/me/notification-preferences')) {
      if (route.request().method() === 'PATCH') {
        writes++;
        if (failSave) return route.fulfill({ status: 500, json: { success: false, error: { message: 'Test failure' } } });
        preferences = route.request().postDataJSON();
      }
      data = preferences;
    } else if (url.pathname.endsWith('/users/me')) {
      data = { id: 'settings-test-user', email: 'buyer@example.test', firstName: 'Test', lastName: 'Buyer', role: 'CUSTOMER', isEmailVerified: true };
    }
    await route.fulfill({ json: { success: true, data, meta: {} } });
  });
  await page.goto('/en/account/settings');
  await expect(page.getByRole('heading', { name: 'Account settings', exact: true })).toBeVisible();
  const messages = page.getByRole('checkbox', { name: /Someone sends me a message/ });
  const save = page.getByRole('button', { name: 'Save settings', exact: true });
  await expect(messages).toBeChecked();
  await expect(save).toBeDisabled();
  await messages.uncheck();
  expect(writes).toBe(0);
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Your settings have been saved.' })).toBeVisible();
  expect(writes).toBe(1);
  await page.reload();
  await expect(messages).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('account-settings.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  failSave = true;
  await messages.check();
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t save your settings' })).toBeVisible();
  await expect(messages).toBeChecked();
  await expect(save).toBeEnabled();
});
