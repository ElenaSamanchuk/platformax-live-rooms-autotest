#!/usr/bin/env node
/**
 * Read-only contract check of exported recording API responses.
 * No network, credentials, browser, mutations, or AI API calls.
 * Usage: node validate-metrics.mjs response.json [--legacy] [--tolerance-seconds=1.5]
 * Exit 0: assertions pass. Exit 1: contract mismatch. Exit 2: invalid input/usage.
 * This is an offline assertion of the supplied export, not live E2E or idempotency.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const legacy = args.includes('--legacy');
const toleranceArg = args.find(a => a.startsWith('--tolerance-seconds='));
const tolerance = toleranceArg ? Number(toleranceArg.split('=')[1]) : 1.5;
const files = args.filter(a => !a.startsWith('--'));
const unknown = args.filter(a => a.startsWith('--') && a !== '--legacy' && !a.startsWith('--tolerance-seconds='));
if (files.length !== 1 || unknown.length || !Number.isFinite(tolerance) || tolerance < 0) {
  console.error('Usage: node validate-metrics.mjs response.json [--legacy] [--tolerance-seconds=1.5]');
  process.exit(2);
}

function parseExport(raw) {
  const text = raw.replace(/^\uFEFF/, '').trim();
  try {
    let value = JSON.parse(text);
    if (typeof value === 'string') value = JSON.parse(value.trim());
    return value;
  } catch (originalError) {
    // Browser JSON viewers may prepend the label of a formatting switch.
    // Parse the complete suffix; never drop trailing content or accept partial JSON.
    const index = text.search(/[\[{]/);
    if (index < 0 || index === 0) throw originalError;
    const prefix = text.slice(0, index).trim();
    if (!/^(?:Pretty[- ]print|Форматирование|Форматировать|Форматированный\s+вывод|JSON|\s|[☐☑✓])+$/i.test(prefix)) {
      throw new Error('Неизвестный текст перед JSON; экспортируйте тело ответа без постороннего текста');
    }
    return JSON.parse(text.slice(index));
  }
}

try {
  const body = parseExport(readFileSync(files[0], 'utf8'));
  const recordings = Array.isArray(body) ? body : body?.recordings;
  if (!Array.isArray(recordings) || recordings.length === 0) {
    throw new Error('Ожидался непустой массив recordings; пустой ответ не подтверждает проверку метрик');
  }
  const failures = [];
  const checked = [];
  const required = ['duration_seconds', 'ready_at', 'preparation_seconds', 'size_bytes'];
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  for (const [index, item] of recordings.entries()) {
    const errors = [];
    const id = item?.id ?? `index:${index}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      failures.push({ id, errors: ['Элемент записи не объект'] });
      continue;
    }
    for (const key of required) if (!own(item, key)) errors.push(`Отсутствует обязательный ключ ${key}`);
    for (const key of ['duration_seconds', 'preparation_seconds', 'size_bytes']) {
      if (!own(item, key)) continue;
      if (item[key] === null && legacy && key !== 'duration_seconds') continue;
      if (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < 0) {
        errors.push(`${key} должен быть конечным неотрицательным числом${legacy && key !== 'duration_seconds' ? ' или null для исторической записи' : ''}`);
      }
    }
    if (legacy) {
      if (item.ready_at !== null) errors.push('Исторический ready_at должен оставаться null; updated_at не заменяет момент готовности');
      if (item.preparation_seconds !== null) errors.push('Исторический preparation_seconds должен оставаться null');
    } else {
      for (const key of ['ready_at', 'ended_at']) {
        if (typeof item[key] !== 'string' || !Number.isFinite(Date.parse(item[key]))) {
          errors.push(`${key} должен быть датой с валидным значением`);
        }
      }
      if (Number.isFinite(Date.parse(item.ready_at)) && Number.isFinite(Date.parse(item.ended_at)) && typeof item.preparation_seconds === 'number') {
        const elapsed = (Date.parse(item.ready_at) - Date.parse(item.ended_at)) / 1000;
        if (elapsed < 0) errors.push('ready_at раньше ended_at');
        if (Math.abs(elapsed - item.preparation_seconds) > tolerance) {
          errors.push(`ready_at − ended_at = ${elapsed} с, preparation_seconds = ${item.preparation_seconds} с; расхождение больше ${tolerance} с`);
        }
      }
    }
    if (errors.length) failures.push({ id, errors });
    checked.push({ id, status: item.status ?? null, duration_seconds: item.duration_seconds ?? null, ready_at: item.ready_at ?? null, preparation_seconds: item.preparation_seconds ?? null, size_bytes: item.size_bytes ?? null, result: errors.length ? 'FAIL' : 'PASS' });
  }
  const report = { result: failures.length ? 'FAIL' : 'PASS', mode: legacy ? 'legacy' : 'new-ready-recording', source: files[0], scope: 'offline-export-contract-only', checked_at: new Date().toISOString(), tolerance_seconds: tolerance, recordings: checked, failures };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ result: 'INPUT_ERROR', error: error.message }, null, 2));
  process.exitCode = 2;
}
