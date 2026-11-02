// Bank statement parsers: generic CSV (Greek/English headers) and MT940.
// Every parser returns rows: { tx_date: 'YYYY-MM-DD', cents: int (+credit / -debit),
//                              description, counterparty, account }
const { parse: parseCsvSync } = require('csv-parse/sync');

class ParseError extends Error {}

// Uppercase + strip accents:  'Πίστωση' -> 'ΠΙΣΤΩΣΗ'
function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

// '1.234,56' | '1,234.56' | '-12.50' | '(12,00)' | '12,00-' | '1.234'  ->  integer cents
function parseAmount(text) {
  let t = String(text ?? '').replace(/[\s €]|EUR/g, '');
  if (!t) throw new ParseError('empty amount');
  let neg = false;
  if (t.startsWith('(') && t.endsWith(')')) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);

  if (t.includes(',') && t.includes('.')) {
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    t = t.split(thou).join('').replace(dec, '.');
  } else if (t.includes(',')) {
    const i = t.lastIndexOf(',');
    const head = t.slice(0, i), tail = t.slice(i + 1);
    t = tail.length === 3 && head ? head.replace(/,/g, '') + tail      // 1,234 thousands
                                  : head.replace(/,/g, '') + '.' + tail; // 12,5 decimal comma
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, '');
  } else if (t.includes('.') && t.split('.')[1].length === 3) {
    t = t.replace('.', '');                                            // 1.234 Greek thousands
  }
  if (!/^\d+(\.\d+)?$/.test(t)) throw new ParseError(`bad amount: ${text}`);
  const cents = Math.round(parseFloat(t) * 100);
  return neg ? -cents : cents;
}

function parseDate(text) {
  const t = String(text ?? '').trim().split(/[ T]/)[0];
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y.length === 2 ? '20' + y : y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  throw new ParseError(`bad date: ${text}`);
}

// ---------------------------------------------------------------- CSV
const DATE = ['ΗΜΕΡΟΜΗΝΙΑ ΣΥΝΑΛΛΑΓΗΣ', 'TRANSACTION DATE', 'BOOKING DATE', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΗΜ/ΝΙΑ', 'DATE'];
const DESC = ['ΠΕΡΙΓΡΑΦΗ', 'ΑΙΤΙΟΛΟΓΙΑ', 'ΣΤΟΙΧΕΙΑ', 'DESCRIPTION', 'DETAILS', 'NARRATIVE', 'REASON'];
const COUNTER = ['ΔΙΚΑΙΟΥΧΟΣ', 'ΑΝΤΙΣΥΜΒΑΛΛΟΜΕΝΟΣ', 'ΕΝΤΟΛΕΑΣ', 'COUNTERPARTY', 'BENEFICIARY', 'ORDERING'];
const INDICATOR = ['ΧΡΕΩΣΗ/ΠΙΣΤΩΣΗ', 'ΠΙΣΤΩΣΗ/ΧΡΕΩΣΗ', 'ΧΡ/ΠΙΣ', 'DEBIT/CREDIT', 'CREDIT/DEBIT', 'DR/CR', 'D/C'];
const DEBIT = ['ΧΡΕΩΣΗ', 'DEBIT'];
const CREDIT = ['ΠΙΣΤΩΣΗ', 'CREDIT'];
const AMOUNT = ['ΠΟΣΟ', 'AMOUNT'];

function findCol(headers, candidates, exclude = []) {
  for (const c of candidates) {
    const i = headers.findIndex((h, idx) => !exclude.includes(idx) && h.includes(c));
    if (i !== -1) return i;
  }
  return null;
}

function decode(buf) {
  // utf-8 first; fall back to Windows-1253 (Greek) which most bank exports use
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('windows-1253').decode(buf);
}

function parseCsv(buf, account = '') {
  const lines = decode(buf).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new ParseError('Κενό αρχείο');
  const sample = lines.slice(0, 30).join('\n');
  const delimiter = [';', ',', '\t', '|'].reduce((a, b) => (sample.split(b).length > sample.split(a).length ? b : a));
  const rows = parseCsvSync(lines.join('\n'), { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true });

  let headerIdx = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(norm);
    const date = findCol(h, DATE);
    if (date === null) continue;
    const ind = findCol(h, INDICATOR);
    const excl = ind === null ? [] : [ind];
    const deb = findCol(h, DEBIT, excl), cre = findCol(h, CREDIT, excl), amt = findCol(h, AMOUNT, excl);
    if ((deb !== null && cre !== null && deb !== cre) || amt !== null) {
      headerIdx = i;
      cols = { date, desc: findCol(h, DESC), counter: findCol(h, COUNTER), ind, deb, cre, amt };
      break;
    }
  }
  if (!cols) {
    throw new ParseError('Δεν βρέθηκε η γραμμή επικεφαλίδων (απαιτείται στήλη ημερομηνίας και στήλη ποσού ή χωριστές στήλες χρέωσης/πίστωσης). Στείλτε δείγμα αρχείου για προσαρμογή.');
  }
  const cell = (row, k) => (cols[k] !== null && cols[k] < row.length ? String(row[cols[k]]).trim() : '');
  const split = cols.deb !== null && cols.cre !== null && cols.deb !== cols.cre;

  const out = [];
  for (const row of rows.slice(headerIdx + 1)) {
    let tx_date;
    try { tx_date = parseDate(cell(row, 'date')); } catch { continue; } // footer / totals rows
    let cents;
    if (split) {
      const d = cell(row, 'deb'), c = cell(row, 'cre');
      if (c && parseAmount(c) !== 0) cents = Math.abs(parseAmount(c));
      else if (d && parseAmount(d) !== 0) cents = -Math.abs(parseAmount(d));
      else continue;
    } else {
      const raw = cell(row, 'amt');
      if (!raw) continue;
      cents = parseAmount(raw);
      if (cols.ind !== null) {
        const flag = norm(cell(row, 'ind'));
        if (/^[ΧD]/.test(flag)) cents = -Math.abs(cents);
        else if (/^[ΠC]/.test(flag)) cents = Math.abs(cents);
      }
    }
    out.push({ tx_date, cents, description: cell(row, 'desc'), counterparty: cell(row, 'counter'), account });
  }
  return out;
}

