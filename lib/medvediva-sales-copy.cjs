// Product decision 2026-10-29: sales copy must not advertise next-flow carry-over.
// Input is visible plain text, never raw page props or an HTML document.
function advertisedCarryOver(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('A non-empty visible sales-copy snapshot is required');
  const normalized = text.normalize('NFKC').replace(/ё/giu, 'е').replace(/\s+/gu, ' ');
  return /следующ\p{L}*\s+поток/iu.test(normalized) || /(?:остат\p{L}*[^.!?]{0,180}продлен|продлен[^.!?]{0,180}остат\p{L}*)/iu.test(normalized);
}
module.exports = { advertisedCarryOver };
