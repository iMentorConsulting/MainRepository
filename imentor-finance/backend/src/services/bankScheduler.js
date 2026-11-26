// Scheduled fetch + consent-expiry reminders. Runs inside the existing backend process.
const cron = require('node-cron');
const { Op } = require('sequelize');
const BankConnection = require('../models/BankConnection');
const { syncAll } = require('./bankSync');
const { getProvider } = require('./bankProviders');
const { BANKS } = require('./bankIngest');

const DAY = 86400000;

async function checkExpiry(now = Date.now(), send = require('./viberNotify').sendViberMessage) {
  const today = new Date(now).toISOString().slice(0, 10);
  const soon = await BankConnection.findAll({
    where: { provider: getProvider().name, status: 'active', consent_expires_at: { [Op.lte]: new Date(now + 7 * DAY) } },
  });
  const due = soon.filter(c => c.expiry_alerted_on !== today);
  if (!due.length) return 0;
  const lines = due.map(c => {
    const days = Math.max(0, Math.ceil((new Date(c.consent_expires_at) - now) / DAY));
    return `• ${BANKS[c.bank] || c.bank}: λήγει σε ${days} ημέρ${days === 1 ? 'α' : 'ες'}`;
  });
  await send(`🔑 Ανανέωση συγκατάθεσης τράπεζας\n${lines.join('\n')}\nΕπιλέξτε «Ανανέωση» στη σελίδα Τράπεζες.`);
  await BankConnection.update({ expiry_alerted_on: today }, { where: { id: due.map(c => c.id) } });
  return due.length;
}

function start() {
  const expr = process.env.BANK_SYNC_CRON || '*/10 8-21 * * *';        // every 10 min, 08:00-21:50 Athens
  cron.schedule(expr, () => {
    syncAll().then(r => { if (!r.skipped && r.results.length) console.log('[bank-sync]', JSON.stringify(r.results.map(x => ({ bank: x.bank, ok: x.ok, new: x.new, error: x.error })))); })
      .catch(e => console.error('[bank-sync] error:', e.message));
  }, { timezone: 'Europe/Athens' });
  cron.schedule('0 9 * * *', () => checkExpiry().catch(e => console.error('[bank-expiry] error:', e.message)), { timezone: 'Europe/Athens' });
  console.log(`[bank-sync] scheduled "${expr}" Europe/Athens (provider: ${process.env.BANK_PROVIDER || 'nbg'})`);
}

module.exports = { start, checkExpiry };
