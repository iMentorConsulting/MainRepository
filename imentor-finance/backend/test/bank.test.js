process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/unused'; // Sequelize connects lazily; unit tests never query
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, parseCsv, parseMt940, parseStatement, ParseError } = require('../src/services/bankParsers');
const { categorize } = require('../src/services/bankCategorize');
const { buildMessage, formatEur } = require('../src/services/bankIngest');

const CSV_SPLIT = Buffer.from(
`Κίνηση λογαριασμού GR12345
Ημερομηνία;Αιτιολογία;Χρέωση;Πίστωση;Υπόλοιπο
01/11/2026;ΕΙΣΟΔΗΜΑ ΑΠΟ ACME ΑΕ ΤΙΜ 123;;1.234,56;10.000,00
31/10/2026;ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ;85,20;;8.765,44
31/10/2026;ΕΞΟΔΑ ΤΡΑΠΕΖΑΣ;2,50;;8.762,94
Σύνολο;;87,70;1.234,56;
`, 'utf8');

const MT940 = Buffer.from(
`:20:STMT
:25:GR1601101250000000012300695
:28C:1/1
:60F:C261031EUR1000,00
:61:2611011101C1234,56NTRFNONREF
:86:?20ΠΛΗΡΩΜΗ ΤΙΜ 55?32ACME ΑΕ
:61:2611021102D99,90NTRFNONREF
:86:?20COSMOTE ΛΟΓ?32COSMOTE
:62F:C261102EUR2134,66
`, 'utf8');

test('amounts in Greek and English formats', () => {
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('-12.50'), -1250);
  assert.equal(parseAmount('(12,00)'), -1200);
  assert.equal(parseAmount('12,00-'), -1200);
  assert.equal(parseAmount('1.234'), 123400);
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('€ 5,00'), 500);
  assert.throws(() => parseAmount('abc'), ParseError);
});

test('CSV with preamble, split debit/credit columns and totals footer', () => {
  const rows = parseCsv(CSV_SPLIT);
  assert.deepEqual(rows.map(r => r.cents), [123456, -8520, -250]);
  assert.equal(rows[0].tx_date, '2026-11-01');
});

test('CSV with a single signed amount column', () => {
  const rows = parseCsv(Buffer.from('Date,Description,Amount\n2026-11-01,Customer payment,"1,500.00"\n2026-11-01,Rent,-800.00\n'));
  assert.deepEqual(rows.map(r => r.cents), [150000, -80000]);
});

test('CSV in Windows-1253 (typical Greek bank export) decodes correctly', () => {
  // 'Ημερομηνία;Περιγραφή;Ποσό' / '01/11/2026;ΔΕΗ;-10,00' encoded as cp1253
  const cp1253 = { 'Η': 0xC7, 'μ': 0xEC, 'ε': 0xE5, 'ρ': 0xF1, 'ο': 0xEF, 'η': 0xE7, 'ν': 0xED, 'ί': 0xDF, 'α': 0xE1,
    'Π': 0xD0, 'ι': 0xE9, 'γ': 0xE3, 'φ': 0xF6, 'ή': 0xDE, 'Ο': 0xCF, 'σ': 0xF3, 'ό': 0xFC, 'Δ': 0xC4, 'Ε': 0xC5, 'Η ': 0xC7 };
  const enc = s => Buffer.from([...s].map(ch => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : cp1253[ch])));
  const rows = parseCsv(enc('Ημερομηνία;Περιγραφή;Ποσό\n01/11/2026;ΔΕΗ;-10,00\n'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'ΔΕΗ');
  assert.equal(rows[0].cents, -1000);
});

test('unrecognised file gives a clear error', () => {
  assert.throws(() => parseCsv(Buffer.from('foo;bar\n1;2\n')), ParseError);
});

test('MT940 + auto-detect', () => {
  const rows = parseStatement(MT940);
  assert.deepEqual(rows.map(r => r.cents), [123456, -9990]);
  assert.equal(rows[0].counterparty, 'ACME ΑΕ');
  assert.ok(rows[0].account.endsWith('0695'));
});

test('categorize ignores case and accents; unknown stays empty', () => {
  assert.equal(categorize('ΠΛΗΡΩΜΗ ΔΕΗ ΑΕ'), 'Λογαριασμοί (ΔΕΗ/νερό/τηλ.)');
  assert.equal(categorize('πληρωμη δεη'), 'Λογαριασμοί (ΔΕΗ/νερό/τηλ.)');
  assert.equal(categorize('ΕΙΣΦΟΡΕΣ ΕΦΚΑ 10/2026'), 'Ασφαλιστικές εισφορές');
  assert.equal(categorize('something random'), '');
  assert.equal(categorize('ΕΛΛΗΝΙΚΑ ΠΡΟΪΟΝΤΑ ΑΕ'), '');            // 'ΙΚΑ' inside a word must not match
  assert.equal(categorize('ΕΙΣΦΟΡΕΣ ΙΚΑ 10/2026'), 'Ασφαλιστικές εισφορές');
  assert.equal(categorize('ΠΛΗΡΩΜΗ BP ΑΜΑΡΟΥΣΙΟΥ'), 'Καύσιμα / Μεταφορές');
  assert.equal(categorize('ΕΜΒΑΣΜΑ ΠΕΛΑΤΗΣ ΒΑΣΙΛΗΣ'), '');   // 'έμβασμα' = incoming transfer, not a fee
});

test('Viber message text', () => {
  assert.equal(formatEur(123456), '1.234,56 €');
  assert.equal(formatEur(-5), '-0,05 €');
  const msg = buildMessage('alpha', [
    { tx_date: '2026-11-01', cents: 123456, counterparty: 'ACME ΑΕ', description: '' },
    { tx_date: '2026-11-01', cents: 50000, counterparty: '', description: 'ΠΕΛΑΤΗΣ Β' },
  ]);
  assert.match(msg, /Alpha Bank: 2 νέες πιστώσεις/);
  assert.match(msg, /\+1\.234,56 €/);
  assert.match(msg, /Σύνολο πιστώσεων: 1\.734,56 €/);
});
