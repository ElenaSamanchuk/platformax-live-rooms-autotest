// Offline contract check. It evaluates a saved snapshot, not the current server.
const fs = require('node:fs');
const { advertisedCarryOver } = require('../lib/medvediva-sales-copy.cjs');
try {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/check-medvediva-sales-copy.cjs <visible-sales-copy.txt>');
  if (fs.statSync(input).size > 65536) throw new Error('Snapshot must be at most 64 KiB');
  const violation = advertisedCarryOver(fs.readFileSync(input, 'utf8'));
  console.log(violation ? 'FAIL L-MDV-22: sales copy advertises use of the remainder in a subsequent flow' : 'PASS: this saved sales-copy snapshot does not advertise next-flow carry-over');
  process.exitCode = violation ? 1 : 0;
} catch (error) {
  console.error('NOTRUN: ' + error.message);
  process.exitCode = 2;
}
