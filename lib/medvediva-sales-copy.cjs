// Medvediva decision 2026-10-30: remove this exact sentence only.
// The allowed deadline through the next flow is not a carry-over promise.
const REMOVED_PHRASE = 'При продлении обучения на следующий поток можно использовать остаток пакета';
const normalize = text => text.normalize('NFKC').replace(/ё/giu, 'е').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU');
// Input is visible plain text, never raw page props or an HTML document.
function advertisedCarryOver(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('A non-empty visible sales-copy snapshot is required');
  return normalize(text).includes(normalize(REMOVED_PHRASE));
}
module.exports = { advertisedCarryOver, REMOVED_PHRASE };
