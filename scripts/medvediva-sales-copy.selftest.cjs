// Synthetic text only. No browser, network, model, credentials or customer snapshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { advertisedCarryOver, REMOVED_PHRASE } = require('../lib/medvediva-sales-copy.cjs');
for (const [name, text] of [
  ['plain exact sentence', REMOVED_PHRASE],
  ['wrapped whitespace', REMOVED_PHRASE.replaceAll(' ', '\n\t ')],
  ['NBSP', REMOVED_PHRASE.replaceAll(' ', '\u00a0')],
  ['case and ё normalization', REMOVED_PHRASE.toLocaleUpperCase('ru-RU').replace('ОБУЧЕНИЯ', 'ОБУЧЁНИЯ')],
  ['sentence within rules', `Правила. ${REMOVED_PHRASE}. Завершение.`],
]) test(`reject removed sentence: ${name}`, () => assert.equal(advertisedCarryOver(text), true));
for (const [name, text] of [
  ['allowed next-flow deadline', 'Купленные занятия действуют до конца следующего потока. В конце срока неиспользованные занятия сгорают.'],
  ['custom text about remainder', 'Остаток пакета доступен в личном кабинете. Продление курса оформляется отдельно.'],
  ['partial sentence', 'При продлении обучения на следующий поток'],
]) test(`accept other non-empty text: ${name}`, () => assert.equal(advertisedCarryOver(text), false));
test('reject empty and non-string inputs', () => {
  for (const text of ['', ' \n\t\u00a0', null, undefined, 123]) assert.throws(() => advertisedCarryOver(text), /non-empty/);
});
test('CLI exit codes: removed=1, allowed=0, empty or missing=2', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medvediva-copy-'));
  try {
    const file = path.join(dir, 'synthetic.txt');
    for (const [text, code] of [[REMOVED_PHRASE, 1], ['Купленные занятия действуют до конца следующего потока.', 0], ['', 2]]) {
      fs.writeFileSync(file, text);
      const run = spawnSync(process.execPath, [path.join(__dirname, 'check-medvediva-sales-copy.cjs'), file], { encoding: 'utf8' });
      assert.equal(run.status, code, run.stdout + run.stderr);
    }
    const missing = spawnSync(process.execPath, [path.join(__dirname, 'check-medvediva-sales-copy.cjs')], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