// ---------------------------------------------------------------- MT940
const T61 = /^(\d{6})(\d{4})?(RC|RD|C|D)[A-Z]?(\d+(?:,\d*)?)/;

function parseMt940(buf, account = '') {
  const blocks = [];
  let cur = null;
  for (const line of decode(buf).split(/\r?\n/)) {
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)$/);
    if (m) { cur = [m[1], m[2]]; blocks.push(cur); continue; }
    if (cur && line.trim() && !/^[-{}]/.test(line)) cur[1] += '\n' + line.trim();
  }
  let acct = account;
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const [tag, val] = blocks[i];
    if (tag === '25' && !account) acct = val.trim().split('/').pop();
    if (tag !== '61') continue;
    const m = val.match(T61);
    if (!m) throw new ParseError(`Μη αναγνώσιμη γραμμή :61: ${val}`);
    const [, yymmdd, , mark, amt] = m;
    const tx_date = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    let cents = Math.abs(parseAmount(amt.includes(',') ? amt : amt + ',00'));
    if (mark === 'D' || mark === 'RC') cents = -cents;
    let description = '', counterparty = '';
    if (blocks[i + 1] && blocks[i + 1][0] === '86') {
      const info = blocks[i + 1][1].replace(/\n/g, '');
      if (info.includes('?')) {
        const sub = {};
        for (const [, k, v] of info.matchAll(/\?(\d{2})([^?]*)/g)) sub[k] = v;
        description = Object.keys(sub).filter(k => k >= '20' && k <= '29').sort().map(k => sub[k]).join(' ').trim();
        counterparty = [sub['32'], sub['33']].filter(Boolean).join(' ').trim();
      } else description = info.trim();
      i++;
    }
    out.push({ tx_date, cents, description, counterparty, account: acct });
  }
  return out;
}

// Auto-detect MT940 vs CSV
function parseStatement(buf, account = '') {
  const head = buf.slice(0, 4000).toString('latin1');
  return head.includes(':61:') || head.includes(':20:') ? parseMt940(buf, account) : parseCsv(buf, account);
}

module.exports = { ParseError, norm, parseAmount, parseDate, parseCsv, parseMt940, parseStatement };
