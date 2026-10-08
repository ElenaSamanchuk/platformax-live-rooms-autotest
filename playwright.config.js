// Настройки прогона: один поток (общий стенд), тестовые камера и микрофон, отчёт HTML.
const fs = require('fs');
// .env без зависимостей: КЛЮЧ=значение, # — комментарий
if (fs.existsSync(__dirname + '/.env')) for (const line of fs.readFileSync(__dirname + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 150000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADED !== '1',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
